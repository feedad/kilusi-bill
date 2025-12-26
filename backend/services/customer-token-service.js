/**
 * Customer Token Service
 * Handles token-based authentication for customer portal access
 */

const crypto = require('crypto');
const { query, getOne, getAll } = require('../config/database');
const { logger } = require('../config/logger');

class CustomerTokenService {
    /**
     * Generate secure random token
     * @returns {string} 20-character uppercase alphanumeric token
     */
    static generateSecureToken() {
        const bytes = crypto.randomBytes(20);
        const token = bytes.toString('hex').toUpperCase();
        return token;
    }

    /**
     * Generate token for customer
     * @param {number} customerId - Customer ID
     * @param {string} expiresIn - Expiration period (e.g., '30d', '7d', '24h')
     * @param {Object} options - Additional options
     * @returns {Object} Token data with login URL
     */
    static async generateCustomerToken(customerId, expiresIn = '30d', options = {}) {
        const token = this.generateSecureToken();
        const expiresAt = new Date();

        // Calculate expiration
        if (expiresIn.endsWith('d')) {
            const days = parseInt(expiresIn);
            expiresAt.setDate(expiresAt.getDate() + days);
        } else if (expiresIn.endsWith('h')) {
            const hours = parseInt(expiresIn);
            expiresAt.setHours(expiresAt.getHours() + hours);
        } else if (expiresIn.endsWith('m')) {
            const minutes = parseInt(expiresIn);
            expiresAt.setMinutes(expiresAt.getMinutes() + minutes);
        }

        try {
            // Update customers table (quick lookup)
            await query(
                'UPDATE customers SET portal_access_token = $1, token_expires_at = $2 WHERE id = $3',
                [token, expiresAt, customerId]
            );

            // Get customer data
            const customer = await getOne(
                'SELECT id, name, phone, email, pppoe_username, status, package_id FROM customers WHERE id = $1',
                [customerId]
            );

            if (!customer) {
                throw new Error('Customer not found');
            }

            // Get base URL from environment or settings
            const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';

            const loginUrl = `${baseUrl}/customer/login/${token}`;

            return {
                success: true,
                token,
                customerId,
                expiresAt,
                loginUrl,
                customer: {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email
                }
            };

        } catch (error) {
            console.error('Error generating customer token:', error);
            throw error;
        }
    }

    /**
     * Validate token and return customer data
     * @param {string} token - Token to validate
     * @returns {Object} Validation result with customer data
     */
    static async validateToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return { valid: false, error: 'Invalid token format' };
            }

            // Check in customers table with package join (to get package details)
            const customer = await getOne(
                `SELECT c.id, c.name, c.phone, c.pppoe_username, c.email, c.status,
                        c.package_id, c.customer_id, c.address,
                        p.name as package_name, p.price as package_price
                 FROM customers c
                 LEFT JOIN packages p ON c.package_id = p.id
                 WHERE c.portal_access_token = $1 AND c.token_expires_at >= $2`,
                [token, new Date()]
            );

            if (customer) {
  
                return {
                    valid: true,
                    customer: {
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        username: customer.pppoe_username,
                        email: customer.email,
                        status: customer.status,
                        package_id: customer.package_id,
                        package_name: customer.package_name,
                        package_price: customer.package_price,
                        customer_id: customer.customer_id,
                        address: customer.address
                    }
                };
            }

            return { valid: false, error: 'Token tidak valid atau sudah kadaluarsa' };

        } catch (error) {
            console.error('Token validation error:', error);
            return {
                valid: false,
                error: 'Error saat validasi token'
            };
        }
    }

    /**
     * Regenerate token for customer (deactivate old one)
     * @param {number} customerId - Customer ID
     * @param {string} expiresIn - New expiration period
     * @returns {Object} New token data
     */
    static async regenerateToken(customerId, expiresIn = '30d') {
        try {
            // Clear existing token
            await query(
                'UPDATE customers SET portal_access_token = NULL, token_expires_at = NULL WHERE id = $1',
                [customerId]
            );

            // Generate new token
            return await this.generateCustomerToken(customerId, expiresIn);

        } catch (error) {
            console.error('Error regenerating token:', error);
            throw error;
        }
    }

    /**
     * Deactivate token for customer
     * @param {number} customerId - Customer ID
     * @returns {boolean} Success status
     */
    static async deactivateToken(customerId) {
        try {
            await query(
                'UPDATE customers SET portal_access_token = NULL, token_expires_at = NULL WHERE id = $1',
                [customerId]
            );

            return true;

        } catch (error) {
            console.error('Error deactivating token:', error);
            return false;
        }
    }

    /**
     * Get customer token info
     * @param {number} customerId - Customer ID
     * @returns {Object|null} Token information
     */
    static async getCustomerTokenInfo(customerId) {
        try {
            const customer = await getOne(
                'SELECT id, portal_access_token, token_expires_at FROM customers WHERE id = $1',
                [customerId]
            );

            if (!customer || !customer.portal_access_token) {
                return null;
            }

            const isExpired = customer.token_expires_at && customer.token_expires_at < new Date();
            const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';

            return {
                token: customer.portal_access_token,
                expiresAt: customer.token_expires_at,
                isExpired,
                loginUrl: `${baseUrl}/customer/login/${customer.portal_access_token}`,
                customerId: customer.id
            };

        } catch (error) {
            console.error('Error getting token info:', error);
            return null;
        }
    }

    /**
     * Clean up expired tokens
     * @returns {number} Number of tokens cleaned up
     */
    static async cleanupExpiredTokens() {
        try {
            const result = await query(
                'UPDATE customers SET portal_access_token = NULL, token_expires_at = NULL WHERE token_expires_at < $1',
                [new Date()]
            );

            return result.rowCount; // Number of updated rows

        } catch (error) {
            console.error('Error cleaning up expired tokens:', error);
            return 0;
        }
    }

    /**
     * Generate tokens for all customers (bulk operation)
     * @param {string} expiresIn - Default expiration period
     * @returns {Object} Results with success count and errors
     */
    static async generateTokensForAllCustomers(expiresIn = '30d') {
        try {
            const customers = await getAll(
                'SELECT id, name, phone FROM customers WHERE status = $1',
                ['active']
            );

            const results = {
                success: 0,
                errors: 0,
                tokenData: []
            };

            for (const customer of customers) {
                try {
                    const tokenData = await this.generateCustomerToken(customer.id, expiresIn);
                    results.success++;
                    results.tokenData.push({
                        customerId: customer.id,
                        customerName: customer.name,
                        phone: customer.phone,
                        loginUrl: tokenData.loginUrl
                    });
                } catch (error) {
                    results.errors++;
                    console.error(`Failed to generate token for customer ${customer.id}:`, error);
                }
            }

            return results;

        } catch (error) {
            console.error('Error generating tokens for all customers:', error);
            throw error;
        }
    }

    /**
     * Generate QR code data for token login
     * @param {string} loginUrl - Login URL
     * @returns {Object} QR code data
     */
    static generateQRData(loginUrl) {
        return {
            text: loginUrl,
            type: 'URL',
            format: 'text'
        };
    }
}

module.exports = CustomerTokenService;