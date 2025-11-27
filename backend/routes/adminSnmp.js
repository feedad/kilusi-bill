const express = require('express');
const router = express.Router();
const { adminAuth } = require('./adminAuth');
const { getSetting } = require('../config/settingsManager');
const snmpMonitor = require('../config/snmp-monitor');
const logger = require('../config/logger');
const mikrotik = require('../config/mikrotik');
const { query, getAll, getOne } = require('../config/database');

// Ensure SNMP columns exist on target tables so updates don't fail
async function ensureSnmpColumns(tableName) {
  const valid = new Set(['nas_servers', 'mikrotik_servers']);
  if (!valid.has(tableName)) return;

  try {
    // Check existing columns in PostgreSQL
    const result = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
    `, [tableName]);

    const cols = result.rows.map(r => r.column_name);
    const toAdd = [];

    if (!cols.includes('snmp_community')) toAdd.push(`ALTER TABLE ${tableName} ADD COLUMN snmp_community TEXT`);
    if (!cols.includes('snmp_version')) toAdd.push(`ALTER TABLE ${tableName} ADD COLUMN snmp_version TEXT DEFAULT '2c'`);
    if (!cols.includes('snmp_port')) toAdd.push(`ALTER TABLE ${tableName} ADD COLUMN snmp_port INTEGER DEFAULT 161`);

    for (const sql of toAdd) {
      try {
        await query(sql);
      } catch (err) {
        // Ignore duplicate column errors
        if (!err.message.includes('already exists')) {
          logger.warn(`SNMP column add warning: ${err.message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error ensuring SNMP columns for ${tableName}: ${error.message}`);
  }
}

// Legacy: redirect old Diagnostics page to Devices
router.get('/snmp', adminAuth, async (req, res) => {
  try {
    return res.redirect('/admin/snmp/devices');
  } catch (error) {
    logger.error('Error redirecting SNMP diagnostics page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// GET: SNMP Devices overview page (multi-device)
router.get('/snmp/devices', adminAuth, async (req, res) => {
  try {
    const settings = require('../config/settingsManager').getSettingsWithCache();
    res.render('admin-snmp-devices', {
      title: 'SNMP Devices',
      page: 'snmp',
      subpage: 'devices',
      settings,
    });
  } catch (error) {
    logger.error('Error loading SNMP devices page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API: Get device info via SNMP
router.get('/snmp/device-info', adminAuth, async (req, res) => {
  try {
    // Allow overriding via query string for multi-device monitoring
    const host = (req.query.host || getSetting('snmp_host', '')).trim();
    const community = (req.query.community || getSetting('snmp_community', 'public')).trim();
    const version = (req.query.version || getSetting('snmp_version', '2c')).trim();
    const port = (req.query.port || getSetting('snmp_port', '161')).trim();

    if (!host) {
      return res.json({
        success: false,
        message: 'SNMP host is not configured'
      });
    }

    // Get device info
  const info = await snmpMonitor.getDeviceInfo({ host, community, version, port });
    
    // Get CPU load
    let cpuLoad = null;
    try {
      cpuLoad = await snmpMonitor.getCpuLoad({ host, community, version, port });
    } catch (e) {
      logger.warn('Could not get CPU load:', e.message);
    }

    // Get Memory and Disk usage
    let memDisk = { mem: null, disk: null };
    try {
      memDisk = await snmpMonitor.getMemoryAndStorage({ host, community, version, port });
    } catch (e) {
      logger.warn('Could not get Memory/Disk info:', e.message);
    }

    res.json({
      success: true,
      sysName: info.sysName,
      sysDescr: info.sysDescr,
      uptime: info.sysUpTimeSeconds 
        ? `${Math.floor(info.sysUpTimeSeconds/86400)}d ${Math.floor((info.sysUpTimeSeconds%86400)/3600)}h ${Math.floor((info.sysUpTimeSeconds%3600)/60)}m`
        : 'N/A',
      cpuLoad,
      memory: memDisk.mem,
      disk: memDisk.disk,
      // MikroTik-specific fields
      identity: info.identity,
      version: info.version,
      licenseLevel: info.licenseLevel,
      boardName: info.boardName,
      architecture: info.architecture,
      cpuCount: info.cpuCount,
      cpuTemperature: info.cpuTemperature,
      boardTemperature: info.boardTemperature,
      host
    });
  } catch (error) {
    logger.error('SNMP device-info error:', error);
    res.json({
      success: false,
      message: error.message || 'Failed to get device info'
    });
  }
});

// API: List interfaces via SNMP
router.get('/snmp/interfaces', adminAuth, async (req, res) => {
  try {
    const host = (req.query.host || getSetting('snmp_host', '')).trim();
    const community = (req.query.community || getSetting('snmp_community', 'public')).trim();
    const version = (req.query.version || getSetting('snmp_version', '2c')).trim();
    const port = (req.query.port || getSetting('snmp_port', '161')).trim();

    if (!host) {
      return res.json({
        success: false,
        message: 'SNMP host is not configured'
      });
    }

  const interfaces = await snmpMonitor.listInterfaces({ host, community, version, port });

    res.json({
      success: true,
      interfaces,
      host
    });
  } catch (error) {
    logger.error('SNMP interfaces error:', error);
    res.json({
      success: false,
      message: error.message || 'Failed to list interfaces'
    });
  }
});

// API: Get interface traffic via SNMP
router.get('/snmp/traffic', adminAuth, async (req, res) => {
  try {
    const interfaceName = req.query.interface;
    
    if (!interfaceName) {
      return res.json({
        success: false,
        message: 'Interface name is required'
      });
    }

  const host = (req.query.host || getSetting('snmp_host', '')).trim();
  const community = (req.query.community || getSetting('snmp_community', 'public')).trim();
  const version = (req.query.version || getSetting('snmp_version', '2c')).trim();
  const port = (req.query.port || getSetting('snmp_port', '161')).trim();

    if (!host) {
      return res.json({
        success: false,
        message: 'SNMP host is not configured'
      });
    }

    const traffic = await snmpMonitor.getInterfaceTraffic({ 
      host, 
      community, 
      version, 
      port, 
      interfaceName 
    });

    res.json({
      success: true,
      interface: interfaceName,
      rx: traffic.in_bps || 0,
      tx: traffic.out_bps || 0,
      timestamp: traffic.timestamp,
      host
    });
  } catch (error) {
    logger.error('SNMP traffic error:', error);
    res.json({
      success: false,
      message: error.message || 'Failed to get traffic'
    });
  }
});

// PAGE: SNMP Monitor (Interfaces view like reference)
router.get('/snmp/monitor', adminAuth, async (req, res) => {
  try {
    const settings = require('../config/settingsManager').getSettingsWithCache();
    const host = (req.query.host || '').trim();
    res.render('admin-snmp-monitor', {
      title: 'SNMP Monitor',
      page: 'snmp',
      subpage: 'monitor',
      settings,
      host,
    });
  } catch (error) {
    logger.error('Error loading SNMP monitor page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Simple in-memory cache for interface lists (30s TTL)
const interfaceCache = new Map(); // { `${host}|${community}`: { ts, data } }

// API: Clear SNMP cache (for debugging/development)
router.post('/snmp/clear-cache', adminAuth, (req, res) => {
  const beforeSize = interfaceCache.size;
  interfaceCache.clear();
  logger.info(`SNMP cache cleared (${beforeSize} entries removed)`);
  res.json({ success: true, message: `Cache cleared (${beforeSize} entries)` });
});

// API: Interfaces snapshot for monitor (rates + totals)
// Supports pagination: ?limit=100&offset=0&filter=pppoe&withTraffic=true&category=physical|pppoe|hotspot
router.get('/snmp/interfaces/monitor', adminAuth, async (req, res) => {
  try {
    const host = (req.query.host || getSetting('snmp_host', '')).trim();
    const community = (req.query.community || getSetting('snmp_community', 'public')).trim();
    const version = (req.query.version || getSetting('snmp_version', '2c')).trim();
    const port = (req.query.port || getSetting('snmp_port', '161')).trim();

    if (!host) return res.json({ success: false, message: 'SNMP host is not configured' });

    // Pagination & filtering params
    const limit = parseInt(req.query.limit) || 100; // default 100 per page
    const offset = parseInt(req.query.offset) || 0;
    const filter = (req.query.filter || '').toLowerCase().trim(); // filter by name/descr
    const withTraffic = req.query.withTraffic !== 'false'; // default true, set to false to skip traffic
    const category = (req.query.category || '').toLowerCase(); // physical, pppoe, hotspot

    // Check cache first (30s TTL)
    const cacheKey = `${host}|${community}|${version}|${port}`;
    const now = Date.now();
    let interfaces;
    const cached = interfaceCache.get(cacheKey);
    if (cached && (now - cached.ts < 30000)) {
      logger.debug(`SNMP interfaces cache HIT for ${host}`);
      interfaces = cached.data;
    } else {
      logger.debug(`SNMP interfaces cache MISS for ${host}, fetching...`);
      interfaces = await snmpMonitor.listInterfaces({ host, community, version, port });
      interfaceCache.set(cacheKey, { ts: now, data: interfaces });
    }

    // Apply category filter first (physical, pppoe, hotspot)
    let filtered = interfaces;
    if (category) {
      filtered = interfaces.filter(iface => {
        const classification = snmpMonitor.classifyInterface(iface);
        return classification === category;
      });
      // Safety fallback: if nothing matched but we do have interfaces,
      // return unfiltered list so UI never goes totally blank due to misclassification
      if (filtered.length === 0 && interfaces.length > 0) {
        logger.warn(`Category '${category}' resulted in 0 interfaces; falling back to unfiltered list`);
        filtered = interfaces;
      }
    }

    // Apply text filter (case-insensitive on name or descr)
    if (filter) {
      filtered = filtered.filter(iface => {
        const name = (iface.name || '').toLowerCase();
        const descr = (iface.descr || '').toLowerCase();
        return name.includes(filter) || descr.includes(filter);
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    // Fetch traffic only for current page (not all 5000+)
  let merged = paginated;
    if (withTraffic && paginated.length > 0) {
      const indices = paginated.map(x => x.index);
      let rates = [];
      try {
        rates = await snmpMonitor.getInterfacesTrafficBulk({ host, community, version, port, indices });
      } catch (e) {
        logger.warn(`SNMP rates fallback (interfaces listed but traffic failed): ${e.message}`);
        rates = [];
      }
      const byIdx = new Map(rates.map(r => [r.index, r]));
      merged = paginated.map(iface => {
        const r = byIdx.get(iface.index) || {};
        return {
          index: iface.index,
          name: iface.name,
          descr: iface.descr,
          type: iface.type,
          typeName: snmpMonitor.getInterfaceTypeName(iface.type),
          speed_mbps: iface.highSpeedMbps,
          mac: iface.mac || '',
          disabled: !!iface.disabled,
          running: !!iface.running,
          rx_bps: r.in_bps || 0,
          tx_bps: r.out_bps || 0,
          total_rx_bytes: r.total_in_bytes || 0,
          total_tx_bytes: r.total_out_bytes || 0,
        };
      });
    } else {
      // Return without traffic (zero rates)
      merged = paginated.map(iface => ({
        index: iface.index,
        name: iface.name,
        descr: iface.descr,
        type: iface.type,
        typeName: snmpMonitor.getInterfaceTypeName(iface.type),
        speed_mbps: iface.highSpeedMbps,
        mac: iface.mac || '',
        disabled: !!iface.disabled,
        running: !!iface.running,
        rx_bps: 0,
        tx_bps: 0,
        total_rx_bytes: 0,
        total_tx_bytes: 0,
      }));
    }

    // Enrich PPPoE entries with IP address and uptime from active PPP sessions (RouterOS API or RADIUS)
    try {
      if (category === 'pppoe' && Array.isArray(merged) && merged.length) {
        const active = await mikrotik.getActivePPPoEConnections();
        if (active && active.success && Array.isArray(active.data)) {
          // Build map by normalized name
          const norm = (s) => String(s || '').replace(/^pppoe[-_]+/i, '').trim().toLowerCase();
          const activeByName = new Map();
          for (const sess of active.data) {
            const n = norm(sess.name || sess.user || sess.username || '');
            if (!n) continue;
            activeByName.set(n, sess);
          }
          // Helper to format uptime (seconds -> human string)
          function fmtUptime(u) {
            if (u == null) return '';
            if (typeof u === 'number') {
              const s = Math.max(0, Math.floor(u));
              const d = Math.floor(s / 86400);
              const h = Math.floor((s % 86400) / 3600);
              const m = Math.floor((s % 3600) / 60);
              const parts = [];
              if (d) parts.push(`${d}d`);
              if (h) parts.push(`${h}h`);
              if (m || parts.length === 0) parts.push(`${m}m`);
              return parts.join(' ');
            }
            // Already string from RouterOS (e.g., 1h20m30s)
            return String(u);
          }
          function extractMac(str) {
            if (!str) return '';
            const m = String(str).match(/[0-9a-fA-F]{2}(?:[:-]?[0-9a-fA-F]{2}){5}/);
            if (!m) return '';
            const raw = m[0].replace(/[:-]/g, '').toUpperCase();
            return raw.match(/.{1,2}/g).join(':');
          }
          for (const row of merged) {
            const key = norm(row.name);
            const sess = activeByName.get(key);
            if (sess) {
              // Mikrotik API returns 'address' for remote IP; RADIUS returns 'address' as nasipaddress
              row.address = sess.address || sess['remote-address'] || '';
              row.uptime = fmtUptime(sess.uptime);
              // Fill MAC from caller-id if empty
              if (!row.mac || row.mac === '' || row.mac === '00:00:00:00:00:00') {
                const mac = extractMac(sess['caller-id'] || sess.callerId || '');
                if (mac) row.mac = mac;
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`PPPoE enrichment failed: ${e.message}`);
    }

    res.json({ 
      success: true, 
      interfaces: merged, 
      total,
      limit,
      offset,
      hasMore: (offset + limit) < total,
      host 
    });
  } catch (error) {
    logger.error('SNMP interfaces monitor error:', error);
    res.json({ success: false, message: error.message || 'Failed to fetch monitor snapshot' });
  }
});

// API: List devices (NAS + Mikrotik servers) with SNMP status
router.get('/snmp/devices/json', adminAuth, async (req, res) => {
  try {
    // Try to include per-device SNMP columns; fallback if not present
    async function trySelect(sql, fallbackSql) {
      try { return await getAll(sql); } catch { return await getAll(fallbackSql); }
    }

    const [nas, mt] = await Promise.all([
      trySelect(
        'SELECT id, name, host, type, snmp_community, snmp_version, snmp_port FROM nas_servers ORDER BY id',
        'SELECT id, name, host, type FROM nas_servers ORDER BY id'
      ).catch(() => []),
      trySelect(
        'SELECT id, name, host, port, snmp_community, snmp_version, snmp_port FROM mikrotik_servers ORDER BY id',
        'SELECT id, name, host, port FROM mikrotik_servers ORDER BY id'
      ).catch(() => []),
    ]);

    const devices = [];
    for (const n of nas) {
      devices.push({ id: `nas-${n.id}`, name: n.name, host: n.host, type: n.type || 'NAS', source: 'nas',
        snmp_community: n.snmp_community, snmp_version: n.snmp_version, snmp_port: n.snmp_port });
    }
    for (const m of mt) {
      devices.push({ id: `mt-${m.id}`, name: m.name, host: m.host, type: 'Mikrotik', source: 'mikrotik',
        snmp_community: m.snmp_community, snmp_version: m.snmp_version, snmp_port: m.snmp_port });
    }

    // Probe SNMP status concurrently (best-effort)
    const globalCommunity = (req.query.community || getSetting('snmp_community', 'public')).trim();
    const globalVersion = (req.query.version || getSetting('snmp_version', '2c')).trim();
    const globalPort = (req.query.port || getSetting('snmp_port', '161')).trim();

    const results = await Promise.allSettled(devices.map(async d => {
      const community = (d.snmp_community || globalCommunity).toString().trim();
      const version = (d.snmp_version || globalVersion).toString().trim();
      const port = (d.snmp_port || globalPort).toString().trim();
      try {
        const info = await snmpMonitor.getDeviceInfo({ host: d.host, community, version, port });
        const cpu = await snmpMonitor.getCpuLoad({ host: d.host, community, version, port }).catch(() => null);
        return { id: d.id, ok: true, sysName: info.sysName, uptime: info.sysUpTimeSeconds || null, cpu };
      } catch (e) {
        return { id: d.id, ok: false, error: e.message };
      }
    }));

    const byId = new Map(results.map(r => [r.value?.id || '', r]));
    const enriched = devices.map(d => {
      const r = byId.get(d.id);
      if (r && r.value) {
        return { ...d, snmp_ok: r.value.ok, sysName: r.value.sysName || null, uptime: r.value.uptime, cpu: r.value.cpu || null, error: r.value.error || null };
      }
      return { ...d, snmp_ok: false };
    });

    res.json({ success: true, devices: enriched });
  } catch (error) {
    logger.error('SNMP devices json error:', error);
    res.json({ success: false, message: error.message || 'Failed to load devices' });
  }
});


// API: Update NAS SNMP settings
router.post('/snmp/devices/update-nas/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, host, snmp_community, snmp_version, snmp_port } = req.body;

    await ensureSnmpColumns('nas_servers');

    await query(
      'UPDATE nas_servers SET name=$1, host=$2, snmp_community=$3, snmp_version=$4, snmp_port=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6',
      [name, host, snmp_community || null, snmp_version || '2c', snmp_port || 161, id]
    );
    
    res.json({ success: true, message: 'Device updated successfully' });
  } catch (error) {
    logger.error('Update NAS device error:', error);
    res.json({ success: false, message: error.message || 'Failed to update' });
  }
});

// API: Update Mikrotik SNMP settings
router.post('/snmp/devices/update-mikrotik/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, host, snmp_community, snmp_version, snmp_port } = req.body;

    await ensureSnmpColumns('mikrotik_servers');

    await query(
      'UPDATE mikrotik_servers SET name=$1, host=$2, snmp_community=$3, snmp_version=$4, snmp_port=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6',
      [name, host, snmp_community || null, snmp_version || '2c', snmp_port || 161, id]
    );
    
    res.json({ success: true, message: 'Device updated successfully' });
  } catch (error) {
    logger.error('Update Mikrotik device error:', error);
    res.json({ success: false, message: error.message || 'Failed to update' });
  }
});

// API: Delete NAS device
router.post('/snmp/devices/delete-nas/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if device is being used
    const countResult = await getOne('SELECT COUNT(*) as count FROM customers WHERE nas_id=$1', [id]);
    const count = parseInt(countResult.count);

    if (count > 0) {
      return res.json({
        success: false,
        message: `Tidak dapat menghapus. ${count} customer menggunakan NAS ini.`
      });
    }

    await query('DELETE FROM nas_servers WHERE id=$1', [id]);
    
    res.json({ success: true, message: 'NAS device deleted successfully' });
  } catch (error) {
    logger.error('Delete NAS device error:', error);
    res.json({ success: false, message: error.message || 'Failed to delete' });
  }
});

// API: Delete Mikrotik device
router.post('/snmp/devices/delete-mikrotik/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if device is being used
    const countResult = await getOne('SELECT COUNT(*) as count FROM customers WHERE mikrotik_server_id=$1', [id]);
    const count = parseInt(countResult.count);

    if (count > 0) {
      return res.json({
        success: false,
        message: `Tidak dapat menghapus. ${count} customer menggunakan server ini.`
      });
    }

    await query('DELETE FROM mikrotik_servers WHERE id=$1', [id]);
    
    res.json({ success: true, message: 'Mikrotik device deleted successfully' });
  } catch (error) {
    logger.error('Delete Mikrotik device error:', error);
    res.json({ success: false, message: error.message || 'Failed to delete' });
  }
});


module.exports = router;
