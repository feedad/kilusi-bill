const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { query } = require('./database');
const { getSetting } = require('./settingsManager');
const { logger } = require('./logger');

const QRIS_DIR = path.resolve(__dirname, '../public/qris');

function parseTLV(str) {
  const tags = [];
  let i = 0;
  while (i < str.length) {
    const tag = str.substring(i, i + 2);
    i += 2;
    const len = parseInt(str.substring(i, i + 2), 10);
    i += 2;
    const value = str.substring(i, i + len);
    i += len;
    tags.push({ tag, len, value });
  }
  return tags;
}

function encodeTLV(tags) {
  return tags.map((t) => `${t.tag}${String(t.len).padStart(2, '0')}${t.value}`).join('');
}

function crc16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function generatePayload(basePayload, amount) {
  const tags = parseTLV(basePayload);
  const newTags = [];

  for (const t of tags) {
    if (t.tag === '63') continue; // skip old CRC
    if (t.tag === '54') continue; // skip old amount
    newTags.push(t);
  }

  const amountStr = String(Math.round(amount)).padStart(12, '0');
  newTags.push({ tag: '54', len: 12, value: amountStr });

  let payload = encodeTLV(newTags);
  const checksum = crc16(payload + '6304');
  payload += '6304' + checksum;
  return payload;
}

async function generateForInvoice(invoiceId) {
  // Ensure output directory exists
  if (!fs.existsSync(QRIS_DIR)) {
    fs.mkdirSync(QRIS_DIR, { recursive: true });
  }

  // Get invoice data
  const invResult = await query(
    `SELECT i.invoice_number, i.amount, i.amount_with_code
     FROM invoices i WHERE i.id = $1`,
    [invoiceId]
  );
  if (invResult.rows.length === 0) throw new Error(`Invoice ${invoiceId} not found`);

  const inv = invResult.rows[0];
  const amount = inv.amount_with_code || inv.amount;

  // Get base QRIS payload
  const basePayload = getSetting('qris_static_payload');
  if (!basePayload) throw new Error('QRIS static payload not configured');

  // Generate QRIS payload with amount
  const qrisPayload = generatePayload(basePayload, amount);

  // Generate QR PNG
  const filePath = path.join(QRIS_DIR, `${inv.invoice_number}.png`);
  await QRCode.toFile(filePath, qrisPayload, {
    type: 'png', width: 400, margin: 2,
    color: { dark: '#000', light: '#fff' }
  });

  // Also generate as data URL for inline use
  const dataUrl = await QRCode.toDataURL(qrisPayload, {
    width: 400, margin: 2,
    color: { dark: '#000', light: '#fff' }
  });

  logger.info(`[QRIS] Generated QR for ${inv.invoice_number} amount=${amount}`);

  return { filePath, dataUrl, amount, invoiceNumber: inv.invoice_number };
}

/**
 * Get QRIS data URL for portal display (lightweight, no file save)
 * @param {number} invoiceId - Invoice database ID
 * @returns {{ qrDataUrl: string, amount_with_code: number }}
 */
async function getQRISDataUrl(invoiceId) {
  const invResult = await query(
    `SELECT invoice_number, amount, amount_with_code FROM invoices WHERE id = $1`,
    [invoiceId]
  );
  if (invResult.rows.length === 0) throw new Error(`Invoice ${invoiceId} not found`);

  const inv = invResult.rows[0];
  const amount = inv.amount_with_code || inv.amount;

  const basePayload = getSetting('qris_static_payload');
  if (!basePayload) throw new Error('QRIS static payload not configured');

  const qrisPayload = generatePayload(basePayload, amount);

  const qrDataUrl = await QRCode.toDataURL(qrisPayload, {
    width: 400, margin: 2,
    color: { dark: '#000', light: '#fff' }
  });

  logger.info(`[QRIS] Generated dataURL for ${inv.invoice_number} amount=${amount}`);

  return { qrDataUrl, amount_with_code: amount };
}

/**
 * Generate branded QR HTML page (mobile-first, dark theme)
 * @param {number} invoiceId - Invoice database ID
 * @returns {string|null} HTML page or null on error
 */
async function generateBrandedPage(invoiceId) {
  const invResult = await query(`
    SELECT i.invoice_number, i.amount, i.amount_with_code, i.due_date, c.name,
           m.id as customer_mitra_id, m.name as mitra_name
    FROM invoices i
    JOIN customers c ON i.customer_id = c.id
    LEFT JOIN services s ON s.service_number = i.service_number
    LEFT JOIN regions r ON r.id = s.region_id
    LEFT JOIN mitra m ON m.id = r.mitra_id
    WHERE i.id = $1`, [invoiceId]
  );
  if (invResult.rows.length === 0) { logger.error(`[QRIS] Invoice ${invoiceId} not found`); return null; }
  const inv = invResult.rows[0];
  const amount = inv.amount_with_code || inv.amount;

  const basePayload = getSetting('qris_static_payload');
  if (!basePayload) { logger.error('[QRIS] No static payload configured'); return null; }

  const qrisPayload = generatePayload(basePayload, amount);
  const qrDataUrl = await QRCode.toDataURL(qrisPayload, { width: 280, margin: 1, color: { dark: '#000', light: '#fff' } });

  const paymentSettings = getSetting('payment_settings');
  let banks = [], ewallets = [];
  try {
    const ps = typeof paymentSettings === 'string' ? JSON.parse(paymentSettings) : paymentSettings;
    const filterAccountForMitra = (acc) => {
      if (acc.isActive === false) return false;
      // Company account (is_company === true) -> show for ALL customers
      if (acc.is_company === true) return true;
      // No mitra_id assigned -> show as fallback
      if (!acc.mitra_id) return true;
      // Mitra account -> only show if matches customer's mitra_id
      return inv.customer_mitra_id && String(acc.mitra_id) === String(inv.customer_mitra_id);
    };

    if (ps?.bank_accounts) banks = ps.bank_accounts.filter(filterAccountForMitra);
    if (ps?.ewallets) ewallets = ps.ewallets.filter(filterAccountForMitra);
  } catch { /* use empty */ }

  const bankRows = banks.map(b => `
    <div class="bank-row"><span class="bank-name">${b.bankName || b.bank_name || '-'}</span><span class="bank-num">${b.accountNumber || b.account_number || '-'}</span><span class="bank-holder">${b.accountName || b.account_holder || '-'}</span></div>
  `).join('');

  const ewalletRows = ewallets.map(e => `
    <div class="ewallet-row"><span class="ewallet-prov">${e.provider || '-'}</span><span class="ewallet-num">${e.phoneNumber || e.phone_number || '-'}</span><span class="ewallet-holder">${e.accountName || e.account_holder || '-'}</span></div>
  `).join('');

  const companyName = getSetting('company.name', 'Kilusi ISP');
  let logoSvg = '';
  try {
    const logoPath = path.resolve(__dirname, '../public/uploads/branding/logo.svg');
    if (fs.existsSync(logoPath)) {
      const svgBuffer = fs.readFileSync(logoPath);
      logoSvg = 'data:image/svg+xml;base64,' + svgBuffer.toString('base64');
    }
  } catch (e) {
    logger.warn('[QRIS] Logo file not found, falling back to text');
  }
  const dueDate = inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
  const amountFmt = Math.round(amount).toLocaleString('id-ID');

  logger.info(`[QRIS] Generated branded page for ${inv.invoice_number}`);

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pembayaran ${inv.invoice_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#1e293b;border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4),0 0 80px rgba(59,130,246,.1)}
.header{text-align:center;margin-bottom:20px}
.logo{max-width:180px;height:auto;display:block;margin:0 auto}
.header .sub{font-size:12px;color:#94a3b8;margin-top:8px}
.qr-box{background:transparent;border:none;border-radius:16px;padding:8px;text-align:center;margin-bottom:20px}
.qr-box img{width:200px;height:200px;display:block;margin:0 auto}
.info{text-align:center;margin-bottom:20px}
.info .invoice{font-size:13px;color:#94a3b8;font-family:monospace}
.info .name{font-size:16px;font-weight:600;margin:4px 0}
.info .amount{font-size:28px;font-weight:800;color:#3b82f6;margin:8px 0;letter-spacing:-1px}
.info .due{font-size:12px;color:#f87171}
.divider{margin:20px 0;border-top:1px solid #334155}
.banks h3{font-size:14px;font-weight:600;color:#94a3b8;margin-bottom:12px;text-align:center}
.bank-row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#0f172a;border-radius:10px;margin-bottom:6px;font-size:13px}
.bank-name{font-weight:600;color:#e2e8f0;min-width:60px}
.bank-num{font-family:monospace;color:#93c5fd;letter-spacing:.5px}
.bank-holder{color:#94a3b8;font-size:11px;min-width:80px;text-align:right}
.ewallet-row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#0f172a;border-radius:10px;margin-bottom:6px;font-size:13px}
.ewallet-prov{font-weight:600;color:#e2e8f0}
.ewallet-num{font-family:monospace;color:#93c5fd;letter-spacing:.5px}
.ewallet-holder{color:#94a3b8;font-size:11px;text-align:right}
.warning{margin-top:16px;text-align:center;color:#fbbf24;font-size:12px;line-height:1.5}
.footer{text-align:center;margin-top:16px;font-size:11px;color:#475569}
</style></head><body>
<div class="card">
  <div class="header">${logoSvg ? `<img src="${logoSvg}" alt="${companyName}" class="logo">` : `<h1>${companyName}</h1>`}<div class="sub">${inv.mitra_name ? `${inv.mitra_name} — ` : ''}Scan dengan e-wallet atau mobile banking</div></div>
  <div class="qr-box"><img src="${qrDataUrl}" alt="QRIS"></div>
  <div class="info">
    <div class="invoice">${inv.invoice_number}</div>
    <div class="name">${inv.name}</div>
    <div class="amount">Rp ${amountFmt}</div>
    ${inv.due_date ? `<div class="due">Jatuh Tempo: ${dueDate}</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="banks"><h3>Transfer Bank</h3>${bankRows}</div>
  ${ewalletRows ? `<div class="divider"></div><div class="ewallets"><h3>E-Wallet</h3>${ewalletRows}</div>` : ''}
  <div class="warning">⚠️ Transfer sesuai nominal sampai digit terakhir agar diproses otomatis</div>
  <div class="footer">${companyName}</div>
</div></body></html>`;
}

module.exports = { generateForInvoice, generatePayload, getQRISDataUrl, generateBrandedPage };
