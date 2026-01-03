const { query } = require('./config/database');
async function checkSettings() {
    try {
        console.log('--- PAYMENT SETTINGS (Manual) ---');
        const res1 = await query("SELECT * FROM app_config WHERE key = 'payment_settings' OR key = 'paymentSettings'");
        console.log(JSON.stringify(res1.rows, null, 2));

        console.log('--- TRIPAY SETTINGS ---');
        const res2 = await query("SELECT * FROM payment_gateway_settings WHERE gateway = 'tripay'");
        console.log(JSON.stringify(res2.rows, null, 2));
    } catch (e) { console.error(e); }
}
checkSettings().then(() => process.exit());
