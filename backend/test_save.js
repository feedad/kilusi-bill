const { updateSetting } = require('./config/settingsManager');
const { query } = require('./config/database');

async function testSave() {
    try {
        console.log('Testing manual save...');
        await updateSetting('payment_settings', {
            bank_accounts: [{ bank_name: "BCA TEST", account_number: "8888", account_holder: "TEST HOLDER" }],
            ewallets: []
        });

        console.log('Checking DB...');
        const res = await query("SELECT * FROM app_config WHERE key = 'payment_settings'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
}
testSave().then(() => process.exit());
