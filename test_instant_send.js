require('dotenv').config();
const axios = require('axios');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

// New Speed Wallet instant send function using the instant-send API
async function sendInstantPayment(withdrawRequest, amount, currency = 'USD', targetCurrency = 'SATS', note = '') {
  try {
    console.log('Sending instant payment via Speed Wallet instant-send API:', {
      withdrawRequest,
      amount,
      currency,
      targetCurrency,
      note
    });

    const instantSendPayload = {
      amount: parseFloat(amount),
      currency: currency,
      target_currency: targetCurrency,
      withdraw_method: 'lightning',
      withdraw_request: withdrawRequest,
      note: note
    };

    console.log('Instant send payload:', JSON.stringify(instantSendPayload, null, 2));

    const response = await axios.post(
      `${SPEED_WALLET_API_BASE}/send`,
      instantSendPayload,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 10000,
      }
    );

    console.log('✅ Instant send response:', response.data);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    const errorStatus = error.response?.status || 'No status';
    const errorDetails = error.response?.data || error.message;
    console.error('❌ Instant Send Payment Error:', {
      message: errorMessage,
      status: errorStatus,
      details: errorDetails,
    });
    throw new Error(`Failed to send instant payment: ${errorMessage} (Status: ${errorStatus})`);
  }
}

async function testInstantSend() {
  console.log('=== Testing Speed Wallet Instant Send API ===\n');
  
  if (!SPEED_WALLET_SECRET_KEY) {
    console.error('❌ SPEED_WALLET_SECRET_KEY not found in environment variables');
    return;
  }
  
  console.log(`Using API key: ${SPEED_WALLET_SECRET_KEY.substring(0, 20)}...`);
  
  // Test cases based on the provided example
  const testCases = [
    {
      name: 'Small SATS amount to vivekshah',
      withdrawRequest: 'vivekshah@speed.app',
      amount: 100,
      currency: 'SATS',
      targetCurrency: 'SATS',
      note: 'Small test payment'
    },
    {
      name: 'Small USD amount',
      withdrawRequest: 'vivekshah@speed.app',
      amount: 1.00,
      currency: 'USD',
      targetCurrency: 'SATS',
      note: 'Small USD test payment'
    },
    {
      name: 'Test with different lightning address',
      withdrawRequest: 'slatesense@speed.app',
      amount: 50,
      currency: 'SATS',
      targetCurrency: 'SATS',
      note: 'Test to slatesense address'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n--- Testing: ${testCase.name} ---`);
    try {
      const result = await sendInstantPayment(
        testCase.withdrawRequest,
        testCase.amount,
        testCase.currency,
        testCase.targetCurrency,
        testCase.note
      );
      console.log(`✅ Success for ${testCase.name}`);
      console.log(`   Transaction ID: ${result.id || 'Not provided'}`);
      console.log(`   Status: ${result.status || 'Not provided'}`);
    } catch (error) {
      console.log(`❌ Failed for ${testCase.name}: ${error.message}`);
    }
  }
}

// Test with just a lightning invoice instead of lightning address
async function testWithLightningInvoice() {
  console.log('\n=== Testing with Lightning Invoice ===\n');
  
  try {
    // First generate an invoice from a lightning address
    const testAddress = 'test@speed.app';
    const testAmount = 1000; // 1000 sats
    
    console.log('1. Generating invoice from lightning address...');
    const [username, domain] = testAddress.split('@');
    const lnurl = `https://${domain}/.well-known/lnurlp/${username}`;
    const metadataResponse = await axios.get(lnurl, { timeout: 5000 });
    const metadata = metadataResponse.data;
    const amountMsats = testAmount * 1000;
    const invoiceResponse = await axios.get(`${metadata.callback}?amount=${amountMsats}`, { timeout: 5000 });
    const invoice = invoiceResponse.data.pr;
    
    console.log(`✅ Generated invoice: ${invoice.substring(0, 50)}...`);
    
    // Now try to use this invoice with instant send
    console.log('\n2. Testing instant send with lightning invoice...');
    const result = await sendInstantPayment(
      invoice,
      11.25,
      'USD',
      'SATS',
      'Test with lightning invoice instead of address'
    );
    
    console.log('✅ Success with lightning invoice!');
    console.log(`   Transaction ID: ${result.id || 'Not provided'}`);
    
  } catch (error) {
    console.log(`❌ Failed with lightning invoice: ${error.message}`);
  }
}

async function runAllTests() {
  await testInstantSend();
  await testWithLightningInvoice();
}

runAllTests().catch(console.error);
