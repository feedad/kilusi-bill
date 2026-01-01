const express = require('express');
const router = express.Router();
const billingCycleService = require('../../../config/billing-cycle-service');

// GET /api/v1/billing-cycles/simulation - Simulate billing cycles for different types (public endpoint)
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
        console.error('Error simulating billing cycles:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mensimulasikan billing cycles'
        });
    }
});

module.exports = router;