/**
 * Admin Token Management Routes
 * Admin interface for managing customer portal tokens
 */

const express = require('express');
const router = express.Router();
const CustomerTokenService = require('../services/customer-token-service');
const BillingTokenIntegration = require('../services/billing-token-integration');
const { Customer } = require('../models');
const billing = require('../config/billing');

// Middleware for admin authentication (import from existing system)
const authenticateAdmin = (req, res, next) => {
    // Use existing admin authentication from your system
    // This should be replaced with your actual admin auth middleware
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ error: 'Admin authentication required' });
};

/**
 * GET /admin/token-management
 * Token management dashboard
 */
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        // Get statistics
        const stats = await getTokenStats();

        // Get recent token activity
        const recentTokens = await getRecentTokenActivity();

        res.render('admin/token-management/dashboard', {
            title: 'Token Management',
            stats,
            recentTokens,
            currentPage: 'token-management'
        });

    } catch (error) {
        console.error('Error loading token management dashboard:', error);
        res.status(500).render('error', {
            message: 'Error loading token management dashboard',
            error: error.message
        });
    }
});

/**
 * GET /admin/token-management/customers
 * Customer tokens list
 */
router.get('/customers', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const status = req.query.status || '';

        // Build query
        const whereClause = {};

        if (search) {
            whereClause[require('sequelize').Op.or] = [
                { name: { [require('sequelize').Op.like]: `%${search}%` } },
                { phone: { [require('sequelize').Op.like]: `%${search}%` } },
                { username: { [require('sequelize').Op.like]: `%${search}%` } }
            ];
        }

        if (status === 'active') {
            whereClause.portal_access_token = { [require('sequelize').Op.not]: null };
            whereClause.token_expires_at = { [require('sequelize').Op.gte]: new Date() };
        } else if (status === 'expired') {
            whereClause.portal_access_token = { [require('sequelize').Op.not]: null };
            whereClause.token_expires_at = { [require('sequelize').Op.lt]: new Date() };
        } else if (status === 'none') {
            whereClause.portal_access_token = { [require('sequelize').Op.is]: null };
        }

        const { count, rows: customers } = await Customer.findAndCountAll({
            where: whereClause,
            attributes: ['id', 'name', 'phone', 'username', 'status', 'portal_access_token', 'token_expires_at'],
            limit,
            offset,
            order: [['updated_at', 'DESC']]
        });

        // Enhance customer data
        const customersWithInfo = customers.map(customer => {
            const hasToken = !!customer.portal_access_token;
            const isExpired = customer.token_expires_at && customer.token_expires_at < new Date();
            const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
            const loginUrl = hasToken ? `${baseUrl}/customer/login/${customer.portal_access_token}` : null;

            return {
                ...customer.toJSON(),
                hasToken,
                isExpired,
                tokenStatus: hasToken ? (isExpired ? 'expired' : 'active') : 'none',
                loginUrl,
                daysUntilExpiry: customer.token_expires_at ?
                    Math.ceil((customer.token_expires_at - new Date()) / (1000 * 60 * 60 * 24)) : null
            };
        });

        const totalPages = Math.ceil(count / limit);

        res.render('admin/token-management/customers', {
            title: 'Customer Tokens',
            customers: customersWithInfo,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: count,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            filters: {
                search,
                status
            },
            currentPage: 'token-management'
        });

    } catch (error) {
        console.error('Error loading customer tokens:', error);
        res.status(500).render('error', {
            message: 'Error loading customer tokens',
            error: error.message
        });
    }
});

/**
 * GET /admin/token-management/generate/:customerId
 * Generate token page
 */
router.get('/generate/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;

        const customer = await Customer.findByPk(customerId);
        if (!customer) {
            return res.status(404).render('error', {
                message: 'Customer not found'
            });
        }

        // Check existing token
        const hasExistingToken = customer.portal_access_token &&
            customer.token_expires_at &&
            customer.token_expires_at > new Date();

        res.render('admin/token-management/generate', {
            title: 'Generate Token',
            customer,
            hasExistingToken,
            currentPage: 'token-management'
        });

    } catch (error) {
        console.error('Error loading token generation page:', error);
        res.status(500).render('error', {
            message: 'Error loading token generation page',
            error: error.message
        });
    }
});

/**
 * POST /admin/token-management/generate/:customerId
 * Generate token action
 */
router.post('/generate/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;
        const { expiresIn, regenerate } = req.body;

        const customerIdNum = parseInt(customerId);
        if (isNaN(customerIdNum)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid customer ID'
            });
        }

        const customer = await Customer.findByPk(customerIdNum);
        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer not found'
            });
        }

        let tokenData;
        if (regenerate) {
            tokenData = await CustomerTokenService.regenerateToken(customerIdNum, expiresIn);
        } else {
            tokenData = await CustomerTokenService.generateCustomerToken(customerIdNum, expiresIn);
        }

        // Log token generation
        console.log(`✅ Token ${regenerate ? 'regenerated' : 'generated'} for customer ${customer.name} (${customer.phone})`);

        res.json({
            success: true,
            message: `Token berhasil ${regenerate ? 'diperbarui' : 'dibuat'}`,
            data: {
                ...tokenData,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    status: customer.status
                }
            }
        });

    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /admin/token-management/deactivate/:customerId
 * Deactivate token
 */
router.post('/deactivate/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;
        const customerIdNum = parseInt(customerId);

        if (isNaN(customerIdNum)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid customer ID'
            });
        }

        const success = await CustomerTokenService.deactivateToken(customerIdNum);

        if (success) {
            console.log(`✅ Token deactivated for customer ${customerIdNum}`);

            res.json({
                success: true,
                message: 'Token berhasil dinonaktifkan'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Gagal menonaktifkan token'
            });
        }

    } catch (error) {
        console.error('Error deactivating token:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /admin/token-management/bulk-operations
 * Bulk operations page
 */
router.get('/bulk-operations', authenticateAdmin, async (req, res) => {
    try {
        res.render('admin/token-management/bulk-operations', {
            title: 'Bulk Token Operations',
            currentPage: 'token-management'
        });

    } catch (error) {
        console.error('Error loading bulk operations page:', error);
        res.status(500).render('error', {
            message: 'Error loading bulk operations page',
            error: error.message
        });
    }
});

/**
 * POST /admin/token-management/bulk-generate
 * Generate tokens for all customers
 */
router.post('/bulk-generate', authenticateAdmin, async (req, res) => {
    try {
        const { expiresIn = '30d', overwrite = false } = req.body;

        console.log(`🔄 Starting bulk token generation (overwrite: ${overwrite})...`);

        const results = await CustomerTokenService.generateTokensForAllCustomers(expiresIn);

        console.log(`✅ Bulk token generation completed: ${results.success} success, ${results.errors} errors`);

        res.json({
            success: true,
            message: 'Bulk token generation completed',
            data: {
                totalSuccess: results.success,
                totalErrors: results.errors,
                sampleTokens: results.tokenData.slice(0, 10),
                allTokens: results.tokenData
            }
        });

    } catch (error) {
        console.error('Error in bulk token generation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /admin/token-management/cleanup
 * Clean up expired tokens
 */
router.post('/cleanup', authenticateAdmin, async (req, res) => {
    try {
        console.log('🧹 Starting token cleanup...');

        const cleanedCount = await CustomerTokenService.cleanupExpiredTokens();

        console.log(`✅ Token cleanup completed: ${cleanedCount} tokens cleaned`);

        res.json({
            success: true,
            message: 'Token cleanup completed',
            data: {
                cleanedTokens: cleanedCount
            }
        });

    } catch (error) {
        console.error('Error during token cleanup:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /admin/token-management/export
 * Export tokens as CSV
 */
router.get('/export', authenticateAdmin, async (req, res) => {
    try {
        const customers = await Customer.findAll({
            where: {
                portal_access_token: {
                    [require('sequelize').Op.not]: null
                }
            },
            attributes: ['id', 'name', 'phone', 'username', 'portal_access_token', 'token_expires_at', 'status']
        });

        // Generate CSV
        const csv = [
            ['Customer ID', 'Name', 'Phone', 'Username', 'Status', 'Token', 'Expires At', 'Login URL'],
            ...customers.map(customer => {
                const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
                const loginUrl = `${baseUrl}/customer/login/${customer.portal_access_token}`;
                return [
                    customer.id,
                    customer.name || '',
                    customer.phone,
                    customer.username || '',
                    customer.status,
                    customer.portal_access_token,
                    customer.token_expires_at ? customer.token_expires_at.toISOString() : '',
                    loginUrl
                ];
            })
        ].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="customer-tokens-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);

    } catch (error) {
        console.error('Error exporting tokens:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /admin/token-management/whatsapp-billing
 * Send billing notifications with portal links
 */
router.get('/whatsapp-billing', authenticateAdmin, async (req, res) => {
    try {
        res.render('admin/token-management/whatsapp-billing', {
            title: 'WhatsApp Billing Notifications',
            currentPage: 'token-management'
        });

    } catch (error) {
        console.error('Error loading WhatsApp billing page:', error);
        res.status(500).render('error', {
            message: 'Error loading WhatsApp billing page',
            error: error.message
        });
    }
});

/**
 * POST /admin/token-management/send-whatsapp-billing
 * Send WhatsApp notifications with portal links
 */
router.post('/send-whatsapp-billing', authenticateAdmin, async (req, res) => {
    try {
        const { customerType = 'all', includePaymentInfo = false } = req.body;

        console.log(`📱 Starting WhatsApp billing notifications for ${customerType} customers...`);

        // Get customers based on type
        const allCustomers = billing.getAllCustomers();
        let targetCustomers = allCustomers;

        if (customerType === 'overdue') {
            targetCustomers = allCustomers.filter(customer =>
                customer.payment_status === 'overdue'
            );
        } else if (customerType === 'active') {
            targetCustomers = allCustomers.filter(customer =>
                customer.status === 'active'
            );
        }

        let successCount = 0;
        let errorCount = 0;
        const results = [];

        for (const customer of targetCustomers) {
            try {
                // Check if customer has unpaid invoices
                const customerInvoices = billing.getInvoices(customer.username);
                const unpaidInvoices = customerInvoices.filter(inv => inv.status === 'unpaid');

                if (unpaidInvoices.length > 0) {
                    const latestInvoice = unpaidInvoices[0];

                    const result = await BillingTokenIntegration.sendBillingNotificationWithPortal(
                        latestInvoice,
                        { includePaymentInfo }
                    );

                    if (result.success) {
                        successCount++;
                        results.push({
                            customer: customer.name,
                            phone: customer.phone,
                            status: 'success',
                            portalUrl: result.portalUrl
                        });
                    } else {
                        errorCount++;
                        results.push({
                            customer: customer.name,
                            phone: customer.phone,
                            status: 'failed',
                            error: result.error
                        });
                    }
                }
            } catch (error) {
                errorCount++;
                results.push({
                    customer: customer.name,
                    phone: customer.phone,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        console.log(`✅ WhatsApp notifications completed: ${successCount} success, ${errorCount} errors`);

        res.json({
            success: true,
            message: 'WhatsApp notifications completed',
            data: {
                totalCustomers: targetCustomers.length,
                successCount,
                errorCount,
                results: results.slice(0, 20) // Return first 20 results as sample
            }
        });

    } catch (error) {
        console.error('Error sending WhatsApp billing notifications:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper functions
async function getTokenStats() {
    try {
        const totalCustomers = await Customer.count();
        const activeTokens = await Customer.count({
            where: {
                portal_access_token: {
                    [require('sequelize').Op.not]: null
                },
                token_expires_at: {
                    [require('sequelize').Op.gte]: new Date()
                }
            }
        });
        const expiredTokens = await Customer.count({
            where: {
                portal_access_token: {
                    [require('sequelize').Op.not]: null
                },
                token_expires_at: {
                    [require('sequelize').Op.lt]: new Date()
                }
            }
        });

        return {
            totalCustomers,
            activeTokens,
            expiredTokens,
            noTokens: totalCustomers - activeTokens - expiredTokens,
            tokenCoverage: totalCustomers > 0 ? ((activeTokens / totalCustomers) * 100).toFixed(1) : 0
        };
    } catch (error) {
        console.error('Error getting token stats:', error);
        return {
            totalCustomers: 0,
            activeTokens: 0,
            expiredTokens: 0,
            noTokens: 0,
            tokenCoverage: 0
        };
    }
}

async function getRecentTokenActivity() {
    try {
        const recentCustomers = await Customer.findAll({
            where: {
                portal_access_token: {
                    [require('sequelize').Op.not]: null
                }
            },
            attributes: ['id', 'name', 'phone', 'portal_access_token', 'token_expires_at', 'updated_at'],
            order: [['updated_at', 'DESC']],
            limit: 10
        });

        return recentCustomers.map(customer => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            token: customer.portal_access_token,
            expiresAt: customer.token_expires_at,
            updatedAt: customer.updated_at,
            isExpired: customer.token_expires_at && customer.token_expires_at < new Date()
        }));
    } catch (error) {
        console.error('Error getting recent token activity:', error);
        return [];
    }
}

module.exports = router;