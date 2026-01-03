const PaymentGatewayManager = require('./config/paymentGateway');
const SettingsManager = require('./config/settingsManager');

async function debugTripayWithLimits() {
    await SettingsManager.initialize();
    const pgm = new PaymentGatewayManager();
    await pgm.ensureInitialized();

    console.log('--- TRIPAY METHODS (POST-FIX) ---');
    try {
        if (pgm.gateways.tripay) {
            const methods = await pgm.gateways.tripay.getAvailablePaymentMethods();
            methods.forEach(m => {
                console.log(`Code: ${m.method} | Name: ${m.name} | Type: ${m.type} | Min: ${m.minimum_amount} | Max: ${m.maximum_amount}`);
            });
            console.log(`Total Methods: ${methods.length}`);
        } else {
            console.log('Tripay gateway not initialized');
        }
    } catch (e) { console.error(e); }
}
debugTripayWithLimits().then(() => process.exit());
