const PaymentGatewayManager = require('./config/paymentGateway');
const SettingsManager = require('./config/settingsManager');

async function debugTripay() {
    await SettingsManager.initialize();
    const pgm = new PaymentGatewayManager();
    await pgm.ensureInitialized();

    console.log('--- TRIPAY METHODS ---');
    try {
        if (pgm.gateways.tripay) {
            const methods = await pgm.gateways.tripay.getAvailablePaymentMethods();
            methods.forEach(m => {
                console.log(`Code: ${m.method} | Name: ${m.name} | Type: ${m.type}`);
            });
        } else {
            console.log('Tripay gateway not initialized');
        }
    } catch (e) { console.error(e); }
}
debugTripay().then(() => process.exit());
