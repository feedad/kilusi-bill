const cron = require('node-cron');
const path = require('path');
const billingManager = require('./billing');
const logger = require('./logger');

const formatDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

class InvoiceScheduler {
    constructor() {
        this.tasks = {
            invoice: null,
            reminder: null,
            suspension: null
        };
        this.initScheduler();
    }

    initScheduler() {
        // All dynamic times loaded from billing_settings via rescheduleDynamicJobs()
        this.rescheduleDynamicJobs();

        // Startup catch-up — jalankan jika ada cron job yang terlewat
        this.runStartupCatchUp().catch(err => logger.error('[StartupCatchUp] Error:', err));

        // 4. RADIUS orphan cleanup - once daily at 03:00
        cron.schedule('0 3 * * *', async () => {
            try {
                logger.info('Starting RADIUS orphan cleanup...');
                const radiusDb = require('./radius-postgres');
                const { query } = require('./database');
                
                // Get all active PPPoE usernames from radcheck
                const activeUsers = await query(`
                    SELECT username FROM radcheck WHERE username IS NOT NULL
                `);
                const activeUsernames = new Set(activeUsers.rows.map(r => r.username));
                
                // Find orphans in radusergroup
                const radusergroupUsers = await query(`SELECT DISTINCT username FROM radusergroup`);
                let cleaned = 0;
                for (const row of radusergroupUsers.rows) {
                    if (!activeUsernames.has(row.username)) {
                        await radiusDb.deleteRadiusUser(row.username);
                        cleaned++;
                        logger.info(`Cleaned orphan RADIUS user: ${row.username}`);
                    }
                }
                logger.info(`RADIUS orphan cleanup completed: ${cleaned} removed`);
            } catch (error) {
                logger.error('Error in RADIUS orphan cleanup:', error);
            }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('RADIUS orphan cleanup scheduler initialized - runs daily at 03:00');

        // 4b. RADIUS session recovery every 1 hour
        // Reopens sessions stopped by FreeRADIUS restart (no CoA, no disconnect)
        cron.schedule('0 * * * *', async () => {
            try {
                const radiusSync = require('./radius-sync');
                await radiusSync.reopenStoppedSessions();
            } catch (error) {
                logger.error('Error in RADIUS session recovery:', error);
            }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('RADIUS session recovery scheduler initialized - runs every hour');

        // 4c. Customer usage poller every 1 minute
        cron.schedule('* * * * *', async () => {
            try {
                const poller = require('./customer-usage-poller');
                await poller.pollCustomerUsage();
            } catch (error) {
                logger.error('Error in customer usage poller:', error);
            }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('Customer usage poller scheduler initialized - runs every minute');

        // 4d. OLT signal cache poller — every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            try {
                const poller = require('./olt-signal-poller');
                await poller.pollOltSignal();
            } catch (error) {
                logger.error('Error in OLT signal poller:', error);
            }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('OLT signal cache poller initialized - runs every 5 minutes');

        // 5. Voucher usage check every 1 minute
        cron.schedule('* * * * *', async () => {
            try { await this.checkVoucherUsage(); } 
            catch (error) { logger.error('Error in voucher usage check:', error); }
            try { await this.checkPrepaidTrialExpiry(); }
            catch (error) { logger.error('Error in prepaid trial check:', error); }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('Voucher usage update scheduler initialized');

        // 6. GenieACS customer sync every 1 hour
        cron.schedule('0 * * * *', async () => {
            try {
                const { exec } = require('child_process');
                const scriptPath = path.join(__dirname, '../sync-acs-customers.js');
                exec(`node ${scriptPath}`, (error) => {
                    if (error) logger.error('Error in GenieACS customer sync:', error);
                });
            } catch (error) { logger.error('Error in GenieACS customer sync:', error); }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('GenieACS customer sync scheduler initialized');

        // 7. WhatsApp Meta template status sync every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            try {
                const whatsappNotifications = require('./whatsapp-notifications');
                await whatsappNotifications.syncMetaTemplateStatus();
            } catch (error) {
                logger.error('Error in Meta template status sync:', error);
            }
        }, { scheduled: true, timezone: "Asia/Jakarta" });
        logger.info('Meta template status sync scheduler initialized (every 30 min)');
    }

    // ───────────── Startup Catch-Up ─────────────

    hasTimePassed(timeStr) {
        const now = new Date();
        const [h, m] = (timeStr || '07:00').split(':').map(Number);
        return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
    }

    async runStartupCatchUp() {
        try {
            const BillingCycleService = require('./billing-cycle-service');
            const settings = await BillingCycleService.getBillingSettings();

            const results = {};
            if (this.hasTimePassed(settings.invoice_time))    results.invoices    = await this.startupCatchUpInvoices();
            if (this.hasTimePassed(settings.reminder_time))   results.reminders   = await this.startupCatchUpReminders();
            if (this.hasTimePassed(settings.suspension_time)) results.suspensions = await this.startupCatchUpSuspensions();

            const summaries = [];
            if (results.invoices)    summaries.push(`invoices=${results.invoices.created}/${results.invoices.skipped}`);
            if (results.reminders)   summaries.push(`reminders=${results.reminders.sent}`);
            if (results.suspensions) summaries.push(`suspensions=${results.suspensions.suspended}`);
            if (summaries.length > 0) logger.info(`[StartupCatchUp] ${summaries.join(', ')}`);
            else                       logger.info('[StartupCatchUp] Belum lewat jam cron, skip semua');
        } catch (error) {
            logger.error('[StartupCatchUp] Error:', error);
        }
    }

    async startupCatchUpInvoices() {
        const { query } = require('./database');
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const existing = await query('SELECT COUNT(*) as cnt FROM invoices WHERE created_at >= $1', [startOfDay]);
        if (parseInt(existing.rows[0].cnt) > 0) {
            logger.info('[CatchUp] Invoice sudah tergenerate hari ini, skip');
            return { created: 0, skipped: 0 };
        }

        logger.info('[CatchUp] Invoice belum ada — menjalankan catch-up...');
        const r1 = await this.generateDailyInvoicesForFixedAndProfile();
        const r2 = await this.generateDailyInvoicesByBillingDay();
        const totalCreated = (r1?.created || 0) + (r2?.created || 0);
        logger.info(`[CatchUp] Invoice catch-up selesai: ${totalCreated} created`);
        return { created: totalCreated, skipped: (r1?.skipped || 0) + (r2?.skipped || 0) };
    }

    async startupCatchUpReminders() {
        const { query } = require('./database');
        const whatsappNotifications = require('./whatsapp-notifications');

        const invoices = await query(`
            SELECT i.id, i.invoice_number, i.customer_id, i.due_date
            FROM invoices i
            WHERE i.due_date = (CURRENT_DATE + INTERVAL '1 day')
              AND i.status IN ('unpaid', 'sent', 'overdue')
              AND (i.sent_at IS NULL OR i.sent_at < CURRENT_DATE)
        `);

        if (invoices.rows.length === 0) {
            logger.info('[CatchUp] Tidak ada reminder H-1 yang terlewat');
            return { sent: 0 };
        }

        let sent = 0;
        for (const invoice of invoices.rows) {
            try {
                await whatsappNotifications.sendDueDateReminder(invoice.id);
                await query('UPDATE invoices SET sent_at = NOW() WHERE id = $1', [invoice.id]);
                sent++;
                logger.info(`[CatchUp] Reminder sent for invoice ${invoice.invoice_number}`);
            } catch (error) {
                logger.error(`[CatchUp] Reminder failed for invoice ${invoice.invoice_number}:`, error);
            }
        }
        logger.info(`[CatchUp] Reminder catch-up selesai: ${sent} sent`);
        return { sent };
    }

    async startupCatchUpSuspensions() {
        const serviceSuspension = require('./serviceSuspension');
        logger.info('[CatchUp] Menjalankan suspension catch-up...');
        await serviceSuspension.checkAndSuspendOverdueCustomers();
        logger.info('[CatchUp] Suspension catch-up selesai');
        return { suspended: 0 };
    }

    getDynamicInvoiceExpression(settings) {
        try {
            const timeStr = settings ? settings.invoice_time : '07:00';
            const [h, m] = String(timeStr).split(':').map(Number);
            return `${Math.min(59, Math.max(0, m||0))} ${Math.min(23, Math.max(0, h||7))} * * *`;
        } catch { return '0 7 * * *'; }
    }

    getDynamicReminderExpression(settings) {
        try {
            const timeStr = settings ? settings.reminder_time : '09:00';
            const [h, m] = String(timeStr).split(':').map(Number);
            return `${Math.min(59, Math.max(0, m||0))} ${Math.min(23, Math.max(0, h||9))} * * *`;
        } catch { return '0 9 * * *'; }
    }

    // Legacy init methods removed: monthly invoice (merged), daily fixed/profile (merged), daily billing day (merged),
    // overdue update (frontend handles badge), autoSuspendCheck (moved to scheduleSuspensionCheck),
    // restore check (all payment triggers are instant), Autopay polling (webhook is instant),
    // RADIUS full sync (triggers are instant; only orphan cleanup remains)


    async checkVoucherUsage() {
        try {
            const VoucherService = require('../services/voucher-service');
            await VoucherService.checkAndUpdateExpiredVouchers();
        } catch (error) {
            logger.error('Error in voucher usage check:', error);
        }
    }

    async checkPrepaidTrialExpiry() {
        try {
            const { query } = require('./database');
            const serviceSuspension = require('./serviceSuspension');
            const expiredTrials = await query(`
                SELECT c.id, c.name, c.phone, t.pppoe_username, s.id as service_id, s.service_number
                FROM customers c
                JOIN services s ON s.customer_id = c.id
                LEFT JOIN technical_details t ON t.service_id = s.id
                WHERE s.billing_type = 'prepaid'
                  AND s.status = 'active'
                  AND s.trial_active = true
                  AND s.trial_expires_at <= NOW()
                LIMIT 20
            `);

            for (const customer of expiredTrials.rows) {
                try {
                    const unpaidInvoice = await query(`
                        SELECT id FROM invoices
                        WHERE service_number = $1 AND status = 'unpaid'
                        LIMIT 1
                    `, [customer.service_number]);

                    if (unpaidInvoice.rows.length > 0) {
                        const customerData = {
                            id: customer.id,
                            service_id: customer.service_id,
                            name: customer.name,
                            username: customer.pppoe_username,
                            pppoe_username: customer.pppoe_username,
                            status: 'active'
                        };
                        await serviceSuspension.suspendCustomerService(customerData, 'Masa trial 30 menit habis');
                        logger.info(`Prepaid trial expired for ${customer.name} (${customer.id}) - suspended`);
                    }

                    await query(`
                        UPDATE services SET trial_active = false, updated_at = NOW()
                        WHERE id = $1
                    `, [customer.service_id]);
                } catch (e) {
                    logger.error(`Error processing trial expiry for ${customer.id}:`, e.message);
                }
            }
        } catch (error) {
            logger.error('Error in prepaid trial expiry check:', error);
        }
    }

    async sendDueDateReminders() {
        try {
            const whatsappNotifications = require('./whatsapp-notifications');
            const { query } = require('./database');

            // Get invoices where due_date is tomorrow (H-1 reminder)
            const upcomingInvoices = await query(`
                SELECT i.id, i.invoice_number, i.customer_id, i.due_date, i.status
                FROM invoices i
                WHERE i.status IN ('unpaid', 'sent')
                  AND i.due_date = (CURRENT_DATE + INTERVAL '1 day')
                  AND (i.sent_at IS NULL OR i.sent_at < CURRENT_DATE)
            `);

            logger.info(`Found ${upcomingInvoices.rows.length} invoices with due_date tomorrow`);

            for (const invoice of upcomingInvoices.rows) {
                try {
                    await whatsappNotifications.sendDueDateReminder(invoice.id);
                    await query('UPDATE invoices SET sent_at = NOW() WHERE id = $1', [invoice.id]);
                    logger.info(`Due date reminder sent for invoice ${invoice.invoice_number} (due tomorrow)`);
                } catch (error) {
                    logger.error(`Error sending due date reminder for invoice ${invoice.invoice_number}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error in sendDueDateReminders:', error);
            throw error;
        }
    }

    async generateMonthlyInvoices() {
        try {
            // Get all active customers with MONTHLY billing cycle
            const { query } = require('./database');
            const BillingCycleService = require('./billing-cycle-service');

            const customersResult = await query(`
                SELECT DISTINCT c.*, s.siklus, s.id as service_id, s.service_number, s.active_date as service_active_date,
                       s.package_id as service_package_id
                FROM customers c
                JOIN services s ON s.customer_id = c.id
                WHERE s.status = 'active'
                AND s.siklus = 'monthly'
            `);

            const activeCustomers = customersResult.rows;
            logger.info(`Found ${activeCustomers.length} active customers with MONTHLY cycle for invoice generation`);

            for (const customer of activeCustomers) {
                try {
                    // Get customer's package
                    const packageData = await billingManager.getPackageById(customer.package_id);
                    if (!packageData) {
                        logger.warn(`Package not found for customer ${customer.username}`);
                        continue;
                    }

                    // Check if invoice already exists for this service this month
                    const currentDate = new Date();
                    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

                    const existingInvoice = await getOne(`
                        SELECT id FROM invoices
                        WHERE service_number = $1
                        AND created_at >= $2 AND created_at <= $3
                    `, [customer.service_number, startOfMonth, endOfMonth]);

                    if (existingInvoice) {
                        logger.info(`Invoice already exists for service ${customer.service_number} this month`);
                        continue;
                    }

                    // Set due date based on customer's billing_day (1-28), capped to month's last day
                    const billingDay = (() => {
                        const v = parseInt(customer.billing_day, 10);
                        if (Number.isFinite(v)) return Math.min(Math.max(v, 1), 28);
                        return 15;
                    })();
                    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                    const targetDay = Math.min(billingDay, lastDayOfMonth);
                    const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), targetDay);

                    // Get tax settings from customer_default_settings
                    const taxSetting = await query(`
                        SELECT default_value FROM customer_default_settings
                        WHERE field_name = 'tax_enabled' AND is_active = true
                        LIMIT 1
                    `);
                    const taxEnabled = taxSetting.rows.length > 0 ? taxSetting.rows[0].default_value === 'true' : false;

                    // Create invoice data - only apply tax if enabled
                    const basePrice = packageData.price;
                    let taxRate = 0;
                    let amountWithTax = basePrice;

                    if (taxEnabled) {
                        // Get tax percentage from settings or use package tax_rate
                        const taxPercentSetting = await query(`
                            SELECT default_value FROM customer_default_settings
                            WHERE field_name = 'tax_percentage' AND is_active = true
                            LIMIT 1
                        `);
                        const defaultTaxPercent = taxPercentSetting.rows.length > 0
                            ? parseFloat(taxPercentSetting.rows[0].default_value)
                            : 11;

                        taxRate = (packageData.tax_rate || packageData.tax_rate === 0)
                            ? Number(packageData.tax_rate)
                            : defaultTaxPercent;
                        amountWithTax = billingManager.calculatePriceWithTax(basePrice, taxRate);
                    }

                    const invoiceData = {
                        customer_id: customer.id,
                        package_id: customer.package_id,
                        service_number: customer.service_number,
                        amount: amountWithTax, // Use price with tax
                        base_amount: basePrice, // Store base price for reference
                        tax_rate: taxRate, // Store tax rate for reference
                        due_date: formatDateLocal(dueDate),
                        notes: `Tagihan bulanan ${currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
                    };

                    // Create the invoice
                    const newInvoice = await billingManager.createInvoice(invoiceData);
                    logger.info(`Created invoice ${newInvoice.invoice_number} for customer ${customer.username}`);

                    // Send WhatsApp notification for new invoice
                    try {
                        const whatsappNotifications = require('./whatsapp-notifications');
                        await whatsappNotifications.sendInvoiceCreatedNotification(customer.id, newInvoice.id);
                        logger.info(`WhatsApp notification sent for invoice ${newInvoice.invoice_number}`);
                    } catch (notifError) {
                        logger.error(`Failed to send WhatsApp notification for invoice ${newInvoice.invoice_number}:`, notifError.message);
                    }

                } catch (error) {
                    logger.error(`Error creating invoice for customer ${customer.username}:`, error);
                }
            }

        } catch (error) {
            logger.error('Error in generateMonthlyInvoices:', error);
            throw error;
        }
    }

    // Generate invoices daily for customers whose billing_day is today
    async generateDailyInvoicesByBillingDay(targetDate = null) {
        try {
            const { query } = require('./database');
            // Get all active customers
            const customers = await billingManager.getCustomers();
            const activeCustomers = customers.filter(customer =>
                customer.status === 'active' && customer.package_id
            );

            const today = targetDate ? new Date(targetDate) : new Date();
            const todayDay = today.getDate();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();

            // Compute start and end of current month for duplicate checks
            const startOfMonth = new Date(currentYear, currentMonth, 1);
            const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

            // For each active customer whose billing_day == today (capped 1-28)
            for (const customer of activeCustomers) {
                try {
                    const normalizedBillingDay = (() => {
                        const v = parseInt(customer.billing_day, 10);
                        if (Number.isFinite(v)) return Math.min(Math.max(v, 1), 28);
                        return 15;
                    })();

                    // If today matches the customer's billing day (allowing month shorter than 31)
                    if (todayDay !== normalizedBillingDay) {
                        continue;
                    }

                    // Get package
                    const packageData = await billingManager.getPackageById(customer.package_id);
                    if (!packageData) {
                        logger.warn(`Package not found for customer ${customer.username}`);
                        continue;
                    }

                    // Check if invoice already exists for this service this month
                    const existingInvoice = await getOne(`
                        SELECT id FROM invoices
                        WHERE service_number = $1
                        AND created_at >= $2 AND created_at <= $3
                    `, [customer.service_number, startOfMonth, endOfMonth]);

                    if (existingInvoice) {
                        logger.info(`Invoice already exists for service ${customer.service_number} this month (daily generator)`);
                        continue;
                    }

                    // Set due date to today's date (which equals billing_day)
                    const dueDate = formatDateLocal(new Date(currentYear, currentMonth, normalizedBillingDay));

                    // Get tax settings from customer_default_settings
                    const taxSetting = await query(`
                        SELECT default_value FROM customer_default_settings
                        WHERE field_name = 'tax_enabled' AND is_active = true
                        LIMIT 1
                    `);
                    const taxEnabled = taxSetting.rows.length > 0 ? taxSetting.rows[0].default_value === 'true' : false;

                    // Calculate amount - only apply tax if enabled
                    const basePrice = packageData.price;
                    let taxRate = 0;
                    let amountWithTax = basePrice;

                    if (taxEnabled) {
                        // Get tax percentage from settings or use package tax_rate
                        const taxPercentSetting = await query(`
                            SELECT default_value FROM customer_default_settings
                            WHERE field_name = 'tax_percentage' AND is_active = true
                            LIMIT 1
                        `);
                        const defaultTaxPercent = taxPercentSetting.rows.length > 0
                            ? parseFloat(taxPercentSetting.rows[0].default_value)
                            : 11;

                        taxRate = (packageData.tax_rate || packageData.tax_rate === 0)
                            ? Number(packageData.tax_rate)
                            : defaultTaxPercent;
                        amountWithTax = billingManager.calculatePriceWithTax(basePrice, taxRate);
                    }

                    const invoiceData = {
                        customer_id: customer.id,
                        package_id: customer.package_id,
                        service_number: customer.service_number,
                        amount: amountWithTax,
                        base_amount: basePrice,
                        tax_rate: taxRate,
                        due_date: dueDate,
                        notes: `Tagihan bulanan ${today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
                    };

                    const newInvoice = await billingManager.createInvoice(invoiceData);
                    logger.info(`(Daily) Created invoice ${newInvoice.invoice_number} for customer ${customer.username}`);

                    // Send WhatsApp notification for new invoice
                    try {
                        const whatsappNotifications = require('./whatsapp-notifications');
                        await whatsappNotifications.sendInvoiceCreatedNotification(customer.id, newInvoice.id);
                        logger.info(`WhatsApp notification sent for invoice ${newInvoice.invoice_number}`);
                    } catch (notifError) {
                        logger.error(`Failed to send WhatsApp notification for invoice ${newInvoice.invoice_number}:`, notifError.message);
                    }

                } catch (error) {
                    logger.error(`(Daily) Error creating invoice for customer ${customer.username}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error in generateDailyInvoicesByBillingDay:', error);
            throw error;
        }
    }

    // Manual trigger for testing
    async triggerMonthlyInvoices() {
        try {
            logger.info('Triggering monthly invoice generation manually...');
            await this.generateMonthlyInvoices();
            logger.info('Manual monthly invoice generation completed');
            return { success: true, message: 'Monthly invoices generated successfully' };
        } catch (error) {
            logger.error('Error in manual monthly invoice generation:', error);
            throw error;
        }
    }

    /**
     * Generate invoices for FIXED and PROFILE cycle customers
     * Invoice is generated X days before their isolir date (based on invoice_advance_days setting)
     */
    async generateDailyInvoicesForFixedAndProfile(targetDate = null) {
        try {
            const { query, getOne } = require('./database');
            const BillingCycleService = require('./billing-cycle-service');

            // Get billing settings for invoice_advance_days
            const settings = await BillingCycleService.getBillingSettings();
            const advanceDays = settings.invoice_advance_days || 5;

            const today = targetDate ? new Date(targetDate) : new Date();

            logger.info(`Checking for invoices to generate (advance_days: ${advanceDays})`);

            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const startOfMonth = new Date(currentYear, currentMonth, 1);
            const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

            // Get all active services with FIXED (TETAP), PROFILE cycle whose isolir date matches target
            const servicesResult = await query(`
                SELECT s.*, c.name as customer_name, c.phone as customer_phone,
                       p.name as package_name, p.price as package_price, p.tax_rate
                FROM services s
                JOIN customers c ON s.customer_id = c.id
                LEFT JOIN packages p ON s.package_id = p.id
                WHERE s.status = 'active'
                AND LOWER(s.siklus) IN ('fixed', 'profile', 'tetap')
                AND s.isolir_date IS NOT NULL
                AND DATE(s.isolir_date) = (CURRENT_DATE + INTERVAL '${advanceDays} days')::date
            `);

            const eligibleServices = servicesResult.rows;
            logger.info(`Found ${eligibleServices.length} services with isolir date target (advance: ${advanceDays} days)`);

            let created = 0;
            let skipped = 0;

            for (const service of eligibleServices) {
                try {
                    // Check if invoice already exists for this service this month
                    const existingInvoice = await getOne(`
                        SELECT id FROM invoices
                        WHERE service_number = $1
                        AND created_at >= $2 AND created_at <= $3
                    `, [service.service_number, startOfMonth, endOfMonth]);

                    if (existingInvoice) {
                        logger.info(`Invoice already exists for service ${service.service_number} this month`);
                        skipped++;
                        continue;
                    }

                    // Get tax settings from customer_default_settings
                    const taxSetting = await query(`
                        SELECT default_value FROM customer_default_settings
                        WHERE field_name = 'tax_enabled' AND is_active = true
                        LIMIT 1
                    `);
                    const taxEnabled = taxSetting.rows.length > 0 ? taxSetting.rows[0].default_value === 'true' : false;

                    // Calculate amount - only apply tax if enabled
                    const basePrice = service.package_price || 0;
                    let taxRate = 0;
                    let amountWithTax = basePrice;

                    if (taxEnabled) {
                        // Get tax percentage from settings or use package tax_rate
                        const taxPercentSetting = await query(`
                            SELECT default_value FROM customer_default_settings
                            WHERE field_name = 'tax_percentage' AND is_active = true
                            LIMIT 1
                        `);
                        const defaultTaxPercent = taxPercentSetting.rows.length > 0
                            ? parseFloat(taxPercentSetting.rows[0].default_value)
                            : 11;

                        taxRate = (service.tax_rate || service.tax_rate === 0)
                            ? Number(service.tax_rate)
                            : defaultTaxPercent;
                        amountWithTax = billingManager.calculatePriceWithTax(basePrice, taxRate);
                    }

                    // due_date = isolir_date (both are DATE, no JS conversion needed)
                    const isFixedCycle = service.siklus === 'fixed' || service.siklus === 'TETAP' || service.siklus === 'tetap';

                    const invoiceData = {
                        customer_id: service.customer_id,
                        package_id: service.package_id,
                        service_number: service.service_number,
                        amount: amountWithTax,
                        total_amount: amountWithTax,
                        base_amount: basePrice,
                        tax_rate: taxRate,
                        due_date: service.isolir_date,
                        notes: `Tagihan ${isFixedCycle ? 'siklus tetap' : 'siklus profile'} - ${today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
                    };

                    const newInvoice = await billingManager.createInvoice(invoiceData);
                    logger.info(`Created invoice ${newInvoice.invoice_number} for service ${service.service_number} (${service.siklus} cycle)`);

                    // Send WhatsApp notification for new invoice
                    try {
                        const whatsappNotifications = require('./whatsapp-notifications');
                        await whatsappNotifications.sendInvoiceCreatedNotification(service.customer_id, newInvoice.id);
                        logger.info(`WhatsApp notification sent for invoice ${newInvoice.invoice_number}`);
                    } catch (notifError) {
                        logger.error(`Failed to send WhatsApp notification for invoice ${newInvoice.invoice_number}:`, notifError.message);
                    }

                    created++;

                } catch (error) {
                    logger.error(`Error creating invoice for service ${service.service_number}:`, error);
                }
            }

            logger.info(`Daily invoice generation completed: ${created} created, ${skipped} skipped`);
            return { created, skipped };

        } catch (error) {
            logger.error('Error in generateDailyInvoicesForFixedAndProfile:', error);
            throw error;
        }
    }


    async rescheduleDynamicJobs() {
        try {
            logger.info('Rescheduling dynamic cron jobs...');
            
            if (this.tasks.invoice) { this.tasks.invoice.stop(); this.tasks.invoice = null; }
            if (this.tasks.reminder) { this.tasks.reminder.stop(); this.tasks.reminder = null; }
            if (this.tasks.suspension) { this.tasks.suspension.stop(); this.tasks.suspension = null; }

            const BillingCycleService = require('./billing-cycle-service');
            const settings = await BillingCycleService.getBillingSettings();

            // 1. Invoices Job
            const invoiceExpr = this.getDynamicInvoiceExpression(settings);
            logger.info(`Scheduling daily invoice generation (all cycles) at expression: ${invoiceExpr}`);
            this.tasks.invoice = cron.schedule(invoiceExpr, async () => {
                try {
                    logger.info('Starting daily invoice generation (all cycles)...');
                    await this.generateDailyInvoicesByBillingDay();
                    await this.generateDailyInvoicesForFixedAndProfile();
                    const today = new Date();
                    if (today.getDate() === 1) await this.generateMonthlyInvoices();
                } catch (err) { logger.error('Invoice cron error:', err); }
            }, { scheduled: true, timezone: "Asia/Jakarta" });

            // 2. Reminders Job
            const reminderExpr = this.getDynamicReminderExpression(settings);
            logger.info(`Scheduling daily due date reminders at expression: ${reminderExpr}`);
            this.tasks.reminder = cron.schedule(reminderExpr, async () => {
                try { await this.sendDueDateReminders(); }
                catch (err) { logger.error('Reminder cron error:', err); }
            }, { scheduled: true, timezone: "Asia/Jakarta" });

            // 3. Suspension Job
            const timeStr = settings.suspension_time || '23:59';
            const [hour, minute] = timeStr.split(':').map(Number);
            const safeHour = (hour >= 0 && hour <= 23) ? hour : 23;
            const safeMinute = (minute >= 0 && minute <= 59) ? minute : 59;
            const suspensionExpr = `${safeMinute} ${safeHour} * * *`;

            logger.info(`Scheduling daily service suspension check at ${safeHour}:${safeMinute} (${suspensionExpr})`);
            this.tasks.suspension = cron.schedule(suspensionExpr, async () => {
                try {
                    logger.info('Starting daily service suspension check...');
                    const serviceSuspension = require('./serviceSuspension');
                    await serviceSuspension.checkAndSuspendOverdueCustomers();
                } catch (err) { logger.error('Suspension cron error:', err); }
            }, { scheduled: true, timezone: "Asia/Jakarta" });
        } catch (error) {
            logger.error('Error rescheduling dynamic jobs:', error);
        }
    }
}

module.exports = new InvoiceScheduler(); 