const cron = require('node-cron');
const billingManager = require('./billing');
const logger = require('./logger');

class InvoiceScheduler {
    constructor() {
        this.initScheduler();
    }

    initScheduler() {
        // Schedule monthly invoice generation on 1st of every month at 08:00
        // This is for MONTHLY cycle customers only
        cron.schedule('0 8 1 * *', async () => {
            try {
                logger.info('Starting automatic monthly invoice generation (MONTHLY cycle only)...');
                await this.generateMonthlyInvoices();
                logger.info('Automatic monthly invoice generation completed');
            } catch (error) {
                logger.error('Error in automatic monthly invoice generation:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        logger.info('Monthly invoice scheduler initialized - runs on 1st of every month at 08:00 (for MONTHLY cycle only)');

        // Schedule DAILY invoice generation at 07:00 for FIXED and PROFILE cycles
        // This generates invoices X days before each customer's isolir date
        cron.schedule('0 7 * * *', async () => {
            try {
                logger.info('Starting daily invoice generation (FIXED/PROFILE cycles)...');
                await this.generateDailyInvoicesForFixedAndProfile();
                logger.info('Daily invoice generation (FIXED/PROFILE) completed');
            } catch (error) {
                logger.error('Error in daily invoice generation (FIXED/PROFILE):', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        logger.info('Daily invoice scheduler initialized - runs daily at 07:00 (for FIXED/PROFILE cycles)');

        // Schedule daily due date reminders at 09:00
        cron.schedule('0 9 * * *', async () => {
            try {
                logger.info('Starting daily due date reminders...');
                await this.sendDueDateReminders();
                logger.info('Daily due date reminders completed');
            } catch (error) {
                logger.error('Error in daily due date reminders:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        logger.info('Due date reminder scheduler initialized - will run daily at 09:00');

        // Schedule daily service suspension check at 10:00
        cron.schedule('0 10 * * *', async () => {
            try {
                logger.info('Starting daily service suspension check...');
                const serviceSuspension = require('./serviceSuspension');
                await serviceSuspension.checkAndSuspendOverdueCustomers();
                logger.info('Daily service suspension check completed');
            } catch (error) {
                logger.error('Error in daily service suspension check:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        // Schedule daily service restoration check at 11:00
        cron.schedule('0 11 * * *', async () => {
            try {
                logger.info('Starting daily service restoration check...');
                const serviceSuspension = require('./serviceSuspension');
                await serviceSuspension.checkAndRestorePaidCustomers();
                logger.info('Daily service restoration check completed');
            } catch (error) {
                logger.error('Error in daily service restoration check:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        logger.info('Service suspension/restoration scheduler initialized - will run daily at 10:00 and 11:00');

        // Schedule voucher cleanup every 6 hours (00:00, 06:00, 12:00, 18:00)
        cron.schedule('0 0,6,12,18 * * *', async () => {
            try {
                logger.info('Starting automatic voucher cleanup...');

                // Make HTTP request to cleanup endpoint
                const https = require('http');

                const options = {
                    hostname: 'localhost',
                    port: process.env.PORT || 3004,
                    path: '/voucher/cleanup-expired',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            if (result.success) {
                                logger.info(`Automatic voucher cleanup completed: ${result.message}`);
                                if (result.details) {
                                    logger.info(`Database deleted: ${result.details.database_deleted}, Mikrotik deleted: ${result.details.mikrotik_deleted}`);
                                }
                            } else {
                                logger.error('Automatic voucher cleanup failed:', result.message);
                            }
                        } catch (e) {
                            logger.error('Error parsing voucher cleanup response:', e);
                        }
                    });
                });

                req.on('error', (e) => {
                    logger.error('Error in automatic voucher cleanup request:', e.message);
                });

                req.write(JSON.stringify({}));
                req.end();

            } catch (error) {
                logger.error('Error in automatic voucher cleanup:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Jakarta"
        });

        logger.info('Voucher cleanup scheduler initialized - will run every 6 hours');


    }

    async sendDueDateReminders() {
        try {
            const whatsappNotifications = require('./whatsapp-notifications');
            const invoices = await billingManager.getInvoices();
            const today = new Date();

            // Filter invoices that are due in the next 3 days
            const upcomingInvoices = invoices.filter(invoice => {
                if (invoice.status !== 'unpaid') return false;

                const dueDate = new Date(invoice.due_date);
                const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                return daysUntilDue >= 0 && daysUntilDue <= 3;
            });

            logger.info(`Found ${upcomingInvoices.length} invoices due in the next 3 days`);

            for (const invoice of upcomingInvoices) {
                try {
                    await whatsappNotifications.sendDueDateReminder(invoice.id);
                    logger.info(`Due date reminder sent for invoice ${invoice.invoice_number}`);
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
                SELECT DISTINCT c.*, s.siklus, s.id as service_id, s.active_date as service_active_date,
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

                    // Check if invoice already exists for this month
                    const currentDate = new Date();
                    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

                    const existingInvoices = await billingManager.getInvoicesByCustomerAndDateRange(
                        customer.username,
                        startOfMonth,
                        endOfMonth
                    );

                    if (existingInvoices.length > 0) {
                        logger.info(`Invoice already exists for customer ${customer.username} this month`);
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

                    // Create invoice data with PPN calculation
                    const basePrice = packageData.price;
                    const taxRate = (packageData.tax_rate === 0 || (typeof packageData.tax_rate === 'number' && packageData.tax_rate > -1))
                        ? Number(packageData.tax_rate)
                        : 11.00; // Default 11% only when undefined/null/invalid
                    const amountWithTax = billingManager.calculatePriceWithTax(basePrice, taxRate);

                    const invoiceData = {
                        customer_id: customer.id,
                        package_id: customer.package_id,
                        amount: amountWithTax, // Use price with tax
                        base_amount: basePrice, // Store base price for reference
                        tax_rate: taxRate, // Store tax rate for reference
                        due_date: dueDate.toISOString().split('T')[0],
                        notes: `Tagihan bulanan ${currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
                    };

                    // Create the invoice
                    const newInvoice = await billingManager.createInvoice(invoiceData);
                    logger.info(`Created invoice ${newInvoice.invoice_number} for customer ${customer.username}`);

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
    async generateDailyInvoicesByBillingDay() {
        try {
            // Get all active customers
            const customers = await billingManager.getCustomers();
            const activeCustomers = customers.filter(customer =>
                customer.status === 'active' && customer.package_id
            );

            const today = new Date();
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

                    // Check if invoice already exists for this month
                    const existingInvoices = await billingManager.getInvoicesByCustomerAndDateRange(
                        customer.username,
                        startOfMonth,
                        endOfMonth
                    );
                    if (existingInvoices.length > 0) {
                        logger.info(`Invoice already exists for customer ${customer.username} this month (daily generator)`);
                        continue;
                    }

                    // Set due date to today's date (which equals billing_day)
                    const dueDate = new Date(currentYear, currentMonth, normalizedBillingDay)
                        .toISOString()
                        .split('T')[0];

                    // Calculate amount with tax
                    const basePrice = packageData.price;
                    const taxRate = (packageData.tax_rate === 0 || (typeof packageData.tax_rate === 'number' && packageData.tax_rate > -1))
                        ? Number(packageData.tax_rate)
                        : 11.00;
                    const amountWithTax = billingManager.calculatePriceWithTax(basePrice, taxRate);

                    const invoiceData = {
                        customer_id: customer.id,
                        package_id: customer.package_id,
                        amount: amountWithTax,
                        base_amount: basePrice,
                        tax_rate: taxRate,
                        due_date: dueDate,
                        notes: `Tagihan bulanan ${today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
                    };

                    const newInvoice = await billingManager.createInvoice(invoiceData);
                    logger.info(`(Daily) Created invoice ${newInvoice.invoice_number} for customer ${customer.username}`);

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
    async generateDailyInvoicesForFixedAndProfile() {
        try {
            const { query, getOne } = require('./database');
            const BillingCycleService = require('./billing-cycle-service');

            // Get billing settings for invoice_advance_days
            const settings = await BillingCycleService.getBillingSettings();
            const advanceDays = settings.invoice_advance_days || 5;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Calculate target date range for isolir (today + advanceDays)
            const targetIsolirDate = new Date(today);
            targetIsolirDate.setDate(targetIsolirDate.getDate() + advanceDays);

            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const startOfMonth = new Date(currentYear, currentMonth, 1);
            const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

            logger.info(`Checking for invoices to generate (advance_days: ${advanceDays}, target_isolir: ${targetIsolirDate.toISOString().split('T')[0]})`);

            // Get all active services with FIXED or PROFILE cycle whose isolir date is within advance period
            const servicesResult = await query(`
                SELECT s.*, c.name as customer_name, c.phone as customer_phone,
                       p.name as package_name, p.price as package_price, p.tax_rate
                FROM services s
                JOIN customers c ON s.customer_id = c.id
                LEFT JOIN packages p ON s.package_id = p.id
                WHERE s.status = 'active'
                AND s.siklus IN ('fixed', 'profile')
                AND s.isolir_date IS NOT NULL
                AND DATE(s.isolir_date) = $1
            `, [targetIsolirDate.toISOString().split('T')[0]]);

            const eligibleServices = servicesResult.rows;
            logger.info(`Found ${eligibleServices.length} services with isolir date on ${targetIsolirDate.toISOString().split('T')[0]}`);

            let created = 0;
            let skipped = 0;

            for (const service of eligibleServices) {
                try {
                    // Check if invoice already exists for this month
                    const existingInvoice = await getOne(`
                        SELECT id FROM invoices
                        WHERE customer_id = $1
                        AND created_at >= $2 AND created_at <= $3
                    `, [service.customer_id, startOfMonth, endOfMonth]);

                    if (existingInvoice) {
                        logger.info(`Invoice already exists for service ${service.service_number} this month`);
                        skipped++;
                        continue;
                    }

                    // Calculate amount with tax
                    const basePrice = service.package_price || 0;
                    const taxRate = (service.tax_rate === 0 || (typeof service.tax_rate === 'number' && service.tax_rate > -1))
                        ? Number(service.tax_rate)
                        : 11.00;
                    const amountWithTax = billingManager.calculatePriceWithTax(basePrice, taxRate);

                    // Calculate due date based on billing cycle
                    let dueDate;
                    if (service.siklus === 'fixed') {
                        // Fixed: use day from active_date
                        const activeDay = new Date(service.active_date).getDate();
                        dueDate = new Date(currentYear, currentMonth, Math.min(activeDay, 28));
                    } else {
                        // Profile: due date = isolir date
                        dueDate = new Date(service.isolir_date);
                    }

                    const invoiceData = {
                        customer_id: service.customer_id,
                        package_id: service.package_id,
                        amount: amountWithTax,
                        total_amount: amountWithTax,
                        base_amount: basePrice,
                        tax_rate: taxRate,
                        due_date: dueDate.toISOString().split('T')[0],
                        notes: `Tagihan ${service.siklus === 'fixed' ? 'siklus tetap' : 'siklus profile'} - ${today.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
                    };

                    const newInvoice = await billingManager.createInvoice(invoiceData);
                    logger.info(`Created invoice ${newInvoice.invoice_number} for service ${service.service_number} (${service.siklus} cycle)`);
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


}

module.exports = new InvoiceScheduler(); 