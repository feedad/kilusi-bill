
const scheduler = require('./config/scheduler');
const db = require('./config/database');
const logger = require('./config/logger');

async function testScheduler() {
    console.log('=== Testing Daily Invoice Generator (Fixed/Profile) ===');

    // 1. Run the generator
    // It should look for services with isolir_date = Today + 5 days = 2026-01-06
    console.log('Running generator...');
    const result = await scheduler.generateDailyInvoicesForFixedAndProfile();
    console.log('Result:', result);

    // 2. Verify with database query
    console.log('\n=== Verification ===');
    const targetDate = '2026-01-06';
    const services = await db.query(`
        SELECT count(*) as count 
        FROM services 
        WHERE status = 'active' 
        AND siklus IN ('fixed', 'profile') 
        AND DATE(isolir_date) = $1
    `, [targetDate]);

    console.log(`Services with isolir date ${targetDate}: ${services.rows[0].count}`);

    process.exit(0);
}

testScheduler().catch(e => {
    console.error(e);
    process.exit(1);
});
