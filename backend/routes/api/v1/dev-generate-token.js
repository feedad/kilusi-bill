/**
 * Development-only endpoint to generate customer tokens
 * This endpoint should be removed in production
 */

const express = require('express');
const router = express.Router();
const CustomerTokenService = require('../../../services/customer-token-service');

/**
 * POST /api/v1/dev-generate-token/by-phone
 * Generate token for customer by phone number (development only)
 */
router.post('/by-phone', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Log for development
        console.log('🔧 Development: Generating token for phone:', phone);

        // Try to find customer in real database
        const { query } = require('../../../config/database');

        let customer = null;
        try {
            // Normalize phone number - try both with and without leading '0'
            const normalizedPhone = phone.startsWith('0') ? '62' + phone.substring(1) : phone;
            const customerQuery = 'SELECT * FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1';
            const result = await query(customerQuery, [phone, normalizedPhone]);

            if (result.rows.length > 0) {
                customer = result.rows[0];
                console.log('✅ Found customer in database:', customer.name);
            }
        } catch (dbError) {
            console.error('Database query error:', dbError);

            // Fallback to hardcoded data if database fails
            const mockCustomerData = {
                '08115345333': {
                    id: 3,
                    name: 'Ferry Adhitya',
                    phone: '08115345333',
                    email: 'ferryadhitya@example.com',
                    status: 'active',
                    package_name: 'UpTo-50M',
                    package_price: '300000.00',
                    address: 'Jakarta, Indonesia',
                    pppoe_username: 'ferryadhitya',
                    customer_id: '25110700001'
                }
            };

            customer = mockCustomerData[phone];
            if (customer) {
                console.log('🔧 Using fallback data for Ferry Adhitya');
            }
        }

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found for this phone number'
            });
        }

        // Generate token
        const tokenData = await CustomerTokenService.generateCustomerToken(
            customer.id,
            '30d',
            { purpose: 'customer-portal-dev' }
        );

        console.log('✅ Development: Token generated successfully for', customer.name);

        res.json({
            success: true,
            message: 'Token generated successfully (development mode)',
            data: {
                token: tokenData.token,
                customer: customer,
                loginUrl: `http://localhost:3001/customer/login/${tokenData.token}`,
                expiresAt: tokenData.expiresAt
            }
        });

    } catch (error) {
        console.error('Development token generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate token: ' + error.message
        });
    }
});

module.exports = router;