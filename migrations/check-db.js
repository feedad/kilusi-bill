const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./billing.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('Tables:', rows);
    db.close();
});
