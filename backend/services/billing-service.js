/**
 * Simplified Billing Service
 * Handles prepaid and postpaid billing logic
 */

const { query } = require('../config/database');
const { logger } = require('../config/logger');

class BillingService {
    constructor() {
        this.installationFee = 50000; // Default installation fee
    }

    /**
     * Create invoice for new customer based on billing type
     */
    async createCustomerInvoice(customerId, packageId, billingType, packagePrice = null, installationFee = null) {
        try {
            // Get package details if not provided
            if (!packagePrice || !installationFee) {
                const packageResult = await query(
                    'SELECT price, installation_fee FROM packages WHERE id = $1',
                    [packageId]
                );

                if (packageResult.rows.length === 0) {
                    throw new Error('Package not found');
                }

                const pkg = packageResult.rows[0];
                packagePrice = pkg.price;
                installationFee = pkg.installation_fee;
            }

            let invoiceAmount;
            let invoiceType;
            let invoiceDescription;

            if (billingType === 'prepaid') {
                // Prepaid: Package + Installation
                invoiceAmount = parseFloat(packagePrice) + parseFloat(installationFee);
                invoiceType = 'prepaid';
                invoiceDescription = `Paket ${packagePrice} + Instalasi ${installationFee}`;

                // Set trial period
                const trialExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

                await query(`
                    UPDATE customers
                    SET trial_expires_at = $1, trial_active = true, status = 'active'
                    WHERE id = $2
                `, [trialExpiresAt, customerId]);

                logger.info(`Prepaid trial activated for customer ${customerId}, expires at ${trialExpiresAt}`);

            } else {
                // Postpaid: Installation only
                invoiceAmount = parseFloat(installationFee);
                invoiceType = 'postpaid';
                invoiceDescription = `Biaya Instalasi ${installationFee}`;

                // Activate immediately
                await query(`
                    UPDATE customers
                    SET status = 'active'
                    WHERE id = $1
                `, [customerId]);

                logger.info(`Postpaid customer ${customerId} activated immediately`);
            }

            // Generate invoice number
            const invoiceNumber = this.generateInvoiceNumber(invoiceType);

            // Create invoice
            const invoiceResult = await query(`
                INSERT INTO invoices (
                    customer_id,
                    package_id,
                    invoice_number,
                    amount,
                    due_date,
                    status,
                    invoice_type,
                    is_installation_fee,
                    notes,
                    created_at
                ) VALUES ($1, $2, $3, $4, NOW(), 'unpaid', $5, true, $6, NOW())
                RETURNING *
            `, [
                customerId,
                packageId,
                invoiceNumber,
                invoiceAmount,
                invoiceType,
                invoiceDescription
            ]);

            const invoice = invoiceResult.rows[0];

            logger.info(`Created ${invoiceType} invoice ${invoiceNumber} for customer ${customerId}, amount: ${invoiceAmount}`);

            return {
                success: true,
                invoice,
                billingType,
                message: billingType === 'prepaid'
                    ? `Invoice created: Paket + Instalasi. Trial aktif 30 menit.`
                    : `Invoice created: Instalasi saja. Layanan aktif langsung.`
            };

        } catch (error) {
            logger.error('Error creating customer invoice:', error);
            throw error;
        }
    }

    /**
     * Generate unique invoice number
     */
    generateInvoiceNumber(type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 4).toUpperCase();
        return type === 'prepaid' ? `INV-PR-${timestamp}-${random}` : `INV-PS-${timestamp}-${random}`;
    }

    /**
     * Check trial expiry and suspend customers
     */
    async checkTrialExpiry() {
        try {
            const expiredTrials = await query(`
                UPDATE customers
                SET trial_active = false, status = 'suspended'
                WHERE billing_type = 'prepaid'
                AND trial_active = true
                AND trial_expires_at < NOW()
                RETURNING id, name, phone, pppoe_username
            `);

            if (expiredTrials.rows.length > 0) {
                logger.info(`Found ${expiredTrials.rows.length} expired trials`);

                for (const customer of expiredTrials.rows) {
                    // Send notification (if you have WhatsApp service)
                    await this.sendTrialExpiredNotification(customer);

                    // Suspend in RADIUS (if you have RADIUS integration)
                    await this.suspendCustomer(customer);
                }
            }

            return expiredTrials.rows;

        } catch (error) {
            logger.error('Error checking trial expiry:', error);
            throw error;
        }
    }

    /**
     * Handle invoice payment
     */
    async handlePayment(invoiceId, amount, paymentMethod = 'cash') {
        try {
            // Get invoice details
            const invoiceResult = await query(`
                SELECT i.*, c.billing_type, c.customer_id, c.pppoe_username, c.name, c.phone
                FROM invoices i
                JOIN customers c ON i.customer_id = c.id
                WHERE i.id = $1
            `, [invoiceId]);

            if (invoiceResult.rows.length === 0) {
                throw new Error('Invoice not found');
            }

            const invoice = invoiceResult.rows[0];

            // Update invoice status
            await query(`
                UPDATE invoices
                SET status = 'paid',
                    payment_date = NOW(),
                    payment_method = $1,
                    updated_at = NOW()
                WHERE id = $2
            `, [paymentMethod, invoiceId]);

            // If prepaid invoice, activate customer permanently
            if (invoice.billing_type === 'prepaid') {
                await query(`
                    UPDATE customers
                    SET status = 'active',
                        trial_active = false,
                        updated_at = NOW()
                    WHERE id = $1
                `, [invoice.customer_id]);

                // Activate in RADIUS
                await this.activateCustomer(invoice);

                logger.info(`Prepaid customer ${invoice.customer_id} activated permanently after payment`);
            }

            // Create payment record
            await query(`
                INSERT INTO payments (
                    invoice_id, amount, payment_date, payment_method, created_at
                ) VALUES ($1, $2, NOW(), $3, NOW())
            `, [invoiceId, amount, paymentMethod]);

            logger.info(`Payment processed for invoice ${invoiceId}, amount: ${amount}`);

            return {
                success: true,
                message: 'Payment processed successfully',
                customerActivated: invoice.billing_type === 'prepaid'
            };

        } catch (error) {
            logger.error('Error handling payment:', error);
            throw error;
        }
    }

    /**
     * Get customer billing information
     */
    async getCustomerBillingInfo(customerId) {
        try {
            const customerResult = await query(`
                SELECT id, name, phone, billing_type, status, trial_active, trial_expires_at,
                       created_at, siklus
                FROM customers
                WHERE id = $1
            `, [customerId]);

            if (customerResult.rows.length === 0) {
                throw new Error('Customer not found');
            }

            const customer = customerResult.rows[0];

            // Get unpaid invoices
            const invoicesResult = await query(`
                SELECT id, invoice_number, amount, due_date, status, invoice_type, created_at
                FROM invoices
                WHERE customer_id = $1 AND status = 'unpaid'
                ORDER BY created_at DESC
            `, [customerId]);

            // Get payment history
            const paymentsResult = await query(`
                SELECT p.amount, p.payment_date, p.payment_method, i.invoice_number
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                WHERE i.customer_id = $1
                ORDER BY p.payment_date DESC
                LIMIT 10
            `, [customerId]);

            return {
                customer,
                unpaidInvoices: invoicesResult.rows,
                paymentHistory: paymentsResult.rows,
                trialInfo: {
                    active: customer.trial_active,
                    expiresAt: customer.trial_expires_at,
                    minutesLeft: customer.trial_active ?
                        Math.max(0, Math.floor((new Date(customer.trial_expires_at) - new Date()) / (1000 * 60))) : 0
                }
            };

        } catch (error) {
            logger.error('Error getting customer billing info:', error);
            throw error;
        }
    }

    /**
     * Send trial expired notification (placeholder)
     */
    async sendTrialExpiredNotification(customer) {
        // Implement your WhatsApp/Email notification here
        logger.info(`Trial expired notification sent to ${customer.phone}`);
    }

    /**
     * Suspend customer in RADIUS (placeholder)
     */
    async suspendCustomer(customer) {
        // Implement RADIUS suspension here
        logger.info(`Customer ${customer.pppoe_username} suspended in RADIUS`);
    }

    /**
     * Activate customer in RADIUS (placeholder)
     */
    async activateCustomer(customer) {
        // Implement RADIUS activation here
        logger.info(`Customer ${customer.pppoe_username} activated in RADIUS`);
    }
}

module.exports = new BillingService();