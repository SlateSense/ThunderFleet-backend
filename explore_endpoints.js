require('dotenv').config();
const axios = require('axios');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

async function testEndpoint(endpoint, method = 'GET', payload = null) {
  try {
    console.log(`\n--- Testing ${method} ${endpoint} ---`);
    
    const config = {
      method: method,
      url: `${SPEED_WALLET_API_BASE}${endpoint}`,
      headers: {
        Authorization: `Basic ${AUTH_HEADER}`,
        'Content-Type': 'application/json',
        'speed-version': '2022-04-15',
      },
      timeout: 10000,
    };
    
    if (payload) {
      config.data = payload;
    }
    
    const response = await axios(config);
    console.log(`✅ ${method} ${endpoint} - Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    if (error.response) {
      console.log(`❌ ${method} ${endpoint} - Status: ${error.response.status}`);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`❌ ${method} ${endpoint} - Error:`, error.message);
    }
    return false;
  }
}

async function exploreEndpoints() {
  console.log('=== Exploring Speed Wallet API Endpoints ===');
  console.log(`Using API key: ${SPEED_WALLET_SECRET_KEY.substring(0, 20)}...`);
  
  // Test various endpoint possibilities for instant send
  const endpointsToTest = [
    '/instant-send',
    '/instant-sends', 
    '/instant_send',
    '/instant_sends',
    '/sends',
    '/send',
    '/transfers',
    '/transfer',
    '/withdrawals',
    '/withdrawal',
    '/lightning-send',
    '/lightning-sends',
    '/lightning_send',
    '/lightning_sends',
    '/payments/instant',
    '/payments/send',
    '/v1/instant-send',
    '/v1/instant-sends',
    '/v2/instant-send',
    '/v2/instant-sends'
  ];
  
  // First, let's test GET requests to see which endpoints exist
  console.log('\n=== Testing GET requests ===');
  for (const endpoint of endpointsToTest) {
    await testEndpoint(endpoint, 'GET');
  }
  
  // Test a few with POST and sample payload
  console.log('\n=== Testing POST requests with sample payload ===');
  const samplePayload = {
    amount: 11.25,
    currency: 'USD',
    target_currency: 'SATS',
    withdraw_method: 'lightning',
    withdraw_request: 'test@speed.app',
    note: 'Test payment'
  };
  
  const postEndpoints = [
    '/instant-send',
    '/instant-sends',
    '/sends',
    '/transfers'
  ];
  
  for (const endpoint of postEndpoints) {
    await testEndpoint(endpoint, 'POST', samplePayload);
  }
  
  // Let's also test known working endpoints for reference
  console.log('\n=== Testing known endpoints ===');
  await testEndpoint('/payments', 'GET');
  await testEndpoint('/invoices', 'GET');
  await testEndpoint('/customers', 'GET');
}

exploreEndpoints().catch(console.error);
