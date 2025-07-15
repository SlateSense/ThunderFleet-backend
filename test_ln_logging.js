const winston = require('winston');
require('winston-daily-rotate-file');

// Test the enhanced logging system with Lightning addresses
const playerSessionLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'PLAYER_SESSION' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/player-sessions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '60d',
      maxSize: '20m',
      archiveCompressed: true
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Function to log comprehensive player session data
function logPlayerSession(lightningAddress, sessionData) {
  const sessionEntry = {
    lightningAddress,
    timestamp: new Date().toISOString(),
    sessionData,
    // Core tracking fields
    gameId: sessionData.gameId || null,
    playerId: sessionData.playerId || null,
    betAmount: sessionData.betAmount || null,
    paymentSent: sessionData.paymentSent || false,
    paymentReceived: sessionData.paymentReceived || false,
    gameResult: sessionData.gameResult || null, // 'won', 'lost', 'disconnected'
    disconnectedDuringGame: sessionData.disconnectedDuringGame || false,
    gameStartTime: sessionData.gameStartTime || null,
    gameEndTime: sessionData.gameEndTime || null,
    gameDuration: sessionData.gameDuration || null,
    opponentType: sessionData.opponentType || null, // 'human', 'bot'
    payoutAmount: sessionData.payoutAmount || 0,
    payoutStatus: sessionData.payoutStatus || null // 'sent', 'failed', 'not_applicable'
  };
  
  console.log('Logging player session:', lightningAddress, sessionEntry);
  playerSessionLogger.info(sessionEntry);
  return sessionEntry;
}

// Test the logging system
function testLightningAddressLogging() {
  console.log('\n🧪 Testing Lightning Address-based logging...\n');
  
  // Test 1: User session
  const userSession = {
    event: 'game_ended',
    playerId: 'socket_abc123',
    gameId: 'game_456',
    betAmount: 1000,
    isBot: false,
    joinTime: new Date(Date.now() - 300000).toISOString(),
    paymentSent: true,
    paymentReceived: true,
    gameResult: 'won',
    disconnectedDuringGame: false,
    gameStartTime: new Date(Date.now() - 240000).toISOString(),
    gameEndTime: new Date().toISOString(),
    gameDuration: 240,
    opponentType: 'bot',
    payoutAmount: 1700,
    payoutStatus: 'sent',
    shotsFired: 15,
    shotsHit: 8,
    shipsDestroyed: 5,
    disconnectCount: 0
  };
  
  logPlayerSession('user@speed.app', userSession);
  
  // Test 2: Another user session with different address
  const user2Session = {
    event: 'game_ended',
    playerId: 'socket_def456',
    gameId: 'game_789',
    betAmount: 500,
    isBot: false,
    joinTime: new Date(Date.now() - 180000).toISOString(),
    paymentSent: true,
    paymentReceived: false,
    gameResult: 'lost',
    disconnectedDuringGame: false,
    gameStartTime: new Date(Date.now() - 120000).toISOString(),
    gameEndTime: new Date().toISOString(),
    gameDuration: 120,
    opponentType: 'human',
    payoutAmount: 0,
    payoutStatus: 'not_applicable',
    shotsFired: 12,
    shotsHit: 3,
    shipsDestroyed: 2,
    disconnectCount: 0
  };
  
  logPlayerSession('player2@speed.app', user2Session);
  
  // Test 3: Disconnected player
  const disconnectedSession = {
    event: 'game_ended',
    playerId: 'socket_ghi789',
    gameId: 'game_101',
    betAmount: 1000,
    isBot: false,
    joinTime: new Date(Date.now() - 90000).toISOString(),
    paymentSent: true,
    paymentReceived: false,
    gameResult: 'disconnected',
    disconnectedDuringGame: true,
    gameStartTime: new Date(Date.now() - 60000).toISOString(),
    gameEndTime: new Date().toISOString(),
    gameDuration: 60,
    opponentType: 'human',
    payoutAmount: 0,
    payoutStatus: 'not_applicable',
    shotsFired: 5,
    shotsHit: 2,
    shipsDestroyed: 1,
    disconnectCount: 1,
    disconnectTimes: [new Date(Date.now() - 30000).toISOString()]
  };
  
  logPlayerSession('disconnected@speed.app', disconnectedSession);
  
  console.log('\n✅ Lightning Address logging test completed!');
  console.log('📁 Check logs/player-sessions-*.log for the logged data');
  console.log('🎯 Player data is now saved using Lightning addresses as identifiers');
  console.log('\nTest results:');
  console.log('- user@speed.app: Won game, received payout');
  console.log('- player2@speed.app: Lost game, no payout');
  console.log('- disconnected@speed.app: Disconnected during game');
}

// Run the test
testLightningAddressLogging();
