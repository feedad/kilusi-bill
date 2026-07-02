const { logger } = require('./logger');
const dgram = require('dgram');
const radius = require('radius');

/**
 * RADIUS Disconnect/CoA (Change of Authorization) Module
 * Sends Disconnect-Request (code 40) to FreeRADIUS CoA proxy.
 * Proxy port is determined by NAS ID (20000 + nas_id) for per-NAS routing.
 */

class RadiusDisconnect {
    /**
     * Send RADIUS CoA Disconnect Request via FreeRADIUS CoA proxy
     *
     * @param {Object} params
     * @param {string} params.username - Username to disconnect
     * @param {string} params.nasIp - NAS IP address
     * @param {number} params.coaPort - FreeRADIUS CoA proxy port (from nas.coa_proxy_port)
     * @param {string} params.sessionId - Session ID (optional)
     * @param {string} params.framedIp - Framed IP address (optional)
     * @param {string} params.freeradiusServer - FreeRADIUS CoA proxy IP (default 172.22.10.101)
     * @param {string} params.freeradiusSecret - FreeRADIUS client secret (default kilusi-coa-secret)
     */
    async disconnectUser(params) {
        const {
            username,
            nasIp,
            coaPort,
            sessionId,
            framedIp,
            freeradiusServer = '172.22.10.101',
            freeradiusSecret = 'kilusi-coa-secret'
        } = params;

        if (!username || !nasIp) {
            throw new Error('Username and NAS IP are required');
        }

        const port = coaPort || 3799;

        return new Promise((resolve, reject) => {
            try {
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

                const packet = radius.encode({
                    code: 'Disconnect-Request',
                    secret: freeradiusSecret,
                    identifier: Math.floor(Math.random() * 256),
                    attributes: attributes
                });

                logger.info(`CoA Disconnect-Request for ${username} (NAS: ${nasIp}) → ${freeradiusServer}:${port}`);

                const client = dgram.createSocket('udp4');

                const timeout = setTimeout(() => {
                    client.close();
                    logger.warn(`CoA timeout for ${username} via ${freeradiusServer}:${port}`);
                    resolve({
                        success: false,
                        message: `Timeout from FreeRADIUS proxy ${freeradiusServer}:${port}`,
                        username
                    });
                }, 10000);

                client.on('message', (msg) => {
                    clearTimeout(timeout);
                    client.close();

                    try {
                        const response = radius.decode({ packet: msg, secret: freeradiusSecret });

                        if (response.code === 'Disconnect-ACK') {
                            logger.info(`CoA SUCCESS for ${username} via ${freeradiusServer}:${port}`);
                            resolve({
                                success: true,
                                message: `User ${username} disconnected successfully`,
                                username,
                                coaRes: response
                            });
                        } else if (response.code === 'Disconnect-NAK') {
                            logger.warn(`CoA NAK for ${username}: ${JSON.stringify(response.attributes)}`);
                            resolve({
                                success: false,
                                message: `NAS rejected disconnect request (NAK)`,
                                username,
                                coaRes: response
                            });
                        } else {
                            logger.warn(`CoA unknown response code: ${response.code}`);
                            resolve({
                                success: false,
                                message: `Unknown response: ${response.code}`,
                                username
                            });
                        }
                    } catch (err) {
                        logger.error(`CoA decode error: ${err.message}`);
                        resolve({ success: false, message: `Decode error: ${err.message}` });
                    }
                });

                client.on('error', (err) => {
                    clearTimeout(timeout);
                    client.close();
                    logger.error(`CoA socket error: ${err.message}`);
                    resolve({ success: false, message: `Socket error: ${err.message}` });
                });

                client.send(packet, 0, packet.length, port, freeradiusServer, (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.close();
                        logger.error(`CoA send error to ${freeradiusServer}:${port}: ${err.message}`);
                        resolve({ success: false, message: `Send error: ${err.message}` });
                    }
                });

            } catch (error) {
                logger.error(`CoA error: ${error.message}`);
                reject(error);
            }
        });
    }

    async disconnectViaMikrotik(params) {
        return this.disconnectUser(params);
    }

    close() {
        logger.info('RADIUS Disconnect module closed');
    }
}

module.exports = new RadiusDisconnect();
