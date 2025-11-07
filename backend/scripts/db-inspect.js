const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'billing.db');
const db = new sqlite3.Database(dbPath);

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

(async () => {
  try {
    console.log(`Inspecting DB at: ${dbPath}`);
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('Tables:', tables.map(r => r.name));

    const need = ['nas_servers', 'mikrotik_servers', 'customers', 'packages', 'invoices', 'payments'];
    const have = new Set(tables.map(r => r.name));
    const missing = need.filter(n => !have.has(n));

    let cols = [];
    if (have.has('customers')) {
      cols = await all("PRAGMA table_info(customers)");
      const colNames = cols.map(c => c.name);
      console.log('customers columns:', colNames);
      const requiredCols = ['nas_server_id', 'mikrotik_server_id'];
      const missingCols = requiredCols.filter(c => !colNames.includes(c));

      console.log('--- Summary ---');
      console.log('Missing tables:', missing);
      console.log('Missing customer columns:', missingCols);
      const pass = missing.length === 0 && missingCols.length === 0;
      console.log(pass ? 'PASS: Multi-server schema present' : 'FAIL: Schema incomplete');
      process.exit(pass ? 0 : 2);
    } else {
      console.log('customers table not found');
      console.log('--- Summary ---');
      console.log('Missing tables:', missing);
      console.log('Missing customer columns: unknown');
      console.log('FAIL: Schema incomplete');
      process.exit(2);
    }
  } catch (e) {
    console.error('Error inspecting DB:', e.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();
