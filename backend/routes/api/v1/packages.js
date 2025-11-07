const express = require('express');
const router = express.Router();
const { logger } = require('../../../config/logger');
const { getSetting } = require('../../../config/settingsManager');
const { query, getOne, getAll } = require('../../../config/database');

// GET /api/v1/packages - Get all packages with pagination and search
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (search) {
            whereClause += ` AND (p.name ILIKE $${queryParams.length + 1} OR p.description ILIKE $${queryParams.length + 1} OR p.speed ILIKE $${queryParams.length + 1})`;
            queryParams.push(`%${search}%`);
        }

        if (status) {
            whereClause += ` AND p.is_active = $${queryParams.length + 1}`;
            queryParams.push(status === 'active');
        }

        // Count query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM packages p
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Data query with customer count and revenue
        const dataQuery = `
            SELECT
                p.*,
                COUNT(c.id) as customer_count,
                COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END), 0) as total_revenue
            FROM packages p
            LEFT JOIN customers c ON p.id = c.package_id
            LEFT JOIN invoices i ON p.id = i.package_id AND i.status = 'paid'
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;

        queryParams.push(limit, offset);
        const result = await query(dataQuery, queryParams);

        const packages = result.rows.map(pkg => ({
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            price: parseFloat(pkg.price),
            speed: pkg.speed,
            duration: '1 bulan', // Default duration since no duration column exists
            isActive: pkg.is_active,
            customerCount: parseInt(pkg.customer_count),
            totalRevenue: parseFloat(pkg.total_revenue),
            features: pkg.features ? JSON.parse(pkg.features) : [],
            group: pkg.group,
            rateLimit: pkg.rate_limit,
            shared: pkg.shared,
            hpp: parseFloat(pkg.hpp),
            commission: parseFloat(pkg.commission),
            createdAt: pkg.created_at,
            updatedAt: pkg.updated_at
        }));

        res.json({
            success: true,
            data: {
                packages,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching packages:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data paket'
        });
    }
});

// GET /api/v1/packages/:id - Get package by ID
router.get('/:id', async (req, res) => {
    try {
        const packageId = req.params.id;

        const packageQuery = await query(`
            SELECT
                p.*,
                COUNT(c.id) as customer_count,
                COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END), 0) as total_revenue
            FROM packages p
            LEFT JOIN customers c ON p.id = c.package_id
            LEFT JOIN invoices i ON p.id = i.package_id AND i.status = 'paid'
            WHERE p.id = $1
            GROUP BY p.id
        `, [packageId]);

        if (packageQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paket tidak ditemukan'
            });
        }

        const pkg = packageQuery.rows[0];
        const packageData = {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            price: parseFloat(pkg.price),
            speed: pkg.speed,
            duration: '1 bulan', // Default duration since no duration column exists
            isActive: pkg.is_active,
            customerCount: parseInt(pkg.customer_count),
            totalRevenue: parseFloat(pkg.total_revenue),
            features: pkg.features ? JSON.parse(pkg.features) : [],
            group: pkg.group,
            rateLimit: pkg.rate_limit,
            shared: pkg.shared,
            hpp: parseFloat(pkg.hpp),
            commission: parseFloat(pkg.commission),
            createdAt: pkg.created_at,
            updatedAt: pkg.updated_at
        };

        res.json({
            success: true,
            data: packageData
        });

    } catch (error) {
        logger.error('Error fetching package:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data paket'
        });
    }
});

// GET /api/v1/packages/stats - Get package statistics
router.get('/stats', async (req, res) => {
    try {
        // Get total packages
        const totalPackagesQuery = await query('SELECT COUNT(*) as count FROM packages');
        const totalPackages = parseInt(totalPackagesQuery.rows[0].count);

        // Get active packages
        const activePackagesQuery = await query("SELECT COUNT(*) as count FROM packages WHERE is_active = true");
        const activePackages = parseInt(activePackagesQuery.rows[0].count);

        // Get total customers from packages
        const totalCustomersQuery = await query(`
            SELECT COUNT(DISTINCT c.id) as count
            FROM customers c
            JOIN packages p ON c.package_id = p.id
            WHERE p.is_active = true
        `);
        const totalCustomers = parseInt(totalCustomersQuery.rows[0].count);

        // Get total revenue from packages
        const totalRevenueQuery = await query(`
            SELECT COALESCE(SUM(i.amount), 0) as revenue
            FROM invoices i
            JOIN packages p ON i.package_id = p.id
            WHERE i.status = 'paid' AND p.is_active = true
        `);
        const totalRevenue = parseFloat(totalRevenueQuery.rows[0].revenue);

        res.json({
            success: true,
            data: {
                totalPackages,
                activePackages,
                totalCustomers,
                totalRevenue
            }
        });

    } catch (error) {
        logger.error('Error fetching package stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik paket'
        });
    }
});

module.exports = router;