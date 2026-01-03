const PaymentGatewayManager = require('./config/paymentGateway');

async function debugTripayRaw() {
    try {
        const pg = new PaymentGatewayManager();
        await pg.ensureInitialized();

        if (!pg.gateways.tripay) {
            console.log('Tripay not initialized!');
            return;
        }

        console.log('Fetching Tripay raw channels...');
        // We need to access the internal method to get raw data, 
        // but since getAvailablePaymentMethods returns normalized data,
        // we might need to copy the fetch logic here or rely on what we can see.
        // Actually, let's just use the private config and fetch directly to see the RAW response.

        const config = pg.gateways.tripay.config;
        const baseUrl = config.production ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox';

        const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
        const res = await fetchFn(`${baseUrl}/merchant/payment-channel`, {
            headers: { 'Authorization': `Bearer ${config.api_key}` }
        });

        const result = await res.json();

        if (result.success && result.data.length > 0) {
            console.log('--- RAW SAMPLE DATA (First Item) ---');
            console.log(JSON.stringify(result.data[0], null, 2));

            console.log('--- RAW SAMPLE DATA (VA Item) ---');
            const va = result.data.find(d => d.code.endsWith('VA'));
            if (va) console.log(JSON.stringify(va, null, 2));

            console.log('--- RAW SAMPLE DATA (Retail Item) ---');
            const retail = result.data.find(d => ['ALFAMART', 'INDOMARET'].includes(d.code));
            if (retail) console.log(JSON.stringify(retail, null, 2));
        } else {
            console.log('No data or failed:', result);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

debugTripayRaw();
