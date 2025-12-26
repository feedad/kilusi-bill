/**
 * Migration: Add Billing Type Support
 * Adds support for prepaid and postpaid billing types
 */

const { query } = require('../config/database');

async function addBillingTypeSupport() {
    try {
        console.log('🔄 Starting Billing Type Migration...\n');

        // 1. Add billing_type column to customers table
        console.log('1️⃣ Adding billing_type column to customers...');
        await query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS billing_type VARCHAR(20) DEFAULT 'postpaid'
        `);
        console.log('✅ billing_type column added');

        // 2. Add trial tracking columns for prepaid customers
        console.log('\n2️⃣ Adding trial tracking columns...');
        await query(`
            ALTER TABLE customers
            ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS trial_active BOOLEAN DEFAULT false
        `);
        console.log('✅ trial columns added');

        // 3. Add billing type tracking to invoices
        console.log('\n3️⃣ Adding billing type tracking to invoices...');
        await query(`
            ALTER TABLE invoices
            ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'postpaid',
            ADD COLUMN IF NOT EXISTS is_installation_fee BOOLEAN DEFAULT false
        `);
        console.log('✅ invoice billing columns added');

        // 4. Add constraints
        console.log('\n4️⃣ Adding constraints...');
        try {
            await query(`
                ALTER TABLE customers
                ADD CONSTRAINT IF NOT EXISTS chk_billing_type
                CHECK (billing_type IN ('prepaid', 'postpaid'))
            `);
            console.log('✅ billing_type constraint added');
        } catch (error) {
            console.log('⚠️ Constraint might already exist:', error.message);
        }

        // 5. Set default values for existing customers
        console.log('\n5️⃣ Setting default values for existing customers...');
        await query(`
            UPDATE customers
            SET billing_type = 'postpaid'
            WHERE billing_type IS NULL
        `);
        console.log('✅ Default billing_type set for existing customers');

        // 6. Add indexes for performance
        console.log('\n6️⃣ Adding performance indexes...');
        await query(`
            CREATE INDEX IF NOT EXISTS idx_customers_billing_type ON customers(billing_type);
            CREATE INDEX IF NOT EXISTS idx_customers_trial_expires ON customers(trial_expires_at);
            CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type);
        `);
        console.log('✅ Performance indexes added');

        // 7. Verify the changes
        console.log('\n7️⃣ Verifying migration...');
        const customerColumns = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'customers' AND column_name IN ('billing_type', 'trial_expires_at', 'trial_active')
            ORDER BY column_name
        `);

        const invoiceColumns = await query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'invoices' AND column_name IN ('invoice_type', 'is_installation_fee')
            ORDER BY column_name
        `);

        console.log('📋 Customer table new columns:');
        customerColumns.rows.forEach(col => {
            console.log(`   - ${col.column_name}: ${col.data_type} (default: ${col.column_default})`);
        });

        console.log('\n📋 Invoice table new columns:');
        invoiceColumns.rows.forEach(col => {
            console.log(`   - ${col.column_name}: ${col.data_type} (default: ${col.column_default})`);
        });

        // 8. Check current customers by billing type
        console.log('\n8️⃣ Current customer billing types:');
        const billingStats = await query(`
            SELECT billing_type, COUNT(*) as count
            FROM customers
            WHERE status = 'active'
            GROUP BY billing_type
            ORDER BY billing_type
        `);

        billingStats.rows.forEach(stat => {
            console.log(`   - ${stat.billing_type}: ${stat.count} customers`);
        });

        console.log('\n🎉 Billing Type Migration completed successfully!');
        console.log('✅ Database is now ready for prepaid and postpaid billing!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    addBillingTypeSupport()
        .then(() => {
            console.log('\n✅ Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = addBillingTypeSupport;