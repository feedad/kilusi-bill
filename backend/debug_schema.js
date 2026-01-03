const { query } = require('./config/database');

async function checkSchema() {
    try {
        console.log('--- CUSTOMERS COLUMNS ---');
        const custCols = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customers';
    `);
        custCols.rows.forEach(r => console.log(`${r.column_name} (${r.data_type})`));

        console.log('\n--- INVOICES COLUMNS ---');
        const invCols = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invoices';
    `);
        invCols.rows.forEach(r => console.log(`${r.column_name} (${r.data_type})`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

checkSchema();
