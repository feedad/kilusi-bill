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
                SELECT billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day
                FROM billing_settings
                LIMIT 1
            `);

            if (!settings) {
                // Return default settings if none exist
                this.billingSettings = {
                    billing_cycle_type: 'profile',
                    invoice_advance_days: 5,
                    profile_default_period: 30,
                    fixed_day: 1
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
                fixed_day: 1
            };
        }
    }

    /**
     * Get customer's billing cycle type (override or system default)
     * Now checks the services table.
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
                return result.siklus;
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
    async calculateIsolirDate(customerId, activeDate, profilePeriod = null) {
        try {
            const billingCycle = await this.getCustomerBillingCycle(customerId);
            const settings = await this.getBillingSettings();

            switch (billingCycle) {
                case 'profile':
                    return this.calculateProfileIsolirDate(activeDate, profilePeriod || settings.profile_default_period);

                case 'fixed':
                    return this.calculateFixedIsolirDate(activeDate, settings.fixed_day);

                case 'monthly':
                    return this.calculateMonthlyIsolirDate(activeDate);

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
        const isolirDate = new Date(activeDate);

        // Move to next month
        isolirDate.setMonth(isolirDate.getMonth() + 1);

        // Set to the specified day, adjusting for month length
        const lastDayOfMonth = new Date(isolirDate.getFullYear(), isolirDate.getMonth() + 1, 0).getDate();
        isolirDate.setDate(Math.min(fixedDay, lastDayOfMonth));

        return isolirDate;
    }

    /**
     * Calculate isolir date for MONTHLY cycle
     * isolir_date = 20th of next month
     */
    calculateMonthlyIsolirDate(activeDate) {
        const isolirDate = new Date(activeDate);

        // Move to next month
        isolirDate.setMonth(isolirDate.getMonth() + 1);

        // Set to 20th day
        isolirDate.setDate(20);

        return isolirDate;
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
                    nextIsolirDate = this.calculateFixedIsolirDate(periodStart, settings.fixed_day);
                    break;

                case 'monthly':
                    nextIsolirDate = this.calculateMonthlyIsolirDate(periodStart);
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
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [
                newSettings.billing_cycle_type,
                newSettings.invoice_advance_days,
                newSettings.profile_default_period,
                newSettings.fixed_day
            ]);

            if (result.rows.length === 0) {
                // Insert if no existing settings
                const insertResult = await query(`
                    INSERT INTO billing_settings (
                        billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day
                    ) VALUES ($1, $2, $3, $4)
                    RETURNING *
                `, [
                    newSettings.billing_cycle_type,
                    newSettings.invoice_advance_days,
                    newSettings.profile_default_period,
                    newSettings.fixed_day
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