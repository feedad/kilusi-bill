/**
 * Check if 'siklus' column exists in customers table
 */

const { query } = require('../config/database');

async function checkSiklusColumn() {
    try {
        console.log('🔍 Checking for siklus column in customers table...');

        // Check if siklus column exists
        const result = await query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'customers' AND column_name = 'siklus'
        `);

        if (result.rows.length > 0) {
            console.log('✅ Found siklus column:', result.rows[0]);

            // Check column values
            const sampleData = await query(`
                SELECT siklus, COUNT(*) as count
                FROM customers
                WHERE siklus IS NOT NULL
                GROUP BY siklus
            `);

            if (sampleData.rows.length > 0) {
                console.log('📊 Existing siklus values:');
                sampleData.rows.forEach(row => {
                    console.log(`  - ${row.siklus}: ${row.count} customers`);
                });
            } else {
                console.log('ℹ️ No siklus values found in customers table');
            }
        } else {
            console.log('❌ siklus column not found in customers table');
        }

        // Show all columns in customers table for reference
        console.log('\n📋 All columns in customers table:');
        const allColumns = await query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'customers'
            ORDER BY ordinal_position
        `);

        allColumns.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
        });

    } catch (error) {
        console.error('❌ Error checking siklus column:', error);
    } finally {
        process.exit(0);
    }
}

checkSiklusColumn();