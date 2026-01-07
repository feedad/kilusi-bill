const snmp = require('net-snmp');

const OLT_OIDS = {
  zte: {
    uptime: '1.3.6.1.2.1.1.3.0',
    model: '1.3.6.1.2.1.1.1.0', // SysDescr
    cpu: '1.3.6.1.4.1.3902.1012.3.11.1.0', // Example ZTE CPU
    ram: '1.3.6.1.4.1.3902.1012.3.12.1.0', // Example ZTE RAM
    temp: '1.3.6.1.4.1.3902.1012.3.13.1.0', // Example ZTE Temp
    ponPorts: '1.3.6.1.4.1.3902.1012.3.2.1.1.1', // Example interface table
    onuStatus: '1.3.6.1.4.1.3902.1012.3.28.1.1.4', // gponOnuPhaseState
    onuSn: '1.3.6.1.4.1.3902.1012.3.28.1.1.5',     // gponOnuSn
    onuRxPower: '1.3.6.1.4.1.3902.1012.3.50.12.1.1.14', // gponOnuRxOpticalPower
    onuName: '1.3.6.1.4.1.3902.1012.3.28.1.1.3',   // gponOnuName/Desc
  },
  huawei: {
    uptime: '1.3.6.1.2.1.1.3.0',
    model: '1.3.6.1.2.1.1.1.0',
    cpu: '1.3.6.1.4.1.2011.6.3.4.1.2.0.0.0',
    ram: '1.3.6.1.4.1.2011.6.3.5.1.2.0.0.0',
    temp: '1.3.6.1.4.1.2011.6.3.12.1.2.0.0.0',
    onuStatus: '1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15',
    onuSn: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3',
    onuRxPower: '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4',
    onuName: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.9',
  },
  hsgq: {
    uptime: '1.3.6.1.2.1.1.3.0',
    model: '1.3.6.1.2.1.1.1.0',
    // Analyzed OIDs for HSGQ-XE08ID (EPON)
    onuStatus: '1.3.6.1.4.1.50224.3.3.2.1.8',    // 1=Online, 2=Offline
    onuSn: '1.3.6.1.4.1.50224.3.3.2.1.7',        // MAC Address e0:45...
    onuRxPower: '1.3.6.1.4.1.50224.3.3.3.1.4',   // Index + .0.0, value -1619
    onuName: '1.3.6.1.4.1.50224.3.3.2.1.2',      // Customer Name
    onuDistance: '1.3.6.1.4.1.50224.3.3.2.1.15', // Distance (Simple Index)
    onuTemperature: '1.3.6.1.4.1.50224.3.3.2.1.10' // Temp (Unused here, override in loop)
  },
  hioso: {
    uptime: '1.3.6.1.2.1.1.3.0',
    model: '1.3.6.1.2.1.1.1.0',
    // Verified OIDs for Hioso (based on .1.3.6.1.4.1.25355)
    onuStatus: '1.3.6.1.4.1.25355.3.2.6.3.2.1.39',
    onuSn: '1.3.6.1.4.1.25355.3.2.6.3.2.1.11',     // Col 11 seems to hold ASCII Hex SN
    onuRxPower: '1.3.6.1.4.1.25355.3.2.6.14.2.1.8',
    onuName: '1.3.6.1.4.1.25355.3.2.6.3.2.1.37',
    onuTxPower: '1.3.6.1.4.1.25355.3.2.6.14.2.1.4',
    onuDistance: '1.3.6.1.4.1.25355.3.2.6.3.2.1.25',
    onuTemperature: null // '1.3.6.1.4.1.25355.3.2.6.14.2.1.7' -- Causing Hang/Timeout?
  },
  vsol: {
    uptime: '1.3.6.1.2.1.1.3.0',
    model: '1.3.6.1.2.1.1.1.0',
    onuSn: '1.3.6.1.4.1.3709.3.6.2.1.1.2',
    onuStatus: '1.3.6.1.4.1.3709.3.6.2.1.1.14',
    onuRxPower: '1.3.6.1.4.1.3709.3.6.2.1.1.6',
    onuName: '1.3.6.1.4.1.3709.3.6.2.1.1.2', // Name/Desc often same
    onuDistance: '1.3.6.1.4.1.3709.3.6.2.1.1.12',
    onuTemperature: '1.3.6.1.4.1.3709.3.6.2.1.1.9'
  },

  cdata: {
    uptime: '1.3.6.1.2.1.1.3.0',
    model: '1.3.6.1.2.1.1.1.0',
    onuStatus: '1.3.6.1.4.1.17409.1.11.2.1.1',
    onuSn: '1.3.6.1.4.1.17409.1.3.1.2.1',
    onuRxPower: '1.3.6.1.4.1.17409.1.11.5.1.1',
    onuName: '1.3.6.1.4.1.17409.1.3.1.2.1',
  }
};

/**
 * Create SNMP Session
 */
function createSession(host, community, version = '2c', port = 161) {
  const options = {
    port: port,
    retries: 1,
    timeout: 5000,
    transport: 'udp4',
    trapPort: 162,
    version: version === '2c' ? snmp.Version2c : snmp.Version1
  };
  return snmp.createSession(host, community, options);
}

/**
 * Promisified SNMP Get
 */
function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) reject(error);
      else {
        const result = {};
        varbinds.forEach(vb => {
          if (snmp.isVarbindError(vb)) result[vb.oid] = null;
          else result[vb.oid] = vb.value;
        });
        resolve(result);
      }
    });
  });
}

/**
 * Promisified SNMP Walk
 */
function snmpWalk(session, oid) {
  return new Promise((resolve, reject) => {
    const items = [];
    session.subtree(oid, 20, (varbinds) => {
      varbinds.forEach(vb => items.push({ oid: vb.oid, value: vb.value }));
    }, (error) => {
      if (error) reject(error);
      else resolve(items);
    });
  });
}

/**
 * Get Basic Device Info
 */
async function getOLTDeviceInfo(config) {
  const { host, community = 'public', version = '2c', port = 161, vendor = 'zte' } = config;
  const session = createSession(host, community, version, port);

  try {
    const oids = [OLT_OIDS[vendor]?.uptime || OLT_OIDS.zte.uptime, OLT_OIDS[vendor]?.model || OLT_OIDS.zte.model];
    const result = await snmpGet(session, oids);

    // Try to get CPU/RAM/Temp if possible
    let cpu = 0, ram = 0, temp = 0;
    try {
      if (OLT_OIDS[vendor]?.cpu) {
        const metrics = await snmpGet(session, [
          OLT_OIDS[vendor].cpu,
          OLT_OIDS[vendor].ram,
          OLT_OIDS[vendor].temp
        ]);
        cpu = metrics[OLT_OIDS[vendor].cpu] || 0;
        ram = metrics[OLT_OIDS[vendor].ram] || 0;
        temp = metrics[OLT_OIDS[vendor].temp] || 0;
      }
    } catch (e) { }

    session.close();

    // Process uptime
    let uptimeVal = result[oids[0]];
    let uptimeStr = uptimeVal ? Math.floor(uptimeVal / 100) + ' seconds' : 'Unknown';

    return {
      sysName: 'OLT-' + host,
      model: result[oids[1]]?.toString() || vendor.toUpperCase() + ' OLT',
      uptime: uptimeStr,
      version: 'N/A',
      cpu: cpu,
      ram: ram,
      temp: temp
    };
  } catch (err) {
    session.close();
    throw err;
  }
}

async function getPONPorts(config) {
  return []; // Placeholder
}

async function getPONPortTraffic(config) {
  return []; // Placeholder
}

async function getONUsOnPort(config, portIndex) {
  return []; // Placeholder
}

async function getOLTStatistics(config) {
  return { cpu: 0, ram: 0, temp: 0, uptime: '0' }; // Placeholder
}

/**
 * Find ONU by Serial Number and get its status
 * @param {Object} config - SNMP config
 * @param {string} targetSn - Serial Number to find
 */
async function findOnuBySn(config, targetSn) {
  const { host, community = 'public', version = '2c', port = 161, vendor = 'zte' } = config;
  const session = createSession(host, community, version, port);

  try {
    let snOid, statusOid, rxStartOid;
    // Determine OIDs based on vendor
    if (vendor && OLT_OIDS[vendor]) {
      snOid = OLT_OIDS[vendor].onuSn;
      statusOid = OLT_OIDS[vendor].onuStatus;
      rxStartOid = OLT_OIDS[vendor].onuRxPower;
    } else {
      // Fallback or not supported
      session.close();
      return { success: false, message: 'Vendor not supported for SN search' };
    }

    // 1. Walk SN OID to find the index
    const snItems = await snmpWalk(session, snOid);

    // Normalize target SN (remove colons, uppercase)
    const normalizedTarget = targetSn.replace(/[:-\s]/g, '').toUpperCase();

    let foundIndex = null;
    let foundSn = null;

    for (const item of snItems) {
      let val = item.value;
      if (Buffer.isBuffer(val)) {
        val = val.toString('hex').toUpperCase();
        // Heuristic: check if ASCII
        if (/^[a-zA-Z0-9]+$/.test(item.value.toString())) {
          const ascii = item.value.toString().toUpperCase();
          if (ascii.length >= 8) val = ascii; // Prefer ASCII if looks like SN
        }
      } else {
        val = String(val).toUpperCase();
      }

      // Clean val
      val = val.replace(/[:-\s]/g, '');

      if (val.includes(normalizedTarget) || normalizedTarget.includes(val)) {
        foundIndex = item.oid.substring(snOid.length + 1); // Get suffix
        foundSn = val;
        break;
      }
    }

    if (!foundIndex) {
      session.close();
      return { success: false, message: 'ONT not found on this OLT' };
    }

    // 2. Get Status and Rx Power using index
    const targetStatusOid = `${statusOid}.${foundIndex}`;
    const targetRxOid = `${rxStartOid}.${foundIndex}`;

    const results = await snmpGet(session, [targetStatusOid, targetRxOid]);

    session.close();

    let statusVal = results[targetStatusOid];
    let rxVal = results[targetRxOid];
    let rxDbm = rxVal;

    // Conversion Logic (Approximate)
    if (Math.abs(rxVal) > 1000) rxDbm = rxVal / 100;
    if (rxVal > 60000 || rxVal === 2147483647) rxDbm = -Infinity;

    let statusStr = 'offline';
    if (statusVal === 1) statusStr = 'online';

    return {
      success: true,
      sn: foundSn,
      index: foundIndex,
      status: statusStr,
      rxPower: rxDbm.toFixed(2),
      rawRx: rxVal,
      vendor: vendor
    };

  } catch (err) {
    session.close();
    return { success: false, message: err.message };
  }
}

/**
 * Set ONU Name/Description on OLT
 * @param {Object} config - SNMP config
 * @param {string} index - ONU Index (from findOnuBySn)
 * @param {string} name - New Name/Description
 */
async function setOnuName(config, index, name) {
  const { host, community = 'private', version = '2c', port = 161, vendor = 'zte' } = config;
  const session = createSession(host, community, version, port);

  try {
    const nameOidBase = OLT_OIDS[vendor]?.onuName;

    if (!nameOidBase) {
      session.close();
      return { success: false, message: 'Write not supported for this vendor' };
    }

    const targetOid = `${nameOidBase}.${index}`;

    // Sanitize name: remove special chars, limit length
    const safeName = name.replace(/[^a-zA-Z0-9\s-_]/g, '').substring(0, 30);

    await new Promise((resolve, reject) => {
      session.set([{
        oid: targetOid,
        type: snmp.ObjectType.OctetString,
        value: safeName
      }], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    session.close();
    return { success: true, message: `ONU Name updated to ${safeName}` };

  } catch (err) {
    session.close();
    return { success: false, message: err.message };
  }
}

/**
 * Get List of all ONUs on the OLT with details
 * @param {Object} config - SNMP config
 * @returns {Promise<Array>} List of ONUs
 */
async function getOnuList(config) {
  const { host, community = 'public', version = '2c', port = 161, vendor = 'zte' } = config;

  // Create session with longer timeout for walks
  const options = {
    port: port,
    retries: 2,
    timeout: 15000, // 15 seconds
    transport: 'udp4',
    trapPort: 162,
    version: version === '2c' ? snmp.Version2c : snmp.Version1
  };
  const session = snmp.createSession(host, community, options);

  try {
    if (!OLT_OIDS[vendor]) {
      session.close();
      throw new Error('Vendor not supported: ' + vendor);
    }

    const { onuSn, onuStatus, onuRxPower, onuName, onuDistance, onuTemperature } = OLT_OIDS[vendor];

    console.log(`[OLT Monitor] Walking OIDs for ${vendor} on ${host}:`);
    console.log(`  - onuSn: ${onuSn}`);
    console.log(`  - onuStatus: ${onuStatus}`);
    console.log(`  - onuRxPower: ${onuRxPower}`);
    console.log(`  - onuName: ${onuName}`);
    if (onuDistance) console.log(`  - onuDistance: ${onuDistance}`);
    if (onuTemperature) console.log(`  - onuTemperature: ${onuTemperature}`);

    // Sequential walks for better debugging
    let snList = [], statusList = [], rxList = [], nameList = [], distList = [], tempList = [];

    try {
      snList = await snmpWalk(session, onuSn);
      console.log(`[OLT Monitor] SN Walk returned ${snList.length} items`);
    } catch (e) {
      console.error(`[OLT Monitor] SN Walk failed: ${e.message}`);
    }

    try {
      statusList = await snmpWalk(session, onuStatus);
      console.log(`[OLT Monitor] Status Walk returned ${statusList.length} items`);
    } catch (e) {
      console.error(`[OLT Monitor] Status Walk failed: ${e.message}`);
    }

    // --- Hioso Optimization: Walk only Name and Status, others on-demand ---
    const useOnDemandProbe = (vendor === 'hioso' || vendor === 'hsgq');

    try {
      if (!useOnDemandProbe) {
        rxList = await snmpWalk(session, onuRxPower);
        console.log(`[OLT Monitor] RxPower Walk returned ${rxList.length} items`);
      }
    } catch (e) {
      console.error(`[OLT Monitor] RxPower Walk failed: ${e.message}`);
    }


    try {
      nameList = await snmpWalk(session, onuName);
      console.log(`[OLT Monitor] Name Walk returned ${nameList.length} items`);
    } catch (e) {
      console.error(`[OLT Monitor] Name Walk failed: ${e.message}`);
    }

    if (onuDistance && !useOnDemandProbe) {
      try {
        distList = await snmpWalk(session, onuDistance);
        console.log(`[OLT Monitor] Distance Walk returned ${distList.length} items`);
      } catch (e) {
        console.error(`[OLT Monitor] Distance Walk failed: ${e.message}`);
      }
    }

    if (onuTemperature && !useOnDemandProbe) {
      try {
        tempList = await snmpWalk(session, onuTemperature);
        console.log(`[OLT Monitor] Temperature Walk returned ${tempList.length} items`);
      } catch (e) {
        console.error(`[OLT Monitor] Temperature Walk failed: ${e.message}`);
      }
    }

    // session.close() moved to end

    // Map by index suffix
    const onuMap = {};

    // Helper to extract suffix
    const getSuffix = (oid, baseOid) => oid.substring(baseOid.length + 1);

    // Limit to reasonable number to prevent memory issues
    const maxItems = 1000;
    const limitedSnList = snList.slice(0, maxItems);

    console.log(`[OLT Monitor] Processing ${limitedSnList.length} ONUs (limited from ${snList.length})`);

    limitedSnList.forEach(item => {
      const suffix = getSuffix(item.oid, onuSn);
      // Format SN (MAC address for HSGQ EPON)
      let val = item.value;
      if (Buffer.isBuffer(val)) {
        // Check if it looks like a MAC (6 bytes)
        if (val.length === 6) {
          val = Array.from(val).map(b => b.toString(16).padStart(2, '0')).join(':');
        } else {
          val = val.toString('hex').toUpperCase();
          if (/^[a-zA-Z0-9]+$/.test(item.value.toString())) {
            const ascii = item.value.toString().toUpperCase();
            if (ascii.length >= 8) val = ascii;
          }
        }
      }
      val = String(val || '').replace(/[:-\s]/g, '').toUpperCase();
      // Add colons back for readability if it looks like MAC
      if (val.length === 12 && (vendor === 'hsgq' || vendor === 'hioso')) {
        val = val.match(/.{1,2}/g).join(':');
      }

      onuMap[suffix] = {
        index: suffix,
        sn: val, // MAC/SN
        status: 'offline', // default
        rxPower: '-',
        rxRaw: 0,
        name: '-',
        distance: '-',
        temperature: '-'
      };
    });

    // Merge Status
    statusList.forEach(item => {
      let suffix = getSuffix(item.oid, onuStatus);
      if (vendor === 'hsgq' && suffix.endsWith('.0.0')) suffix = suffix.replace('.0.0', '');

      if (onuMap[suffix]) {
        let status = 'offline';
        if (vendor === 'hsgq') {
          // 1=Online, 2=Offline/Initial
          status = (item.value === 1) ? 'online' : 'offline';
        } else {
          status = (item.value === 1) ? 'online' : 'offline';
        }
        onuMap[suffix].status = status;
      }
    });

    // Merge Rx Power
    rxList.forEach(item => {
      let suffix = getSuffix(item.oid, onuRxPower);
      if (vendor === 'hsgq' && suffix.endsWith('.0.0')) suffix = suffix.replace('.0.0', '');

      if (onuMap[suffix]) {
        let val = item.value;
        let rxDbm = parseFloat(val);
        // Basic conversion heuristic
        if (!isNaN(rxDbm)) {
          // HSGQ EPON returns integer like -1619 for -16.19
          if (vendor === 'hsgq') rxDbm = rxDbm / 100;
          else if (Math.abs(rxDbm) > 1000) rxDbm = rxDbm / 100;

          if (rxDbm > 60000 || val === 2147483647) rxDbm = -Infinity;

          onuMap[suffix].rxRaw = val;
          onuMap[suffix].rxPower = (rxDbm === -Infinity || isNaN(rxDbm)) ? '-' : rxDbm.toFixed(2);
        }
      }
    });

    // Merge Name
    for (const item of nameList) {
      let suffix = getSuffix(item.oid, onuName);
      if (vendor === 'hsgq' && suffix.endsWith('.0.0')) suffix = suffix.replace('.0.0', '');

      if (onuMap[suffix]) {
        const name = item.value.toString();
        onuMap[suffix].name = name;



        // For HSGQ EPON, derive logical ID from index
        if (vendor === 'hsgq') {
          const idx = parseInt(suffix);
          if (!isNaN(idx)) {
            // Heuristic: 16777473 (0x1000101) -> 1/1
            const port = (idx >> 8) & 0xFF;
            const id = idx & 0xFF;
            if (id > 0) onuMap[suffix].index = `${port}/${id}`;
          }
        }
      }
    }

    // Ensure rawIndex is always available
    Object.keys(onuMap).forEach(k => {
      onuMap[k].rawIndex = k;
    });

    // Merge Distance (if available)
    if (distList.length > 0) {
      distList.forEach(item => {
        let suffix = getSuffix(item.oid, onuDistance);
        if (vendor === 'hsgq' && suffix.endsWith('.0.0')) suffix = suffix.replace('.0.0', '');
        if (onuMap[suffix]) {
          onuMap[suffix].distance = item.value.toString() + 'm';
        }
      });
    }

    // Merge Temperature
    if (tempList.length > 0) {
      tempList.forEach(item => {
        let suffix = getSuffix(item.oid, onuTemperature);
        if (vendor === 'hsgq' && suffix.endsWith('.0.0')) suffix = suffix.replace('.0.0', '');

        if (onuMap[suffix]) {
          // Skip if ONU is offline (HSGQ specific request)
          if (vendor === 'hsgq' && onuMap[suffix].status !== 'online') {
            onuMap[suffix].temperature = '-';
            return;
          }

          let raw = item.value;
          let tempNum = 0;

          // 1. Convert Raw to Number safely
          if (Buffer.isBuffer(raw)) {
            // HSGQ .10 OID returns Strings like "53c", "38c", "00"
            if (vendor === 'hsgq') {
              const strVal = raw.toString().toLowerCase().replace(/[c\s]/g, '');
              tempNum = parseFloat(strVal);
            } else if (raw.length > 0 && raw.length <= 4) {
              // Try Integer decode
              tempNum = raw.readUIntBE(0, raw.length);
            } else {
              // Try string parse
              tempNum = parseFloat(raw.toString());
            }
          } else {
            // String or Number
            if (typeof raw === 'string' && vendor === 'hsgq') {
              tempNum = parseFloat(raw.toLowerCase().replace(/[c\s]/g, ''));
            } else {
              tempNum = parseFloat(raw);
            }
          }

          // 2. Validate Number
          if (isNaN(tempNum)) tempNum = 0;

          // 3. Apply Vendor Scaling
          if (vendor === 'hsgq') {
            // No extra scaling needed for .10 string values
          } else if (tempNum > 100) {
            tempNum = tempNum / 100;
          }

          onuMap[suffix].temperature = `${tempNum.toFixed(2)}°C`;
        }
      });
    }

    // --- Hioso On-Demand Probe Logic ---
    if (useOnDemandProbe) {
      console.log(`[OLT Monitor] Starting Hioso On-Demand Probe for Metrics...`);
      const targetSuffixes = Object.keys(onuMap).filter(s => onuMap[s].status === 'online');

      const oidsToGet = [];
      const oidMap = {}; // mapping OID string -> { suffix, type }

      targetSuffixes.forEach(s => {
        if (onuDistance) {
          let o = `${onuDistance}.${s}`; // HSGQ Distance uses simple index (s)
          oidsToGet.push(o);
          oidMap[o] = { suffix: s, type: 'dist' };
        }
        // Force Probe Temperature for Online Hioso
        if (vendor === 'hioso') {
          const tempBase = '1.3.6.1.4.1.25355.3.2.6.14.2.1.7';
          const o = `${tempBase}.${s}`;
          oidsToGet.push(o);
          oidMap[o] = { suffix: s, type: 'temp' };
        }
        // HSGQ Temperature (MAC-based OID)
        // HSGQ Temperature (Col 8 in Diag Table)
        else if (vendor === 'hsgq') {
          const tempBase = '1.3.6.1.4.1.50224.3.3.3.1.8';
          let o = `${tempBase}.${s}`;
          if (!o.endsWith('.0.0')) o += '.0.0';
          oidsToGet.push(o);
          oidMap[o] = { suffix: s, type: 'temp' };
        }

        // Force Re-Probe RxPower
        let oIdx = `${onuRxPower}.${s}`;
        if (vendor === 'hsgq') oIdx += '.0.0';
        oidsToGet.push(oIdx);
        oidMap[oIdx] = { suffix: s, type: 'rx' };
      });

      console.log(`[OLT Monitor] Probing ${oidsToGet.length} OIDs for ${targetSuffixes.length} Online ONUs...`);

      const chunkSize = 40;
      const chunkPromises = [];

      for (let i = 0; i < oidsToGet.length; i += chunkSize) {
        const chunk = oidsToGet.slice(i, i + chunkSize);

        const p = new Promise((resolve) => {
          session.get(chunk, (err, vbs) => {
            if (err && !vbs) resolve([]);
            else resolve(vbs || []);
          });
        }).then(varbinds => {
          varbinds.forEach(vb => {
            if (snmp.isVarbindError(vb)) {
              if (vendor === 'hsgq' && vb.oid.includes('.4.1.1.4.1.')) {
                console.log(`[HSGQ Temp Error] ${vb.oid}: ${snmp.varbindError(vb)}`);
              }
              return;
            }
            const meta = oidMap[vb.oid];
            if (!meta) return;

            const val = vb.value;
            if (meta.type === 'dist') {
              onuMap[meta.suffix].distance = val.toString() + 'm';
            } else if (meta.type === 'temp') {
              let t = parseFloat(val.toString());
              if (vendor === 'hsgq') {
                console.log(`[HSGQ Temp] ${vb.oid} = ${val} -> ${t}`);
                if (t > 100) t = t / 100;
              }
              if (!isNaN(t)) onuMap[meta.suffix].temperature = `${t.toFixed(2)}°C`;
            } else if (meta.type === 'temp_debug') {
              console.log(`[HSGQ DEBUG HIT] ${vb.oid} = ${val}`);
              let t = parseFloat(val.toString());
              if (t > 100) t = t / 100;
              if (!isNaN(t)) onuMap[meta.suffix].temperature = `${t.toFixed(2)}°C`;
            } else if (meta.type === 'rx') {
              let rxStr = val.toString();
              let rx = parseFloat(rxStr);
              if (!isNaN(rx)) {
                if (vendor === 'hsgq') rx = rx / 100;
                if (Math.abs(rx) > 1000) rx = rx / 100;
                onuMap[meta.suffix].rxPower = rx.toFixed(2);
              }
            }
          });
        }).catch(e => {
          console.error(`[OLT Monitor] Probe chunk error: ${e.message}`);
        });

        chunkPromises.push(p);
      }

      await Promise.all(chunkPromises);
    }

    console.log(`[OLT Monitor] Returning ${Object.keys(onuMap).length} ONUs`);
    return Object.values(onuMap);

  } catch (err) {
    console.error(`[OLT Monitor] Error in getOnuList: ${err.message}`);
    try { session.close(); } catch (e) { }
    throw err;
  }
}

/**
 * Reboot ONU
 * @param {Object} config - SNMP config
 * @param {string} index - ONU Index
 * @param {string} sn - Serial Number (MAC for HSGQ) - Required for some OIDs
 */
async function rebootOnu(config, index, sn) {
  const { host, community = 'private', version = '2c', port = 161, vendor = 'zte' } = config;
  const session = createSession(host, community, version, port);

  try {
    let targetOid = null;
    let type = snmp.ObjectType.Integer;
    let value = 1; // Default

    if (vendor === 'hsgq') {
      // OID: .1.3.6.1.4.1.50224.3.1.1.8.1.[MAC] i 2
      // Need to convert SN (MAC string) to decimal suffix
      if (!sn) throw new Error('Serial Number (MAC) required for HSGQ reboot');

      const macClean = sn.replace(/[:\s]/g, '');
      const bytes = [];
      for (let i = 0; i < macClean.length; i += 2) {
        bytes.push(parseInt(macClean.substr(i, 2), 16));
      }
      const suffix = bytes.join('.');
      targetOid = `1.3.6.1.4.1.50224.3.1.1.8.1.${suffix}`;
      value = 2; // Reboot action
    } else {
      throw new Error(`Reboot not supported for vendor: ${vendor}`);
    }

    console.log(`[OLT Reboot] Sending reboot to ${host} OID: ${targetOid} Value: ${value}`);

    await new Promise((resolve, reject) => {
      session.set([{
        oid: targetOid,
        type: type,
        value: value
      }], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    session.close();
    return { success: true, message: 'Reboot command accepted by OLT.' };

  } catch (err) {
    session.close();
    console.error(`[OLT Reboot] Error: ${err.message}`);
    const msg = err.message || 'Unknown Error';
    // Friendly error for common cases
    if (msg.includes('Timeout')) return { success: false, message: 'OLT did not respond (Timeout). Check connection or Write Community.' };
    if (msg.includes('NoSuch')) return { success: false, message: 'Reboot OID not found on this device (Firmware mismatch?).' };

    return { success: false, message: `SNMP Error: ${msg}` };
  }
}

module.exports = {
  getOLTDeviceInfo,
  getPONPorts,
  getPONPortTraffic,
  getONUsOnPort,
  getOLTStatistics,
  findOnuBySn,
  setOnuName,
  getOnuList,
  rebootOnu,
  OLT_OIDS
};
