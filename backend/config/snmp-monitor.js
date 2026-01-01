// SNMP monitoring utilities (Mikrotik-API-free)
// Uses net-snmp to fetch device info and interface counters.
// Provides simple rate calculation using an in-memory cache.

const snmp = require('net-snmp');
const os = require('os');
const { logger } = require('./logger');

// Standard MIB OIDs
const OIDS = {
  sysName: '1.3.6.1.2.1.1.5.0',
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  ifName: '1.3.6.1.2.1.31.1.1.1.1', // ifName.<index>
  // Fallback for devices not exposing ifName (older stacks)
  ifDescr: '1.3.6.1.2.1.2.2.1.2', // ifDescr.<index>
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7', // 1=up, 2=down, 3=testing
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',  // 1=up, 2=down, 3=testing, etc.
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6', // ifHCInOctets.<index>
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10', // ifHCOutOctets.<index>
  ifType: '1.3.6.1.2.1.2.2.1.3', // ifType.<index>
  ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15', // ifHighSpeed.<index> in Mbps
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6', // ifPhysAddress.<index>
  // CPU load (per-CPU): HOST-RESOURCES-MIB::hrProcessorLoad
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  // Storage/Mem: HOST-RESOURCES-MIB::hrStorageTable
  hrStorageType: '1.3.6.1.2.1.25.2.3.1.2',
  hrStorageDescr: '1.3.6.1.2.1.25.2.3.1.3',
  hrStorageAllocationUnits: '1.3.6.1.2.1.25.2.3.1.4',
  hrStorageSize: '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageUsed: '1.3.6.1.2.1.25.2.3.1.6',
  hrStorageRamType: '1.3.6.1.2.1.25.2.1.2',
  hrStorageFixedDiskType: '1.3.6.1.2.1.25.2.1.4',
  // MikroTik-specific OIDs (MIKROTIK-MIB)
  mtxrSystemIdentity: '1.3.6.1.4.1.14988.1.1.4.1.0', // System Identity
  mtxrSystemVersion: '1.3.6.1.4.1.14988.1.1.4.4.0', // RouterOS Version
  mtxrSystemLicLevel: '1.3.6.1.4.1.14988.1.1.4.3.0', // License Level
  mtxrSystemBoardName: '1.3.6.1.4.1.14988.1.1.7.3.0', // Board Name (model)
  mtxrSystemArchitecture: '1.3.6.1.4.1.14988.1.1.7.4.0', // Architecture
  mtxrSystemCpuCount: '1.3.6.1.4.1.14988.1.1.7.5.0', // CPU Count
  mtxrHlProcessorTemperature: '1.3.6.1.4.1.14988.1.1.3.10.0', // CPU Temperature (°C)
  mtxrHlBoardTemperature: '1.3.6.1.4.1.14988.1.1.3.11.0', // Board Temperature (°C)
  // PPP active table (best-effort; may not exist on some RouterOS versions)
  mtxrPPPActiveName: '1.3.6.1.4.1.14988.1.1.1.6.1.1',
  mtxrPPPActiveCallerId: '1.3.6.1.4.1.14988.1.1.1.6.1.4',
  // Standard OIDs
  sysContact: '1.3.6.1.2.1.1.4.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  ifNumber: '1.3.6.1.2.1.2.1.0',
};

// In-memory cache for rate calculations: { `${host}|${community}|${ifIndex}`: { in: {ts,cnt}, out: {ts,cnt} } }
const rateCache = new Map();

function createSession({ host, port = 161, community = 'public', version = '2c', timeoutMs = 3000 }) {
  const options = { port: Number(port) || 161, version: snmp.Version2c, timeout: timeoutMs, retries: 1 }; // v2c default
  if (String(version).toLowerCase() === '1') options.version = snmp.Version1;
  return snmp.createSession(host, community, options);
}

// Helper to parse variable-length integer buffer (Counter64 can be 1-8 bytes)
function parseVariableLengthInt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return 0;
  let result = 0n; // Use BigInt for precision with large counters
  for (let i = 0; i < buf.length; i++) {
    result = (result << 8n) | BigInt(buf[i]);
  }
  // Convert to Number - safe for values up to 2^53
  return Number(result);
}

function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (err, varbinds) => {
      if (err) return reject(err);
      const res = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));

        let value = vb.value;

        // Handle different value types
        if (value === null || value === undefined) {
          value = 0;
        } else if (Buffer.isBuffer(value)) {
          // Check if printable ASCII first (for text like sysName, sysDescr)
          try {
            if (value.length === 0) {
              value = '';
            } else {
              const isPrintable = Array.from(value).every(b => b >= 32 && b <= 126 || b === 0);
              if (isPrintable && value.length > 1) {
                // String buffer (sysName, sysDescr, etc.)
                value = value.toString('utf8').replace(/\0+$/, '').trim();
              } else if (value.length === 6 && !isPrintable) {
                // Could be MAC address (6 bytes, non-printable) - check if looks like MAC
                // MAC addresses typically have varied bytes, counters may have leading zeros
                const hasVariedBytes = new Set(Array.from(value)).size > 2;
                if (hasVariedBytes) {
                  // Likely MAC address - keep as buffer for MAC formatting elsewhere
                  value = vb.value;
                } else {
                  // Likely 6-byte counter - parse as number
                  value = parseVariableLengthInt(value);
                }
              } else if (!isPrintable && value.length >= 3 && value.length <= 8) {
                // Variable-length counter (Counter64 can be 3-8 bytes)
                value = parseVariableLengthInt(value);
              } else if (value.length === 2 && !isPrintable) {
                // 16-bit value
                value = value.readUInt16BE(0);
              } else if (value.length === 1) {
                // Could be single char or byte
                if (isPrintable) {
                  value = value.toString('utf8');
                } else {
                  value = value.readUInt8(0);
                }
              } else if (!isPrintable) {
                // Non-printable buffer of unknown length - try to parse as number
                value = parseVariableLengthInt(value);
              } else {
                // Try as UTF8 string
                value = value.toString('utf8').replace(/\0+$/, '').trim();
              }
            }
          } catch (e) {
            logger.warn(`Failed to parse buffer value for OID ${vb.oid}: ${e.message}, using raw value`);
            value = vb.value;
          }
        } else if (typeof value === 'object' && value.constructor && value.constructor.name === 'Counter64') {
          // Handle Counter64 objects from net-snmp
          try {
            // Counter64 has toNumber() method in some versions
            if (typeof value.toNumber === 'function') {
              value = value.toNumber();
            } else if (typeof value.valueOf === 'function') {
              value = value.valueOf();
            } else {
              // Fallback: try to convert to string then number
              value = Number(String(value));
            }
          } catch (e) {
            logger.warn(`Failed to convert Counter64 for OID ${vb.oid}: ${e.message}`);
            value = 0;
          }
        }

        res[vb.oid] = value;
      }
      resolve(res);
    });
  });
}

function snmpWalk(session, baseOid) {
  return new Promise((resolve, reject) => {
    const items = [];
    // net-snmp subtree callback provides an array of varbinds per PDU
    session.subtree(baseOid, (varbinds) => {
      const arr = Array.isArray(varbinds) ? varbinds : [varbinds];
      for (const vb of arr) {
        if (snmp.isVarbindError(vb)) continue; // skip errors, continue walk
        if (!vb || typeof vb.oid !== 'string') continue;

        let value = vb.value;

        // Parse value based on type
        if (value === null || value === undefined) {
          value = null;
        } else if (Buffer.isBuffer(value)) {
          // Check if it's a printable ASCII string first (most SNMP text values)
          try {
            if (value.length === 0) {
              value = null;
            } else {
              // Check if it's printable ASCII (for strings like interface names, descriptions)
              const isPrintable = Array.from(value).every(b => b >= 32 && b <= 126 || b === 0);
              if (isPrintable && value.length > 1) {
                // String buffer (interface names, descriptions, etc.)
                value = value.toString('utf8').replace(/\0+$/, '').trim();
              } else if (value.length === 6 && !isPrintable) {
                // Could be MAC address - check if varied bytes
                const hasVariedBytes = new Set(Array.from(value)).size > 2;
                if (hasVariedBytes) {
                  value = vb.value; // Keep as buffer for MAC handling
                } else {
                  value = parseVariableLengthInt(value);
                }
              } else if (!isPrintable && value.length >= 3 && value.length <= 8) {
                // Variable-length counter (Counter64 can be 3-8 bytes)
                value = parseVariableLengthInt(value);
              } else if (value.length === 2 && !isPrintable) {
                value = value.readUInt16BE(0);
              } else if (value.length === 1) {
                // Could be single char or byte - check if printable
                if (isPrintable) {
                  value = value.toString('utf8');
                } else {
                  value = value.readUInt8(0);
                }
              } else if (!isPrintable) {
                value = parseVariableLengthInt(value);
              } else {
                // Try as UTF8 string
                value = value.toString('utf8').replace(/\0+$/, '').trim();
              }
            }
          } catch (e) {
            // Keep as buffer if parsing fails
            value = vb.value;
          }
        } else if (typeof value === 'object' && value.constructor && value.constructor.name === 'Counter64') {
          try {
            if (typeof value.toNumber === 'function') {
              value = value.toNumber();
            } else {
              value = Number(String(value));
            }
          } catch (e) {
            value = 0;
          }
        }

        items.push({ oid: vb.oid, value: value });
      }
    }, (err) => {
      if (err) return reject(err);
      resolve(items);
    });
  });
}

async function resolveIfIndex(session, interfaceName) {
  // If a numeric index is provided, accept directly
  if (/^\d+$/.test(String(interfaceName))) {
    return Number(interfaceName);
  }

  // Try by ifName first
  const nameRows = await snmpWalk(session, OIDS.ifName).catch(() => []);
  let row = nameRows.find(r => String(r.value) === interfaceName);

  // Fallback to ifDescr if not found in ifName
  if (!row) {
    const descrRows = await snmpWalk(session, OIDS.ifDescr).catch(() => []);
    row = descrRows.find(r => String(r.value) === interfaceName);
  }

  if (!row) {
    // Build a small hint list of available names (limit to 10 to keep message short)
    const candidates = (nameRows.length ? nameRows : []).slice(0, 10).map(r => String(r.value));
    const hint = candidates.length ? `; available ifName samples: ${candidates.join(', ')}` : '';
    throw new Error(`SNMP interface not found: ${interfaceName}${hint}`);
  }

  const parts = row.oid.split('.');
  const ifIndex = parts[parts.length - 1];
  return Number(ifIndex);
}

function computeRate(prev, currentCount) {
  const now = Date.now();
  if (!prev) return { rate: 0, state: { ts: now, cnt: Number(currentCount) } };
  const dt = (now - prev.ts) / 1000; // seconds
  const d = Number(currentCount) - prev.cnt;
  // handle counter wraps (64-bit wrap is unlikely; if negative, treat as 0)
  const bytes = d >= 0 ? d : 0;
  const rate = dt > 0 ? bytes / dt : 0; // bytes per second
  return { rate, state: { ts: now, cnt: Number(currentCount) } };
}

async function getInterfaceTraffic({ host, community, version, port, interfaceName }) {
  // Basic parameter validation with helpful errors
  if (!host) {
    logger.error('SNMP getInterfaceTraffic: host is not configured');
    throw new Error('SNMP host is not configured. Please configure in Settings.');
  }
  if (!community) {
    logger.error('SNMP getInterfaceTraffic: community is not configured');
    throw new Error('SNMP community is not configured. Please configure in Settings.');
  }
  if (!interfaceName) {
    logger.error('SNMP getInterfaceTraffic: interfaceName is not provided');
    throw new Error('SNMP interfaceName is not provided');
  }

  const session = createSession({ host, community, version, port });
  try {
    logger.debug(`SNMP: Getting traffic for ${interfaceName} on ${host}:${port}`);
    const ifIndex = await resolveIfIndex(session, interfaceName);
    const inOid = `${OIDS.ifHCInOctets}.${ifIndex}`;
    const outOid = `${OIDS.ifHCOutOctets}.${ifIndex}`;
    const res = await snmpGet(session, [inOid, outOid]);
    const key = `${host}|${community}|${ifIndex}`;
    const entry = rateCache.get(key) || { in: null, out: null };
    const inComp = computeRate(entry.in, res[inOid]);
    const outComp = computeRate(entry.out, res[outOid]);
    rateCache.set(key, { in: inComp.state, out: outComp.state });

    const result = {
      interface: interfaceName,
      in_bps: inComp.rate * 8, // convert to bits per second to match Mikrotik monitor-traffic
      out_bps: outComp.rate * 8,
      timestamp: new Date().toISOString(),
    };

    logger.debug(`SNMP traffic: RX=${(result.in_bps / 1000000).toFixed(2)} Mbps, TX=${(result.out_bps / 1000000).toFixed(2)} Mbps`);
    return result;
  } catch (e) {
    // Re-throw with more context included so upstream logs are clearer
    const msg = (e && e.message) ? e.message : String(e);
    const errorMsg = `SNMP traffic error on ${host}:${port} (community: ${community}) for '${interfaceName}': ${msg}`;
    logger.error(errorMsg);

    // Add helpful tips to error message
    if (msg.includes('RequestTimedOutError') || msg.includes('timeout')) {
      throw new Error(`${errorMsg}. Check: 1) SNMP enabled on device, 2) Firewall rules, 3) Network connectivity`);
    } else if (msg.includes('SNMP interface not found')) {
      throw new Error(`${errorMsg}. Use exact interface name (case-sensitive). Run test-snmp.js to list available interfaces.`);
    }
    throw new Error(errorMsg);
  } finally {
    session.close();
  }
}

async function getDeviceInfo({ host, community, version, port }) {
  const session = createSession({ host, community, version, port });

  // Helper to safely convert SNMP value to clean string
  function toCleanStr(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') {
      // If it's a very large number (like OID returned as number), it's probably an error
      // Return empty string instead of scientific notation
      if (val > 1e15 || val < -1e15) {
        logger.warn(`toCleanStr: Very large number detected (${val}), likely parsing error - returning empty string`);
        return '';
      }
      return String(val).trim();
    }
    if (Buffer.isBuffer(val)) {
      try {
        let str = val.toString('utf8');
        str = str.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
        return str;
      } catch {
        return val.toString('ascii').replace(/[^\x20-\x7E]/g, '').trim();
      }
    }
    return String(val).trim();
  }

  try {
    // Fetch standard MIB info
    const basicRes = await snmpGet(session, [OIDS.sysName, OIDS.sysDescr, OIDS.sysUpTime]);

    // Try to fetch MikroTik-specific info (will fail gracefully if not MikroTik)
    let mikrotikInfo = {};
    try {
      // First try to get core MikroTik OIDs (most widely supported)
      const mtCoreRes = await snmpGet(session, [
        OIDS.mtxrSystemIdentity,
        OIDS.mtxrSystemVersion,
        OIDS.mtxrSystemLicLevel,
        OIDS.mtxrSystemBoardName,
        OIDS.mtxrSystemArchitecture,
        OIDS.mtxrSystemCpuCount
      ]);

      mikrotikInfo = {
        identity: toCleanStr(mtCoreRes[OIDS.mtxrSystemIdentity]),
        version: toCleanStr(mtCoreRes[OIDS.mtxrSystemVersion]),
        licenseLevel: Number(mtCoreRes[OIDS.mtxrSystemLicLevel]) || null,
        boardName: toCleanStr(mtCoreRes[OIDS.mtxrSystemBoardName]),
        architecture: toCleanStr(mtCoreRes[OIDS.mtxrSystemArchitecture]),
        cpuCount: Number(mtCoreRes[OIDS.mtxrSystemCpuCount]) || null,
        cpuTemperature: null,
        boardTemperature: null,
      };

      // Try temperature OIDs separately (not all devices support these)
      try {
        const mtTempRes = await snmpGet(session, [
          OIDS.mtxrHlProcessorTemperature,
          OIDS.mtxrHlBoardTemperature
        ]);
        mikrotikInfo.cpuTemperature = Number(mtTempRes[OIDS.mtxrHlProcessorTemperature]) || null;
        mikrotikInfo.boardTemperature = Number(mtTempRes[OIDS.mtxrHlBoardTemperature]) || null;
      } catch (tempErr) {
        // Temperature OIDs not available on this device - that's okay
        logger.debug(`Temperature OIDs not available for ${host}: ${tempErr.message}`);
      }
    } catch (e) {
      // Not a MikroTik device or MIB not available
      logger.debug(`MikroTik-specific OIDs not available for ${host}: ${e.message}`);
    }

    return {
      sysName: toCleanStr(basicRes[OIDS.sysName]),
      sysDescr: toCleanStr(basicRes[OIDS.sysDescr]),
      // sysUpTime in hundredths of seconds
      sysUpTimeSeconds: basicRes[OIDS.sysUpTime] ? Math.floor(Number(basicRes[OIDS.sysUpTime]) / 100) : null,
      ...mikrotikInfo
    };
  } finally {
    session.close();
  }
}



async function getSystemInfo(config) {
  const session = createSession(config);
  try {
    // 1. Get Basic Info
    const basicRes = await snmpGet(session, [
      OIDS.sysDescr, OIDS.sysContact, OIDS.sysLocation, OIDS.sysName, OIDS.sysUpTime, OIDS.ifNumber
    ]).catch(() => ({}));

    // 2. Get CPU & Memory (Reuse existing logic/functions would be cleaner but session mgmt makes it tricky.
    //    We'll do a quick fetch here to avoid multiple sessions/overhead)
    // CPU
    let cpu_usage = 0;
    try {
      const rows = await snmpWalk(session, OIDS.hrProcessorLoad);
      if (rows.length > 0) {
        const values = rows.map(r => Number(r.value)).filter(v => Number.isFinite(v));
        if (values.length > 0) cpu_usage = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      }
    } catch (e) { /* ignore */ }

    // Memory
    let memory_usage = 0;
    let memory_total = 0;
    let memory_available = 0;
    try {
      // Minimal fetch for memory
      const [types, allocs, sizes, useds] = await Promise.all([
        snmpWalk(session, OIDS.hrStorageType).catch(() => []),
        snmpWalk(session, OIDS.hrStorageAllocationUnits).catch(() => []),
        snmpWalk(session, OIDS.hrStorageSize).catch(() => []),
        snmpWalk(session, OIDS.hrStorageUsed).catch(() => []),
      ]);
      // ... (logic similar to getMemoryAndStorage but simplified)
      // This is getting complex to duplicate.
      // Let's rely on helpers if possible? No, helpers open their own sessions.
      // We will copy minimal logic.
      const ramType = OIDS.hrStorageRamType;
      const rows = new Map();
      function idxOf(vb) { return Number(String(vb.oid).split('.').pop()); }
      for (const r of types) { rows.set(idxOf(r), { type: String(r.value) }); }
      for (const r of allocs) { const i = idxOf(r); if (rows.has(i)) rows.get(i).alloc = Number(r.value); }
      for (const r of sizes) { const i = idxOf(r); if (rows.has(i)) rows.get(i).size = Number(r.value); }
      for (const r of useds) { const i = idxOf(r); if (rows.has(i)) rows.get(i).used = Number(r.value); }

      const memRow = Array.from(rows.values()).find(r => r.type === ramType);
      if (memRow) {
        memory_total = (memRow.size || 0) * (memRow.alloc || 1);
        const usedBytes = (memRow.used || 0) * (memRow.alloc || 1);
        memory_available = memory_total - usedBytes;
        if (memory_total > 0) memory_usage = Math.round((usedBytes / memory_total) * 100);
      }
    } catch (e) { /* ignore */ }

    // 3. Active Connections (PPP)
    let active_connections = 0;
    try {
      const pppRows = await snmpWalk(session, OIDS.mtxrPPPActiveName);
      active_connections = pppRows.length;
    } catch (e) { /* ignore */ }

    // Helper to safely convert SNMP value
    function toStr(val) {
      if (Buffer.isBuffer(val)) return val.toString().replace(/\0/g, '').trim();
      return String(val || '');
    }

    return {
      success: true,
      data: {
        sysDescr: toStr(basicRes[OIDS.sysDescr]),
        sysContact: toStr(basicRes[OIDS.sysContact]),
        sysLocation: toStr(basicRes[OIDS.sysLocation]),
        sysName: toStr(basicRes[OIDS.sysName]),
        uptime: basicRes[OIDS.sysUpTime] ? Math.floor(Number(basicRes[OIDS.sysUpTime]) / 100) : 0,
        interface_count: Number(basicRes[OIDS.ifNumber]) || 0,
        cpu_usage,
        memory_usage,
        memory_total,
        memory_available,
        active_connections
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    session.close();
  }
}

async function getCpuLoad({ host, community, version, port }) {
  const session = createSession({ host, community, version, port });
  try {
    const rows = await snmpWalk(session, OIDS.hrProcessorLoad);
    if (!rows.length) return null;
    const values = rows.map(r => Number(r.value)).filter(v => Number.isFinite(v));
    if (!values.length) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(avg);
  } finally {
    session.close();
  }
}

async function getSystemInfo(options = {}) {
  const {
    host,
    community = 'public',
    version = '2c',
    port = 161,
    timeout = 5000
  } = options;

  const session = snmp.createSession(host, community, {
    port: Number(port),
    version: snmp.Version[version.toUpperCase()] || snmp.Version2c,
    timeout: Number(timeout)
  });

  // Prevent unhandled rejection on session error
  session.on('error', (err) => {
    logger.debug(`SNMP Session Error for ${host}: ${err.message}`);
  });

  try {
    // Define OIDs for system information
    const systemOids = [
      OIDS.sysName,
      OIDS.sysDescr,
      OIDS.sysUpTime,
      '1.3.6.1.2.1.1.4.0',     // sysContact.0
      '1.3.6.1.2.1.1.6.0',     // sysLocation.0
      OIDS.hrProcessorLoad + '.1', // First CPU
      '1.3.6.1.4.1.2021.4.5.0', // memTotalReal.0 (UCD-SNMP-MIB)
      '1.3.6.1.4.1.2021.4.6.0', // memAvailReal.0 (UCD-SNMP-MIB)
      '1.3.6.1.2.1.2.1.0'     // ifNumber.0 (number of interfaces)
    ];

    const result = await new Promise((resolve, reject) => {
      session.get(systemOids, (error, varbinds) => {
        if (error) {
          reject(error);
          return;
        }

        const data = {};
        varbinds.forEach((varbind) => {
          const oid = varbind.oid;
          const value = varbind.value;

          // Helper to convert buffer/string to clean string
          const toCleanStr = (val) => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'string') return val.trim();
            if (typeof val === 'number') return String(val).trim();
            if (Buffer.isBuffer(val)) {
              try {
                let str = val.toString('utf8');
                str = str.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
                return str;
              } catch {
                return val.toString('ascii').replace(/[^\x20-\x7E]/g, '').trim();
              }
            }
            return String(val).trim();
          };

          if (oid === OIDS.sysName) {
            data.sysName = toCleanStr(value);
          } else if (oid === OIDS.sysDescr) {
            data.sysDescr = toCleanStr(value);
          } else if (oid === OIDS.sysUpTime) {
            data.uptime = Number(value) / 100; // Convert from hundredths of seconds to seconds
          } else if (oid === '1.3.6.1.2.1.1.4.0') {
            data.sysContact = toCleanStr(value);
          } else if (oid === '1.3.6.1.2.1.1.6.0') {
            data.sysLocation = toCleanStr(value);
          } else if (oid.startsWith(OIDS.hrProcessorLoad)) {
            data.cpu_usage = Number(value);
          } else if (oid === '1.3.6.1.4.1.2021.4.5.0') {
            data.memory_total = Number(value) * 1024; // Convert from KB to bytes
          } else if (oid === '1.3.6.1.4.1.2021.4.6.0') {
            data.memory_available = Number(value) * 1024; // Convert from KB to bytes
          } else if (oid === '1.3.6.1.2.1.2.1.0') {
            data.interface_count = Number(value);
          }
        });

        resolve(data);
      });
    });

    // Calculate memory usage percentage if data is available
    if (result.memory_total && result.memory_available) {
      result.memory_usage = Math.round(((result.memory_total - result.memory_available) / result.memory_total) * 100);
    }

    // Get interface count if not already available
    if (!result.interface_count) {
      try {
        const interfaceCount = await new Promise((resolve, reject) => {
          session.get(['1.3.6.1.2.1.2.1.0'], (error, varbinds) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(Number(varbinds[0].value));
          });
        });
        result.interface_count = interfaceCount;
      } catch (e) {
        result.interface_count = 0;
      }
    }

    // Get PPP active connections by counting interfaces with ifType=23 (PPP)
    try {
      const pppActiveCount = await new Promise((resolve, reject) => {
        let count = 0;
        session.subtree(OIDS.ifType, (varbinds) => {
          const arr = Array.isArray(varbinds) ? varbinds : [varbinds];
          for (const vb of arr) {
            if (!snmp.isVarbindError(vb)) {
              const ifType = Number(vb.value);
              // ifType 23 = PPP (active PPPoE session)
              if (ifType === 23) {
                count++;
              }
            }
          }
        }, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(count);
          }
        });
      });
      result.active_connections = pppActiveCount;
    } catch (e) {
      result.active_connections = 0;
    }

    return {
      success: true,
      data: result
    };

  } catch (error) {
    logger.error(`SNMP getSystemInfo failed for ${host}:`, error.message);
    return {
      success: false,
      message: error.message
    };
  } finally {
    session.close();
  }
}


module.exports = {
  OIDS,
  getInterfaceTraffic,
  getDeviceInfo,
  getSystemInfo,
  getCpuLoad,

  // Helper to classify interface types
  // Returns: 'physical', 'pppoe', 'hotspot', 'other'
  classifyInterface(iface) {
    if (!iface) return 'other';
    const name = (iface.name || '').toLowerCase();
    const descr = (iface.descr || '').toLowerCase();
    const type = iface.type || 0;

    // PPPoE detection: MikroTik may report PPPoE as type 23, some stacks use PPP (53)
    // Additionally, match by common name/descr patterns
    if (type === 23 || type === 53 || /pppoe|ppp-out|<pppoe-/.test(name) || /pppoe|ppp-out/.test(descr)) {
      return 'pppoe';
    }

    // Hotspot/WLAN detection: name contains hotspot/wlan/wifi/hs-
    if (/(hotspot|wlan|wifi|hs-|wireless)/.test(name) || /(hotspot|wlan|wifi)/.test(descr)) {
      return 'hotspot';
    }

    // Physical interfaces: Ethernet(6), VLAN(136), Bridge(209), Bonding(161), etc.
    // Exclude: loopback(24), tunnel(131), l2tp(135)
    const physicalTypes = [6, 136, 209, 161, 117]; // Ethernet, VLAN, Bridge, IEEE802.3ad, Gigabit
    if (physicalTypes.includes(type)) {
      return 'physical';
    }

    // Additional physical interface name patterns
    if (/(ether|sfp|bridge|bond|vlan|trunk)/.test(name)) {
      return 'physical';
    }

    return 'other';
  },

  // Get interface type name for display
  getInterfaceTypeName(type) {
    const typeMap = {
      1: 'Other',
      6: 'Ethernet',
      23: 'PPPoE',
      24: 'Loopback',
      53: 'PPP',
      117: 'Gigabit Ethernet',
      131: 'Tunnel',
      135: 'L2TP',
      136: 'VLAN',
      161: 'IEEE 802.3ad',
      209: 'Bridge',
    };
    return typeMap[type] || `Type ${type || 'Unknown'}`;
  },

  async getMemoryAndStorage({ host, community, version, port }) {
    const session = createSession({ host, community, version, port });
    try {
      const [types, descrs, allocs, sizes, useds] = await Promise.all([
        snmpWalk(session, OIDS.hrStorageType).catch(() => []),
        snmpWalk(session, OIDS.hrStorageDescr).catch(() => []),
        snmpWalk(session, OIDS.hrStorageAllocationUnits).catch(() => []),
        snmpWalk(session, OIDS.hrStorageSize).catch(() => []),
        snmpWalk(session, OIDS.hrStorageUsed).catch(() => []),
      ]);
      const rows = new Map();
      function idxOf(vb) { return Number(String(vb.oid).split('.').pop()); }
      function toStr(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return val;
        if (Buffer.isBuffer(val)) {
          try {
            return val.toString('utf8').replace(/\0+$/, '');
          } catch {
            return val.toString();
          }
        }
        return String(val);
      }
      function toNum(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        const n = Number(val);
        return isNaN(n) ? 0 : n;
      }

      for (const r of types) { const i = idxOf(r); const row = rows.get(i) || { index: i }; row.type = toStr(r.value); rows.set(i, row); }
      for (const r of descrs) { const i = idxOf(r); const row = rows.get(i) || { index: i }; row.descr = toStr(r.value); rows.set(i, row); }
      for (const r of allocs) { const i = idxOf(r); const row = rows.get(i) || { index: i }; row.alloc = toNum(r.value) || 1; rows.set(i, row); }
      for (const r of sizes) { const i = idxOf(r); const row = rows.get(i) || { index: i }; row.size = toNum(r.value) || 0; rows.set(i, row); }
      for (const r of useds) { const i = idxOf(r); const row = rows.get(i) || { index: i }; row.used = toNum(r.value) || 0; rows.set(i, row); }

      const list = Array.from(rows.values());
      function bytesOf(row) { return (row.used || 0) * (row.alloc || 1); }
      function totalBytesOf(row) { return (row.size || 0) * (row.alloc || 1); }

      // Memory: prefer type ram, else descr contains 'mem'
      const memRow = list.find(r => r.type === OIDS.hrStorageRamType) || list.find(r => /mem|ram/i.test(r.descr || ''));
      // Disk: prefer fixedDisk, else descr contains 'flash' or 'disk'
      const diskRow = list.find(r => r.type === OIDS.hrStorageFixedDiskType) || list.find(r => /(flash|disk|storage)/i.test(r.descr || ''));

      const mem = memRow ? {
        usedBytes: bytesOf(memRow), totalBytes: totalBytesOf(memRow),
        usedPct: totalBytesOf(memRow) ? Math.round((bytesOf(memRow) / totalBytesOf(memRow)) * 100) : null,
      } : null;
      const disk = diskRow ? {
        usedBytes: bytesOf(diskRow), totalBytes: totalBytesOf(diskRow),
        usedPct: totalBytesOf(diskRow) ? Math.round((bytesOf(diskRow) / totalBytesOf(diskRow)) * 100) : null,
      } : null;

      return { mem, disk };
    } finally {
      session.close();
    }
  },
  // Helper to list interfaces by ifIndex with names/descriptions/status
  async listInterfaces({ host, community, version, port }) {
    if (!host) throw new Error('SNMP host is not configured');
    const session = createSession({ host, community, version, port });
    try {
      const [names, descrs, adminStatuses, operStatuses, types, speeds, phys] = await Promise.all([
        snmpWalk(session, OIDS.ifName).catch(() => []),
        snmpWalk(session, OIDS.ifDescr).catch(() => []),
        snmpWalk(session, OIDS.ifAdminStatus).catch(() => []),
        snmpWalk(session, OIDS.ifOperStatus).catch(() => []),
        snmpWalk(session, OIDS.ifType).catch(() => []),
        snmpWalk(session, OIDS.ifHighSpeed).catch(() => []),
        snmpWalk(session, OIDS.ifPhysAddress).catch(() => []),
      ]);
      const byIndex = new Map();

      // Helper to safely convert value to string
      function toStr(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return val;
        if (typeof val === 'number') {
          // If it's a very large number, it's probably an error
          if (val > 1e15 || val < -1e15) {
            logger.warn(`toStr: Very large number detected (${val}), likely parsing error`);
            return '';
          }
          return String(val);
        }
        if (Buffer.isBuffer(val)) {
          // Try UTF8 decode, removing null bytes and control characters
          try {
            let str = val.toString('utf8');
            // Remove null bytes, control characters except newline/tab, and trim
            str = str.replace(/\0/g, '').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
            return str;
          } catch {
            // Fallback to ASCII if UTF8 fails
            return val.toString('ascii').replace(/[^\x20-\x7E]/g, '').trim();
          }
        }
        return String(val);
      }

      // Helper to safely convert to number
      function toNum(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        const n = Number(val);
        return isNaN(n) ? 0 : n;
      }

      for (const r of names) {
        const idx = Number(r.oid.split('.').pop());
        const nameValue = toStr(r.value);
        byIndex.set(idx, { index: idx, name: nameValue, descr: null, disabled: false, running: true });
      }
      for (const r of descrs) {
        const idx = Number(r.oid.split('.').pop());
        const row = byIndex.get(idx) || { index: idx, name: null, descr: null, disabled: false, running: true };
        const descrValue = toStr(r.value);
        row.descr = descrValue;

        // For PPPoE interfaces (type 23), try to extract username from descr
        // MikroTik PPPoE format: "<pppoe-username>" or similar
        if (descrValue && descrValue.includes('<') && descrValue.includes('>')) {
          const match = descrValue.match(/<([^>]+)>/);
          if (match && match[1]) {
            // Extract username from <username> format
            const extractedName = match[1].trim();
            // Use extracted name if current name is empty or looks like a default interface name
            if (!row.name || row.name.trim() === '' || row.name.startsWith('if-')) {
              row.name = extractedName;
            }
          }
        }

        // Use descr as fallback if name is still empty
        if (!row.name || row.name.trim() === '') {
          row.name = descrValue || `if-${idx}`;
        }
        byIndex.set(idx, row);
      }
      for (const r of adminStatuses) {
        const idx = Number(r.oid.split('.').pop());
        const row = byIndex.get(idx);
        if (row) {
          // ifAdminStatus: 1=up, 2=down, 3=testing
          row.disabled = (toNum(r.value) === 2);
        }
      }
      for (const r of operStatuses) {
        const idx = Number(r.oid.split('.').pop());
        const row = byIndex.get(idx);
        if (row) {
          // ifOperStatus: 1=up, 2=down, 3=testing, 4=unknown, 5=dormant, 6=notPresent, 7=lowerLayerDown
          const status = toNum(r.value);
          row.operStatus = status;
          row.running = (status === 1);
        }
      }
      for (const r of types) {
        const idx = Number(r.oid.split('.').pop());
        const row = byIndex.get(idx) || { index: idx };
        row.type = toNum(r.value);
        byIndex.set(idx, row);
      }
      for (const r of speeds) {
        const idx = Number(r.oid.split('.').pop());
        const row = byIndex.get(idx) || { index: idx };
        row.highSpeedMbps = toNum(r.value) || null;
        byIndex.set(idx, row);
      }
      for (const r of phys) {
        const idx = Number(r.oid.split('.').pop());
        const row = byIndex.get(idx) || { index: idx };
        let mac = r.value;
        if (Buffer.isBuffer(mac)) {
          // Convert buffer to MAC address format
          const bytes = Array.from(mac);
          if (bytes.length === 6) {
            mac = bytes.map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
          } else if (bytes.length === 0) {
            mac = '';
          } else {
            // Non-standard length, convert to hex string
            mac = bytes.map(b => b.toString(16).padStart(2, '0')).join(':');
          }
        } else if (typeof mac === 'string' && mac.length > 0) {
          mac = String(mac);
        } else {
          mac = '';
        }
        row.mac = mac;
        byIndex.set(idx, row);
      }
      // Final sanitize pass for interface names: strip any HTML-like brackets
      for (const row of byIndex.values()) {
        if (row && typeof row.name === 'string') {
          let n = row.name.trim();
          // If name is like "<pppoe-username>", extract inside
          const m = n.match(/^<([^>]+)>$/);
          if (m && m[1]) {
            n = m[1];
          }
          // Remove any residual HTML tags
          n = n.replace(/<[^>]*>/g, '').trim();
          // Strip common prefixes like 'pppoe-' at the start for user-friendly display
          n = n.replace(/^pppoe[-_]+/i, '');
          row.name = n;
        }
      }

      // Try to enrich PPPoE MAC from PPP Active table (caller-id) if ifPhysAddress is empty
      try {
        const [pppNames, pppCallerIds] = await Promise.all([
          snmpWalk(session, OIDS.mtxrPPPActiveName).catch(() => []),
          snmpWalk(session, OIDS.mtxrPPPActiveCallerId).catch(() => []),
        ]);
        // Build name -> callerId map
        const nameMap = new Map();
        function toAscii(val) {
          if (val == null) return '';
          if (typeof val === 'string') return val.trim();
          if (Buffer.isBuffer(val)) {
            try { return val.toString('utf8').replace(/\0/g, '').trim(); } catch { return val.toString('ascii').trim(); }
          }
          return String(val).trim();
        }
        for (const n of pppNames) {
          const idx = String(n.oid).split('.').pop();
          const rawName = toAscii(n.value);
          // Normalize same as interface rows
          const norm = rawName.replace(/^<([^>]+)>$/, '$1').replace(/<[^>]*>/g, '').replace(/^pppoe[-_]+/i, '').trim();
          nameMap.set(idx, { name: norm });
        }
        for (const c of pppCallerIds) {
          const idx = String(c.oid).split('.').pop();
          const entry = nameMap.get(idx) || {};
          entry.callerId = toAscii(c.value);
          nameMap.set(idx, entry);
        }
        // Index interface rows by normalized name for quick lookup
        const rowsByName = new Map();
        for (const row of byIndex.values()) {
          const key = (row.name || '').trim().toLowerCase();
          if (key) rowsByName.set(key, row);
        }
        // Apply callerId if mac missing
        function extractMac(str) {
          if (!str) return '';
          const s = String(str);
          // Find first MAC-like sequence anywhere in the string
          const m = s.match(/[0-9a-fA-F]{2}(?:[:-]?[0-9a-fA-F]{2}){5}/);
          if (!m) return '';
          const raw = m[0].replace(/[:-]/g, '').toUpperCase();
          return raw.match(/.{1,2}/g).join(':');
        }
        for (const { name, callerId } of nameMap.values()) {
          const row = rowsByName.get((name || '').toLowerCase());
          if (row && (!row.mac || row.mac === '' || row.mac === '00:00:00:00:00:00')) {
            const mac = extractMac(callerId);
            if (mac) row.mac = mac;
          }
        }
      } catch (e) {
        logger.debug('PPP Active table enrichment skipped:', e.message);
      }
      return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
    } finally {
      session.close();
    }
  },

  // Bulk fetch traffic (rate) and totals for many interfaces
  async getInterfacesTrafficBulk({ host, community, version, port, indices = [] }) {
    if (!host) throw new Error('SNMP host is not configured');
    if (!Array.isArray(indices) || indices.length === 0) return [];
    const session = createSession({ host, community, version, port });
    try {
      // Build OIDs for all indices
      const oids = [];
      for (const idx of indices) {
        oids.push(`${OIDS.ifHCInOctets}.${idx}`);
        oids.push(`${OIDS.ifHCOutOctets}.${idx}`);
      }

      // Some devices have many interfaces; one big GET can exceed UDP MTU and
      // cause `send EMSGSIZE <ip>:<port>`. To avoid this, batch the request.
      const BATCH_OIDS = 40; // 40 varbinds per request (~20 interfaces)
      let res;
      async function fetchInBatches(oidList) {
        const out = {};
        for (let i = 0; i < oidList.length; i += BATCH_OIDS) {
          const slice = oidList.slice(i, i + BATCH_OIDS);
          const part = await snmpGet(session, slice);
          Object.assign(out, part);
        }
        return out;
      }
      let resTmp;
      try {
        resTmp = await fetchInBatches(oids);
      } catch (e) {
        // Fallback: some devices may not expose HC counters; try 32-bit counters
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (msg.includes('nosuch') || msg.includes('no such') || msg.includes('not found')) {
          const oids32 = [];
          const IF_IN = '1.3.6.1.2.1.2.2.1.10';
          const IF_OUT = '1.3.6.1.2.1.2.2.1.16';
          for (const idx of indices) { oids32.push(`${IF_IN}.${idx}`); oids32.push(`${IF_OUT}.${idx}`); }
          resTmp = await fetchInBatches(oids32);
        } else {
          throw e;
        }
      }
      res = resTmp;
      const out = [];
      for (const idx of indices) {
        const inOid = `${OIDS.ifHCInOctets}.${idx}`;
        const outOid = `${OIDS.ifHCOutOctets}.${idx}`;
        const key = `${host}|${community}|${idx}`;
        const entry = rateCache.get(key) || { in: null, out: null };
        const inComp = computeRate(entry.in, res[inOid]);
        const outComp = computeRate(entry.out, res[outOid]);
        rateCache.set(key, { in: inComp.state, out: outComp.state });
        out.push({
          index: Number(idx),
          in_bps: inComp.rate * 8,
          out_bps: outComp.rate * 8,
          total_in_bytes: Number(res[inOid]) || 0,
          total_out_bytes: Number(res[outOid]) || 0,
        });
      }
      return out;
    } finally {
      session.close();
    }
  },


};

