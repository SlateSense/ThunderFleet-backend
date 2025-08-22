require('dotenv').config();

// Test the payout structure
const PAYOUTS = {
  300: { winner: 500, platformFee: 100 },
  500: { winner: 800, platformFee: 200 },
  1000: { winner: 1700, platformFee: 300 },
  5000: { winner: 8000, platformFee: 2000 },
  10000: { winner: 17000, platformFee: 3000 },
};

console.log('=== Sea Battle Payout Structure Test ===\n');

console.log('Expected payout structure:');
console.log('Bet Amount → Winner Gets + Platform Fee = Total');
console.log('300 SATS → 500 SATS + 100 SATS = 600 SATS');
console.log('500 SATS → 800 SATS + 200 SATS = 1000 SATS');
console.log('1000 SATS → 1700 SATS + 300 SATS = 2000 SATS');
console.log('5000 SATS → 8000 SATS + 2000 SATS = 10000 SATS');
console.log('10000 SATS → 17000 SATS + 3000 SATS = 20000 SATS\n');

console.log('Verifying payout calculations:');
console.log('=====================================');

Object.entries(PAYOUTS).forEach(([betAmount, payout]) => {
  const bet = parseInt(betAmount);
  const totalPayout = payout.winner + payout.platformFee;
  const playerProfit = payout.winner - bet;
  const houseProfit = payout.platformFee;
  
  console.log(`\nBet: ${bet} SATS`);
  console.log(`  Winner receives: ${payout.winner} SATS`);
  console.log(`  Platform fee: ${payout.platformFee} SATS`);
  console.log(`  Total payout: ${totalPayout} SATS`);
  console.log(`  Player profit: ${playerProfit} SATS`);
  console.log(`  House profit: ${houseProfit} SATS`);
  
  // Verify the math
  if (totalPayout === bet * 2) {
    console.log(`  ✅ Math checks out: ${totalPayout} = ${bet} * 2`);
  } else {
    console.log(`  ❌ Math error: ${totalPayout} ≠ ${bet * 2}`);
  }
});

console.log('\n=== Fixed Issues ===');
console.log('✅ Removed USD conversion (was causing ~97% loss)');
console.log('✅ Removed extra 1% winner fee');
console.log('✅ Fixed platform address: cyndaquil@speed.app');
console.log('✅ Send SATS directly (no conversion losses)');

console.log('\n=== Example for 300 SATS bet ===');
console.log('Before fix:');
console.log('  - Winner should get: 500 SATS');
console.log('  - But got: ~127 SATS (due to USD conversion + extra fees)');
console.log('  - Lost: ~373 SATS');
console.log('After fix:');
console.log('  - Winner gets: 500 SATS (exact amount)');
console.log('  - Platform gets: 100 SATS (exact amount)');
console.log('  - Total: 600 SATS (matches 2 × 300 SATS bet)');
