const radius = require('radius');
const dgram = require('dgram');
const crypto = require('crypto');

async function testRadiusWithGroups() {
    console.log('🔐 TESTING RADIUS WITH GROUP ATTRIBUTES');
    console.log('======================================');
    console.log('Username: apptest');
    console.log('Expected: Should include Mikrotik-Rate-Limit: 10M/10M');
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
                ['NAS-IP-Address', '127.0.0.1']
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

                if (response.code === 'Access-Accept') {
                    console.log('\n🎉 AUTHENTICATION SUCCESSFUL!');
                    console.log('📦 Reply Attributes:');

                    if (response.attributes) {
                        Object.entries(response.attributes).forEach(([key, value]) => {
                            console.log(`   ${key}: ${value}`);
                        });
                    }

                    // Check for key Mikrotik attributes
                    const hasRateLimit = response.attributes['Mikrotik-Rate-Limit'];
                    const hasFramedProtocol = response.attributes['Framed-Protocol'];
                    const hasServiceType = response.attributes['Service-Type'];

                    console.log('\n🔍 Key Attributes Check:');
                    console.log(`   Mikrotik-Rate-Limit: ${hasRateLimit ? '✅ ' + hasRateLimit : '❌ MISSING'}`);
                    console.log(`   Framed-Protocol: ${hasFramedProtocol ? '✅ ' + hasFramedProtocol : '❌ MISSING'}`);
                    console.log(`   Service-Type: ${hasServiceType ? '✅ ' + hasServiceType : '❌ MISSING'}`);

                    if (hasRateLimit) {
                        console.log('\n✅ SUCCESS: UpTo-10M profile attributes are being returned!');
                        console.log('🚀 Mikrotik should now apply the correct 10M bandwidth limit');
                    } else {
                        console.log('\n❌ ISSUE: UpTo-10M profile attributes are NOT being returned');
                        console.log('🔧 Mikrotik may apply default profile instead');
                    }
                } else {
                    console.log('\n❌ AUTHENTICATION FAILED');
                    if (response.attributes && response.attributes['Reply-Message']) {
                        console.log(`   Message: ${response.attributes['Reply-Message']}`);
                    }
                }

                resolve(response.code === 'Access-Accept' && response.attributes['Mikrotik-Rate-Limit']);
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

        console.log('📤 Sending Access-Request...');
        client.send(requestPacket, 1812, '127.0.0.1', (err) => {
            if (err) {
                console.error('❌ Send error:', err.message);
                resolve(false);
                client.close();
            }
        });
    });
}

testRadiusWithGroups().then(success => {
    console.log('\n' + '='.repeat(50));
    if (success) {
        console.log('✅ RADIUS GROUP ATTRIBUTES ARE WORKING!');
        console.log('🎯 UpTo-10M profile should now be applied correctly');
    } else {
        console.log('❌ RADIUS group attributes test failed');
        console.log('🔧 Further investigation needed');
    }
    process.exit(0);
});