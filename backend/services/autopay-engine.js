/**
 * Native Autopay Engine
 * Real-time bank mutation receiver, regex parser, and atomic matching engine.
 */

const { query, getPool } = require('../config/database');
const { logger } = require('../config/logger');
const { createAccountingTransaction } = require('../config/accounting');
const { getSetting } = require('../config/settingsManager');

/**
 * Robust Indonesian & International currency parser
 * Handles formats like:
 * - Rp150.034
 * - Rp 150.000,00
 * - IDR 200,000.00
 * - Sobat BRI! Dana Rp23.925 masuk
 * - Plain numeric: 150016
 */
function extractAmount(text, fallbackAmount = null) {
  if (fallbackAmount !== null && fallbackAmount !== undefined && !isNaN(Number(fallbackAmount))) {
    const parsed = Math.round(Number(fallbackAmount));
    if (parsed > 0) return parsed;
  }

  if (!text || typeof text !== 'string') return null;

  // Strip HTML tags (e.g. from email notifications)
  const clean = text.replace(/<[^>]*>/g, ' ');

  // Look for currency amounts with Rp / IDR prefix
  const match = clean.match(/\b(?:Rp\.?|IDR)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i);
  if (match && match[1]) {
    let numStr = match[1];

    if (numStr.includes('.') && numStr.includes(',')) {
      if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
        // Indonesian: 150.000,00 -> 150000
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        // English: 150,000.00 -> 150000
        numStr = numStr.replace(/,/g, '');
      }
    } else if (numStr.includes('.')) {
      const parts = numStr.split('.');
      if (parts[parts.length - 1].length === 3) {
        // Thousand separator: 150.000 -> 150000
        numStr = numStr.replace(/\./g, '');
      } else if (parts[parts.length - 1].length === 2 && parts.length === 2) {
        // Decimal: 150.50 -> 150.50
        numStr = parts[0] + '.' + parts[1];
      } else {
        numStr = numStr.replace(/\./g, '');
      }
    } else if (numStr.includes(',')) {
      const parts = numStr.split(',');
      if (parts[parts.length - 1].length === 3) {
        // Thousand separator: 150,000 -> 150000
        numStr = numStr.replace(/,/g, '');
      } else if (parts[parts.length - 1].length === 2 && parts.length === 2) {
        // Decimal cents: 150,00 -> 150
        numStr = parts[0];
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    }

    const val = parseFloat(numStr);
    if (!isNaN(val) && val > 0) {
      return Math.round(val);
    }
  }

  return null;
}

/**
 * Real transaction inbound patterns (CR Valid)
 * Based on 100% of real production MATCHED mutations:
 * 1. DANA: "diterima DANA Bisnis", "telah diterima dari", "berhasil diterima DANA Bisnis"
 * 2. myBCA: "You received IDR" AND "Account Transfer"
 * 3. BRImo: "Sobat BRI! Dana" AND "masuk ke rekening"
 * 4. GoPay: "Top up Rp" AND "via"
 * 5. EMAIL/OCBC: "BI-Fast Transfer Dana Masuk", "TRANSFER DANA MASUK", or "via BANK"/"via PT BANK"
 */
function isRealIncomePattern(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  if (
    lower.includes('diterima dana bisnis') ||
    lower.includes('telah diterima dari') ||
    lower.includes('berhasil diterima dana bisnis')
  ) {
    return true;
  }

  if (lower.includes('you received idr') && lower.includes('account transfer')) {
    return true;
  }

  if (lower.includes('sobat bri! dana') && lower.includes('masuk ke rekening')) {
    return true;
  }

  if (lower.includes('top up rp') && lower.includes('via')) {
    return true;
  }

  if (
    lower.includes('bi-fast transfer dana masuk') ||
    lower.includes('transfer dana masuk') ||
    lower.includes('via bank') ||
    lower.includes('via pt bank')
  ) {
    return true;
  }

  return false;
}

/**
 * Debit / outgoing money patterns (DB -> Automatically IGNORED)
 * 1. myBCA spent: "You spent IDR"
 * 2. DANA sent: "telah dikirim ke"
 * 3. BRImo topup out to personal DANA: "Top Up DANA"
 * 4. Subscription/Netflix: "transaksi di Netflix" / "lanjutkan transaksi di"
 * 5. ShopeePay debit: "dengan ShopeePay telah berhasil"
 * 6. Marketplace: "bayar ... ke TOKOPEDIA" / "bayar ... ke SHOPEE"
 */
function isDebitPattern(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  if (lower.includes('you spent idr')) return true;
  if (lower.includes('telah dikirim ke')) return true;
  if (lower.includes('top up dana')) return true;
  if (lower.includes('transaksi di netflix') || lower.includes('lanjutkan transaksi di')) return true;
  if (lower.includes('dengan shopeepay telah berhasil')) return true;
  if (/bayar\s+.*\s+ke\s+(?:tokopedia|shopee)/i.test(lower)) return true;

  const debitKeywords = [
    'bayar', 'debit', 'keluar', 'belanja', 'transfer keluar',
    'pembayaran keluar', 'tarik tunai', 'terdebet', 'terpotong'
  ];
  if (debitKeywords.some(k => lower.includes(k)) && !isRealIncomePattern(text)) {
    return true;
  }

  return false;
}

/**
 * Promo, marketing, ads, or non-ISP channel patterns (Automatically IGNORED)
 */
function isPromoOrNonIspPattern(text, senderInfo, amount) {
  const combined = `${text || ''} ${senderInfo || ''}`.toLowerCase();

  // ShopeePay is not an ISP receiving account in payment_settings
  if (combined.includes('shopeepay')) {
    return true;
  }
  // Personal e-wallet top-up (owner isi saldo pribadi dari bank/alfamart, bukan pembayaran DANA Bisnis)
  if (combined.includes('berhasil top up saldo')) {
    return true;
  }

  // Internal company accounts & personal transfers
  if (
    combined.includes('**ta ***alu ***kon') || // PT KITA SELALU TERKONEKSI
    combined.includes('**pay **bit ***one') || // ShopeePay / wallet settlement
    combined.includes('elda zaqiah')
  ) {
    return true;
  }

  const promoKeywords = [
    'klaim', 'diskon', 'voucher', 'promo', 'tarifnya mulai',
    'cashback', 'check in', 'limit kredit', 'bonus saldo',
    'nonton anime', 'ikutan transfer unik', 'beli paket', 'cuma',
    'kuota', 'pulsa'
  ];
  if (promoKeywords.some(k => combined.includes(k))) {
    return true;
  }

  // Nominal < Rp 20.000 unless explicit real income pattern
  if (amount !== null && amount !== undefined && amount < 20000 && !isRealIncomePattern(text)) {
    return true;
  }

  return false;
}

/**
 * Classify mutation into CR (valid inbound) vs DB/IGNORED (debit/promo)
 */
function classifyMutation(arg1, maybeSender, maybeAmount, maybeExplicit = null) {
  let rawText, senderInfo, amount, explicitType;
  if (typeof arg1 === 'object' && arg1 !== null) {
    rawText = arg1.rawText || '';
    senderInfo = arg1.senderInfo || '';
    amount = arg1.amount;
    explicitType = arg1.explicitType;
  } else {
    rawText = arg1 || '';
    senderInfo = maybeSender || '';
    amount = maybeAmount;
    explicitType = maybeExplicit;
  }

  if (explicitType) {
    const upper = String(explicitType).toUpperCase();
    if (upper === 'DB' || upper === 'DEBIT' || upper === 'EXPENSE') {
      return { type: 'DB', status: 'IGNORED', reason: 'EXPLICIT_DEBIT' };
    }
  }
  if (isDebitPattern(rawText)) {
    return { type: 'DB', status: 'IGNORED', reason: 'DEBIT_PATTERN' };
  }

  if (isPromoOrNonIspPattern(rawText, senderInfo, amount)) {
    return { type: 'CR', status: 'IGNORED', reason: 'PROMO_OR_NON_ISP' };
  }

  if (isRealIncomePattern(rawText)) {
    return { type: 'CR', status: 'PENDING', reason: 'REAL_INCOME_PATTERN' };
  }

  // Fallback check
  const lower = (rawText || '').toLowerCase();
  const incomeKeywords = [
    'masuk', 'cr', 'kredit', 'credit', 'terima', 'diterima',
    'deposit', 'incoming', 'top up', 'topup', 'uang masuk',
    'ditambahkan', 'received'
  ];
  const hasIncome = incomeKeywords.some(k => lower.includes(k));
  if (!hasIncome && amount < 20000) {
    return { type: 'CR', status: 'IGNORED', reason: 'LOW_AMOUNT_SUSPICIOUS' };
  }

  return { type: 'CR', status: 'PENDING', reason: 'CR_FALLBACK' };
}

/**
 * Filter income (CR) vs debit (DB) - backward compatibility
 */
function detectTransactionType(text, explicitType = null) {
  if (explicitType) {
    const upper = String(explicitType).toUpperCase();
    if (upper === 'CR' || upper === 'DB') return upper;
    if (upper === 'CREDIT' || upper === 'INCOME') return 'CR';
    if (upper === 'DEBIT' || upper === 'EXPENSE') return 'DB';
  }

  if (!text || typeof text !== 'string') return 'CR';
  if (isDebitPattern(text)) return 'DB';
  return 'CR';
}

/**
 * Validate API key against autopay_devices or app_config
 */
async function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;

  const trimmed = apiKey.trim();

  // Check autopay_devices table
  const deviceRes = await query(
    `SELECT * FROM autopay_devices WHERE api_key = $1 LIMIT 1`,
    [trimmed]
  );
  if (deviceRes.rows.length > 0) {
    return { valid: true, device: deviceRes.rows[0] };
  }

  // Check app_config fallback
  const configKey = getSetting('autopay_api_key');
  if (configKey && trimmed === configKey) {
    return { valid: true, device: { id: 0, device_name: 'System Config' } };
  }

  return null;
}

/**
 * Process inbound webhook from Tasker, MacroDroid, or Cloudflare Worker
 */
async function processInboundMutation(payload, apiKey) {
  const auth = await validateApiKey(apiKey);
  if (!auth) {
    throw new Error('INVALID_API_KEY');
  }

  const rawText = [
    payload.content || '',
    payload.description || '',
    payload.title || '',
    payload.body || '',
  ].filter(Boolean).join(' ');

  const amount = extractAmount(rawText, payload.amount);
  if (!amount || amount <= 0) {
    logger.warn('[AutopayEngine] Could not parse amount from payload:', JSON.stringify(payload));
    return { success: false, reason: 'AMOUNT_NOT_FOUND' };
  }

  // Determine sender / bank / description
  const senderInfo = payload.sender_name || payload.app_name || payload.title || payload.device_name || auth.device.device_name || 'Bank';
  const description = payload.description || payload.content || payload.title || `Transfer ${amount}`;
  const sourceType = payload.source_type || (payload.app_name ? 'MOBILE' : (payload.account_number ? 'EMAIL' : 'API'));

  // Classify based on real patterns (CR vs DB, PENDING vs IGNORED)
  const classification = classifyMutation({
    rawText,
    senderInfo,
    amount,
    explicitType: payload.type,
  });
  const type = classification.type;
  const initialStatus = classification.status;

  // Deduplication check: check if exact same raw_content or (amount, description, created_at within 60s) exists
  const dupCheck = await query(
    `SELECT id, status FROM bank_mutations 
     WHERE amount = $1 
       AND created_at >= NOW() - INTERVAL '60 seconds'
       AND (raw_content = $2 OR description = $3)
     LIMIT 1`,
    [amount, JSON.stringify(payload), description]
  );

  if (dupCheck.rows.length > 0) {
    logger.info(`[AutopayEngine] Duplicate mutation detected (ID: ${dupCheck.rows[0].id}) - skipping insert`);
    return {
      success: true,
      duplicate: true,
      mutation_id: dupCheck.rows[0].id,
      status: dupCheck.rows[0].status,
    };
  }

  // Insert mutation into bank_mutations
  const insertRes = await query(
    `INSERT INTO bank_mutations (
       bank_id, amount, type, source_type, description,
       sender_info, raw_content, status, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [
      payload.bank_id || null,
      amount,
      type,
      sourceType,
      description,
      senderInfo,
      JSON.stringify(payload),
      initialStatus,
    ]
  );

  const mutation = insertRes.rows[0];
  logger.info(`[AutopayEngine] New mutation recorded (ID: ${mutation.id}, Rp ${amount}, Type: ${type}, Status: ${initialStatus}, Sender: ${senderInfo}, Reason: ${classification.reason})`);

  // If CR and not IGNORED, attempt instant auto-match
  if (type === 'CR' && initialStatus === 'PENDING') {
    const matchResult = await autoMatchMutation(mutation.id);
    return {
      success: true,
      mutation_id: mutation.id,
      amount,
      type,
      ...matchResult,
    };
  }

  return {
    success: true,
    mutation_id: mutation.id,
    amount,
    type,
    status: initialStatus,
    reason: classification.reason,
  };
}

/**
 * Attempt to match a mutation with an active invoice
 */
async function autoMatchMutation(mutationId) {
  const mutRes = await query(`SELECT * FROM bank_mutations WHERE id = $1`, [mutationId]);
  if (mutRes.rows.length === 0) return { matched: false, reason: 'MUTATION_NOT_FOUND' };

  const mutation = mutRes.rows[0];
  if (mutation.status !== 'PENDING') {
    return { matched: false, reason: `MUTATION_STATUS_${mutation.status}` };
  }

  const amount = Math.round(Number(mutation.amount));

  // Search active unpaid invoices
  // First match amount_with_code, then exact total_amount/amount if unique_code is null
  const candidatesRes = await query(
    `SELECT i.*, c.name as customer_name, c.phone as customer_phone
     FROM invoices i
     LEFT JOIN customers c ON c.id::text = i.customer_id::text
     WHERE i.status IN ('unpaid', 'overdue', 'sent', 'draft', 'suspended')
       AND (
         (i.amount_with_code IS NOT NULL AND i.amount_with_code = $1)
         OR
         (i.unique_code IS NULL AND (ROUND(i.amount) = $1 OR ROUND(i.total_amount) = $1))
       )
     ORDER BY
       CASE WHEN i.amount_with_code = $1 THEN 1 ELSE 2 END,
       i.created_at DESC`,
    [amount]
  );

  const candidates = candidatesRes.rows;

  if (candidates.length === 0) {
    // Check if an invoice with this amount_with_code was already paid recently (e.g. within 24h)
    // and has not been linked to any bank_mutation yet
    try {
      const recentlyPaidRes = await query(
        `SELECT i.*, c.name as customer_name
         FROM invoices i
         LEFT JOIN customers c ON c.id::text = i.customer_id::text
         WHERE i.status = 'paid'
           AND i.paid_at >= NOW() - INTERVAL '24 hours'
           AND (
             i.amount_with_code = $1
             OR ROUND(i.amount) = $1
             OR ROUND(i.total_amount) = $1
           )
           AND NOT EXISTS (
             SELECT 1 FROM bank_mutations bm WHERE bm.matched_invoice_id = i.id
           )
         ORDER BY i.paid_at DESC`,
        [amount]
      );

      let targetAlreadyPaid = null;
      if (recentlyPaidRes.rows.length === 1) {
        targetAlreadyPaid = recentlyPaidRes.rows[0];
      } else if (recentlyPaidRes.rows.length > 1) {
        // Match customer name from mutation description / sender_info
        const descLower = (mutation.description || '').toLowerCase();
        const senderLower = (mutation.sender_info || '').toLowerCase();
        const nameMatches = recentlyPaidRes.rows.filter(inv => {
          if (!inv.customer_name) return false;
          const tokens = inv.customer_name.toLowerCase().split(/\s+/).filter(t => t.length >= 3 && !['bpk', 'ibu', 'sdra', 'bp', 'pak'].includes(t));
          return tokens.some(t => descLower.includes(t) || senderLower.includes(t));
        });

        if (nameMatches.length === 1) {
          targetAlreadyPaid = nameMatches[0];
        } else {
          targetAlreadyPaid = recentlyPaidRes.rows[0];
        }
      }

      if (targetAlreadyPaid) {
        await query(
          `UPDATE bank_mutations
           SET status = 'MATCHED',
               matched_invoice_id = $1,
               matched_at = NOW()
           WHERE id = $2`,
          [targetAlreadyPaid.id, mutation.id]
        );
        await query(
          `UPDATE invoices
           SET unique_code = NULL,
               amount_with_code = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [targetAlreadyPaid.id]
        );
        logger.info(
          `[AutopayEngine] Mutation ${mutationId} (Rp ${amount}) automatically linked to recently paid invoice #${targetAlreadyPaid.id} (${targetAlreadyPaid.invoice_number})`
        );
        return {
          matched: true,
          already_paid: true,
          invoice_id: targetAlreadyPaid.id,
          invoice_number: targetAlreadyPaid.invoice_number,
        };
      }
    } catch (recentErr) {
      logger.warn('[AutopayEngine] Failed checking recently paid invoices:', recentErr.message);
    }

    logger.info(`[AutopayEngine] No matching invoice found for mutation ${mutationId} (Rp ${amount}) - stays PENDING`);
    return { matched: false, reason: 'NO_MATCHING_INVOICE' };
  }

  // Filter exact amount_with_code matches first
  const codeMatches = candidates.filter(inv => Number(inv.amount_with_code) === amount);
  let targetInvoice = codeMatches.length === 1 ? codeMatches[0] : (candidates.length === 1 ? candidates[0] : null);

  if (!targetInvoice && candidates.length > 1) {
    const descLower = (mutation.description || '').toLowerCase();
    const senderLower = (mutation.sender_info || '').toLowerCase();
    const nameMatches = candidates.filter(inv => {
      if (!inv.customer_name) return false;
      const tokens = inv.customer_name.toLowerCase().split(/\s+/).filter(t => t.length >= 3 && !['bpk', 'ibu', 'sdra', 'bp', 'pak'].includes(t));
      return tokens.some(t => descLower.includes(t) || senderLower.includes(t));
    });
    if (nameMatches.length === 1) {
      targetInvoice = nameMatches[0];
      logger.info(`[AutopayEngine] Disambiguated ${candidates.length} candidates by customer name match: ${targetInvoice.customer_name}`);
    }
  }

  if (!targetInvoice) {
    logger.warn(
      `[AutopayEngine] Ambiguous match: mutation ${mutationId} (Rp ${amount}) matched ${candidates.length} invoices. Stays PENDING for manual review.`
    );
    return {
      matched: false,
      reason: 'AMBIGUOUS_MATCH',
      candidates_count: candidates.length,
    };
  }

  // Exactly 1 match found -> execute atomic payment
  return await executePaymentMatch(mutation, targetInvoice, {
    isAuto: true,
    bankName: mutation.sender_info || 'Bank',
  });
}

/**
 * Execute atomic payment match
 */
async function executePaymentMatch(mutation, invoice, options = {}) {
  const pool = getPool();
  const client = await pool.connect();

  const amount = Math.round(Number(mutation.amount));
  const bankName = options.bankName || mutation.sender_info || 'Autopay';
  const paymentMethodDisplay = `Autopay - ${bankName}`;
  const verifiedBy = options.verifiedBy || null;

  try {
    await client.query('BEGIN');

    // 1. Lock and re-verify invoice status
    const invCheck = await client.query(
      `SELECT * FROM invoices 
       WHERE id = $1 AND status IN ('unpaid', 'overdue', 'sent', 'draft', 'suspended')
       FOR UPDATE`,
      [invoice.id]
    );

    if (invCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn(`[AutopayEngine] Invoice ${invoice.id} is no longer unpaid - aborting match`);
      return { matched: false, reason: 'INVOICE_ALREADY_PAID' };
    }

    const currentInv = invCheck.rows[0];
    const amountForNotif = currentInv.amount_with_code || currentInv.amount;

    // 2. Update invoice status
    await client.query(
      `UPDATE invoices 
       SET status = 'paid',
           paid_at = NOW(),
           payment_method = $1,
           payment_fee_amount = 0,
           unique_code = NULL,
           amount_with_code = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [paymentMethodDisplay, currentInv.id]
    );

    // 3. Insert into payment_transactions
    const txRes = await client.query(
      `INSERT INTO payment_transactions (
         invoice_id, amount, fee_amount, net_amount, gateway,
         payment_method, status, paid_at, verified_by, created_at
       ) VALUES ($1, $2, 0, $2, 'autopay', $3, 'paid', NOW(), $4, NOW())
       RETURNING id`,
      [currentInv.id, amount, paymentMethodDisplay, verifiedBy]
    );

    // 4. Insert into payments table
    const payRes = await client.query(
      `INSERT INTO payments (
         invoice_id, amount, payment_method, payment_gateway, processed_by, payment_date, notes, created_at
       ) VALUES ($1, $2, $3, 'autopay', $4, NOW(), $5, NOW())
       RETURNING id`,
      [
        currentInv.id,
        amount,
        paymentMethodDisplay,
        options.isAuto ? 'System' : (verifiedBy ? 'Admin' : 'System'),
        `Autopay ${bankName} — Rp ${amount.toLocaleString('id-ID')}${options.isAuto ? ' (Auto-match)' : ' (Manual match)'}`,
      ]
    );

    // 5. Update bank_mutations
    await client.query(
      `UPDATE bank_mutations 
       SET status = 'MATCHED',
           matched_invoice_id = $1,
           matched_at = NOW()
       WHERE id = $2`,
      [currentInv.id, mutation.id]
    );

    await client.query('COMMIT');
    logger.info(`[AutopayEngine] ACID transaction committed for invoice ${currentInv.invoice_number} with mutation ${mutation.id}`);

    const paymentId = payRes.rows[0].id;

    // Post-processing (outside ACID transaction, non-blocking errors)
    setImmediate(async () => {
      try {
        // Update service dates
        const BillingCycleService = require('../config/billing-cycle-service');
        const updatedDates = await BillingCycleService.updateServiceDatesAfterPayment(currentInv.id, new Date());

        // Restore service if all invoices paid
        const serviceNumber = currentInv.service_number;
        if (serviceNumber) {
          const unpaidCheck = await query(
            `SELECT COUNT(*) as cnt FROM invoices WHERE service_number = $1 AND status IN ('unpaid','suspended','overdue')`,
            [serviceNumber]
          );
          if (parseInt(unpaidCheck.rows[0].cnt) === 0) {
            const serviceSuspension = require('../config/serviceSuspension');
            const svcData = await query(
              `SELECT s.id, s.service_number, c.name, p.group as package_group, p.pppoe_profile
               FROM services s JOIN customers c ON c.id::text = s.customer_id::text
               LEFT JOIN packages p ON p.id = s.package_id
               WHERE s.service_number = $1`,
              [serviceNumber]
            );
            if (svcData.rows.length > 0 && svcData.rows[0].id) {
              await serviceSuspension.restoreServiceByServiceId(
                svcData.rows[0].id,
                {
                  name: svcData.rows[0].name,
                  service_number: svcData.rows[0].service_number,
                  package_group: svcData.rows[0].package_group,
                  pppoe_profile: svcData.rows[0].pppoe_profile,
                },
                'Autopay - full restoration'
              );
              logger.info(`[AutopayEngine] Service ${serviceNumber} restored successfully`);
            }
          }
        }

        // WhatsApp notification
        try {
          const _isoDate = updatedDates?.newIsolirDate
            ? new Date(updatedDates.newIsolirDate).toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : undefined;
          const whatsappNotifications = require('../config/whatsapp-notifications');
          await whatsappNotifications.sendPaymentReceivedNotification(paymentId, {
            dueDate: _isoDate,
            amount: amountForNotif,
          });
          logger.info(`[AutopayEngine] WhatsApp notification sent for invoice ${currentInv.invoice_number}`);
        } catch (waErr) {
          logger.error(`[AutopayEngine] WhatsApp notification failed:`, waErr.message);
        }

        // Accounting transaction
        try {
          const custRes = await query(`SELECT name FROM customers WHERE id::text = $1`, [currentInv.customer_id]);
          const custName = custRes.rows[0]?.name || 'Customer';
          await createAccountingTransaction(
            'revenue',
            amount,
            `Pembayaran Autopay invoice #${currentInv.invoice_number} dari ${custName}`,
            'payment',
            paymentId
          );
        } catch (acctErr) {
          logger.warn(`[AutopayEngine] Accounting transaction failed:`, acctErr.message);
        }

        // Realtime WebSocket event
        if (global.appEvents) {
          global.appEvents.emit('payment:received', {
            invoice_id: currentInv.id,
            invoice_number: currentInv.invoice_number,
            amount,
            payment_method: paymentMethodDisplay,
            source: 'autopay',
          });
        }
      } catch (postErr) {
        logger.error(`[AutopayEngine] Post-processing error for invoice ${currentInv.invoice_number}:`, postErr);
      }
    });

    return {
      matched: true,
      invoice_id: currentInv.id,
      invoice_number: currentInv.invoice_number,
      amount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`[AutopayEngine] Transaction rollback error for invoice ${invoice.id}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Manual match by admin
 */
async function manualMatchMutation(mutationId, invoiceId, adminUser = null) {
  const mutRes = await query(`SELECT * FROM bank_mutations WHERE id = $1`, [mutationId]);
  if (mutRes.rows.length === 0) throw new Error('MUTATION_NOT_FOUND');
  const mutation = mutRes.rows[0];

  const invRes = await query(
    `SELECT i.*, c.name as customer_name, c.phone as customer_phone
     FROM invoices i
     JOIN customers c ON c.id::text = i.customer_id::text
     WHERE i.id = $1`,
    [invoiceId]
  );
  if (invRes.rows.length === 0) throw new Error('INVOICE_NOT_FOUND');
  const invoice = invRes.rows[0];

  if (invoice.status === 'paid') {
    throw new Error('INVOICE_ALREADY_PAID');
  }

  return await executePaymentMatch(mutation, invoice, {
    isAuto: false,
    bankName: mutation.sender_info || 'Bank',
    verifiedBy: adminUser?.id || null,
  });
}

/**
 * Ignore mutation
 */
async function ignoreMutation(mutationId) {
  const res = await query(
    `UPDATE bank_mutations SET status = 'IGNORED' WHERE id = $1 RETURNING *`,
    [mutationId]
  );
  if (res.rows.length === 0) throw new Error('MUTATION_NOT_FOUND');
  return res.rows[0];
}

/**
 * Link an existing PENDING bank mutation when an invoice is marked as paid
 * (called from Billing payments, Rapel, Payment verification, Chatbot, AutopayService)
 */
async function linkPendingMutationOnInvoicePaid(invoiceId, paidAmount = null, customerName = null) {
  try {
    if (!invoiceId && !paidAmount) return { linked: false, reason: 'MISSING_PARAMS' };

    let invoice = null;
    if (invoiceId) {
      const invRes = await query(
        `SELECT i.*, c.name as customer_name, c.phone as customer_phone
         FROM invoices i
         LEFT JOIN customers c ON c.id::text = i.customer_id::text
         WHERE i.id = $1`,
        [invoiceId]
      );
      if (invRes.rows.length > 0) {
        invoice = invRes.rows[0];
      }
    }

    const candidateAmounts = new Set();
    if (paidAmount !== null && paidAmount !== undefined && !isNaN(Number(paidAmount))) {
      candidateAmounts.add(Math.round(Number(paidAmount)));
    }
    if (invoice) {
      if (invoice.amount_with_code) candidateAmounts.add(Math.round(Number(invoice.amount_with_code)));
      if (invoice.amount) candidateAmounts.add(Math.round(Number(invoice.amount)));
      if (invoice.total_amount) candidateAmounts.add(Math.round(Number(invoice.total_amount)));
    }

    const amountsArr = Array.from(candidateAmounts).filter(a => a > 0);
    if (amountsArr.length === 0) return { linked: false, reason: 'NO_VALID_AMOUNT' };

    // Find pending mutations within last 48 hours matching any candidate amount
    const mutRes = await query(
      `SELECT * FROM bank_mutations
       WHERE status = 'PENDING'
         AND type = 'CR'
         AND created_at >= NOW() - INTERVAL '48 hours'
         AND amount = ANY($1::numeric[])
       ORDER BY created_at DESC`,
      [amountsArr]
    );

    if (mutRes.rows.length === 0) {
      return { linked: false, reason: 'NO_PENDING_MUTATION' };
    }

    let targetMutation = null;
    const custName = (customerName || invoice?.customer_name || '').toLowerCase().trim();

    if (mutRes.rows.length === 1) {
      targetMutation = mutRes.rows[0];
    } else {
      // 1. Try matching by exact amount_with_code if available
      if (invoice?.amount_with_code) {
        const codeMatch = mutRes.rows.filter(m => Math.round(Number(m.amount)) === Math.round(Number(invoice.amount_with_code)));
        if (codeMatch.length === 1) {
          targetMutation = codeMatch[0];
        }
      }

      // 2. Try matching customer name in mutation description or sender_info
      if (!targetMutation && custName) {
        const tokens = custName.split(/\s+/).filter(t => t.length >= 3 && !['bpk', 'ibu', 'sdra', 'bp', 'pak'].includes(t));
        const nameMatches = mutRes.rows.filter(m => {
          const desc = (m.description || '').toLowerCase();
          const sender = (m.sender_info || '').toLowerCase();
          return tokens.some(t => desc.includes(t) || sender.includes(t));
        });
        if (nameMatches.length === 1) {
          targetMutation = nameMatches[0];
        }
      }

      // 3. If only 1 mutation with this exact amount within 48h, pick it
      if (!targetMutation) {
        const exactTargetAmount = paidAmount ? Math.round(Number(paidAmount)) : (invoice?.amount ? Math.round(Number(invoice.amount)) : null);
        if (exactTargetAmount) {
          const exactAmountMatches = mutRes.rows.filter(m => Math.round(Number(m.amount)) === exactTargetAmount);
          if (exactAmountMatches.length === 1) {
            targetMutation = exactAmountMatches[0];
          }
        }
      }
    }

    if (!targetMutation) {
      logger.info(
        `[AutopayEngine] linkPendingMutation: Ambiguous candidates (${mutRes.rows.length}) for invoice #${invoiceId} — remains for manual match`
      );
      return { linked: false, reason: 'AMBIGUOUS_CANDIDATES', count: mutRes.rows.length };
    }

    // Link mutation to invoice
    await query(
      `UPDATE bank_mutations
       SET status = 'MATCHED',
           matched_invoice_id = $1,
           matched_at = NOW()
       WHERE id = $2`,
      [invoiceId || invoice?.id, targetMutation.id]
    );

    // Reset unique code on invoice
    if (invoiceId || invoice?.id) {
      await query(
        `UPDATE invoices
         SET unique_code = NULL,
             amount_with_code = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [invoiceId || invoice?.id]
      );
    }

    logger.info(
      `[AutopayEngine] Linked pending mutation #${targetMutation.id} (Rp ${targetMutation.amount}) to paid invoice #${invoiceId || invoice?.id}`
    );

    return {
      linked: true,
      mutation_id: targetMutation.id,
      invoice_id: invoiceId || invoice?.id,
    };
  } catch (err) {
    logger.error('[AutopayEngine] Error in linkPendingMutationOnInvoicePaid:', err.message);
    return { linked: false, error: err.message };
  }
}

module.exports = {
  extractAmount,
  detectTransactionType,
  classifyMutation,
  isRealIncomePattern,
  isDebitPattern,
  isPromoOrNonIspPattern,
  validateApiKey,
  processInboundMutation,
  autoMatchMutation,
  manualMatchMutation,
  ignoreMutation,
  linkPendingMutationOnInvoicePaid,
};
