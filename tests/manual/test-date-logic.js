const paid = new Date('2025-10-25T15:44:55.184Z');
const key = paid.toISOString().split('T')[0];
console.log('Paid date key:', key);

const now = new Date();
const start = new Date(now);
start.setDate(start.getDate() - 6);
start.setHours(0, 0, 0, 0);

console.log('Start:', start.toISOString());
console.log('Now:', now.toISOString());

const byDate = new Map();
const amt = 150000;
byDate.set(key, amt);
console.log('byDate Map:', Array.from(byDate.entries()));

console.log('\nChecking 7 days:');
for (let i = 0; i < 7; i++) {
  const d = new Date(start);
  d.setDate(start.getDate() + i);
  const k = d.toISOString().split('T')[0];
  const revenue = byDate.get(k) || 0;
  console.log(`Day ${i}: ${k} = Rp ${revenue.toLocaleString('id-ID')}`);
}
