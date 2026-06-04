/**
 * Simple SNMP Traffic Test
 * Get interface traffic from Mikrotik via SNMP
 */

const { getSetting } = require('./backend/config/settingsManager');

async function testSNMPTraffic() {
    // Get SNMP settings
    const snmpHost = getSetting('snmp_host', '192.168.99.3');
    const snmpCommunity = getSetting('snmp_community', 'kilusibill');
    const snmpPort = getSetting('snmp_port', '161');
    const snmpVersion = getSetting('snmp_version', '2c');

    console.log('=== SNMP Traffic Test ===');
    console.log(`Host: ${snmpHost}`);
    console.log(`Community: ${snmpCommunity}`);
    console.log(`Port: ${snmpPort}`);
    console.log(`Version: ${snmpVersion}`);
    console.log('');

    // Simple SNMP query using snmp-net if available, or snmpwalk command
    const { exec } = require('child_process');

    try {
        // Method 1: Using snmpwalk command
        console.log('Testing SNMP query for interface traffic...');

        // Get interface descriptions (to find customer interfaces)
        const cmd1 = `snmpwalk -v 2c -c ${snmpCommunity} ${snmpHost}:${snmpPort} 1.3.6.1.2.2.1.2.2.1.7 2>/dev/null | grep -E "ifDescr|STRING:" | head -20`;
        console.log('\n=== Interfaces ===');
        exec(cmd1, (error, stdout, stderr) => {
            if (error) {
                console.log('Error running snmpwalk. Installing net-snmp...');
                // Try apt-get install
            } else {
                console.log(stdout);
            }
        });

        // Get interface stats (in/out octets)
        const cmd2 = `snmpwalk -v 2c -c ${snmpCommunity} ${snmpHost}:${snmpPort} 1.3.6.1.2.2.2.1.10 2>/dev/null | grep -E "ifHCInOctets|ifHCOutOctets|Counter32|Gauge32" | head -40`;
        console.log('\n=== Interface Traffic (In/Out Octets) ===');
        exec(cmd2, (error, stdout, stderr) => {
            if (stdout) {
                console.log(stdout);
            }
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

// Test function to get traffic for specific interface
async function getInterfaceTraffic(interfaceIndex) {
    const { exec } = require('child_process');
    const snmpHost = getSetting('snmp_host', '192.168.99.3');
    const snmpCommunity = getSetting('snmp_community', 'kilusibill');
    const snmpPort = getSetting('snmp_port', '161');

    const cmd = `snmpget -v 2c -c ${snmpCommunity} ${snmpHost}:${snmpPort} 1.3.6.1.2.2.2.1.10.${interfaceIndex} 1.3.6.1.2.2.2.1.16.${interfaceIndex}`;

    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

// Run test
testSNMPTraffic().catch(console.error);
