const { query } = require('./config/database');

async function check() {
    try {
        const fetch = (await import('node-fetch')).default;

        console.log('--- TABLES ---');
        const res = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:', res.rows.map(r => r.table_name).join(', '));

        console.log('\n--- TRIPAY TEST ---');
        const res2 = await query("SELECT config FROM payment_gateway_settings WHERE gateway = 'tripay'");
        if (res2.rows.length > 0) {
            let config = res2.rows[0].config;
            if (typeof config === 'string') {
                try { config = JSON.parse(config); } catch (e) { }
            }

            const apiKey = config.api_key;
            const baseUrl = config.production ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox';

            console.log(`URL: ${baseUrl}/merchant/payment-channel`);
            console.log(`API Key: ${apiKey ? 'Present' : 'Missing'}`);

            const apiRes = await fetch(`${baseUrl}/merchant/payment-channel`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const json = await apiRes.json();
            console.log('Success:', json.success);
            console.log('Message:', json.message);
            console.log('Data Length:', json.data ? json.data.length : 0);
            if (json.data && json.data.length > 0) {
                console.log('First Channel:', json.data[0].name, 'Active:', json.data[0].active);
            }
        } else {
            console.log('Tripay config not found in DB');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => setTimeout(() => process.exit(0), 1000));
