const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { execFile } = require('child_process');
const { logger } = require('./logger');

const dbPath = path.join(__dirname, '../billing.db');

function openDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function getSingle(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function runMigration(scriptRelPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', scriptRelPath);
    execFile(process.execPath, [scriptPath], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (stdout) logger.info(stdout.trim());
      if (stderr) logger.warn(stderr.trim());
      if (error) return reject(error);
      resolve(true);
    });
  });
}

async function ensureMultiServerDatabase() {
  let db;
  try {
    db = await openDb();
    // Check existence of core tables
    const hasCustomers = await getSingle(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='customers'");
    if (!hasCustomers) {
      logger.info('Database customers table not found. Running initial schema migration...');
      await runMigration('migrations/init-database.js');
    }

    // After possible init, re-open db to ensure fresh schema view
    if (db) db.close();
    db = await openDb();

    const hasNas = await getSingle(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='nas_servers'");
    const hasMikrotik = await getSingle(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='mikrotik_servers'");

    if (!hasNas || !hasMikrotik) {
      logger.info('Multi-server tables missing. Running multi-NAS/Mikrotik migration...');
      await runMigration('migrations/add-multi-nas-mikrotik.js');
    } else {
      logger.info('Multi-server tables already present. Skipping migration.');
    }
  } catch (e) {
    logger.warn(`DB migration check failed: ${e.message}`);
  } finally {
    try { if (db) db.close(); } catch (_) {}
  }
}

module.exports = { ensureMultiServerDatabase };
