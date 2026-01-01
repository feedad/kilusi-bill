const { query } = require('../config/database');

async function createBulkPaymentSettingsTable() {
    try {
        // Create bulk_payment_settings table
        await query(`
            CREATE TABLE IF NOT EXISTS bulk_payment_settings (
                id SERIAL PRIMARY KEY,
                enabled BOOLEAN DEFAULT true,
                discount_1_month INTEGER DEFAULT 0,
                discount_2_months INTEGER DEFAULT 0,
                discount_3_months INTEGER DEFAULT 5,
                discount_6_months INTEGER DEFAULT 10,
                discount_12_months INTEGER DEFAULT 15,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insert default settings if table is empty
        const existingSettings = await query('SELECT COUNT(*) as count FROM bulk_payment_settings');

        if (parseInt(existingSettings.rows[0].count) === 0) {
            await query(`
                INSERT INTO bulk_payment_settings (
                    enabled, discount_1_month, discount_2_months,
                    discount_3_months, discount_6_months, discount_12_months
                ) VALUES (true, 0, 0, 5, 10, 15)
            `);
            console.log('✅ Default bulk payment settings created');
        }

        // Create index for performance
        await query(`
            CREATE INDEX IF NOT EXISTS idx_bulk_payment_settings_enabled
            ON bulk_payment_settings(enabled)
        `);

        console.log('✅ Bulk payment settings table created successfully');
        return true;
    } catch (error) {
        console.error('❌ Error creating bulk payment settings table:', error);
        return false;
    }
}

module.exports = {
    createBulkPaymentSettingsTable
};

// Run migration if called directly
if (require.main === module) {
    createBulkPaymentSettingsTable().then(success => {
        if (success) {
            console.log('Migration completed successfully');
            process.exit(0);
        } else {
            console.log('Migration failed');
            process.exit(1);
        }
    });
}