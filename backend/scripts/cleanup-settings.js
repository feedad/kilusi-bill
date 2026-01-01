const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../settings.json');
const backupPath = path.join(__dirname, '../settings.json.bak');

const KEYS_TO_REMOVE = [
    'postgres_host',
    'postgres_port',
    'postgres_database',
    'postgres_user',
    'postgres_password',
    'server_port',
    'server_host',
    'api_key',
    'secret_key',
    'admin_password'
];

try {
    if (!fs.existsSync(settingsPath)) {
        console.log('No settings.json found.');
        process.exit(0);
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

    // Backup
    fs.writeFileSync(backupPath, JSON.stringify(settings, null, 2));
    console.log('✅ Backup created at settings.json.bak');

    // Remove keys
    KEYS_TO_REMOVE.forEach(key => {
        if (settings[key] !== undefined) {
            console.log(`Removing ${key}...`);
            delete settings[key];
        }
    });

    // Remove Tripay secrets
    if (settings.payment_gateway && settings.payment_gateway.tripay) {
        delete settings.payment_gateway.tripay.api_key;
        delete settings.payment_gateway.tripay.private_key;
        delete settings.payment_gateway.tripay.merchant_code;
        console.log('Removing Tripay secrets...');
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('✅ settings.json cleaned up!');

} catch (error) {
    console.error('Failed to clean settings:', error);
}
