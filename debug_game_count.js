// Debug script to test game count tracking and display
// This simulates exactly what happens in the server

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
  
  return shouldWin;
}

// Simulate the server's addPlayer logic
function simulateGameSetup(lightningAddress, betAmount, gameLabel) {
  console.log(`\n=== ${gameLabel} SETUP ===`);
  
  // Check current game count BEFORE any changes (this is what server shows in debug)
  const currentGameCount = getPlayerGameCount(lightningAddress, betAmount);
  console.log('CURRENT Game Count (before increment):', currentGameCount);
  
  // Check pattern BEFORE incrementing count
  const shouldHumanWin = shouldPlayerWinByPattern(lightningAddress, betAmount);
  console.log('Should Human Win (pattern check):', shouldHumanWin);
  
  // Increment the game count (this happens in addPlayer)
  const gameNumber = incrementPlayerGameCount(lightningAddress, betAmount);
  console.log('Game Number (after increment):', gameNumber);
  
  // This is what gets sent to client in startPlacing
  const isEvenGame = gameNumber % 2 === 0;
  console.log('Is Even Game (sent to client):', isEvenGame);
  console.log('Should Human Win (sent to client):', shouldHumanWin);
  
  // Verify the pattern calculation manually
  const nextGameNumber = currentGameCount + 1;
  const shouldWinByPattern = nextGameNumber % 2 === 0;
  console.log('MANUAL VERIFICATION:');
  console.log('  Next Game Number:', nextGameNumber);
  console.log('  Should Win (even game):', shouldWinByPattern);
  console.log('  Pattern Match:', shouldHumanWin === shouldWinByPattern ? 'CORRECT' : 'MISMATCH!');
  
  console.log('Pattern Explanation:', shouldHumanWin ? 'Even game - Human should WIN' : 'Odd game - Human should LOSE');
  
  return {
    gameNumber,
    shouldHumanWin,
    isEvenGame,
    currentGameCountBeforeIncrement: currentGameCount
  };
}

console.log('=== DEBUGGING GAME COUNT DISPLAY ISSUE ===');
console.log('Expected: Game 1 = LOSE, Game 2 = WIN, Game 3 = LOSE, Game 4 = WIN\n');

const testAddress = 'testuser@speed.app';
const betAmount = 500;

// Simulate 4 games exactly as the server does
const game1 = simulateGameSetup(testAddress, betAmount, 'First Game');
const game2 = simulateGameSetup(testAddress, betAmount, 'Second Game');
const game3 = simulateGameSetup(testAddress, betAmount, 'Third Game');
const game4 = simulateGameSetup(testAddress, betAmount, 'Fourth Game');

console.log('\n=== ANALYSIS ===');
console.log('The issue is likely in how the client interprets the gameNumber.');
console.log('Server sends:', {
  game1: { gameNumber: game1.gameNumber, shouldWin: game1.shouldHumanWin },
  game2: { gameNumber: game2.gameNumber, shouldWin: game2.shouldHumanWin },
  game3: { gameNumber: game3.gameNumber, shouldWin: game3.shouldHumanWin },
  game4: { gameNumber: game4.gameNumber, shouldWin: game4.shouldHumanWin }
});

console.log('\nIf client shows "Game 1" for second game, it might be using:');
console.log('- currentGameCountBeforeIncrement instead of gameNumber');
console.log('- Or incorrectly decrementing the gameNumber');
