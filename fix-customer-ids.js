const { query } = require('./config/database');
const { logger } = require('./config/logger');

async function fixCustomerIds() {
    try {
        console.log('🔄 Memperbaiki ID customers menjadi 5 digit...');

        // 1. Cek data saat ini
        const currentData = await query('SELECT id, username, name FROM customers ORDER BY id');
        console.log('\n📊 Data saat ini:');
        console.table(currentData.rows);

        // 2. Update ID menjadi 5 digit dengan benar
        console.log('\n📝 Memperbarui ID menjadi 5 digit...');

        for (let i = 0; i < currentData.rows.length; i++) {
            const customer = currentData.rows[i];
            const newId = (i + 1).toString().padStart(5, '0'); // 00001, 00002, 00003

            await query(`
                UPDATE customers
                SET id = $1
                WHERE id = $2
            `, [newId, customer.id]);

            console.log(`✅ Updated ${customer.name}: id ${customer.id} -> ${newId}`);
        }

        // 3. Verifikasi hasil
        const updatedData = await query('SELECT id, username, name FROM customers ORDER BY id');
        console.log('\n📊 Data setelah diperbarui:');
        console.table(updatedData.rows);

        // 4. Restore foreign key constraints
        console.log('\n🔧 Mengembalikan foreign key constraints...');

        // Restore invoices_customer_id_fkey
        try {
            await query(`
                ALTER TABLE invoices
                ADD CONSTRAINT invoices_customer_id_fkey
                FOREIGN KEY (customer_id)
                REFERENCES customers(id)
            `);
            console.log('✅ Constraint invoices_customer_id_fkey dikembalikan');
        } catch (error) {
            console.log('⚠️  invoices_customer_id_fkey sudah ada atau gagal dibuat');
        }

        // Restore trouble_reports_customer_id_fkey
        try {
            await query(`
                ALTER TABLE trouble_reports
                ADD CONSTRAINT trouble_reports_customer_id_fkey
                FOREIGN KEY (customer_id)
                REFERENCES customers(id)
            `);
            console.log('✅ Constraint trouble_reports_customer_id_fkey dikembalikan');
        } catch (error) {
            console.log('⚠️  trouble_reports_customer_id_fkey sudah ada atau gagal dibuat');
        }

        // 5. Verifikasi constraints
        const constraints = await query(`
            SELECT
                tc.constraint_name,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ccu.table_name = 'customers'
        `);

        console.log('\n🔗 Foreign Key Constraints yang aktif:');
        if (constraints.rows.length > 0) {
            console.table(constraints.rows);
        } else {
            console.log('❌ Tidak ada foreign key constraints yang aktif');
        }

        console.log('\n✨ Perbaikan selesai!');

    } catch (error) {
        console.error('❌ Error saat memperbaiki ID:', error);
        logger.error('Error fixing customer IDs:', error);
        process.exit(1);
    }
}

fixCustomerIds().then(() => {
    console.log('✨ Proses selesai!');
    process.exit(0);
}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});