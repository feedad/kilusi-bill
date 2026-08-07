/**
 * Billing Cycle Calculation Service
 * Handles all billing cycle logic for calculating isolir dates, invoice dates, and billing periods
 */

const { query, getOne } = require('./database');
const { logger } = require('./logger');

class BillingCycleService {
    constructor() {
        // Cache billing settings to reduce database queries
        this.billingSettings = null;
        this.lastSettingsFetch = 0;
        this.settingsCacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get current billing settings (with caching)
     */
    async getBillingSettings() {
        const now = Date.now();

        // Return cached settings if still valid
        if (this.billingSettings && (now - this.lastSettingsFetch) < this.settingsCacheTimeout) {
            return this.billingSettings;
        }

        try {
            const settings = await getOne(`
                SELECT billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day, monthly_due_date, reconnection_method, suspension_time, invoice_time, reminder_time
                FROM billing_settings
                LIMIT 1
            `);

            if (!settings) {
                // Return default settings if none exist
                this.billingSettings = {
                    billing_cycle_type: 'profile',
                    invoice_advance_days: 5,
                    profile_default_period: 30,
                    fixed_day: 1,
                    monthly_due_date: 20,
                    reconnection_method: 'payment_date',
                    suspension_time: '10:00'
                };
            } else {
                this.billingSettings = settings;
            }

            this.lastSettingsFetch = now;
            return this.billingSettings;
        } catch (error) {
            logger.error('Error getting billing settings:', error);
            // Return default settings on error
            return {
                billing_cycle_type: 'profile',
                invoice_advance_days: 5,
                profile_default_period: 30,
                fixed_day: 1,
                monthly_due_date: 20,
                reconnection_method: 'payment_date',
                suspension_time: '10:00'
            };
        }
    }

    /**
     * Get customer's billing cycle type (override or system default)
     * Now checks the services table.
     * Maps Indonesian cycle names (TETAP, BULANAN) to internal types (profile, monthly)
     */
    async getCustomerBillingCycle(customerId, serviceId = null) {
        try {
            let result;
            if (serviceId) {
                result = await getOne(`
                    SELECT siklus
                    FROM services
                    WHERE id = $1
                `, [serviceId]);
            } else {
                // Fallback: pick the most recent service for this customer
                result = await getOne(`
                    SELECT siklus
                    FROM services
                    WHERE customer_id = $1
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [customerId]);
            }

            if (result && result.siklus) {
                const dbCycle = result.siklus;
                // Map Indonesian billing cycle names to internal types
                const cycleMap = {
                    'TETAP': 'fixed',
                    'BULANAN': 'monthly',
                    'PROFILE': 'profile',
                    'tetap': 'fixed',
                    'bulan': 'monthly',
                    'profile': 'profile',
                    'monthly': 'monthly',
                    'fixed': 'fixed'
                };
                const mappedCycle = cycleMap[dbCycle];
                if (mappedCycle) {
                    return mappedCycle;
                }
                // If unknown cycle, log warning and return as-is
                logger.warn(`Unknown billing cycle '${dbCycle}', using as-is`);
                return dbCycle;
            }

            const settings = await this.getBillingSettings();
            return settings.billing_cycle_type;
        } catch (error) {
            logger.error('Error getting customer billing cycle:', error);
            const settings = await this.getBillingSettings();
            return settings.billing_cycle_type;
        }
    }

    /**
     * Calculate isolir date based on billing cycle
     * @param {number} customerId - Customer ID
     * @param {Date} activeDate - Active date of customer
     * @param {number} profilePeriod - Profile period in days (for profile cycle)
     * @returns {Date} Calculated isolir date
     */
    async calculateIsolirDate(customerId, activeDate, profilePeriod = null, siklus = null) {
        try {
            const rawCycle = siklus || await this.getCustomerBillingCycle(customerId);
            const cycleMap = {
                'TETAP': 'fixed', 'BULANAN': 'monthly', 'PROFILE': 'profile',
                'tetap': 'fixed', 'bulan': 'monthly', 'profile': 'profile',
                'monthly': 'monthly', 'fixed': 'fixed'
            };
            const billingCycle = cycleMap[rawCycle] || rawCycle;
            const settings = await this.getBillingSettings();

            switch (billingCycle) {
                case 'profile':
                    return this.calculateProfileIsolirDate(activeDate, profilePeriod || settings.profile_default_period);

                case 'fixed':
                    // For fixed cycle, use the day of the month from customer's active_date
                    const fixedDay = new Date(activeDate).getDate();
                    return this.calculateFixedIsolirDate(activeDate, fixedDay);

                case 'monthly':
                    return await this.calculateMonthlyIsolirDate(activeDate);

                default:
                    logger.warn(`Unknown billing cycle: ${billingCycle}, using profile as default`);
                    return this.calculateProfileIsolirDate(activeDate, profilePeriod || settings.profile_default_period);
            }
        } catch (error) {
            logger.error('Error calculating isolir date:', error);
            // Fallback to profile cycle
            const settings = await this.getBillingSettings();
            return this.calculateProfileIsolirDate(activeDate, profilePeriod || settings.profile_default_period);
        }
    }

    /**
     * Calculate isolir date for PROFILE cycle
     * isolir_date = active_date + profile_period days
     */
    calculateProfileIsolirDate(activeDate, profilePeriod) {
        const isolirDate = new Date(activeDate);
        isolirDate.setDate(isolirDate.getDate() + profilePeriod);
        return isolirDate;
    }

    /**
     * Calculate isolir date for FIXED cycle
     * isolir_date = same day every next month
     */
    calculateFixedIsolirDate(activeDate, fixedDay) {
        // Use safe month arithmetic to avoid JavaScript Date overflow
        // e.g. May 31 + 1 month → June 30 (not July 1)
        const y = activeDate.getFullYear();
        const m = activeDate.getMonth() + 1;
        const adjY = y + Math.floor(m / 12);
        const adjM = m % 12;
        const lastDayOfMonth = new Date(adjY, adjM + 1, 0).getDate();
        const day = Math.min(fixedDay, lastDayOfMonth);
        return new Date(adjY, adjM, day);
    }

    /**
     * Calculate isolir date for MONTHLY cycle
     * isolir_date = 20th of next month
     */
    async calculateMonthlyIsolirDate(activeDate) {
        const settings = await this.getBillingSettings();
        const dueDate = settings.monthly_due_date || 20;

        // Use safe month arithmetic to avoid JavaScript Date overflow
        const y = activeDate.getFullYear();
        const m = activeDate.getMonth() + 1;
        const adjY = y + Math.floor(m / 12);
        const adjM = m % 12;
        const lastDayOfMonth = new Date(adjY, adjM + 1, 0).getDate();
        return new Date(adjY, adjM, Math.min(dueDate, lastDayOfMonth));
    }

    /**
     * Calculate invoice issue date based on isolir date and billing cycle
     * @param {Date} isolirDate - Isolir date
     * @param {string} billingCycle - Billing cycle type
     * @returns {Date} Invoice issue date
     */
    async calculateInvoiceDate(isolirDate, billingCycle = null) {
        try {
            const settings = await this.getBillingSettings();

            // If no specific billing cycle provided, use system default
            const cycle = billingCycle || settings.billing_cycle_type;

            const invoiceDate = new Date(isolirDate);

            switch (cycle) {
                case 'monthly':
                    // For monthly cycle, invoice always on 1st of month
                    invoiceDate.setDate(1);
                    // If isolir is in next month, invoice should be in current month
                    if (invoiceDate > isolirDate) {
                        invoiceDate.setMonth(invoiceDate.getMonth() - 1);
                    }
                    break;

                default:
                    // For profile and fixed cycles, invoice X days before isolir
                    invoiceDate.setDate(invoiceDate.getDate() - settings.invoice_advance_days);
                    break;
            }

            return invoiceDate;
        } catch (error) {
            logger.error('Error calculating invoice date:', error);
            // Fallback: 5 days before isolir
            const invoiceDate = new Date(isolirDate);
            invoiceDate.setDate(invoiceDate.getDate() - 5);
            return invoiceDate;
        }
    }

    /**
     * Calculate next billing period for a customer
     * @param {number} customerId - Customer ID
     * @param {Date} currentIsolirDate - Current isolir date
     * @param {number} profilePeriod - Profile period (for profile cycle)
     * @returns {Object} Next billing period info
     */
    async calculateNextBillingPeriod(customerId, currentIsolirDate, profilePeriod = null) {
        try {
            const billingCycle = await this.getCustomerBillingCycle(customerId);
            const settings = await this.getBillingSettings();

            let nextIsolirDate;
            let periodStart = new Date(currentIsolirDate);
            periodStart.setDate(periodStart.getDate() + 1); // Day after current isolir

            switch (billingCycle) {
                case 'profile':
                    nextIsolirDate = this.calculateProfileIsolirDate(periodStart, profilePeriod || settings.profile_default_period);
                    break;

                case 'fixed':
                    // Get customer active date to get fixed day
                    const service = await getOne(`
                        SELECT active_date
                        FROM services
                        WHERE customer_id = $1
                        ORDER BY created_at DESC
                        LIMIT 1
                    `, [customerId]);
                    const fixedDay = service && service.active_date ? new Date(service.active_date).getDate() : (settings.fixed_day || 1);
                    nextIsolirDate = this.calculateFixedIsolirDate(periodStart, fixedDay);
                    break;

                case 'monthly':
                    nextIsolirDate = await this.calculateMonthlyIsolirDate(periodStart);
                    break;

                default:
                    nextIsolirDate = this.calculateProfileIsolirDate(periodStart, profilePeriod || settings.profile_default_period);
            }

            const invoiceDate = await this.calculateInvoiceDate(nextIsolirDate, billingCycle);

            return {
                period_start: periodStart,
                isolir_date: nextIsolirDate,
                invoice_date: invoiceDate,
                billing_cycle: billingCycle,
                days_until_isolir: Math.ceil((nextIsolirDate - new Date()) / (1000 * 60 * 60 * 24))
            };
        } catch (error) {
            logger.error('Error calculating next billing period:', error);
            throw error;
        }
    }

    /**
     * Update service billing dates
     * @param {number} serviceId - Service ID
     * @returns {Object} Updated billing dates
     */
    async updateServiceBillingDates(serviceId) {
        try {
            // Get service data
            const service = await getOne(`
                SELECT s.active_date, s.customer_id
                FROM services s
                WHERE s.id = $1
            `, [serviceId]);

            if (!service || !service.active_date) {
                throw new Error('Service or active date not found');
            }

            // Get billing settings for profile period
            const settings = await this.getBillingSettings();

            // Calculate isolir date
            const isolirDate = await this.calculateIsolirDate(
                service.customer_id,
                service.active_date,
                settings.profile_default_period
            );

            // Calculate invoice date
            const billingCycle = await this.getCustomerBillingCycle(service.customer_id, serviceId);
            const invoiceDate = await this.calculateInvoiceDate(isolirDate, billingCycle);

            // Update service record
            await query(`
                UPDATE services
                SET isolir_date = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [isolirDate, serviceId]);

            return {
                service_id: serviceId,
                customer_id: service.customer_id,
                active_date: service.active_date,
                isolir_date: isolirDate,
                invoice_date: invoiceDate,
                billing_cycle: billingCycle
            };
        } catch (error) {
            logger.error('Error updating service billing dates:', error);
            throw error;
        }
    }

    /**
     * Compatibility method for legacy customer-based updates
     * Updates the most recent service for a customer
     */
    async updateCustomerBillingDates(customerId) {
        const service = await getOne(`
            SELECT id FROM services WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [customerId]);

        if (!service) throw new Error('No services found for customer');
        return this.updateServiceBillingDates(service.id);
    }

    /**
     * Update billing settings
     * @param {Object} newSettings - New billing settings
     * @returns {Object} Updated settings
     */
    async updateBillingSettings(newSettings) {
        try {
            // Clear cache to force refresh
            this.billingSettings = null;
            this.lastSettingsFetch = 0;

            const result = await query(`
                UPDATE billing_settings
                SET billing_cycle_type = $1,
                    invoice_advance_days = $2,
                    profile_default_period = $3,
                    fixed_day = $4,
                    monthly_due_date = $5,
                    reconnection_method = $6,
                    suspension_time = $7,
                    invoice_time = $8,
                    reminder_time = $9,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                newSettings.billing_cycle_type,
                newSettings.invoice_advance_days,
                newSettings.profile_default_period,
                newSettings.fixed_day,
                newSettings.monthly_due_date,
                newSettings.reconnection_method,
                newSettings.suspension_time,
                newSettings.invoice_time,
                newSettings.reminder_time
            ]);

            if (result.rows.length === 0) {
                // Insert if no existing settings
                const insertResult = await query(`
                    INSERT INTO billing_settings (
                        billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day, monthly_due_date, reconnection_method, suspension_time, invoice_time, reminder_time
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING *
                `, [
                    newSettings.billing_cycle_type,
                    newSettings.invoice_advance_days,
                    newSettings.profile_default_period,
                    newSettings.fixed_day,
                    newSettings.monthly_due_date,
                    newSettings.reconnection_method,
                    newSettings.suspension_time,
                    newSettings.invoice_time,
                    newSettings.reminder_time
                ]);

                return insertResult.rows[0];
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error updating billing settings:', error);
            throw error;
        }
    }

    /**
     * Update service active_date and isolir_date after payment
     * This should be called whenever an invoice is marked as paid
     */
    async updateServiceDatesAfterPayment(invoiceId, paymentDate = null) {
        try {
            // Get invoice, service, and ACTUAL payment date from payments table
            const result = await query(`
                SELECT
                    i.id as invoice_id,
                    i.customer_id,
                    i.service_number,
                    i.due_date,
                    COALESCE(p.payment_date, i.payment_date) as payment_date,
                    i.package_id,
                    s.id as service_id,
                    s.siklus,
                    s.billing_type,
                    s.status as service_status,
                    s.active_date as prev_active_date,
                    s.isolir_date as prev_isolir_date
                FROM invoices i
                LEFT JOIN services s ON s.service_number = i.service_number
                LEFT JOIN LATERAL (
                    SELECT payment_date
                    FROM payments
                    WHERE invoice_id = i.id AND is_rolled_back = FALSE
                    ORDER BY created_at DESC
                    LIMIT 1
                ) p ON true
                WHERE i.id = $1
            `, [invoiceId]);

            if (result.rows.length === 0) {
                logger.warn(`[UPDATE_DATES] No invoice found with id ${invoiceId}`);
                return null;
            }

            const invoice = result.rows[0];

            // Skip if no service found
            if (!invoice.service_id) {
                logger.warn(`[UPDATE_DATES] No service found for invoice ${invoiceId}`);
                return null;
            }

            // Use provided payment_date or payment_date from payments table
            const actualPaymentDate = paymentDate || invoice.payment_date;
            if (!actualPaymentDate) {
                logger.warn(`[UPDATE_DATES] No payment date available for invoice ${invoiceId}`);
                return null;
            }

            // Get billing settings
            const settings = await this.getBillingSettings();
            const method = settings.reconnection_method || 'payment_date';

            // Only update if reconnection method is 'payment_date'
            if (method !== 'payment_date') {
                logger.info(`[UPDATE_DATES] Reconnection method is '${method}', skipping date update`);
                return null;
            }

            // Guard: skip date update ONLY if service already has isolir_date more than 45 days in future (already advanced for multiple cycles)
            if (invoice.service_id) {
                const svcCheck_ = await query(`SELECT isolir_date FROM services WHERE id = $1`, [invoice.service_id]);
                if (svcCheck_.rows.length > 0 && svcCheck_.rows[0].isolir_date) {
                    const currentIsolir_ = new Date(svcCheck_.rows[0].isolir_date);
                    const limitDate = new Date();
                    limitDate.setDate(limitDate.getDate() + 45);
                    if (currentIsolir_ > limitDate) {
                        const isoStr_ = `${currentIsolir_.getFullYear()}-${String(currentIsolir_.getMonth() + 1).padStart(2, '0')}-${String(currentIsolir_.getDate()).padStart(2, '0')}`;
                        logger.info(`[UPDATE_DATES] Service ${invoice.service_id} already has far future isolir_date (${isoStr_}). Skipping date update.`);
                        return { newActiveDate: null, newIsolirDate: null, skipped: true };
                    }
                }
            }

            const dueDate = new Date(invoice.due_date);
            const payDate = new Date(actualPaymentDate);

            // Calculate new active_date
            let newActiveDate;
            if (payDate <= dueDate) {
                newActiveDate = dueDate; // Bayar sebelum/sama due date
            } else {
                newActiveDate = payDate; // Bayar setelah due date
            }

            // Get billing cycle and calculate isolir_date
            const dbCycle = invoice.siklus || settings.billing_cycle_type;
            const cycleMap = {
                'TETAP': 'fixed',
                'BULANAN': 'monthly',
                'PROFILE': 'profile',
                'tetap': 'fixed',
                'bulan': 'monthly',
                'profile': 'profile',
                'monthly': 'monthly',
                'fixed': 'fixed'
            };
            const cycle = cycleMap[dbCycle] || settings.billing_cycle_type;

            let newIsolirDate;
            if (cycle === 'profile') {
                const period = settings.profile_default_period || 30;
                newIsolirDate = new Date(newActiveDate);
                newIsolirDate.setDate(newIsolirDate.getDate() + period);
            } else if (cycle === 'monthly') {
                // Use safe month arithmetic to avoid JavaScript Date overflow
                const y = newActiveDate.getFullYear();
                const m = newActiveDate.getMonth() + 1;
                const adjY = y + Math.floor(m / 12);
                const adjM = m % 12;
                const dueDay = settings.monthly_due_date || 20;
                const lastDay = new Date(adjY, adjM + 1, 0).getDate();
                newIsolirDate = new Date(adjY, adjM, Math.min(dueDay, lastDay));
            } else if (cycle === 'fixed') {
                // Use safe month arithmetic to avoid JavaScript Date overflow
                const y = newActiveDate.getFullYear();
                const m = newActiveDate.getMonth() + 1;
                const adjY = y + Math.floor(m / 12);
                const adjM = m % 12;
                const lastDay = new Date(adjY, adjM + 1, 0).getDate();
                const fixedDay = newActiveDate.getDate();
                newIsolirDate = new Date(adjY, adjM, Math.min(fixedDay, lastDay));
            }

            // Update service dates
            await query(`
                UPDATE services
                SET active_date = $1,
                    isolir_date = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [newActiveDate, newIsolirDate, invoice.service_id]);

            // Save previous dates to payments table for rollback purposes
            if (invoice.prev_active_date || invoice.prev_isolir_date) {
                await query(`
                    UPDATE payments
                    SET previous_active_date = $1,
                        previous_isolir_date = $2
                    WHERE invoice_id = $3 AND is_rolled_back = FALSE
                `, [invoice.prev_active_date, invoice.prev_isolir_date, invoiceId]);
            }

            logger.info(`✅ [UPDATE_DATES] Service ${invoice.service_id} dates updated: active_date=${newActiveDate.toISOString().split('T')[0]}, isolir_date=${newIsolirDate.toISOString().split('T')[0]} (cycle: ${dbCycle})`);
            return { newActiveDate, newIsolirDate, previousActiveDate: invoice.prev_active_date, previousIsolirDate: invoice.prev_isolir_date };

        } catch (error) {
            logger.error('[UPDATE_DATES] Error updating service dates after payment:', error);
        }
    }

    /**
     * Recalculate billing dates for all customers
     * Use this when billing settings change
     */
    async recalculateAllCustomerBillingDates() {
        try {
            // Get all customers with active dates
            const customers = await query(`
                SELECT c.id, c.active_date
                FROM customers c
                WHERE c.active_date IS NOT NULL
            `);

            const results = [];
            for (const customer of customers.rows) {
                try {
                    const updatedDates = await this.updateCustomerBillingDates(customer.id);
                    results.push({
                        success: true,
                        customer_id: customer.id,
                        ...updatedDates
                    });
                } catch (error) {
                    logger.error(`Error updating billing dates for customer ${customer.id}:`, error);
                    results.push({
                        success: false,
                        customer_id: customer.id,
                        error: error.message
                    });
                }
            }

            return {
                total_customers: customers.rows.length,
                successful_updates: results.filter(r => r.success).length,
                failed_updates: results.filter(r => !r.success).length,
                results: results
            };
        } catch (error) {
            logger.error('Error recalculating all customer billing dates:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new BillingCycleService();