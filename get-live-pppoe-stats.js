/**
 * Get live PPPoE session statistics from MikroTik via SNMP
 * This provides real-time traffic data that RouterOS 7.x doesn't send via RADIUS Interim-Update
 */

const snmp = require('net-snmp');

// MikroTik SNMP configuration
const MIKROTIK_IP = '172.22.10.156';
const SNMP_COMMUNITY = 'public'; // Change this to your SNMP community string
const SNMP_VERSION = snmp.Version2c;

/**
 * Get PPPoE interface statistics from MikroTik
 */
async function getPPPoEStats() {
    return new Promise((resolve, reject) => {
        const session = snmp.createSession(MIKROTIK_IP, SNMP_COMMUNITY, {
            version: SNMP_VERSION,
            timeout: 5000
        });

        // OIDs for interface data
        const oids = [
            '1.3.6.1.2.1.2.2.1.2',   // ifDescr - interface names
            '1.3.6.1.2.1.2.2.1.10',  // ifInOctets - bytes received
            '1.3.6.1.2.1.2.2.1.16',  // ifOutOctets - bytes sent
            '1.3.6.1.2.1.31.1.1.1.6', // ifHCInOctets - 64-bit counter for received
            '1.3.6.1.2.1.31.1.1.1.10' // ifHCOutOctets - 64-bit counter for sent
        ];

        session.walk('1.3.6.1.2.1.2.2.1', (error, varbinds) => {
            if (error) {
                console.error('SNMP Error:', error);
                session.close();
                reject(error);
                return;
            }

            const interfaces = {};
            
            varbinds.forEach(vb => {
                const oid = vb.oid;
                const value = vb.value;
                
                // Parse OID to get interface index and type
                const parts = oid.split('.');
                const ifIndex = parts[parts.length - 1];
                
                if (!interfaces[ifIndex]) {
                    interfaces[ifIndex] = {};
                }
                
                // Determine what data this is
                if (oid.includes('.2.2.1.2.')) {
                    // Interface name/description
                    interfaces[ifIndex].name = value.toString();
                } else if (oid.includes('.2.2.1.10.')) {
                    // Bytes received (32-bit)
                    interfaces[ifIndex].rxBytes = parseInt(value);
                } else if (oid.includes('.2.2.1.16.')) {
                    // Bytes sent (32-bit)
                    interfaces[ifIndex].txBytes = parseInt(value);
                }
            });

            // Filter only PPPoE interfaces (usually named like <pppoe-username>)
            const pppoeInterfaces = Object.values(interfaces).filter(iface => 
                iface.name && iface.name.startsWith('<') && iface.name.endsWith('>')
            );

            session.close();
            resolve(pppoeInterfaces);
        });
    });
}

/**
 * Combine database session data with live SNMP stats
 */
async function getEnhancedActiveSessions() {
    const db = require('./config/database');
    const radiusDb = require('./config/radius-postgres');
    
    // Get sessions from database
    const dbSessions = await radiusDb.getActiveSessions();
    
    // Get live stats from MikroTik
    let liveStats = [];
    try {
        liveStats = await getPPPoEStats();
    } catch (error) {
        console.warn('Could not get live stats from MikroTik:', error.message);
    }
    
    // Enhance database sessions with live stats
    const enhancedSessions = dbSessions.map(session => {
        // Find matching live interface (username format: <username>)
        const liveInterface = liveStats.find(iface => 
            iface.name === `<${session.username}>`
        );
        
        if (liveInterface) {
            return {
                ...session,
                // Use live stats for current traffic
                acctInputOctets: liveInterface.rxBytes || session.acctInputOctets,
                acctOutputOctets: liveInterface.txBytes || session.acctOutputOctets,
                // Calculate live duration
                acctSessionTime: Math.floor((Date.now() - new Date(session.acctStartTime).getTime()) / 1000),
                isLive: true
            };
        }
        
        return {
            ...session,
            isLive: false
        };
    });
    
    return enhancedSessions;
}

// Test if running directly
if (require.main === module) {
    (async () => {
        console.log('🔍 Fetching live PPPoE statistics from MikroTik...\n');
        
        try {
            const sessions = await getEnhancedActiveSessions();
            
            console.log(`✅ Found ${sessions.length} active session(s):\n`);
            
            sessions.forEach((s, i) => {
                const duration = s.acctSessionTime || 0;
                const download = s.acctInputOctets || 0;
                const upload = s.acctOutputOctets || 0;
                
                const durationStr = duration >= 60 
                    ? `${Math.floor(duration/60)}m ${duration%60}s`
                    : `${duration}s`;
                
                const downloadStr = download >= 1024*1024
                    ? `${(download/1024/1024).toFixed(2)} MB`
                    : download >= 1024
                    ? `${(download/1024).toFixed(2)} KB`
                    : `${download} B`;
                    
                const uploadStr = upload >= 1024*1024
                    ? `${(upload/1024/1024).toFixed(2)} MB`
                    : upload >= 1024
                    ? `${(upload/1024).toFixed(2)} KB`
                    : `${upload} B`;
                
                console.log(`${i+1}. 👤 ${s.username} ${s.isLive ? '🔴 LIVE' : '⚪️ DB-only'}`);
                console.log(`   Session: ${s.acctSessionId}`);
                console.log(`   IP: ${s.framedIpAddress}`);
                console.log(`   ⏱️  Duration: ${durationStr}`);
                console.log(`   ⬇️  Download: ${downloadStr}`);
                console.log(`   ⬆️  Upload: ${uploadStr}`);
                console.log('');
            });
        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
        
        process.exit(0);
    })();
}

module.exports = {
    getPPPoEStats,
    getEnhancedActiveSessions
};
