require('dotenv').config();
const axios = require('axios');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

async function checkBalance() {
  console.log('=== Checking Speed Wallet Balance and Account Info ===\n');
  
  if (!SPEED_WALLET_SECRET_KEY) {
    console.error('❌ SPEED_WALLET_SECRET_KEY not found in environment variables');
    return;
  }
  
  console.log(`Using API key: ${SPEED_WALLET_SECRET_KEY.substring(0, 20)}...`);
  
  try {
    // Check balance endpoint
    console.log('\n--- Checking account balance ---');
    const balanceResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/balance`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ Balance Response:', JSON.stringify(balanceResponse.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Balance check failed - Status:', error.response.status);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Balance check failed:', error.message);
    }
  }
  
  try {
    // Check account endpoint
    console.log('\n--- Checking account info ---');
    const accountResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/account`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ Account Response:', JSON.stringify(accountResponse.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Account check failed - Status:', error.response.status);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Account check failed:', error.message);
    }
  }
  
  try {
    // Check if there are wallets endpoint
    console.log('\n--- Checking wallets ---');
    const walletsResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/wallets`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ Wallets Response:', JSON.stringify(walletsResponse.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Wallets check failed - Status:', error.response.status);
      console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Wallets check failed:', error.message);
    }
  }
}

checkBalance().catch(console.error);
