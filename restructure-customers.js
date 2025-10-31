const { query } = require('./config/database');
const { logger } = require('./config/logger');

async function restructureCustomersTable() {
    let fkConstraints = { rows: [] }; // Initialize outside try block for wider scope

    try {
        console.log('🔄 Memulai restrukturisasi tabel customers...');

        // 1. Cek apakah tabel customers ada
        const tableExists = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'customers'
            ) as exists
        `);

        if (!tableExists.rows[0].exists) {
            console.log('❌ Tabel customers tidak ditemukan');
            return;
        }

        // 1.5. Cek dan handle foreign key constraints
        console.log('🔍 Memeriksa foreign key constraints...');
        fkConstraints = await query(`
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

        if (fkConstraints.rows.length > 0) {
            console.log(`📦 Menemukan ${fkConstraints.rows.length} foreign key constraints, menonaktifkan sementara...`);
            for (const fk of fkConstraints.rows) {
                await query(`ALTER TABLE ${fk.table_name} DROP CONSTRAINT ${fk.constraint_name}`);
                console.log(`✅ Constraint ${fk.constraint_name} dinonaktifkan`);
            }
        }

        // 2. Cek apakah kolom username ada
        const columnExists = await query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'customers' AND column_name = 'username'
            ) as exists
        `);

        if (!columnExists.rows[0].exists) {
            console.log('✅ Kolom username sudah tidak ada, restrukturisasi tidak diperlukan');
            return;
        }

        // 3. Buat backup data sebelum perubahan
        console.log('📦 Membuat backup data...');
        const backupData = await query(`
            SELECT * FROM customers
            ORDER BY id
        `);

        // 4. Update data existing dengan id 5 digit (untuk id yang bukan 5 digit)
        console.log('📝 Memperbarui data existing...');
        let updatedCount = 0;
        for (const customer of backupData.rows) {
            const currentId = customer.id.toString();

            // Jika id bukan 5 digit angka, update dengan 5 digit baru
            if (!/^\d{5}$/.test(currentId)) {
                // Cari id 5 digit tertinggi yang belum digunakan
                const maxIdResult = await query(`
                    SELECT CAST(id AS INTEGER) as max_id
                    FROM customers
                    WHERE id::text ~ '^\\d{5}$'
                    ORDER BY max_id DESC
                    LIMIT 1
                `);

                let nextId = 1;
                if (maxIdResult.rows.length > 0 && maxIdResult.rows[0].max_id) {
                    nextId = maxIdResult.rows[0].max_id + 1;
                }

                const fiveDigitId = nextId.toString().padStart(5, '0');

                // Update id menjadi 5 digit, username tetap nomor HP
                await query(`
                    UPDATE customers
                    SET id = $1
                    WHERE id = $2
                `, [parseInt(fiveDigitId), customer.id]);

                console.log(`✅ Updated customer ${customer.name}: id ${customer.id} -> ${fiveDigitId}`);
                updatedCount++;
            } else {
                console.log(`✅ Customer ${customer.name} sudah memiliki id 5 digit: ${currentId}`);
            }
        }

        console.log(`✅ ${backupData.rows.length} customer diproses`);

        // 5. Reset sequence untuk id
        console.log('🔄 Reset sequence untuk id...');
        const maxIdResult = await query(`
            SELECT CAST(id AS INTEGER) as max_id
            FROM customers
            WHERE id::text ~ '^\\d{5}$'
            ORDER BY max_id DESC
            LIMIT 1
        `);

        let nextSequence = 1;
        if (maxIdResult.rows.length > 0 && maxIdResult.rows[0].max_id) {
            nextSequence = maxIdResult.rows[0].max_id + 1;
        }

        await query(`
            DROP SEQUENCE IF EXISTS customers_id_seq
        `);

        await query(`
            CREATE SEQUENCE customers_id_seq
            START WITH ${nextSequence}
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1
        `);

        await query(`
            ALTER TABLE customers ALTER COLUMN id SET DEFAULT nextval('customers_id_seq')
        `);
        console.log(`✅ Sequence direset mulai dari ${nextSequence}`);

        // 6. Update username untuk menjadi nomor HP (jika belum sesuai)
        console.log('📝 Memperbarui username menjadi nomor HP...');
        const phoneUpdateCount = await query(`
            UPDATE customers
            SET username = phone
            WHERE username IS NULL OR username != phone
        `);

        console.log(`✅ ${phoneUpdateCount.rowCount} customer username diperbarui menjadi nomor HP`);

        // 7. Cek struktur akhir
        console.log('📋 Verifikasi struktur akhir...');
        const finalStructure = await query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'customers'
            AND column_name IN ('id', 'username', 'name', 'phone')
            ORDER BY ordinal_position
        `);

        console.log('\n📊 Struktur Akhir Tabel Customers:');
        console.table(finalStructure.rows);

        // 8. Sample data akhir
        const finalSample = await query(`
            SELECT id, username, name, phone
            FROM customers
            LIMIT 3
        `);
        console.log('\n📝 Sample Data Akhir:');
        console.table(finalSample.rows);

        // 9. Restore foreign key constraints
        if (fkConstraints.rows.length > 0) {
            console.log('\n🔧 Mengembalikan foreign key constraints...');
            for (const fk of fkConstraints.rows) {
                await query(`
                    ALTER TABLE ${fk.table_name}
                    ADD CONSTRAINT ${fk.constraint_name}
                    FOREIGN KEY (${fk.column_name})
                    REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name})
                `);
                console.log(`✅ Constraint ${fk.constraint_name} dikembalikan`);
            }
        }

        console.log(`✨ Restrukturisasi selesai!`);

    } catch (error) {
        console.error('❌ Error saat restrukturisasi:', error);
        logger.error('Error restructuring customers table:', error);
        process.exit(1);
    }
}

async function checkReferences() {
    try {
        console.log('🔍 Memeriksa references ke tabel customers...');

        // Cari views yang menggunakan customers
        const views = await query(`
            SELECT table_name, view_definition
            FROM information_schema.views
            WHERE view_definition LIKE '%customers%'
        `);

        console.log(`📊 Ditemukan ${views.rows.length} views yang menggunakan customers`);

        // Cari function/stored procedures yang menggunakan customers
        const functions = await query(`
            SELECT proname, prosrc
            FROM pg_proc
            WHERE prosrc LIKE '%customers%'
        `);

        console.log(`📊 Ditemukan ${functions.rows.length} functions yang menggunakan customers`);

    } catch (error) {
        console.error('❌ Error memeriksa references:', error);
    }
}

async function main() {
    console.log('🚀 Memulai proses restrukturisasi customers table...');

    await checkReferences();
    await restructureCustomersTable();

    console.log('✨ Proses selesai! Silakan restart aplikasi.');
    process.exit(0);
}

main();