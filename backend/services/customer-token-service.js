/**
 * Customer Token Service
 * Handles token-based authentication for customer portal access
 * Token expiry is based on customer's billing cycle (isolir_date)
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
     * Get customer service billing expiry (isolir_date)
     * @param {number} customerId - Customer ID
     * @returns {Date|null} Billing expiry date or null
     */
    static async getCustomerBillingExpiry(customerId) {
        try {
            const service = await getOne(
                'SELECT isolir_date, status FROM services WHERE customer_id = $1',
                [customerId]
            );
            return service ? service.isolir_date : null;
        } catch (error) {
            logger.error('Error getting customer billing expiry:', error);
            return null;
        }
    }

    /**
     * Generate token for customer
     * Token expiry is based on customer's billing cycle (isolir_date)
     * Falls back to 30 days if no isolir_date exists
     * @param {number} customerId - Customer ID
     * @param {string} fallbackExpiresIn - Fallback expiration if no billing cycle (default '30d')
     * @param {Object} options - Additional options
     * @returns {Object} Token data with login URL
     */
    static async generateCustomerToken(customerId, fallbackExpiresIn = '365d', options = {}) {
        const token = this.generateSecureToken();

        // Token valid 365 hari — independent dari billing cycle
        // Diregenerate saat invoice baru diterbitkan
        const expiresAt = new Date();
        const days = parseInt(fallbackExpiresIn);
        expiresAt.setDate(expiresAt.getDate() + (days || 365));

        try {
            // Update customers table (quick lookup)
            await query(
                'UPDATE customers SET portal_access_token = $1, token_expires_at = $2 WHERE id = $3',
                [token, expiresAt, customerId]
            );

            // Get customer data (only existing columns in customers table)
            const customer = await getOne(
                'SELECT id, name, phone, email FROM customers WHERE id = $1',
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
                billingExpiry, // Include for reference
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
     * Checks token expiry AND service status
     * @param {string} token - Token to validate
     * @returns {Object} Validation result with customer data
     */
    static async validateToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return { valid: false, error: 'Invalid token format' };
            }

            // Check in customers table with service join for status validation
            const result = await query(
                `SELECT c.id, c.name, c.phone, c.email,
                        p.name as package_name, p.price as package_price,
                        s.status as service_status, s.isolir_date
                 FROM customers c
                 LEFT JOIN services s ON s.customer_id::text = c.id
                 LEFT JOIN packages p ON s.package_id = p.id
                 WHERE c.portal_access_token = $1 AND c.token_expires_at >= $2
                 LIMIT 1`,
                [token, new Date()]
            );

            if (result.rows.length > 0) {
                const customer = result.rows[0];

                return {
                    valid: true,
                    customer: {
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone,
                        email: customer.email,
                        status: customer.service_status || 'active',
                        package_id: null,
                        package_name: customer.package_name,
                        package_price: parseFloat(customer.package_price) || 0,
                        customer_id: customer.id,
                        address: null
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
     * @param {string} fallbackExpiresIn - Fallback expiration period
     * @returns {Object} New token data
     */
    static async regenerateToken(customerId, fallbackExpiresIn = '365d') {
        try {
            // Clear existing token
            await query(
                'UPDATE customers SET portal_access_token = NULL, token_expires_at = NULL WHERE id = $1',
                [customerId]
            );

            // Generate new token
            return await this.generateCustomerToken(customerId, fallbackExpiresIn);

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
     * @param {string} fallbackExpiresIn - Fallback expiration period
     * @returns {Object} Results with success count and errors
     */
    static async generateTokensForAllCustomers(fallbackExpiresIn = '30d') {
        try {
            const customers = await getAll(
                'SELECT id, name, phone FROM customers WHERE 1=1'
            );

            const results = {
                success: 0,
                errors: 0,
                tokenData: []
            };

            for (const customer of customers) {
                try {
                    const tokenData = await this.generateCustomerToken(customer.id, fallbackExpiresIn);
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
