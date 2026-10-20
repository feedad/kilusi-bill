/**
 * Migrate legacy data from autopay database to kilusi_bill database
 */
const { Pool } = require('pg');

async function migrateLegacyAutopay() {
  const autopayPool = new Pool({
    host: process.env.POSTGRES_HOST || '172.22.10.101',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: 'autopay',
    user: process.env.POSTGRES_USER || 'kilusi_user',
    password: process.env.POSTGRES_PASSWORD || 'kilusi17!',
  });

  const kilusiPool = new Pool({
    host: process.env.POSTGRES_HOST || '172.22.10.101',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: 'kilusi_bill',
    user: process.env.POSTGRES_USER || 'kilusi_user',
    password: process.env.POSTGRES_PASSWORD || 'kilusi17!',
  });

  console.log('Connecting to databases...');

  try {
    // 1. Migrate API Keys
    const apiKeysRes = await autopayPool.query(`SELECT * FROM api_keys ORDER BY id ASC`);
    console.log(`Found ${apiKeysRes.rows.length} API keys in autopay database`);

    for (const row of apiKeysRes.rows) {
      await kilusiPool.query(`
        INSERT INTO autopay_devices (id, device_name, api_key, secret, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (api_key) DO UPDATE SET
          device_name = EXCLUDED.device_name,
          secret = EXCLUDED.secret
      `, [row.id, row.device_name, row.key, row.secret, row.created_at]);
    }

    // Reset sequence for autopay_devices
    await kilusiPool.query(`
      SELECT setval('autopay_devices_id_seq', COALESCE((SELECT MAX(id) FROM autopay_devices), 1))
    `);
    console.log('API keys migrated successfully');

    // 2. Fetch matched invoice map from autopay.invoices
    const matchedInvoicesRes = await autopayPool.query(`
      SELECT invoice_id, mutation_id, matched_at
      FROM invoices
      WHERE mutation_id IS NOT NULL
    `);
    const mutationToInvNum = new Map();
    for (const r of matchedInvoicesRes.rows) {
      mutationToInvNum.set(r.mutation_id, {
        invoiceNumber: r.invoice_id,
        matchedAt: r.matched_at,
      });
    }
    console.log(`Found ${mutationToInvNum.size} invoice-mutation links in legacy autopay`);

    // Fetch invoice numbers to ID map in kilusi_bill
    const kilusiInvoicesRes = await kilusiPool.query(`SELECT id, invoice_number FROM invoices`);
    const invNumToId = new Map();
    for (const r of kilusiInvoicesRes.rows) {
      invNumToId.set(r.invoice_number, r.id);
    }

    // 3. Migrate mutations
    const mutationsRes = await autopayPool.query(`SELECT * FROM mutations ORDER BY id ASC`);
    console.log(`Found ${mutationsRes.rows.length} mutations in autopay database`);

    let migrated = 0;
    for (const m of mutationsRes.rows) {
      let matchedInvoiceId = null;
      let matchedAt = null;

      const link = mutationToInvNum.get(m.id);
      if (link && invNumToId.has(link.invoiceNumber)) {
        matchedInvoiceId = invNumToId.get(link.invoiceNumber);
        matchedAt = link.matchedAt || m.created_at;
      }

      await kilusiPool.query(`
        INSERT INTO bank_mutations (
          id, bank_id, amount, type, source_type, description,
          sender_info, raw_content, status, matched_invoice_id, matched_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          matched_invoice_id = EXCLUDED.matched_invoice_id,
          matched_at = EXCLUDED.matched_at
      `, [
        m.id,
        m.bank_id || null,
        m.amount,
        m.type || 'CR',
        m.source_type || 'MOBILE',
        m.description || null,
        m.sender_info || null,
        m.raw_content || null,
        m.status || 'PENDING',
        matchedInvoiceId,
        matchedAt,
        m.created_at,
      ]);
      migrated++;
    }

    // Reset sequence for bank_mutations
    await kilusiPool.query(`
      SELECT setval('bank_mutations_id_seq', COALESCE((SELECT MAX(id) FROM bank_mutations), 1))
    `);

    console.log(`Migrated ${migrated} mutations into bank_mutations successfully`);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await autopayPool.end();
    await kilusiPool.end();
  }
}

migrateLegacyAutopay();
