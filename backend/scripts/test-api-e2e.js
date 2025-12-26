
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const BASE_URL = 'http://localhost:3001/api/v1';

// Generate Admin Token
const token = jwt.sign(
    {
        userId: 'admin-test',
        username: 'admin',
        role: 'admin'
    },
    SECRET_KEY,
    { expiresIn: '1h' }
);

console.log('🔑 Generated Test Token:', token.substring(0, 20) + '...');

// Helper for API calls
async function apiCall(method, endpoint, body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text; // Keep text if not JSON
    }
    
    console.log(`\n[${method}] ${endpoint} -> Status: ${res.status}`);
    if (!res.ok) {
        console.error('❌ Error Response:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    }
    return { status: res.status, data };
}

async function runTests() {
    console.log('🚀 Starting End-to-End API Tests...');

    // 0. Health Check (No Auth)
    const healthRes = await fetch(`${BASE_URL}/health`);
    console.log(`Health Check: ${healthRes.status} ${healthRes.statusText}`);
    if (!healthRes.ok) {
        console.error('Server not reachable or health check failed');
        return;
    }

    // 1. GET Customers (Initial)
    const listRes = await apiCall('GET', '/customers?limit=5');
    console.log(`📋 Initial Customer Count: ${listRes.data.data ? listRes.data.data.length : 0}`);

    // Data for new customer
    const newCustomer = {
        name: "Test User Normalized",
        phone: "081234567899",
        email: "test@example.com",
        address: "Jl. Test No. 123",
        region: "Jakarta", 
        package_id: 1, // Assumptions: package 1 exists? If not this might fail. We should check packages first.
        pppoe_username: "testuser_norm",
        pppoe_password: "password123",
        billing_type: "postpaid",
        odp_id: "ODP-TEST-01",
        odp_port: 2,
        cable_type: "FO",
        cable_length: 150
    };

    // Check if package exists, if not use null or try to find one
    // Note: If no packages exist, referenced insert might fail if constraint exists? 
    // Usually packages are seeded. If not, we might need to create one or send null.
    // The migration script implies services -> packages(id) FK.
    // Let's assume package 1 exists or set null if allowed. 
    // services.package_id is NOT NULL? check schema... usually allowed to be null/set later?
    // Looking at schema: package_id INTEGER REFERENCES packages(id). Not marked NOT NULL in normalize script.

    // 2. CREATE Customer
    console.log('➕ Creating Customer...');
    const createRes = await apiCall('POST', '/customers', newCustomer);
    
    if (createRes.status !== 201 && createRes.status !== 200) {
        console.error('🛑 Failed to create customer. Aborting.');
        return;
    }
    
    const createdId = createRes.data.data.customer.id; // API response structure might vary slightly, usually data.data.customer or data.customer
    const actualId = createRes.data.data.customer ? createRes.data.data.customer.id : createRes.data.data.id; 
    
    console.log(`✅ Created Customer ID: ${actualId}`);
    
    // 3. GET Customer by ID (Verifies View)
    console.log(`🔍 Fetching Customer ${actualId}...`);
    const getRes = await apiCall('GET', `/customers/${actualId}`);
    const fetched = getRes.data.data.customer;
    
    console.log(`   Name: ${fetched.name}`);
    console.log(`   PPPoE: ${fetched.pppoe_username}`);
    console.log(`   Cable Type: ${fetched.cable_type}`); // Should be from network_infrastructure via View

    // 4. UPDATE Customer
    console.log('✏️ Updating Customer...');
    const updateData = {
        name: "Test User Updated",
        pppoe_password: "newpassword789",
        cable_length: 200
    };
    const updateRes = await apiCall('PUT', `/customers/${actualId}`, updateData);
    console.log(`✅ Update Status: ${updateRes.status}`);

    // 5. Verify Update
    const verifyRes = await apiCall('GET', `/customers/${actualId}`);
    const updated = verifyRes.data.data.customer;
    console.log(`   New Name: ${updated.name}`); // Expect "Test User Updated"
    console.log(`   New Cable Length: ${updated.cable_length}`); // Expect 200

    // 6. DELETE Customer
    console.log('🗑️ Deleting Customer...');
    const delRes = await apiCall('DELETE', `/customers/${actualId}`);
    console.log(`✅ Delete Status: ${delRes.status}`);

    // 7. Verify Deletion
    const finalRes = await apiCall('GET', `/customers/${actualId}`);
    if (finalRes.status === 404) {
        console.log('✅ Customer Verification: User Not Found (Deleted successfully)');
    } else {
        console.error('⚠️ Customer still exists!');
    }
}

runTests().catch(console.error);
