const { query, getOne } = require('./database');
const { logger } = require('./logger');
const billingService = require('../services/billing-service');
const BillingCycleService = require('./billing-cycle-service');

class ActivationService {
    async activateCustomer(customerId, activatedBy = 'admin') {
        // 1. Get current service & customer data
        const serviceResult = await getOne(`
            SELECT s.*, s.billing_type, c.name as customer_name, c.phone, s.status as customer_status
            FROM services s
            JOIN customers c ON c.id = s.customer_id
            WHERE s.customer_id = $1
            ORDER BY s.created_at DESC
            LIMIT 1
        `, [customerId]);

        if (!serviceResult) throw new Error('Service not found');
        if (serviceResult.status === 'active') {
            logger.warn(`Customer ${customerId} already active, skipping activation`);
            return { customerId, alreadyActive: true };
        }

        const billingType = serviceResult.billing_type || 'postpaid';
        const siklus = serviceResult.siklus || 'profile';

        // 2. Calculate dates
        const activeDate = new Date();
        let isolirDate = await BillingCycleService.calculateIsolirDate(
            customerId, activeDate, null, siklus
        );

        // Prepaid: isolir_date = active_date (trial handles suspension within 30 min)
        if (billingType === 'prepaid') {
            isolirDate = new Date(activeDate);
        }

        // 3. Update services table
        await query(`
            UPDATE services
            SET status = 'active',
                active_date = $1,
                isolir_date = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [activeDate, isolirDate, serviceResult.id]);

        // 4. Create invoice
        let invoice = null;
        try {
            invoice = await billingService.createCustomerInvoice(
                customerId, serviceResult.package_id, billingType, serviceResult.service_number
            );
        } catch (e) {
            logger.error(`Failed to create installation invoice for ${customerId}:`, e);
        }

        // 5. Send installation completed notification
        try {
            const whatsappNotifications = require('./whatsapp-notifications');
            const pkg = await getOne(
                'SELECT name, speed FROM packages WHERE id = $1',
                [serviceResult.package_id]
            );

            await whatsappNotifications.sendInstallationCompletedCustomerNotification(
                serviceResult.phone,
                {
                    customer_id: customerId,
                    customer_name: serviceResult.customer_name,
                    package_name: pkg ? pkg.name : '',
                    package_speed: pkg ? pkg.speed : '',
                    username: serviceResult.pppoe_username || '',
                    wifi_password: serviceResult.wifi_password || ''
                }
            );

            // 6. If invoice created, send invoice notification
            if (invoice) {
                await whatsappNotifications.sendInvoiceCreatedNotificationWithDetails(
                    customerId, invoice.id
                );
            }
        } catch (e) {
            logger.error(`Failed to send activation notifications for ${customerId}:`, e.message);
        }

        // 7. If prepaid, set trial timer (non-blocking)
        if (billingType === 'prepaid') {
            try {
                await this.setPrepaidTrial(customerId, invoice, serviceResult.id);
            } catch (e) {
                logger.warn(`Prepaid trial setup failed for ${customerId}: ${e.message}`);
            }
        }

        logger.info(`Customer ${customerId} activated by ${activatedBy} (${billingType})`);
        return { customerId, billingType, invoice, alreadyActive: false };
    }

    async setPrepaidTrial(customerId, invoice, serviceId) {
        const trialExpires = new Date();
        trialExpires.setMinutes(trialExpires.getMinutes() + 30);

        await query(`
            UPDATE services
            SET trial_active = true,
                trial_expires_at = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [trialExpires, serviceId]);

        logger.info(`Prepaid trial set for service ${serviceId}, expires at ${trialExpires.toISOString()}`);
    }
}

module.exports = new ActivationService();
