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
        console.log('--- CHECKING REGIONS SCHEMA ---');
        // Check if table exists
        const tableCheck = await pool.query("SELECT to_regclass('public.regions')");
        if (!tableCheck.rows[0].to_regclass) {
            console.log('❌ Table regions DOES NOT EXIST');
            return;
        }

        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'regions' ORDER BY column_name");
        console.log('Columns:', res.rows.map(r => r.column_name).join(', '));

        const count = await pool.query('SELECT count(*) FROM regions');
        console.log('Row count:', count.rows[0].count);

    } catch (e) {
        console.error('❌ Schema check FAILED:', e.message);
    } finally {
        pool.end();
    }
}

run();
