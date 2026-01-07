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
     * @param {Object} params - Disconnect parameters
     * @param {string} params.username - Username to disconnect
     * @param {string} params.nasIp - NAS IP address
     * @param {string} params.nasSecret - NAS secret
     * @param {string} params.sessionId - Session ID (optional but recommended)
     * @param {string} params.framedIp - Framed IP address (optional)
     * @param {number} params.coaPort - NAS CoA Port (default 3799)
     */
    async disconnectUser(params) {
        const { username, nasIp, nasSecret, sessionId, framedIp, coaPort = 3799 } = params;

        if (!username || !nasIp || !nasSecret) {
            throw new Error('Username, NAS IP, and NAS Secret are required');
        }

        return new Promise((resolve, reject) => {
            try {
                // Prepare attributes for Disconnect-Request
                const attributes = [
                    ['User-Name', username]
                ];

                if (sessionId) {
                    attributes.push(['Acct-Session-Id', sessionId]);
                }

                if (framedIp) {
                    attributes.push(['Framed-IP-Address', framedIp]);
                }

                // Create RADIUS packet
                const packet = radius.encode({
                    code: 'Disconnect-Request',
                    secret: nasSecret,
                    identifier: Math.floor(Math.random() * 256),
                    attributes: attributes
                });

                logger.info(`🔄 Sending RADIUS Disconnect-Request for user ${username} to ${nasIp}:${coaPort}`);

                const client = dgram.createSocket('udp4');

                // Set timeout for response
                const timeout = setTimeout(() => {
                    client.close();
                    logger.warn(`⚠️  RADIUS Disconnect timeout for ${username} (No response from NAS)`);
                    resolve({
                        success: false,
                        message: `Timeout: No response from NAS ${nasIp}`,
                        username
                    });
                }, 5000);

                client.on('message', (msg, rinfo) => {
                    clearTimeout(timeout);
                    client.close();

                    try {
                        const response = radius.decode({ packet: msg, secret: nasSecret });

                        if (response.code === 'Disconnect-ACK') {
                            logger.info(`✅ RADIUS Disconnect SUCCESS for user ${username}`);
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

                // Send packet
                client.send(packet, 0, packet.length, coaPort, nasIp, (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.close();
                        logger.error(`❌ Failed to send UDP packet: ${err.message}`);
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