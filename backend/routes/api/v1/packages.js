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
            whereClause += ` AND (p.name ILIKE $${queryParams.length + 1} OR p.description ILIKE $${queryParams.length + 1} OR p.speed ILIKE $${queryParams.length + 1} OR p.price::text ILIKE $${queryParams.length + 1})`;
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
                p.speed,
                p.price,
                p.installation_fee,
                p.installation_description,
                COUNT(c.id) as customer_count,
                COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END), 0) as total_revenue
            FROM packages p
            LEFT JOIN customers_view c ON p.id = c.package_id
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
            description: pkg.description || null,
            price: parseFloat(pkg.price),
            speed: pkg.speed,
            duration: '1 bulan', // Default duration since no duration column exists
            isActive: pkg.is_active !== false, // Use actual is_active field
            customerCount: parseInt(pkg.customer_count),
            totalRevenue: parseFloat(pkg.total_revenue),
            installation_fee: parseFloat(pkg.installation_fee || 50000),
            installation_description: pkg.installation_description || 'Standard installation',
            features: [], // No features field in database
            group: pkg.group || null,
            rateLimit: pkg.rate_limit || null,
            shared: pkg.shared === 1, // Convert integer to boolean
            hpp: parseFloat(pkg.hpp || 0),
            commission: parseFloat(pkg.commission || 0),
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

// GET /api/v1/packages/stats - Get package statistics
router.get('/stats', async (req, res) => {
    try {
        // Get total packages
        const totalPackagesQuery = await query('SELECT COUNT(*) as count FROM packages');
        const totalPackages = parseInt(totalPackagesQuery.rows[0].count);

        // Get active packages (all packages since no is_active column)
        const activePackages = totalPackages; // All packages are considered active

        // Get total customers from packages
        const totalCustomersQuery = await query(`
            SELECT COUNT(DISTINCT c.id) as count
            FROM customers_view c
            JOIN packages p ON c.package_id = p.id
        `);
        const totalCustomers = parseInt(totalCustomersQuery.rows[0].count);

        // Get total revenue from packages
        const totalRevenueQuery = await query(`
            SELECT COALESCE(SUM(i.amount), 0) as revenue
            FROM invoices i
            JOIN packages p ON i.package_id = p.id
            WHERE i.status = 'paid'
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

// GET /api/v1/packages/:id - Get package by ID
router.get('/:id', async (req, res) => {
    try {
        const packageId = req.params.id;

        const packageQuery = await query(`
            SELECT
                p.*,
                p.speed,
                p.price,
                p.installation_fee,
                p.installation_description,
                COUNT(c.id) as customer_count,
                COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END), 0) as total_revenue
            FROM packages p
            LEFT JOIN customers_view c ON p.id = c.package_id
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
            description: pkg.description || null,
            price: parseFloat(pkg.price),
            speed: pkg.speed,
            duration: '1 bulan', // Default duration since no duration column exists
            isActive: pkg.is_active !== false, // Use actual is_active field
            customerCount: parseInt(pkg.customer_count),
            totalRevenue: parseFloat(pkg.total_revenue),
            installation_fee: parseFloat(pkg.installation_fee || 50000),
            installation_description: pkg.installation_description || 'Standard installation',
            features: [], // No features field in database
            group: pkg.group || null,
            rateLimit: pkg.rate_limit || null,
            shared: pkg.shared === 1, // Convert integer to boolean
            hpp: parseFloat(pkg.hpp || 0),
            commission: parseFloat(pkg.commission || 0),
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

        // Get active packages (all packages since no is_active column)
        const activePackages = totalPackages; // All packages are considered active

        // Get total customers from packages
        const totalCustomersQuery = await query(`
            SELECT COUNT(DISTINCT c.id) as count
            FROM customers_view c
            JOIN packages p ON c.package_id = p.id
        `);
        const totalCustomers = parseInt(totalCustomersQuery.rows[0].count);

        // Get total revenue from packages
        const totalRevenueQuery = await query(`
            SELECT COALESCE(SUM(i.amount), 0) as revenue
            FROM invoices i
            JOIN packages p ON i.package_id = p.id
            WHERE i.status = 'paid'
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

// POST /api/v1/packages/create - Create new package
router.post('/', async (req, res) => {
    try {
        const { name, speed, price, description, installation_fee, installation_description, group, rate_limit, shared, hpp, commission } = req.body;

        if (!name || !speed || !price) {
            return res.status(400).json({
                success: false,
                message: 'Nama, kecepatan, dan harga paket wajib diisi'
            });
        }

        const insertQuery =
            'INSERT INTO packages (name, speed, price, description, installation_fee, installation_description, "group", rate_limit, shared, hpp, commission, is_active, created_at, updated_at) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW()) ' +
            'RETURNING *';

        const result = await query(insertQuery, [
            name,
            speed,
            parseFloat(price),
            description || null,
            parseFloat(installation_fee || 50000),
            installation_description || 'Standard installation',
            group || null,
            rate_limit || null,
            shared ? 1 : 0,
            parseFloat(hpp) || 0,
            parseFloat(commission) || 0
        ]);

        const newPackage = result.rows[0];

        res.status(201).json({
            success: true,
            message: 'Paket berhasil dibuat',
            data: {
                id: newPackage.id,
                name: newPackage.name,
                description: newPackage.description || null,
                price: parseFloat(newPackage.price),
                speed: newPackage.speed,
                duration: '1 bulan',
                isActive: newPackage.is_active !== false,
                customerCount: 0,
                totalRevenue: 0,
                installation_fee: parseFloat(newPackage.installation_fee || 50000),
                installation_description: newPackage.installation_description || 'Standard installation',
                features: [],
                group: newPackage.group || null,
                rateLimit: newPackage.rate_limit || null,
                shared: newPackage.shared === 1,
                hpp: parseFloat(newPackage.hpp || 0),
                commission: parseFloat(newPackage.commission || 0),
                createdAt: newPackage.created_at,
                updatedAt: newPackage.updated_at
            }
        });

    } catch (error) {
        logger.error('Error creating package:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat paket'
        });
    }
});

// PUT /api/v1/packages/:id - Update package
router.put('/:id', async (req, res) => {
    try {
        const packageId = req.params.id;
        const { name, speed, price, description, installation_fee, installation_description, group, rate_limit, shared, hpp, commission } = req.body;

        if (!name || !speed || !price) {
            return res.status(400).json({
                success: false,
                message: 'Nama, kecepatan, dan harga paket wajib diisi'
            });
        }

        const updateQuery =
            'UPDATE packages ' +
            'SET name = $1, speed = $2, price = $3, description = $4, installation_fee = $5, installation_description = $6, ' +
            '    "group" = $7, rate_limit = $8, shared = $9, hpp = $10, commission = $11, updated_at = NOW() ' +
            'WHERE id = $12 ' +
            'RETURNING *';

        const result = await query(updateQuery, [
            name,
            speed,
            parseFloat(price),
            description || null,
            parseFloat(installation_fee || 50000),
            installation_description || 'Standard installation',
            group || null,
            rate_limit || null,
            shared ? 1 : 0,
            parseFloat(hpp) || 0,
            parseFloat(commission) || 0,
            packageId
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Paket tidak ditemukan'
            });
        }

        const updatedPackage = result.rows[0];

        res.json({
            success: true,
            message: 'Paket berhasil diperbarui',
            data: {
                id: updatedPackage.id,
                name: updatedPackage.name,
                description: updatedPackage.description || null,
                price: parseFloat(updatedPackage.price),
                speed: updatedPackage.speed,
                duration: '1 bulan',
                isActive: updatedPackage.is_active !== false,
                customerCount: 0, // TODO: Calculate actual customer count
                totalRevenue: 0, // TODO: Calculate actual revenue
                installation_fee: parseFloat(updatedPackage.installation_fee || 50000),
                installation_description: updatedPackage.installation_description || 'Standard installation',
                features: [],
                group: updatedPackage.group || null,
                rateLimit: updatedPackage.rate_limit || null,
                shared: updatedPackage.shared === 1,
                hpp: parseFloat(updatedPackage.hpp || 0),
                commission: parseFloat(updatedPackage.commission || 0),
                createdAt: updatedPackage.created_at,
                updatedAt: updatedPackage.updated_at
            }
        });

    } catch (error) {
        logger.error('Error updating package:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui paket'
        });
    }
});

// DELETE /api/v1/packages/:id - Delete package
router.delete('/:id', async (req, res) => {
    try {
        const packageId = req.params.id;
        console.log('Delete request for package ID:', packageId);

        // Check if package has customers
        console.log('Checking customers for package:', packageId);
        const customerCheck = await query(
            'SELECT COUNT(*) as count FROM customers_view WHERE package_id = $1',
            [packageId]
        );
        console.log('Customer check result:', customerCheck.rows[0]);

        if (parseInt(customerCheck.rows[0].count) > 0) {
            console.log('Package has customers, cannot delete');
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus paket yang masih memiliki pelanggan'
            });
        }

        // Check if package has invoices
        console.log('Checking invoices for package:', packageId);
        const invoiceCheck = await query(
            'SELECT COUNT(*) as count FROM invoices WHERE package_id = $1',
            [packageId]
        );
        console.log('Invoice check result:', invoiceCheck.rows[0]);

        if (parseInt(invoiceCheck.rows[0].count) > 0) {
            console.log('Package has invoices, cannot delete');
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus paket yang masih memiliki invoice'
            });
        }

        console.log('Proceeding with delete operation');
        const deleteQuery = 'DELETE FROM packages WHERE id = $1';
        const result = await query(deleteQuery, [packageId]);
        console.log('Delete result:', result);

        if (result.rowCount === 0) {
            console.log('No rows affected - package not found');
            return res.status(404).json({
                success: false,
                message: 'Paket tidak ditemukan'
            });
        }

        console.log('Delete successful');
        res.json({
            success: true,
            message: 'Paket berhasil dihapus'
        });

    } catch (error) {
        console.error('Error in delete route:', error);
        logger.error('Error deleting package:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus paket'
        });
    }
});

module.exports = router;