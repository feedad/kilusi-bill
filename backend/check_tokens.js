const { Pool } = require('pg');

const pool = new Pool({
  host: '172.22.10.28',
  port: 5432,
  database: 'kilusi_bill',
  user: 'kilusi_bill',
  password: 'kilusi_bill'
});

async function checkTokens() {
  try {
    const result = await pool.query(`
      SELECT token, customer_id, expires_at, is_active
      FROM customer_tokens
      WHERE customer_id = '628115345333'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('Found tokens:');
    result.rows.forEach(row => {
      console.log(`Token: ${row.token}`);
      console.log(`Customer ID: ${row.customer_id}`);
      console.log(`Expires: ${row.expires_at}`);
      console.log(`Active: ${row.is_active}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkTokens();