const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const { query, getOne, getAll } = require('../../../config/database');

// Import untuk data GenieACS dan Mikrotik
const { getDevices } = require('../../../config/genieacs');
const { getActivePPPoEConnections, getInactivePPPoEUsers } = require('../../../config/mikrotik');

// GET /api/v1/dashboard/stats - Get dashboard statistics (Simple version)
router.get('/stats', async (req, res) => {
    try {
        // Initialize GenieACS and Mikrotik stats
        let genieacsTotal = 0, genieacsOnline = 0, genieacsOffline = 0;
        let mikrotikTotal = 0, mikrotikAktif = 0, mikrotikOffline = 0;

        // Get GenieACS data
        try {
            const devices = await getDevices();
            genieacsTotal = devices.length;
            const now = Date.now();
            genieacsOnline = devices.filter(dev => dev._lastInform && (now - new Date(dev._lastInform).getTime()) < 3600*1000).length;
            genieacsOffline = genieacsTotal - genieacsOnline;
        } catch (genieacsError) {
            logger.warn('Failed to get GenieACS data:', genieacsError.message);
        }

        // Get Mikrotik data
        try {
            const aktifResult = await getActivePPPoEConnections();
            mikrotikAktif = aktifResult.success ? aktifResult.data.length : 0;
            const offlineResult = await getInactivePPPoEUsers();
            mikrotikOffline = offlineResult.success ? offlineResult.totalInactive : 0;
            mikrotikTotal = (offlineResult.success ? offlineResult.totalSecrets : 0);
        } catch (mikrotikError) {
            logger.warn('Failed to get Mikrotik data:', mikrotikError.message);
        }

        // Get total customers
        const totalCustomersQuery = await query('SELECT COUNT(*) as count FROM customers');
        const totalCustomers = parseInt(totalCustomersQuery.rows[0].count);

        // Get active customers
        const activeCustomersQuery = await query("SELECT COUNT(*) as count FROM customers WHERE status = 'active'");
        const activeCustomers = parseInt(activeCustomersQuery.rows[0].count);

        // Get inactive customers
        const inactiveCustomersQuery = await query("SELECT COUNT(*) as count FROM customers WHERE status = 'inactive'");
        const inactiveCustomers = parseInt(inactiveCustomersQuery.rows[0].count);

        // Get total packages
        const totalPackagesQuery = await query('SELECT COUNT(*) as count FROM packages');
        const totalPackages = parseInt(totalPackagesQuery.rows[0].count);

        // Get total invoices
        const totalInvoicesQuery = await query("SELECT COUNT(*) as count FROM invoices");
        const totalInvoices = parseInt(totalInvoicesQuery.rows[0].count);

        // Get paid invoices
        const paidInvoicesQuery = await query("SELECT COUNT(*) as count FROM invoices WHERE status = 'paid'");
        const paidInvoices = parseInt(paidInvoicesQuery.rows[0].count);

        // Get total revenue (using amount from paid invoices)
        const totalRevenueQuery = await query("SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = 'paid'");
        const totalRevenue = parseFloat(totalRevenueQuery.rows[0].total);

        // Get pending invoices
        const pendingInvoicesQuery = await query("SELECT COUNT(*) as count FROM invoices WHERE status = 'unpaid'");
        const pendingInvoices = parseInt(pendingInvoicesQuery.rows[0].count);

        // Get overdue invoices
        const overdueInvoicesQuery = await query(`
            SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
            FROM invoices
            WHERE status = 'unpaid' AND due_date < CURRENT_DATE
        `);
        const overdueInvoices = parseInt(overdueInvoicesQuery.rows[0].count);
        const overdueAmount = parseFloat(overdueInvoicesQuery.rows[0].total_amount);

        res.json({
            success: true,
            data: {
                // GenieACS Stats (same as old dashboard)
                genieacsTotal,
                genieacsOnline,
                genieacsOffline,
                // Mikrotik Stats (same as old dashboard)
                mikrotikTotal,
                mikrotikAktif,
                mikrotikOffline,
                // Customer Stats
                totalCustomers,
                activeCustomers,
                inactiveCustomers,
                totalPackages,
                totalInvoices,
                paidInvoices,
                pendingInvoices,
                overdueInvoices,
                overdueAmount,
                totalRevenue,
                // Additional computed metrics
                customerGrowth: {
                    percentage: totalCustomers > 0 ? ((activeCustomers / totalCustomers) * 100).toFixed(1) : 0
                },
                revenueMetrics: {
                    averagePerCustomer: activeCustomers > 0 ? (totalRevenue / activeCustomers).toFixed(2) : 0
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data dashboard'
        });
    }
});

// GET /api/v1/dashboard/recent-activities - Get recent activities
router.get('/recent-activities', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // Get recent new customers
        const newCustomersQuery = await query(`
            SELECT 'new_customer' as type, name, created_at as date,
                   'Pelanggan baru ditambahkan' as description
            FROM customers
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);

        // Get recent paid invoices (using invoices table directly)
        const paidInvoicesQuery = await query(`
            SELECT 'payment' as type, c.name, i.updated_at as date,
                   CONCAT('Pembayaran tagihan #', i.invoice_number) as description
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.status = 'paid'
            ORDER BY i.updated_at DESC
            LIMIT $1
        `, [limit]);

        // Get recent new invoices
        const newInvoicesQuery = await query(`
            SELECT 'invoice' as type, c.name, i.created_at as date,
                   CONCAT('Tagihan #', i.invoice_number, ' dibuat') as description
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            ORDER BY i.created_at DESC
            LIMIT $1
        `, [limit]);

        // Combine and sort all activities
        const allActivities = [
            ...newCustomersQuery.rows,
            ...paidInvoicesQuery.rows,
            ...newInvoicesQuery.rows
        ];

        // Sort by date (most recent first) and limit
        allActivities.sort((a, b) => new Date(b.date) - new Date(a.date));
        const activities = allActivities.slice(0, limit);

        res.json({
            success: true,
            data: { activities }
        });

    } catch (error) {
        logger.error('Error fetching recent activities:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data aktivitas'
        });
    }
});

// GET /api/v1/dashboard/revenue-chart - Get revenue data for chart
router.get('/revenue-chart', async (req, res) => {
    try {
        const period = req.query.period || '6months'; // 1month, 3months, 6months, 1year

        let dateCondition = '';
        switch (period) {
            case '1month':
                dateCondition = "created_at >= CURRENT_DATE - INTERVAL '1 month'";
                break;
            case '3months':
                dateCondition = "created_at >= CURRENT_DATE - INTERVAL '3 months'";
                break;
            case '6months':
                dateCondition = "created_at >= CURRENT_DATE - INTERVAL '6 months'";
                break;
            case '1year':
                dateCondition = "created_at >= CURRENT_DATE - INTERVAL '1 year'";
                break;
            default:
                dateCondition = "created_at >= CURRENT_DATE - INTERVAL '6 months'";
        }

        const revenueQuery = await query(`
            SELECT
                DATE_TRUNC('month', i.updated_at) as month,
                SUM(i.amount) as paid,
                COUNT(i.id) as paid_count,
                0 as unpaid,
                0 as unpaid_count
            FROM invoices i
            WHERE i.status = 'paid' AND i.updated_at >= ${dateCondition === "created_at >= CURRENT_DATE - INTERVAL '6 months'"
              ? "CURRENT_DATE - INTERVAL '6 months'"
              : dateCondition === "created_at >= CURRENT_DATE - INTERVAL '3 months'"
              ? "CURRENT_DATE - INTERVAL '3 months'"
              : dateCondition === "created_at >= CURRENT_DATE - INTERVAL '1 month'"
              ? "CURRENT_DATE - INTERVAL '1 month'"
              : "CURRENT_DATE - INTERVAL '1 year'"}
            GROUP BY DATE_TRUNC('month', i.updated_at)
            ORDER BY month ASC
        `);

        res.json({
            success: true,
            data: {
                revenue: revenueQuery.rows,
                period
            }
        });

    } catch (error) {
        logger.error('Error fetching revenue chart data:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data revenue'
        });
    }
});

// GET /api/v1/dashboard/monthly-revenue - Get daily revenue for current month
router.get('/monthly-revenue', async (req, res) => {
    try {
        // Get current month data (using local timezone)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Get first day of current month (local timezone)
        const startDate = new Date(currentYear, currentMonth, 1);
        // Get last day of current month (local timezone)
        const endDate = new Date(currentYear, currentMonth + 1, 0); // 0 gives last day of previous month

        // Get total days in current month
        const totalDays = endDate.getDate();

        const dates = [];
        const revenues = [];

        logger.info(`[Revenue Chart] Generating revenue data for current month: ${startDate.toISOString()} to ${endDate.toISOString()}`);

        // Initialize arrays with 0 values for each day of the month (using local timezone)
        for (let i = 0; i < totalDays; i++) {
            const currentDate = new Date(currentYear, currentMonth, i + 1);
            // Format date as YYYY-MM-DD using local timezone
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            dates.push(dateKey);
            revenues.push(0);
        }

        // Format dates for query (YYYY-MM-DD format)
        const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
        const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

        // Query paid invoices within current month
        const revenueQuery = await query(`
            SELECT
                DATE(updated_at) as date,
                SUM(amount) as daily_revenue,
                COUNT(*) as transaction_count
            FROM invoices
            WHERE
                status = 'paid'
                AND DATE(updated_at) >= $1::date
                AND DATE(updated_at) <= $2::date
            GROUP BY DATE(updated_at)
            ORDER BY DATE(updated_at) ASC
        `, [startDateStr, endDateStr]);

        logger.info(`[Revenue Chart] Found ${revenueQuery.rows.length} revenue records`);

        // Fill revenues array with actual data
        revenueQuery.rows.forEach(record => {
            const dateKey = record.date.toISOString().split('T')[0];
            const dayIndex = dates.indexOf(dateKey);
            if (dayIndex !== -1) {
                revenues[dayIndex] = parseFloat(record.daily_revenue || 0);
            }
        });

        // Calculate statistics
        const totalRevenue = revenues.reduce((sum, rev) => sum + rev, 0);
        const avgRevenue = totalRevenue / revenues.length || 0;
        const maxRevenue = Math.max(...revenues, 0);
        const daysWithRevenue = revenues.filter(rev => rev > 0).length;

        // Get month name in Indonesian
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const currentMonthName = monthNames[currentMonth];

        res.json({
            success: true,
            data: {
                dates: dates.map(date => {
                    const d = new Date(date);
                    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                }),
                revenues: revenues,
                totalRevenue,
                avgRevenue,
                maxRevenue,
                daysWithRevenue,
                period: `${currentMonthName} ${currentYear}`,
                startDate: `1 ${currentMonthName} ${currentYear}`,
                endDate: `${totalDays} ${currentMonthName} ${currentYear}`,
                currentMonth: currentMonth,
                currentYear: currentYear
            }
        });

    } catch (error) {
        logger.error('Error fetching monthly revenue data:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data revenue'
        });
    }
});

// GET /api/v1/dashboard/customer-status - Get customer status breakdown
router.get('/customer-status', async (req, res) => {
    try {
        const statusQuery = await query(`
            SELECT
                status,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
            FROM customers
            WHERE 1=1
            GROUP BY status
            ORDER BY count DESC
        `);

        const packageQuery = await query(`
            SELECT
                p.name as package_name,
                COUNT(c.id) as customer_count
            FROM packages p
            LEFT JOIN customers c ON p.id = c.package_id
            WHERE 1=1
            GROUP BY p.id, p.name
            ORDER BY customer_count DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            data: {
                statusBreakdown: statusQuery.rows,
                popularPackages: packageQuery.rows
            }
        });

    } catch (error) {
        logger.error('Error fetching customer status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data status pelanggan'
        });
    }
});

// GET /api/v1/dashboard/top-customers - Get top customers by revenue
router.get('/top-customers', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const topCustomersQuery = await query(`
            SELECT
                c.id,
                c.name,
                c.phone,
                p.name as package_name,
                COALESCE(SUM(i.amount), 0) as total_revenue,
                COUNT(i.id) as invoice_count
            FROM customers c
            LEFT JOIN packages p ON c.package_id = p.id
            LEFT JOIN invoices i ON c.id = i.customer_id AND i.status = 'paid'
            WHERE 1=1
            GROUP BY c.id, c.name, c.phone, p.name
            ORDER BY total_revenue DESC
            LIMIT $1
        `, [limit]);

        res.json({
            success: true,
            data: {
                topCustomers: topCustomersQuery.rows
            }
        });

    } catch (error) {
        logger.error('Error fetching top customers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data top customers'
        });
    }
});

module.exports = router;