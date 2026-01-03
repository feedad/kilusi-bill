// const Tripay = require('./config/tripay'); // Removed incorrect import
const PaymentGatewayManager = require('./config/paymentGateway');
const { query } = require('./config/database');

// Mock configs if needed or load from env
require('dotenv').config();

async function debugTripay() {
    try {
        console.log("--- Initializing Payment Gateway Manager ---");
        const manager = new PaymentGatewayManager();
        await manager.ensureInitialized();


        console.log("\n--- Active Gateway: " + manager.activeGateway + " ---");

        // Force use of Tripay gateway for debugging, or fall back to active
        const gateway = manager.gateways.tripay || manager.gateways[manager.activeGateway];

        if (!gateway) {
            console.error("No active gateway found OR Tripay not enabled!");
            console.log("Available gateways:", Object.keys(manager.gateways));
            return;
        }


        console.log("Credentials:", {
            apiKey: gateway.config.api_key ? 'Set (***)' : 'Missing',
            privateKey: gateway.config.private_key ? 'Set (***)' : 'Missing',
            merchantCode: gateway.config.merchant_code,
            mode: gateway.config.production ? 'Production' : 'Sandbox',
            baseUrl: gateway.baseUrl
        });

        console.log("\n--- Fetching Payment Channels from Tripay (RAW) ---");
        const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;

        try {
            const res = await fetchFn(`${gateway.baseUrl}/merchant/payment-channel`, {
                headers: { 'Authorization': `Bearer ${gateway.config.api_key}` }
            });
            const result = await res.json();

            if (!res.ok || !result.success) {
                console.error("API Error Response:", result);
            } else {
                console.log("\n--- RAW CHANNELS DATA ---");
                result.data.forEach(ch => {
                    console.log(`\nCode: [${ch.code}] | Name: ${ch.name}`);
                    console.log(`Active: ${ch.active}`);
                    console.log(`Fee Customer: Flat ${ch.fee_customer?.flat}, Percent ${ch.fee_customer?.percent}%`);
                    console.log(`Fee Merchant: Flat ${ch.fee_merchant?.flat}, Percent ${ch.fee_merchant?.percent}%`);
                    console.log(`Total Fee: Flat ${ch.total_fee?.flat}, Percent ${ch.total_fee?.percent}%`);
                });
            }
        } catch (fetchError) {
            console.error("Fetch failed:", fetchError);
        }

    } catch (e) {
        console.error("Debug Error:", e);
        if (e.response) {
            console.error("API Response:", e.response.data);
        }
    } finally {
        process.exit();
    }
}

debugTripay();
