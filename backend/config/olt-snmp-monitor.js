const snmp = require('net-snmp');
const logger = require('./logger');

// OLT SNMP OIDs (Common untuk berbagai vendor OLT)
const OLT_OIDS = {
  // System Info
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  
  // Interface Statistics (untuk PON ports)
  ifDescr: '1.3.6.1.2.1.2.2.1.2',          // Interface description
  ifType: '1.3.6.1.2.1.2.2.1.3',           // Interface type
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',          // Interface speed
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',     // Operational status (1=up, 2=down)
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',      // RX bytes
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',     // TX bytes
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',  // 64-bit RX counter
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10', // 64-bit TX counter
  
  // PON-specific OIDs (vendor-specific, perlu disesuaikan)
  // Untuk ZTE OLT
  zte: {
    onuCount: '1.3.6.1.4.1.3902.1012.3.28.1.1.2', // Jumlah ONU per PON port
    onuStatus: '1.3.6.1.4.1.3902.1012.3.28.2.1.3', // Status ONU
    onuRxPower: '1.3.6.1.4.1.3902.1012.3.28.2.1.25', // RX power ONU
    onuDistance: '1.3.6.1.4.1.3902.1012.3.28.2.1.8', // Distance ONU
  },
  
  // Untuk Huawei OLT
  huawei: {
    onuCount: '1.3.6.1.4.1.2011.6.128.1.1.2.43.1.3',
    onuStatus: '1.3.6.1.4.1.2011.6.128.1.1.2.46.1.15',
    onuRxPower: '1.3.6.1.4.1.2011.6.128.1.1.2.51.1.4',
    onuDistance: '1.3.6.1.4.1.2011.6.128.1.1.2.53.1.1',
  },
  
  // Untuk C-Data OLT (FD1000 series)
  cdata: {
    onuCount: '1.3.6.1.4.1.34592.1.3.4.1.2.1.1.13', // ONU count per PON
    onuStatus: '1.3.6.1.4.1.34592.1.3.4.1.5.1.1.2', // ONU status (1=online)
    onuRxPower: '1.3.6.1.4.1.34592.1.3.4.1.5.1.1.8', // ONU RX power
    onuDistance: '1.3.6.1.4.1.34592.1.3.4.1.5.1.1.9', // ONU distance
    ponIfIndex: '1.3.6.1.4.1.34592.1.3.4.1.2.1.1.1', // PON interface index
  },
  
  // Untuk HIOSO OLT
  hioso: {
    onuCount: '1.3.6.1.4.1.6688.1.1.1.4.2.1.1.8', // ONU count
    onuStatus: '1.3.6.1.4.1.6688.1.1.1.4.2.3.1.3', // ONU status
    onuRxPower: '1.3.6.1.4.1.6688.1.1.1.4.2.3.1.11', // ONU RX power
    onuDistance: '1.3.6.1.4.1.6688.1.1.1.4.2.3.1.12', // ONU distance
    ponDescription: '1.3.6.1.4.1.6688.1.1.1.4.2.1.1.2', // PON description
  },
  
  // Untuk HSGQ OLT (Guangzhou Shengxi)
  hsgq: {
    onuCount: '1.3.6.1.4.1.5875.800.128.30.1.3.2.1.5', // ONU count per slot/port
    onuStatus: '1.3.6.1.4.1.5875.800.128.30.1.3.3.1.4', // ONU operational status
    onuRxPower: '1.3.6.1.4.1.5875.800.128.30.1.3.3.1.15', // ONU RX power (dBm)
    onuDistance: '1.3.6.1.4.1.5875.800.128.30.1.3.3.1.13', // ONU distance (m)
    onuType: '1.3.6.1.4.1.5875.800.128.30.1.3.3.1.7', // ONU type
  }
};

/**
 * Create SNMP session
 */
function createSession(host, community = 'public', version = '2c', port = 161) {
  const options = {
    port: parseInt(port, 10),
    retries: 1,
    timeout: 5000
  };
  
  const snmpVersion = version === '1' ? snmp.Version1 : snmp.Version2c;
  return snmp.createSession(host, community, options);
}

/**
 * Get single or multiple OID values
 */
function snmpGet(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (err, varbinds) => {
      if (err) return reject(err);
      const res = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) return reject(new Error(snmp.varbindError(vb)));
        
        // Handle 64-bit counters (Counter64) which come as Buffer
        let value = vb.value;
        if (Buffer.isBuffer(value)) {
          try {
            if (value.length === 8) {
              value = Number(value.readBigUInt64BE(0));
            } else if (value.length === 4) {
              value = value.readUInt32BE(0);
            } else {
              // Fallback: convert buffer to hex string then to number
              value = parseInt(value.toString('hex'), 16);
            }
          } catch (e) {
            logger.warn(`Failed to parse buffer value for OID ${vb.oid}, using raw value`);
            value = Number(vb.value);
          }
        }
        
        res[vb.oid] = value;
      }
      resolve(res);
    });
  });
}

/**
 * Walk SNMP tree
 */
function snmpWalk(session, baseOid) {
  return new Promise((resolve, reject) => {
    const items = [];
    session.subtree(baseOid, (varbinds) => {
      const arr = Array.isArray(varbinds) ? varbinds : [varbinds];
      for (const vb of arr) {
        if (snmp.isVarbindError(vb)) continue;
        if (!vb || typeof vb.oid !== 'string') continue;
        
        // Handle Buffer values
        let value = vb.value;
        if (Buffer.isBuffer(value)) {
          try {
            if (value.length === 8) {
              value = Number(value.readBigUInt64BE(0));
            } else if (value.length === 4) {
              value = value.readUInt32BE(0);
            } else {
              // Try to convert to string if it looks like text
              const str = value.toString('utf8');
              value = /^[\x20-\x7E]+$/.test(str) ? str : parseInt(value.toString('hex'), 16);
            }
          } catch (e) {
            value = vb.value;
          }
        }
        
        items.push({ oid: vb.oid, value });
      }
    }, (err) => {
      if (err) return reject(err);
      resolve(items);
    });
  });
}

/**
 * Get OLT device info
 */
async function getOLTDeviceInfo(config) {
  const { host, community = 'public', version = '2c', port = 161 } = config;
  
  const session = createSession(host, community, version, port);
  
  try {
    const oids = [
      OLT_OIDS.sysDescr,
      OLT_OIDS.sysUpTime,
      OLT_OIDS.sysName,
      OLT_OIDS.sysLocation
    ];
    
    const result = await snmpGet(session, oids);
    
    // Convert uptime from timeticks to readable format
    const uptimeTicks = result[OLT_OIDS.sysUpTime] || 0;
    const uptimeSeconds = Math.floor(uptimeTicks / 100);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    session.close();
    
    return {
      success: true,
      deviceName: String(result[OLT_OIDS.sysName] || 'Unknown'),
      description: String(result[OLT_OIDS.sysDescr] || 'Unknown'),
      location: String(result[OLT_OIDS.sysLocation] || 'Not set'),
      uptime: `${days}d ${hours}h ${minutes}m`,
      uptimeSeconds
    };
  } catch (error) {
    session.close();
    logger.error(`Failed to get OLT device info from ${host}: ${error.message}`);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get PON ports list with status
 */
async function getPONPorts(config) {
  const { host, community = 'public', version = '2c', port = 161 } = config;
  
  const session = createSession(host, community, version, port);
  
  try {
    // Walk interface descriptions
    const ifDescrItems = await snmpWalk(session, OLT_OIDS.ifDescr);
    const ifStatusItems = await snmpWalk(session, OLT_OIDS.ifOperStatus);
    
    // Map status by index
    const statusMap = {};
    ifStatusItems.forEach(item => {
      const parts = item.oid.split('.');
      const index = parts[parts.length - 1];
      statusMap[index] = item.value;
    });
    
    // Filter PON interfaces
    const ponPorts = [];
    ifDescrItems.forEach(item => {
      const descr = String(item.value);
      const parts = item.oid.split('.');
      const index = parts[parts.length - 1];
      
      // Check if it's a PON port (common naming: GPON, EPON, pon, PON)
      if (/pon|PON|GPON|EPON/i.test(descr)) {
        const status = statusMap[index];
        ponPorts.push({
          index: parseInt(index),
          name: descr,
          status: status === 1 ? 'up' : 'down',
          operStatus: status
        });
      }
    });
    
    session.close();
    
    return {
      success: true,
      ports: ponPorts,
      total: ponPorts.length
    };
  } catch (error) {
    session.close();
    logger.error(`Failed to get PON ports from ${host}: ${error.message}`);
    return {
      success: false,
      message: error.message,
      ports: []
    };
  }
}

/**
 * Get PON port traffic statistics
 */
async function getPONPortTraffic(config, portIndex) {
  const { host, community = 'public', version = '2c', port = 161 } = config;
  
  const session = createSession(host, community, version, port);
  
  try {
    const inOid = `${OLT_OIDS.ifHCInOctets}.${portIndex}`;
    const outOid = `${OLT_OIDS.ifHCOutOctets}.${portIndex}`;
    
    const result = await snmpGet(session, [inOid, outOid]);
    
    session.close();
    
    return {
      success: true,
      rxBytes: result[inOid] || 0,
      txBytes: result[outOid] || 0
    };
  } catch (error) {
    session.close();
    logger.error(`Failed to get PON port traffic: ${error.message}`);
    return {
      success: false,
      rxBytes: 0,
      txBytes: 0
    };
  }
}

/**
 * Get ONUs on a specific PON port (vendor-specific)
 */
async function getONUsOnPort(config, portIndex) {
  const { host, community = 'public', version = '2c', port = 161, vendor = 'generic' } = config;
  
  const session = createSession(host, community, version, port);
  
  try {
    let onuData = [];
    
    if (vendor.toLowerCase() === 'zte') {
      // ZTE-specific ONU discovery
      const onuStatusOid = `${OLT_OIDS.zte.onuStatus}.${portIndex}`;
      const onuItems = await snmpWalk(session, onuStatusOid);
      
      onuData = onuItems.map(item => {
        const parts = item.oid.split('.');
        const onuId = parts[parts.length - 1];
        return {
          id: onuId,
          status: item.value === 1 ? 'online' : 'offline',
          portIndex
        };
      });
    } else if (vendor.toLowerCase() === 'huawei') {
      // Huawei-specific ONU discovery
      const onuStatusOid = `${OLT_OIDS.huawei.onuStatus}.${portIndex}`;
      const onuItems = await snmpWalk(session, onuStatusOid);
      
      onuData = onuItems.map(item => {
        const parts = item.oid.split('.');
        const onuId = parts[parts.length - 1];
        return {
          id: onuId,
          status: item.value === 1 ? 'online' : 'offline',
          portIndex
        };
      });
    } else if (vendor.toLowerCase() === 'c-data' || vendor.toLowerCase() === 'cdata') {
      // C-Data OLT ONU discovery
      const onuStatusOid = `${OLT_OIDS.cdata.onuStatus}.${portIndex}`;
      const onuItems = await snmpWalk(session, onuStatusOid);
      
      onuData = onuItems.map(item => {
        const parts = item.oid.split('.');
        const onuId = parts[parts.length - 1];
        return {
          id: onuId,
          status: item.value === 1 ? 'online' : 'offline',
          portIndex,
          vendor: 'C-Data'
        };
      });
    } else if (vendor.toLowerCase() === 'hioso') {
      // HIOSO OLT ONU discovery
      const onuStatusOid = `${OLT_OIDS.hioso.onuStatus}.${portIndex}`;
      const onuItems = await snmpWalk(session, onuStatusOid);
      
      onuData = onuItems.map(item => {
        const parts = item.oid.split('.');
        const onuId = parts[parts.length - 1];
        // HIOSO: 1=online, 2=offline, 3=los (loss of signal)
        let status = 'offline';
        if (item.value === 1) status = 'online';
        else if (item.value === 3) status = 'los';
        
        return {
          id: onuId,
          status,
          portIndex,
          vendor: 'HIOSO'
        };
      });
    } else if (vendor.toLowerCase() === 'hsgq') {
      // HSGQ OLT ONU discovery
      const onuStatusOid = `${OLT_OIDS.hsgq.onuStatus}.${portIndex}`;
      const onuItems = await snmpWalk(session, onuStatusOid);
      
      onuData = onuItems.map(item => {
        const parts = item.oid.split('.');
        const onuId = parts[parts.length - 1];
        // HSGQ: 1=up, 2=down
        const status = item.value === 1 ? 'online' : 'offline';
        
        return {
          id: onuId,
          status,
          portIndex,
          vendor: 'HSGQ'
        };
      });
    } else {
      // Generic - return placeholder
      logger.warn(`Generic vendor mode - ONU discovery not supported. Vendor: ${vendor}`);
      onuData = [];
    }
    
    session.close();
    
    return {
      success: true,
      onus: onuData,
      total: onuData.length
    };
  } catch (error) {
    session.close();
    logger.error(`Failed to get ONUs on port ${portIndex}: ${error.message}`);
    return {
      success: false,
      onus: [],
      message: error.message
    };
  }
}

/**
 * Get all OLT statistics in one call
 */
async function getOLTStatistics(config) {
  try {
    const [deviceInfo, ponPorts] = await Promise.all([
      getOLTDeviceInfo(config),
      getPONPorts(config)
    ]);
    
    // Get traffic for each port
    const portsWithTraffic = [];
    if (ponPorts.success && ponPorts.ports.length > 0) {
      for (const port of ponPorts.ports) {
        const traffic = await getPONPortTraffic(config, port.index);
        portsWithTraffic.push({
          ...port,
          rxBytes: traffic.rxBytes || 0,
          txBytes: traffic.txBytes || 0
        });
      }
    }
    
    return {
      success: true,
      device: deviceInfo,
      ports: portsWithTraffic,
      totalPorts: portsWithTraffic.length,
      activePorts: portsWithTraffic.filter(p => p.status === 'up').length
    };
  } catch (error) {
    logger.error(`Failed to get OLT statistics: ${error.message}`);
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = {
  getOLTDeviceInfo,
  getPONPorts,
  getPONPortTraffic,
  getONUsOnPort,
  getOLTStatistics,
  OLT_OIDS
};
