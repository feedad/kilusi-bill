const { Pool } = require('pg');
const { logger } = require('../config/logger');
require('dotenv').config();

// Direct connection for migration to avoid settingsManager issues in shell
const pool = new Pool({
    host: '127.0.0.1', // Force localhost for shell execution
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'kilusi_bill',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
});

async function migrate() {
    try {
        console.log('Connecting to database...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS uptime_monitors (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                target VARCHAR(255) NOT NULL,
                type VARCHAR(20) DEFAULT 'icmp', -- icmp, http
                interval INTEGER DEFAULT 60, -- seconds
                status VARCHAR(20) DEFAULT 'unknown', -- up, down, unknown
                response_time INTEGER DEFAULT 0, -- ms
                last_checked TIMESTAMP,
                history JSONB DEFAULT '[]'::jsonb, -- Store last 50 checks: [{ts, latency, status}]
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Migration: uptime_monitors table created successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

migrate();
