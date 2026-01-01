const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const migrationsDir = path.join(__dirname, '../migrations');
const files = fs.readdirSync(migrationsDir);

const exclude = [
    'init-database.js', 
    'init-postgres.js', 
    'normalize-customer-schema.js', 
    'migrate-sqlite-to-postgres.js',
    'check-db.js' // Utility
];

const migrationFiles = files.filter(f => f.endsWith('.js') && !exclude.includes(f));

// Sort files to try and respect dependencies? 
// Alphabetical might be bad for 'change-' vs 'create-'. 
// We'll prioritize 'create-' then 'add-' then 'change-'.

const priority = (name) => {
    if (name.startsWith('create-')) return 1;
    if (name.startsWith('add-')) return 2;
    if (name.startsWith('update-')) return 3;
    if (name.startsWith('change-')) return 4;
    if (name.startsWith('fix-')) return 5;
    return 10;
};

migrationFiles.sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
});

console.log(`Found ${migrationFiles.length} migrations to run.`);

for (const file of migrationFiles) {
    console.log(`--------------------------------------------------`);
    console.log(`Running ${file}...`);
    try {
        execSync(`node "${path.join(migrationsDir, file)}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        console.log(`✅ ${file} success`);
    } catch (e) {
        console.error(`❌ ${file} failed`);
        // We continue, because some might fail if already applied or irrelevant
    }
}
console.log('Done.');
