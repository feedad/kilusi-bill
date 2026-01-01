/**
 * Script to update customer device settings token handling
 * This script ensures both login methods (token URL and phone/OTP) work correctly
 */

const { query } = require('../config/database');
const CustomerTokenService = require('../services/customer-token-service');

async function fixDeviceSettingsToken() {
    try {
        console.log('🔧 Fixing device settings token handling...');

        // Get Ferry Adhitya customer data
        const customerQuery = 'SELECT id, name, phone FROM customers WHERE phone = $1 LIMIT 1';
        const customerResult = await query(customerQuery, ['628115345333']);

        if (customerResult.rows.length === 0) {
            console.log('❌ Customer Ferry Adhitya not found');
            return;
        }

        const customer = customerResult.rows[0];
        console.log('✅ Found customer:', customer.name);

        // Generate a consistent portal_access_token for device settings
        const tokenData = await CustomerTokenService.generateCustomerToken(
            customer.id,
            '30d',
            { purpose: 'customer-device-settings' }
        );

        console.log('✅ Generated portal_access_token for device settings');
        console.log('🔑 Token:', tokenData.token);

        // Store the portal_access_token in customer record
        const updateQuery = `
            UPDATE customers
            SET portal_access_token = $1, token_expires_at = $2
            WHERE id = $3
        `;

        await query(updateQuery, [tokenData.token, tokenData.expiresAt, customer.id]);

        console.log('✅ Updated customer portal_access_token');
        console.log('🎯 Ferry Adhitya can now use both login methods for device settings!');
        console.log('');
        console.log('📱 Login Methods:');
        console.log('1. Phone/OTP: Will get JWT token, then convert to portal_access_token');
        console.log('2. Token URL: Uses portal_access_token directly');
        console.log('');
        console.log('🔑 Portal Access Token:', tokenData.token);
        console.log('📱 Login URL:', `http://localhost:3001/customer/login/${tokenData.token}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

fixDeviceSettingsToken();