const { query } = require('./config/database');
async function checkTripay() {
    try {
        console.log('--- DB CHECK ---');
        const res = await query("SELECT * FROM payment_gateway_settings WHERE gateway = 'tripay'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) { console.error(e); }
}
checkTripay().then(() => process.exit());
