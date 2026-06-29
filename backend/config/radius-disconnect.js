const { logger } = require('./logger');
const dgram = require('dgram');
const radius = require('radius');

/**
 * RADIUS Disconnect/CoA (Change of Authorization) Module
 * Handles forcing disconnect of PPPoE users via RADIUS protocol
 *
 * This implementation creates proper RADIUS CoA packets to disconnect users
 * from PPPoE sessions. The disconnect works by sending a Disconnect-Request (40) to the NAS.
 */

class RadiusDisconnect {
    /**
     * Send RADIUS CoA Disconnect Request to NAS
     * Routes through FreeRADIUS CoA proxy at 172.22.10.101:3799 for proper NAS client authorization.
     *
     * @param {Object} params - Disconnect parameters
     * @param {string} params.username - Username to disconnect
     * @param {string} params.nasIp - NAS IP address (used as NAS-IP-Address attribute for proxy routing)
     * @param {string} params.nasSecret - NAS secret (used for NAS-IP-Address attribute, not packet auth)
     * @param {string} params.sessionId - Session ID (optional but recommended)
     * @param {string} params.framedIp - Framed IP address (optional)
     * @param {number} params.coaPort - Unused (always goes to FreeRADIUS:3799)
     * @param {string} params.freeradiusServer - FreeRADIUS CoA proxy IP (default 172.22.10.101)
     * @param {string} params.freeradiusSecret - FreeRADIUS client secret (default kilusi-coa-secret)
     * @param {number} params.freeradiusPort - FreeRADIUS CoA port (default 3799)
     */
    async disconnectUser(params) {
        const {
            username,
            nasIp,
            sessionId,
            framedIp,
            freeradiusServer = '172.22.10.101',
            freeradiusSecret = 'kilusi-coa-secret',
            freeradiusPort = 3799
        } = params;

        if (!username || !nasIp) {
            throw new Error('Username and NAS IP are required');
        }

        return new Promise((resolve, reject) => {
            try {
                // Prepare attributes for Disconnect-Request
                const attributes = [
                    ['User-Name', username],
                    ['NAS-IP-Address', nasIp]
                ];

                if (sessionId) {
                    attributes.push(['Acct-Session-Id', sessionId]);
                }

                if (framedIp) {
                    attributes.push(['Framed-IP-Address', framedIp]);
                }

                // Create RADIUS packet with FreeRADIUS client secret
                const packet = radius.encode({
                    code: 'Disconnect-Request',
                    secret: freeradiusSecret,
                    identifier: Math.floor(Math.random() * 256),
                    attributes: attributes
                });

                logger.info(`🔄 Sending RADIUS Disconnect-Request for user ${username} (NAS: ${nasIp}) via FreeRADIUS proxy ${freeradiusServer}:${freeradiusPort}`);

                const client = dgram.createSocket('udp4');

                const timeout = setTimeout(() => {
                    client.close();
                    logger.warn(`⚠️ RADIUS Disconnect timeout for ${username} via FreeRADIUS proxy`);
                    resolve({
                        success: false,
                        message: `Timeout: No response from FreeRADIUS proxy ${freeradiusServer}`,
                        username
                    });
                }, 10000);

                client.on('message', (msg, rinfo) => {
                    clearTimeout(timeout);
                    client.close();

                    try {
                        const response = radius.decode({ packet: msg, secret: freeradiusSecret });

                        if (response.code === 'Disconnect-ACK') {
                            logger.info(`✅ RADIUS Disconnect SUCCESS for user ${username} via FreeRADIUS proxy`);
                            resolve({
                                success: true,
                                message: `User ${username} disconnected successfully`,
                                username,
                                coaRes: response
                            });
                        } else if (response.code === 'Disconnect-NAK') {
                            logger.warn(`❌ RADIUS Disconnect NAK for user ${username}: ${JSON.stringify(response.attributes)}`);
                            resolve({
                                success: false,
                                message: `NAS rejected disconnect request (NAK)`,
                                username,
                                coaRes: response
                            });
                        } else {
                            logger.warn(`❓ Unknown RADIUS response code: ${response.code}`);
                            resolve({
                                success: false,
                                message: `Unknown response: ${response.code}`,
                                username
                            });
                        }
                    } catch (err) {
                        logger.error(`❌ Error decoding RADIUS response: ${err.message}`);
                        resolve({ success: false, message: `Decode error: ${err.message}` });
                    }
                });

                client.on('error', (err) => {
                    clearTimeout(timeout);
                    client.close();
                    logger.error(`❌ UDP Socket error: ${err.message}`);
                    resolve({ success: false, message: `Socket error: ${err.message}` });
                });

                client.send(packet, 0, packet.length, freeradiusPort, freeradiusServer, (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.close();
                        logger.error(`❌ Failed to send UDP packet to FreeRADIUS proxy: ${err.message}`);
                        resolve({ success: false, message: `Send error: ${err.message}` });
                    }
                });

            } catch (error) {
                logger.error(`❌ Error in RADIUS disconnect process: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * Alternative implementation using Mikrotik API if available
     * @param {Object} params - Disconnect parameters
     */
    async disconnectViaMikrotik(params) {
        return this.disconnectUser(params);
    }

    /**
     * Close any resources
     */
    close() {
        logger.info('🔌 RADIUS Disconnect module closed');
    }
}

module.exports = new RadiusDisconnect();