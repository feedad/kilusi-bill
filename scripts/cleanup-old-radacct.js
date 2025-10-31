/**
 * Data retention job untuk radacct
 * Hapus record accounting yang sudah closed (acctstoptime NOT NULL) dan lebih lama dari threshold
 * 
 * Usage:
 *   node scripts/cleanup-old-radacct.js [days]
 *   
 * Default: 90 hari
 * Contoh: node scripts/cleanup-old-radacct.js 30  (hapus data >30 hari)
 * 
 * Untuk production, jadwalkan dengan cron/Task Scheduler:
 *   Windows Task Scheduler (mingguan): 
 *     Program: node.exe
 *     Arguments: D:\path\to\scripts\cleanup-old-radacct.js 90
 *   
 *   Linux cron (setiap Minggu jam 02:00):
 *     0 2 * * 0 /usr/bin/node /path/to/scripts/cleanup-old-radacct.js 90
 */

const path = require('path');
const radiusDb = require('../config/radius-database');
const { logger } = require('../config/logger');

// Ambil threshold dari args atau default 90 hari
const retentionDays = parseInt(process.argv[2]) || 90;

async function cleanupOldRecords() {
  try {
    logger.info(`🧹 Starting radacct cleanup: records older than ${retentionDays} days...`);
    
    // Init database
    await radiusDb.initDatabase();
    
    // Hitung cutoff date (ISO format untuk SQLite)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();
    
    logger.info(`📅 Cutoff date: ${cutoffISO}`);
    
    // Count records yang akan dihapus (untuk logging)
    const countResult = await radiusDb.query(
      `SELECT COUNT(*) as total FROM radacct 
       WHERE acctstoptime IS NOT NULL 
       AND acctstoptime < ?`,
      [cutoffISO]
    );
    
    const totalToDelete = countResult[0]?.total || 0;
    
    if (totalToDelete === 0) {
      logger.info('✅ No old records to delete.');
      await radiusDb.closeDatabase();
      process.exit(0);
      return;
    }
    
    logger.info(`🗑️  Found ${totalToDelete} closed sessions older than ${retentionDays} days`);
    
    // Optional: export ke backup sebelum delete
    // (uncomment jika ingin backup dulu)
    /*
    const backupPath = path.join(__dirname, '../logs', `radacct-backup-${Date.now()}.json`);
    const toDelete = await radiusDb.query(
      `SELECT * FROM radacct WHERE acctstoptime IS NOT NULL AND acctstoptime < ?`,
      [cutoffISO]
    );
    require('fs').writeFileSync(backupPath, JSON.stringify(toDelete, null, 2));
    logger.info(`💾 Backup saved: ${backupPath}`);
    */
    
    // Delete
    const result = await radiusDb.run(
      `DELETE FROM radacct 
       WHERE acctstoptime IS NOT NULL 
       AND acctstoptime < ?`,
      [cutoffISO]
    );
    
    logger.info(`✅ Deleted ${result.changes} old accounting records`);
    logger.info(`💡 Tip: Run VACUUM periodically to reclaim disk space`);
    
    // Optional: VACUUM untuk reclaim space (bisa lambat untuk DB besar)
    // Uncomment jika ingin auto-vacuum
    /*
    logger.info('🔧 Running VACUUM to reclaim disk space...');
    await radiusDb.run('VACUUM');
    logger.info('✅ VACUUM completed');
    */
    
    await radiusDb.closeDatabase();
    logger.info('🎉 Cleanup job completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error(`❌ Cleanup job failed: ${error.message}`);
    logger.error(error.stack);
    
    try {
      await radiusDb.closeDatabase();
    } catch (e) {
      // ignore
    }
    
    process.exit(1);
  }
}

// Run
cleanupOldRecords();
