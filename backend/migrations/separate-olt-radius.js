const { query } = require('../config/database');

const up = async () => {
    // Enable UUID extension
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await query(`
        CREATE TABLE IF NOT EXISTS olts (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL,
            host VARCHAR(255) NOT NULL,
            snmp_community VARCHAR(255) NOT NULL DEFAULT 'public',
            snmp_version VARCHAR(10) DEFAULT '2c',
            snmp_port INTEGER DEFAULT 161,
            type VARCHAR(50) DEFAULT 'zte', -- zte, huawei, hsgq, etc.
            description TEXT,
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Created olts table');
};

const down = async () => {
    await query('DROP TABLE IF EXISTS olts');
};

module.exports = { up, down };
