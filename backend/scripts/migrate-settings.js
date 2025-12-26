const fs = require('fs');
const path = require('path');
const { query, close } = require('../config/database');
const bcrypt = require('bcrypt');

const settingsPath = path.join(__dirname, '../settings.json');
const envPath = path.join(__dirname, '../.env');
const envExamplePath = path.join(__dirname, '../.env.example');

// Keys that should move to .env
const SECRETS_MAP = {
    'postgres_host': 'DB_HOST',
    'postgres_port': 'DB_PORT',
    'postgres_database': 'DB_NAME',
    'postgres_user': 'DB_USER',
    'postgres_password': 'DB_PASSWORD',
    'server_port': 'PORT',
    'server_host': 'HOST',
    'api_key': 'API_KEY',
    'secret_key': 'JWT_SECRET'
};

const TRIPAY_MAP = {
    'api_key': 'TRIPAY_API_KEY',
    'private_key': 'TRIPAY_PRIVATE_KEY',
    'merchant_code': 'TRIPAY_MERCHANT_CODE'
};

async function migrate() {
    try {
        console.log('🚀 Starting Settings Migration...');

        if (!fs.existsSync(settingsPath)) {
            console.error('❌ settings.json not found!');
            return;
        }

        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        const envContent = [];
        const envExampleContent = [];

        // 1. Process Secrets -> .env
        console.log('🔒 Migrating secrets to .env...');

        // General secrets
        Object.entries(SECRETS_MAP).forEach(([jsonKey, envKey]) => {
            if (settings[jsonKey]) {
                envContent.push(`${envKey}=${settings[jsonKey]}`);
                envExampleContent.push(`${envKey}=Values`);
                // Remove from settings object so it doesn't go to DB (optional, maybe keep for fallback logic but safest to remove)
                // We will NOT remove from 'settings' object here to avoid mutating original source yet, 
                // but when writing to DB we filter.
            }
        });

        // Nested Tripay secrets
        if (settings.payment_gateway && settings.payment_gateway.tripay) {
            Object.entries(TRIPAY_MAP).forEach(([jsonKey, envKey]) => {
                if (settings.payment_gateway.tripay[jsonKey]) {
                    envContent.push(`${envKey}=${settings.payment_gateway.tripay[jsonKey]}`);
                    envExampleContent.push(`${envKey}=Values`);
                }
            });
        }

        // Write .env if not exists (or append?) - Safest is to write new if not exist, or warn.
        // We will Write/Overwrite for migration purpose.
        if (!fs.existsSync(envPath)) {
            fs.writeFileSync(envPath, envContent.join('\n'));
            console.log('✅ .env created');
        } else {
            console.log('⚠️ .env already exists. Appending new keys...');
            fs.appendFileSync(envPath, '\n' + envContent.join('\n'));
        }

        if (!fs.existsSync(envExamplePath)) {
            fs.writeFileSync(envExamplePath, envExampleContent.join('\n'));
            console.log('✅ .env.example created');
        }

        // 2. Migrate Admin -> DB
        console.log('👤 Migrating Admin to DB...');
        const adminUser = settings.admin_username || 'admin';
        const adminPass = settings.admin_password || 'admin';

        // Check if exists
        const checkAdmin = await query('SELECT id FROM admins WHERE username = $1', [adminUser]);
        if (checkAdmin.rows.length === 0) {
            const hash = await bcrypt.hash(adminPass, 10);
            await query(
                'INSERT INTO admins (username, password_hash, role, is_active) VALUES ($1, $2, $3, $4)',
                [adminUser, hash, 'administrator', true]
            );
            console.log(`✅ Admin '${adminUser}' migrated to DB.`);
        } else {
            console.log(`ℹ️ Admin '${adminUser}' already in DB.`);
        }

        // 3. Migrate Dynamic Configs -> DB (app_config)
        console.log('⚙️ Migrating Dynamic Settings to DB...');
        const skipKeys = [...Object.keys(SECRETS_MAP), 'admin_password', 'payment_gateway']; // payment_gateway complex

        for (const [key, value] of Object.entries(settings)) {
            if (skipKeys.includes(key)) continue;

            // Determine type
            let type = 'string';
            let cat = 'general';
            if (typeof value === 'boolean') type = 'boolean';
            else if (typeof value === 'number') type = 'number';
            else if (typeof value === 'object') type = 'json';

            if (key.includes('billing')) cat = 'billing';
            if (key.includes('whatsapp')) cat = 'whatsapp';
            if (key.includes('radius') || key.includes('pppoe')) cat = 'network';

            const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

            await query(`
                INSERT INTO app_config ("key", "value", "type", "category", "updated_at")
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"
            `, [key, strVal, type, cat]);
        }
        // Handle payment_gateway specially (keep structure or flatten?)
        // Let's keep 'payment_gateway' as a JSON blob in DB for compatibility, EXCEPT the secrets inside it.
        // We already extracted secrets to ENV, but the code expects them inside the object?
        // settingsManager merges Env with Cache. 
        // We will insert the payment_gateway object as JSON, but maybe strip secrets?
        // For simplicity, store as JSON. Secrets will be overridden by ENV vars in `settingsManager`.
        // Ideally we shouldn't store secrets in DB either.

        if (settings.payment_gateway) {
            const safePg = JSON.parse(JSON.stringify(settings.payment_gateway));
            // Mask secrets in DB
            if (safePg.tripay) {
                safePg.tripay.api_key = "ENV_VAR";
                safePg.tripay.private_key = "ENV_VAR";
            }
            await query(`
                INSERT INTO app_config ("key", "value", "type", "category", "updated_at")
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"
            `, ['payment_gateway', JSON.stringify(safePg), 'json', 'billing']);
            console.log('✅ payment_gateway migrated (secrets masked).');
        }

        console.log('✨ Migration Complete!');

    } catch (error) {
        console.error('❌ Migration Failed:', error);
    } finally {
        await close();
    }
}

migrate();
