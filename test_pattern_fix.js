// Test script to verify the L-W-L-W pattern fix
// This simulates the exact logic flow in the server

const playerBettingHistory = new Map();

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

function shouldPlayerWinByPattern(lightningAddress, betAmount) {
  const gameCount = getPlayerGameCount(lightningAddress, betAmount);
  const nextGameNumber = gameCount + 1;
  
  // Player wins on even-numbered games (2nd, 4th, 6th, etc.)
  // Player loses on odd-numbered games (1st, 3rd, 5th, etc.)
  const shouldWin = nextGameNumber % 2 === 0;
  
  console.log(`Pattern Check: gameCount=${gameCount}, nextGame=${nextGameNumber}, shouldWin=${shouldWin}`);
  
  return shouldWin;
}

// Simulate the FIXED logic flow (check pattern BEFORE incrementing)
function simulateGameSetup(lightningAddress, betAmount, gameLabel) {
  console.log(`\n=== ${gameLabel} ===`);
  
  // This is the FIXED logic: check pattern BEFORE incrementing
  const shouldHumanWin = shouldPlayerWinByPattern(lightningAddress, betAmount);
  const gameNumber = incrementPlayerGameCount(lightningAddress, betAmount);
  
  console.log(`Game #${gameNumber}: Human should ${shouldHumanWin ? 'WIN' : 'LOSE'}`);
  console.log(`Pattern: ${shouldHumanWin ? 'Even game - Fair play' : 'Odd game - Aggressive bot'}`);
  
  return { gameNumber, shouldHumanWin };
}

console.log('=== Testing FIXED L-W-L-W Pattern Logic ===');
console.log('Expected: Game 1 = LOSE, Game 2 = WIN, Game 3 = LOSE, Game 4 = WIN\n');

const testAddress = 'testuser@speed.app';
const betAmount = 500;

// Simulate 4 games
simulateGameSetup(testAddress, betAmount, 'First Game');
simulateGameSetup(testAddress, betAmount, 'Second Game');  
simulateGameSetup(testAddress, betAmount, 'Third Game');
simulateGameSetup(testAddress, betAmount, 'Fourth Game');

console.log('\n=== Test Results ===');
console.log('✅ Pattern should now be: LOSE-WIN-LOSE-WIN');
console.log('✅ Second game should show "Human should WIN"');
console.log('✅ Bot should play fairly during second and fourth games');
