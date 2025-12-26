const { query } = require('../config/database');

async function addCustomerIdColumn() {
  try {
    console.log('Adding customer_id column to customers table...');

    // Add customer_id column
    await query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS customer_id VARCHAR(5) UNIQUE
    `);

    console.log('✅ customer_id column added successfully');

    // Create sequence for auto-incrementing customer_id
    await query(`
      CREATE SEQUENCE IF NOT EXISTS customer_id_seq
      START WITH 1
      INCREMENT BY 1
      MINVALUE 1
      MAXVALUE 99999
    `);

    console.log('✅ customer_id_seq sequence created');

    // Get existing customers without customer_id
    const existingCustomers = await query(`
      SELECT id, customer_id FROM customers
      WHERE customer_id IS NULL
      ORDER BY created_at
    `);

    console.log(`Found ${existingCustomers.rows.length} existing customers without customer_id`);

    // Update existing customers with sequential customer_id
    for (let i = 0; i < existingCustomers.rows.length; i++) {
      const customerId = String(i + 1).padStart(5, '0');
      await query(
        'UPDATE customers SET customer_id = $1 WHERE id = $2',
        [customerId, existingCustomers.rows[i].id]
      );
      console.log(`Updated customer ${existingCustomers.rows[i].id} with customer_id: ${customerId}`);
    }

    // Get the next customer_id value
    const nextVal = await query(`
      SELECT CASE
        WHEN EXISTS(SELECT 1 FROM customers WHERE customer_id IS NOT NULL)
        THEN (SELECT MAX(CAST(customer_id AS INTEGER)) + 1 FROM customers WHERE customer_id IS NOT NULL)
        ELSE 1
      END as next_id
    `);

    const nextId = nextVal.rows[0].next_id;

    // Reset sequence to the correct next value
    await query(`
      SELECT setval('customer_id_seq', ${nextId - 1}, true)
    `);

    // Set default value for new records using next sequence value
    await query(`
      ALTER TABLE customers
      ALTER COLUMN customer_id SET DEFAULT LPAD(nextval('customer_id_seq')::text, 5, '0')
    `);

    console.log('✅ Default value set for customer_id');

    // Verify the changes
    const result = await query('SELECT id, customer_id, name FROM customers ORDER BY customer_id');
    console.log('\nCustomers with customer_id:');
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}, Customer ID: ${row.customer_id}, Name: ${row.name}`);
    });

    console.log('\n✅ customer_id implementation completed successfully!');

  } catch (err) {
    console.error('Error:', err.message);
    console.error('Full error:', err);
  }
  process.exit(0);
}

addCustomerIdColumn();