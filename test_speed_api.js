require('dotenv').config();
const axios = require('axios');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

async function testSpeedAPIPayment(lightningAddress, amountSats) {
  try {
    console.log(`\n=== Testing Speed API Payment ===`);
    console.log(`Address: ${lightningAddress}`);
    console.log(`Amount: ${amountSats} SATS`);
    
    // Step 1: Resolve Lightning address to get invoice
    const [username, domain] = lightningAddress.split('@');
    const lnurl = `https://${domain}/.well-known/lnurlp/${username}`;
    
    console.log(`\n1. Resolving Lightning address...`);
    const metadataResponse = await axios.get(lnurl, { timeout: 5000 });
    const metadata = metadataResponse.data;
    
    const amountMsats = amountSats * 1000;
    console.log(`   Amount: ${amountSats} SATS = ${amountMsats} msats`);
    console.log(`   Range: ${metadata.minSendable} - ${metadata.maxSendable} msats`);
    
    const invoiceResponse = await axios.get(`${metadata.callback}?amount=${amountMsats}`, { timeout: 5000 });
    const invoice = invoiceResponse.data.pr;
    
    console.log(`   ✅ Invoice generated: ${invoice.substring(0, 50)}...`);
    
    // Step 2: Send payment via Speed API
    console.log(`\n2. Sending payment via Speed API...`);
    
    const paymentPayload = {
      payment_request: invoice
    };
    
    const paymentHeaders = {
      Authorization: `Basic ${AUTH_HEADER}`,
      'Content-Type': 'application/json',
      'speed-version': '2022-04-15',
    };
    
    console.log(`   API URL: ${SPEED_WALLET_API_BASE}/payments`);
    console.log(`   Auth: Basic ${AUTH_HEADER.substring(0, 20)}...`);
    console.log(`   Payload:`, JSON.stringify(paymentPayload, null, 2));
    
    const paymentResponse = await axios.post(
      `${SPEED_WALLET_API_BASE}/payments`,
      paymentPayload,
      {
        headers: paymentHeaders,
        timeout: 10000,
      }
    );
    
    console.log(`   ✅ Payment sent successfully!`);
    console.log(`   Response:`, JSON.stringify(paymentResponse.data, null, 2));
    
    return paymentResponse.data;
    
  } catch (error) {
    console.error(`\n❌ Error sending payment:`, error.message);
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Headers:`, error.response.headers);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`   Full error:`, error);
    }
    
    throw error;
  }
}

async function runPaymentTests() {
  console.log('=== Speed API Payment Tests ===');
  
  if (!SPEED_WALLET_SECRET_KEY) {
    console.error('❌ SPEED_WALLET_SECRET_KEY not found in environment variables');
    return;
  }
  
  console.log(`Using API key: ${SPEED_WALLET_SECRET_KEY.substring(0, 20)}...`);
  
  // Test different amounts
  const testCases = [
    { address: 'slatesense@speed.app', amount: 500 },
    { address: 'test@speed.app', amount: 1000 },
  ];
  
  for (const testCase of testCases) {
    try {
      await testSpeedAPIPayment(testCase.address, testCase.amount);
      console.log(`\n✅ Test passed for ${testCase.amount} SATS to ${testCase.address}`);
    } catch (error) {
      console.log(`\n❌ Test failed for ${testCase.amount} SATS to ${testCase.address}`);
    }
  }
}

runPaymentTests().catch(console.error);
