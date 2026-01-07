const { Client } = require('pg');

async function fixOltStatus() {
    const client = new Client({
        host: process.env.POSTGRES_HOST || '127.0.0.1',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DATABASE || 'kilusi_bill',
        user: process.env.POSTGRES_USER || 'kilusi_user',
        password: process.env.POSTGRES_PASSWORD || 'kilusi17!'
    });

    try {
        console.log('Connecting to database...');
        await client.connect();

        console.log('Updating NULL status to active...');
        const res = await client.query("UPDATE olts SET status = 'active' WHERE status IS NULL OR status = '' RETURNING *");

        console.log(`Updated ${res.rowCount} rows.`);
        res.rows.forEach(r => console.log(`- Fixed OLT: ${r.name} (${r.host})`));

        await client.end();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixOltStatus();
