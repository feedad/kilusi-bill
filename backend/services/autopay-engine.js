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
 * Filter income (CR) vs debit (DB)
 */
function detectTransactionType(text, explicitType = null) {
  if (explicitType) {
    const upper = String(explicitType).toUpperCase();
    if (upper === 'CR' || upper === 'DB') return upper;
    if (upper === 'CREDIT' || upper === 'INCOME') return 'CR';
    if (upper === 'DEBIT' || upper === 'EXPENSE') return 'DB';
  }

  if (!text || typeof text !== 'string') return 'CR'; // default to CR for incoming notifications

  const lower = text.toLowerCase();

  const debitKeywords = [
    'bayar', 'debit', 'keluar', 'belanja', 'transfer keluar',
    'pembayaran keluar', 'tarik tunai', 'terdebet', 'terpotong'
  ];

  const incomeKeywords = [
    'masuk', 'cr', 'kredit', 'credit', 'terima', 'diterima',
    'deposit', 'incoming', 'top up', 'topup', 'uang masuk',
    'ditambahkan', 'received'
  ];

  const hasIncome = incomeKeywords.some(k => lower.includes(k));
  const hasDebit = debitKeywords.some(k => lower.includes(k));

  if (hasDebit && !hasIncome) {
    return 'DB';
  }

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

  const type = detectTransactionType(rawText, payload.type);

  // Determine sender / bank / description
  const senderInfo = payload.sender_name || payload.app_name || payload.title || payload.device_name || auth.device.device_name || 'Bank';
  const description = payload.description || payload.content || payload.title || `Transfer ${amount}`;
  const sourceType = payload.source_type || (payload.app_name ? 'MOBILE' : (payload.account_number ? 'EMAIL' : 'API'));

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
      type === 'DB' ? 'IGNORED' : 'PENDING',
    ]
  );

  const mutation = insertRes.rows[0];
  logger.info(`[AutopayEngine] New mutation recorded (ID: ${mutation.id}, Rp ${amount}, Type: ${type}, Sender: ${senderInfo})`);

  // If CR, attempt instant auto-match
  if (type === 'CR') {
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
    status: 'IGNORED',
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
    logger.info(`[AutopayEngine] No matching invoice found for mutation ${mutationId} (Rp ${amount}) - stays PENDING`);
    return { matched: false, reason: 'NO_MATCHING_INVOICE' };
  }

  // Filter exact amount_with_code matches first
  const codeMatches = candidates.filter(inv => Number(inv.amount_with_code) === amount);
  const targetInvoice = codeMatches.length === 1 ? codeMatches[0] : (candidates.length === 1 ? candidates[0] : null);

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

module.exports = {
  extractAmount,
  detectTransactionType,
  validateApiKey,
  processInboundMutation,
  autoMatchMutation,
  manualMatchMutation,
  ignoreMutation,
};
