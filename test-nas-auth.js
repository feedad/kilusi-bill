const radius = require('radius');
const dgram = require('dgram');
const crypto = require('crypto');

async function testNasAuthentication() {
    console.log('🔐 TESTING RADIUS AUTHENTICATION FROM NAS CLIENT');
    console.log('==============================================');
    console.log('NAS IP: 172.22.10.156');
    console.log('RADIUS Server: 127.0.0.1:1812');
    console.log('Username: apptest');
    console.log('Password: 1234567');
    console.log('NAS Secret: testing123');
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

                console.log('📨 RADIUS Response Received:');
                console.log(`   From: ${rinfo.address}:${rinfo.port}`);
                console.log(`   Code: ${response.code}`);

                if (response.attributes && response.attributes['Reply-Message']) {
                    console.log(`   Message: ${response.attributes['Reply-Message']}`);
                }

                if (response.code === 'Access-Accept') {
                    console.log('\n🎉 AUTHENTICATION SUCCESSFUL!');
                    console.log('✅ Client from 172.22.10.156 can now authenticate');
                } else {
                    console.log('\n❌ AUTHENTICATION FAILED');
                    console.log('❌ Client credentials were rejected');
                }

                resolve(response.code === 'Access-Accept');
            } catch (error) {
                console.error('❌ Error decoding response:', error.message);
                resolve(false);
            }
            client.close();
        });

        client.on('error', (err) => {
            console.error('❌ Socket error:', err.message);
            resolve(false);
            client.close();
        });

        setTimeout(() => {
            if (!responded) {
                console.log('❌ Request timeout - no response from RADIUS server');
                resolve(false);
                client.close();
            }
        }, 5000);

        console.log('📤 Sending Access-Request from NAS 172.22.10.156...');
        client.send(requestPacket, 1812, '127.0.0.1', (err) => {
            if (err) {
                console.error('❌ Send error:', err.message);
                resolve(false);
                client.close();
            }
        });
    });
}

testNasAuthentication().then(success => {
    console.log('\n' + '='.repeat(50));
    if (success) {
        console.log('✅ RADIUS AUTHENTICATION FROM NAS 172.22.10.156 WORKING!');
        console.log('🚀 Client devices can now connect through the correct NAS IP');
    } else {
        console.log('❌ RADIUS authentication from NAS failed');
        console.log('🔧 Further investigation needed');
    }
    process.exit(0);
});