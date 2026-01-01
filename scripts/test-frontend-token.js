/**
 * Test frontend token login via API
 */

const token = 'B4F48E5BEA02C34785E81BF53968583B171A6942';
const apiUrl = 'http://localhost:3000';

async function testFrontendTokenLogin() {
    console.log('🔍 Testing Frontend Token Login API...\n');

    try {
        // Test the same endpoint that frontend calls
        console.log('1. Testing customer-auth API endpoint...');
        const response = await fetch(`${apiUrl}/api/v1/customer-auth/login/${token}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ Token login via API successful!');
            console.log(`Customer: ${result.data.customer.name}`);
            console.log(`Phone: ${result.data.customer.phone}`);
            console.log(`JWT Token: ${result.data.token.substring(0, 50)}...`);

            // Test JWT verification
            console.log('\n2. Testing JWT verification...');
            const verifyResponse = await fetch(`${apiUrl}/api/v1/customer-auth/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: result.data.token })
            });

            const verifyResult = await verifyResponse.json();
            console.log('Verification result:', JSON.stringify(verifyResult, null, 2));

        } else {
            console.log('\n❌ Token login failed:', result.message);
        }

        console.log('\n📋 Frontend Testing Instructions:');
        console.log(`1. Open browser: http://localhost:3001/customer/login/${token}`);
        console.log('2. Should show loading spinner, then success redirect');
        console.log('3. Check browser console for any errors');

    } catch (error) {
        console.error('❌ Error testing frontend token login:', error.message);
    }
}

testFrontendTokenLogin();