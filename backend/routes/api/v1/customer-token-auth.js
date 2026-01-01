/**
 * Customer Token Authentication Routes
 * Handles token-based login and token management
 */

const express = require('express');
const router = express.Router();
const CustomerTokenService = require('../../../services/customer-token-service');
const { getSettingsWithCache } = require('../../../config/settingsManager');
const { getOne, getAll } = require('../../../config/database');

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
 * GET /customer/login/:token
 * Direct login with token
 */
router.get('/login/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.render('mobile-customer-login', {
                error: 'Token tidak valid',
                settings: getSettingsWithCache()
            });
        }

        // Validate token
        const validation = await CustomerTokenService.validateToken(token);

        if (!validation.valid) {
            return res.render('mobile-customer-login', {
                error: validation.error,
                settings: getSettingsWithCache()
            });
        }

        const { customer } = validation;

        // Create session
        req.session = req.session || {};
        req.session.phone = customer.phone;
        req.session.customer_id = customer.id;
        req.session.customer_name = customer.name;
        req.session.token_login = true;
        req.session.login_time = new Date();

        console.log(`✅ Token login successful: ${customer.name} (${customer.phone})`);

        // Redirect to dashboard
        res.redirect('/customer/dashboard');

    } catch (error) {
        console.error('Token login error:', error);
        res.render('mobile-customer-login', {
            error: 'Terjadi kesalahan saat login dengan token',
            settings: getSettingsWithCache()
        });
    }
});

/**
 * POST /api/v1/customer-token/generate/:customerId
 * Generate token for customer (admin only)
 */
router.post('/generate/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;
        const { expiresIn = '30d', regenerate = false } = req.body;

        const customerIdNum = parseInt(customerId);
        if (isNaN(customerIdNum)) {
            return res.status(400).json({
                success: false,
                error: 'Customer ID tidak valid'
            });
        }

        // Check if customer exists
        const customer = await getOne('SELECT id, name, phone, status FROM customers WHERE id = $1', [customerIdNum]);
        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer tidak ditemukan'
            });
        }

        let tokenData;
        if (regenerate) {
            tokenData = await CustomerTokenService.regenerateToken(customerIdNum, expiresIn);
        } else {
            tokenData = await CustomerTokenService.generateCustomerToken(customerIdNum, expiresIn);
        }

        res.json({
            success: true,
            message: 'Token berhasil dibuat',
            data: {
                ...tokenData,
                customerInfo: {
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
 * POST /api/v1/customer-token/regenerate/:customerId
 * Regenerate token for customer (admin only)
 */
router.post('/regenerate/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;
        const { expiresIn = '30d' } = req.body;

        const customerIdNum = parseInt(customerId);
        if (isNaN(customerIdNum)) {
            return res.status(400).json({
                success: false,
                error: 'Customer ID tidak valid'
            });
        }

        // Check if customer exists
        const customer = await getOne('SELECT id, name, phone, status FROM customers WHERE id = $1', [customerIdNum]);
        if (!customer) {
            return res.status(404).json({
                success: false,
                error: 'Customer tidak ditemukan'
            });
        }

        const tokenData = await CustomerTokenService.regenerateToken(customerIdNum, expiresIn);

        res.json({
            success: true,
            message: 'Token berhasil diperbarui',
            data: {
                ...tokenData,
                customerInfo: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    status: customer.status
                }
            }
        });

    } catch (error) {
        console.error('Error regenerating token:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/v1/customer-token/:customerId
 * Deactivate token for customer (admin only)
 */
router.delete('/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;

        const customerIdNum = parseInt(customerId);
        if (isNaN(customerIdNum)) {
            return res.status(400).json({
                success: false,
                error: 'Customer ID tidak valid'
            });
        }

        const success = await CustomerTokenService.deactivateToken(customerIdNum);

        if (success) {
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
 * GET /api/v1/customer-token/info/:customerId
 * Get token information for customer (admin only)
 */
router.get('/info/:customerId', authenticateAdmin, async (req, res) => {
    try {
        const { customerId } = req.params;

        const customerIdNum = parseInt(customerId);
        if (isNaN(customerIdNum)) {
            return res.status(400).json({
                success: false,
                error: 'Customer ID tidak valid'
            });
        }

        const tokenInfo = await CustomerTokenService.getCustomerTokenInfo(customerIdNum);

        if (tokenInfo) {
            res.json({
                success: true,
                data: tokenInfo
            });
        } else {
            res.json({
                success: true,
                data: null,
                message: 'Customer tidak memiliki token aktif'
            });
        }

    } catch (error) {
        console.error('Error getting token info:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/v1/customer-token/bulk-generate
 * Generate tokens for all active customers (admin only)
 */
router.post('/bulk-generate', authenticateAdmin, async (req, res) => {
    try {
        const { expiresIn = '30d', overwrite = false } = req.body;

        const results = await CustomerTokenService.generateTokensForAllCustomers(expiresIn);

        res.json({
            success: true,
            message: 'Bulk token generation completed',
            data: {
                totalSuccess: results.success,
                totalErrors: results.errors,
                sampleTokens: results.tokenData.slice(0, 10), // Return first 10 as sample
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
 * POST /api/v1/customer-token/cleanup
 * Clean up expired tokens (admin only)
 */
router.post('/cleanup', authenticateAdmin, async (req, res) => {
    try {
        const cleanedCount = await CustomerTokenService.cleanupExpiredTokens();

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
 * GET /api/v1/customer-token/validate/:token
 * Validate token (public endpoint for checking)
 */
router.get('/validate/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                valid: false,
                error: 'Token tidak ada'
            });
        }

        const validation = await CustomerTokenService.validateToken(token);

        // Return limited info for public validation
        const publicResponse = {
            valid: validation.valid,
            error: validation.error,
            timestamp: new Date().toISOString()
        };

        // Add customer info only if valid
        if (validation.valid && validation.customer) {
            publicResponse.customer = {
                name: validation.customer.name,
                status: validation.customer.status
                // Don't expose sensitive data like phone, email in public validation
            };
        }

        res.json(publicResponse);

    } catch (error) {
        console.error('Error validating token:', error);
        res.status(500).json({
            valid: false,
            error: 'Error saat validasi token'
        });
    }
});

/**
 * GET /api/v1/customer-token/export/csv
 * Export all tokens as CSV (admin only)
 */
router.get('/export/csv', authenticateAdmin, async (req, res) => {
    try {
        const customers = await getAll('SELECT id, name, phone, portal_access_token, token_expires_at, status FROM customers WHERE portal_access_token IS NOT NULL');

        // Generate CSV
        const csv = [
            ['Customer ID', 'Name', 'Phone', 'Status', 'Token', 'Expires At', 'Login URL'],
            ...customers.map(customer => {
                const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
                const loginUrl = `${baseUrl}/customer/login/${customer.portal_access_token}`;
                return [
                    customer.id,
                    customer.name,
                    customer.phone,
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

module.exports = router;