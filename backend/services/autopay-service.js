/**
 * Autopay Middleware Integration Service
 * 
 * Push invoices to Autopay for automatic bank mutation matching,
 * receive payment callbacks, and poll for status updates.
 */

const axios = require('axios');
const crypto = require('crypto');
const { query } = require('../config/database');
const { createAccountingTransaction } = require('../config/accounting');
const { getSetting } = require('../config/settingsManager');
const { logger } = require('../config/logger');

class AutopayService {
  constructor() {
    this.axiosInstance = null;
  }

  getClient() {
    if (this.axiosInstance) return this.axiosInstance;
    
    const apiKey = getSetting('autopay_api_key');
    const baseURL = getSetting('autopay_base_url');
    
    if (!apiKey || !baseURL) {
      throw new Error('Autopay configuration missing (api_key or base_url)');
    }
    
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    return this.axiosInstance;
  }

  isEnabled() {
    return getSetting('autopay_enabled', false) === true || getSetting('autopay_enabled', false) === 'true';
  }

  /**
   * Push invoice to Autopay for monitoring
   * @param {object} invoice - { id, invoice_number, amount, customer_name, due_date }
   */
  async pushInvoice(invoice) {
    if (!this.isEnabled()) {
      logger.info('[Autopay] Skipped - autopay is disabled');
      return null;
    }

    try {
      const client = this.getClient();
      
      // Use amount_with_code if available, otherwise base amount
      const amount = invoice.amount_with_code || invoice.final_amount || invoice.amount || 0;
      const uniqueCode = invoice.unique_code || 0;
      
      const payload = {
        invoice_id: invoice.invoice_number,
        amount: Math.round(amount),
        customer_name: invoice.customer_name || 'Unknown',
        expiry_date: invoice.due_date ? new Date(invoice.due_date).toISOString() : new Date(Date.now() + 30*86400000).toISOString(),
        metadata: {
          invoice_db_id: invoice.id,
          unique_code: uniqueCode,
          base_amount: invoice.final_amount || invoice.amount
        }
      };

      logger.info(`[Autopay] Pushing invoice ${invoice.invoice_number} (amount: ${Math.round(amount)}, code: ${uniqueCode})`);
      
      const response = await client.post('/api/v1/invoices', payload);
      
      // Store autopay reference in invoices table
      await query(
        `UPDATE invoices SET autopay_amount = $1, autopay_unique_code = $2, updated_at = NOW() WHERE id = $3`,
        [Math.round(amount), uniqueCode, invoice.id]
      );
      
      logger.info(`[Autopay] Invoice ${invoice.invoice_number} pushed successfully`);
      
      return response.data;
    } catch (error) {
      logger.error(`[Autopay] Failed to push invoice ${invoice.invoice_number}:`, error.message);
      throw error;
    }
  }

  /**
   * Check payment status from Autopay
   * @param {string} invoiceNumber 
   */
  async checkStatus(invoiceNumber) {
    if (!this.isEnabled()) return null;

    try {
      const client = this.getClient();
      const response = await client.get(`/api/v1/invoices?invoice_id=${encodeURIComponent(invoiceNumber)}`);
      
      logger.info(`[Autopay] Status check for ${invoiceNumber}:`, JSON.stringify(response.data));
      
      return response.data;
    } catch (error) {
      logger.error(`[Autopay] Status check failed for ${invoiceNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Notify autopay gateway that an invoice has been paid outside autopay.
   * Called after manual payment, Tripay webhook, or other non-autopay methods.
   * @param {object} invoice - { invoice_number, amount, customer_name }
   */
  async notifyAutopayInvoicePaid(invoice) {
    if (!this.isEnabled()) return null;
    try {
      const client = this.getClient();
      await client.post('/api/v1/invoices/paid', {
        invoice_id: invoice.invoice_number,
        amount: String(invoice.amount || 0),
        customer_name: invoice.customer_name || '',
        paid_at: new Date().toISOString(),
      });
      logger.info(`[Autopay] Invoice ${invoice.invoice_number} marked as paid in autopay`);
      return true;
    } catch (error) {
      logger.error(`[Autopay] Failed to notify autopay for ${invoice.invoice_number}:`, error.message);
      return null;
    }
  }

  /**
   * Notify autopay gateway that an invoice has been rolled back (unpaid).
   * Called after payment rollback to restore invoice to autopay monitoring.
   * @param {object} invoice - { invoice_number, customer_name, amount }
   */
  async notifyAutopayInvoiceUnpaid(invoiceData) {
    if (!this.isEnabled()) return null;
    try {
      const result = await query(`
        SELECT i.*, c.name as customer_name
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        WHERE (i.id = $1 OR i.invoice_number = $1)
        LIMIT 1
      `, [invoiceData.invoice_id || invoiceData.invoice_number]);

      if (result.rows.length === 0) {
        logger.warn(`[Autopay] Invoice not found for rollback notification`);
        return null;
      }

      const inv = result.rows[0];

      // Try dedicated unpaid endpoint first
      try {
        const client = this.getClient();
        await client.post('/api/v1/invoices/unpaid', {
          invoice_id: inv.invoice_number,
          customer_name: inv.customer_name,
          rolled_back_at: new Date().toISOString(),
        });
        logger.info(`[Autopay] Invoice ${inv.invoice_number} marked as unpaid via dedicated endpoint`);
        return true;
      } catch (dedicatedError) {
        // Fallback: re-push invoice for monitoring
        logger.warn(`[Autopay] Dedicated unpaid endpoint failed for ${inv.invoice_number}, falling back to re-push: ${dedicatedError.message}`);
      }

      logger.info(`[Autopay] Re-pushing invoice ${inv.invoice_number} to autopay after rollback (fallback)`);

      return await this.pushInvoice({
        id: inv.id,
        invoice_number: inv.invoice_number,
        amount: inv.amount,
        amount_with_code: inv.amount_with_code,
        unique_code: inv.unique_code,
        customer_name: inv.customer_name,
        due_date: inv.due_date,
      });
    } catch (error) {
      logger.error(`[Autopay] Failed to notify autopay unpaid:`, error.message);
      return null;
    }
  }

  /**
   * Verify HMAC signature from Autopay webhook
   * @param {string} rawBody - Raw request body string
   * @param {string} signature - Value from X-Autopay-Signature header
   * @returns {boolean} True if signature is valid
   */
  verifySignature(rawBody, signature) {
    const secret = getSetting('autopay_secret');
    if (!secret) {
      logger.warn('[Autopay] HMAC secret not configured - skipping signature verification');
      return true; // Allow if not configured (backward compatibility)
    }
    if (!signature) {
      logger.warn('[Autopay] No signature header in callback');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const isValid = signature === expectedSignature;
    if (!isValid) {
      logger.warn(`[Autopay] Signature mismatch! Expected: ${expectedSignature.slice(0, 16)}..., Got: ${signature.slice(0, 16)}...`);
    }
    return isValid;
  }

  /**
   * Process payment callback from Autopay webhook
   * @param {object} payload - { invoice_id, status, amount_received, transaction_date, bank_name, sender_info }
   */
  async processCallback(payload) {
    const { invoice_id, status, amount_received, transaction_date, bank_name, sender_info } = payload;

    if (status !== 'PAID') {
      logger.info(`[Autopay] Callback received for ${invoice_id} with status: ${status} - skipping`);
      return { success: true, action: 'skipped', reason: `status is ${status}` };
    }

    try {
      // Find the invoice
      const invResult = await query(
        `SELECT * FROM invoices WHERE invoice_number = $1`,
        [invoice_id]
      );

      if (invResult.rows.length === 0) {
        logger.warn(`[Autopay] Callback: invoice ${invoice_id} not found`);
        return { success: false, action: 'not_found' };
      }

      const invoice = invResult.rows[0];

      // Idempotency: check if already paid
      if (invoice.status === 'paid') {
        logger.info(`[Autopay] Callback: invoice ${invoice_id} already paid - skipping`);
        return { success: true, action: 'already_paid' };
      }

      // Check for duplicate callback (idempotency check)
      const dupCheck = await query(
        `SELECT id FROM payment_transactions WHERE invoice_id = $1 AND gateway = 'autopay' AND status = 'paid' LIMIT 1`,
        [invoice.id]
      );
      if (dupCheck.rows.length > 0) {
        logger.info(`[Autopay] Callback: duplicate transaction for ${invoice_id} - skipping`);
        return { success: true, action: 'duplicate' };
      }

      // Create payment transaction
      const txResult = await query(
        `INSERT INTO payment_transactions (invoice_id, amount, fee_amount, net_amount, gateway, payment_method, status, paid_at, created_at)
         VALUES ($1, $2, 0, $3, 'autopay', $4, 'paid', $5, NOW()) RETURNING *`,
        [
          invoice.id,
          amount_received,
          amount_received,
          `Autopay - ${bank_name || 'Bank'}`,
          transaction_date || new Date().toISOString(),
        ]
      );

      // Save amount_with_code before reset for WhatsApp notification
      const amountForNotif = invoice.amount_with_code || invoice.amount;

      // Update invoice status
      await query(
        `UPDATE invoices SET status = 'paid', paid_at = $1, payment_method = $2, payment_fee_amount = 0, updated_at = NOW() WHERE id = $3`,
        [transaction_date || new Date().toISOString(), `Autopay - ${bank_name || 'Bank'}`, invoice.id]
      );

      // Insert into payments table for notification + portal history
      const payResult = await query(
        `INSERT INTO payments (invoice_id, amount, payment_method, payment_date, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [invoice.id, amount_received, `Autopay - ${bank_name || 'Bank'}`,
         transaction_date || new Date().toISOString(),
         `Autopay ${bank_name || 'Bank'} — Rp ${Math.round(amount_received).toLocaleString('id-ID')}`]
      );

      // Update service dates after payment
      const BillingCycleService = require('../config/billing-cycle-service');
      const updatedDates = await BillingCycleService.updateServiceDatesAfterPayment(invoice.id, transaction_date || new Date());

      // Restore service if all invoices paid
      try {
        const serviceNumber = invoice.service_number;
        if (!serviceNumber) {
          logger.warn(`[Autopay] No service_number on invoice ${invoice.id}`);
        } else {
          const unpaidCheck = await query(
            `SELECT COUNT(*) as cnt FROM invoices WHERE service_number = $1 AND status IN ('unpaid','suspended')`,
            [serviceNumber]
          );
          if (parseInt(unpaidCheck.rows[0].cnt) === 0) {
            const serviceSuspension = require('../config/serviceSuspension');
            const svcData = await query(
              `SELECT s.id, s.service_number, c.name, p.group as package_group, p.pppoe_profile
               FROM services s JOIN customers c ON c.id = s.customer_id
               LEFT JOIN packages p ON p.id = s.package_id
               WHERE s.service_number = $1`, [serviceNumber]
            );
            if (svcData.rows.length > 0 && svcData.rows[0].id) {
              await serviceSuspension.restoreServiceByServiceId(
                svcData.rows[0].id,
                { name: svcData.rows[0].name, service_number: svcData.rows[0].service_number, package_group: svcData.rows[0].package_group, pppoe_profile: svcData.rows[0].pppoe_profile },
                'Autopay - full restoration'
              );
              logger.info(`[Autopay] Service ${serviceNumber} restored`);
            }
          }
        }
      } catch (restoreErr) {
        logger.error(`[Autopay] Service restore failed for invoice ${invoice.id}:`, restoreErr.message);
      }

      // Send WhatsApp notification
      try {
        const whatsappNotifications = require('../config/whatsapp-notifications');
        await whatsappNotifications.sendPaymentReceivedNotification(payResult.rows[0].id, {
          dueDate: updatedDates?.newIsolirDate,
          amount: amountForNotif
        });
      } catch (waErr) {
        logger.error(`[Autopay] WhatsApp notification failed:`, waErr.message);
      }

      logger.info(`[Autopay] Payment processed for ${invoice_id}: Rp ${amount_received} via ${bank_name}`);

      // Create accounting transaction (non-blocking)
      try {
        const custName = await query(`SELECT name FROM customers WHERE id = $1`, [invoice.customer_id]);
        await createAccountingTransaction('revenue', amount_received,
          `Pembayaran Autopay invoice #${invoice.invoice_number} dari ${custName.rows[0]?.name || 'Customer'}`,
          'payment', payResult.rows[0].id);
      } catch (acctErr) {
        logger.warn(`[Autopay] Accounting transaction failed:`, acctErr.message);
      }

      return { success: true, action: 'processed', transaction_id: txResult.rows[0].id };
    } catch (error) {
      logger.error(`[Autopay] Callback processing failed for ${invoice_id}:`, error);
      throw error;
    }
  }

  /**
   * Poll all pending autopay invoices for status updates
   */
  async pollPendingInvoices() {
    if (!this.isEnabled()) {
      return { checked: 0, paid: 0 };
    }

    try {
      // Find invoices that were pushed to autopay but not yet paid
      const pendingResult = await query(
        `SELECT invoice_number FROM invoices 
         WHERE autopay_amount IS NOT NULL 
         AND status NOT IN ('paid', 'cancelled')
         ORDER BY created_at DESC LIMIT 100`
      );

      let checked = 0;
      let paid = 0;

      for (const row of pendingResult.rows) {
        checked++;
        try {
          const statusResult = await this.checkStatus(row.invoice_number);
          
          if (statusResult?.success && statusResult?.data?.status === 'PAID') {
            await this.processCallback({
              invoice_id: row.invoice_number,
              status: 'PAID',
              amount_received: statusResult.data.amount,
              transaction_date: statusResult.data.matched_at || new Date().toISOString(),
              bank_name: 'Autopay',
              sender_info: ''
            });
            paid++;
          }
        } catch (err) {
          logger.error(`[Autopay] Poll error for ${row.invoice_number}:`, err.message);
        }
      }

      logger.info(`[Autopay] Poll completed: ${checked} checked, ${paid} paid`);
      return { checked, paid };
    } catch (error) {
      logger.error('[Autopay] Poll failed:', error);
      return { checked: 0, paid: 0 };
    }
  }

  /**
   * Test connection to Autopay
   */
  async testConnection() {
    try {
      const client = this.getClient();
      const response = await client.get('/api/v1/invoices?invoice_id=TEST-CONNECTION');
      return { connected: true, status: response.status };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

module.exports = new AutopayService();
