const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const PaymentGatewayManager = require('../../../config/paymentGateway');

// Initialize payment gateway manager
const paymentGateway = new PaymentGatewayManager();

// Separate webhook router (no auth required for webhooks)
const webhookRouter = express.Router();

// POST /api/v1/payments/webhook/:gateway - Handle payment webhooks (no auth)
webhookRouter.post('/:gateway', asyncHandler(async (req, res) => {
  try {
    const { gateway } = req.params;

    // Log webhook for debugging
    logger.info(`📩 Received webhook from ${gateway}:`, {
      headers: req.headers,
      body: req.body
    });

    // Store webhook log
    await query(`
      INSERT INTO payment_webhook_logs (
        gateway, transaction_id, event_type, payload, headers,
        signature_valid, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW()
      )
    `, [
      gateway,
      req.body.order_id || req.body.merchant_ref || req.body.external_id,
      'payment_callback',
      JSON.stringify(req.body),
      JSON.stringify(req.headers),
      false // Will be updated after validation
    ]);

    // Process webhook with payment gateway
    const webhookResult = await paymentGateway.handleWebhook(req.body, req.headers, gateway);

    if (webhookResult && webhookResult.reference) { // Changed from order_id to reference for consistency
      if (webhookResult.status === 'success') {
        // Find the invoice to get customer details for the message
        const invoiceCheck = await query(`
          SELECT i.invoice_number, c.name as customer_name, i.final_amount as total_amount
          FROM payment_transactions pt
          JOIN invoices i ON pt.invoice_id = i.id
          JOIN customers c ON i.customer_id = c.id
          WHERE pt.gateway_reference = $1
        `, [webhookResult.reference]);

        // Update payment transaction
        const updateResult = await query(`
          UPDATE payment_transactions
          SET status = 'success',
              completed_at = NOW(),
              gateway_response = $1,
              updated_at = NOW()
          WHERE gateway_reference = $2
          RETURNING *
        `, [JSON.stringify(webhookResult), webhookResult.reference]);

        if (updateResult.rows.length === 0) {
          logger.warn(`Webhook received for unknown or already processed transaction: ${webhookResult.reference}`);
        } else {
          const transaction = updateResult.rows[0];
          const invoiceId = transaction.invoice_id;

          // Update invoice status
          await query(`
            UPDATE invoices SET
              status = 'paid',
              payment_method = $1,
              payment_gateway = $2,
              payment_gateway_status = $3,
              payment_gateway_response = $4,
              payment_date = NOW(),
              updated_at = NOW()
            WHERE id = $5
          `, [
            webhookResult.payment_method || 'tripay',
            gateway,
            webhookResult.status,
            JSON.stringify(webhookResult),
            invoiceId
          ]);

          logger.info(`💰 Invoice ${invoiceId} paid via webhook from ${gateway}`);

          // Send Telegram Notification
          if (invoiceCheck.rows.length > 0) {
            const inv = invoiceCheck.rows[0];
            const message = `
✅ *PEMBAYARAN DITERIMA (${gateway.toUpperCase()})*

*Customer:* ${inv.customer_name}
*Invoice:* ${inv.invoice_number}
*Jumlah:* Rp ${parseInt(inv.total_amount).toLocaleString('id-ID')}
*Status:* LUNAS (Paid)

_Pembayaran otomatis via Payment Gateway._
`;
            await telegramService.sendMessage(message);
          }
        }
      } else if (webhookResult.status === 'failed' || webhookResult.status === 'expired') {
        // Update payment transaction status
        await query(`
          UPDATE payment_transactions
          SET status = $1,
              gateway_response = $2,
              updated_at = NOW()
          WHERE gateway_reference = $3
        `, [
          webhookResult.status,
          JSON.stringify(webhookResult),
          webhookResult.reference
        ]);

        // Find invoice ID associated with this transaction
        const txResult = await query(`
            SELECT invoice_id FROM payment_transactions 
            WHERE gateway_reference = $1 LIMIT 1
          `, [webhookResult.reference]);

        if (txResult.rows.length > 0) {
          const invoiceId = txResult.rows[0].invoice_id;
          // Update invoice status
          await query(`
              UPDATE invoices SET
                payment_gateway_status = $1,
                payment_gateway_response = $2,
                updated_at = NOW()
              WHERE id = $3
            `, [
            webhookResult.status,
            JSON.stringify(webhookResult),
            invoiceId
          ]);

          logger.info(`Payment failed/expired for invoice ${invoiceId} via ${gateway}`);
        }
      }
    }

    // Respond to webhook
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('Error processing webhook:', error);

    // Still respond with 200 to prevent Tripay from retrying
    res.status(200).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
}));

// Helper function to generate unique transaction ID
const generateTransactionId = () => {
  return 'TRX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Helper function to validate invoice
const validateInvoice = async (invoiceId, customerId = null) => {
  const invoiceQuery = `
    SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
          p.name as package_name
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    LEFT JOIN packages p ON i.package_id = p.id
    WHERE i.id = $1 AND i.status = 'unpaid'
    ${customerId ? 'AND i.customer_id = $2' : ''}
          `;

  const params = customerId ? [invoiceId, customerId] : [invoiceId];
  const result = await query(invoiceQuery, params);

  if (result.rows.length === 0) {
    throw new Error('Invoice not found or already paid');
  }

  return result.rows[0];
};

// GET /api/v1/payments/gateways - Get available payment gateways
router.get('/gateways', asyncHandler(async (req, res) => {
  try {
    const gatewayStatus = paymentGateway.getGatewayStatus();

    res.json({
      success: true,
      data: gatewayStatus
    });
  } catch (error) {
    logger.error('Error fetching payment gateways:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment gateways'
    });
  }
}));

// GET /api/v1/payments/methods - Get available payment methods for active gateway
router.get('/methods', asyncHandler(async (req, res) => {
  try {
    const { amount, gateway } = req.query;
    let methods = [];

    if (gateway) {
      // Get methods for specific gateway
      if (paymentGateway.gateways[gateway]) {
        methods = await paymentGateway.gateways[gateway].getAvailablePaymentMethods();
      }
    } else {
      // Get all available methods
      methods = await paymentGateway.getAvailablePaymentMethods();
    }

    // Filter methods based on amount if provided
    if (amount) {
      const amountNum = parseFloat(amount);
      methods = methods.filter(method => {
        return (!method.minimum_amount || amountNum >= method.minimum_amount) &&
          (!method.maximum_amount || amountNum <= method.maximum_amount);
      });
    }

    res.json({
      success: true,
      data: methods
    });
  } catch (error) {
    logger.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment methods'
    });
  }
}));

// POST /api/v1/payments/create - Create payment transaction
router.post('/create', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const {
      invoice_id,
      gateway,
      payment_method,
      customer_details = {},
      return_url,
      callback_url
    } = req.body;

    // Validate required fields
    if (!invoice_id) {
      return res.status(400).json({
        success: false,
        error: 'Invoice ID is required'
      });
    }

    // Validate invoice
    const invoice = await validateInvoice(invoice_id);

    // Prepare payment data
    const paymentData = {
      ...invoice,
      customer_name: customer_details.name || invoice.customer_name,
      customer_email: customer_details.email || invoice.customer_email,
      customer_phone: customer_details.phone || invoice.customer_phone,
      return_url: return_url || `${req.protocol}://${req.get('host')}/payment/finish`,
      callback_url: callback_url || `${req.protocol}://${req.get('host')}/api/v1/payments/webhook/${gateway}`
    };

    // Create payment transaction
    const paymentResult = await paymentGateway.createPaymentWithMethod(
      paymentData,
      gateway,
      payment_method
    );

    // Store transaction in database
    const transactionId = generateTransactionId();
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

    const transactionValues = [
      invoice_id,
      gateway,
      paymentResult.token || paymentResult.gateway_transaction_id,
      paymentResult.order_id,
      payment_method,
      'invoice',
      invoice.final_amount || invoice.amount,
      0, // Will be updated from gateway response
      invoice.final_amount || invoice.amount,
      'pending',
      callback_url,
      return_url,
      JSON.stringify(customer_details),
      JSON.stringify(paymentData),
      JSON.stringify(paymentResult),
      new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours expiry
    ];

    const transactionResult = await query(transactionQuery, transactionValues);

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
      invoice_id
    ]);

    logger.info(`✅ Payment transaction created: ${transactionId} for invoice ${invoice.invoice_number}`);

    res.json({
      success: true,
      data: {
        transaction_id: transactionId,
        invoice_id: invoice_id,
        invoice_number: invoice.invoice_number,
        amount: invoice.final_amount || invoice.amount,
        payment_method: payment_method,
        gateway: gateway,
        payment_url: paymentResult.payment_url,
        token: paymentResult.token,
        qr_code: paymentResult.qr_code,
        expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
        instructions: paymentResult.instructions || null,
        fee: paymentResult.fee || null
      }
    });

  } catch (error) {
    logger.error('Error creating payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment'
    });
  }
}));

// GET /api/v1/payments/transactions/:id - Get payment transaction status
router.get('/transactions/:id', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT pt.*, i.invoice_number, i.amount as invoice_amount, i.status as invoice_status,
             c.name as customer_name, c.email as customer_email
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE pt.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const transaction = result.rows[0];

    res.json({
      success: true,
      data: {
        transaction_id: transaction.id,
        invoice_id: transaction.invoice_id,
        invoice_number: transaction.invoice_number,
        amount: transaction.amount,
        gateway: transaction.gateway,
        payment_method: transaction.payment_method,
        status: transaction.status,
        created_at: transaction.created_at,
        paid_at: transaction.paid_at,
        expires_at: transaction.expires_at,
        customer_name: transaction.customer_name,
        fee_amount: transaction.fee_amount,
        net_amount: transaction.net_amount
      }
    });

  } catch (error) {
    logger.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction'
    });
  }
}));

// PUT /api/v1/payments/transactions/:id/status - Update payment transaction status
router.put('/transactions/:id/status', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, gateway_response } = req.body;

    const result = await query(`
      UPDATE payment_transactions
      SET status = $1, gateway_response = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, JSON.stringify(gateway_response), id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const transaction = result.rows[0];

    // If payment is successful, update invoice status
    if (status === 'paid') {
      await query(`
        UPDATE invoices
        SET status = 'paid', payment_date = NOW(), payment_gateway_status = 'paid'
        WHERE id = $1
      `, [transaction.invoice_id]);

      logger.info(`💰 Invoice ${transaction.invoice_id} marked as paid via transaction ${id}`);
    }

    res.json({
      success: true,
      data: {
        transaction_id: transaction.id,
        status: transaction.status,
        updated_at: transaction.updated_at
      }
    });

  } catch (error) {
    logger.error('Error updating transaction status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update transaction status'
    });
  }
}));


// GET /api/v1/payments/invoices/:invoice_id/transactions - Get payment history for invoice
router.get('/invoices/:invoice_id/transactions', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { invoice_id } = req.params;

    const result = await query(`
      SELECT pt.*, i.invoice_number, c.name as customer_name
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE pt.invoice_id = $1
      ORDER BY pt.created_at DESC
    `, [invoice_id]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error fetching invoice transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice transactions'
    });
  }
}));

// GET /api/v1/payments/summary - Get payment summary statistics
router.get('/summary', jwtAuth, asyncHandler(async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params = [];

    if (start_date) {
      dateFilter += ` AND pt.created_at >= $${params.length + 1}`;
      params.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND pt.created_at <= $${params.length + 1}`;
      params.push(end_date);
    }

    const result = await query(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN pt.status = 'paid' THEN 1 END) as paid_transactions,
        COUNT(CASE WHEN pt.status = 'pending' THEN 1 END) as pending_transactions,
        COUNT(CASE WHEN pt.status = 'failed' THEN 1 END) as failed_transactions,
        COALESCE(SUM(pt.amount), 0) as total_amount,
        COALESCE(SUM(pt.fee_amount), 0) as total_fees,
        COALESCE(SUM(pt.net_amount), 0) as total_net_amount,
        pt.gateway
      FROM payment_transactions pt
      WHERE 1=1 ${dateFilter}
      GROUP BY pt.gateway
      ORDER BY total_amount DESC
    `, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error fetching payment summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary'
    });
  }
}));

// Export both routers
module.exports = { router, webhookRouter };