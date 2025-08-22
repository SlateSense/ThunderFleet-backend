require('dotenv').config();
const axios = require('axios');

// Test function to check Lightning address resolution
async function testLightningAddress(address, amountSats) {
  try {
    console.log('Testing Lightning address:', address, 'with amount:', amountSats, 'SATS');
    
    const [username, domain] = address.split('@');
    if (!username || !domain) {
      throw new Error('Invalid Lightning address format');
    }

    const lnurl = `https://${domain}/.well-known/lnurlp/${username}`;
    console.log('Fetching LNURL metadata from:', lnurl);

    const metadataResponse = await axios.get(lnurl, { timeout: 10000 });
    const metadata = metadataResponse.data;
    console.log('Received LNURL metadata:', JSON.stringify(metadata, null, 2));

    if (metadata.tag !== 'payRequest') {
      throw new Error('Invalid LNURL metadata: not a payRequest');
    }

    const amountMsats = amountSats * 1000;
    console.log(`Amount check: ${amountSats} SATS = ${amountMsats} msats`);
    console.log(`Min sendable: ${metadata.minSendable} msats = ${metadata.minSendable / 1000} SATS`);
    console.log(`Max sendable: ${metadata.maxSendable} msats = ${metadata.maxSendable / 1000} SATS`);

    if (amountMsats < metadata.minSendable || amountMsats > metadata.maxSendable) {
      const errorMsg = `Invalid amount: ${amountSats} SATS (${amountMsats} msats) is not within the sendable range of ${metadata.minSendable / 1000} to ${metadata.maxSendable / 1000} SATS`;
      console.error('AMOUNT ERROR:', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('✅ Amount is valid!');
    console.log('Callback URL:', metadata.callback);
    
    // Test invoice generation
    const invoiceResponse = await axios.get(`${metadata.callback}?amount=${amountMsats}`, { timeout: 10000 });
    console.log('Invoice response:', invoiceResponse.data);
    
    if (invoiceResponse.data.pr) {
      console.log('✅ Invoice generated successfully!');
      console.log('Invoice:', invoiceResponse.data.pr.substring(0, 50) + '...');
    } else {
      console.log('❌ No invoice in response');
    }
    
  } catch (error) {
    console.error('❌ Error testing Lightning address:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Test different scenarios
async function runTests() {
  console.log('=== Lightning Address Resolution Test ===\n');
  
  // Test various payout amounts
  const testAmounts = [500, 800, 1700, 8000, 17000];
  const testAddress = 'cyndaquil@speed.app';
  
  for (const amount of testAmounts) {
    console.log(`\n--- Testing ${amount} SATS to ${testAddress} ---`);
    await testLightningAddress(testAddress, amount);
  }
  
  // Test with a different address
  console.log(`\n--- Testing with different address ---`);
  await testLightningAddress('test@speed.app', 1000);
}

runTests().catch(console.error);
