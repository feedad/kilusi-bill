const { query } = require('../config/database');

async function updateBulkPaymentSettingsTable() {
    try {
        // Check if new columns already exist
        const checkColumns = await query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'bulk_payment_settings'
            AND table_schema = 'public'
        `);

        const existingColumns = checkColumns.rows.map(row => row.column_name);

        // Add new columns for dynamic discount types
        const newColumns = [
            'discount_1_month_type VARCHAR(20) DEFAULT \'percentage\'',
            'discount_1_month_value INTEGER DEFAULT 0',
            'discount_2_months_type VARCHAR(20) DEFAULT \'percentage\'',
            'discount_2_months_value INTEGER DEFAULT 0',
            'discount_3_months_type VARCHAR(20) DEFAULT \'percentage\'',
            'discount_3_months_value INTEGER DEFAULT 5',
            'discount_6_months_type VARCHAR(20) DEFAULT \'percentage\'',
            'discount_6_months_value INTEGER DEFAULT 10',
            'discount_12_months_type VARCHAR(20) DEFAULT \'percentage\'',
            'discount_12_months_value INTEGER DEFAULT 15'
        ];

        for (const columnDef of newColumns) {
            const columnName = columnDef.split(' ')[0];
            if (!existingColumns.includes(columnName)) {
                await query(`ALTER TABLE bulk_payment_settings ADD COLUMN ${columnDef}`);
                console.log(`✅ Added column: ${columnName}`);
            }
        }

        // Update existing record to set default values for new columns
        await query(`
            UPDATE bulk_payment_settings SET
                discount_1_month_type = 'percentage',
                discount_1_month_value = discount_1_month,
                discount_2_months_type = 'percentage',
                discount_2_months_value = discount_2_months,
                discount_3_months_type = 'percentage',
                discount_3_months_value = discount_3_months,
                discount_6_months_type = 'percentage',
                discount_6_months_value = discount_6_months,
                discount_12_months_type = 'percentage',
                discount_12_months_value = discount_12_months
            WHERE id = 1
        `);

        // Set your custom discount examples
        await query(`
            UPDATE bulk_payment_settings SET
                discount_3_months_type = 'percentage',
                discount_3_months_value = 10,
                discount_6_months_type = 'free_months',
                discount_6_months_value = 1,
                discount_12_months_type = 'free_months',
                discount_12_months_value = 2
            WHERE id = 1
        `);

        console.log('✅ Bulk payment settings table updated with dynamic discount types');
        console.log('📋 Discount types: percentage, free_months, fixed_amount');

        return true;
    } catch (error) {
        console.error('❌ Error updating bulk payment settings table:', error);
        return false;
    }
}

module.exports = {
    updateBulkPaymentSettingsTable
};

// Run migration if called directly
if (require.main === module) {
    updateBulkPaymentSettingsTable().then(success => {
        if (success) {
            console.log('Migration completed successfully');
            process.exit(0);
        } else {
            console.log('Migration failed');
            process.exit(1);
        }
    });
}