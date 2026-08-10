const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { customerJwtAuth } = require('../../../middleware/customerJwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const PaymentGatewayManager = require('../../../config/paymentGateway');
const { getAllSettings } = require('../../../config/settingsManager');

// Get portal URL from environment variable or use request-based fallback
const getPortalUrl = (req) => {
  return process.env.PORTAL_URL || `${req.protocol}://${req.get('host')}`;
};

// Initialize payment gateway manager
const paymentGateway = new PaymentGatewayManager();

// Helper function to get customer ID from JWT token
const getCustomerIdFromToken = (req) => {
  return req.user?.customerId || req.user?.id;
};

// GET /api/v1/customer-payments/methods - Get available payment methods for customer
router.get('/methods', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const { amount } = req.query;
    const customerId = getCustomerIdFromToken(req);

    let methods = [];
    let manualMethods = [];

    // Get payment settings from database
    const settings = getAllSettings();
    const paymentSettings = settings.payment_settings || {};

    // Get customer's mitra_id if available
    let customerMitraId = null;
    if (customerId) {
      const mitraRes = await query(`
        SELECT m.id as mitra_id
        FROM services s
        JOIN regions r ON r.id = s.region_id
        JOIN mitra m ON m.id = r.mitra_id
        WHERE s.customer_id = $1
        LIMIT 1
      `, [customerId]);
      customerMitraId = mitraRes.rows[0]?.mitra_id || null;
    }

    const filterAccountForMitra = (acc) => {
      if (acc.isActive === false) return false;
      if (acc.is_company === true) return true;
      const mIds = Array.isArray(acc.mitra_ids) ? acc.mitra_ids : (acc.mitra_id ? [acc.mitra_id] : []);
      if (mIds.length === 0) return true;
      return customerMitraId && mIds.map(String).includes(String(customerMitraId));
    };

    // Build manual payment methods from payment_settings
    // Bank accounts
    if (paymentSettings.bank_accounts && Array.isArray(paymentSettings.bank_accounts)) {
      paymentSettings.bank_accounts
        .filter(filterAccountForMitra)
        .forEach(acc => {
          manualMethods.push({
            id: `bank_${acc.id}`,
            code: acc.bankName?.toLowerCase() || 'bank',
            method: acc.bankName?.toUpperCase() || 'BANK',
            type: 'manual_bank',
            name: `${acc.bankName} - ${acc.accountNumber}`,
            displayName: `${acc.bankName} - ${acc.accountNumber}`,
            bankName: acc.bankName,
            accountNumber: acc.accountNumber,
            accountName: acc.accountName,
            icon: 'building',
            active: true,
            requires_proof: true // Manual transfer requires proof upload
          });
        });
    }

    // E-wallets (manual, not via Tripay)
    if (paymentSettings.ewallets && Array.isArray(paymentSettings.ewallets)) {
      const providerLabels = {
        'gopay': 'GoPay', 'GoPay': 'GoPay',
        'ovo': 'OVO', 'OVO': 'OVO',
        'dana': 'DANA', 'DANA': 'DANA',
        'shopeepay': 'ShopeePay', 'ShopeePay': 'ShopeePay',
        'linkaja': 'LinkAja', 'LinkAja': 'LinkAja',
        'QRIS': 'QRIS', 'qris': 'QRIS'
      };

      paymentSettings.ewallets
        .filter(filterAccountForMitra)
        .forEach(wallet => {
          const label = providerLabels[wallet.provider] || wallet.provider || 'E-Wallet';
          manualMethods.push({
            id: `ewallet_${wallet.id}`,
            code: wallet.provider || 'ewallet',
            method: label,
            type: 'manual_ewallet',
            name: `${label} - ${wallet.phoneNumber}`,
            displayName: `${label} - ${wallet.phoneNumber}`,
            provider: wallet.provider,
            phoneNumber: wallet.phoneNumber,
            accountName: wallet.accountName,
            icon: 'smartphone',
            active: true,
            requires_proof: true
          });
        });
    }

    // Cash payment method
    manualMethods.push({
      id: 'cash',
      code: 'cash',
      method: 'TUNAI',
      type: 'manual_cash',
      name: 'Tunai',
      displayName: 'Bayar Tunai',
      icon: 'banknote',
      active: true,
      requires_proof: true
    });

    // Ensure gateway is initialized before use
    await paymentGateway.ensureInitialized();

    // Get all available methods from active gateway (Tripay, etc)
    let gatewayMethods = [];
    try {
      gatewayMethods = await paymentGateway.getAvailablePaymentMethods(amount);
      console.log(`[API] Tripay returned ${gatewayMethods?.length || 0} methods`);

      // Filter out manual transfer methods from Tripay (we use our own manual methods from payment_settings)
      // Tripay sometimes returns MANUAL_BCA, MANUAL_MANDIRI, etc. which we don't want since we have our own
      gatewayMethods = gatewayMethods.filter(m => m.type !== 'manual_transfer' && m.type !== 'manual');
      console.log(`[API] After filtering manual: ${gatewayMethods.length} methods`);
    } catch (error) {
      console.error('[API] Error getting Tripay methods:', error);
      gatewayMethods = [];
    }

    // Combine manual methods with gateway methods
    methods = [...manualMethods, ...gatewayMethods];

    // Log Tripay methods for debugging
    if (gatewayMethods && gatewayMethods.length > 0) {
      console.log('[API] Tripay methods:', gatewayMethods.map(m => `${m.method} (${m.type})`).join(', '));
    } else {
      console.log('[API] No Tripay methods available - check Tripay configuration');
    }

    // Filter methods based on amount if provided (only for gateway methods)
    if (amount) {
      const amountNum = parseFloat(amount);
      // Manual methods are always available, gateway methods may have limits
      const filteredGatewayMethods = gatewayMethods.filter(method => {
        return method.active &&
          (!method.minimum_amount || amountNum >= method.minimum_amount) &&
          (!method.maximum_amount || amountNum <= method.maximum_amount);
      });

      // Sort gateway methods by fee amount (lowest first)
      filteredGatewayMethods.sort((a, b) => {
        const feeA = parseFloat(a.fee_customer?.replace(/[^\d]/g, '') || 0);
        const feeB = parseFloat(b.fee_customer?.replace(/[^\d]/g, '') || 0);
        return feeA - feeB;
      });

      methods = [...manualMethods, ...filteredGatewayMethods];
    }

    // Group methods by type for better UI
    const groupedMethods = {
      manual: manualMethods, // Manual transfers (bank, ewallet, cash) from settings
      popular: gatewayMethods.filter(m => ['QRIS', 'DANA', 'GOPAY', 'OVO'].includes(m.method)),
      qris: gatewayMethods.filter(m => m.method === 'QRIS'),
      ewallet: gatewayMethods.filter(m => ['DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method)),
      bank_transfer: gatewayMethods.filter(m => m.type === 'bank' || m.type === 'va'),
      other: gatewayMethods.filter(m =>
        !['QRIS', 'DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method) &&
        m.type !== 'bank' &&
        m.type !== 'va'
      )
    };

    console.log(`[API] /methods returning ${methods.length} methods (${manualMethods.length} manual, ${gatewayMethods.length} gateway) to frontend`);
    console.log(`[API] Grouped: ${Object.keys(groupedMethods).filter(k => groupedMethods[k]?.length > 0).join(', ')}`);

    res.json({
      success: true,
      data: {
        methods: methods,
        grouped: groupedMethods,
        total_count: methods.length
      }
    });

  } catch (error) {
    logger.error('Error fetching customer payment methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment methods'
    });
  }
}));

// GET /api/v1/customer-payments/invoices - Get customer's unpaid invoices
router.get('/invoices', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const customerId = getCustomerIdFromToken(req);
    const { status = 'unpaid', limit = 10, offset = 0 } = req.query;

    const result = await query(`
      SELECT
        i.id, i.invoice_number, i.amount, i.discount, i.total_amount,
        i.due_date, i.status, i.created_at, i.notes,
        p.name as package_name, p.speed as package_speed, p.price as package_price,
        CASE
          WHEN i.due_date < CURRENT_DATE AND i.status = 'unpaid' THEN 'overdue'
          ELSE i.status
        END as display_status,
        CASE
          WHEN i.status IN ('unpaid', 'overdue', 'suspended') THEN true
          ELSE false
        END as can_pay
      FROM invoices i
      LEFT JOIN packages p ON i.package_id = p.id
      WHERE i.customer_id = $1
        AND (i.status = $2 OR ($2 = 'unpaid' AND i.status IN ('overdue', 'suspended')))
      ORDER BY i.due_date ASC
      LIMIT $3 OFFSET $4
    `, [customerId, status, parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM invoices i
      WHERE i.customer_id = $1
        AND (i.status = $2 OR ($2 = 'unpaid' AND i.status IN ('overdue', 'suspended')))
    `, [customerId, status]);

    res.json({
      success: true,
      data: {
        invoices: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching customer invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoices'
    });
  }
}));

// GET /api/v1/customer-payments/invoices/:id - Get specific invoice details
router.get('/invoices/:id', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = getCustomerIdFromToken(req);

    const result = await query(`
      SELECT
        i.*,
        p.name as package_name, p.speed as package_speed, p.price as package_price,
        c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM invoices i
      LEFT JOIN packages p ON i.package_id = p.id
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.id = $1 AND i.customer_id = $2
    `, [id, customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    const invoice = result.rows[0];

    // Get payment history for this invoice
    const paymentHistoryResult = await query(`
      SELECT pt.* FROM payment_transactions pt
      WHERE pt.invoice_id = $1
      ORDER BY pt.created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        invoice: invoice,
        payment_history: paymentHistoryResult.rows,
        can_pay: ['unpaid', 'overdue', 'suspended'].includes(invoice.status)
      }
    });

  } catch (error) {
    logger.error('Error fetching invoice details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice details'
    });
  }
}));

// POST /api/v1/customer-payments/invoices/:id/pay - Initiate payment for invoice
router.post('/invoices/:id/pay', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = getCustomerIdFromToken(req);
    const { payment_method, gateway = 'tripay', customer_details = {}, amount, invoice_number, description } = req.body;

    let invoice;
    let invoiceId = id;

    // Handle virtual bulk invoices
    if (id.startsWith('bulk-')) {
      if (!amount || !invoice_number) {
        return res.status(400).json({ success: false, error: 'Missing bulk invoice details' });
      }

      // 1. Get customer's current package from SERVICES table
      let customerRes;
      if (req.body.service_number) {
        customerRes = await query(`SELECT package_id, service_number FROM services WHERE service_number = $1 AND customer_id = $2`, [req.body.service_number, customerId]);
      } else {
        const svcCount = await query(`SELECT COUNT(*) as cnt FROM services WHERE customer_id = $1`, [customerId]);
        if (parseInt(svcCount.rows[0].cnt) > 1) {
          return res.status(400).json({ success: false, error: 'Customer has multiple services — specify service_number' });
        }
        customerRes = await query(`SELECT package_id, service_number FROM services WHERE customer_id = $1 LIMIT 1`, [customerId]);
      }
      const packageId = customerRes.rows[0]?.package_id;
      const serviceNumber = customerRes.rows[0]?.service_number;

      // 2. Create real invoice
      const newInvoiceReq = await query(`
         INSERT INTO invoices (
           customer_id, invoice_number, amount, total_amount, 
           status, due_date, created_at, description, notes, package_id, service_number
         ) VALUES ($1, $2, $3, $3, 'unpaid', NOW(), NOW(), $4, 'Bulk Payment', $5, $6)
         RETURNING *
       `, [customerId, invoice_number, amount, description || 'Bulk Payment', packageId, serviceNumber]);

      const newInvoice = newInvoiceReq.rows[0];
      invoiceId = newInvoice.id; // Use the new integer API

      // 3. Fetch full invoice details with joins for consistent object structure
      const invoiceResult = await query(`
        SELECT
          i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
          p.name as package_name
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
        LEFT JOIN packages p ON i.package_id = p.id
        WHERE i.id = $1 AND i.customer_id = $2
       `, [invoiceId, customerId]);

      invoice = invoiceResult.rows[0];

    } else {
      // Standard existing invoice lookup
      const invoiceResult = await query(`
          SELECT
            i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
            p.name as package_name
          FROM invoices i
          JOIN customers c ON i.customer_id = c.id
          LEFT JOIN packages p ON i.package_id = p.id
          WHERE i.id = $1 AND i.customer_id = $2 AND i.status IN ('unpaid', 'overdue', 'suspended')
        `, [id, customerId]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Invoice not found or cannot be paid'
        });
      }
      invoice = invoiceResult.rows[0];
    }

    // Check if payment method is manual (from payment_settings)
    const isManualPayment = payment_method?.startsWith('bank_') ||
                            payment_method?.startsWith('ewallet_') ||
                            payment_method === 'cash';

    // Get payment method details if manual
    let manualPaymentDetails = null;
    if (isManualPayment) {
      try {
        const settings = getAllSettings();
        const paymentSettings = settings.payment_settings || {};

        console.log(`[MANUAL PAYMENT] Processing payment_method: ${payment_method}`);
        console.log(`[MANUAL PAYMENT] Payment settings:`, JSON.stringify(paymentSettings, null, 2));

        if (payment_method.startsWith('bank_')) {
          const bankId = payment_method.replace('bank_', '');
          console.log(`[MANUAL PAYMENT] Looking for bank ID: ${bankId} (type: ${typeof bankId})`);
          const bank = paymentSettings.bank_accounts?.find(b => b.id === bankId || b.id == bankId);
          if (bank) {
            manualPaymentDetails = {
              type: 'bank',
              bankName: bank.bankName,
              accountNumber: bank.accountNumber,
              accountName: bank.accountName
            };
            console.log(`[MANUAL PAYMENT] Found bank:`, manualPaymentDetails);
          } else {
            console.error(`[MANUAL PAYMENT] Bank ID ${bankId} not found in settings`);
          }
        } else if (payment_method.startsWith('ewallet_')) {
          const ewalletId = payment_method.replace('ewallet_', '');
          console.log(`[MANUAL PAYMENT] Looking for ewallet ID: ${ewalletId} (type: ${typeof ewalletId})`);
          const ewallet = paymentSettings.ewallets?.find(e => e.id === ewalletId || e.id == ewalletId);
          if (ewallet) {
            const providerLabels = {
              'gopay': 'GoPay', 'GoPay': 'GoPay',
              'ovo': 'OVO', 'OVO': 'OVO',
              'dana': 'DANA', 'DANA': 'DANA',
              'shopeepay': 'ShopeePay', 'ShopeePay': 'ShopeePay',
              'linkaja': 'LinkAja', 'LinkAja': 'LinkAja',
              'QRIS': 'QRIS', 'qris': 'QRIS'
            };
            manualPaymentDetails = {
              type: 'ewallet',
              provider: providerLabels[ewallet.provider] || ewallet.provider || 'E-Wallet',
              phoneNumber: ewallet.phoneNumber,
              accountName: ewallet.accountName
            };
            console.log(`[MANUAL PAYMENT] Found ewallet:`, manualPaymentDetails);
          } else {
            console.error(`[MANUAL PAYMENT] E-wallet ID ${ewalletId} not found in settings`);
          }
        } else if (payment_method === 'cash') {
          manualPaymentDetails = {
            type: 'cash',
            instructions: 'Silakan bayar tunai ke admin kami'
          };
          console.log(`[MANUAL PAYMENT] Cash payment`);
        }
      } catch (settingsError) {
        console.error('[MANUAL PAYMENT] Error getting payment settings:', settingsError);
      }
    }

    // Check if there's already a pending payment FOR THIS METHOD
    const existingPaymentResult = await query(`
      SELECT * FROM payment_transactions
      WHERE invoice_id = $1 AND status = 'pending'
      AND expires_at > NOW()
      AND (payment_method = $2 OR $2 IS NULL)
      ORDER BY created_at DESC
      LIMIT 1
    `, [invoiceId, payment_method]);

    if (existingPaymentResult.rows.length > 0) {
      const existingPayment = existingPaymentResult.rows[0];
      return res.json({
        success: true,
        data: {
          transaction_id: existingPayment.id,
          invoice_id: invoiceId,
          invoice_number: invoice.invoice_number,
          amount: invoice.total_amount,
          payment_method: existingPayment.payment_method,
          gateway: existingPayment.gateway,
          payment_url: existingPayment.gateway_response?.payment_url,
          token: existingPayment.gateway_transaction_id,
          qr_code: existingPayment.gateway_response?.qr_code,
          expiry_time: existingPayment.expires_at,
          status: existingPayment.status,
          manual_payment_details: existingPayment.manual_payment_details,
          message: 'Existing pending payment found'
        }
      });
    }

    // Prepare payment data
    // Generate unique order_id (merchant_ref) to allow multiple payment methods for same invoice
    const uniqueOrderId = `INV-${invoice.invoice_number}-${Math.floor(Date.now() / 1000)}`;

    const portalUrl = getPortalUrl(req);

    // Format customer email for Tripay (use name@kilusi.id format)
    const customerName = customer_details.name || invoice.customer_name || '';
    // Format name to be email-safe: lowercase, replace spaces with dots, remove special chars
    const formattedName = customerName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '.') // Replace spaces with dots
      .replace(/\.+/g, '.') // Replace multiple dots with single dot
      .trim();
    const tripayEmail = formattedName ? `${formattedName}@kilusi.id` : 'customer@kilusi.id';

    const paymentData = {
      invoice_number: invoice.invoice_number,
      order_id: uniqueOrderId, // Custom unique ref for Gateway
      customer_name: customer_details.name || invoice.customer_name,
      customer_email: tripayEmail,
      customer_phone: customer_details.phone || invoice.customer_phone,
      amount: invoice.total_amount,
      package_name: invoice.package_name,
      return_url: `${portalUrl}/customer/payments/success`,
      callback_url: `${portalUrl}/api/v1/payments/webhook/${gateway}`
    };

    let paymentResult;

    // Handle manual payments differently - do NOT call Tripay
    if (isManualPayment) {
      console.log(`[MANUAL PAYMENT] Creating manual payment transaction for ${payment_method}`);

      paymentResult = {
        token: uniqueOrderId,
        order_id: uniqueOrderId,
        status: 'pending',
        manual_payment_details: manualPaymentDetails,
        instructions: manualPaymentDetails,
        // Return payment_url as null so frontend knows to show manual details
        payment_url: null,
        qr_code: null
      };
    } else {
      // Create payment transaction via gateway (Tripay, etc)
      console.log(`[TRIPAY PAYMENT] Creating Tripay payment for ${payment_method}`);
      paymentResult = await paymentGateway.createPaymentWithMethod(
        paymentData,
        gateway,
        payment_method
      );
    }

    // Generate transaction ID
    const transactionId = 'TRX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();

    // Store transaction in database
    const transactionQuery = `
      INSERT INTO payment_transactions (
        invoice_id, gateway, gateway_transaction_id, gateway_reference,
        payment_method, payment_type, amount, fee_amount, net_amount,
        status, callback_url, return_url, customer_data,
        gateway_request, gateway_response, created_at, expires_at, manual_payment_details
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16, $17
      ) RETURNING *
    `;

    // Extract fee information if available (no fees for manual payments)
    const feeAmount = isManualPayment ? 0 : (paymentResult.fee?.amount || 0);
    const feeBearer = isManualPayment ? 'customer' : (paymentResult.fee_bearer || 'customer');
    const amountReceived = isManualPayment ? invoice.total_amount : (paymentResult.amount_received || invoice.total_amount);
    // net_amount = what we actually receive after gateway takes their cut
    const netAmount = feeBearer === 'merchant' ? amountReceived : invoice.total_amount;

    const transactionValues = [
      invoiceId,
      isManualPayment ? 'manual' : gateway,
      paymentResult.token || paymentResult.gateway_transaction_id,
      paymentResult.token || paymentResult.order_id,
      payment_method,
      'invoice',
      invoice.total_amount,
      feeAmount,
      netAmount,
      'pending',
      isManualPayment ? null : paymentData.callback_url,
      isManualPayment ? null : paymentData.return_url,
      JSON.stringify(customer_details),
      JSON.stringify(paymentData),
      JSON.stringify(paymentResult),
      new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
      isManualPayment ? JSON.stringify(manualPaymentDetails) : null
    ];

    const transactionResult = await query(transactionQuery, transactionValues);
    const transaction = transactionResult.rows[0];

    // Update invoice with payment info and fee_bearer
    await query(`
      UPDATE invoices
      SET payment_gateway = $1, payment_gateway_token = $2,
          payment_gateway_method = $3, payment_gateway_status = $4,
          payment_gateway_reference = $5, expiry_date = $6,
          fee_bearer = $7
      WHERE id = $8
    `, [
      isManualPayment ? 'manual' : gateway,
      paymentResult.token,
      payment_method,
      'pending',
      paymentResult.order_id,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      feeBearer,
      invoiceId
    ]);

    logger.info(`✅ Customer payment created: ${transactionId} for invoice ${invoice.invoice_number} (${isManualPayment ? 'manual' : gateway})`);

    res.json({
      success: true,
      data: {
        transaction_id: transaction.id,
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        amount: invoice.total_amount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        payment_method: payment_method,
        gateway: isManualPayment ? 'manual' : gateway,
        payment_url: paymentResult.payment_url,
        token: paymentResult.token,
        qr_code: paymentResult.qr_code,
        expiry_time: transaction.expires_at,
        instructions: paymentResult.instructions || null,
        manual_payment_details: manualPaymentDetails,
        requires_proof: isManualPayment,
        is_manual_payment: isManualPayment,
        customer_data: {
          name: invoice.customer_name,
          email: invoice.customer_email,
          phone: invoice.customer_phone
        }
      }
    });

  } catch (error) {
    logger.error('Error creating customer payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment'
    });
  }
}));

// GET /api/v1/customer-payments/transactions/:id - Get payment transaction status
router.get('/transactions/:id', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = getCustomerIdFromToken(req);

    const result = await query(`
      SELECT pt.*, i.invoice_number, i.amount as invoice_amount, i.status as invoice_status,
             p.name as package_name
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      LEFT JOIN packages p ON i.package_id = p.id
      WHERE pt.id = $1 AND i.customer_id = $2
    `, [id, customerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const transaction = result.rows[0];

    // Calculate remaining time for pending payments
    let remainingTime = null;
    if (transaction.status === 'pending' && transaction.expires_at) {
      const now = new Date();
      const expiry = new Date(transaction.expires_at);
      remainingTime = Math.max(0, Math.floor((expiry - now) / 1000)); // seconds
    }

    res.json({
      success: true,
      data: {
        transaction_id: transaction.id,
        invoice_id: transaction.invoice_id,
        invoice_number: transaction.invoice_number,
        invoice_amount: transaction.invoice_amount,
        package_name: transaction.package_name,
        amount: transaction.amount,
        fee_amount: transaction.fee_amount,
        net_amount: transaction.net_amount,
        gateway: transaction.gateway,
        payment_method: transaction.payment_method,
        status: transaction.status,
        created_at: transaction.created_at,
        paid_at: transaction.paid_at,
        expires_at: transaction.expires_at,
        remaining_seconds: remainingTime,
        payment_url: transaction.gateway_response?.payment_url,
        qr_code: transaction.gateway_response?.qr_code,
        instructions: transaction.gateway_response?.instructions
      }
    });

  } catch (error) {
    logger.error('Error fetching customer transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction'
    });
  }
}));

// GET /api/v1/customer-payments/history - Get customer's payment history
router.get('/history', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const customerId = getCustomerIdFromToken(req);
    const { limit = 20, offset = 0, status } = req.query;

    let whereClause = 'WHERE i.customer_id = $1';
    let params = [customerId];

    if (status) {
      whereClause += ` AND pt.status = $${params.length + 1}`;
      params.push(status);
    }

    const result = await query(`
      SELECT
        pt.id, pt.gateway, pt.payment_method, pt.amount, pt.fee_amount, pt.net_amount,
        pt.status, pt.created_at, pt.paid_at, pt.expires_at,
        i.invoice_number, i.due_date,
        p.name as package_name,
        CASE
          WHEN pt.status = 'paid' THEN 'success'
          WHEN pt.status = 'failed' THEN 'error'
          WHEN pt.expires_at < NOW() THEN 'expired'
          ELSE 'pending'
        END as display_status
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      LEFT JOIN packages p ON i.package_id = p.id
      ${whereClause}
      ORDER BY pt.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        transactions: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset),
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment history'
    });
  }
}));

// GET /api/v1/customer-payments/summary - Get customer's payment summary
router.get('/summary', customerJwtAuth, asyncHandler(async (req, res) => {
  try {
    const customerId = getCustomerIdFromToken(req);

    const result = await query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN pt.status = 'paid' THEN 1 END) as paid_transactions,
        COUNT(CASE WHEN pt.status = 'pending' THEN 1 END) as pending_transactions,
        COUNT(CASE WHEN pt.status = 'failed' THEN 1 END) as failed_transactions,
        COALESCE(SUM(pt.amount), 0) as total_amount,
        COALESCE(SUM(pt.fee_amount), 0) as total_fees,
        COALESCE(SUM(pt.net_amount), 0) as total_net_amount,
        COALESCE(AVG(pt.amount), 0) as average_amount
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      WHERE i.customer_id = $1
    `, [customerId]);

    // Get recent transactions
    const recentResult = await query(`
      SELECT pt.payment_method, pt.amount, pt.status, pt.created_at, i.invoice_number
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      WHERE i.customer_id = $1
      ORDER BY pt.created_at DESC
      LIMIT 5
    `, [customerId]);

    const summary = result.rows[0];

    res.json({
      success: true,
      data: {
        summary: summary,
        recent_transactions: recentResult.rows,
        total_saved: summary.total_fees > 0 ? summary.total_fees : 0
      }
    });

  } catch (error) {
    logger.error('Error fetching payment summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary'
    });
  }
}));

module.exports = router;