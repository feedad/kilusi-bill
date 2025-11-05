const dgram = require('dgram');
const crypto = require('crypto');

function createRadiusPacket(code, identifier, authenticator, attributes = []) {
    const packet = Buffer.allocUnsafe(1 + 1 + 2 + 16); // Code + Identifier + Length + Authenticator
    packet[0] = code; // Code
    packet[1] = identifier; // Identifier
    packet.writeUInt16BE(20, 2); // Length (header only)
    authenticator.copy(packet, 4); // Request Authenticator

    // Add attributes
    let currentLength = 20;
    let resultPacket = packet;
    for (const attr of attributes) {
        const attrBuffer = Buffer.allocUnsafe(2 + attr.value.length);
        attrBuffer[0] = attr.type;
        attrBuffer[1] = attr.value.length;
        attr.value.copy(attrBuffer, 2);

        resultPacket = Buffer.concat([resultPacket, attrBuffer]);
        currentLength += attrBuffer.length;
    }

    // Update length
    resultPacket.writeUInt16BE(currentLength, 2);
    return resultPacket;
}

function parseRadiusPacket(buffer) {
    if (buffer.length < 20) return null;

    const code = buffer[0];
    const identifier = buffer[1];
    const length = buffer.readUInt16BE(2);
    const authenticator = buffer.slice(4, 20);
    const attributes = [];

    let pos = 20;
    while (pos < length) {
        if (pos + 2 > length) break;

        const type = buffer[pos];
        const attrLength = buffer[pos + 1];

        if (pos + attrLength > length) break;

        const value = buffer.slice(pos + 2, pos + attrLength);
        attributes.push({ type, value });

        pos += attrLength;
    }

    return { code, identifier, authenticator, attributes };
}

async function testRadiusAuth(username, password) {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const radiusServer = '127.0.0.1';
        const radiusPort = 1812;
        const radiusSecret = 'testing123';
        const identifier = Math.floor(Math.random() * 256);

        // Create request authenticator
        const requestAuth = crypto.randomBytes(16);

        // Build User-Password attribute
        const userPasswordAttr = Buffer.allocUnsafe(password.length);
        Buffer.from(password).copy(userPasswordAttr);

        // Build attributes
        const attributes = [
            { type: 1, value: Buffer.from(username) }, // User-Name
            { type: 2, value: userPasswordAttr }, // User-Password
            { type: 6, value: Buffer.from([1]) }, // Service-Type (Framed-User)
            { type: 4, value: Buffer.from([172, 22, 10, 28]) } // NAS-IP-Address
        ];

        // Create Access-Request packet (code = 1)
        const requestPacket = createRadiusPacket(1, identifier, requestAuth, attributes);

        client.on('message', (msg, rinfo) => {
            const response = parseRadiusPacket(msg);
            if (response) {
                console.log(`📨 Received RADIUS response from ${rinfo.address}:${rinfo.port}`);
                console.log(`   Code: ${response.code} (1=Access-Request, 2=Access-Accept, 3=Access-Reject)`);
                console.log(`   Identifier: ${response.identifier}`);
                console.log(`   Attributes: ${response.attributes.length}`);

                response.attributes.forEach(attr => {
                    const attrNames = {
                        1: 'User-Name',
                        2: 'User-Password',
                        3: 'CHAP-Password',
                        4: 'NAS-IP-Address',
                        5: 'NAS-Port',
                        6: 'Service-Type',
                        7: 'Framed-Protocol',
                        8: 'Framed-IP-Address',
                        9: 'Framed-IP-Netmask',
                        14: 'Login-Service',
                        15: 'Login-TCP-Port',
                        18: 'Reply-Message',
                        79: 'EAP-Message',
                        80: 'Message-Authenticator'
                    };
                    const attrName = attrNames[attr.type] || `Unknown(${attr.type})`;
                    console.log(`   - ${attrName}: ${attr.value.toString()}`);
                });

                const isSuccess = response.code === 2; // Access-Accept
                resolve(isSuccess);
            } else {
                reject(new Error('Failed to parse RADIUS response'));
            }
            client.close();
        });

        client.on('error', (err) => {
            reject(err);
            client.close();
        });

        console.log(`📤 Sending RADIUS Access-Request to ${radiusServer}:${radiusPort}`);
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Identifier: ${identifier}`);

        client.send(requestPacket, radiusPort, radiusServer, (err) => {
            if (err) {
                reject(err);
                client.close();
            }
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            reject(new Error('RADIUS request timeout'));
            client.close();
        }, 5000);
    });
}

async function main() {
    try {
        console.log('🔐 Testing RADIUS Authentication');
        console.log('=====================================\n');

        // Test with Ferry Adhitya's credentials
        const success = await testRadiusAuth('apptest', '1234567');

        console.log('\n' + '='.repeat(50));
        if (success) {
            console.log('✅ RADIUS Authentication SUCCESSFUL!');
            console.log('   User credentials are valid and RADIUS is working correctly.');
        } else {
            console.log('❌ RADIUS Authentication FAILED!');
            console.log('   User credentials were rejected by RADIUS server.');
        }

    } catch (error) {
        console.error('❌ RADIUS Authentication ERROR:', error.message);
        console.log('\n💡 Possible issues:');
        console.log('   - RADIUS server is not running');
        console.log('   - Firewall blocking RADIUS ports (1812/1813)');
        console.log('   - Invalid RADIUS secret');
        console.log('   - User does not exist in RADIUS database');
        console.log('   - Network connectivity issues');
    }

    process.exit(0);
}

main();