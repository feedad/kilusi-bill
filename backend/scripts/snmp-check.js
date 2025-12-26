#!/usr/bin/env node
// Quick SNMP connectivity check using settings.json
// Prints sysName/sysDescr/uptime and lists first few interfaces

const snmpMonitor = require('../config/snmp-monitor');
const { getSetting } = require('../config/settingsManager');

(async () => {
  const host = getSetting('snmp_host', '');
  const community = getSetting('snmp_community', 'public');
  const version = getSetting('snmp_version', '2c');
  const port = getSetting('snmp_port', '161');
  const iface = getSetting('snmp_interface', getSetting('main_interface', 'ether1'));

  if (!host) {
    console.error('SNMP host is not configured in settings.json (snmp_host)');
    process.exit(2);
  }

  console.log(`SNMP check to ${host}:${port} community='${community}' version='${version}'`);

  try {
    const info = await snmpMonitor.getDeviceInfo({ host, community, version, port });
    console.log('Device info:');
    console.log(`  sysName:  ${info.sysName}`);
    console.log(`  sysDescr: ${info.sysDescr?.toString().slice(0, 120)}`);
    console.log(`  upTime:   ${info.sysUpTimeSeconds != null ? info.sysUpTimeSeconds + 's' : 'n/a'}`);
  } catch (e) {
    console.error('Failed to get device info:', e.message || e);
  }

  try {
    const list = await snmpMonitor.listInterfaces({ host, community, version, port });
    console.log(`Interfaces (${list.length}):`);
    list.slice(0, 20).forEach(i => {
      console.log(`  #${i.index} name='${i.name}' descr='${i.descr}'`);
    });
    if (list.length > 20) console.log(`  ...and ${list.length - 20} more`);
  } catch (e) {
    console.error('Failed to list interfaces:', e.message || e);
  }

  try {
    const traffic = await snmpMonitor.getInterfaceTraffic({ host, community, version, port, interfaceName: iface });
    console.log(`Traffic for '${iface}': rx=${Math.round(traffic.in_bps)} bps, tx=${Math.round(traffic.out_bps)} bps`);
  } catch (e) {
    console.error('Failed to read traffic:', e.message || e);
  }
})();
