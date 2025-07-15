const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Configuration
const PORT = process.env.LOCAL_LOG_PORT || 3001;
const LOGS_DIR = path.join(__dirname, 'received-logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Sea Battle Local Log Receiver'
  });
});

// Main log receiver endpoint
app.post('/logs', (req, res) => {
  try {
    const logEntry = req.body;
    
    // Validate log entry
    if (!logEntry || !logEntry.logType || !logEntry.data) {
      return res.status(400).json({ error: 'Invalid log entry format' });
    }

    console.log(`🎮 RECEIVED LOG: ${logEntry.logType}`);
    console.log(`📅 Timestamp: ${logEntry.timestamp}`);
    console.log(`📊 Data:`, JSON.stringify(logEntry.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Process different log types
    switch (logEntry.logType) {
      case 'player-session':
        handlePlayerSession(logEntry);
        break;
      case 'payment':
        handlePayment(logEntry);
        break;
      case 'game-event':
        handleGameEvent(logEntry);
        break;
      case 'error':
        handleError(logEntry);
        break;
      default:
        console.log(`❓ Unknown log type: ${logEntry.logType}`);
    }

    // Save to file
    saveLogToFile(logEntry);

    res.json({ 
      success: true, 
      message: 'Log received and processed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error processing log:', error);
    res.status(500).json({ error: 'Failed to process log' });
  }
});

// Handle player session logs
function handlePlayerSession(logEntry) {
  const { lightningAddress, sessionData } = logEntry.data;
  
  console.log(`👤 PLAYER: ${lightningAddress}`);
  console.log(`🎯 Event: ${sessionData.event}`);
  
  if (sessionData.betAmount) {
    console.log(`💰 Bet: ${sessionData.betAmount} SATS`);
  }
  
  if (sessionData.gameResult) {
    console.log(`🏆 Result: ${sessionData.gameResult}`);
  }
  
  if (sessionData.payoutAmount) {
    console.log(`💸 Payout: ${sessionData.payoutAmount} SATS`);
  }
  
  if (sessionData.gameDuration) {
    console.log(`⏱️ Duration: ${sessionData.gameDuration} seconds`);
  }

  // Save to player-specific file
  const today = new Date().toISOString().split('T')[0];
  const playerFile = path.join(LOGS_DIR, `player-${lightningAddress.replace('@', '_at_')}-${today}.json`);
  const playerLogLine = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(playerFile, playerLogLine);
}

// Handle payment logs
function handlePayment(logEntry) {
  const { playerId, paymentData } = logEntry.data;
  
  console.log(`💳 PAYMENT: ${paymentData.event}`);
  console.log(`👤 Player: ${playerId}`);
  
  if (paymentData.amount) {
    console.log(`💰 Amount: ${paymentData.amount} SATS`);
  }
}

// Handle game event logs
function handleGameEvent(logEntry) {
  const { gameId, eventData } = logEntry.data;
  
  console.log(`🎮 GAME EVENT: ${eventData.event}`);
  console.log(`🎯 Game ID: ${gameId}`);
}

// Handle error logs
function handleError(logEntry) {
  const { errorData } = logEntry.data;
  
  console.log(`❌ ERROR: ${errorData.message || 'Unknown error'}`);
  console.log(`📍 Details:`, errorData);
}

// Save log to file
function saveLogToFile(logEntry) {
  const today = new Date().toISOString().split('T')[0];
  const filename = `${logEntry.logType}-${today}.json`;
  const filepath = path.join(LOGS_DIR, filename);
  
  const logLine = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(filepath, logLine);
}

// Endpoint to view recent logs
app.get('/logs/recent', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const files = fs.readdirSync(LOGS_DIR).filter(file => file.includes(today));
    
    const recentLogs = [];
    files.forEach(file => {
      const filepath = path.join(LOGS_DIR, file);
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      lines.slice(-10).forEach(line => { // Get last 10 entries from each file
        try {
          recentLogs.push(JSON.parse(line));
        } catch (e) {
          // Skip invalid JSON lines
        }
      });
    });
    
    // Sort by timestamp
    recentLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    res.json({
      success: true,
      logs: recentLogs.slice(-20) // Return last 20 logs
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Sea Battle Local Log Receiver started');
  console.log(`📡 Listening on: http://0.0.0.0:${PORT}`);
  console.log(`📁 Logs directory: ${LOGS_DIR}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Recent logs: http://localhost:${PORT}/logs/recent`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎯 Ready to receive logs from Render server!');
  console.log('═══════════════════════════════════════════════════════════');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down log receiver...');
  process.exit(0);
});

module.exports = app;
