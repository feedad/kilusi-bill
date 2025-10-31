const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getSetting, getSettingsWithCache } = require('../config/settingsManager');
const billing = require('../config/billing');
const isolirService = require('../config/isolir-service');
const { findDeviceByTag } = require('../config/addWAN');
const { logger } = require('../config/logger');
const radiusSync = require('../config/radius-sync');

// Middleware auth admin (menggunakan yang sudah ada)
const { adminAuth } = require('./adminAuth');

// Local helpers for input validation/normalization
function normalizePhoneLocal(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0')) return '62' + p.slice(1);
  if (!p.startsWith('62')) return '62' + p;
  return p;
}

function toFiniteNumber(value, fallback = null) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// GET: Halaman management billing
router.get('/', adminAuth, async (req, res) => {
  try {
    const packages = await billing.getAllPackages();
    const customers = await billing.getAllCustomers();
    let invoices = await billing.getAllInvoices();
    
    // Get PPPoE profiles from Mikrotik
    const { getPPPoEProfiles } = require('../config/mikrotik');
    let pppoeProfiles = [];
    try {
      const profilesResult = await getPPPoEProfiles();
      if (profilesResult.success) {
        pppoeProfiles = profilesResult.data.map(profile => ({
          name: profile.name,
          rateLimit: profile['rate-limit'] || 'Unlimited',
          localAddress: profile['local-address'] || '',
          remoteAddress: profile['remote-address'] || ''
        }));
      }
    } catch (profileError) {
      logger.warn(`Could not fetch PPPoE profiles: ${profileError.message}`);
    }
    
    // Note: Dinonaktifkan auto-create invoice saat membuka halaman untuk menghindari efek samping tak terduga

    // Stats untuk dashboard
    const now = new Date();
    const queryMonth = parseInt(req.query.month || '0', 10);
    const queryYear = parseInt(req.query.year || '0', 10);
    const thisMonth = Number.isInteger(queryMonth) && queryMonth >= 1 && queryMonth <= 12 ? (queryMonth - 1) : now.getMonth();
    const thisYear = Number.isInteger(queryYear) && queryYear > 1970 ? queryYear : now.getFullYear();
    const isSelectedMonth = (iso) => {
      const d = new Date(iso);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    };

    const invoicesThisMonth = invoices.filter(i => isSelectedMonth(i.created_at));
    const paidThisMonth = invoicesThisMonth.filter(i => i.status === 'paid');
    const unpaidThisMonth = invoicesThisMonth.filter(i => i.status === 'unpaid');
    const overdueAll = invoices.filter(i => i.status === 'unpaid' && new Date(i.due_date) < now);
    const overdueThisMonth = overdueAll.filter(i => isSelectedMonth(i.created_at));

    const sumAmount = (arr) => arr.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

    // Top 5 overdue customers (by days past due desc, then amount)
    const overdueByCustomerMap = new Map();
    for (const inv of overdueAll) {
      const key = inv.customer_phone;
      const due = new Date(inv.due_date);
      const daysPast = Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
      const prev = overdueByCustomerMap.get(key) || { phone: inv.customer_phone, name: inv.customer_name || '', amount: 0, days: 0 };
      prev.amount += parseFloat(inv.amount || 0);
      prev.days = Math.max(prev.days, daysPast);
      prev.name = prev.name || inv.customer_name || '';
      overdueByCustomerMap.set(key, prev);
    }
    const topOverdue = Array.from(overdueByCustomerMap.values())
      .sort((a, b) => (b.days - a.days) || (b.amount - a.amount))
      .slice(0, 5);

    const stats = {
      totalPackages: packages.filter(p => p.status === 'active').length,
      totalCustomers: customers.length,
      totalInvoices: invoices.length,
      unpaidInvoices: invoices.filter(i => i.status === 'unpaid').length,
      totalRevenue: invoices.filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + parseFloat(i.amount), 0),
      // Recap bulan berjalan
      recap: {
        month: thisMonth + 1,
        year: thisYear,
        invoices_count: invoicesThisMonth.length,
        paid_count: paidThisMonth.length,
        unpaid_count: unpaidThisMonth.length,
        paid_amount: sumAmount(paidThisMonth),
        unpaid_amount: sumAmount(unpaidThisMonth),
        overdue_count: overdueThisMonth.length,
        overdue_amount: sumAmount(overdueThisMonth),
        top_overdue: topOverdue
      }
    };

    // Settings & default templates untuk WhatsApp
    const settingsAll = getSettingsWithCache();
    // Baca template WA dari file terpisah agar settings.json tetap ringan
    let waTemplates = {};
    try {
      const tplPath = path.join(process.cwd(), 'config', 'wa-templates.json');
      waTemplates = JSON.parse(fs.readFileSync(tplPath, 'utf8')) || {};
    } catch (e) {
      waTemplates = {};
    }
    const invoiceTemplateDefault =
      '📄 *TAGIHAN BARU*\n\n' +
      'Tagihan baru telah dibuat untuk Anda:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '📦 Paket: {{package_name}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';
    const paymentTemplateDefault =
      '✅ *PEMBAYARAN DITERIMA*\n\n' +
      'Terima kasih, pembayaran Anda telah diterima:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Dibayar: {{paid_at}}\n\n' +
      '✅ Status akun Anda sudah lunas.';
    const isolirTemplateDefault =
      '🔒 *LAYANAN DIISOLIR*\n\n' +
      'Yth. {{customer_name}},\n\n' +
      'Layanan internet Anda telah diisolir karena keterlambatan pembayaran.\n\n' +
      '📦 Paket: {{package_name}}\n' +
      '📋 Tagihan: {{invoice_number}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💳 Pembayaran dapat dilakukan ke: \n{{payment_accounts}}\n\n' +
      '📞 Info: {{footer_info}}';

    // Sisipkan template yang dibaca agar EJS tetap bekerja tanpa perubahan besar
    settingsAll.wa_invoice_template = waTemplates.wa_invoice_template || settingsAll.wa_invoice_template || '';
    settingsAll.wa_payment_template = waTemplates.wa_payment_template || settingsAll.wa_payment_template || '';
    settingsAll.wa_isolir_template = waTemplates.wa_isolir_template || settingsAll.wa_isolir_template || '';

    res.render('adminBilling', {
      packages,
      customers,
      invoices,
      stats,
      pppoeProfiles, // Add PPPoE profiles data
      page: 'billing',
      currentPage: 'billing',
      settings: settingsAll,
      success: req.query.success,
      error: req.query.error,
      invoiceTemplateDefault,
      paymentTemplateDefault,
      isolirTemplateDefault
    });
  } catch (error) {
    logger.error(`Error rendering billing page: ${error.message}`);
    res.status(500).send('Error loading billing page');
  }
});

// GET: Halaman Profile Berlangganan
router.get('/profiles', adminAuth, async (req, res) => {
  try {
    const packages = await billing.getAllPackages();
    const error = req.query.error;
    const success = req.query.success;
    
    res.render('admin-profiles', {
      packages,
      error,
      success,
      page: 'profiles',
      title: 'Profile Berlangganan'
    });
  } catch (error) {
    logger.error('Error loading profiles page:', error);
    res.status(500).send('Error loading profiles page');
  }
});

// MESSAGES: Kirim tagihan manual ke banyak pelanggan (batch)
router.post('/messages/send-invoice-batch', adminAuth, async (req, res) => {
  try {
    let { phones } = req.body; // bisa array atau CSV string
    if (!phones || (Array.isArray(phones) && phones.length === 0)) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pilih minimal 1 pelanggan'));
    }

    // Normalisasi daftar nomor
    if (typeof phones === 'string') {
      phones = phones.split(',').map(s => s.trim()).filter(Boolean);
    }
    const normalize = (p) => normalizePhoneLocal(p);

    const uniquePhones = Array.from(new Set(phones.map(normalize)));

    // Load template
    const invoiceTemplateDefault =
      '📄 *TAGIHAN BARU*\n\n' +
      'Tagihan baru telah dibuat untuk Anda:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '📦 Paket: {{package_name}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';
    const tpl = (getSetting && getSetting('wa_invoice_template')) || invoiceTemplateDefault;
    const formatCurrency = (amount) => `Rp ${parseFloat(amount).toLocaleString('id-ID')}`;
    const renderTemplate = (t, data) => t.replace(/{{\s*([\w_]+)\s*}}/g, (m, k) => (data[k] ?? ''));

    const { sendMessage } = require('../config/sendMessage');

    let sent = 0;
    let failed = 0;
    const sendDelayMs = parseInt(getSetting('wa_send_delay_ms', '1200'));
    for (const p of uniquePhones) {
      try {
        const customer = billing.getCustomerByPhone(p);
        if (!customer) { failed++; continue; }
        const invs = billing.getInvoicesByPhone(p) || [];
        if (!invs.length) { failed++; continue; }
        const unpaid = invs.filter(i => i.status === 'unpaid');
        const latest = (arr) => arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const invoice = unpaid.length > 0 ? latest(unpaid) : latest(invs);
        if (!invoice) { failed++; continue; }

        const message = renderTemplate(tpl, {
          invoice_number: invoice.invoice_number,
          package_name: invoice.package_name,
          amount: formatCurrency(invoice.amount),
          due_date: new Date(invoice.due_date).toLocaleDateString('id-ID'),
          customer_name: customer.name || p,
          customer_phone: p
        });
        const ok = await sendMessage(p, message);
        if (ok) sent++; else failed++;
        if (sendDelayMs > 0) {
          await new Promise(r => setTimeout(r, sendDelayMs));
        }
      } catch (e) {
        failed++;
      }
    }

    if (sent > 0) {
      return res.redirect('/admin/billing?success=' + encodeURIComponent(`Kirim tagihan batch: ${sent} berhasil, ${failed} gagal`));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent(`Gagal kirim batch: semua gagal (${failed})`));
  } catch (error) {
    logger.error(`Error sending manual invoice batch: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim tagihan batch: ' + error.message));
  }
});

// MESSAGES: Kirim tagihan manual ke 1 pelanggan
router.post('/messages/send-invoice', adminAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP wajib diisi'));
    }

    // Normalisasi nomor ke format 62xxxxxxxxxxx (untuk konsistensi billing dan WhatsApp)
    let cleanPhone = normalizePhoneLocal(phone);

    const customer = billing.getCustomerByPhone(cleanPhone);
    if (!customer) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pelanggan tidak ditemukan di sistem billing'));
    }

    // Ambil tagihan: prioritas tagihan belum lunas terbaru, jika tidak ada gunakan tagihan terbaru
    const invs = billing.getInvoicesByPhone(cleanPhone) || [];
    if (!invs || invs.length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pelanggan belum memiliki tagihan'));
    }
    const unpaid = invs.filter(i => i.status === 'unpaid');
    const latest = (arr) => arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const invoice = unpaid.length > 0 ? latest(unpaid) : latest(invs);

    // Helper: format mata uang
    const formatCurrency = (amount) => `Rp ${parseFloat(amount).toLocaleString('id-ID')}`;
    // Helper: render template {{key}}
    const renderTemplate = (tpl, data) => {
      if (!tpl || typeof tpl !== 'string') return '';
      return tpl.replace(/{{\s*([\w_]+)\s*}}/g, (m, key) => {
        const val = data[key];
        return (val === undefined || val === null) ? '' : String(val);
      });
    };

    // Ambil template dari settings, fallback ke default
    const invoiceTemplateDefault =
      '📄 *TAGIHAN BARU*\n\n' +
      'Tagihan baru telah dibuat untuk Anda:\n\n' +
      '📋 No. Tagihan: {{invoice_number}}\n' +
      '📦 Paket: {{package_name}}\n' +
      '💰 Jumlah: {{amount}}\n' +
      '📅 Jatuh Tempo: {{due_date}}\n\n' +
      '💡 Silakan lakukan pembayaran sebelum jatuh tempo.';

    const tpl = (getSetting && getSetting('wa_invoice_template')) || invoiceTemplateDefault;
    const message = renderTemplate(tpl, {
      invoice_number: invoice.invoice_number,
      package_name: invoice.package_name,
      amount: formatCurrency(invoice.amount),
      due_date: new Date(invoice.due_date).toLocaleDateString('id-ID'),
      customer_name: customer.name || cleanPhone,
      customer_phone: cleanPhone
    });

    // Kirim melalui WhatsApp
    const { sendMessage } = require('../config/sendMessage');
    const ok = await sendMessage(cleanPhone, message);
    if (ok) {
      return res.redirect('/admin/billing?success=' + encodeURIComponent(`Tagihan ${invoice.invoice_number} dikirim ke ${cleanPhone}`));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim pesan WhatsApp. Periksa koneksi WhatsApp.'));
  } catch (error) {
    logger.error(`Error sending manual invoice: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim tagihan: ' + error.message));
  }
});

// MESSAGES: Broadcast gangguan ke pelanggan
router.post('/messages/broadcast-outage', adminAuth, async (req, res) => {
  try {
    const { message_text, target, package_ids, phones } = req.body;
    if (!message_text || message_text.trim().length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Pesan tidak boleh kosong'));
    }

    let targets = [];
    const customers = await billing.getAllCustomers();

    if (target === 'all') {
      targets = customers.map(c => c.phone).filter(Boolean);
    } else if (target === 'active') {
      targets = customers.filter(c => c.status !== 'inactive').map(c => c.phone).filter(Boolean);
    } else if (target === 'package') {
      const ids = Array.isArray(package_ids) ? package_ids : (package_ids ? [package_ids] : []);
      targets = customers.filter(c => ids.includes(c.package_id)).map(c => c.phone).filter(Boolean);
    } else if (target === 'list') {
      const list = (phones || '').split(',').map(s => s.trim()).filter(Boolean);
      targets = list;
    }

    // Unique & valid
    targets = Array.from(new Set(targets)).filter(v => !!v);
    if (targets.length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Tidak ada nomor tujuan yang valid'));
    }

    const { sendGroupMessage } = require('../config/sendMessage');
    const result = await sendGroupMessage(targets, message_text);
    const sent = result?.sent || 0;
    const failed = result?.failed || 0;
    const ok = result?.success;

    if (ok) {
      return res.redirect('/admin/billing?success=' + encodeURIComponent(`Broadcast dikirim: ${sent} berhasil, ${failed} gagal`));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent(`Broadcast gagal: ${failed} gagal, ${sent} berhasil`));
  } catch (error) {
    logger.error(`Error broadcasting outage: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal mengirim broadcast: ' + error.message));
  }
});

// PACKAGE MANAGEMENT
router.post('/packages/create', adminAuth, async (req, res) => {
  try {
    const { name, speed, price, description, pppoe_profile, group, rate_limit, shared, hpp, commission } = req.body;
    
    if (!name || !speed || !price) {
      return res.redirect('/admin/packages?error=' + encodeURIComponent('Nama, kecepatan, dan harga paket wajib diisi'));
    }
    
    const newPackage = await billing.createPackage({
      name,
      speed,
      price: toFiniteNumber(price, 0),
      description,
      pppoe_profile,
      group: group || null,
      rate_limit: rate_limit || null,
      shared: shared || 0,
      hpp: toFiniteNumber(hpp, 0),
      commission: toFiniteNumber(commission, 0)
    });
    
    if (newPackage) {
      // Auto generate group jika tidak diisi
      if (!group) {
        const autoGroup = `package_${newPackage.id}`;
        await billing.updatePackage(newPackage.id, {
          ...newPackage,
          group: autoGroup
        });
        newPackage.group = autoGroup;
      }
      
      // Auto sync package ke RADIUS
      try {
        await radiusSync.syncPackageToRadius(newPackage);
        logger.info(`✅ Package synced to RADIUS: ${newPackage.name}`);
      } catch (syncError) {
        logger.warn(`⚠️  Failed to sync package to RADIUS: ${syncError.message}`);
      }
      
      res.redirect('/admin/packages?success=' + encodeURIComponent('Paket berhasil dibuat'));
    } else {
      res.redirect('/admin/packages?error=' + encodeURIComponent('Gagal membuat paket'));
    }
  } catch (error) {
    logger.error(`Error creating package: ${error.message}`);
    res.redirect('/admin/packages?error=' + encodeURIComponent('Terjadi kesalahan saat membuat paket'));
  }
});

router.post('/packages/update', adminAuth, async (req, res) => {
  try {
    const { id, name, speed, price, description, pppoe_profile, group, rate_limit, shared, hpp, commission, is_active } = req.body;
    
    const updatedPackage = await billing.updatePackage(id, {
      name,
      speed,
      price: toFiniteNumber(price, 0),
      description,
      pppoe_profile,
      group,
      rate_limit: rate_limit || null,
      shared: shared || 0,
      hpp: toFiniteNumber(hpp, 0),
      commission: toFiniteNumber(commission, 0),
      is_active: is_active == 1
    });
    
    if (updatedPackage) {
      // Auto sync package ke RADIUS
      try {
        await radiusSync.syncPackageToRadius(updatedPackage);
        logger.info(`✅ Package updated and synced to RADIUS: ${updatedPackage.name}`);
      } catch (syncError) {
        logger.warn(`⚠️  Failed to sync package to RADIUS: ${syncError.message}`);
      }
      
      res.redirect('/admin/packages?success=' + encodeURIComponent('Paket berhasil diperbarui'));
    } else {
      res.redirect('/admin/packages?error=' + encodeURIComponent('Gagal memperbarui paket'));
    }
  } catch (error) {
    logger.error(`Error updating package: ${error.message}`);
    res.redirect('/admin/packages?error=' + encodeURIComponent('Terjadi kesalahan saat memperbarui paket'));
  }
});

router.post('/packages/delete/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Auto remove package dari RADIUS sebelum delete
    try {
      await radiusSync.removePackageFromRadius(id);
      logger.info(`✅ Package removed from RADIUS: ID ${id}`);
    } catch (syncError) {
      logger.warn(`⚠️  Failed to remove package from RADIUS: ${syncError.message}`);
    }
    
    if (await billing.deletePackage(id)) {
      res.redirect('/admin/packages?success=' + encodeURIComponent('Paket berhasil dihapus'));
    } else {
      res.redirect('/admin/packages?error=' + encodeURIComponent('Gagal menghapus paket'));
    }
  } catch (error) {
    logger.error(`Error deleting package: ${error.message}`);
    res.redirect('/admin/packages?error=' + encodeURIComponent('Terjadi kesalahan saat menghapus paket'));
  }
});

// AUTO-SYNC customers dari GenieACS
router.post('/customers/sync-genieacs', adminAuth, async (req, res) => {
  try {
    console.log('🔄 Starting GenieACS customer sync...');
    
    // Import function untuk ambil semua devices dari GenieACS
    const { findDeviceByTag } = require('../config/addWAN');
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    const axios = require('axios');
    
    // Ambil semua devices dari GenieACS
    const genieacsUrl = settings.genieacs_url || 'http://localhost:7557';
    const response = await axios.get(`${genieacsUrl}/devices/`, {
      auth: { 
        username: settings.genieacs_username || 'admin', 
        password: settings.genieacs_password || 'admin' 
      },
      headers: { 'Accept': 'application/json' }
    });
    
    let syncedCount = 0;
    let errorCount = 0;
    const syncErrors = [];
    
    if (response.data && response.data.length > 0) {
      for (const device of response.data) {
        try {
          // Cari tag yang berupa nomor HP (format: phone: atau langsung nomor)
          let customerPhone = null;
          let customerName = null;
          
          if (Array.isArray(device._tags)) {
            device._tags.forEach(tag => {
              // Format phone:081234567890
              if (tag.startsWith('phone:')) {
                customerPhone = tag.replace('phone:', '').trim();
              }
              // Format customer:Nama Customer
              else if (tag.startsWith('customer:')) {
                customerName = tag.replace('customer:', '').trim();
              }
              // Langsung nomor HP (8-15 digit)
              else if (/^0?8[0-9]{8,13}$/.test(tag.trim())) {
                customerPhone = tag.trim();
              }
            });
          }
          
          // Jika ada nomor HP, sync ke billing system
          if (customerPhone) {
            // Normalisasi nomor HP (tambah 62 jika dimulai dengan 0)
            if (customerPhone.startsWith('0')) {
              customerPhone = '62' + customerPhone.substring(1);
            }
            
            // Cek apakah customer sudah ada di billing
            let existingCustomer = await billing.getCustomerByPhone(customerPhone);
            
            if (!existingCustomer) {
              // Buat customer baru - ensure required fields
              const newCustomer = {
                phone: customerPhone,
                name: customerName || `Customer ${customerPhone}`, // Required: default if empty
                username: customerPhone, // Required: use phone as username
                device_id: device._id,
                serial_number: device.DeviceID?.SerialNumber || device._id,
                status: 'active',
                synced_from_genieacs: true
              };
              
              const result = await billing.createCustomer(newCustomer);
              if (result) {
                syncedCount++;
                console.log(`✅ Synced customer: ${customerPhone} (${customerName || 'No name'})`);
              }
            } else {
              // Update device info jika sudah ada
              await billing.updateCustomer(existingCustomer.id, {
                device_id: device._id,
                serial_number: device.DeviceID?.SerialNumber || device._id,
                synced_from_genieacs: true
              });
              console.log(`🔄 Updated device info for: ${customerPhone}`);
            }
          }
        } catch (deviceError) {
          errorCount++;
          syncErrors.push(`Device ${device._id}: ${deviceError.message}`);
          console.error(`❌ Error syncing device ${device._id}:`, deviceError.message);
        }
      }
    }
    
    const message = `Sync berhasil! ${syncedCount} customer di-sync dari GenieACS` + 
                   (errorCount > 0 ? ` (${errorCount} error)` : '');
    
    console.log(`🎉 Sync completed: ${syncedCount} customers synced, ${errorCount} errors`);
    res.redirect('/admin/customers?success=' + encodeURIComponent(message));
    
  } catch (error) {
    logger.error(`Error syncing customers from GenieACS: ${error.message}`);
    res.redirect('/admin/customers?error=' + encodeURIComponent('Gagal sync customer dari GenieACS: ' + error.message));
  }
});

// CUSTOMER MANAGEMENT
router.post('/customers/update', adminAuth, async (req, res) => {
  try {
    const { phone, name, username, package_id, payment_status, pppoe_username, pppoe_password, connection_type, static_ip, enable_isolir, isolir_date, area, address, install_date, router_id } = req.body;
    
    if (!phone) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('Nomor HP wajib diisi'));
  }
    
    // Get current customer data
    const normalizedPhone = normalizePhoneLocal(phone);
    let customer = await billing.getCustomerByPhone(normalizedPhone);
    
    let customerData = {};
    
    if (!customer) {
      // Create new customer if doesn't exist - ensure required fields are set
      customerData = {
        phone: normalizedPhone,
        name: name || `Customer ${normalizedPhone}`, // Required field, use default if empty
        username: username || normalizedPhone, // Required field, use phone as default
        status: 'active'
      };
    } else {
      // Update existing customer - prepare update data
      customerData = {
        name: name || customer.name,
        username: username || customer.username,
        pppoe_username: pppoe_username || customer.pppoe_username,
        pppoe_password: pppoe_password || customer.pppoe_password || '1234567'
      };
    }

    // Address/Area and install date
    if (typeof address !== 'undefined') customerData.address = address;
    if (typeof area !== 'undefined') customerData.area = area;
    if (install_date) {
      const d = new Date(install_date);
      if (!isNaN(d.getTime())) customerData.install_date = d.toISOString();
    }

    // Optional connectivity fields
    if (connection_type === 'static') {
      customerData.connection_type = 'static';
      customerData.static_ip = static_ip || (customer ? customer.static_ip : null);
    } else if (connection_type === 'pppoe') {
      customerData.connection_type = 'pppoe';
      // Auto-generate PPPoE username if not supplied
      if (!pppoe_username || pppoe_username.trim() === '') {
        const d = customerData.install_date ? new Date(customerData.install_date) : new Date();
        const y = d.getFullYear().toString();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        
        if (customer && customer.id) {
          const code = customer.id.toString().padStart(5, '0');
          const suffix = getSetting('pppoe_username_suffix', '');
          customerData.pppoe_username = `${y}${m}${day}${code}${suffix}`;
        }
      }
    }
    
    customerData.enable_isolir = enable_isolir === 'true' || enable_isolir === true;
    if (typeof router_id !== 'undefined') customerData.router_id = router_id || null;
    
    if (isolir_date) {
      const d = new Date(isolir_date);
      if (!isNaN(d.getTime())) customerData.isolir_scheduled_date = d.toISOString();
    }
    
    // If package is changed, update package info
    if (package_id) {
      const pkg = await billing.getPackageById(package_id);
      if (pkg) {
        customerData.package_id = package_id;
        customerData.package_name = pkg.name;
        customerData.package_price = pkg.price;
        customerData.package_speed = pkg.speed;
      }
    }
    
    // Create or update customer
    let updatedCustomer;
    if (!customer) {
      updatedCustomer = await billing.createCustomer(customerData);
      
      // If PPPoE username was not set and we now have customer ID, generate it
      if (customerData.connection_type === 'pppoe' && !customerData.pppoe_username && updatedCustomer) {
        const d = customerData.install_date ? new Date(customerData.install_date) : new Date();
        const y = d.getFullYear().toString();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const code = updatedCustomer.id.toString().padStart(5, '0');
        const suffix = getSetting('pppoe_username_suffix', '');
        const generatedUsername = `${y}${m}${day}${code}${suffix}`;
        
        updatedCustomer = await billing.updateCustomer(updatedCustomer.id, {
          pppoe_username: generatedUsername
        });
      }
    } else {
      updatedCustomer = await billing.updateCustomer(customer.id, customerData);
    }
    
    if (updatedCustomer) {
      // Trigger sync ke RADIUS bila ada kredensial PPPoE
      try {
        if (updatedCustomer.pppoe_username && updatedCustomer.pppoe_password) {
          await radiusSync.syncCustomerToRadius(updatedCustomer);
        }
      } catch (e) {
        logger.warn(`RADIUS sync (update) warning: ${e.message}`);
      }
      res.redirect('/admin/customers?success=' + encodeURIComponent('Data customer berhasil diperbarui'));
    } else {
      res.redirect('/admin/customers?error=' + encodeURIComponent('Gagal memperbarui data customer'));
    }
  } catch (error) {
    logger.error(`Error updating customer: ${error.message}`);
    res.redirect('/admin/customers?error=' + encodeURIComponent('Terjadi kesalahan saat memperbarui customer'));
  }
});

router.post('/customers/assign-package', adminAuth, async (req, res) => {
  try {
    const { phone, package_id, name, enable_isolir, pppoe_username, pppoe_password, static_ip, connection_type, area, address, install_date, router_id } = req.body;
    
    // Validasi berdasarkan tipe koneksi
    if (!phone || !package_id) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('Nomor HP dan paket wajib diisi'));
    }
    
    if (connection_type === 'static' && !static_ip) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('IP Statik wajib diisi untuk tipe koneksi statik'));
    }
    
    const normalizedPhone = normalizePhoneLocal(phone);
    
    // Get package info
    const pkg = await billing.getPackageById(package_id);
    if (!pkg) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('Paket tidak ditemukan'));
    }
    
    // Check if customer exists
    let customer = await billing.getCustomerByPhone(normalizedPhone);
    
    // Generate username if not provided (use phone as default)
    const username = customer ? customer.username : normalizedPhone;
    
    // Ensure name is not empty (required field)
    const customerName = name || (customer ? customer.name : `Customer ${normalizedPhone}`);
    
    // Prepare customer data
    const customerData = {
      phone: normalizedPhone,
      username: username,
      name: customerName,
      package_id: package_id,
      package_name: pkg.name,
      package_price: pkg.price,
      package_speed: pkg.speed,
      pppoe_username: pppoe_username || (customer ? customer.pppoe_username : ''),
      pppoe_password: pppoe_password || '1234567',
      static_ip: static_ip || null,
      connection_type: connection_type || 'pppoe',
      enable_isolir: enable_isolir === 'true',
      area: area || (customer ? customer.area : ''),
      address: address || (customer ? customer.address : ''),
      router_id: router_id || null,
      status: 'active'
    };
    
    // Handle install_date
    if (install_date) {
      const d = new Date(install_date);
      if (!isNaN(d.getTime())) {
        customerData.install_date = d.toISOString();
      }
    }
    
    // Auto-generate PPPoE username if not provided and connection is PPPoE
    if (customerData.connection_type === 'pppoe' && !customerData.pppoe_username) {
      const d = customerData.install_date ? new Date(customerData.install_date) : new Date();
      const y = d.getFullYear().toString();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      
      if (customer && customer.id) {
        // Existing customer - use their ID
        const code = customer.id.toString().padStart(5, '0');
        const suffix = getSetting('pppoe_username_suffix', '');
        customerData.pppoe_username = `${y}${m}${day}${code}${suffix}`;
      } else {
        // New customer - generate temporary, will update after creation
        const tempCode = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
        const suffix = getSetting('pppoe_username_suffix', '');
        customerData.pppoe_username = `${y}${m}${day}${tempCode}${suffix}`;
      }
    }
    
    // Create or update customer
    let savedCustomer;
    if (customer) {
      // Update existing customer
      savedCustomer = await billing.updateCustomer(customer.id, customerData);
    } else {
      // Create new customer
      savedCustomer = await billing.createCustomer(customerData);
      
      // If PPPoE username was temporary, update with real customer ID
      if (savedCustomer && customerData.connection_type === 'pppoe' && !pppoe_username) {
        const d = customerData.install_date ? new Date(customerData.install_date) : new Date();
        const y = d.getFullYear().toString();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        const code = savedCustomer.id.toString().padStart(5, '0');
        const suffix = getSetting('pppoe_username_suffix', '');
        const realUsername = `${y}${m}${day}${code}${suffix}`;
        
        savedCustomer = await billing.updateCustomer(savedCustomer.id, {
          pppoe_username: realUsername
        });
      }
    }
    
    if (!savedCustomer) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('Gagal menyimpan customer'));
    }
    
    // Sync to RADIUS if PPPoE credentials exist
    try {
      if (savedCustomer.pppoe_username && savedCustomer.pppoe_password) {
        await radiusSync.syncCustomerToRadius(savedCustomer);
      }
    } catch (e) {
      logger.warn(`RADIUS sync (assign) warning: ${e.message}`);
    }
    
    // Create invoice for the customer
    try {
      const invoiceData = {
        customer_id: savedCustomer.id,
        customer_phone: savedCustomer.phone,
        customer_name: savedCustomer.name,
        package_id: pkg.id,
        package_name: pkg.name,
        amount: pkg.price,
        tax_amount: (pkg.price * (pkg.tax_rate || 0)) / 100,
        total_amount: pkg.price + ((pkg.price * (pkg.tax_rate || 0)) / 100),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        status: 'unpaid',
        billing_period_start: new Date().toISOString(),
        billing_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      
      await billing.createInvoice(invoiceData);
    } catch (invoiceError) {
      logger.warn(`Failed to create invoice: ${invoiceError.message}`);
    }
    
    res.redirect('/admin/customers?success=' + encodeURIComponent('Customer berhasil ditambahkan dan paket di-assign'));
  } catch (error) {
    logger.error(`Error assigning package: ${error.message}`);
    res.redirect('/admin/customers?error=' + encodeURIComponent('Terjadi kesalahan: ' + error.message));
  }
});

// INVOICE MANAGEMENT
router.post('/invoices/create', adminAuth, async (req, res) => {
  try {
    const { customer_phone, package_id, amount } = req.body;
    
    if (!customer_phone || !package_id) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Nomor HP dan paket wajib diisi'));
    }
    
    const normalizedPhone = normalizePhoneLocal(customer_phone);
    const safeAmount = toFiniteNumber(amount, undefined);
    const invoice = billing.createInvoice(normalizedPhone, package_id, safeAmount);
    
    if (invoice) {
      res.redirect('/admin/billing?success=' + encodeURIComponent('Tagihan berhasil dibuat'));
    } else {
      res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal membuat tagihan'));
    }
  } catch (error) {
    logger.error(`Error creating invoice: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat membuat tagihan'));
  }
});

router.post('/invoices/mark-paid/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, bank_name, payment_notes } = req.body;
    
    // Validate payment method
    if (!payment_method) {
      return res.redirect('/admin/invoices/unpaid?error=' + encodeURIComponent('Metode pembayaran wajib dipilih'));
    }
    
    const invoice = billing.markInvoiceAsPaid(id, {
      payment_method,
      bank_name,
      payment_notes,
      paid_at: new Date().toISOString()
    });
    
    if (invoice) {
      // Auto unisolir setelah pembayaran
      // Catatan: billing.markInvoiceAsPaid sudah akan melakukan reset isolir dan memanggil unisolir
      // jika SEMUA tagihan pelanggan sudah lunas. Untuk menghindari pemanggilan ganda, kita tidak
      // memanggil isolirService di sini lagi.
      
      // Optional: kirim WA pembayaran diterima ke pelanggan
      try {
        const customer = billing.getCustomerByPhone(invoice.customer_phone);
        const formatCurrency = (amount) => `Rp ${parseFloat(amount).toLocaleString('id-ID')}`;
        
        // Payment method labels
        const paymentMethodLabels = {
          'cash': 'Tunai',
          'bank_transfer': `Transfer Bank ${bank_name || ''}`.trim(),
          'ewallet': 'E-Wallet',
          'qris': 'QRIS',
          'tripay': 'Payment Gateway',
          'other': 'Lainnya'
        };
        
        // Ambil template dari settings, fallback default
        const paymentTemplateDefault =
          '✅ *PEMBAYARAN DITERIMA*\n\n' +
          'Terima kasih, pembayaran Anda telah diterima:\n\n' +
          '📋 No. Tagihan: {{invoice_number}}\n' +
          '💰 Jumlah: {{amount}}\n' +
          '💳 Metode: {{payment_method}}\n' +
          '📅 Dibayar: {{paid_at}}\n\n' +
          '✅ Status akun Anda sudah lunas.';
        const tpl = (getSetting && getSetting('wa_payment_template')) || paymentTemplateDefault;
        const render = (t, data) => t.replace(/{{\s*([\w_]+)\s*}}/g, (m, k) => (data[k] ?? ''));
        const msg = render(tpl, {
          invoice_number: invoice.invoice_number,
          amount: formatCurrency(invoice.amount),
          payment_method: paymentMethodLabels[payment_method] || payment_method,
          paid_at: new Date(invoice.paid_at || Date.now()).toLocaleString('id-ID'),
          customer_name: customer?.name || invoice.customer_name || invoice.customer_phone
        });
        const { sendMessage } = require('../config/sendMessage');
        if (customer?.phone) {
          await sendMessage(customer.phone, msg);
        }
      } catch (e) {
        logger.warn(`Payment WA notify failed for invoice ${id}: ${e.message}`);
      }
      res.redirect('/admin/invoices/unpaid?success=' + encodeURIComponent('Tagihan berhasil ditandai lunas'));
    } else {
      res.redirect('/admin/invoices/unpaid?error=' + encodeURIComponent('Gagal menandai tagihan lunas'));
    }
  } catch (error) {
    logger.error(`Error marking invoice as paid: ${error.message}`);
    res.redirect('/admin/invoices/unpaid?error=' + encodeURIComponent('Terjadi kesalahan saat menandai tagihan lunas'));
  }
});

// MANUAL UNISOLIR tanpa pelunasan
router.post('/customers/unisolir', adminAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.redirect('/admin/invoices/unpaid?error=' + encodeURIComponent('Nomor HP wajib diisi'));
    }

    const normalizedPhone = normalizePhoneLocal(phone);
    const result = await isolirService.unisolirCustomer(normalizedPhone);
    if (result && result.success) {
      // Set status isolir normal di billing
      billing.updateCustomerIsolirStatus(normalizedPhone, 'normal');
      return res.redirect('/admin/billing?success=' + encodeURIComponent('Pelanggan berhasil di-unisolir (tanpa pelunasan)'));
    }
    return res.redirect('/admin/billing?error=' + encodeURIComponent(result?.message || 'Gagal unisolir pelanggan'));
  } catch (error) {
    logger.error(`Error manual unisolir: ${error.message}`);
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Terjadi kesalahan saat unisolir'));
  }
});

// API ENDPOINTS for AJAX
router.get('/api/packages', adminAuth, (req, res) => {
  try {
    const packages = billing.getActivePackages();
    res.json({ success: true, packages });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

router.get('/api/customers', adminAuth, async (req, res) => {
  try {
    // If DataTables server-side params exist, return paginated; else return full list (backward compatible)
    const drawRaw = req.query.draw;
    const isDt = typeof drawRaw !== 'undefined';
    const all = await billing.getAllCustomers();
    console.log('[API /api/customers] Retrieved customers:', all.length, 'records');

    // Prepare online status map (PPPoE active users)
    let activeSet = new Set();
    try {
      const mikrotik = require('../config/mikrotik');
      if (mikrotik && typeof mikrotik.getActivePPPoEConnections === 'function') {
        const result = await mikrotik.getActivePPPoEConnections();
        if (result && result.success && Array.isArray(result.data)) {
          activeSet = new Set(result.data.map(x => String(x.name || '').toLowerCase()));
        }
      }
    } catch {}

    if (!isDt) {
      // For non-DataTables path, enrich with connection_status quickly (best-effort)
      const enriched = all.map(c => ({
        ...c,
        connection_status: (c.isolir_status === 'isolated') ? 'suspended' : ((c.pppoe_username && activeSet.has(String(c.pppoe_username).toLowerCase())) ? 'online' : 'offline')
      }));
      return res.json({ success: true, customers: enriched });
    }

    const draw = parseInt(drawRaw || '1', 10);
    const start = parseInt(req.query.start || '0', 10);
    const length = parseInt(req.query.length || '10', 10);
    const searchValue = (req.query.search && req.query.search.value) ? String(req.query.search.value).toLowerCase() : '';

    const order = req.query.order && req.query.order[0] ? req.query.order[0] : null;
  // Kolom mapping untuk DataTables (harus sesuai urutan di front-end, abaikan kolom non-sortable)
  // Index 0 (checkbox) diabaikan pada sort, Index 1 (connection_status), sisanya mengikuti urutan:
  // 2: customer_id, 3: name, 4: address, 5: phone, 6: package_name, 7: package_price,
  // 8: pppoe_username, 9: pppoe_password, 10: payment_status, 11: isolir_scheduled_date,
  // 12: area, 13: username, 14: enable_isolir, 15: actions (non-sortable)
  const columns = ['connection_status','id','name','address','phone','package_name','package_price','pppoe_username','pppoe_password','payment_status','isolir_scheduled_date','area','username','enable_isolir','created_at'];
    let orderCol = 'id'; // Default sort by id
    let orderDir = 'desc';
    if (order) {
  // Adjust because DataTables includes the checkbox column at index 0
  let idx = parseInt(order.column || '0', 10);
  // Shift index by -1 to align with our columns mapping (checkbox not in columns array)
  idx = idx - 1;
  if (Number.isInteger(idx) && idx >= 0 && columns[idx]) orderCol = columns[idx];
      if ((order.dir || '').toLowerCase() === 'asc') orderDir = 'asc';
    }

    let filtered = all;
    if (searchValue) {
      filtered = all.filter(c => {
        const hay = [
          c.phone,
          c.name,
          c.username,
          c.pppoe_username,
          c.pppoe_password,
          c.package_name,
          String(c.package_price),
          c.payment_status,
          c.status
        ].map(v => (v || '').toString().toLowerCase()).join(' ');
        return hay.includes(searchValue);
      });
    }

    filtered.sort((a, b) => {
      const av = a[orderCol];
      const bv = b[orderCol];
      if (orderCol.endsWith('_at')) {
        const ad = new Date(av || 0).getTime();
        const bd = new Date(bv || 0).getTime();
        return orderDir === 'asc' ? ad - bd : bd - ad;
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return orderDir === 'asc' ? av - bv : bv - av;
      }
      const as = (av || '').toString().toLowerCase();
      const bs = (bv || '').toString().toLowerCase();
      if (as < bs) return orderDir === 'asc' ? -1 : 1;
      if (as > bs) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });

    const recordsTotal = all.length;
    const recordsFiltered = filtered.length;
    const page = filtered.slice(start, start + length);

    const data = page.map(c => {
      if (!c) {
        logger.warn('Null customer found in data array');
        return null;
      }
      return {
        phone: c.phone || '',
        customer_id: c.id || c.customer_id || '', // Fallback to customer_id if id doesn't exist
        name: c.name || '-',
        area: c.area || '',
        username: c.username || '-',
        pppoe_username: c.pppoe_username || '',
        pppoe_password: c.pppoe_password || '1234567',
        package_name: c.package_name || 'Belum ada paket',
        package_price: c.package_price || 0,
        package_id: c.package_id || '',
        address: c.address || '',
        install_date: c.install_date || '',
        payment_status: 'unpaid', // Default: payment_status not in customers table, should come from invoices
        status: c.status || 'active',
        isolir_status: c.isolir_status || 'normal',
        connection_status: (c.isolir_status === 'isolated') ? 'suspended' : ((c.pppoe_username && activeSet.has(String(c.pppoe_username).toLowerCase())) ? 'online' : 'offline'),
        created_at: c.created_at,
        enable_isolir: c.enable_isolir === true,
        isolir_scheduled_date: c.isolir_scheduled_date || ''
      };
    }).filter(item => item !== null); // Remove any null entries

    console.log('[API /api/customers] Sending response:', { draw, recordsTotal, recordsFiltered, dataCount: data.length });
    res.json({ draw, recordsTotal, recordsFiltered, data });
  } catch (error) {
    logger.error(`Error fetching customers (DT): ${error.message}`);
    res.json({ draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [] });
  }
});

// API: Get online users count by profile (for profiles page)
router.get('/api/online-users-by-profile', adminAuth, async (req, res) => {
  try {
    const radiusDb = require('../config/radius-postgres');
    const onlineUsers = await radiusDb.getOnlineUsersByGroup();
    
    res.json({
      success: true,
      onlineUsers
    });
  } catch (error) {
    logger.error('Error getting online users by profile:', error);
    res.json({
      success: false,
      error: error.message,
      onlineUsers: {}
    });
  }
});

// DataTables server-side: invoices
router.get('/api/invoices', adminAuth, async (req, res) => {
  try {
    const all = await billing.getAllInvoices();

    const draw = parseInt(req.query.draw || '1', 10);
    const start = parseInt(req.query.start || '0', 10);
    const length = parseInt(req.query.length || '10', 10);
    const searchValue = (req.query.search && req.query.search.value) ? String(req.query.search.value).toLowerCase() : '';

    // Sorting
    const order = req.query.order && req.query.order[0] ? req.query.order[0] : null;
    const columns = ['invoice_number','customer_name','customer_phone','package_name','amount','due_date','status','created_at'];
    let orderCol = 'created_at';
    let orderDir = 'desc';
    if (order) {
      const idx = parseInt(order.column || '0', 10);
      if (Number.isInteger(idx) && columns[idx]) orderCol = columns[idx];
      if ((order.dir || '').toLowerCase() === 'asc') orderDir = 'asc';
    }

    // Filter
    let filtered = all;
    if (searchValue) {
      filtered = all.filter(inv => {
        const hay = [
          inv.invoice_number,
          inv.customer_name,
          inv.customer_phone,
          inv.package_name,
          String(inv.amount)
        ].map(v => (v || '').toString().toLowerCase()).join(' ');
        return hay.includes(searchValue);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      const av = a[orderCol];
      const bv = b[orderCol];
      if (orderCol.endsWith('_at') || orderCol.includes('date')) {
        const ad = new Date(av || 0).getTime();
        const bd = new Date(bv || 0).getTime();
        return orderDir === 'asc' ? ad - bd : bd - ad;
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return orderDir === 'asc' ? av - bv : bv - av;
      }
      const as = (av || '').toString().toLowerCase();
      const bs = (bv || '').toString().toLowerCase();
      if (as < bs) return orderDir === 'asc' ? -1 : 1;
      if (as > bs) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });

    const recordsTotal = all.length;
    const recordsFiltered = filtered.length;
    const page = filtered.slice(start, start + length);

    // Map to row objects aligned with table columns
    const data = page.map(inv => ({
      invoice_number: inv.invoice_number,
      customer_name: inv.customer_name || '-',
      customer_phone: inv.customer_phone,
      package_name: inv.package_name,
      amount: inv.amount,
      due_date: inv.due_date,
      status: inv.status,
      id: inv.id,
      created_at: inv.created_at
    }));

    res.json({ draw, recordsTotal, recordsFiltered, data });
  } catch (error) {
    logger.error(`Error fetching invoices (DT): ${error.message}`);
    res.json({ draw: 1, recordsTotal: 0, recordsFiltered: 0, data: [] });
  }
});

// API: Get invoice statistics
router.get('/api/invoices-stats', adminAuth, async (req, res) => {
  try {
    const status = req.query.status || 'unpaid'; // 'paid' or 'unpaid'
    const all = await billing.getAllInvoices();
    
    // Filter by status
    const filtered = all.filter(inv => inv.status === status);
    
    const total = filtered.length;
    const totalAmount = filtered.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    
    if (status === 'unpaid') {
      // Calculate overdue invoices
      const now = new Date();
      const overdue = filtered.filter(inv => {
        if (!inv.due_date) return false;
        const dueDate = new Date(inv.due_date);
        return dueDate < now;
      }).length;
      
      res.json({
        success: true,
        total,
        totalAmount,
        overdue
      });
    } else if (status === 'paid') {
      // Calculate monthly revenue (current month)
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      const monthlyAmount = filtered.filter(inv => {
        if (!inv.paid_at) return false;
        const paidDate = new Date(inv.paid_at);
        return paidDate.getFullYear() === currentYear && paidDate.getMonth() === currentMonth;
      }).reduce((sum, inv) => sum + (inv.amount || 0), 0);
      
      res.json({
        success: true,
        total,
        totalAmount,
        monthlyAmount
      });
    } else {
      res.json({
        success: false,
        message: 'Invalid status parameter'
      });
    }
  } catch (error) {
    logger.error(`Error fetching invoice stats: ${error.message}`);
    res.json({
      success: false,
      total: 0,
      totalAmount: 0,
      overdue: 0,
      monthlyAmount: 0
    });
  }
});

router.get('/api/customer/:phone', adminAuth, async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Check GenieACS (opsional)
    const normalizedPhone = normalizePhoneLocal(phone);
    let deviceStatus = 'inactive';
    try {
      const source = (getSetting && getSetting('billing_device_source', 'genieacs')) || 'genieacs';
      if (String(source).toLowerCase() === 'mikrotik') {
        const mikrotik = require('../config/mikrotik');
        const customerTmp = billing.getCustomerByPhone(normalizedPhone) || {};
        // 1) PPPoE aktif?
        try {
          const conns = await mikrotik.getActivePPPoEConnections();
          const user = (customerTmp.pppoe_username || normalizedPhone || '').toLowerCase();
          if (conns && conns.success && Array.isArray(conns.data)) {
            deviceStatus = conns.data.some(c => String(c.name || '').toLowerCase() === user) ? 'active' : deviceStatus;
          }
        } catch {}
        // 2) Static IP: bila ada IP statik, anggap aktif jika bukan di address-list ISOLIR (opsional heuristik)
        try {
          if (deviceStatus !== 'active' && customerTmp.static_ip) {
            // Jika pelanggan ada IP statik dan tidak berada di daftar ISOLIR, anggap aktif
            // (Jika ingin lebih akurat, nanti bisa tambahkan helper getAddressList)
            deviceStatus = 'active';
          }
        } catch {}
      } else {
        // Default gunakan GenieACS
        let device = null;
        try { device = await findDeviceByTag(normalizedPhone); } catch {}
        deviceStatus = device ? 'active' : 'inactive';
      }
    } catch {}
    
    // Get billing data
    const customer = billing.getCustomerByPhone(normalizedPhone);
    const invoices = billing.getInvoicesByPhone(normalizedPhone);
    
    res.json({ 
      success: true, 
      customer: customer || { phone, name: '', package_name: 'Belum ada paket' },
      invoices,
      device_status: deviceStatus
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Generate monthly invoices
router.post('/generate-monthly-invoices', adminAuth, async (req, res) => {
  try {
    const customers = await billing.getAllCustomers();
    let generated = 0;
    
    for (const customer of customers) {
      if (customer.package_id && customer.status === 'active') {
        // Check if invoice for this month already exists
        const invoices = billing.getInvoicesByPhone(customer.phone);
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        const existingInvoice = invoices.find(inv => {
          const invDate = new Date(inv.created_at);
          return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
        });
        
        if (!existingInvoice) {
          const invoice = billing.createInvoice(customer.phone, customer.package_id, customer.package_price);
          if (invoice) generated++;
        }
      }
    }
    
    res.redirect('/admin/billing?success=' + encodeURIComponent(`${generated} tagihan bulanan berhasil dibuat`));
  } catch (error) {
    logger.error(`Error generating monthly invoices: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal membuat tagihan bulanan'));
  }
});

// Manual trigger monthly invoice generation
router.post('/trigger-monthly-invoices', adminAuth, async (req, res) => {
  try {
    const monthlyInvoiceService = require('../config/monthly-invoice-service');
    await monthlyInvoiceService.generateMonthlyInvoicesNow();
    
    res.redirect('/admin/billing?success=' + encodeURIComponent('Generasi invoice bulanan berhasil dijalankan'));
  } catch (error) {
    logger.error(`Error triggering monthly invoices: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menjalankan generasi invoice bulanan'));
  }
});

// Get monthly invoice service status
router.get('/api/monthly-invoice-status', adminAuth, (req, res) => {
  try {
    const monthlyInvoiceService = require('../config/monthly-invoice-service');
    const status = monthlyInvoiceService.getServiceStatus();
    
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    logger.error(`Error getting monthly invoice status: ${error.message}`);
    res.json({
      success: false,
      message: error.message
    });
  }
});

// DELETE: Hapus single customer
router.post('/customers/delete', adminAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('Nomor HP pelanggan wajib diisi'));
    }
    
    // Delete customer and related invoices
    const normalizedPhone = normalizePhoneLocal(phone);
    const result = await billing.deleteCustomerByPhone(normalizedPhone);
    
    if (result) {
      res.redirect('/admin/customers?success=' + encodeURIComponent(`Pelanggan ${phone} berhasil dihapus`));
    } else {
      res.redirect('/admin/customers?error=' + encodeURIComponent('Gagal menghapus pelanggan'));
    }
  } catch (error) {
    logger.error(`Error deleting customer: ${error.message}`);
    res.redirect('/admin/customers?error=' + encodeURIComponent('Terjadi kesalahan saat menghapus pelanggan'));
  }
});

// DELETE: Hapus multiple customers
router.post('/customers/delete-multiple', adminAuth, async (req, res) => {
  try {
    const { phones } = req.body;
    
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return res.redirect('/admin/customers?error=' + encodeURIComponent('Pilih pelanggan yang akan dihapus'));
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const phone of phones) {
      try {
        const normalizedPhone = normalizePhoneLocal(phone);
        const result = await billing.deleteCustomerByPhone(normalizedPhone);
        if (result) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`${phone}: Gagal menghapus pelanggan`);
        }
      } catch (error) {
        errorCount++;
        errors.push(`${phone}: ${error.message}`);
      }
    }
    
    if (successCount > 0) {
      const message = `${successCount} pelanggan berhasil dihapus`;
      if (errorCount > 0) {
        message += `, ${errorCount} gagal`;
      }
      res.redirect('/admin/customers?success=' + encodeURIComponent(message));
    } else {
      res.redirect('/admin/customers?error=' + encodeURIComponent('Gagal menghapus semua pelanggan yang dipilih'));
    }
  } catch (error) {
    logger.error(`Error deleting multiple customers: ${error.message}`);
    res.redirect('/admin/customers?error=' + encodeURIComponent('Terjadi kesalahan saat menghapus pelanggan'));
  }
});

module.exports = router;
 
// EXPORT: CSV ringkasan tagihan per periode
router.get('/export/invoices.csv', adminAuth, async (req, res) => {
  try {
    const { start, end, status } = req.query;
    const invoices = await billing.getAllInvoices();

    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    const statusFilter = (status || '').toLowerCase();

    const withinRange = (inv) => {
      const d = new Date(inv.created_at);
      if (startDate && d < startDate) return false;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23,59,59,999);
        if (d > endOfDay) return false;
      }
      return true;
    };

    const filtered = invoices.filter(inv => {
      const okDate = withinRange(inv);
      const okStatus = statusFilter ? String(inv.status).toLowerCase() === statusFilter : true;
      return okDate && okStatus;
    });

    // Header CSV
    const headers = [
      'invoice_id','invoice_number','customer_phone','customer_name','package_id','package_name','amount','status','created_at','due_date','paid_at'
    ];

    const toCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const rows = [headers.join(',')].concat(
      filtered.map(inv => [
        inv.id,
        inv.invoice_number,
        inv.customer_phone,
        inv.customer_name || '',
        inv.package_id,
        inv.package_name,
        inv.amount,
        inv.status,
        inv.created_at,
        inv.due_date,
        inv.paid_at || ''
      ].map(toCsv).join(','))
    );

    const csv = rows.join('\n');
    const filenameParts = ['invoices'];
    if (start) filenameParts.push(`from-${start}`);
    if (end) filenameParts.push(`to-${end}`);
    if (statusFilter) filenameParts.push(statusFilter);
    const filename = filenameParts.join('_') + '.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error(`Error exporting invoices CSV: ${error.message}`);
    res.status(500).send('Gagal ekspor CSV');
  }
});
 
// SETTINGS: Simpan template WhatsApp invoice & payment
router.post('/settings/whatsapp-templates', adminAuth, async (req, res) => {
  try {
    const { invoice_template, payment_template, isolir_template, payment_accounts, payment_numbers } = req.body;

    // 1) Simpan hanya payment_* ke settings.json
    const settingsPath = path.join(process.cwd(), 'settings.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { current = {}; }
    if (payment_accounts && String(payment_accounts).trim()) {
      current.payment_accounts = String(payment_accounts);
    } else {
      delete current.payment_accounts;
    }
    if (payment_numbers && String(payment_numbers).trim()) {
      current.payment_numbers = String(payment_numbers);
    } else {
      delete current.payment_numbers;
    }
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');

    // 2) Simpan template WA ke config/wa-templates.json
    const tplPath = path.join(process.cwd(), 'config', 'wa-templates.json');
    let tpl = {};
    try { tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8')); } catch { tpl = {}; }
    tpl.wa_invoice_template = invoice_template || '';
    tpl.wa_payment_template = payment_template || '';
    tpl.wa_isolir_template = isolir_template || '';
    // pastikan folder config ada (harusnya sudah ada)
    try { fs.mkdirSync(path.join(process.cwd(), 'config'), { recursive: true }); } catch {}
    fs.writeFileSync(tplPath, JSON.stringify(tpl, null, 2), 'utf8');

    res.redirect('/admin/billing?success=' + encodeURIComponent('Template WhatsApp & metode pembayaran berhasil disimpan (disimpan terpisah)'));
  } catch (error) {
    logger.error(`Error saving WhatsApp templates: ${error.message}`);
    res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menyimpan template WhatsApp'));
  }
});

// SETTINGS: Simpan profil isolir global (PPPoE) dari Mikrotik
router.post('/settings/isolir-profile', adminAuth, async (req, res) => {
  try {
    const { billing_isolir_profile } = req.body;
    if (!billing_isolir_profile || String(billing_isolir_profile).trim().length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Profile isolir wajib dipilih'));
    }

    const settingsPath = path.join(process.cwd(), 'settings.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { current = {}; }
    current.billing_isolir_profile = String(billing_isolir_profile).trim();
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');

    return res.redirect('/admin/billing?success=' + encodeURIComponent('Profil isolir berhasil disimpan'));
  } catch (error) {
    logger.error(`Error saving isolir profile: ${error.message}`);
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menyimpan profil isolir: ' + error.message));
  }
});

// SETTINGS: Simpan paket isolir (paket yang dipakai saat isolir PPPoE)
router.post('/settings/isolir-package', adminAuth, async (req, res) => {
  try {
    const { billing_isolir_package_id } = req.body;
    if (!billing_isolir_package_id || String(billing_isolir_package_id).trim().length === 0) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Paket isolir wajib dipilih'));
    }

    const settingsPath = path.join(process.cwd(), 'settings.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { current = {}; }
    current.billing_isolir_package_id = String(billing_isolir_package_id).trim();
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');

    return res.redirect('/admin/billing?success=' + encodeURIComponent('Paket isolir berhasil disimpan'));
  } catch (error) {
    logger.error(`Error saving isolir package: ${error.message}`);
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menyimpan paket isolir: ' + error.message));
  }
});

// SETTINGS: Siklus tagihan (bulan kalender vs tanggal pasang pelanggan)
router.post('/settings/billing-cycle', adminAuth, async (req, res) => {
  try {
    const { billing_cycle_mode, billing_install_cycle_time } = req.body;
    const mode = String(billing_cycle_mode || '').toLowerCase();
    if (!['calendar_month','install_date'].includes(mode)) {
      return res.redirect('/admin/billing?error=' + encodeURIComponent('Mode siklus tagihan tidak valid'));
    }
    const settingsPath = path.join(process.cwd(), 'settings.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { current = {}; }
    current.billing_cycle_mode = mode;
    if (billing_install_cycle_time && /^(\d{2}):(\d{2})$/.test(String(billing_install_cycle_time))) {
      current.billing_install_cycle_time = String(billing_install_cycle_time);
    }
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');
    return res.redirect('/admin/billing?success=' + encodeURIComponent('Pengaturan siklus tagihan disimpan'));
  } catch (error) {
    logger.error(`Error saving billing cycle settings: ${error.message}`);
    return res.redirect('/admin/billing?error=' + encodeURIComponent('Gagal menyimpan pengaturan siklus tagihan'));
  }
});
