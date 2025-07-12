require('dotenv').config();
const axios = require('axios');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

async function testDifferentFormats() {
  // First, let's try to get a simple invoice from our test address
  const testAddress = 'test@speed.app';
  const testAmount = 1000; // 1000 sats
  
  try {
    console.log('=== Testing Different Speed API Payment Formats ===\n');
    
    // Get invoice
    const [username, domain] = testAddress.split('@');
    const lnurl = `https://${domain}/.well-known/lnurlp/${username}`;
    const metadataResponse = await axios.get(lnurl, { timeout: 5000 });
    const metadata = metadataResponse.data;
    const amountMsats = testAmount * 1000;
    const invoiceResponse = await axios.get(`${metadata.callback}?amount=${amountMsats}`, { timeout: 5000 });
    const invoice = invoiceResponse.data.pr;
    
    console.log('Generated invoice:', invoice.substring(0, 50) + '...\n');
    
    // Format 1: Just payment_request
    console.log('--- Format 1: Just payment_request ---');
    await testPaymentFormat({ payment_request: invoice });
    
    // Format 2: With amount in sats
    console.log('\n--- Format 2: With amount in sats ---');
    await testPaymentFormat({ 
      payment_request: invoice,
      amount: testAmount
    });
    
    // Format 3: With amount in msats
    console.log('\n--- Format 3: With amount in msats ---');
    await testPaymentFormat({ 
      payment_request: invoice,
      amount: amountMsats
    });
    
    // Format 4: With currency
    console.log('\n--- Format 4: With currency SATS ---');
    await testPaymentFormat({ 
      payment_request: invoice,
      currency: 'SATS'
    });
    
    // Format 5: With currency BTC
    console.log('\n--- Format 5: With currency BTC ---');
    await testPaymentFormat({ 
      payment_request: invoice,
      currency: 'BTC'
    });
    
    // Format 6: Complete format
    console.log('\n--- Format 6: Complete format ---');
    await testPaymentFormat({ 
      payment_request: invoice,
      amount: testAmount,
      currency: 'SATS'
    });
    
    // Format 7: Try 'bolt11' instead of 'payment_request'
    console.log('\n--- Format 7: Using bolt11 field ---');
    await testPaymentFormat({ bolt11: invoice });
    
    // Format 8: Try 'invoice' field
    console.log('\n--- Format 8: Using invoice field ---');
    await testPaymentFormat({ invoice: invoice });
    
  } catch (error) {
    console.error('Error in test setup:', error.message);
  }
}

async function testPaymentFormat(payload) {
  try {
    console.log('Testing payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(
      `${SPEED_WALLET_API_BASE}/payments`,
      payload,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ SUCCESS! Response:', JSON.stringify(response.data, null, 2));
    return true;
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Error Status:', error.response.status);
      console.log('❌ Error Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Error:', error.message);
    }
    return false;
  }
}

testDifferentFormats().catch(console.error);
