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
        console.log('--- CHECKING NAS_SERVERS SCHEMA ---');
        // Check if table exists
        const tableCheck = await pool.query("SELECT to_regclass('public.nas_servers')");
        if (!tableCheck.rows[0].to_regclass) {
            console.log('❌ Table nas_servers DOES NOT EXIST');
            return;
        }

        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'nas_servers' ORDER BY column_name");
        const columns = res.rows.map(r => r.column_name);
        console.log('Columns in nas_servers table:');
        console.log(columns.join(', '));

    } catch (e) {
        console.error('❌ Schema check FAILED:', e.message);
    } finally {
        pool.end();
    }
}

run();
