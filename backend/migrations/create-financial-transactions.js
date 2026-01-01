const { query } = require('../config/database');
const { logger } = require('../config/logger');

async function createFinancialTransactions() {
  try {
    console.log('🔄 Creating financial_transactions table...');

    // Check if table already exists
    const checkResult = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'financial_transactions'
      )
    `);

    const tableExists = checkResult.rows[0].exists;

    if (!tableExists) {
      // Create financial_transactions table
      await query(`
        CREATE TABLE financial_transactions (
            id SERIAL PRIMARY KEY,
            type VARCHAR(50) NOT NULL,              -- income, expense
            category VARCHAR(100) NOT NULL,          -- installation, subscription, equipment, salary, operational
            amount DECIMAL(12,2) NOT NULL,
            description TEXT,
            customer_id VARCHAR(5) REFERENCES customers(id), -- VARCHAR to match customers.id type
            transaction_date DATE NOT NULL,
            payment_method VARCHAR(50),              -- cash, transfer, edc
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Created financial_transactions table');
    } else {
      console.log('ℹ️  financial_transactions table already exists');
    }

    // Create indexes for better performance
    console.log('🔄 Creating indexes...');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(type)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_financial_transactions_category ON financial_transactions(category)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_financial_transactions_customer_id ON financial_transactions(customer_id)
    `);

    console.log('✅ Created indexes');

    // Create updated_at trigger
    console.log('🔄 Creating updated_at trigger...');
    await query(`
      CREATE OR REPLACE FUNCTION update_financial_transactions_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_financial_transactions_updated_at_trigger ON financial_transactions
    `);

    await query(`
      CREATE TRIGGER update_financial_transactions_updated_at_trigger
          BEFORE UPDATE ON financial_transactions
          FOR EACH ROW
          EXECUTE FUNCTION update_financial_transactions_updated_at()
    `);

    console.log('✅ Created updated_at trigger');

    // Insert sample data for testing
    console.log('🔄 Inserting sample data...');

    const sampleData = [
      {
        type: 'income',
        category: 'installation',
        amount: 75000,
        description: 'Instalasi Paket Basic - Test Customer',
        customer_id: null, // Will be null if customer doesn't exist
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash'
      },
      {
        type: 'income',
        category: 'subscription',
        amount: 250000,
        description: 'Langganan Paket Basic - Test Customer',
        customer_id: null,
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'transfer'
      },
      {
        type: 'expense',
        category: 'operational',
        amount: 50000,
        description: 'Biaya operasional kantor',
        customer_id: null,
        transaction_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash'
      }
    ];

    for (const data of sampleData) {
      await query(`
        INSERT INTO financial_transactions (type, category, amount, description, customer_id, transaction_date, payment_method)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [data.type, data.category, data.amount, data.description, data.customer_id, data.transaction_date, data.payment_method]);
    }

    console.log(`✅ Inserted ${sampleData.length} sample transactions`);

    // Show current transactions
    const transactionsResult = await query(`
      SELECT
        ft.*,
        c.name as customer_name
      FROM financial_transactions ft
      LEFT JOIN customers c ON ft.customer_id = c.id
      ORDER BY ft.created_at DESC
      LIMIT 10
    `);

    console.log('\n💰 Current Financial Transactions:');
    console.log('─'.repeat(100));
    transactionsResult.rows.forEach((trans, index) => {
      console.log(`${index + 1}. ${trans.type.toUpperCase()} - ${trans.category}`);
      console.log(`   💰 Amount: Rp ${trans.amount?.toLocaleString('id-ID')}`);
      console.log(`   📝 Description: ${trans.description}`);
      console.log(`   📅 Date: ${trans.transaction_date}`);
      console.log(`   💳 Payment: ${trans.payment_method || 'N/A'}`);
      console.log(`   👤 Customer: ${trans.customer_name || 'N/A'}`);
      console.log('');
    });

    console.log('🎉 Financial transactions migration completed successfully!');

  } catch (error) {
    logger.error('❌ Error creating financial transactions table:', error);
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  createFinancialTransactions()
    .then(() => {
      console.log('\n✨ Financial transactions migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createFinancialTransactions };