const { logger } = require('../config/logger');
const { query } = require('../config/database');
const PaymentGatewayManager = require('../config/paymentGateway');

class EnhancedPaymentService {
  constructor() {
    this.gatewayManager = new PaymentGatewayManager();
  }

  /**
   * Get available payment methods with enhanced filtering
   */
  async getAvailablePaymentMethods(amount = null, customerData = {}) {
    try {
      const methods = await this.gatewayManager.getAvailablePaymentMethods();

      // Filter by amount if provided
      if (amount) {
        const filteredMethods = methods.filter(method => {
          const minAmount = parseFloat(method.minimum_amount) || 0;
          const maxAmount = parseFloat(method.maximum_amount) || Infinity;
          return amount >= minAmount && amount <= maxAmount;
        });

        // Sort by fee (lowest first)
        return filteredMethods.sort((a, b) => {
          const feeA = parseFloat(a.fee_customer?.replace(/[^\d]/g, '') || 0);
          const feeB = parseFloat(b.fee_customer?.replace(/[^\d]/g, '') || 0);
          return feeA - feeB;
        });
      }

      return methods;
    } catch (error) {
      logger.error('Error getting payment methods:', error);
      throw error;
    }
  }

  /**
   * Create payment with enhanced validation and error handling
   */
  async createPayment(paymentData) {
    try {
      const {
        invoice_id,
        gateway = 'tripay',
        payment_method,
        customer_details = {},
        return_url,
        callback_url
      } = paymentData;

      // Validate invoice
      const invoice = await this.validateInvoice(invoice_id);

      // Check for existing pending payments
      const existingPayment = await this.checkExistingPayment(invoice_id);
      if (existingPayment) {
        return {
          success: true,
          data: existingPayment,
          message: 'Existing pending payment found'
        };
      }

      // Prepare payment data for gateway
      const gatewayPaymentData = {
        ...invoice,
        customer_name: customer_details.name || invoice.customer_name,
        customer_email: customer_details.email || invoice.customer_email,
        customer_phone: customer_details.phone || invoice.customer_phone,
        return_url: return_url,
        callback_url: callback_url
      };

      // Create payment through gateway
      const paymentResult = await this.gatewayManager.createPaymentWithMethod(
        gatewayPaymentData,
        gateway,
        payment_method
      );

      // Store transaction in database
      const transaction = await this.createTransaction({
        invoice_id,
        gateway,
        payment_method,
        payment_result,
        customer_details,
        amount: invoice.final_amount || invoice.amount
      });

      // Update invoice with payment info
      await this.updateInvoicePaymentInfo(invoice_id, {
        gateway,
        payment_method,
        transaction,
        payment_result
      });

      return {
        success: true,
        data: {
          transaction_id: transaction.id,
          invoice_id: invoice_id,
          invoice_number: invoice.invoice_number,
          amount: invoice.final_amount || invoice.amount,
          payment_method: payment_method,
          gateway: gateway,
          payment_url: paymentResult.payment_url,
          token: paymentResult.token,
          qr_code: paymentResult.qr_code,
          expiry_time: transaction.expires_at,
          instructions: paymentResult.instructions || null,
          fee: paymentResult.fee || null
        }
      };

    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  /**
   * Validate invoice for payment
   */
  async validateInvoice(invoiceId) {
    const result = await query(`
      SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             p.name as package_name
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      LEFT JOIN packages p ON i.package_id = p.id
      WHERE i.id = $1 AND i.status IN ('unpaid', 'overdue')
    `, [invoiceId]);

    if (result.rows.length === 0) {
      throw new Error('Invoice not found or cannot be paid');
    }

    return result.rows[0];
  }

  /**
   * Check for existing pending payment
   */
  async checkExistingPayment(invoiceId) {
    const result = await query(`
      SELECT pt.*, gateway_response
      FROM payment_transactions pt
      WHERE pt.invoice_id = $1 AND pt.status = 'pending'
        AND pt.expires_at > NOW()
      ORDER BY pt.created_at DESC
      LIMIT 1
    `, [invoiceId]);

    if (result.rows.length === 0) {
      return null;
    }

    const transaction = result.rows[0];
    return {
      transaction_id: transaction.id,
      invoice_id: invoiceId,
      payment_method: transaction.payment_method,
      gateway: transaction.gateway,
      payment_url: transaction.gateway_response?.payment_url,
      token: transaction.gateway_transaction_id,
      qr_code: transaction.gateway_response?.qr_code,
      expiry_time: transaction.expires_at,
      status: transaction.status
    };
  }

  /**
   * Create payment transaction record
   */
  async createTransaction({
    invoice_id,
    gateway,
    payment_method,
    payment_result,
    customer_details,
    amount
  }) {
    // Generate transaction ID
    const transactionId = 'TRX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();

    // Extract fee information
    const feeAmount = payment_result.fee?.amount || 0;
    const netAmount = amount - feeAmount;

    const result = await query(`
      INSERT INTO payment_transactions (
        invoice_id, gateway, gateway_transaction_id, gateway_reference,
        payment_method, payment_type, amount, fee_amount, net_amount,
        status, customer_data, gateway_request, gateway_response,
        created_at, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14
      ) RETURNING *
    `, [
      invoice_id,
      gateway,
      payment_result.token || payment_result.gateway_transaction_id,
      payment_result.order_id,
      payment_method,
      'invoice',
      amount,
      feeAmount,
      netAmount,
      'pending',
      JSON.stringify(customer_details),
      JSON.stringify(payment_result),
      JSON.stringify(payment_result),
      new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours expiry
    ]);

    return result.rows[0];
  }

  /**
   * Update invoice payment information
   */
  async updateInvoicePaymentInfo(invoiceId, { gateway, payment_method, transaction, payment_result }) {
    await query(`
      UPDATE invoices
      SET payment_gateway = $1, payment_gateway_token = $2,
          payment_gateway_method = $3, payment_gateway_status = $4,
          payment_gateway_reference = $5, expiry_date = $6,
          payment_method_details = $7, updated_at = NOW()
      WHERE id = $8
    `, [
      gateway,
      payment_result.token,
      payment_method,
      'pending',
      payment_result.order_id,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      JSON.stringify({
        method: payment_method,
        gateway: gateway,
        transaction_id: transaction.id
      }),
      invoiceId
    ]);
  }

  /**
   * Process payment webhook
   */
  async processWebhook(gateway, payload, headers = {}) {
    try {
      // Log webhook
      await this.logWebhook(gateway, payload, headers);

      // Process with gateway manager
      const webhookResult = await this.gatewayManager.handleWebhook(payload, gateway);

      if (webhookResult && webhookResult.order_id) {
        // Update transaction and invoice status
        await this.updatePaymentStatus(webhookResult.order_id, webhookResult, gateway);
      }

      return {
        success: true,
        message: 'Webhook processed successfully'
      };

    } catch (error) {
      logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Log webhook for audit purposes
   */
  async logWebhook(gateway, payload, headers) {
    await query(`
      INSERT INTO payment_webhook_logs (
        gateway, transaction_id, event_type, payload, headers,
        signature_valid, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW()
      )
    `, [
      gateway,
      payload.order_id || payload.merchant_ref || payload.external_id,
      'payment_callback',
      JSON.stringify(payload),
      JSON.stringify(headers),
      false // Will be updated after signature validation
    ]);
  }

  /**
   * Update payment status based on webhook
   */
  async updatePaymentStatus(orderId, webhookResult, gateway) {
    const invoiceNumber = orderId.replace('INV-', '');

    // Find and update transaction
    const transactionResult = await query(`
      SELECT pt.* FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      WHERE i.invoice_number = $1 AND pt.gateway = $2
        AND pt.status = 'pending'
      ORDER BY pt.created_at DESC
      LIMIT 1
    `, [invoiceNumber, gateway]);

    if (transactionResult.rows.length === 0) {
      logger.warn(`No pending transaction found for order: ${orderId}`);
      return;
    }

    const transaction = transactionResult.rows[0];
    const status = webhookResult.status === 'success' ? 'paid' : webhookResult.status;

    // Update transaction
    await query(`
      UPDATE payment_transactions
      SET status = $1, gateway_response = $2, paid_at = $3, updated_at = NOW()
      WHERE id = $4
    `, [
      status,
      JSON.stringify(webhookResult),
      webhookResult.status === 'success' ? new Date() : null,
      transaction.id
    ]);

    // Update invoice if payment is successful
    if (webhookResult.status === 'success') {
      await query(`
        UPDATE invoices
        SET status = 'paid', payment_date = NOW, payment_gateway_status = 'paid',
            payment_gateway_reference = $1, settlement_date = NOW()
        WHERE id = $2
      `, [webhookResult.reference, transaction.invoice_id]);

      logger.info(`💰 Invoice ${transaction.invoice_id} paid via webhook from ${gateway}`);
    }
  }

  /**
   * Get payment transaction details
   */
  async getTransaction(transactionId, customerId = null) {
    let whereClause = 'WHERE pt.id = $1';
    const params = [transactionId];

    if (customerId) {
      whereClause += ' AND i.customer_id = $2';
      params.push(customerId);
    }

    const result = await query(`
      SELECT pt.*, i.invoice_number, i.amount as invoice_amount, i.status as invoice_status,
             c.name as customer_name, c.email as customer_email,
             p.name as package_name
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN packages p ON i.package_id = p.id
      ${whereClause}
    `, params);

    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const transaction = result.rows[0];

    // Calculate remaining time for pending payments
    let remainingTime = null;
    if (transaction.status === 'pending' && transaction.expires_at) {
      const now = new Date();
      const expiry = new Date(transaction.expires_at);
      remainingTime = Math.max(0, Math.floor((expiry - now) / 1000));
    }

    return {
      ...transaction,
      remaining_seconds: remainingTime,
      payment_url: transaction.gateway_response?.payment_url,
      qr_code: transaction.gateway_response?.qr_code,
      instructions: transaction.gateway_response?.instructions
    };
  }

  /**
   * Get customer payment history
   */
  async getCustomerPaymentHistory(customerId, options = {}) {
    const { limit = 20, offset = 0, status } = options;

    let whereClause = 'WHERE i.customer_id = $1';
    const params = [customerId];

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

    return {
      transactions: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    };
  }

  /**
   * Get payment statistics
   */
  async getPaymentStatistics(startDate = null, endDate = null, customerId = null) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (startDate) {
      whereClause += ` AND pt.created_at >= $${params.length + 1}`;
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ` AND pt.created_at <= $${params.length + 1}`;
      params.push(endDate);
    }

    if (customerId) {
      whereClause += ` AND i.customer_id = $${params.length + 1}`;
      params.push(customerId);
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
        COALESCE(AVG(pt.amount), 0) as average_amount
      FROM payment_transactions pt
      JOIN invoices i ON pt.invoice_id = i.id
      ${whereClause}
    `, params);

    return result.rows[0];
  }

  /**
   * Cancel payment transaction
   */
  async cancelTransaction(transactionId, reason = 'Customer cancellation') {
    const result = await query(`
      UPDATE payment_transactions
      SET status = 'cancelled', updated_at = NOW(),
          gateway_response = jsonb_set(
            coalesce(gateway_response, '{}')::jsonb,
            '{cancellation_reason}',
            $1::jsonb
          )
      WHERE id = $2 AND status = 'pending'
      RETURNING *
    `, [reason, transactionId]);

    if (result.rows.length === 0) {
      throw new Error('Transaction not found or cannot be cancelled');
    }

    // Update invoice status back to unpaid
    await query(`
      UPDATE invoices
      SET payment_gateway_status = 'cancelled', updated_at = NOW()
      WHERE id = $1
    `, [result.rows[0].invoice_id]);

    return result.rows[0];
  }
}

module.exports = EnhancedPaymentService;