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

module.exports = { generateForInvoice, generatePayload, getQRISDataUrl };
