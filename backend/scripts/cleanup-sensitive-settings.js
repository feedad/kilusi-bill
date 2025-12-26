#!/usr/bin/env node
/**
 * Script untuk membersihkan data sensitif dari settings.json
 * Setelah migrasi ke database PostgreSQL (app_config)
 * 
 * Menjalankan:
 *   node scripts/cleanup-sensitive-settings.js --dry-run   # Preview saja
 *   node scripts/cleanup-sensitive-settings.js             # Eksekusi cleanup
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const settingsPath = path.join(__dirname, '../settings.json');
const backupPath = path.join(__dirname, '../settings.json.backup-' + new Date().toISOString().replace(/[:.]/g, '-'));

// Daftar key sensitif yang harus dihapus dari settings.json
const SENSITIVE_KEYS = [
    // Password & Secrets
    'admin_password',
    'mikrotik_password',
    'postgres_password',
    'radius_password',
    'genieacs_password',
    'jwt_secret',
    'secret_key',

    // API Keys
    'tripay_api_key',
    'tripay_private_key',
    'midtrans_server_key',
    'midtrans_client_key',
    'xendit_api_key',
    'xendit_callback_token',
    'fonnte_api_key',
    'wablas_api_key',

    // Nested sensitive keys (akan dicek dengan startsWith)
    'paymentGateway',
    'payment_gateway',

    // WhatsApp session data
    'whatsapp_session',

    // User credentials
    'mikrotik_user',
    'postgres_user',
    'radius_user',
    'genieacs_username',
];

// Key yang HARUS tetap ada di settings.json (untuk bootstrap)
const REQUIRED_KEYS = [
    'app_mode',
    'company_name',
    'server_port',
    'server_host',
    'postgres_host',
    'postgres_port',
    'postgres_database',
    'postgres_user',      // Required for DB connection
    'postgres_password',  // Required for DB connection
    'logo_filename',
];

async function main() {
    const isDryRun = process.argv.includes('--dry-run');

    console.log('🔐 Settings Cleanup Script');
    console.log('==========================');
    console.log(`Mode: ${isDryRun ? 'DRY RUN (tidak ada perubahan)' : 'EXECUTE'}\n`);

    // 1. Load settings.json
    if (!fs.existsSync(settingsPath)) {
        console.log('❌ settings.json tidak ditemukan');
        process.exit(1);
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    console.log(`📄 Loaded settings.json dengan ${Object.keys(settings).length} keys\n`);

    // 2. Connect to database to verify data exists
    let pool;
    try {
        pool = new Pool({
            host: settings.postgres_host || process.env.DB_HOST || 'localhost',
            port: parseInt(settings.postgres_port || process.env.DB_PORT || '5432'),
            database: settings.postgres_database || process.env.DB_NAME || 'kilusi_bill',
            user: settings.postgres_user || process.env.DB_USER,
            password: settings.postgres_password || process.env.DB_PASSWORD,
        });

        // Test connection
        await pool.query('SELECT 1');
        console.log('✅ Database connected\n');
    } catch (error) {
        console.log('❌ Database connection failed:', error.message);
        console.log('⚠️  Cannot verify data in database. Aborting.');
        process.exit(1);
    }

    // 3. Check what settings exist in database
    const dbResult = await pool.query('SELECT key, value FROM app_config');
    const dbSettings = {};
    dbResult.rows.forEach(row => {
        dbSettings[row.key] = row.value;
    });
    console.log(`📊 Found ${Object.keys(dbSettings).length} settings in database\n`);

    // 4. Identify sensitive keys to remove
    const keysToRemove = [];
    const keysToKeep = {};

    for (const key of Object.keys(settings)) {
        const isSensitive = SENSITIVE_KEYS.some(sensitiveKey =>
            key === sensitiveKey ||
            key.startsWith(sensitiveKey + '.') ||
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('api_key') ||
            key.toLowerCase().includes('private_key')
        );

        const isRequired = REQUIRED_KEYS.includes(key);

        if (isSensitive && !isRequired) {
            keysToRemove.push(key);
        } else {
            keysToKeep[key] = settings[key];
        }
    }

    console.log('🗑️  Keys yang akan dihapus dari settings.json:');
    console.log('   ' + (keysToRemove.length > 0 ? keysToRemove.join('\n   ') : '(tidak ada)'));
    console.log(`\n📦 Keys yang akan dipertahankan: ${Object.keys(keysToKeep).length}`);

    // 5. Verify sensitive keys exist in database
    console.log('\n🔍 Verifikasi data di database:');
    let missingInDb = [];
    for (const key of keysToRemove) {
        const inDb = dbSettings[key] !== undefined;
        const status = inDb ? '✅' : '⚠️';
        console.log(`   ${status} ${key}: ${inDb ? 'Ada di DB' : 'TIDAK ADA di DB'}`);
        if (!inDb && settings[key]) {
            missingInDb.push(key);
        }
    }

    if (missingInDb.length > 0) {
        console.log('\n⚠️  WARNING: Beberapa key sensitif belum ada di database:');
        console.log('   ' + missingInDb.join('\n   '));
        console.log('\n   Silakan simpan settings dari UI terlebih dahulu sebelum cleanup.');

        if (!isDryRun) {
            console.log('\n❌ Cleanup dibatalkan. Jalankan dengan --dry-run untuk melihat preview.');
            await pool.end();
            process.exit(1);
        }
    }

    // 6. Execute cleanup
    if (!isDryRun) {
        // Backup original
        fs.writeFileSync(backupPath, JSON.stringify(settings, null, 2));
        console.log(`\n💾 Backup created: ${backupPath}`);

        // Write cleaned settings
        fs.writeFileSync(settingsPath, JSON.stringify(keysToKeep, null, 2));
        console.log(`✅ settings.json cleaned! Removed ${keysToRemove.length} sensitive keys.`);

        console.log('\n📌 Catatan:');
        console.log('   - Data sensitif sekarang HANYA di database');
        console.log('   - settings.json hanya berisi config bootstrap');
        console.log('   - Backup tersimpan di: ' + backupPath);
    } else {
        console.log('\n🔄 DRY RUN selesai. Jalankan tanpa --dry-run untuk eksekusi.');
    }

    await pool.end();
}

main().catch(console.error);
