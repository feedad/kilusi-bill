const dgram = require('dgram');
const radius = require('radius');
const crypto = require('crypto');

async function testRadiusAuth(username, password) {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const radiusServer = '127.0.0.1';
        const radiusPort = 1812;
        const radiusSecret = 'testing123';
        const identifier = Math.floor(Math.random() * 256);

        // Create request authenticator
        const requestAuth = crypto.randomBytes(16);

        // Encode RADIUS packet using library
        const requestPacket = radius.encode({
            code: 'Access-Request',
            identifier: identifier,
            authenticator: requestAuth,
            secret: radiusSecret,
            attributes: [
                ['User-Name', username],
                ['User-Password', password],
                ['Service-Type', 'Framed-User'],
                ['NAS-IP-Address', '127.0.0.1']
            ]
        });

        client.on('message', (msg, rinfo) => {
            try {
                const response = radius.decode({
                    packet: msg,
                    secret: radiusSecret
                });

                console.log(`📨 Received RADIUS response from ${rinfo.address}:${rinfo.port}`);
                console.log(`   Code: ${response.code} (1=Access-Request, 2=Access-Accept, 3=Access-Reject)`);
                console.log(`   Identifier: ${response.identifier}`);
                console.log(`   Attributes: ${Object.keys(response.attributes).length}`);

                Object.entries(response.attributes).forEach(([key, value]) => {
                    console.log(`   - ${key}: ${value}`);
                });

                const isSuccess = response.code === 'Access-Accept';
                resolve(isSuccess);
            } catch (error) {
                reject(error);
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
        console.log('🔐 Testing RADIUS Authentication (Fixed)');
        console.log('=========================================\n');

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