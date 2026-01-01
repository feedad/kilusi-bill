const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Default secret from source code
const DEFAULT_SECRET = 'your-customer-jwt-secret-key-change-in-production';
const SECRET = process.env.CUSTOMER_JWT_SECRET || DEFAULT_SECRET;

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiMDAwOTQiLCJwaG9uZSI6IjYyODUyMTU1OTgwNDUiLCJ0eXBlIjoiY3VzdG9tZXIiLCJpYXQiOjE3NjcxNTY3NDgsImV4cCI6MTc2OTc0ODc0OH0.m82P9MqwLLwMGQSLuAcKmfIeAMag-sOhu_0nj9YHrD4';

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'kilusi_bill',
    port: process.env.POSTGRES_PORT || 5432
});

async function run() {
    console.log('--- DEBUGGING TOKEN ---');
    console.log('Secret used:', SECRET);

    try {
        const decoded = jwt.verify(token, SECRET);
        console.log('✅ Token verify SUCCESS');
        console.log('Decoded:', decoded);
        console.log('customerId type:', typeof decoded.customerId);

        console.log('--- CHECKING DB ---');
        // Check exact match
        const res1 = await pool.query('SELECT id, name, status, customer_id FROM customers WHERE id = $1', [decoded.customerId]);
        console.log(`Query "WHERE id = '${decoded.customerId}'" rows:`, res1.rows.length);
        if (res1.rows.length > 0) console.log('Row:', res1.rows[0]);

        // Check cast to int if string
        if (typeof decoded.customerId === 'string') {
            const asInt = parseInt(decoded.customerId, 10);
            console.log(`Checking as int: ${asInt}`);
            const res2 = await pool.query('SELECT id, name, status, customer_id FROM customers WHERE id = $1', [asInt]);
            console.log(`Query "WHERE id = ${asInt}" rows:`, res2.rows.length);
        }

    } catch (e) {
        console.error('❌ Token verify FAILED:', e.message);
    } finally {
        pool.end();
    }
}

run();
