/**
 * Migration: Add Billing Cycle Support
 * Creates billing_settings table and updates customers table for billing cycle management
 */

const { query, getOne } = require('../config/database');
const { logger } = require('../config/logger');

async function up() {
    try {
        console.log('🔄 Starting billing cycle migration...');

        // ============================================
        // 1. CREATE BILLING SETTINGS TABLE
        // ============================================
        console.log('📊 Creating billing_settings table...');
        await query(`
            CREATE TABLE IF NOT EXISTS billing_settings (
                id SERIAL PRIMARY KEY,
                billing_cycle_type VARCHAR(20) NOT NULL DEFAULT 'profile',
                invoice_advance_days INTEGER DEFAULT 5,
                profile_default_period INTEGER DEFAULT 30,
                fixed_day INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_billing_cycle_type CHECK (billing_cycle_type IN ('profile', 'fixed', 'monthly')),
                CONSTRAINT chk_invoice_advance_days CHECK (invoice_advance_days > 0),
                CONSTRAINT chk_profile_default_period CHECK (profile_default_period > 0),
                CONSTRAINT chk_fixed_day CHECK (fixed_day >= 1 AND fixed_day <= 28)
            )
        `);

        // Create index for billing_settings
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_settings_single ON billing_settings ((1))`);
        console.log('✅ billing_settings table created');

        // ============================================
        // 2. UPDATE CUSTOMERS TABLE
        // ============================================
        console.log('📊 Updating customers table for billing cycle...');

        // Check if siklus column exists (using existing column name)
        const columnCheck = await query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'customers' AND column_name = 'siklus'
        `);

        if (columnCheck.rows.length === 0) {
            await query(`
                ALTER TABLE customers
                ADD COLUMN siklus VARCHAR(20) DEFAULT 'profile'
            `);

            // Add check constraint for siklus column
            await query(`
                ALTER TABLE customers
                ADD CONSTRAINT chk_siklus_type
                CHECK (siklus IN ('profile', 'fixed', 'monthly'))
            `);
            console.log('✅ siklus column added to customers');
        } else {
            console.log('ℹ️ siklus column already exists');
        }

        // ============================================
        // 3. UPDATE PACKAGES TABLE
        // ============================================
        console.log('📊 Updating packages table for billing cycle compatibility...');

        // Check if billing_cycle_compatible column exists
        const packageColumnCheck = await query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'packages' AND column_name = 'billing_cycle_compatible'
        `);

        if (packageColumnCheck.rows.length === 0) {
            await query(`
                ALTER TABLE packages
                ADD COLUMN billing_cycle_compatible BOOLEAN DEFAULT true
            `);
            console.log('✅ billing_cycle_compatible column added to packages');
        } else {
            console.log('ℹ️ billing_cycle_compatible column already exists');
        }

        // ============================================
        // 4. INSERT DEFAULT BILLING SETTINGS
        // ============================================
        console.log('📊 Inserting default billing settings...');

        // Check if settings already exist
        const settingsCheck = await query('SELECT COUNT(*) as count FROM billing_settings');

        if (parseInt(settingsCheck.rows[0].count) === 0) {
            await query(`
                INSERT INTO billing_settings (
                    billing_cycle_type,
                    invoice_advance_days,
                    profile_default_period,
                    fixed_day
                ) VALUES ('profile', 5, 30, 1)
            `);
            console.log('✅ Default billing settings inserted');
        } else {
            console.log('ℹ️ Billing settings already exist');
        }

        // ============================================
        // 5. CREATE HELPER FUNCTIONS
        // ============================================
        console.log('📊 Creating billing cycle helper functions...');

        // Function to get current billing settings
        await query(`
            CREATE OR REPLACE FUNCTION get_billing_settings()
            RETURNS TABLE (
                billing_cycle_type VARCHAR(20),
                invoice_advance_days INTEGER,
                profile_default_period INTEGER,
                fixed_day INTEGER
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT billing_cycle_type, invoice_advance_days, profile_default_period, fixed_day
                FROM billing_settings
                LIMIT 1;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Function to get customer's billing cycle (using siklus column)
        await query(`
            CREATE OR REPLACE FUNCTION get_customer_billing_cycle(customer_id_param INTEGER)
            RETURNS VARCHAR(20) AS $$
            DECLARE
                customer_siklus VARCHAR(20);
                system_billing_cycle VARCHAR(20);
            BEGIN
                -- Get customer's siklus setting
                SELECT siklus INTO customer_siklus
                FROM customers
                WHERE id = customer_id_param;

                -- If customer has siklus setting, use it
                IF customer_siklus IS NOT NULL THEN
                    RETURN customer_siklus;
                END IF;

                -- Otherwise use system default
                SELECT billing_cycle_type INTO system_billing_cycle
                FROM billing_settings
                LIMIT 1;

                RETURN COALESCE(system_billing_cycle, 'profile');
            END;
            $$ LANGUAGE plpgsql;
        `);

        console.log('✅ Helper functions created');

        // ============================================
        // 6. UPDATE EXISTING CUSTOMERS
        // ============================================
        console.log('📊 Updating existing customers with default billing cycle...');

        // Set siklus to system default for all existing customers
        const systemDefault = await getOne('SELECT billing_cycle_type FROM billing_settings LIMIT 1');
        const defaultCycle = systemDefault?.billing_cycle_type || 'profile';

        await query(`
            UPDATE customers
            SET siklus = $1
            WHERE siklus IS NULL OR siklus NOT IN ('profile', 'fixed', 'monthly')
        `, [defaultCycle]);

        console.log('✅ Existing customers updated');

        console.log('🎉 Billing cycle migration completed successfully!\n');

        return {
            success: true,
            message: 'Billing cycle migration completed successfully'
        };

    } catch (error) {
        console.error('❌ Migration failed:', error);
        logger.error('Billing cycle migration failed:', error);
        throw error;
    }
}

async function down() {
    try {
        console.log('🔄 Rolling back billing cycle migration...');

        // Drop helper functions
        await query('DROP FUNCTION IF EXISTS get_billing_settings()');
        await query('DROP FUNCTION IF EXISTS get_customer_billing_cycle(INTEGER)');

        // Drop billing_settings table
        await query('DROP TABLE IF EXISTS billing_settings');

        // Remove columns from customers and packages tables
        await query(`
            ALTER TABLE customers
            DROP COLUMN IF EXISTS siklus
        `);

        await query(`
            ALTER TABLE packages
            DROP COLUMN IF EXISTS billing_cycle_compatible
        `);

        console.log('✅ Migration rollback completed');

        return {
            success: true,
            message: 'Migration rollback completed successfully'
        };

    } catch (error) {
        console.error('❌ Migration rollback failed:', error);
        logger.error('Migration rollback failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    (async () => {
        try {
            const result = await up();
            console.log(result.message);
            process.exit(0);
        } catch (error) {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    })();
}

module.exports = {
    up,
    down
};