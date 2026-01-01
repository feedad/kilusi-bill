const fs = require('fs');

const content = fs.readFileSync('/home/feedad/kilusi-bill/frontend/src/app/admin/customers/page.tsx', 'utf8');
const lines = content.split('\n');

let balance = 0;
let componentStarted = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Simple naive parser (ignores comments/strings for speed, might be inaccurate but good enough for indentation check)
    // Remove strings and comments
    let safeLine = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/\/\/.*$/, '');
    
    const open = (safeLine.match(/\{/g) || []).length;
    const close = (safeLine.match(/\}/g) || []).length;

    if (line.includes('export default function CustomersPage()')) {
        componentStarted = true;
        console.log(`Component starts at line ${i + 1}`);
    }

    if (componentStarted) {
        balance += open;
        balance -= close;

        if (balance <= 0) {
            console.log(`Component potentially closes at line ${i + 1}. Balance: ${balance}`);
            // Don't break, keep creating log to see if it goes negative
        }
    }
}
