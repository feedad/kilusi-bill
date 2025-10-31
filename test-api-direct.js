// Direct API test
const billing = require('./config/billing');

console.log('\n=== REVENUE CHART TEST ===');
const days = 30;
const allInvoices = billing.getAllInvoices();
console.log(`Total invoices: ${allInvoices.length}`);

const now = new Date();
const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
console.log(`Start date: ${startDate.toISOString()}`);
console.log(`Now: ${now.toISOString()}`);

const byDate = new Map();
let paidCount = 0;
for (const inv of allInvoices) {
  console.log(`\nChecking invoice: ${inv.invoice_number}`);
  console.log(`  Status: ${inv.status}`);
  console.log(`  Paid at: ${inv.paid_at}`);
  
  if (inv.status !== 'paid') {
    console.log('  ❌ Skipped: not paid');
    continue;
  }
  if (!inv.paid_at) {
    console.log('  ❌ Skipped: no paid_at');
    continue;
  }
  
  const paid = new Date(inv.paid_at);
  console.log(`  Paid date object: ${paid.toISOString()}`);
  
  if (isNaN(paid.getTime())) {
    console.log('  ❌ Skipped: invalid date');
    continue;
  }
  
  console.log(`  Compare: paid (${paid.toISOString()}) < startDate (${startDate.toISOString()})? ${paid < startDate}`);
  console.log(`  Compare: paid (${paid.toISOString()}) > now (${now.toISOString()})? ${paid > now}`);
  
  if (paid < startDate || paid > now) {
    console.log('  ❌ Skipped: outside date range');
    continue;
  }
  
  const key = paid.toISOString().split('T')[0];
  const amt = Number.parseFloat(inv.amount) || 0;
  byDate.set(key, (byDate.get(key) || 0) + amt);
  paidCount++;
  console.log(`  ✅ Added: ${key} = Rp ${amt.toLocaleString('id-ID')}`);
}

console.log(`\nFound ${paidCount} paid invoices in range`);
console.log('Revenue by date:', Array.from(byDate.entries()));

const dates = [];
const revenues = [];
for (let i = 0; i < days; i++) {
  const d = new Date(startDate);
  d.setUTCDate(startDate.getUTCDate() + i);
  const key = d.toISOString().split('T')[0];
  dates.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
  revenues.push(byDate.get(key) || 0);
}

const total = revenues.reduce((a, b) => a + b, 0);
console.log(`\nTotal revenue: Rp ${total.toLocaleString('id-ID')}`);
console.log('Non-zero days:', revenues.filter(r => r > 0).length);

console.log('\n=== ACTIVITY LOG TEST ===');
const allCustomers = billing.getAllCustomers();
console.log(`Total customers: ${allCustomers.length}`);

const activities = [];

// Payments
const paidInvoices = allInvoices.filter(inv => inv.status === 'paid' && inv.paid_at);
console.log(`Paid invoices: ${paidInvoices.length}`);
paidInvoices.forEach(inv => {
  activities.push({
    type: 'payment',
    title: 'Pembayaran Diterima',
    description: `Invoice ${inv.invoice_number} - ${inv.customer_name || inv.customer_phone}`,
    user: inv.admin_name || 'Admin',
    timestamp: inv.paid_at
  });
});

// Invoices
const createdInvoices = allInvoices.filter(inv => inv.created_at);
console.log(`Created invoices: ${createdInvoices.length}`);
createdInvoices.forEach(inv => {
  activities.push({
    type: 'invoice',
    title: 'Invoice Dibuat',
    description: `Invoice ${inv.invoice_number} untuk ${inv.customer_name || inv.customer_phone}`,
    user: inv.admin_name || 'System',
    timestamp: inv.created_at
  });
});

// Customers
const newCustomers = allCustomers.filter(c => c.created_at);
console.log(`New customers: ${newCustomers.length}`);
newCustomers.forEach(c => {
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
console.log('\nActivities:');
activities.forEach((a, i) => {
  console.log(`${i + 1}. [${a.type}] ${a.title} - ${a.description} (${new Date(a.timestamp).toLocaleString('id-ID')})`);
});
