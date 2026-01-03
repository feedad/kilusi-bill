const { query } = require('./config/database');

async function update() {
    try {
        const config = JSON.stringify({
            api_key: 'DEV-61BVS8T4OVcP74L1GjCT78KhcWMVNBnNyzYPz2W4',
            private_key: 'qS2mE-UmxT8-4tEDq-KrwX4-ic2SH',
            merchant_code: 'T21937',
            production: false,
            base_url: 'https://api.kilusi.id'
        });

        console.log('Updating Tripay settings...');
        const result = await query(
            'UPDATE payment_gateway_settings SET is_enabled = true, config = $1 WHERE gateway = $2 RETURNING *',
            [config, 'tripay']
        );

        if (result.rowCount > 0) {
            console.log('✅ Tripay settings updated successfully!');
            console.log('New Config:', result.rows[0].config);
        } else {
            console.error('❌ Update failed: Gateway not found');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

update();
