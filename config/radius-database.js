const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { logger } = require('./logger');

// Path ke database SQLite
const dbPath = path.join(__dirname, '../logs/radius.db');

// Inisialisasi koneksi database
let db = null;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error(`Gagal membuka database RADIUS: ${err.message}`);
        reject(err);
      } else {
        logger.info('✅ Database RADIUS terhubung');
        // Tuning PRAGMA untuk performa dan konsistensi
        try {
          db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA temp_store = MEMORY;
            -- cache_size dalam halaman, negatif = KB. -64000 ≈ 64MB
            PRAGMA cache_size = -64000;
          `);
          logger.info('🛠️  SQLite PRAGMA applied: WAL, NORMAL, foreign_keys=ON, busy_timeout, cache_size');
        } catch (e) {
          logger.warn(`Tidak dapat menerapkan PRAGMA: ${e.message}`);
        }
        createTables()
          .then(() => resolve(db))
          .catch(reject);
      }
    });
  });
}

function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabel radcheck - untuk autentikasi user
      db.run(`
        CREATE TABLE IF NOT EXISTS radcheck (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          attribute TEXT NOT NULL,
          op TEXT NOT NULL DEFAULT '==',
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating radcheck table: ${err.message}`);
          reject(err);
          return;
        }
      });

      // Tabel radreply - untuk attribut balasan (seperti IP, speed limit, dll)
      db.run(`
        CREATE TABLE IF NOT EXISTS radreply (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          attribute TEXT NOT NULL,
          op TEXT NOT NULL DEFAULT '=',
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating radreply table: ${err.message}`);
          reject(err);
          return;
        }
      });

      // Tabel radacct - untuk accounting (tracking sesi user)
      db.run(`
        CREATE TABLE IF NOT EXISTS radacct (
          radacctid INTEGER PRIMARY KEY AUTOINCREMENT,
          acctsessionid TEXT NOT NULL,
          acctuniqueid TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL,
          nasipaddress TEXT NOT NULL,
          nasportid TEXT,
          nasporttype TEXT,
          acctstarttime TEXT,
          acctupdatetime TEXT,
          acctstoptime TEXT,
          acctinterval INTEGER,
          acctsessiontime INTEGER DEFAULT 0,
          acctauthentic TEXT,
          connectinfo_start TEXT,
          connectinfo_stop TEXT,
          acctinputoctets BIGINT DEFAULT 0,
          acctoutputoctets BIGINT DEFAULT 0,
          calledstationid TEXT,
          callingstationid TEXT,
          acctterminatecause TEXT,
          servicetype TEXT,
          framedprotocol TEXT,
          framedipaddress TEXT,
          acctstartdelay INTEGER,
          acctstopdelay INTEGER,
          xascendsessionsvrkey TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating radacct table: ${err.message}`);
          reject(err);
          return;
        }
      });

      // Tabel radgroupcheck - untuk group policies
      db.run(`
        CREATE TABLE IF NOT EXISTS radgroupcheck (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          groupname TEXT NOT NULL,
          attribute TEXT NOT NULL,
          op TEXT NOT NULL DEFAULT '==',
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating radgroupcheck table: ${err.message}`);
          reject(err);
          return;
        }
      });

      // Tabel radgroupreply - untuk group reply attributes
      db.run(`
        CREATE TABLE IF NOT EXISTS radgroupreply (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          groupname TEXT NOT NULL,
          attribute TEXT NOT NULL,
          op TEXT NOT NULL DEFAULT '=',
          value TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating radgroupreply table: ${err.message}`);
          reject(err);
          return;
        }
      });

      // Tabel radusergroup - untuk mapping user ke group
      db.run(`
        CREATE TABLE IF NOT EXISTS radusergroup (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          groupname TEXT NOT NULL,
          priority INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(username, groupname)
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating radusergroup table: ${err.message}`);
          reject(err);
          return;
        }
      });

      // Tabel nas - untuk NAS clients configuration
      db.run(`
        CREATE TABLE IF NOT EXISTS nas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nasname TEXT NOT NULL UNIQUE,
          shortname TEXT NOT NULL,
          type TEXT DEFAULT 'other',
          secret TEXT NOT NULL,
          server TEXT,
          community TEXT,
          description TEXT,
          ports INTEGER,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating nas table: ${err.message}`);
          reject(err);
          return;
        }
        logger.info('✅ Semua tabel RADIUS berhasil dibuat');
        resolve();
      });

      // Index untuk performa
      db.run(`CREATE INDEX IF NOT EXISTS idx_radcheck_username ON radcheck(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_radacct_sessionid ON radacct(acctsessionid)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_radusergroup_username ON radusergroup(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_nas_nasname ON nas(nasname)`);
      
      // Additional indexes untuk accounting queries dan retention cleanup
      db.run(`CREATE INDEX IF NOT EXISTS idx_radacct_stoptime ON radacct(acctstoptime)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_radacct_nasip ON radacct(nasipaddress)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_radacct_updatetime ON radacct(acctupdatetime)`);
    });
  });
}

// Fungsi query database
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database belum diinisialisasi'));
      return;
    }
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error(`Query error: ${err.message}`);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Fungsi untuk menjalankan query tanpa return value
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database belum diinisialisasi'));
      return;
    }
    
    db.run(sql, params, function(err) {
      if (err) {
        logger.error(`Run error: ${err.message}`);
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Fungsi untuk mendapatkan user dari radcheck
async function getRadiusUser(username) {
  try {
    const rows = await query(
      'SELECT * FROM radcheck WHERE username = ? AND attribute = "Cleartext-Password"',
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    logger.error(`Error getting radius user: ${error.message}`);
    return null;
  }
}

// Fungsi untuk membuat atau update user RADIUS
async function upsertRadiusUser(username, password) {
  try {
    const existingUser = await getRadiusUser(username);
    
    if (existingUser) {
      // Update password
      await run(
        'UPDATE radcheck SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND attribute = "Cleartext-Password"',
        [password, username]
      );
      logger.info(`✅ Updated RADIUS user: ${username}`);
    } else {
      // Insert new user
      await run(
        'INSERT INTO radcheck (username, attribute, op, value) VALUES (?, "Cleartext-Password", "==", ?)',
        [username, password]
      );
      logger.info(`✅ Created RADIUS user: ${username}`);
    }
    return true;
  } catch (error) {
    logger.error(`Error upserting radius user: ${error.message}`);
    return false;
  }
}

// Fungsi untuk menghapus user RADIUS
async function deleteRadiusUser(username) {
  try {
    await run('DELETE FROM radcheck WHERE username = ?', [username]);
    await run('DELETE FROM radreply WHERE username = ?', [username]);
    await run('DELETE FROM radusergroup WHERE username = ?', [username]);
    logger.info(`✅ Deleted RADIUS user: ${username}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting radius user: ${error.message}`);
    return false;
  }
}

// Fungsi untuk menambahkan reply attribute (seperti speed limit)
async function setRadiusReplyAttribute(username, attribute, value, op = '=') {
  try {
    // Hapus attribute lama dengan nama yang sama
    await run(
      'DELETE FROM radreply WHERE username = ? AND attribute = ?',
      [username, attribute]
    );
    
    // Insert attribute baru
    await run(
      'INSERT INTO radreply (username, attribute, op, value) VALUES (?, ?, ?, ?)',
      [username, attribute, op, value]
    );
    
    logger.info(`✅ Set RADIUS reply attribute for ${username}: ${attribute}=${value}`);
    return true;
  } catch (error) {
    logger.error(`Error setting radius reply attribute: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mendapatkan semua user RADIUS
async function getAllRadiusUsers() {
  try {
    const users = await query(
      'SELECT username, value as password, created_at, updated_at FROM radcheck WHERE attribute = "Cleartext-Password" ORDER BY username'
    );
    return users;
  } catch (error) {
    logger.error(`Error getting all radius users: ${error.message}`);
    return [];
  }
}

// Fungsi untuk mencatat accounting start
async function accountingStart(sessionData) {
  try {
    await run(`
      INSERT INTO radacct (
        acctsessionid, acctuniqueid, username, nasipaddress, 
        nasportid, nasporttype, acctstarttime, framedipaddress,
        callingstationid, calledstationid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sessionData.sessionId,
      sessionData.uniqueId,
      sessionData.username,
      sessionData.nasIp,
      sessionData.nasPortId || '',
      sessionData.nasPortType || 'Virtual',
      new Date().toISOString(),
      sessionData.framedIp || '',
      sessionData.callingStationId || '',
      sessionData.calledStationId || ''
    ]);
    
    logger.info(`✅ Accounting start recorded for ${sessionData.username}`);
    return true;
  } catch (error) {
    logger.error(`Error recording accounting start: ${error.message}`);
    return false;
  }
}

// Fungsi untuk update accounting
async function accountingUpdate(sessionData) {
  try {
    await run(`
      UPDATE radacct SET
        acctupdatetime = ?,
        acctsessiontime = ?,
        acctinputoctets = ?,
        acctoutputoctets = ?
      WHERE acctsessionid = ? AND username = ?
    `, [
      new Date().toISOString(),
      sessionData.sessionTime || 0,
      sessionData.inputOctets || 0,
      sessionData.outputOctets || 0,
      sessionData.sessionId,
      sessionData.username
    ]);
    
    return true;
  } catch (error) {
    logger.error(`Error updating accounting: ${error.message}`);
    return false;
  }
}

// Fungsi untuk accounting stop
async function accountingStop(sessionData) {
  try {
    await run(`
      UPDATE radacct SET
        acctstoptime = ?,
        acctsessiontime = ?,
        acctinputoctets = ?,
        acctoutputoctets = ?,
        acctterminatecause = ?
      WHERE acctsessionid = ? AND username = ?
    `, [
      new Date().toISOString(),
      sessionData.sessionTime || 0,
      sessionData.inputOctets || 0,
      sessionData.outputOctets || 0,
      sessionData.terminateCause || 'User-Request',
      sessionData.sessionId,
      sessionData.username
    ]);
    
    logger.info(`✅ Accounting stop recorded for ${sessionData.username}`);
    return true;
  } catch (error) {
    logger.error(`Error recording accounting stop: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mendapatkan active sessions
async function getActiveSessions() {
  try {
    const sessions = await query(`
      SELECT * FROM radacct 
      WHERE acctstoptime IS NULL 
      ORDER BY acctstarttime DESC
    `);
    return sessions;
  } catch (error) {
    logger.error(`Error getting active sessions: ${error.message}`);
    return [];
  }
}

// Fungsi untuk menutup database
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          logger.error(`Error closing database: ${err.message}`);
          reject(err);
        } else {
          logger.info('Database RADIUS ditutup');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

// ==================== NAS CLIENTS MANAGEMENT ====================

// Get all NAS clients
async function getAllNasClients() {
  try {
    const clients = await query('SELECT * FROM nas ORDER BY id ASC');
    return clients;
  } catch (error) {
    logger.error(`Error getting NAS clients: ${error.message}`);
    return [];
  }
}

// Get NAS client by nasname (IP)
async function getNasClient(nasname) {
  try {
    const clients = await query('SELECT * FROM nas WHERE nasname = ?', [nasname]);
    return clients.length > 0 ? clients[0] : null;
  } catch (error) {
    logger.error(`Error getting NAS client: ${error.message}`);
    return null;
  }
}

// Add new NAS client
async function addNasClient(nasname, shortname, secret, type = 'other', description = '') {
  try {
    await run(`
      INSERT INTO nas (nasname, shortname, secret, type, description, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [nasname, shortname, secret, type, description]);
    
    logger.info(`✅ NAS client added: ${shortname} (${nasname})`);
    return true;
  } catch (error) {
    logger.error(`Error adding NAS client: ${error.message}`);
    return false;
  }
}

// Update NAS client
async function updateNasClient(id, nasname, shortname, secret, type = 'other', description = '') {
  try {
    await run(`
      UPDATE nas SET
        nasname = ?,
        shortname = ?,
        secret = ?,
        type = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [nasname, shortname, secret, type, description, id]);
    
    logger.info(`✅ NAS client updated: ${shortname} (${nasname})`);
    return true;
  } catch (error) {
    logger.error(`Error updating NAS client: ${error.message}`);
    return false;
  }
}

// Delete NAS client
async function deleteNasClient(id) {
  try {
    await run('DELETE FROM nas WHERE id = ?', [id]);
    logger.info(`✅ NAS client deleted: ID ${id}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting NAS client: ${error.message}`);
    return false;
  }
}

// ==================== RADIUS GROUPS MANAGEMENT ====================

// Set group reply attribute (untuk package bandwidth limits)
async function setRadiusGroupReplyAttribute(groupname, attribute, value, op = '=') {
  try {
    // Hapus attribute lama dengan nama yang sama
    await run(
      'DELETE FROM radgroupreply WHERE groupname = ? AND attribute = ?',
      [groupname, attribute]
    );
    
    // Insert attribute baru
    await run(
      'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, ?, ?, ?)',
      [groupname, attribute, op, value]
    );
    
    logger.info(`✅ Set RADIUS group reply attribute for ${groupname}: ${attribute}=${value}`);
    return true;
  } catch (error) {
    logger.error(`Error setting radius group reply attribute: ${error.message}`);
    return false;
  }
}

// Get all groups
async function getAllRadiusGroups() {
  try {
    const groups = await query(
      'SELECT DISTINCT groupname FROM radgroupreply ORDER BY groupname'
    );
    return groups;
  } catch (error) {
    logger.error(`Error getting all radius groups: ${error.message}`);
    return [];
  }
}

// Delete group (remove all group attributes)
async function deleteRadiusGroup(groupname) {
  try {
    await run('DELETE FROM radgroupcheck WHERE groupname = ?', [groupname]);
    await run('DELETE FROM radgroupreply WHERE groupname = ?', [groupname]);
    await run('DELETE FROM radusergroup WHERE groupname = ?', [groupname]);
    logger.info(`✅ Deleted RADIUS group: ${groupname}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting radius group: ${error.message}`);
    return false;
  }
}

// Assign user to group
async function assignUserToGroup(username, groupname, priority = 1) {
  try {
    // Cek apakah sudah ada
    const existing = await query(
      'SELECT * FROM radusergroup WHERE username = ? AND groupname = ?',
      [username, groupname]
    );
    
    if (existing.length > 0) {
      // Update priority
      await run(
        'UPDATE radusergroup SET priority = ? WHERE username = ? AND groupname = ?',
        [priority, username, groupname]
      );
      logger.info(`✅ Updated user group assignment: ${username} -> ${groupname}`);
    } else {
      // Insert new
      await run(
        'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, ?)',
        [username, groupname, priority]
      );
      logger.info(`✅ Assigned user to group: ${username} -> ${groupname}`);
    }
    return true;
  } catch (error) {
    logger.error(`Error assigning user to group: ${error.message}`);
    return false;
  }
}

// Remove user from group
async function removeUserFromGroup(username, groupname) {
  try {
    await run(
      'DELETE FROM radusergroup WHERE username = ? AND groupname = ?',
      [username, groupname]
    );
    logger.info(`✅ Removed user from group: ${username} -> ${groupname}`);
    return true;
  } catch (error) {
    logger.error(`Error removing user from group: ${error.message}`);
    return false;
  }
}

// Get online users count by group
async function getOnlineUsersByGroup() {
  try {
    const sql = `
      SELECT 
        rug.groupname,
        COUNT(DISTINCT ra.username) as online_count
      FROM radusergroup rug
      LEFT JOIN radacct ra ON ra.username = rug.username 
        AND ra.acctstoptime IS NULL
      GROUP BY rug.groupname
    `;
    const rows = await query(sql);
    
    // Convert to object map: { groupname: count }
    const result = {};
    rows.forEach(row => {
      result[row.groupname] = row.online_count || 0;
    });
    
    return result;
  } catch (error) {
    logger.error(`Error getting online users by group: ${error.message}`);
    return {};
  }
}

// Get online users for specific group
async function getOnlineUsersForGroup(groupname) {
  try {
    const sql = `
      SELECT 
        ra.username,
        ra.nasipaddress,
        ra.framedipaddress,
        ra.acctstarttime,
        ra.acctinputoctets,
        ra.acctoutputoctets
      FROM radacct ra
      INNER JOIN radusergroup rug ON rug.username = ra.username
      WHERE rug.groupname = ?
        AND ra.acctstoptime IS NULL
      ORDER BY ra.acctstarttime DESC
    `;
    return await query(sql, [groupname]);
  } catch (error) {
    logger.error(`Error getting online users for group: ${error.message}`);
    return [];
  }
}

module.exports = {
  initDatabase,
  query,
  run,
  getRadiusUser,
  upsertRadiusUser,
  deleteRadiusUser,
  setRadiusReplyAttribute,
  getAllRadiusUsers,
  accountingStart,
  accountingUpdate,
  accountingStop,
  getActiveSessions,
  closeDatabase,
  // NAS clients management
  getAllNasClients,
  getNasClient,
  addNasClient,
  updateNasClient,
  deleteNasClient,
  // Groups management
  setRadiusGroupReplyAttribute,
  getAllRadiusGroups,
  deleteRadiusGroup,
  assignUserToGroup,
  removeUserFromGroup,
  getOnlineUsersByGroup,
  getOnlineUsersForGroup
};
