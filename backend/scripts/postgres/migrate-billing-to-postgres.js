/*
  Lightweight migration helper: exports current billing data into SQL INSERTs
  Usage (PowerShell):
    node scripts/postgres/migrate-billing-to-postgres.js > scripts/postgres/data-seed.sql
  Then load into Postgres (psql):
    psql -h localhost -U youruser -d yourdb -f scripts/postgres/schema-billing.sql
    psql -h localhost -U youruser -d yourdb -f scripts/postgres/data-seed.sql
*/

const fs = require('fs');
const path = require('path');
const billing = require('../../config/billing');

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

function ISO(d) {
  if (!d) return 'NULL';
  const t = new Date(d);
  if (isNaN(t.getTime())) return 'NULL';
  return esc(t.toISOString());
}

function printHeader() {
  console.log('-- Generated seed from existing billing data');
  console.log('BEGIN;');
}

function printFooter() {
  console.log('COMMIT;');
}

function seedPackages(packages) {
  if (!Array.isArray(packages)) return;
  console.log('\n-- Packages');
  for (const p of packages) {
    // Use name as unique key for matching later
    console.log(`INSERT INTO packages(name, speed_down_mbps, speed_up_mbps, price_idr, radius_download_rate, radius_upload_rate)\nVALUES (${esc(p.name)}, ${p.speed_down_mbps||0}, ${p.speed_up_mbps||0}, ${p.price_idr||0}, ${esc(p.radius_download_rate)}, ${esc(p.radius_upload_rate)}) ON CONFLICT DO NOTHING;`);
  }
}

function seedNas(nasList) {
  if (!Array.isArray(nasList)) return;
  console.log('\n-- NAS Servers');
  for (const n of nasList) {
    const shortname = esc(n.name||n.shortname||n.nasname);
    const nasname = esc(n.ip||n.nasname);
    console.log(`INSERT INTO nas_servers(shortname, nasname, secret, type, description)\nVALUES (${shortname}, ${nasname}, ${esc(n.secret||'')}, ${esc(n.type||'other')}, ${esc(n.description||'')}) ON CONFLICT (nasname) DO NOTHING;`);
  }
}

function seedMikrotik(mtList) {
  if (!Array.isArray(mtList)) return;
  console.log('\n-- Mikrotik Servers');
  for (const m of mtList) {
    const name = esc(m.name||m.host);
    const host = esc(m.host);
    console.log(`INSERT INTO mikrotik_servers(name, host, api_port, username, password, description)\nVALUES (${name}, ${host}, ${m.api_port||8728}, ${esc(m.username||'')}, ${esc(m.password||'')}, ${esc(m.description||'')}) ON CONFLICT (host) DO NOTHING;`);
  }
}

function seedCustomers(customers) {
  if (!Array.isArray(customers)) return;
  console.log('\n-- Customers with FK mapping');
  for (const c of customers) {
    // Map package_id by matching package name
    let packageClause = 'NULL';
    if (c.package_name) {
      packageClause = `(SELECT id FROM packages WHERE name = ${esc(c.package_name)} LIMIT 1)`;
    }
    
    // Map nas_server_id by matching IP/nasname (if available)
    let nasClause = 'NULL';
    if (c.nas_ip) {
      nasClause = `(SELECT id FROM nas_servers WHERE nasname = ${esc(c.nas_ip)} LIMIT 1)`;
    }
    
    // Map mikrotik_server_id by matching host
    let mtClause = 'NULL';
    if (c.mikrotik_host) {
      mtClause = `(SELECT id FROM mikrotik_servers WHERE host = ${esc(c.mikrotik_host)} LIMIT 1)`;
    }
    
    console.log(`INSERT INTO customers(name, phone, username, password, address, status, package_id, nas_server_id, mikrotik_server_id, static_ip, created_at)\nVALUES (${esc(c.name)}, ${esc(c.phone)}, ${esc(c.username)}, ${esc(c.password)}, ${esc(c.address)}, ${esc(c.status||'active')}, ${packageClause}, ${nasClause}, ${mtClause}, ${esc(c.static_ip||null)}, ${ISO(c.created_at)||'NOW()'}) ON CONFLICT (username) DO NOTHING;`);
  }
}

function seedInvoices(invoices) {
  if (!Array.isArray(invoices)) return;
  console.log('\n-- Invoices');
  for (const inv of invoices) {
    // Map customer via username
    console.log(`INSERT INTO invoices(invoice_number, customer_id, amount, status, due_date, created_at, paid_at)\nSELECT ${esc(inv.invoice_number)}, c.id, ${Number(inv.amount)||0}, ${esc(inv.status||'unpaid')}, ${inv.due_date?esc(inv.due_date):'NULL'}, ${ISO(inv.created_at)||'NOW()'}, ${ISO(inv.paid_at)}\nFROM customers c WHERE c.username = ${esc(inv.customer_username||inv.username)}\nON CONFLICT (invoice_number) DO NOTHING;`);
  }
}

function seedPayments(payments) {
  if (!Array.isArray(payments)) return;
  console.log('\n-- Payments');
  for (const p of payments) {
    console.log(`INSERT INTO payments(invoice_id, amount, method, reference, admin_name, created_at)\nSELECT i.id, ${Number(p.amount)||0}, ${esc(p.method||'cash')}, ${esc(p.reference||'')}, ${esc(p.admin_name||'Admin')}, ${ISO(p.created_at)||'NOW()'}\nFROM invoices i WHERE i.invoice_number = ${esc(p.invoice_number)}\nON CONFLICT DO NOTHING;`);
  }
}

(function run() {
  printHeader();
  try {
    const packages = (billing.getAllPackages && billing.getAllPackages()) || [];
    const customers = (billing.getAllCustomers && billing.getAllCustomers()) || [];
    const invoices  = (billing.getAllInvoices && billing.getAllInvoices()) || [];
    const payments  = (billing.getAllPayments && billing.getAllPayments()) || [];

    // Optional: read NAS/Mikrotik config if available
    let nasClients = [];
    try {
      const settingsPath = path.join(__dirname, '../../settings.json');
      if (fs.existsSync(settingsPath)) {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (Array.isArray(s.radius_nas_clients)) nasClients = s.radius_nas_clients;
      }
    } catch {}

    const mikrotikServers = []; // populate if you have a source

    seedPackages(packages);
    seedNas(nasClients);
    seedMikrotik(mikrotikServers);
    seedCustomers(customers);
    seedInvoices(invoices);
    seedPayments(payments);
  } catch (e) {
    console.error('-- ERROR:', e.message);
    console.log('ROLLBACK;');
    process.exit(1);
  }
  printFooter();
})();
