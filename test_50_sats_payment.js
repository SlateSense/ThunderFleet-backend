require('dotenv').config();
const axios = require('axios');

// Speed API configuration
const SPEED_API_BASE = process.env.SPEED_API_BASE || 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

async function test50SatsInvoice() {
  try {
    console.log('=== Testing 50 SATS Invoice Creation ===\n');
    
    // Test creating an invoice for 50 SATS
    const testAmounts = [50];
    
    for (const amountSats of testAmounts) {
      console.log(`\nTesting ${amountSats} SATS invoice creation...`);
      
      const payload = {
        currency: 'SATS',
        amount: amountSats,
        target_currency: 'SATS',
        ttl: 600, // 10 minutes
        description: `Test Invoice - ${amountSats} SATS`,
        metadata: {
          test: true,
          amount_sats: amountSats.toString()
        }
      };
      
      console.log('Payload:', JSON.stringify(payload, null, 2));
      
      try {
        const response = await axios.post(`${SPEED_API_BASE}/payments`, payload, {
          headers: {
            Authorization: `Basic ${AUTH_HEADER}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        
        console.log(`✅ SUCCESS for ${amountSats} SATS!`);
        console.log('Full Response:', JSON.stringify(response.data, null, 2));
        console.log('Invoice ID:', response.data.id);
        console.log('Hosted URL:', response.data.hosted_invoice_url);
        
        // Check if Lightning invoice is present
        const lightningInvoice = response.data.payment_method_options?.lightning?.payment_request ||
                                response.data.lightning_invoice || 
                                response.data.invoice || 
                                response.data.payment_request ||
                                response.data.bolt11;
        
        if (lightningInvoice) {
          console.log('Lightning Invoice:', lightningInvoice.substring(0, 50) + '...');
        } else {
          console.log('No direct Lightning invoice, use hosted URL');
        }
        
      } catch (error) {
        console.log(`❌ FAILED for ${amountSats} SATS`);
        
        if (error.response) {
          console.log('Error Status:', error.response.status);
          console.log('Error Message:', error.response.data?.errors?.[0]?.message || error.response.data);
          
          // Check if it's a minimum amount error
          if (error.response.data?.errors?.[0]?.message?.toLowerCase().includes('minimum') ||
              error.response.data?.errors?.[0]?.message?.toLowerCase().includes('invalid amount')) {
            console.log('⚠️  This appears to be a minimum amount issue');
          }
        } else {
          console.log('Error:', error.message);
        }
      }
      
      console.log('-'.repeat(50));
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Also test Lightning address resolution for small amounts
async function testLightningAddressMinimum() {
  console.log('\n=== Testing Lightning Address Minimum Amount ===\n');
  
  const address = 'slatesense@speed.app';
  const [username, domain] = address.split('@');
  const lnurl = `https://${domain}/.well-known/lnurlp/${username}`;
  
  try {
    const response = await axios.get(lnurl, { timeout: 5000 });
    const metadata = response.data;
    
    console.log('Lightning Address:', address);
    console.log('Min sendable:', metadata.minSendable, 'msats =', metadata.minSendable / 1000, 'SATS');
    console.log('Max sendable:', metadata.maxSendable, 'msats =', metadata.maxSendable / 1000, 'SATS');
    
    if (metadata.minSendable > 50000) { // 50 SATS = 50,000 msats
      console.log('\n⚠️  WARNING: Minimum sendable is higher than 50 SATS!');
      console.log(`Minimum required: ${metadata.minSendable / 1000} SATS`);
    } else {
      console.log('\n✅ 50 SATS should be acceptable for this Lightning address');
    }
    
  } catch (error) {
    console.error('Failed to check Lightning address:', error.message);
  }
}

async function runTests() {
  if (!SPEED_WALLET_SECRET_KEY) {
    console.error('❌ SPEED_WALLET_SECRET_KEY not found in environment variables');
    console.error('Please ensure your .env file contains SPEED_WALLET_SECRET_KEY');
    return;
  }
  
  console.log('Using API Base:', SPEED_API_BASE);
  console.log('Auth configured: Yes\n');
  
  // Test invoice creation
  await test50SatsInvoice();
  
  // Test Lightning address minimum
  await testLightningAddressMinimum();
}

runTests().catch(console.error);
