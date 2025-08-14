// Fix for 50 SATS invoice generation
// This script adds special handling for small amounts

const fs = require('fs');
const path = require('path');

console.log('=== FIXING 50 SATS INVOICE GENERATION ===\n');

const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Find the createLightningInvoice function
const functionStart = serverContent.indexOf('async function createLightningInvoice');
const functionEnd = serverContent.indexOf('\n}', functionStart) + 2;
const originalFunction = serverContent.substring(functionStart, functionEnd);

// Create enhanced version with minimum amount handling
const enhancedFunction = `async function createLightningInvoice(amountSats, customerId, orderId) {
  try {
    console.log('Creating Lightning invoice using Speed API:', { amountSats, customerId, orderId });
    
    // Get real-time USD amount for the SATS for logging purposes
    const amountUSD = await convertSatsToUSD(amountSats);
    
    // SPECIAL HANDLING FOR 50 SATS
    // Some payment providers have minimum amounts, so we may need to adjust
    let requestAmount = amountSats;
    let isSmallAmount = false;
    
    if (amountSats === 50) {
      console.log('⚠️ 50 SATS detected - applying special handling for small amount');
      // Try with 50 first, but be prepared to fall back to minimum if needed
      isSmallAmount = true;
    }
    
    // Use the new payments API with Speed Wallet interface - request payment directly in SATS
    const newPayload = {
      currency: 'SATS',
      amount: requestAmount,
      target_currency: 'SATS',
      ttl: 600, // 10 minutes for payment
      description: \`Sea Battle Game - \${amountSats} SATS\`,
      metadata: {
        Order_ID: orderId,
        Customer_ID: customerId,
        Game_Type: 'Sea_Battle',
        Amount_SATS: amountSats.toString(),
        Original_Amount: amountSats.toString()
      }
    };

    console.log('Creating payment with Speed API payload:', newPayload);
    
    let response;
    let retryWithHigherAmount = false;
    
    try {
      response = await axios.post(\`\${SPEED_API_BASE}/payments\`, newPayload, {
        headers: {
          Authorization: \`Basic \${AUTH_HEADER}\`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
    } catch (error) {
      // Check if error is due to minimum amount
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.response?.data?.message || '';
      console.log('Initial request failed:', errorMessage);
      
      if (isSmallAmount && (
        errorMessage.toLowerCase().includes('minimum') || 
        errorMessage.toLowerCase().includes('too small') ||
        errorMessage.toLowerCase().includes('below') ||
        error.response?.status === 400
      )) {
        console.log('50 SATS may be below minimum - trying with 100 SATS as invoice amount');
        retryWithHigherAmount = true;
        
        // Retry with 100 SATS but remember the original amount
        newPayload.amount = 100;
        newPayload.description = 'Sea Battle Game - 50 SATS (Min invoice: 100 SATS)';
        
        response = await axios.post(\`\${SPEED_API_BASE}/payments\`, newPayload, {
          headers: {
            Authorization: \`Basic \${AUTH_HEADER}\`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        
        console.log('Retry successful with 100 SATS invoice for 50 SATS game');
      } else {
        throw error;
      }
    }

    console.log('Speed API response:', response.data);
    
    // Extract payment details from Speed API response
    const paymentData = response.data;
    const invoiceId = paymentData.id;
    
    // Speed API doesn't return hosted_invoice_url for SATS payments
    // Instead, it returns the Lightning invoice directly
    let lightningInvoice = paymentData.payment_method_options?.lightning?.payment_request ||
                          paymentData.lightning_invoice || 
                          paymentData.invoice || 
                          paymentData.payment_request ||
                          paymentData.bolt11;
    
    // For Speed API, we can construct a Speed interface URL if needed
    // But for now, we'll use the Lightning invoice directly
    const hostedInvoiceUrl = paymentData.hosted_invoice_url || null;
    
    if (!lightningInvoice) {
      console.log('Warning: No direct Lightning invoice found in response');
    }
    
    if (!invoiceId) {
      throw new Error('No invoice ID returned from Speed API');
    }

    return {
      invoiceId,
      hostedInvoiceUrl: hostedInvoiceUrl || lightningInvoice, // Fallback to invoice if no hosted URL
      lightningInvoice,
      amountUSD,
      amountSats: amountSats, // Always return original amount
      actualInvoiceAmount: retryWithHigherAmount ? 100 : amountSats,
      speedInterfaceUrl: hostedInvoiceUrl || lightningInvoice // Use Lightning invoice as fallback
    };
    
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    const errorStatus = error.response?.status || 'No status';
    const errorDetails = error.response?.data || error.message;
    console.error('Create Invoice Error:', {
      message: errorMessage,
      status: errorStatus,
      details: errorDetails,
    });
    
    // Special error message for 50 SATS
    if (amountSats === 50 && errorMessage.toLowerCase().includes('minimum')) {
      throw new Error(\`50 SATS may be below the payment provider's minimum. Please try a higher amount or contact support.\`);
    }
    
    throw new Error(\`Failed to create invoice: \${errorMessage} (Status: \${errorStatus})\`);
  }
}`;

// Replace the function
serverContent = serverContent.substring(0, functionStart) + enhancedFunction + serverContent.substring(functionEnd);

// Write the updated file
fs.writeFileSync(serverPath, serverContent, 'utf8');

console.log('✅ Updated createLightningInvoice function with 50 SATS special handling');
console.log('\nChanges made:');
console.log('1. Added detection for 50 SATS amounts');
console.log('2. Added retry logic with 100 SATS if 50 SATS fails due to minimum');
console.log('3. Invoice will be for 100 SATS but game still treats it as 50 SATS bet');
console.log('4. Better error messages for minimum amount issues');
console.log('\n⚠️ NOTE: If Speed API has a minimum of 100+ SATS, the 50 SATS bet will show a 100 SATS invoice');
console.log('   but the game logic and payouts will still be based on 50 SATS.');
console.log('\nPlease restart the backend server for changes to take effect.');
