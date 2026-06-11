/**
 * Cron Catch-Up Route
 * GET /api/v1/billing/cron-catchup
 * 
 * Dipanggil oleh MikroTik watchdog setiap 10 menit.
 * Mengecek dan menjalankan cron job yang mungkin terlewat:
 *   - Invoice generation (07:00)
 *   - Due date reminder (09:00)
 *   - Service suspension (23:59)
 */
const express = require('express');
const router = express.Router();
const localIpOnly = require('../../../middleware/localIpOnly');

router.get('/', localIpOnly, async (req, res) => {
    try {
        const scheduler = require('../../../config/scheduler');
        const BillingCycleService = require('../../../config/billing-cycle-service');
        const settings = await BillingCycleService.getBillingSettings();

        const result = {};

        // Invoice catch-up
        if (scheduler.hasTimePassed(settings.invoice_time)) {
            result.invoices = await scheduler.startupCatchUpInvoices();
        } else {
            result.invoices = { skipped: true, reason: 'Belum waktu invoice' };
        }

        // Reminder catch-up
        if (scheduler.hasTimePassed(settings.reminder_time)) {
            result.reminders = await scheduler.startupCatchUpReminders();
        } else {
            result.reminders = { skipped: true, reason: 'Belum waktu reminder' };
        }

        // Suspension catch-up
        if (scheduler.hasTimePassed(settings.suspension_time)) {
            result.suspensions = await scheduler.startupCatchUpSuspensions();
        } else {
            result.suspensions = { skipped: true, reason: 'Belum waktu suspension' };
        }

        const summary = [];
        if (result.invoices?.created)       summary.push(`invoice=${result.invoices.created}`);
        if (result.invoices?.reason)         summary.push(`invoice=skip(${result.invoices.reason})`);
        if (result.reminders?.sent)          summary.push(`reminder=${result.reminders.sent}`);
        if (result.reminders?.reason)        summary.push(`reminder=skip(${result.reminders.reason})`);
        if (result.suspensions?.suspended)   summary.push(`suspension=${result.suspensions.suspended}`);
        if (result.suspensions?.reason)      summary.push(`suspension=skip(${result.suspensions.reason})`);

        res.json({
            success: true,
            message: summary.join(', ') || 'Semua cron OK',
            data: result
        });
    } catch (error) {
        console.error('[CronCatchup] Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
