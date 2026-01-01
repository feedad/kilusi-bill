const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Get PPPoE interface statistics from MikroTik via SNMP
 * @param {string} mikrotikIp - IP address of MikroTik router
 * @param {string} community - SNMP community string (default: 'public')
 * @returns {Promise<Object>} - Object with interface names as keys and stats as values
 */
async function getPPPoEInterfaceStats(mikrotikIp = '172.22.10.156', community = 'public') {
    try {
        const timeout = 2;  // Kurangi timeout jadi 2 detik
        const retries = 0;  // No retry untuk speed
        
        // OID untuk interface table
        const ifIndexOID = '1.3.6.1.2.1.2.2.1.1';      // ifIndex
        const ifDescrOID = '1.3.6.1.2.1.2.2.1.2';      // ifDescr (nama interface)
        const ifInOctetsOID = '1.3.6.1.2.1.2.2.1.10';  // ifInOctets (bytes in/download)
        const ifOutOctetsOID = '1.3.6.1.2.1.2.2.1.16'; // ifOutOctets (bytes out/upload)
        
        // Query semua secara parallel untuk speed
        const [
            { stdout: ifDescrOutput },
            { stdout: ifInOctetsOutput },
            { stdout: ifOutOctetsOutput }
        ] = await Promise.all([
            execPromise(`snmpwalk -v2c -c ${community} -t ${timeout} -r ${retries} ${mikrotikIp} ${ifDescrOID}`),
            execPromise(`snmpwalk -v2c -c ${community} -t ${timeout} -r ${retries} ${mikrotikIp} ${ifInOctetsOID}`),
            execPromise(`snmpwalk -v2c -c ${community} -t ${timeout} -r ${retries} ${mikrotikIp} ${ifOutOctetsOID}`)
        ]);
        
        // Parse output
        const interfaces = {};
        
        // Parse interface names
        const descrLines = ifDescrOutput.trim().split('\n');
        descrLines.forEach(line => {
            // Format: IF-MIB::ifDescr.123 = STRING: pppoe-apptest
            // atau: iso.3.6.1.2.1.2.2.1.2.123 = STRING: "<pppoe-apptest>"
            const match = line.match(/\.2\.1\.2\.(\d+)\s*=\s*STRING:\s*"?<?(.+?)>?"?\s*$/);
            if (match) {
                const ifIndex = match[1];
                const ifName = match[2].trim();
                
                // Hanya ambil interface pppoe-*
                if (ifName.startsWith('pppoe-')) {
                    interfaces[ifIndex] = {
                        name: ifName,
                        username: ifName.replace('pppoe-', ''),
                        inOctets: 0,
                        outOctets: 0
                    };
                }
            }
        });
        
        // Parse InOctets
        const inOctetsLines = ifInOctetsOutput.trim().split('\n');
        inOctetsLines.forEach(line => {
            // Format: IF-MIB::ifInOctets.123 = Counter32: 12345
            // atau: iso.3.6.1.2.1.2.2.1.10.123 = Counter32: 12345
            const match = line.match(/\.2\.1\.10\.(\d+)\s*=\s*Counter32:\s*(\d+)/);
            if (match) {
                const ifIndex = match[1];
                const inOctets = parseInt(match[2]);
                
                if (interfaces[ifIndex]) {
                    interfaces[ifIndex].inOctets = inOctets;
                }
            }
        });
        
        // Parse OutOctets
        const outOctetsLines = ifOutOctetsOutput.trim().split('\n');
        outOctetsLines.forEach(line => {
            // Format: IF-MIB::ifOutOctets.123 = Counter32: 67890
            // atau: iso.3.6.1.2.1.2.2.1.16.123 = Counter32: 67890
            const match = line.match(/\.2\.1\.16\.(\d+)\s*=\s*Counter32:\s*(\d+)/);
            if (match) {
                const ifIndex = match[1];
                const outOctets = parseInt(match[2]);
                
                if (interfaces[ifIndex]) {
                    interfaces[ifIndex].outOctets = outOctets;
                }
            }
        });
        
        // Convert to username-based object
        const result = {};
        Object.values(interfaces).forEach(iface => {
            result[iface.username] = {
                interface: iface.name,
                download: iface.inOctets,  // bytes in = download user
                upload: iface.outOctets    // bytes out = upload user
            };
        });
        
        return result;
        
    } catch (error) {
        console.error('Error getting SNMP data from MikroTik:', error.message);
        return {};
    }
}

/**
 * Enhance active sessions with live SNMP data
 * @param {Array} sessions - Array of session objects from database
 * @param {string} mikrotikIp - IP address of MikroTik router
 * @returns {Promise<Array>} - Enhanced sessions with live traffic data
 */
async function enhanceSessionsWithSNMP(sessions, mikrotikIp = '172.22.10.156') {
    try {
        // Set timeout untuk SNMP query (max 5 detik)
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SNMP timeout after 5 seconds')), 5000)
        );
        
        const snmpPromise = getPPPoEInterfaceStats(mikrotikIp);
        const snmpData = await Promise.race([snmpPromise, timeoutPromise]);
        
        // Enhance each session with SNMP data
        return sessions.map(session => {
            const username = session.username || session.name;
            const snmpStats = snmpData[username];
            
            if (snmpStats) {
                // Use SNMP data for live traffic (lebih akurat)
                return {
                    ...session,
                    acctInputOctets: snmpStats.download,
                    acctOutputOctets: snmpStats.upload,
                    acctinputoctets: snmpStats.download,
                    acctoutputoctets: snmpStats.upload,
                    snmpInterface: snmpStats.interface,
                    dataSource: 'snmp' // flag untuk debugging
                };
            } else {
                // Fallback ke database data
                return {
                    ...session,
                    dataSource: 'database'
                };
            }
        });
        
    } catch (error) {
        console.error('Error enhancing sessions with SNMP:', error.message);
        // Return original sessions on error
        return sessions;
    }
}

module.exports = {
    getPPPoEInterfaceStats,
    enhanceSessionsWithSNMP
};
