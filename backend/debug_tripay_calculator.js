require('dotenv').config();
const crypto = require('crypto');
// const fetch = require('node-fetch'); // Native fetch available in Node 18+
const { query } = require('./config/database');

// Mock function to get settings from DB
async function getSettings() {
    try {
        const res = await query("SELECT config FROM payment_gateway_settings WHERE gateway = 'tripay'");
        if (res.rows.length > 0) {
            const row = res.rows[0];
            return typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
        }
    } catch (e) {
        console.error("DB Error:", e);
    }
    return null;
}

async function run() {
    const settings = await getSettings();
    if (!settings) {
        console.error("No tripay settings found");
        return;
    }

    const config = settings;
    // const config = settings.tripay;
    const baseUrl = config.production ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox';
    const amount = 150000;

    console.log(`Using Base URL: ${baseUrl}`);
    console.log(`Testing Amount: ${amount}`);

    // Test 1: With Code
    console.log("\n--- Test 1: Specific Code (QRISC) ---");
    try {
        const res = await fetch(`${baseUrl}/merchant/fee-calculator?code=QRISC&amount=${amount}`, {
            headers: { 'Authorization': `Bearer ${config.api_key}` }
        });
        const data = await res.json();
        console.log("Result (QRISC):", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error Test 1:", e.message);
    }

    // Test 2: Without Code (Bulk?)
    console.log("\n--- Test 2: No Code (Bulk Check) ---");
    try {
        const res = await fetch(`${baseUrl}/merchant/fee-calculator?amount=${amount}`, {
            headers: { 'Authorization': `Bearer ${config.api_key}` }
        });
        const data = await res.json();
        console.log("Result (No Code):", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error Test 2:", e.message);
    }
}

run();
