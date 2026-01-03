const { query } = require('./config/database');
const SettingsManager = require('./config/settingsManager');

async function debugMethods() {
    await SettingsManager.initialize();

    // 1. Check Global Settings via Manager
    const paymentSettings = SettingsManager.getSetting('payment_settings') || SettingsManager.getSetting('paymentSettings');
    console.log('--- SettingsManager.getSetting ---');
    console.log(JSON.stringify(paymentSettings, null, 2));

    // 2. Check DB fallback
    console.log('--- DB Fallback (payment_gateway_settings) ---');
    const res = await query("SELECT config FROM payment_gateway_settings WHERE gateway = 'manual'");
    if (res.rows.length > 0) {
        console.log(res.rows[0].config);
    } else {
        console.log('No manual gateway in separate table');
    }
}
debugMethods().then(() => process.exit());
