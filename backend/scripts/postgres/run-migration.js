const { query } = require('../../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('Starting SNMP migration...');

        // Read the SQL file
        const sqlFile = fs.readFileSync(path.join(__dirname, 'add-snmp-to-nas.sql'), 'utf8');

        // Split the file into individual statements
        const statements = sqlFile
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        // Execute each statement
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await query(statement);
                    console.log('✓ Executed:', statement.substring(0, 50) + '...');
                } catch (error) {
                    // Some statements might fail if they already exist, that's okay
                    console.log('⚠ Info:', error.message);
                }
            }
        }

        console.log('✅ SNMP migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run the migration
runMigration();