require('dotenv').config();
const axios = require('axios');

// Test configuration
const TEST_AMOUNT_SATS = 100;
const TEST_ORDER_ID = `test-${Date.now()}`;
const TEST_CUSTOMER_ID = 'test-customer-123';

// Speed API configuration
const SPEED_WALLET_API_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_API_KEY}:`).toString('base64');

console.log('=== Speed Invoice Creation Test ===');
console.log('API Key exists:', !!SPEED_WALLET_API_KEY);
console.log('API Key length:', SPEED_WALLET_API_KEY ? SPEED_WALLET_API_KEY.length : 0);
console.log('API Base URL:', SPEED_WALLET_API_BASE);
console.log('Test Amount:', TEST_AMOUNT_SATS, 'SATS');
console.log('');

async function testNewPaymentsAPI() {
  console.log('1. Testing NEW /payments API...');
  
  const payload = {
    currency: 'SATS',
    amount: TEST_AMOUNT_SATS,
    target_currency: 'SATS',
    ttl: 3600,
    description: `Test payment for order ${TEST_ORDER_ID}`,
    metadata: {
      order_id: TEST_ORDER_ID,
      customer_id: TEST_CUSTOMER_ID,
    }
  };
  
  console.log('Request payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(
      `${SPEED_WALLET_API_BASE}/payments`,
      payload,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ Success! Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    // Check for Lightning invoice
    const lightningInvoice = response.data.payment_request || 
                           response.data.lightning_invoice || 
                           response.data.bolt11 ||
                           response.data.invoice;
    
    if (lightningInvoice) {
      console.log('✅ Lightning invoice found:', lightningInvoice.substring(0, 50) + '...');
    } else {
      console.log('⚠️  No Lightning invoice found in response');
    }
    
    return response.data;
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response headers:', error.response.headers);
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function testOldInvoicesAPI() {
  console.log('\n2. Testing OLD /invoices API...');
  
  const payload = {
    currency: 'SATS',
    customer_id: TEST_CUSTOMER_ID,
    payment_methods: ['lightning'],
    invoice_line_items: [
      {
        type: 'custom_line_item',
        quantity: 1,
        name: `Test payment for order ${TEST_ORDER_ID}`,
        unit_amount: TEST_AMOUNT_SATS,
      }
    ],
  };
  
  console.log('Request payload:', JSON.stringify(payload, null, 2));
  
  try {
    // Create invoice
    console.log('Creating draft invoice...');
    const createResponse = await axios.post(
      `${SPEED_WALLET_API_BASE}/invoices`,
      payload,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ Draft invoice created:', createResponse.data.id);
    const invoiceId = createResponse.data.id;
    
    // Finalize invoice
    console.log('Finalizing invoice...');
    await axios.post(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}/finalize`,
      {},
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15',
        },
        timeout: 5000,
      }
    );
    
    console.log('✅ Invoice finalized');
    
    // Retrieve invoice
    console.log('Retrieving invoice details...');
    const retrieveResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15',
        },
        timeout: 5000,
      }
    );
    
    console.log('✅ Invoice retrieved');
    console.log('Invoice data:', JSON.stringify(retrieveResponse.data, null, 2));
    
    // Check for Lightning invoice
    const lightningInvoice = retrieveResponse.data.payment_request || 
                           retrieveResponse.data.bolt11 || 
                           retrieveResponse.data.lightning_invoice || 
                           retrieveResponse.data.invoice;
    
    if (lightningInvoice) {
      console.log('✅ Lightning invoice found:', lightningInvoice.substring(0, 50) + '...');
    } else {
      console.log('⚠️  No Lightning invoice found in response');
    }
    
    return retrieveResponse.data;
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response headers:', error.response.headers);
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function runTests() {
  if (!SPEED_WALLET_API_KEY) {
    console.error('❌ SPEED_WALLET_SECRET_KEY environment variable is not set!');
    console.error('Please ensure your .env file contains: SPEED_WALLET_SECRET_KEY=your_api_key');
    process.exit(1);
  }
  
  try {
    // Test new API
    await testNewPaymentsAPI();
  } catch (error) {
    console.log('\n⚠️  New API failed, testing old API...');
  }
  
  try {
    // Test old API
    await testOldInvoicesAPI();
  } catch (error) {
    console.log('\n❌ Both APIs failed!');
  }
  
  console.log('\n=== Test Complete ===');
}

// Run tests
runTests().catch(console.error);
