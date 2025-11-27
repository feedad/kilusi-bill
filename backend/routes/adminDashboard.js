const express = require('express');
const router = express.Router();
// Use adminAuth from the main file to avoid duplicate authentication
const fs = require('fs');
const path = require('path');

const { getDevices } = require('../config/genieacs');
const { getActivePPPoEConnections, getInactivePPPoEUsers } = require('../config/mikrotik');
const { genieacsApi } = require('../config/genieacs');

// GET: Dashboard admin (middleware will be applied at app level)
router.get('/dashboard', async (req, res) => {
  let genieacsTotal = 0, genieacsOnline = 0, genieacsOffline = 0;
  let mikrotikTotal = 0, mikrotikAktif = 0, mikrotikOffline = 0;
  let settings = {};
  
  try {
    // Baca settings.json
    settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));
    
    // GenieACS
    const devices = await getDevices();
    genieacsTotal = devices.length;
    // Anggap device online jika ada _lastInform dalam 1 jam terakhir
    const now = Date.now();
    genieacsOnline = devices.filter(dev => dev._lastInform && (now - new Date(dev._lastInform).getTime()) < 3600*1000).length;
    genieacsOffline = genieacsTotal - genieacsOnline;
    // Mikrotik
    const aktifResult = await getActivePPPoEConnections();
    mikrotikAktif = aktifResult.success ? aktifResult.data.length : 0;
    const offlineResult = await getInactivePPPoEUsers();
    mikrotikOffline = offlineResult.success ? offlineResult.totalInactive : 0;
    mikrotikTotal = (offlineResult.success ? offlineResult.totalSecrets : 0);
  } catch (e) {
    console.error('Error in dashboard route:', e);
    // Jika error, biarkan value default 0
  }
  
  res.render('adminDashboard', {
    title: 'Dashboard Admin',
    page: 'dashboard',
    genieacsTotal,
    genieacsOnline,
    genieacsOffline,
    mikrotikTotal,
    mikrotikAktif,
    mikrotikOffline,
    settings // Sertakan settings di sini
  });
});

// GET: Admin Map Monitoring (middleware will be applied at app level)
// GET: Admin Map Monitoring
router.get('/map', async (req, res) => {
  try {
    console.log('🗺️ Loading admin map monitoring page...');

    // Baca settings dulu
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings.json'), 'utf8'));

    // Render halaman langsung tanpa tunggu GenieACS
    // Data akan di-load via AJAX
    res.render('admin-map', {
      title: 'Map Monitoring - Admin',
      page: 'map',
      genieacsTotal: 0,
      genieacsOnline: 0,
      genieacsOffline: 0,
      totalWithLocation: 0,
      coveragePercentage: 0,
      settings
    });

  } catch (error) {
    console.error('Error loading admin map page:', error);
    res.status(500).send('Error loading map page: ' + error.message);
  }
});

// GET: OLT Devices (stub endpoint)
router.get('/map/olt-devices', async (req, res) => {
  try {
    // Return empty OLT devices for now
    res.json({
      success: true,
      devices: []
    });
  } catch (error) {
    console.error('Error getting OLT devices:', error);
    res.json({
      success: false,
      devices: [],
      error: error.message
    });
  }
});

// GET: Admin Map Data (JSON untuk AJAX)
router.get('/map/data', async (req, res) => {
  try {
    console.log('📍 Getting admin map data...');

    // Ambil semua devices dari GenieACS dengan timeout
    let devices = [];
    try {
      const devicesPromise = getDevices();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting devices')), 3000) // Reduced to 3 seconds
      );
      
      devices = await Promise.race([devicesPromise, timeoutPromise]);
      console.log(`📍 Retrieved ${devices.length} devices from GenieACS`);
    } catch (deviceError) {
      console.error('❌ Error getting devices:', deviceError.message);
      // Return empty response instead of failing
      return res.json({
        success: true, // Changed to true so frontend doesn't error
        error: 'GenieACS timeout or unavailable',
        devices: [],
        summary: { total: 0, online: 0, offline: 0, withLocation: 0 },
        odps: [],
        links: [],
        odpLinks: []
      });
    }
    
    // Ambil data lokasi dari file JSON
    const fs = require('fs');
    const path = require('path');
    const locationsFile = path.join(__dirname, '../logs/onu-locations.json');
    const odpsFile = path.join(__dirname, '../logs/odps.json');
    const linksFile = path.join(__dirname, '../logs/onu-odp.json');
    const odpLinksFile = path.join(__dirname, '../logs/odp-links.json');
    let savedLocations = {};
    let odps = [];
    let links = [];
    let odpLinks = [];
    
    try {
      if (fs.existsSync(locationsFile)) {
        savedLocations = JSON.parse(fs.readFileSync(locationsFile, 'utf8'));
        console.log(`📍 Loaded ${Object.keys(savedLocations).length} saved locations`);
      }
    } catch (e) {
      console.log('No saved locations file found or invalid format');
    }

    try {
      if (fs.existsSync(odpsFile)) {
        odps = JSON.parse(fs.readFileSync(odpsFile, 'utf8'));
        console.log(`📍 Loaded ${odps.length} ODP points`);
      }
    } catch (e) {
      console.log('No ODP file found or invalid format');
    }

    try {
      if (fs.existsSync(linksFile)) {
        links = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
        if (!Array.isArray(links)) links = [];
        console.log(`📍 Loaded ${links.length} ONU-ODP links`);
      }
    } catch (e) {
      console.log('No ONU-ODP link file found or invalid format');
    }

    try {
      if (fs.existsSync(odpLinksFile)) {
        odpLinks = JSON.parse(fs.readFileSync(odpLinksFile, 'utf8'));
        if (!Array.isArray(odpLinks)) odpLinks = [];
        console.log(`📍 Loaded ${odpLinks.length} ODP-ODP links`);
      }
    } catch (e) {
      console.log('No ODP-ODP link file found or invalid format');
    }

    if (!devices || devices.length === 0) {
      return res.json({
        success: true,
        devices: [],
        summary: {
          total: 0,
          online: 0,
          offline: 0,
          withLocation: 0
        },
        message: 'Tidak ada perangkat ONU yang ditemukan'
      });
    }

    const mapDevices = [];
    let onlineCount = 0;
    let offlineCount = 0;
    let withLocationCount = 0;

    // Filter parameters dari query
    const filter = req.query.filter || 'all'; // all, online, offline, with-location
    const search = req.query.search || ''; // search by serial/pppoe/username

    for (const device of devices) {
      try {
        // Ambil informasi dasar device
        const deviceId = device._id;
        const serialNumber = device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value ||
                            device.Device?.DeviceInfo?.SerialNumber?._value || deviceId || 'N/A';

        // Ambil informasi PPPoE username
        const pppoeUsername = device.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.Username?._value ||
                             device.InternetGatewayDevice?.WANDevice?.[0]?.WANConnectionDevice?.[0]?.WANPPPConnection?.[0]?.Username?._value ||
                             device.VirtualParameters?.pppoeUsername?._value || 'N/A';

        // Ambil informasi lokasi - prioritas dari file JSON yang tersimpan
        let location = null;
        let hasLocation = false;

        // 1. Cek lokasi dari file JSON (prioritas utama)
        if (savedLocations[deviceId]) {
          const savedLoc = savedLocations[deviceId];
          location = {
            lat: savedLoc.lat,
            lng: savedLoc.lng,
            address: savedLoc.address || 'N/A',
            lastUpdated: savedLoc.lastUpdated,
            source: 'admin_map'
          };
          hasLocation = true;
          withLocationCount++;
        }
        // 2. Fallback ke VirtualParameters.location
        else if (device.VirtualParameters?.location?._value) {
          try {
            const parsedLocation = JSON.parse(device.VirtualParameters.location._value);
            location = {
              lat: parsedLocation.lat,
              lng: parsedLocation.lng,
              address: parsedLocation.address || 'N/A',
              source: 'virtual_parameters'
            };
            hasLocation = true;
            withLocationCount++;
          } catch (e) {
            console.log(`Format lokasi tidak valid untuk device ${deviceId}`);
          }
        }
        // 3. Fallback ke tags
        else if (device._tags && Array.isArray(device._tags)) {
          const locationTag = device._tags.find(tag => tag.startsWith('location:'));
          if (locationTag) {
            try {
              const locationData = locationTag.replace('location:', '');
              const parsedLocation = JSON.parse(locationData);
              location = {
                lat: parsedLocation.lat,
                lng: parsedLocation.lng,
                address: parsedLocation.address || 'N/A',
                source: 'tags'
              };
              hasLocation = true;
              withLocationCount++;
            } catch (e) {
              console.log(`Format lokasi dari tag tidak valid untuk device ${deviceId}`);
            }
          }
        }

        // Ambil informasi status
        const lastInform = device._lastInform ? new Date(device._lastInform) : null;
        const now = new Date();
        const timeDiff = lastInform ? (now - lastInform) / (1000 * 60 * 60) : Infinity; // dalam jam
        
        let statusText = 'Offline';
        let isOnline = false;
        
        if (timeDiff < 1) {
          statusText = 'Online';
          isOnline = true;
          onlineCount++;
        } else if (timeDiff < 24) {
          statusText = 'Idle';
          onlineCount++; // Count Idle as online for basic stats
        } else {
          statusText = 'Offline';
          offlineCount++;
        }

        // Ambil RX Power
        const rxPower = device.VirtualParameters?.RXPower?._value ||
                        device.VirtualParameters?.redaman?._value ||
                        device.InternetGatewayDevice?.WANDevice?.[1]?.WANPONInterfaceConfig?.RXPower?._value ||
                        'N/A';

        // Ambil SSID untuk edit functionality
        const ssid = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value || 'N/A';
        const wifiPassword = device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.KeyPassphrase?._value || 'N/A';

        // Ambil nama pelanggan dari tags
        const customerTags = device._tags ? device._tags.filter(tag =>
          !tag.startsWith('location:') &&
          !tag.startsWith('pppoe:') &&
          tag.match(/^\d{10,15}$/) // Format nomor telepon
        ) : [];
        const customerPhone = customerTags.length > 0 ? customerTags[0] : 'N/A';
        
        // Tag pelanggan untuk display
        const customerTag = (Array.isArray(device.Tags) && device.Tags.length > 0)
          ? device.Tags.join(', ')
          : (typeof device.Tags === 'string' && device.Tags)
            ? device.Tags
            : (Array.isArray(device._tags) && device._tags.length > 0)
              ? device._tags.join(', ')
              : (typeof device._tags === 'string' && device._tags)
                ? device._tags
                : 'N/A';

        // Filter berdasarkan kriteria
        let shouldInclude = true;

        // Filter status
        if (filter === 'online' && statusText !== 'Online') shouldInclude = false;
        if (filter === 'offline' && statusText !== 'Offline') shouldInclude = false;
        if (filter === 'with-location' && !hasLocation) shouldInclude = false;

        // Filter search
        if (search && shouldInclude) {
          const searchLower = search.toLowerCase();
          const searchableText = `${serialNumber} ${pppoeUsername} ${customerPhone} ${customerTag}`.toLowerCase();
          if (!searchableText.includes(searchLower)) {
            shouldInclude = false;
          }
        }

        // Hanya tambahkan device yang sesuai filter
        if (shouldInclude) {
          mapDevices.push({
            id: deviceId,
            serialNumber,
            pppoeUsername,
            customerPhone,
            customerTag,
            hasLocation,
            location: hasLocation ? {
              lat: parseFloat(location.lat),
              lng: parseFloat(location.lng),
              address: location.address || 'N/A',
              source: location.source || 'unknown',
              lastUpdated: location.lastUpdated || 'N/A'
            } : null,
            status: {
              isOnline,
              statusText,
              lastInform: lastInform ? lastInform.toLocaleString('id-ID') : 'N/A',
              rxPower: rxPower !== 'N/A' ? parseFloat(rxPower) : null,
              timeDiffHours: timeDiff !== Infinity ? Math.round(timeDiff * 100) / 100 : null
            },
            wifi: {
              ssid,
              password: wifiPassword,
              connectedUsers24: device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.TotalAssociations?._value || 0,
              connectedUsers5: device.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['5']?.TotalAssociations?._value || 0
            },
            info: {
              manufacturer: device.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'N/A',
              modelName: device.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || 'N/A',
              softwareVersion: device.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || 'N/A',
              productClass: device.DeviceID?.ProductClass || device.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value || 'N/A'
            },
            tags: device._tags || [],
            lastInform: device._lastInform
          });
        }
      } catch (deviceError) {
        console.error(`Error memproses device ${device._id}:`, deviceError.message);
        continue;
      }
    }

    console.log(`📍 Berhasil memproses ${mapDevices.length} dari ${devices.length} perangkat ONU untuk admin map`);

    // Lampirkan info penggunaan port per ODP (computed)
    const odpsWithUsage = Array.isArray(odps)
      ? odps.map(o => {
          const total = typeof o.total_ports === 'number' ? o.total_ports : 8;
          const used = Array.isArray(links) ? links.filter(l => l.odpId === o.id).length : 0;
          return { ...o, total_ports: total, used_ports: used };
        })
      : [];

    res.json({
      success: true,
      devices: mapDevices,
      summary: {
        total: devices.length,
        online: onlineCount,
        offline: offlineCount,
        withLocation: withLocationCount,
        filtered: mapDevices.length
      },
      filters: {
        status: filter,
        search: search
      },
      locations: {
        saved: Object.keys(savedLocations).length,
        mapped: withLocationCount
      },
      odps: odpsWithUsage,
      links: links,
      odpLinks: odpLinks,
      message: `Berhasil mengambil ${mapDevices.length} perangkat ONU untuk monitoring`
    });

  } catch (error) {
    console.error('❌ Error mengambil data admin map:', error.message);
    res.status(500).json({
      success: false,
      devices: [],
      summary: { total: 0, online: 0, offline: 0, withLocation: 0, filtered: 0 },
      message: 'Error mengambil data ONU: ' + error.message
    });
  }
});

// POST: Update SSID dan Password ONU
router.post('/map/update-wifi', express.json(), async (req, res) => {
  try {
    const { deviceId, ssid, password } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'Device ID diperlukan' });
    }

    console.log(`📡 Updating WiFi for device: ${deviceId}`);
    console.log(`SSID: ${ssid}, Password: ${password ? '***' : 'not provided'}`);

    const { setParameterValues } = require('../config/genieacs');
    const results = {};

    // Update SSID jika disediakan
    if (ssid && ssid.trim()) {
      try {
        const ssidResult = await setParameterValues(deviceId, {
          'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': ssid.trim()
        });
        results.ssid = { success: true, message: 'SSID berhasil diupdate' };
        
        // Update SSID 5GHz juga (setParameterValues akan otomatis menambahkan suffix -5G)
        try {
          await setParameterValues(deviceId, {
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID': ssid.trim()
          });
          results.ssid5g = { success: true, message: 'SSID 5GHz berhasil diupdate' };
        } catch (e) {
          console.log('5GHz SSID update failed, continuing...');
        }
      } catch (error) {
        console.error('Error updating SSID:', error);
        results.ssid = { success: false, message: error.message };
      }
    }

    // Update Password jika disediakan
    if (password && password.trim()) {
      if (password.trim().length < 8) {
        results.password = { success: false, message: 'Password minimal 8 karakter' };
      } else {
        try {
          await setParameterValues(deviceId, {
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase': password.trim(),
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase': password.trim()
          });
          results.password = { success: true, message: 'Password berhasil diupdate' };
        } catch (error) {
          console.error('Error updating password:', error);
          results.password = { success: false, message: error.message };
        }
      }
    }

    res.json({
      success: true,
      results,
      message: 'Update WiFi selesai diproses'
    });

  } catch (error) {
    console.error('Error updating WiFi:', error);
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// GET: Billing Dashboard Stats
router.get('/billing-stats', async (req, res) => {
  try {
    const billing = require('../config/billing');
    
    // Get all data
    const customers = await billing.getAllCustomers();
    const invoices = await billing.getAllInvoices();
    const currentMonth = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    // Calculate stats
    const totalCustomers = customers.length;
    
    // Filter invoices this month
    const thisMonthInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.created_at);
      return invDate >= currentMonthStart;
    });
    
    // Paid invoices this month
    const paidInvoices = thisMonthInvoices.filter(inv => inv.status === 'paid');
    const paidThisMonth = paidInvoices.reduce((sum, inv) => {
      const amount = parseFloat(inv.amount) || 0;
      return sum + amount;
    }, 0);
    const paidCount = paidInvoices.length;
    
    // Unpaid invoices
    const unpaidInvoices = invoices.filter(inv => inv.status === 'unpaid' || inv.status === 'pending');
    const unpaidAmount = unpaidInvoices.reduce((sum, inv) => {
      const amount = parseFloat(inv.amount) || 0;
      return sum + amount;
    }, 0);
    const unpaidCount = unpaidInvoices.length;
    
    // Monthly revenue (paid this month)
    const monthlyRevenue = paidThisMonth;
    
    // Recent paid invoices (last 10)
    const recentPaidInvoices = paidInvoices
      .sort((a, b) => new Date(b.paid_at || b.created_at) - new Date(a.paid_at || a.created_at))
      .slice(0, 10)
      .map(inv => {
        const customer = customers.find(c => c.phone === inv.customer_phone);
        return {
          invoice_number: inv.invoice_number,
          customer_name: customer?.name || inv.customer_name || 'Unknown',
          phone: inv.customer_phone,
          package_name: customer?.package_name || inv.package_name || '-',
          amount: inv.amount,
          paid_date: inv.paid_at || inv.created_at,
          payment_method: inv.payment_method || 'Manual'
        };
      });
    
    res.json({
      success: true,
      totalCustomers,
      paidThisMonth,
      paidCount,
      unpaidAmount,
      unpaidCount,
      monthlyRevenue,
      currentMonth,
      recentPaidInvoices
    });
  } catch (error) {
    console.error('Error getting billing stats:', error);
    res.json({
      success: false,
      message: error.message,
      totalCustomers: 0,
      paidThisMonth: 0,
      paidCount: 0,
      unpaidAmount: 0,
      unpaidCount: 0,
      monthlyRevenue: 0,
      currentMonth: new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
      recentPaidInvoices: []
    });
  }
});

// API: Grafik Pendapatan Harian
// API: Revenue Chart
router.get('/revenue-chart', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const billing = require('../config/billing');

    // Ambil semua invoice dari penyimpanan billing (file JSON)
    const allInvoices = await billing.getAllInvoices();
    console.log(`[Revenue Chart] Total invoices: ${allInvoices.length}, Days: ${days}`);

    // Batas tanggal: N hari terakhir (gunakan UTC untuk konsistensi)
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
    console.log(`[Revenue Chart] Date range: ${startDate.toISOString()} to ${now.toISOString()}`);

    // Agregasi pendapatan per tanggal berdasarkan paid_at untuk invoice berstatus paid
    const byDate = new Map(); // key: 'YYYY-MM-DD' -> sum amount
    let paidCount = 0;
    for (const inv of allInvoices) {
      if (inv.status !== 'paid') continue;
      if (!inv.paid_at) continue;
      const paid = new Date(inv.paid_at);
      if (isNaN(paid.getTime())) continue;
      if (paid < startDate || paid > now) continue;
      const key = paid.toISOString().split('T')[0];
      const amt = Number.parseFloat(inv.amount) || 0;
      byDate.set(key, (byDate.get(key) || 0) + amt);
      paidCount++;
      console.log(`[Revenue Chart] Invoice ${inv.invoice_number}: Rp ${amt.toLocaleString('id-ID')} on ${key}`);
    }
    console.log(`[Revenue Chart] Found ${paidCount} paid invoices in range`);

    console.log(`[Revenue Chart] Found ${paidCount} paid invoices in range`);

    // Susun label tanggal dan nilai pendapatan, isi 0 jika tidak ada transaksi pada hari tsb
    const dates = [];
    const revenues = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + i);
      const key = d.toISOString().split('T')[0];
      dates.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
      revenues.push(byDate.get(key) || 0);
    }

    const total = revenues.reduce((a,b) => a+b, 0);
    console.log(`[Revenue Chart] Returning ${dates.length} days, total: Rp ${total.toLocaleString('id-ID')}`);
    res.json({ success: true, dates, revenues });
  } catch (error) {
    console.error('[Revenue Chart] ERROR:', error);
    res.json({ success: false, error: error.message });
  }
});

// API: Activity Log
router.get('/activity-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const billing = require('../config/billing');

    // Ambil data dari billing JSON
    const allInvoices = await billing.getAllInvoices();
    const allCustomers = await billing.getAllCustomers();
    console.log(`[Activity Log] Total invoices: ${allInvoices.length}, Total customers: ${allCustomers.length}`);

    const activities = [];

    // 1. Payment activities (invoices yang baru dibayar)
    const paidInvoices = allInvoices.filter(inv => inv.status === 'paid' && inv.paid_at);
    console.log(`[Activity Log] Paid invoices: ${paidInvoices.length}`);
    paidInvoices.forEach(inv => {
      activities.push({
        type: 'payment',
        title: 'Pembayaran Diterima',
        description: `Invoice ${inv.invoice_number} - ${inv.customer_name || inv.customer_phone}`,
        user: inv.admin_name || 'Admin',
        timestamp: inv.paid_at
      });
    });

    // 2. Invoice generation (invoices baru dibuat)
    const createdInvoices = allInvoices.filter(inv => inv.created_at);
    console.log(`[Activity Log] Created invoices: ${createdInvoices.length}`);
    createdInvoices.forEach(inv => {
      activities.push({
        type: 'invoice',
        title: 'Invoice Dibuat',
        description: `Invoice ${inv.invoice_number} untuk ${inv.customer_name || inv.customer_phone}`,
        user: inv.admin_name || 'System',
        timestamp: inv.created_at
      });
    });

    // 3. Customer additions
    const newCustomers = allCustomers.filter(c => c.created_at);
    console.log(`[Activity Log] New customers: ${newCustomers.length}`);
    newCustomers.forEach(c => {
      activities.push({
        type: 'customer',
        title: 'Customer Baru',
        description: `${c.name || 'Customer'} - ${c.phone}`,
        user: 'Admin',
        timestamp: c.created_at
      });
    });

    // Sort by timestamp descending
    activities.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB - dateA;
    });

    // Limit hasil
    const limitedActivities = activities.slice(0, limit);

    console.log(`[Activity Log] Returning ${limitedActivities.length} activities from ${activities.length} total`);
    res.json({
      success: true,
      activities: limitedActivities
    });

  } catch (error) {
    console.error('[Activity Log] ERROR:', error);
    res.json({ success: false, error: error.message, activities: [] });
  }
});

// POST: Tambah titik ODP (admin only)
router.post('/map/odps', express.json(), (req, res) => {
  try {
    const { id, name, lat, lng, total_ports } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ success: false, message: 'Lat/Lng wajib berupa number' });
    }
    const odpsFile = path.join(__dirname, '../logs/odps.json');
    let odps = [];
    try {
      if (fs.existsSync(odpsFile)) {
        odps = JSON.parse(fs.readFileSync(odpsFile, 'utf8'));
      }
    } catch (_) {}

    const newOdp = {
      id: id && String(id).trim() ? String(id).trim() : `ODP-${(odps.length + 1).toString().padStart(3, '0')}`,
      name: name && String(name).trim() ? String(name).trim() : 'ODP',
      lat,
      lng,
      total_ports: typeof total_ports === 'number' ? total_ports : 8
    };

    odps.push(newOdp);
    fs.writeFileSync(odpsFile, JSON.stringify(odps, null, 2));

    return res.json({ success: true, message: 'ODP tersimpan', data: newOdp });
  } catch (error) {
    console.error('Error saving ODP:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan ODP', error: error.message });
  }
});

// POST: Hubungkan ONU ke ODP (admin only)
router.post('/map/link-onu-odp', express.json(), (req, res) => {
  try {
    const { onuId, odpId } = req.body || {};
    if (!onuId || !odpId) {
      return res.status(400).json({ success: false, message: 'onuId dan odpId wajib diisi' });
    }
    const linksFile = path.join(__dirname, '../logs/onu-odp.json');
    let links = [];
    try {
      if (fs.existsSync(linksFile)) {
        links = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
      }
    } catch (_) {}

    // Hapus link lama untuk ONU ini jika ada, lalu tambah yang baru
    links = Array.isArray(links) ? links.filter(l => l.onuId !== onuId) : [];
    links.push({ onuId, odpId });
    fs.writeFileSync(linksFile, JSON.stringify(links, null, 2));

    return res.json({ success: true, message: 'Link ONU-ODP tersimpan', data: { onuId, odpId } });
  } catch (error) {
    console.error('Error saving ONU-ODP link:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan link', error: error.message });
  }
});

// POST: Buat/hapus link kabel antar ODP (admin only)
router.post('/map/link-odp-odp', express.json(), (req, res) => {
  try {
    const { fromOdpId, toOdpId, action } = req.body || {};
    if (!fromOdpId || !toOdpId) {
      return res.status(400).json({ success: false, message: 'fromOdpId dan toOdpId wajib diisi' });
    }
    const file = path.join(__dirname, '../logs/odp-links.json');
    let links = [];
    try {
      if (fs.existsSync(file)) {
        links = JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (_) {}

    // Normalisasi - hindari duplikasi (A-B sama dengan B-A)
    const key = (a, b) => [a, b].sort().join(':::');
    const set = new Set(Array.isArray(links) ? links.map(l => key(l.fromOdpId, l.toOdpId)) : []);
    const currentKey = key(fromOdpId, toOdpId);

    if (action === 'delete') {
      const newLinks = Array.isArray(links) ? links.filter(l => key(l.fromOdpId, l.toOdpId) !== currentKey) : [];
      fs.writeFileSync(file, JSON.stringify(newLinks, null, 2));
      return res.json({ success: true, message: 'Link ODP-ODP dihapus' });
    }

    if (!set.has(currentKey)) {
      links = Array.isArray(links) ? links : [];
      links.push({ fromOdpId, toOdpId });
      fs.writeFileSync(file, JSON.stringify(links, null, 2));
    }
    return res.json({ success: true, message: 'Link ODP-ODP disimpan', data: { fromOdpId, toOdpId } });
  } catch (error) {
    console.error('Error saving ODP-ODP link:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyimpan link ODP-ODP', error: error.message });
  }
});

// TEST ENDPOINT - NO AUTH (untuk debugging)
router.get('/test-revenue', async (req, res) => {
  try {
    console.log('[TEST] Revenue chart test endpoint called');
    const billing = require('../config/billing');
    const allInvoices = await billing.getAllInvoices();
    const paidInvoices = allInvoices.filter(i => i.status === 'paid');
    
    res.json({
      success: true,
      test: true,
      totalInvoices: allInvoices.length,
      paidInvoices: paidInvoices.length,
      sampleInvoice: allInvoices[0] || null,
      message: 'Test endpoint working!'
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
