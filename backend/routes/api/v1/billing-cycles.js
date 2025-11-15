const express = require('express');
const router = express.Router();
const billingCycleService = require('../../../config/billing-cycle-service');
const { query } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// GET /api/v1/billing-cycles/settings - Get current billing settings
router.get('/settings', async (req, res) => {
    try {
        const settings = await billingCycleService.getBillingSettings();

        res.json({
            success: true,
            data: {
                settings
            }
        });
    } catch (error) {
        logger.error('Error getting billing settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil pengaturan billing cycle'
        });
    }
});

// PUT /api/v1/billing-cycles/settings - Update billing settings
router.put('/settings', async (req, res) => {
    try {
        const {
            billing_cycle_type,
            invoice_advance_days,
            profile_default_period,
            fixed_day
        } = req.body;

        // Validation
        if (!billing_cycle_type || !['profile', 'fixed', 'monthly'].includes(billing_cycle_type)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe billing cycle harus diisi (profile, fixed, atau monthly)'
            });
        }

        if (!invoice_advance_days || invoice_advance_days < 1 || invoice_advance_days > 30) {
            return res.status(400).json({
                success: false,
                message: 'Invoice advance days harus antara 1-30 hari'
            });
        }

        if (!profile_default_period || profile_default_period < 1 || profile_default_period > 365) {
            return res.status(400).json({
                success: false,
                message: 'Profile default period harus antara 1-365 hari'
            });
        }

        if (!fixed_day || fixed_day < 1 || fixed_day > 28) {
            return res.status(400).json({
                success: false,
                message: 'Fixed day harus antara 1-28 (untuk menghindari masalah bulan pendek)'
            });
        }

        const updatedSettings = await billingCycleService.updateBillingSettings({
            billing_cycle_type,
            invoice_advance_days,
            profile_default_period,
            fixed_day
        });

        res.json({
            success: true,
            data: {
                settings: updatedSettings
            },
            message: 'Pengaturan billing cycle berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating billing settings:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui pengaturan billing cycle'
        });
    }
});

// GET /api/v1/billing-cycles/customer/:customerId - Get customer's billing cycle info
router.get('/customer/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;

        // Validate customer exists
        const customer = await query(
            'SELECT id, name, siklus, active_date, isolir_date FROM customers WHERE id = $1',
            [customerId]
        );

        if (customer.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        const billingCycle = await billingCycleService.getCustomerBillingCycle(customerId);

        res.json({
            success: true,
            data: {
                customer_id: customerId,
                billing_cycle: billingCycle,
                siklus: customer.rows[0].siklus,
                active_date: customer.rows[0].active_date,
                isolir_date: customer.rows[0].isolir_date
            }
        });
    } catch (error) {
        logger.error('Error getting customer billing cycle:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil billing cycle pelanggan'
        });
    }
});

// PUT /api/v1/billing-cycles/customer/:customerId - Update customer's billing cycle override
router.put('/customer/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { siklus } = req.body;

        // Validate billing cycle type
        if (!siklus || !['profile', 'fixed', 'monthly'].includes(siklus)) {
            return res.status(400).json({
                success: false,
                message: 'Siklus billing harus salah satu dari: profile, fixed, monthly'
            });
        }

        // Check if customer exists
        const customerCheck = await query('SELECT id FROM customers WHERE id = $1', [customerId]);

        if (customerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        // Update customer's siklus
        await query(`
            UPDATE customers
            SET siklus = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [siklus, customerId]);

        // Recalculate billing dates for this customer
        const updatedDates = await billingCycleService.updateCustomerBillingDates(customerId);

        res.json({
            success: true,
            data: {
                customer_id: customerId,
                siklus,
                ...updatedDates
            },
            message: 'Siklus billing pelanggan berhasil diperbarui'
        });

    } catch (error) {
        logger.error('Error updating customer billing cycle:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui siklus billing pelanggan'
        });
    }
});

// POST /api/v1/billing-cycles/customer/:customerId/calculate - Calculate billing dates for customer
router.post('/customer/:customerId/calculate', async (req, res) => {
    try {
        const { customerId } = req.params;
        const { active_date, profile_period } = req.body;

        // Validate customer exists
        const customerCheck = await query('SELECT id FROM customers WHERE id = $1', [customerId]);

        if (customerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pelanggan tidak ditemukan'
            });
        }

        const billingCycle = await billingCycleService.getCustomerBillingCycle(customerId);
        const dateToUse = active_date ? new Date(active_date) : new Date();

        const isolirDate = await billingCycleService.calculateIsolirDate(
            customerId,
            dateToUse,
            profile_period
        );

        const invoiceDate = await billingCycleService.calculateInvoiceDate(isolirDate, billingCycle);

        res.json({
            success: true,
            data: {
                customer_id: customerId,
                billing_cycle: billingCycle,
                active_date: dateToUse,
                isolir_date: isolirDate,
                invoice_date: invoiceDate,
                days_until_isolir: Math.ceil((isolirDate - new Date()) / (1000 * 60 * 60 * 24))
            }
        });

    } catch (error) {
        logger.error('Error calculating billing dates:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghitung tanggal billing'
        });
    }
});

// POST /api/v1/billing-cycles/recalculate-all - Recalculate billing dates for all customers
router.post('/recalculate-all', async (req, res) => {
    try {
        const result = await billingCycleService.recalculateAllCustomerBillingDates();

        res.json({
            success: true,
            data: result,
            message: `Perhitungan ulang tanggal billing selesai. Berhasil: ${result.successful_updates}, Gagal: ${result.failed_updates}`
        });

    } catch (error) {
        logger.error('Error recalculating all billing dates:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghitung ulang tanggal billing semua pelanggan'
        });
    }
});

// GET /api/v1/billing-cycles/simulation - Simulate billing cycles for different types
router.get('/simulation', async (req, res) => {
    try {
        const { active_date, profile_period = 30, fixed_day = 1 } = req.query;

        const baseDate = active_date ? new Date(active_date) : new Date();
        const settings = await billingCycleService.getBillingSettings();

        // Simulate for all three billing cycle types
        const simulations = {};

        // Profile Cycle
        const profileIsolir = billingCycleService.calculateProfileIsolirDate(baseDate, profile_period);
        const profileInvoice = await billingCycleService.calculateInvoiceDate(profileIsolir, 'profile');

        simulations.profile = {
            isolir_date: profileIsolir,
            invoice_date: profileInvoice,
            days_until_isolir: Math.ceil((profileIsolir - new Date()) / (1000 * 60 * 60 * 24))
        };

        // Fixed Cycle
        const fixedIsolir = billingCycleService.calculateFixedIsolirDate(baseDate, fixed_day);
        const fixedInvoice = await billingCycleService.calculateInvoiceDate(fixedIsolir, 'fixed');

        simulations.fixed = {
            isolir_date: fixedIsolir,
            invoice_date: fixedInvoice,
            days_until_isolir: Math.ceil((fixedIsolir - new Date()) / (1000 * 60 * 60 * 24))
        };

        // Monthly Cycle
        const monthlyIsolir = billingCycleService.calculateMonthlyIsolirDate(baseDate);
        const monthlyInvoice = await billingCycleService.calculateInvoiceDate(monthlyIsolir, 'monthly');

        simulations.monthly = {
            isolir_date: monthlyIsolir,
            invoice_date: monthlyInvoice,
            days_until_isolir: Math.ceil((monthlyIsolir - new Date()) / (1000 * 60 * 60 * 24))
        };

        res.json({
            success: true,
            data: {
                base_date: baseDate,
                profile_period: parseInt(profile_period),
                fixed_day: parseInt(fixed_day),
                current_settings: settings,
                simulations
            }
        });

    } catch (error) {
        logger.error('Error simulating billing cycles:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mensimulasikan billing cycles'
        });
    }
});

// GET /api/v1/billing-cycles/summary - Get billing cycle summary for all customers
router.get('/summary', async (req, res) => {
    try {
        const settings = await billingCycleService.getBillingSettings();

        // Get customer distribution by billing cycle
        const distribution = await query(`
            SELECT
                COALESCE(c.siklus, bs.billing_cycle_type) as billing_cycle_type,
                COUNT(*) as customer_count,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM customers), 2) as percentage
            FROM customers c
            CROSS JOIN (SELECT billing_cycle_type FROM billing_settings LIMIT 1) bs
            GROUP BY COALESCE(c.siklus, bs.billing_cycle_type)
            ORDER BY customer_count DESC
        `);

        // Get upcoming invoice dates (next 30 days)
        const upcomingInvoices = await query(`
            SELECT
                c.id,
                c.name,
                c.isolir_date,
                COALESCE(c.siklus, bs.billing_cycle_type) as billing_cycle_type,
                CASE
                    WHEN COALESCE(c.siklus, bs.billing_cycle_type) = 'monthly' THEN
                        DATE_TRUNC('month', c.isolir_date)::date
                    ELSE
                        (c.isolir_date - INTERVAL '1 day' * bs.invoice_advance_days)::date
                END as next_invoice_date
            FROM customers c
            CROSS JOIN (SELECT billing_cycle_type, invoice_advance_days FROM billing_settings LIMIT 1) bs
            WHERE c.isolir_date > CURRENT_DATE
            ORDER BY next_invoice_date ASC
            LIMIT 20
        `);

        // Get overdue customers
        const overdueCustomers = await query(`
            SELECT
                c.id,
                c.name,
                c.isolir_date,
                COALESCE(c.siklus, bs.billing_cycle_type) as billing_cycle_type,
                (CURRENT_DATE - c.isolir_date) as days_overdue
            FROM customers c
            CROSS JOIN (SELECT billing_cycle_type FROM billing_settings LIMIT 1) bs
            WHERE c.isolir_date < CURRENT_DATE
            ORDER BY days_overdue DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: {
                current_settings: settings,
                distribution: distribution.rows,
                upcoming_invoices: upcomingInvoices.rows,
                overdue_customers: overdueCustomers.rows
            }
        });

    } catch (error) {
        logger.error('Error getting billing cycle summary:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil ringkasan billing cycle'
        });
    }
});

module.exports = router;