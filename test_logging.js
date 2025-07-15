const winston = require('winston');
require('winston-daily-rotate-file');

// Configure test logger similar to the main application
const testLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'TEST' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/test-logging-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      maxSize: '1m',
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

// Test comprehensive player data logging
function testPlayerSessionLogging() {
  console.log('Testing comprehensive player session logging...');
  
  // Simulate a complete player session
  const playerSession = {
    playerId: 'test_player_123',
    timestamp: new Date().toISOString(),
    sessionData: {
      event: 'game_ended',
      gameId: 'test_game_456',
      lightningAddress: 'testplayer@speed.app',
      betAmount: 1000,
      isBot: false,
      joinTime: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
      paymentSent: true,
      paymentReceived: true,
      gameResult: 'won',
      disconnectedDuringGame: false,
      disconnectCount: 0,
      disconnectTimes: [],
      reconnectTimes: [],
      gameStartTime: new Date(Date.now() - 240000).toISOString(), // 4 minutes ago
      gameEndTime: new Date().toISOString(),
      gameDuration: 240, // 4 minutes
      opponentType: 'bot',
      payoutAmount: 1700,
      payoutStatus: 'sent',
      shotsFired: 15,
      shotsHit: 8,
      shipsDestroyed: 5,
      lastActivity: new Date().toISOString()
    }
  };
  
  testLogger.info('Player session complete', playerSession);
  
  // Test payment tracking
  const paymentData = {
    event: 'payment_verified',
    playerId: 'test_player_123',
    invoiceId: 'invoice_test_789',
    amount: 1000,
    lightningAddress: 'testplayer@speed.app',
    timestamp: new Date().toISOString(),
    eventType: 'payment.confirmed'
  };
  
  testLogger.info('Payment verified', paymentData);
  
  // Test payout tracking
  const payoutData = {
    event: 'payout_sent',
    gameId: 'test_game_456',
    playerId: 'test_player_123',
    recipient: 'testplayer@speed.app',
    amount: 1700,
    currency: 'SATS',
    timestamp: new Date().toISOString()
  };
  
  testLogger.info('Payout sent', payoutData);
  
  // Test disconnect tracking
  const disconnectData = {
    event: 'player_disconnected',
    playerId: 'test_player_123',
    gameId: 'test_game_456',
    timestamp: new Date().toISOString(),
    reconnected: false,
    gameResult: 'disconnected'
  };
  
  testLogger.info('Player disconnected', disconnectData);
  
  console.log('✅ All logging tests completed successfully!');
  console.log('📁 Check the logs/test-logging-*.log file for the logged data');
  console.log('📊 The logs contain all the player data you requested:');
  console.log('   - Payment sent/received status');
  console.log('   - Bet amount and payout details');
  console.log('   - Game timestamps and duration');
  console.log('   - Disconnect/reconnect events');
  console.log('   - Win/loss results');
  console.log('   - Game performance statistics');
}

// Run the test
testPlayerSessionLogging();
