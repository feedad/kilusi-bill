const { query } = require('./config/database');

async function check() {
    try {
        console.log('--- TABLES ---');
        const res = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:', res.rows.map(r => r.table_name).join(', '));

        // Check known tables for wallet data
        const walletKeywords = ['wallet', 'dana', 'ewallet'];
        const tables = res.rows.map(r => r.table_name);

        for (const table of tables) {
            if (table === 'payment_gateway_settings' || table === 'app_config') continue; // Already checked

            // Peek into tables that might contain it based on name
            if (table.includes('payment') || table.includes('wallet') || table.includes('setting')) {
                try {
                    const resPeek = await query(`SELECT * FROM ${table} LIMIT 1`);
                    const str = JSON.stringify(resPeek.rows);
                    if (walletKeywords.some(w => str.toLowerCase().includes(w))) {
                        console.log(`\n!!! FOUND WALLET DATA IN TABLE: ${table} !!!`);
                        console.log(JSON.stringify(resPeek.rows, null, 2));
                    }
                } catch (e) { } // ignore error on select
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

check().then(() => setTimeout(() => process.exit(0), 1000));
