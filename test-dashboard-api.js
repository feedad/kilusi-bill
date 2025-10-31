// Test script untuk dashboard API
const billing = require('./config/billing');

console.log('\n=== Testing Revenue Chart ===');
const days = 7;
const allInvoices = billing.getAllInvoices();
console.log(`Total invoices: ${allInvoices.length}`);

const now = new Date();
const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));

console.log(`Start date: ${startDate.toISOString()}`);
console.log(`Now: ${now.toISOString()}`);

const byDate = new Map();
for (const inv of allInvoices) {
  if (inv.status !== 'paid') continue;
  if (!inv.paid_at) continue;
  const paid = new Date(inv.paid_at);
  if (isNaN(paid.getTime())) continue;
  if (paid < startDate || paid > now) continue;
  const key = paid.toISOString().split('T')[0];
  const amt = Number.parseFloat(inv.amount) || 0;
  byDate.set(key, (byDate.get(key) || 0) + amt);
  console.log(`  Invoice ${inv.invoice_number}: Rp ${amt.toLocaleString('id-ID')} on ${key}`);
}

const dates = [];
const revenues = [];
for (let i = 0; i < days; i++) {
  const d = new Date(startDate);
  d.setUTCDate(startDate.getUTCDate() + i);
  const key = d.toISOString().split('T')[0];
  dates.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
  revenues.push(byDate.get(key) || 0);
}

console.log('\nDates:', dates);
console.log('Revenues:', revenues.map(r => `Rp ${r.toLocaleString('id-ID')}`));
console.log(`Total: Rp ${revenues.reduce((a, b) => a + b, 0).toLocaleString('id-ID')}`);

console.log('\n=== Testing Activity Log ===');
const allCustomers = billing.getAllCustomers();
console.log(`Total customers: ${allCustomers.length}`);

const activities = [];

// Payments
allInvoices
  .filter(inv => inv.status === 'paid' && inv.paid_at)
  .forEach(inv => {
    activities.push({
      type: 'payment',
      title: 'Pembayaran Diterima',
      description: `Invoice ${inv.invoice_number} - ${inv.customer_name || inv.customer_phone}`,
      user: inv.admin_name || 'Admin',
      timestamp: inv.paid_at
    });
  });

// Invoices created
allInvoices
  .filter(inv => inv.created_at)
  .slice(0, 5)
  .forEach(inv => {
    activities.push({
      type: 'invoice',
      title: 'Invoice Dibuat',
      description: `Invoice ${inv.invoice_number} untuk ${inv.customer_name || inv.customer_phone}`,
      user: inv.admin_name || 'System',
      timestamp: inv.created_at
    });
  });

// Customers created
allCustomers
  .filter(c => c.created_at)
  .slice(0, 3)
  .forEach(c => {
    activities.push({
      type: 'customer',
      title: 'Customer Baru',
      description: `${c.name || 'Customer'} - ${c.phone}`,
      user: 'Admin',
      timestamp: c.created_at
    });
  });

activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

console.log(`\nTotal activities: ${activities.length}`);
activities.slice(0, 10).forEach((a, i) => {
  console.log(`${i + 1}. [${a.type}] ${a.title} - ${a.description} (${new Date(a.timestamp).toLocaleString('id-ID')})`);
});

console.log('\n=== Test Completed ===');
