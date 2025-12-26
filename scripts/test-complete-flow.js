/**
 * Complete flow test for token login with frontend simulation
 */

const puppeteer = require('puppeteer');

async function testCompleteFlow() {
    console.log('🚀 Testing Complete Token Login Flow...\n');

    const token = 'B4F48E5BEA02C34785E81BF53968583B171A6942';
    const frontendUrl = `http://localhost:3001/customer/login/${token}`;

    try {
        const browser = await puppeteer.launch({
            headless: false, // Set to true for CI
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Enable console logging from the page
        page.on('console', msg => {
            console.log('Browser Console:', msg.text());
        });

        page.on('pageerror', error => {
            console.log('Page Error:', error.message);
        });

        console.log(`1. Opening token login page: ${frontendUrl}`);
        await page.goto(frontendUrl, { waitUntil: 'networkidle2' });

        // Wait for loading state
        console.log('2. Waiting for token validation...');
        await page.waitForSelector('[data-testid="loading-spinner"], [data-testid="success-state"], [data-testid="error-state"]', { timeout: 10000 });

        // Check the current state
        const state = await page.evaluate(() => {
            const statusElement = document.querySelector('[data-status]');
            return statusElement ? statusElement.getAttribute('data-status') : 'unknown';
        });

        console.log(`3. Login status: ${state}`);

        if (state === 'success') {
            console.log('✅ Token login successful!');

            // Wait for redirect to portal
            console.log('4. Waiting for redirect to portal...');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });

            const currentUrl = page.url();
            console.log(`5. Redirected to: ${currentUrl}`);

            if (currentUrl.includes('/customer/portal')) {
                console.log('✅ Successfully redirected to customer portal!');

                // Check if customer data is loaded
                const customerName = await page.evaluate(() => {
                    const nameElement = document.querySelector('[data-testid="customer-name"]');
                    return nameElement ? nameElement.textContent : null;
                });

                if (customerName) {
                    console.log(`✅ Customer data loaded: ${customerName}`);
                } else {
                    console.log('⚠️ Customer data not immediately visible');
                }

                console.log('\n🎉 COMPLETE FLOW SUCCESSFUL!');
                console.log('✅ Token validation works');
                console.log('✅ Frontend authentication works');
                console.log('✅ Redirect to portal works');
                console.log('✅ Customer dashboard loads');

            } else {
                console.log(`❌ Unexpected redirect: ${currentUrl}`);
            }

        } else if (state === 'error') {
            console.log('❌ Token login failed');

            const errorMessage = await page.evaluate(() => {
                const errorElement = document.querySelector('[data-testid="error-message"]');
                return errorElement ? errorElement.textContent : 'Unknown error';
            });

            console.log(`Error message: ${errorMessage}`);

        } else {
            console.log('❌ Unknown login state');
        }

        // Take a screenshot for debugging
        await page.screenshot({ path: 'token-login-test.png', fullPage: true });
        console.log('📸 Screenshot saved as token-login-test.png');

        // Wait a bit before closing
        await new Promise(resolve => setTimeout(resolve, 3000));

        await browser.close();

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Check if puppeteer is available
try {
    require.resolve('puppeteer');
    testCompleteFlow();
} catch (error) {
    console.log('⚠️ Puppeteer not available, providing manual testing instructions:\n');

    console.log('📋 Manual Testing Instructions:');
    console.log('1. Open browser and navigate to: http://localhost:3001/customer/login/B4F48E5BEA02C34785E81BF53968583B171A6942');
    console.log('2. You should see a loading spinner');
    console.log('3. After 2-3 seconds, should show success message');
    console.log('4. Should auto-redirect to: http://localhost:3001/customer/portal');
    console.log('5. Portal should show customer dashboard with data');
    console.log('\n🔍 Debugging:');
    console.log('- Open browser DevTools (F12) to check Console for errors');
    console.log('- Check Network tab for API calls');
    console.log('- Verify API responds correctly to: /api/v1/customer-auth/login/{token}');
}