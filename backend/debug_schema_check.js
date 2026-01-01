const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'kilusi_bill',
    port: process.env.POSTGRES_PORT || 5432
});

async function run() {
    try {
        console.log('--- CHECKING TABLE SCHEMA ---');
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' ORDER BY column_name");
        const columns = res.rows.map(r => r.column_name);
        console.log('Columns in customers table:');
        console.log(columns.join(', '));

        const required = ['status', 'wifi_password', 'ssid', 'nas_ip', 'mac_address', 'pppoe_password', 'package_id'];
        const missing = required.filter(c => !columns.includes(c));

        console.log('\nMissing Columns:', missing.length > 0 ? missing : 'NONE');

    } catch (e) {
        console.error('❌ Schema check FAILED:', e.message);
    } finally {
        pool.end();
    }
}

run();
