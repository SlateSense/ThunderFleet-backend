// Test script for 50 SATS betting pattern: W-L-W-W-L-L-L-W-L
// This script tests the pattern logic implementation

const playerBettingHistory = new Map();

// Function to get player's game count for a specific bet amount
function getPlayerGameCount(lightningAddress, betAmount) {
  if (!playerBettingHistory.has(lightningAddress)) {
    return 0;
  }
  const playerHistory = playerBettingHistory.get(lightningAddress);
  if (!playerHistory[betAmount]) {
    return 0;
  }
  return playerHistory[betAmount].gameCount || 0;
}

// Function to increment player's game count for a specific bet amount
function incrementPlayerGameCount(lightningAddress, betAmount) {
  if (!playerBettingHistory.has(lightningAddress)) {
    playerBettingHistory.set(lightningAddress, {});
  }
  const playerHistory = playerBettingHistory.get(lightningAddress);
  if (!playerHistory[betAmount]) {
    playerHistory[betAmount] = { gameCount: 0, lastGameTime: null };
  }
  playerHistory[betAmount].gameCount++;
  playerHistory[betAmount].lastGameTime = new Date().toISOString();
  
  return playerHistory[betAmount].gameCount;
}

// Function to determine if player should win based on 50 sats pattern
function shouldPlayerWinBy50SatsPattern(lightningAddress) {
  const gameCount = getPlayerGameCount(lightningAddress, 50);
  const nextGameNumber = gameCount + 1;
  
  // Pattern: W-L-W-W-L-L-L-W-L (9 game cycle)
  const pattern = [true, false, true, true, false, false, false, true, false];
  const positionInPattern = (nextGameNumber - 1) % 9;
  const shouldWin = pattern[positionInPattern];
  
  console.log(`50 SATS Pattern Check: game ${nextGameNumber}, position ${positionInPattern}, should win: ${shouldWin}`);
  
  return shouldWin;
}

console.log('=== Testing 50 SATS W-L-W-W-L-L-L-W-L Pattern ===\n');

const testAddress = 'testplayer@speed.app';

console.log('Expected pattern: W-L-W-W-L-L-L-W-L (then repeat)');
console.log('Testing 18 games (2 complete cycles):\n');

const results = [];
for (let i = 1; i <= 18; i++) {
  const shouldWin = shouldPlayerWinBy50SatsPattern(testAddress);
  const gameNumber = incrementPlayerGameCount(testAddress, 50);
  const result = shouldWin ? 'WIN' : 'LOSE';
  results.push(result);
  
  const cyclePosition = ((gameNumber - 1) % 9) + 1;
  const cycleNumber = Math.ceil(gameNumber / 9);
  
  console.log(`Game ${gameNumber.toString().padStart(2)}: ${result.padEnd(4)} (Cycle ${cycleNumber}, Position ${cyclePosition})`);
}

console.log('\n=== Pattern Verification ===');
console.log('First 9 games: ', results.slice(0, 9).join('-'));
console.log('Second 9 games:', results.slice(9, 18).join('-'));

// Verify the pattern
const expectedPattern = ['WIN', 'LOSE', 'WIN', 'WIN', 'LOSE', 'LOSE', 'LOSE', 'WIN', 'LOSE'];
let patternCorrect = true;

for (let i = 0; i < 9; i++) {
  if (results[i] !== expectedPattern[i] || results[i + 9] !== expectedPattern[i]) {
    patternCorrect = false;
    console.error(`❌ Pattern mismatch at position ${i + 1}`);
  }
}

if (patternCorrect) {
  console.log('\n✅ Pattern W-L-W-W-L-L-L-W-L is correctly implemented!');
  console.log('✅ Pattern repeats correctly after 9 games');
} else {
  console.log('\n❌ Pattern implementation has errors!');
}

// Test win statistics
const wins = results.filter(r => r === 'WIN').length;
const losses = results.filter(r => r === 'LOSE').length;
const winRate = (wins / results.length * 100).toFixed(1);

console.log('\n=== Statistics for 18 games ===');
console.log(`Wins: ${wins}`);
console.log(`Losses: ${losses}`);
console.log(`Win Rate: ${winRate}%`);
console.log(`Expected Win Rate: 44.4% (4 wins out of 9 games)`);

// Test different player
console.log('\n=== Testing with different player ===');
const testAddress2 = 'anotherplayer@speed.app';

console.log('First 3 games for new player:');
for (let i = 1; i <= 3; i++) {
  const shouldWin = shouldPlayerWinBy50SatsPattern(testAddress2);
  const gameNumber = incrementPlayerGameCount(testAddress2, 50);
  const result = shouldWin ? 'WIN' : 'LOSE';
  console.log(`Game ${gameNumber}: ${result}`);
}

console.log('\n=== Test Complete ===');
console.log('The 50 SATS betting pattern system is ready for use!');
console.log('Pattern: W-L-W-W-L-L-L-W-L');
console.log('- Player wins on games: 1, 3, 4, 8');
console.log('- Player loses on games: 2, 5, 6, 7, 9');
console.log('- Pattern repeats every 9 games');
console.log('- Win rate: 44.4% (favorable for the house)');
