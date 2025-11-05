const { initializePool } = require('./config/database');

async function checkSequence() {
    try {
        initializePool();
        const { query } = require('./config/database');

        // Check customers table structure
        const result = await query(`
            SELECT column_name, data_type, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'customers' AND column_name = 'id'
        `);

        console.log('Column Structure:');
        result.rows.forEach(row => {
            console.log('- Column:', row.column_name);
            console.log('- Type:', row.data_type);
            console.log('- Default:', row.column_default);
        });

        // Check all sequences
        const sequences = await query(`
            SELECT sequence_name FROM information_schema.sequences 
            WHERE sequence_name LIKE '%customer%'
        `);

        console.log('\nSequences found:');
        sequences.rows.forEach(seq => {
            console.log('- Sequence:', seq.sequence_name);
        });

        // Check current customers
        const customers = await query(`
            SELECT id, name FROM customers ORDER BY id LIMIT 5
        `);

        console.log('\nCurrent customers:');
        customers.rows.forEach(c => {
            console.log('- ID:', c.id, 'Name:', c.name, 'Type:', typeof c.id);
        });

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        process.exit(0);
    }
}

checkSequence();
