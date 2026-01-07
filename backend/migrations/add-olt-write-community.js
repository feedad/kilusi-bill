const { query } = require('../config/database');

const up = async () => {
    await query(`
        ALTER TABLE olts 
        ADD COLUMN IF NOT EXISTS snmp_write_community VARCHAR(255) DEFAULT 'private'
    `);
    console.log('Added snmp_write_community to olts table');
};

const down = async () => {
    await query('ALTER TABLE olts DROP COLUMN IF EXISTS snmp_write_community');
};

module.exports = { up, down };
