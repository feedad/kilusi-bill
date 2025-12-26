const fetch = require('node-fetch');

async function testCustomerAuth() {
    const token = 'B9B1399BAA2DE50A70C42A70F539497823C9A2EA';
    const apiUrl = 'http://localhost:3000/api/v1/customer-radius/info';

    console.log('🔑 Testing with token:', token);
    console.log('🌐 API URL:', apiUrl);

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Origin': 'http://localhost:3001'
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', Object.fromEntries(response.headers));

        const result = await response.json();
        console.log('✅ API Response:', JSON.stringify(result, null, 2));

        if (result.success && result.data) {
            console.log('\n🎯 Device Info yang akan ditampilkan:');
            console.log('- IP Address:', result.data.deviceInfo?.ipAddress);
            console.log('- MAC Address:', result.data.deviceInfo?.macAddress);
            console.log('- SSID:', result.data.deviceInfo?.ssid);
            console.log('- Status:', result.data.deviceInfo?.status);
            console.log('- Username:', result.data.radiusInfo?.username);
            console.log('- Session Active:', result.data.radiusInfo?.sessionActive);

            console.log('\n📊 Connected Devices:', result.data.connectedDevices?.length || 0);
            if (result.data.connectedDevices?.length > 0) {
                result.data.connectedDevices.forEach((device, i) => {
                    console.log(`  Device ${i+1}: ${device.name} (${device.ip}) - ${device.status}`);
                });
            }
        } else {
            console.log('❌ API Error:', result);
        }
    } catch (error) {
        console.error('❌ Test Error:', error.message);
    }
}

testCustomerAuth();