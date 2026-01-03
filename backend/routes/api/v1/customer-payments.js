const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { customerJwtAuth } = require('../../../middleware/customerJwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const PaymentGatewayManager = require('../../../config/paymentGateway');

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

    // Ensure gateway is initialized before use
    await paymentGateway.ensureInitialized();

    // Get all available methods from active gateway
    methods = await paymentGateway.getAvailablePaymentMethods(amount);

    // Filter methods based on amount if provided
    if (amount) {
      const amountNum = parseFloat(amount);
      methods = methods.filter(method => {
        return method.active &&
          (!method.minimum_amount || amountNum >= method.minimum_amount) &&
          (!method.maximum_amount || amountNum <= method.maximum_amount);
      });

      // Sort by fee amount (lowest first)
      methods.sort((a, b) => {
        const feeA = parseFloat(a.fee_customer?.replace(/[^\d]/g, '') || 0);
        const feeB = parseFloat(b.fee_customer?.replace(/[^\d]/g, '') || 0);
        return feeA - feeB;
      });
    }

    // Group methods by type for better UI
    const groupedMethods = {
      popular: methods.filter(m => ['QRIS', 'DANA', 'GOPAY', 'OVO'].includes(m.method)),
      qris: methods.filter(m => m.method === 'QRIS'),
      ewallet: methods.filter(m => ['DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method)),
      bank_transfer: methods.filter(m => m.type === 'bank' || m.type === 'va'),
      other: methods.filter(m => !['QRIS', 'DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method) && m.type !== 'bank' && m.type !== 'va')
    };

    console.log(`[API] /methods returning ${methods.length} methods to frontend`);

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
          WHEN i.status IN ('unpaid', 'overdue') THEN true
          ELSE false
        END as can_pay
      FROM invoices i
      LEFT JOIN packages p ON i.package_id = p.id
      WHERE i.customer_id = $1
        AND (i.status = $2 OR ($2 = 'unpaid' AND i.status = 'overdue'))
      ORDER BY i.due_date ASC
      LIMIT $3 OFFSET $4
    `, [customerId, status, parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM invoices i
      WHERE i.customer_id = $1
        AND (i.status = $2 OR ($2 = 'unpaid' AND i.status = 'overdue'))
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
        can_pay: ['unpaid', 'overdue'].includes(invoice.status)
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
      const customerRes = await query(`SELECT package_id FROM services WHERE customer_id = $1 LIMIT 1`, [customerId]);
      const packageId = customerRes.rows[0]?.package_id;

      // 2. Create real invoice
      const newInvoiceReq = await query(`
         INSERT INTO invoices (
           customer_id, invoice_number, amount, total_amount, 
           status, due_date, created_at, description, notes, package_id
         ) VALUES ($1, $2, $3, $3, 'unpaid', NOW(), NOW(), $4, 'Bulk Payment', $5)
         RETURNING *
       `, [customerId, invoice_number, amount, description || 'Bulk Payment', packageId]);

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
          WHERE i.id = $1 AND i.customer_id = $2 AND i.status IN ('unpaid', 'overdue')
        `, [id, customerId]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Invoice not found or cannot be paid'
        });
      }
      invoice = invoiceResult.rows[0];
    }

    // Check if there's already a pending payment
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
          message: 'Existing pending payment found'
        }
      });
    }

    // Prepare payment data
    // Generate unique order_id (merchant_ref) to allow multiple payment methods for same invoice
    const uniqueOrderId = `INV-${invoice.invoice_number}-${Math.floor(Date.now() / 1000)}`;

    const paymentData = {
      invoice_number: invoice.invoice_number,
      order_id: uniqueOrderId, // Custom unique ref for Gateway
      customer_name: customer_details.name || invoice.customer_name,
      customer_email: customer_details.email || invoice.customer_email,
      customer_phone: customer_details.phone || invoice.customer_phone,
      amount: invoice.total_amount,
      package_name: invoice.package_name,
      return_url: `${req.protocol}://${req.get('host')}/customer/payments/success`,
      callback_url: `${req.protocol}://${req.get('host')}/api/v1/payments/webhook/${gateway}`
    };

    // Create payment transaction
    const paymentResult = await paymentGateway.createPaymentWithMethod(
      paymentData,
      gateway,
      payment_method
    );

    // Generate transaction ID
    const transactionId = 'TRX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();

    // Store transaction in database
    const transactionQuery = `
      INSERT INTO payment_transactions (
        invoice_id, gateway, gateway_transaction_id, gateway_reference,
        payment_method, payment_type, amount, fee_amount, net_amount,
        status, callback_url, return_url, customer_data,
        gateway_request, gateway_response, created_at, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16
      ) RETURNING *
    `;

    // Extract fee information if available
    const feeAmount = paymentResult.fee?.amount || 0;
    const netAmount = invoice.total_amount - feeAmount;

    const transactionValues = [
      invoiceId,
      gateway,
      paymentResult.token || paymentResult.gateway_transaction_id,
      paymentResult.order_id,
      payment_method,
      'invoice',
      invoice.total_amount,
      feeAmount,
      netAmount,
      'pending',
      paymentData.callback_url,
      paymentData.return_url,
      JSON.stringify(customer_details),
      JSON.stringify(paymentData),
      JSON.stringify(paymentResult),
      new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours expiry
    ];

    const transactionResult = await query(transactionQuery, transactionValues);
    const transaction = transactionResult.rows[0];

    // Update invoice with payment info
    await query(`
      UPDATE invoices
      SET payment_gateway = $1, payment_gateway_token = $2,
          payment_gateway_method = $3, payment_gateway_status = $4,
          payment_gateway_reference = $5, expiry_date = $6
      WHERE id = $7
    `, [
      gateway,
      paymentResult.token,
      payment_method,
      'pending',
      paymentResult.order_id,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      invoiceId
    ]);

    logger.info(`✅ Customer payment created: ${transactionId} for invoice ${invoice.invoice_number}`);

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
        gateway: gateway,
        payment_url: paymentResult.payment_url,
        token: paymentResult.token,
        qr_code: paymentResult.qr_code,
        expiry_time: transaction.expires_at,
        instructions: paymentResult.instructions || null,
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