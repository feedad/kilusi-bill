const radius = require('radius');
const dgram = require('dgram');
const crypto = require('crypto');

async function testWithOldSecret() {
    console.log('🔐 TESTING WITH OLD SECRET');
    console.log('===========================');
    console.log('NAS IP: 172.22.10.156');
    console.log('Secret: testing123 (original)');
    console.log('');

    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const requestAuth = crypto.randomBytes(16);

        const requestPacket = radius.encode({
            code: 'Access-Request',
            identifier: 1,
            authenticator: requestAuth,
            secret: 'testing123',
            attributes: [
                ['User-Name', 'apptest'],
                ['User-Password', '1234567'],
                ['Service-Type', 'Framed-User'],
                ['NAS-IP-Address', '172.22.10.156']
            ]
        });

        let responded = false;

        client.on('message', (msg, rinfo) => {
            if (responded) return;
            responded = true;

            try {
                const response = radius.decode({
                    packet: msg,
                    secret: 'testing123'
                });

                console.log('📨 Response Code:', response.code);
                if (response.code === 'Access-Accept') {
                    console.log('✅ SUCCESS with old secret');
                } else {
                    console.log('❌ FAILED with old secret');
                    if (response.attributes && response.attributes['Reply-Message']) {
                        console.log('Message:', response.attributes['Reply-Message']);
                    }
                }

                resolve(response.code === 'Access-Accept');
            } catch (error) {
                console.error('❌ Error:', error.message);
                resolve(false);
            }
            client.close();
        });

        setTimeout(() => {
            if (!responded) {
                console.log('❌ Timeout');
                resolve(false);
                client.close();
            }
        }, 3000);

        client.send(requestPacket, 1812, '127.0.0.1');
    });
}

testWithOldSecret().then(success => {
    console.log('\n' + '='.repeat(30));
    if (success) {
        console.log('✅ Use secret: testing123');
    } else {
        console.log('❌ Old secret also failed');
    }
    process.exit(0);
});