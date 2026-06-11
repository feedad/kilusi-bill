const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { query } = require('../../../config/database');
const { jwtAuth } = require('../../../middleware/jwtAuth');
const { asyncHandler } = require('../../../middleware/response');
const PaymentGatewayManager = require('../../../config/paymentGateway');
const BillingCycleService = require('../../../config/billing-cycle-service');
const { createAccountingTransaction } = require('../../../config/accounting');
const telegramService = require('../../../services/telegram-service');

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

    // Process webhook with payment gateway (pass body+headers as object, gateway as string)
    const webhookResult = await paymentGateway.handleWebhook({ body: req.body, headers: req.headers }, gateway);

    if (webhookResult && webhookResult.reference) { // Changed from order_id to reference for consistency
      if (webhookResult.status === 'success') {
        // Find the invoice to get customer details for the message
        const invoiceCheck = await query(`
          SELECT i.invoice_number, c.name as customer_name, i.total_amount as total_amount
          FROM payment_transactions pt
          JOIN invoices i ON pt.invoice_id = i.id
          JOIN customers c ON i.customer_id = c.id
          WHERE pt.gateway_reference = $1
        `, [webhookResult.reference]);

        // Update payment transaction
        const updateResult = await query(`
          UPDATE payment_transactions
          SET status = 'paid',
              fee_amount = COALESCE($1, fee_amount),
              net_amount = CASE WHEN $2 > 0 THEN $2 ELSE amount - COALESCE($1, fee_amount) END,
              amount_received = COALESCE($3, amount_received),
              paid_at = NOW(),
              gateway_response = $4,
              updated_at = NOW()
          WHERE gateway_reference = $5
          RETURNING *
        `, [webhookResult.fee_amount || null, webhookResult.net_amount || null, webhookResult.amount_received || null, JSON.stringify(webhookResult), webhookResult.reference]);

        if (updateResult.rows.length === 0) {
          logger.warn(`Webhook received for unknown or already processed transaction: ${webhookResult.reference}`);
        } else {
          const transaction = updateResult.rows[0];
           const invoiceId = transaction.invoice_id;

            // [DEBUG] Log invoice status before update
            const statusBefore = await query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
            logger.info(`[WEBHOOK-DEBUG] Invoice ${invoiceId} status BEFORE: ${statusBefore.rows[0]?.status}`);

            // Update invoice status
            await query(`
             UPDATE invoices SET
               status = 'paid',
               payment_method = $1,
               payment_gateway = $2,
               payment_gateway_status = $3,
               payment_gateway_response = $4,
               payment_fee_amount = COALESCE($5, 0),
               fee_bearer = COALESCE($6, fee_bearer),
               paid_at = NOW(),
               payment_date = NOW(),
               updated_at = NOW()
             WHERE id = $7
           `, [
             webhookResult.payment_method || 'tripay',
             gateway,
             webhookResult.status,
             JSON.stringify(webhookResult),
             webhookResult.fee_amount || null,
             webhookResult.fee_bearer || null,
             invoiceId
           ]);

            logger.info(`💰 Invoice ${invoiceId} paid via webhook from ${gateway}`);

            // [DEBUG] Log invoice status after update
            const statusAfter = await query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
            logger.info(`[WEBHOOK-DEBUG] Invoice ${invoiceId} status AFTER update: ${statusAfter.rows[0]?.status}`);

            // Notify autopay (non-blocking)
           const autopayService = require('../../../services/autopay-service');
           const invResult = await query('SELECT invoice_number, amount, customer_id FROM invoices WHERE id = $1', [invoiceId]);
           if (invResult.rows.length > 0) {
               const custResult = await query('SELECT name FROM customers WHERE id = $1', [invResult.rows[0].customer_id]);
               autopayService.notifyAutopayInvoicePaid({
                   invoice_number: invResult.rows[0].invoice_number,
                   amount: invResult.rows[0].amount,
                   customer_name: custResult.rows[0]?.name || '',
               }).catch(e => logger.warn('Autopay notify failed:', e.message));
           }

             // Update service dates after payment using actual payment timestamp
             const paymentTimestamp = webhookResult.paid_at ? new Date(webhookResult.paid_at * 1000) : new Date();
             const updatedDates = await BillingCycleService.updateServiceDatesAfterPayment(invoiceId, paymentTimestamp);

            // [DEBUG] Log invoice status after date update
            const statusAfterDates = await query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
            logger.info(`[WEBHOOK-DEBUG] Invoice ${invoiceId} status AFTER updateDates: ${statusAfterDates.rows[0]?.status}`);

             // Restore service if all invoices paid (Tripay payment reactivates)
            try {
                const svcNumber = await query(`SELECT service_number FROM invoices WHERE id = $1`, [invoiceId]);
                const serviceNumber = svcNumber.rows[0]?.service_number;
                if (serviceNumber) {
                    const unpaidCheck = await query(
                        `SELECT COUNT(*) as cnt FROM invoices WHERE service_number = $1 AND status IN ('unpaid','suspended')`,
                        [serviceNumber]
                    );
                    if (parseInt(unpaidCheck.rows[0].cnt) === 0) {
                        const serviceSuspension = require('../../../config/serviceSuspension');
                        const svcData = await query(
                            `SELECT s.id, s.service_number, c.name, p.group as package_group, p.pppoe_profile
                             FROM services s JOIN customers c ON c.id = s.customer_id
                             LEFT JOIN packages p ON p.id = s.package_id
                             WHERE s.service_number = $1`,
                            [serviceNumber]
                        );
                        if (svcData.rows.length > 0 && svcData.rows[0].id) {
                            await serviceSuspension.restoreServiceByServiceId(
                                svcData.rows[0].id,
                                { name: svcData.rows[0].name, service_number: svcData.rows[0].service_number, package_group: svcData.rows[0].package_group, pppoe_profile: svcData.rows[0].pppoe_profile },
                                'Tripay - full restoration'
                            );
                            logger.info(`🔄 Service ${serviceNumber} restored via Tripay webhook`);
                        }
                    } else {
                        logger.info(`ℹ️ Service ${serviceNumber} still has ${unpaidCheck.rows[0].cnt} unpaid, skipping restore`);
                    }
                }
            } catch (e) { logger.warn('Restore service after Tripay payment failed:', e.message); }

            // [DEBUG] Log invoice status after restore
            const statusAfterRestore = await query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
            logger.info(`[WEBHOOK-DEBUG] Invoice ${invoiceId} status AFTER restore: ${statusAfterRestore.rows[0]?.status}`);

            // Insert into payments table for notification + portal history
            const payResult = await query(
                `INSERT INTO payments (invoice_id, amount, payment_method, payment_date, notes, created_at)
                 VALUES ($1, $2, $3, NOW(), $4, NOW()) RETURNING *`,
                [invoiceId, parseFloat(transaction.amount_received) || transaction.amount,
                 webhookResult.payment_method || gateway,
                 `Tripay ${webhookResult.payment_method || gateway} — Rp ${Math.round(parseFloat(transaction.amount_received) || transaction.amount).toLocaleString('id-ID')}`]
            );

            // [DEBUG] Log invoice status after payments INSERT
            const statusFinal = await query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
            logger.info(`[WEBHOOK-DEBUG] Invoice ${invoiceId} status FINAL: ${statusFinal.rows[0]?.status}`);

            // Send WhatsApp notification
           try {
               const whatsappNotifications = require('../../../config/whatsapp-notifications');
                await whatsappNotifications.sendPaymentReceivedNotification(payResult.rows[0].id, {
                    dueDate: updatedDates?.newIsolirDate
                });
               logger.info(`📱 WhatsApp payment notification sent for invoice ${invoiceId}`);
            } catch (e) { logger.warn('Tripay payment notification failed:', e.message); }

            // Create accounting transaction (non-blocking)
            try {
                const custResult = await query(`SELECT c.name, i.invoice_number FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = $1`, [invoiceId]);
                await createAccountingTransaction('revenue', transaction.amount_received || transaction.amount,
                    `Pembayaran Tripay invoice #${custResult.rows[0]?.invoice_number || invoiceId} dari ${custResult.rows[0]?.name || 'Customer'}`,
                    'payment', payResult.rows[0].id);
            } catch (acctErr) { logger.warn('Tripay accounting transaction failed:', acctErr.message); }

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
      paymentResult.token || paymentResult.order_id,
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

    // [DEBUG] Log paymentResult token vs order_id for gateway_reference fix verification
    logger.info(`[PAYMENT-DEBUG] token="${paymentResult.token}" order_id="${paymentResult.order_id}" → stored_ref="${paymentResult.token || paymentResult.order_id}"`);

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
        SET status = 'paid', payment_date = $2, payment_gateway_status = 'paid'
        WHERE id = $1
      `, [transaction.invoice_id, transaction.created_at]);

      logger.info(`💰 Invoice ${transaction.invoice_id} marked as paid via transaction ${id}`);
      
      // Update service dates after payment using transaction creation time
      await BillingCycleService.updateServiceDatesAfterPayment(transaction.invoice_id, transaction.created_at);
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