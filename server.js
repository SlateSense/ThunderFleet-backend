require('dotenv').config();

const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const cors = require('cors');
const axios = require('axios');
const { bech32 } = require('bech32');
const cron = require('node-cron');
const crypto = require('crypto');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const queue = require('express-queue');
require('winston-daily-rotate-file');
const logForwarder = require('./log-forwarder');

// Configure Winston logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Transaction logs - keep longer for compliance
    new winston.transports.DailyRotateFile({
      filename: 'logs/transactions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',
      maxSize: '20m',
      archiveCompressed: true,
      level: 'info'
    }),
    
    // Game logs - general game events
    new winston.transports.DailyRotateFile({
      filename: 'logs/games-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
      archiveCompressed: true,
      level: 'info'
    }),
    
    // Error logs - keep longer for debugging
    new winston.transports.DailyRotateFile({
      filename: 'logs/errors-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '60d',
      maxSize: '10m',
      archiveCompressed: true,
      level: 'error'
    }),
    
    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Create separate loggers for different types of events
const gameLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'GAME' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/games-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
      archiveCompressed: true
    })
  ]
});

const transactionLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'TRANSACTION' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/transactions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',
      maxSize: '20m',
      archiveCompressed: true
    })
  ]
});

const playerLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'PLAYER' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/players-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '10m',
      archiveCompressed: true
    })
  ]
});

// Enhanced comprehensive player session logger
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
  
  console.log('🎮 PLAYER SESSION LOG:', lightningAddress);
  console.log('📊 Game Result:', sessionEntry.gameResult);
  console.log('💰 Bet Amount:', sessionEntry.betAmount, 'SATS');
  console.log('🏆 Payout:', sessionEntry.payoutAmount, 'SATS');
  console.log('⏱️ Game Duration:', sessionEntry.gameDuration, 'seconds');
  console.log('🔗 Full Data:', JSON.stringify(sessionEntry, null, 2));
  console.log('----------------------------------------');
  
  // Forward to local PC
  logForwarder.logPlayerSession(lightningAddress, sessionEntry.sessionData);
  
  playerSessionLogger.info(sessionEntry);
  return sessionEntry;
}

// Utility function to create comprehensive game summary
function logGameSummary(gameId, players, winner, betAmount, gameStartTime, gameEndTime) {
  const gameSummary = {
    event: 'game_summary',
    gameId,
    betAmount,
    gameStartTime,
    gameEndTime,
    gameDuration: gameEndTime && gameStartTime ? 
      Math.floor((new Date(gameEndTime) - new Date(gameStartTime)) / 1000) : null,
    winner,
    players: Object.keys(players).map(playerId => ({
      playerId,
      lightningAddress: players[playerId].lightningAddress,
      isBot: players[playerId].isBot,
      isWinner: playerId === winner
    })),
    timestamp: new Date().toISOString()
  };
  
  gameLogger.info(gameSummary);
  return gameSummary;
}

const app = express();

app.set('trust proxy', true);

app.use(cors({
  origin: '*',
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Signature"],
}));

app.use(express.json());

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.get('/', (req, res) => {
  res.status(200).send('Thunderfleet Backend is running');
});

// NOTE: Simple '/health' route removed; enhanced JSON health endpoint is defined later.

// API endpoint to get payout information for display in the app
app.get('/api/payout-info', (req, res) => {
  try {
    const payoutInfo = getPayoutInfo();
    res.status(200).json(payoutInfo);
  } catch (error) {
    console.error('Error getting payout info:', error);
    res.status(500).json({ error: 'Failed to get payout information' });
  }
});

// API endpoint to handle user session with acct_id
app.post('/api/user-session', express.json(), (req, res) => {
  try {
    const { acct_id, lightning_address } = req.body;
    
    if (!acct_id) {
      return res.status(400).json({ error: 'acct_id is required' });
    }
    
    // Check if user already has a stored Lightning address
    const existingAddress = getLightningAddressByAcctId(acct_id);
    
    if (existingAddress) {
      // User already has a Lightning address stored
      return res.status(200).json({
        message: 'User session found',
        acct_id,
        lightning_address: existingAddress,
        requires_lightning_address: false
      });
    }
    
    if (lightning_address) {
      // Store the new Lightning address mapping
      mapUserAcctId(acct_id, lightning_address);
      return res.status(200).json({
        message: 'Lightning address stored successfully',
        acct_id,
        lightning_address,
        requires_lightning_address: false
      });
    }
    
    // User needs to provide Lightning address
    return res.status(200).json({
      message: 'Lightning address required',
      acct_id,
      requires_lightning_address: true
    });
    
  } catch (error) {
    console.error('Error handling user session:', error);
    res.status(500).json({ error: 'Failed to handle user session' });
  }
});

// API endpoint to get player history and stats
app.get('/api/history/:lightning_address', async (req, res) => {
  try {
    const { lightning_address } = req.params;
    
    if (!lightning_address) {
      return res.status(400).json({ error: 'Lightning address is required' });
    }
    
    // Get player history from logs (this would be enhanced with a proper database)
    const playerHistory = await getPlayerHistory(lightning_address);
    const playerStats = calculatePlayerStats(playerHistory);
    
    res.status(200).json({
      lightning_address,
      history: playerHistory,
      stats: playerStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching player history:', error);
    res.status(500).json({ error: 'Failed to fetch player history' });
  }
});

// API endpoint to get player stats summary
app.get('/api/stats/:lightning_address', (req, res) => {
  try {
    const { lightning_address } = req.params;
    
    if (!lightning_address) {
      return res.status(400).json({ error: 'Lightning address is required' });
    }
    
    const playerHistory = getPlayerHistory(lightning_address);
    const stats = calculatePlayerStats(playerHistory);
    
    res.status(200).json({
      lightning_address,
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// API endpoint to get Speed Wallet transaction history (proxy)
app.get('/api/speed-transactions/:lightning_address', async (req, res) => {
  try {
    const { lightning_address } = req.params;
    
    if (!lightning_address) {
      return res.status(400).json({ error: 'Lightning address is required' });
    }
    
    // Call Speed API to get transaction history
    const speedTransactions = await fetchSpeedWalletTransactions(lightning_address);
    
    res.status(200).json({
      lightning_address,
      transactions: speedTransactions,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching Speed transactions:', error);
    res.status(500).json({ error: 'Failed to fetch Speed wallet transactions' });
  }
});

// API endpoint to get player history by account ID
app.get('/api/history/account/:acctId', async (req, res) => {
  try {
    const { acctId } = req.params;
    
    if (!acctId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }
    
    // Get Lightning address from acct_id mapping
    const lightningAddress = getLightningAddressByAcctId(acctId);
    
    if (!lightningAddress) {
      console.log(`No Lightning address found for acct_id: ${acctId}`);
      return res.status(404).json({ 
        error: 'No Lightning address associated with this account',
        acct_id: acctId,
        history: [],
        stats: {
          totalGames: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalProfit: 0
        }
      });
    }
    
    console.log(`Fetching history for acct_id: ${acctId}, Lightning address: ${lightningAddress}`);
    
    // Get player history using the Lightning address
    const playerHistory = await getPlayerHistory(lightningAddress);
    const playerStats = calculatePlayerStats(playerHistory);
    
    // Transform history for frontend display
    const transformedHistory = playerHistory.map(game => ({
      gameId: game.gameId,
      date: game.timestamp,
      betAmount: game.betAmount,
      result: game.result === 'won' ? 'Win' : game.result === 'lost' ? 'Loss' : 'Disconnect',
      profitOrLoss: game.result === 'won' ? game.winnings - game.betAmount : -game.betAmount,
      duration: game.duration,
      shotsFired: game.shotsFired,
      hits: game.hits,
      accuracy: game.accuracy,
      shipsDestroyed: game.shipsDestroyed
    }));
    
    res.status(200).json({
      acct_id: acctId,
      lightning_address: lightningAddress,
      history: transformedHistory,
      stats: {
        totalGames: playerStats.totalGames,
        wins: playerStats.wins,
        losses: playerStats.losses,
        winRate: playerStats.winRate,
        totalProfit: playerStats.netProfit,
        totalBet: playerStats.totalBet,
        totalWinnings: playerStats.totalWinnings,
        biggestWin: playerStats.biggestWin,
        longestStreak: playerStats.longestStreak,
        accuracy: playerStats.accuracy
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching player history by account ID:', error);
    res.status(500).json({ error: 'Failed to fetch player history' });
  }
});

const invoiceToSocket = {};

app.post('/webhook', express.json(), (req, res) => {
  logger.debug('Webhook received', { headers: req.headers });
  const WEBHOOK_SECRET = process.env.SPEED_WALLET_WEBHOOK_SECRET || 'your-webhook-secret';
  const event = req.body;
  logger.info('Processing webhook event', { event: event.event_type, data: event.data });

  try {
    const eventType = event.event_type;
    logger.debug('Processing event type', { eventType });

    switch (eventType) {
      case 'invoice.paid':
      case 'payment.paid':
      case 'payment.confirmed':
        const invoiceId = event.data?.object?.id || event.data?.id;
        if (!invoiceId) {
          logger.error('Webhook error: No invoiceId in webhook payload');
          return res.status(400).send('No invoiceId in webhook payload');
        }

        const socket = invoiceToSocket[invoiceId];
        if (!socket) {
          logger.warn(`Webhook warning: No socket found for invoice ${invoiceId}. Player may have disconnected.`);
          return res.status(200).send('Webhook received but no socket found');
        }

        // Log payment verification
        const paymentData = {
          event: 'payment_verified',
          playerId: socket.id,
          invoiceId: invoiceId,
          amount: players[socket.id]?.betAmount || 'unknown',
          lightningAddress: players[socket.id]?.lightningAddress || 'unknown',
          timestamp: new Date().toISOString(),
          eventType: eventType
        };
        
        transactionLogger.info(paymentData);
        
        // Forward payment log to PC
        logForwarder.logPayment(socket.id, paymentData);

        socket.emit('paymentVerified');
        players[socket.id].paid = true;
        logger.info('Payment verified for player', { playerId: socket.id, invoiceId });

        let game = Object.values(games).find(g => 
          Object.keys(g.players).length === 1 && g.betAmount === players[socket.id].betAmount,
        );
        
        if (!game) {
          const gameId = `game_${Date.now()}`;
          game = new SeaBattleGame(gameId, players[socket.id].betAmount);
          games[gameId] = game;
          
          // Log game creation
          gameLogger.info({
            event: 'game_created',
            gameId: gameId,
            betAmount: players[socket.id].betAmount,
            playerId: socket.id,
            timestamp: new Date().toISOString()
          });
        }
        
        game.addPlayer(socket.id, players[socket.id].lightningAddress);
        socket.join(game.id);
        
        // Update player session with payment sent status
        console.log('💳 PAYMENT VERIFIED for:', players[socket.id].lightningAddress);
        console.log('💰 Amount:', players[socket.id].betAmount, 'SATS');
        game.updatePlayerSession(socket.id, {
          paymentSent: true
        });

        socket.emit('matchmakingTimer', { message: 'Estimated wait time: 10-25 seconds' });
        delete invoiceToSocket[invoiceId];
        break;

      case 'payment.failed':
        const failedInvoiceId = event.data?.object?.id || event.data?.id;
        if (!failedInvoiceId) {
          logger.error('Webhook error: No invoiceId in webhook payload for payment.failed');
          return res.status(400).send('No invoiceId in webhook payload');
        }

        const failedSocket = invoiceToSocket[failedInvoiceId];
        if (failedSocket) {
          // Log payment failure
          transactionLogger.info({
            event: 'payment_failed',
            playerId: failedSocket.id,
            invoiceId: failedInvoiceId,
            amount: players[failedSocket.id]?.betAmount || 'unknown',
            lightningAddress: players[failedSocket.id]?.lightningAddress || 'unknown',
            timestamp: new Date().toISOString(),
            eventType: eventType
          });
          
          failedSocket.emit('error', { message: 'Payment failed. Please try again.' });
          logger.warn('Payment failed for player', { playerId: failedSocket.id, invoiceId: failedInvoiceId });
          delete players[failedSocket.id];
          delete invoiceToSocket[failedInvoiceId];
        } else {
          logger.warn(`Webhook warning: No socket found for failed invoice ${failedInvoiceId}. Player may have disconnected.`);
        }
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).send('Webhook processing failed');
  }
});
console.log('Debug-2025-06-16-2: Webhook route added');

const server = http.createServer(app);
console.log('Debug-2025-06-16-2: HTTP server created');

const io = socketio(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
});
console.log('Debug-2025-06-16-2: Socket.IO initialized');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_API_BASE = 'https://api.tryspeed.com'; // For new Speed API
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const SPEED_WALLET_WEBHOOK_SECRET = process.env.SPEED_WALLET_WEBHOOK_SECRET;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

// Helper functions for player history and stats
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function getPlayerHistory(lightningAddress) {
  return new Promise(async (resolve) => {
    try {
      const playerGames = [];
      const logsDir = path.join(__dirname, 'logs');
      
      // Check if logs directory exists
      if (!fs.existsSync(logsDir)) {
        console.log('Logs directory not found, returning empty history');
        return resolve([]);
      }
      
      // Get all player session log files
      const logFiles = fs.readdirSync(logsDir)
        .filter(file => file.startsWith('player-sessions-') && file.endsWith('.log'))
        .sort((a, b) => b.localeCompare(a)); // Sort by date descending (newest first)
      
      // Process recent log files (last 30 days)
      const filesToProcess = logFiles.slice(0, 30);
      
      for (const file of filesToProcess) {
        const filePath = path.join(logsDir, file);
        
        try {
          const fileStream = fs.createReadStream(filePath);
          const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });
          
          for await (const line of rl) {
            try {
              const logEntry = JSON.parse(line);
              
              // Check if this log entry is for our player and is a game completion
              if (logEntry.lightningAddress === lightningAddress && 
                  logEntry.sessionData && 
                  logEntry.sessionData.event === 'game_ended' &&
                  logEntry.sessionData.gameResult) {
                
                const session = logEntry.sessionData;
                const gameData = {
                  gameId: session.gameId,
                  timestamp: session.gameEndTime || logEntry.timestamp,
                  betAmount: session.betAmount || 0,
                  result: session.gameResult, // 'won', 'lost', 'disconnected'
                  winnings: session.payoutAmount || 0,
                  duration: formatGameDuration(session.gameDuration),
                  shotsFired: session.shotsFired || 0,
                  hits: session.shotsHit || 0,
                  accuracy: session.shotsFired > 0 ? Math.round((session.shotsHit / session.shotsFired) * 100) : 0,
                  shipsDestroyed: session.shipsDestroyed || 0
                };
                playerGames.push(gameData);
              }
            } catch (parseError) {
              // Skip malformed log lines
              continue;
            }
          }
        } catch (fileError) {
          console.error(`Error reading log file ${file}:`, fileError.message);
          continue;
        }
      }
      
      // Sort games by timestamp (newest first)
      playerGames.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      console.log(`Found ${playerGames.length} games for player ${lightningAddress}`);
      resolve(playerGames);
      
    } catch (error) {
      console.error('Error fetching player history:', error);
      resolve([]);
    }
  });
}

function formatGameDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m 0s';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}m ${remainingSeconds}s`;
}

function calculatePlayerStats(history) {
  if (!history || history.length === 0) {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalBet: 0,
      totalWinnings: 0,
      totalLost: 0,
      netProfit: 0,
      avgBet: 0,
      biggestWin: 0,
      longestStreak: 0,
      accuracy: 0,
      avgGameDuration: '0m 0s'
    };
  }
  
  const totalGames = history.length;
  const wins = history.filter(game => game.result === 'won').length;
  const losses = totalGames - wins;
  const totalBet = history.reduce((sum, game) => sum + (game.betAmount || 0), 0);
  const totalWinnings = history.filter(game => game.result === 'won')
    .reduce((sum, game) => sum + (game.winnings || 0), 0);
  const totalLost = history.filter(game => game.result === 'lost')
    .reduce((sum, game) => sum + (game.betAmount || 0), 0);
  const netProfit = totalWinnings - totalLost;
  const winRate = totalGames > 0 ? parseFloat(((wins / totalGames) * 100).toFixed(1)) : 0;
  const avgBet = totalGames > 0 ? Math.round(totalBet / totalGames) : 0;
  const biggestWin = history.length > 0 ? Math.max(...history.map(g => g.winnings || 0)) : 0;
  
  // Calculate longest win streak
  let longestStreak = 0;
  let currentStreak = 0;
  for (const game of history) {
    if (game.result === 'won') {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  // Calculate average accuracy
  const gamesWithAccuracy = history.filter(game => game.accuracy !== undefined);
  const accuracy = gamesWithAccuracy.length > 0 
    ? Math.round(gamesWithAccuracy.reduce((sum, game) => sum + game.accuracy, 0) / gamesWithAccuracy.length)
    : 0;
  
  return {
    totalGames,
    wins,
    losses,
    winRate,
    totalBet,
    totalWinnings,
    totalLost,
    netProfit,
    avgBet,
    biggestWin,
    longestStreak,
    accuracy,
    avgGameDuration: calculateAvgGameDuration(history)
  };
}

function calculateAvgGameDuration(history) {
  const gamesWithDuration = history.filter(game => game.duration);
  if (gamesWithDuration.length === 0) return '0m 0s';
  
  // Convert duration strings to seconds for averaging
  const totalSeconds = gamesWithDuration.reduce((sum, game) => {
    const duration = game.duration;
    if (typeof duration === 'string') {
      // Parse duration like "3m 45s" or "5m 12s"
      const matches = duration.match(/(\d+)m\s*(\d+)s/);
      if (matches) {
        return sum + (parseInt(matches[1]) * 60) + parseInt(matches[2]);
      }
    }
    return sum;
  }, 0);
  
  const avgSeconds = Math.round(totalSeconds / gamesWithDuration.length);
  const minutes = Math.floor(avgSeconds / 60);
  const seconds = avgSeconds % 60;
  
  return `${minutes}m ${seconds}s`;
}

async function fetchSpeedWalletTransactions(lightningAddress) {
  try {
    console.log('Fetching Speed Wallet transactions for:', lightningAddress);
    
    // This would be the actual API call to Speed Wallet
    // For now, return mock data structure
    const mockTransactions = [
      {
        id: 'txn_' + Date.now(),
        timestamp: new Date().toISOString(),
        type: 'payment_received',
        amount: 800,
        currency: 'SATS',
        description: 'Sea Battle game payout',
        status: 'completed'
      },
      {
        id: 'txn_' + (Date.now() - 86400000),
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        type: 'payment_sent',
        amount: -500,
        currency: 'SATS',
        description: 'Sea Battle game bet',
        status: 'completed'
      }
    ];
    
    // In a real implementation, this would be:
    // const response = await axios.get(`${SPEED_API_BASE}/transactions`, {
    //   headers: {
    //     Authorization: `Basic ${AUTH_HEADER}`,
    //     'Content-Type': 'application/json'
    //   },
    //   params: {
    //     lightning_address: lightningAddress,
    //     limit: 50
    //   }
    // });
    // return response.data.transactions || [];
    
    return mockTransactions;
  } catch (error) {
    console.error('Error fetching Speed Wallet transactions:', error);
    return [];
  }
}

console.log('Starting server... Debug-2025-06-16-2');

if (!SPEED_WALLET_SECRET_KEY) {
  console.error('SPEED_WALLET_SECRET_KEY is not set in environment variables');
  process.exit(1);
}

if (!SPEED_WALLET_WEBHOOK_SECRET) {
  console.error('SPEED_WALLET_WEBHOOK_SECRET is not set in environment variables');
  process.exit(1);
}

console.log(`Server started at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} (Version: Debug-2025-06-16-2)`);
console.log('Using API base:', SPEED_WALLET_API_BASE);
console.log('Using SPEED_WALLET_SECRET_KEY:', SPEED_WALLET_SECRET_KEY?.slice(0, 5) + '...');

const PAYOUTS = {
  50: { winner: 80, platformFee: 20 },
  300: { winner: 500, platformFee: 100 },
  500: { winner: 800, platformFee: 200 },
  1000: { winner: 1700, platformFee: 300 },
  5000: { winner: 8000, platformFee: 2000 },
  10000: { winner: 17000, platformFee: 3000 },
};

const BOT_JOIN_DELAYS = [13000, 15000, 17000, 19000, 21000, 23000, 25000];
const BOT_THINKING_TIME = {
  MIN: 1000,
  MAX: 3000,
};
const BOT_BEHAVIOR = {
  HIT_CHANCE: 0.5,
  ADJACENT_PATTERNS: {
    ONE_ADJACENT: 0,
    TWO_ADJACENT: 0.30,
    THREE_ADJACENT: 0.20,
    INSTANT_SINK: 0.25,
  }
};

const GRID_COLS = 9;
const GRID_ROWS = 7;
const GRID_SIZE = GRID_COLS * GRID_ROWS;
const PLACEMENT_TIME = 45;
const FIRE_TIME_LIMIT = 15; // 15 seconds to fire
const DISCONNECT_TIMEOUT = 10; // 10 seconds to reconnect
const BOT_PLACEMENT_DELAY = 3; // 3 seconds for bot to "think" about placement
const SHIP_CONFIG = [
  { name: 'Aircraft Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 3 },
  { name: 'Patrol Boat', size: 2 },
];

const games = {};
const players = {};

// Betting pattern tracking across games (by Lightning address and bet amount)
const playerBettingHistory = new Map(); // key: `${lightningAddress}|${betAmount}` -> { index, totalGames, lastGameId, lastExpected }

function getHistoryKey(lightningAddress, betAmount) {
  const addr = lightningAddress && lightningAddress.includes('@') ? lightningAddress : `${lightningAddress}@speed.app`;
  return `${addr}|${betAmount}`;
}

function getPatternForBet(betAmount) {
  // 50 sats pattern: W-L-W-W-L-L-L-W-L (repeats)
  if (betAmount === 50) return ['W', 'L', 'W', 'W', 'L', 'L', 'L', 'W', 'L'];
  // 300+ sats pattern: L-W-L-W-L-W-L-L-W (repeats)
  if (betAmount >= 300) return ['L', 'W', 'L', 'W', 'L', 'W', 'L', 'L', 'W'];
  // Fallback (no enforcement)
  return ['L', 'W'];
}

// User session management to store acct_id mapping
const userSessions = {}; // Maps acct_id to Lightning address
const playerAcctIds = {}; // Maps playerId to acct_id

// Function to store or retrieve acct_id for Lightning address
function mapUserAcctId(acctId, lightningAddress) {
  userSessions[acctId] = lightningAddress;
  console.log(`Mapped acct_id ${acctId} to Lightning address: ${lightningAddress}`);
}

// Function to get Lightning address by acct_id
function getLightningAddressByAcctId(acctId) {
  return userSessions[acctId];
}

// Function to check if user has Lightning address already stored
function hasStoredLightningAddress(acctId) {
  return userSessions[acctId] ? true : false;
}

// Function to get payout information for display in the app
function getPayoutInfo() {
  return {
    api: {
      name: "Speed Wallet API",
      endpoint: SPEED_WALLET_API_BASE,
      method: "Lightning Network instant payments",
      description: "Winners are paid instantly via Lightning Network using Speed Wallet's send API"
    },
    payouts: PAYOUTS,
    fees: "Platform fees are automatically deducted from the total pot",
    currency: "SATS (Bitcoin Satoshis)",
    paymentMethod: "Lightning Address (@speed.app)"
  };
}

async function decodeAndFetchLnUrl(lnUrl) {
  try {
    console.log('Decoding LN-URL:', lnUrl);
    const { words } = bech32.decode(lnUrl, 2000);
    const decoded = bech32.fromWords(words);
    const url = Buffer.from(decoded).toString('utf8');
    console.log('Decoded LN-URL to URL:', url);

    const response = await axios.get(url, { timeout: 5000 });
    console.log('LN-URL response:', response.data);

    if (response.data.tag !== 'payRequest') {
      throw new Error('LN-URL response is not a payRequest');
    }

    const callbackUrl = response.data.callback;
    const amountMsats = response.data.minSendable;

    const callbackResponse = await axios.get(`${callbackUrl}?amount=${amountMsats}`, { timeout: 5000 });
    console.log('Callback response:', callbackResponse.data);

    if (!callbackResponse.data.pr) {
      throw new Error('No BOLT11 invoice in callback response');
    }

    return callbackResponse.data.pr;
  } catch (error) {
    console.error('LN-URL processing error:', error.message);
    throw new Error(`Failed to process LN-URL: ${error.message}`);
  }
}

// Function to get current BTC to USD rate
async function getCurrentBTCRate() {
  try {
    // Using CoinGecko API for real-time BTC price
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
      timeout: 5000
    });
    const btcPrice = response.data.bitcoin.usd;
    console.log('Current BTC price:', btcPrice, 'USD');
    return btcPrice;
  } catch (error) {
    console.error('Failed to fetch BTC rate, using fallback:', error.message);
    // Fallback price in case API fails
    return 45000; // Default fallback price
  }
}

// Function to convert SATS to USD
async function convertSatsToUSD(amountSats) {
  try {
    const btcPrice = await getCurrentBTCRate();
    const btcAmount = amountSats / 100000000; // Convert SATS to BTC
    const usdAmount = btcAmount * btcPrice;
    console.log(`Converted ${amountSats} SATS to ${usdAmount.toFixed(2)} USD (BTC rate: $${btcPrice})`);
    return parseFloat(usdAmount.toFixed(2));
  } catch (error) {
    console.error('Error converting SATS to USD:', error.message);
    // Fallback conversion (assuming $45000 BTC)
    return parseFloat(((amountSats / 100000000) * 45000).toFixed(2));
  }
}

async function createLightningInvoice(amountSats, customerId, orderId) {
  try {
    console.log('Creating Lightning invoice using Speed API:', { amountSats, customerId, orderId });
    
    // Get real-time USD amount for the SATS for logging purposes
    const amountUSD = await convertSatsToUSD(amountSats);
    
    // Use the new payments API with Speed Wallet interface - request payment directly in SATS
    const newPayload = {
      currency: 'SATS',
      amount: amountSats,
      target_currency: 'SATS',
      ttl: 600, // 10 minutes for payment
      description: `Sea Battle Game - ${amountSats} SATS`,
      metadata: {
        Order_ID: orderId,
        Customer_ID: customerId,
        Game_Type: 'Sea_Battle',
        Amount_SATS: amountSats.toString()
      }
    };

    console.log('Creating payment with Speed API payload:', newPayload);
    
    const response = await axios.post(`${SPEED_API_BASE}/payments`, newPayload, {
      headers: {
        Authorization: `Basic ${AUTH_HEADER}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    console.log('Speed API response:', response.data);
    
    // Extract payment details from Speed API response
    const paymentData = response.data;
    const invoiceId = paymentData.id;
    const hostedInvoiceUrl = paymentData.hosted_invoice_url;
    
    // Extract Lightning invoice from various possible locations
    let lightningInvoice = paymentData.payment_method_options?.lightning?.payment_request ||
                          paymentData.lightning_invoice || 
                          paymentData.invoice || 
                          paymentData.payment_request ||
                          paymentData.bolt11;
    
    if (!lightningInvoice && hostedInvoiceUrl) {
      console.log('No direct Lightning invoice found, will use hosted URL');
      lightningInvoice = hostedInvoiceUrl;
    }
    
    if (!invoiceId) {
      throw new Error('No invoice ID returned from Speed API');
    }

    return {
      invoiceId,
      hostedInvoiceUrl,
      lightningInvoice,
      amountUSD,
      amountSats,
      speedInterfaceUrl: hostedInvoiceUrl // This will open Speed Wallet interface
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
    throw new Error(`Failed to create invoice: ${errorMessage} (Status: ${errorStatus})`);
  }
}

async function resolveLightningAddress(address, amountSats, currency = 'SATS') {
  try {
    console.log('Resolving Lightning address:', address, 'with amount:', amountSats, 'SATS');
    const [username, domain] = address.split('@');
    if (!username || !domain) {
      throw new Error('Invalid Lightning address');
    }

    const lnurl = `https://${domain}/.well-known/lnurlp/${username}`;
    console.log('Fetching LNURL metadata from:', lnurl);

    const metadataResponse = await axios.get(lnurl, { timeout: 5000 });
    const metadata = metadataResponse.data;
    console.log('Received LNURL metadata:', metadata);

    if (metadata.tag !== 'payRequest') {
      throw new Error('Invalid LNURL metadata: not a payRequest');
    }

    const amountMsats = amountSats * 1000;
    console.log(`Attempting to send ${amountSats} SATS (${amountMsats} msats). Min sendable: ${metadata.minSendable}, Max sendable: ${metadata.maxSendable}`);

    if (amountMsats < metadata.minSendable || amountMsats > metadata.maxSendable) {
      const errorMsg = `Invalid amount: ${amountSats} SATS (${amountMsats} msats) is not within the sendable range of ${metadata.minSendable / 1000} to ${metadata.maxSendable / 1000} SATS (${metadata.minSendable} to ${metadata.maxSendable} msats)`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const callback = metadata.callback;
    console.log('Requesting invoice from:', callback, 'with amount:', amountMsats);

    const invoiceResponse = await axios.get(`${callback}?amount=${amountMsats}`, { timeout: 5000 });
    const invoice = invoiceResponse.data.pr;

    if (!invoice) {
      throw new Error('No invoice in response');
    }

    return invoice;
  } catch (error) {
    console.error('Error resolving Lightning address:', error.message);
    throw error;
  }
}

async function sendPayment(destination, amount, currency) {
  try {
    let invoice;

    if (destination.includes('@')) {
      console.log('Resolving Lightning address:', destination);
      invoice = await resolveLightningAddress(destination, Number(amount), currency);
      console.log('Resolved invoice:', invoice);
      if (!invoice || !invoice.startsWith('ln')) {
        throw new Error('Invalid or malformed invoice retrieved');
      }
    } else {
      invoice = destination;
      if (!invoice.startsWith('ln')) {
        throw new Error('Invalid invoice format: must start with "ln"');
      }
    }

    // Log the request details for debugging
    const paymentPayload = {
      payment_request: invoice
    };
    
    console.log('Sending payment request to Speed API:', {
      url: `${SPEED_WALLET_API_BASE}/payments`,
      payload: paymentPayload,
      headers: {
        Authorization: `Basic ${AUTH_HEADER}`,
        'Content-Type': 'application/json',
        'speed-version': '2022-04-15',
      }
    });

    const response = await axios.post(
      `${SPEED_WALLET_API_BASE}/payments`,
      paymentPayload,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 5000,
      }
    );

    console.log('Payment response:', response.data);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    console.error('Send Payment Error:', errorMessage);
    throw new Error(`Failed to send payment: ${errorMessage}`);
  }
}

// New Speed Wallet instant send function using the instant-send API
async function sendInstantPayment(withdrawRequest, amount, currency = 'USD', targetCurrency = 'SATS', note = '') {

  /*
  Placeholder for sending payments logic
  Integrate actual sending logic here
  */
  try {
    console.log('Sending instant payment via Speed Wallet instant-send API:', {
      withdrawRequest,
      amount,
      currency,
      targetCurrency,
      note
    });

    const instantSendPayload = {
      amount: parseFloat(amount),
      currency: currency,
      target_currency: targetCurrency,
      withdraw_method: 'lightning',
      withdraw_request: withdrawRequest,
      note: note
    };

    console.log('Instant send payload:', JSON.stringify(instantSendPayload, null, 2));

    const response = await axios.post(
      `${SPEED_WALLET_API_BASE}/send`,
      instantSendPayload,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15',
        },
        timeout: 10000,
      }
    );

    console.log('Instant send response:', response.data);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    const errorStatus = error.response?.status || 'No status';
    const errorDetails = error.response?.data || error.message;
    console.error('Instant Send Payment Error:', {
      message: errorMessage,
      status: errorStatus,
      details: errorDetails,
    });
    throw new Error(`Failed to send instant payment: ${errorMessage} (Status: ${errorStatus})`);
  }
}

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul((t ^ (t >>> 15)), (t | 1));
    t ^= (t + Math.imul((t ^ (t >>> 7)), (t | 61)));
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

function isOccupied(positions, occupied) {
  for (const pos of positions) {
    if (occupied.has(pos)) {
      return true;
    }
  }
  return false;
}

class SeaBattleGame {
  constructor(id, betAmount) {
    this.id = id;
    this.betAmount = betAmount;
    this.players = {};
    this.boards = {};
    this.ready = {};
    this.turn = null;
    this.winner = null;
    this.bets = {};
    this.payments = {};
    this.placementTimers = {};
    this.placementTime = PLACEMENT_TIME;
    this.randomGenerators = {};
    this.botState = {};
    this.matchmakingTimerInterval = null;
    this.shipHits = {};
    this.totalShipCells = SHIP_CONFIG.reduce((sum, ship) => sum + ship.size, 0);
    this.botShots = {};
    this.botTargetedShip = {};
    this.botCheatMode = {};
    this.botSunkShips = {};
    this.humanSunkShips = {};
    this.placementConfirmed = {};
    this.fireTimers = {};
    this.disconnectTimers = {};
    this.playerConnected = {};
    this.partialPlacements = {}; // Store partial ship placements
    
    // Enhanced player session tracking
    this.playerSessions = {};
    this.gameStartTime = null;
    this.gameEndTime = null;
    this.patrolBoatRelocations = {}; // Track patrol boat relocation attempts
    // Pattern enforcement flags for this game
    this.patternFairGame = {}; // humanId -> true when human should win a fair game
    this.expectedHumanResult = null; // 'W' or 'L'
    this.patternKey = null; // key for playerBettingHistory
  }
  
  // Initialize player session tracking
  initializePlayerSession(playerId, lightningAddress, isBot = false) {
    this.playerSessions[playerId] = {
      playerId,
      gameId: this.id,
      lightningAddress,
      betAmount: this.betAmount,
      isBot,
      joinTime: new Date().toISOString(),
      paymentSent: false,
      paymentReceived: false,
      gameResult: null,
      disconnectedDuringGame: false,
      disconnectCount: 0,
      disconnectTimes: [],
      reconnectTimes: [],
      gameStartTime: null,
      gameEndTime: null,
      gameDuration: null,
      opponentType: null,
      payoutAmount: 0,
      payoutStatus: null,
      shotsFired: 0,
      shotsHit: 0,
      shipsDestroyed: 0,
      lastActivity: new Date().toISOString()
    };
    
    // Log initial session creation
    logPlayerSession(lightningAddress, {
      event: 'session_created',
      playerId,
      ...this.playerSessions[playerId]
    });
  }
  
  // Update player session data
  updatePlayerSession(playerId, updates) {
    if (this.playerSessions[playerId]) {
      this.playerSessions[playerId] = {
        ...this.playerSessions[playerId],
        ...updates,
        lastActivity: new Date().toISOString()
      };
      
      // Log session update using Lightning address
      const lightningAddress = this.players[playerId]?.lightningAddress || playerId;
      logPlayerSession(lightningAddress, {
        event: 'session_updated',
        playerId,
        updates,
        ...this.playerSessions[playerId]
      });
    }
  }
  
  // Log comprehensive session data
  logPlayerSessionComplete(playerId, event = 'session_complete') {
    if (this.playerSessions[playerId]) {
      const session = this.playerSessions[playerId];
      const opponentId = Object.keys(this.players).find(id => id !== playerId);
      const opponentType = opponentId ? (this.players[opponentId].isBot ? 'bot' : 'human') : 'unknown';
      
      // Calculate game duration if both start and end times are available
      let gameDuration = null;
      if (session.gameStartTime && session.gameEndTime) {
        const startTime = new Date(session.gameStartTime);
        const endTime = new Date(session.gameEndTime);
        gameDuration = Math.floor((endTime - startTime) / 1000); // Duration in seconds
      }
      
      const completeSessionData = {
        ...session,
        event,
        playerId,
        opponentType,
        gameDuration,
        sessionEndTime: new Date().toISOString()
      };
      
      // Use Lightning address for logging
      const lightningAddress = this.players[playerId]?.lightningAddress || playerId;
      logPlayerSession(lightningAddress, completeSessionData);
      return completeSessionData;
    }
  }

  addPlayer(playerId, lightningAddress, isBot = false) {
    this.players[playerId] = {
      lightningAddress,
      board: Array(GRID_SIZE).fill('water'),
      ships: [],
      ready: false,
      isBot,
    };
    this.bets[playerId] = false;
    this.payments[playerId] = false;
    this.shipHits[playerId] = 0;
    this.placementConfirmed[playerId] = false;
    this.playerConnected[playerId] = true;
    this.partialPlacements[playerId] = [];
    const seed = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + Date.now();
    this.randomGenerators[playerId] = mulberry32(seed);

    // Initialize player session tracking
    this.initializePlayerSession(playerId, lightningAddress, isBot);

    if (isBot) {
      this.botState[playerId] = {
        lastHit: null,
        adjacentQueue: [],
        triedPositions: new Set(),
        hitMode: false,
        targets: [],
      };
      this.botShots[playerId] = new Set();
      this.botTargetedShip[playerId] = null;
      console.log(`Bot ${playerId} joined but will place ships on startPlacing.`);
    } else {
      io.to(playerId).emit('joined', { 
        gameId: this.id, 
        playerId: playerId, 
      });
    }

    if (Object.keys(this.players).length === 2) {
      if (this.matchmakingTimerInterval) {
        clearInterval(this.matchmakingTimerInterval);
        this.matchmakingTimerInterval = null;
      }
      
      // Send waiting message to both players with countdown
      const allPlayers = Object.keys(this.players).filter(id => !this.players[id].isBot);
      allPlayers.forEach(playerId => {
        io.to(playerId).emit('waitingForOpponent', { 
          message: 'Opponent found! Game starting in 5 seconds...',
          countdown: true,
          timeLeft: 5
        });
      });
      
      console.log(`Game ${this.id}: Both players joined, starting countdown`);
      
      // Send countdown updates
      let timeLeft = 5;
      const countdownInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
          allPlayers.forEach(playerId => {
            io.to(playerId).emit('waitingForOpponent', { 
              message: `Game starting in ${timeLeft} second${timeLeft !== 1 ? 's' : ''}...`,
              countdown: true,
              timeLeft: timeLeft
            });
          });
        } else {
          clearInterval(countdownInterval);
          this.startPlacing();
        }
      }, 1000);
    } else {
      this.startMatchmaking();
    }
  }

  startMatchmaking() {
    const humanPlayers = Object.keys(this.players).filter(id => !this.players[id].isBot);
    humanPlayers.forEach(playerId => {
      io.to(playerId).emit('waitingForOpponent', { message: 'Waiting for opponent...' });
    });

    const delay = BOT_JOIN_DELAYS[Math.floor(Math.random() * BOT_JOIN_DELAYS.length)];
    this.matchmakingTimerInterval = setTimeout(() => {
      if (Object.keys(this.players).length === 1) {
        const botId = `bot_${Date.now()}`;
        this.addPlayer(botId, 'bot@tryspeed.com', true);
        console.log(`Added bot ${botId} to game ${this.id}`);
        
        // Log bot join
        gameLogger.info({
          event: 'bot_joined',
          botId: botId,
          gameId: this.id,
          betAmount: this.betAmount,
          timestamp: new Date().toISOString()
        });
      }
    }, delay);
  }

  startPlacing() {
    const playerIds = Object.keys(this.players);
    
    playerIds.forEach(playerId => {
      if (!this.players[playerId].isBot && !this.players[playerId].ready) {
        this.placementTimers[playerId] = setTimeout(() => {
          if (!this.players[playerId].ready) {
            console.log(`Auto-placing ships for player ${playerId} - time expired`);
            this.autoPlaceShips(playerId);
            this.players[playerId].ready = true;
            this.placementConfirmed[playerId] = true;
            
            // Send updated board and ships to player
            const player = this.players[playerId];
            io.to(playerId).emit('placementAutoSaved');
            io.to(playerId).emit('games', { 
              count: Object.values(this.players).filter(p => p.ready).length,
              grid: player.board,
              ships: player.ships,
            });
            
            console.log(`Auto-placement complete for ${playerId}. Ships placed:`, player.ships.map(s => s.name));
            this.checkStartGame();
          }
        }, this.placementTime * 1000);
      } else if (this.players[playerId].isBot) {
        // Bot saves placement when 15-25 seconds remain randomly
        const remainingTime = Math.floor(Math.random() * 11) + 15; // Random between 15-25 seconds
        const saveTime = this.placementTime - remainingTime;
        
        console.log(`Bot ${playerId} will save placement in ${saveTime} seconds (${remainingTime} seconds remaining)`);
        
        setTimeout(() => {
          if (!this.players[playerId].ready) {
            console.log(`Bot ${playerId} saving placement with ${remainingTime} seconds remaining`);
            this.autoPlaceShips(playerId);
            this.players[playerId].ready = true;
            this.placementConfirmed[playerId] = true;
            console.log(`Bot ${playerId} finished placing ships`);
            this.checkStartGame();
          }
        }, saveTime * 1000);
      }
    });
    
    io.to(this.id).emit('startPlacing');
  }

  autoPlaceShips(playerId) {
    try {
      const player = this.players[playerId];
      if (!player) {
        console.error(`Player ${playerId} not found for auto-placement`);
        return;
      }
      
      const gridSize = GRID_SIZE;
      const cols = GRID_COLS;
      const rows = GRID_ROWS;
      
      // Start with existing partial placements
      const placements = [...(this.partialPlacements[playerId] || [])];
      const occupied = new Set();
      
      // Mark existing placements as occupied
      placements.forEach(ship => {
        ship.positions.forEach(pos => occupied.add(pos));
      });
      
      // Get list of ships that still need to be placed
      const placedShipNames = placements.map(ship => ship.name);
      const remainingShips = SHIP_CONFIG.filter(shipConfig => 
        !placedShipNames.includes(shipConfig.name)
      );
      
      // Create a fresh random generator for this auto-placement session
      const baseSeed = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const freshSeed = baseSeed + Date.now() + Math.random() * 1000;
      const freshRandom = mulberry32(freshSeed);
      console.log(`Auto-placing ships for ${playerId} with fresh seed: ${freshSeed}`);
      
      // Only place remaining ships
      const newlyPlacedShips = [];
      remainingShips.forEach(shipConfig => {
        let placed = false;
        let attempts = 0;
        
        console.log(`Attempting to place ${shipConfig.name} (size: ${shipConfig.size})`);
        while (!placed && attempts < 100) {
          attempts++;
          const horizontal = freshRandom() > 0.5;
          let row, col;
          
          // Randomize starting position based on ship orientation and size
          // Ensure starting position allows the entire ship to fit
          if (horizontal) {
            const maxCol = cols - shipConfig.size;
            row = Math.floor(freshRandom() * rows);
            col = maxCol > 0 ? Math.floor(freshRandom() * (maxCol + 1)) : 0;
          } else {
            const maxRow = rows - shipConfig.size;
            row = maxRow > 0 ? Math.floor(freshRandom() * (maxRow + 1)) : 0;
            col = Math.floor(freshRandom() * cols);
          }
          
          console.log(`Attempt ${attempts}: trying to place ${shipConfig.name} at row ${row}, col ${col}, horizontal: ${horizontal}`);
          
          const positions = [];
          let valid = true;

          for (let i = 0; i < shipConfig.size; i++) {
            const currentPos = horizontal ? row * cols + col + i : (row + i) * cols + col;
            
            // Additional check to ensure we don't go out of bounds
            if (currentPos >= gridSize || occupied.has(currentPos)) {
              valid = false;
              console.log(`Attempt ${attempts}: Position ${currentPos} out of bounds or occupied for ${shipConfig.name}`);
              break;
            }
            
            // For horizontal ships, ensure we don't wrap to next row
            if (horizontal) {
              const currentRow = Math.floor(currentPos / cols);
              if (currentRow !== row) {
                valid = false;
                console.log(`Attempt ${attempts}: Ship ${shipConfig.name} would wrap to next row`);
                break;
              }
            }
            
            positions.push(currentPos);
          }

          if (valid) {
            positions.forEach(pos => occupied.add(pos));
            const newShip = {
              name: shipConfig.name,
              positions,
              horizontal,
              sunk: false,
              hits: 0,
            };
            placements.push(newShip);
            newlyPlacedShips.push(newShip);
            console.log(`Successfully placed ${shipConfig.name} at positions: ${positions} (horizontal: ${horizontal})`);
            placed = true;
          }
        }
        
        if (!placed) {
          console.log(`Failed to place ship ${shipConfig.name} after 100 attempts`);
        }
      });
      
      player.board = Array(gridSize).fill('water');
      placements.forEach(ship => {
        ship.positions.forEach(pos => {
          player.board[pos] = 'ship';
        });
      });
      
      player.ships = placements;
      
      // Always send updated data to human players
      if (!player.isBot) {
        console.log(`Sending updated ship placement to player ${playerId}:`, {
          totalShips: placements.length,
          shipNames: placements.map(s => s.name),
          boardCellsWithShips: player.board.filter(cell => cell === 'ship').length
        });
        
        io.to(playerId).emit('games', { 
          count: Object.values(this.players).filter(p => p.ready).length,
          grid: player.board,
          ships: placements,
        });
        
        // Also emit a specific event for auto-placed ships
        const autoPlacedShips = placements.filter(ship => 
          !this.partialPlacements[playerId]?.some(partial => partial.name === ship.name)
        );
        
        if (autoPlacedShips.length > 0) {
          console.log(`Auto-placed ${autoPlacedShips.length} new ships for ${playerId}:`, autoPlacedShips.map(s => s.name));
          io.to(playerId).emit('shipsAutoPlaced', {
            newShips: autoPlacedShips,
            allShips: placements,
            grid: player.board
          });
        }
      }
    } catch (error) {
      console.error('Auto-placement error:', error.message);
      this.players[playerId].ready = false;
      io.to(playerId).emit('error', { message: 'Auto-placement failed. Please try again.' });
    }
  }

  validateShipPlacements(playerId, placements) {
    const player = this.players[playerId];
    if (!player || player.ready || player.isBot) {
      return { success: false, error: 'Player not valid or ready' };
    }
    
    const gridSize = GRID_SIZE;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const occupied = new Set();

    for (const ship of placements) {
      const matchingConfig = SHIP_CONFIG.find(s => s.name === ship.name);
      if (!matchingConfig) {
        return { success: false, error: `Unknown ship: ${ship.name}` };
      }
      if (!ship.positions || !Array.isArray(ship.positions) || ship.positions.length !== matchingConfig.size) {
        return { success: false, error: `Invalid ship positions length for ${ship.name}. Expected ${matchingConfig.size}, got ${ship.positions.length}` };
      }

      const isHorizontal = ship.horizontal !== undefined ? ship.horizontal : true;
      for (let i = 0; i < ship.positions.length; i++) {
        const pos = ship.positions[i];
        if (pos < 0 || pos >= gridSize) {
          return { success: false, error: `Position ${pos} out of bounds for ${ship.name}` };
        }
        const row = Math.floor(pos / cols);
        const col = pos % cols;
        if (isHorizontal && (i > 0 && col !== ship.positions[i - 1] % cols + 1)) {
          return { success: false, error: `Invalid horizontal alignment for ${ship.name} at position ${pos}` };
        }
        if (!isHorizontal && (i > 0 && row !== Math.floor(ship.positions[i - 1] / cols) + 1)) {
          return { success: false, error: `Invalid vertical alignment for ${ship.name} at position ${pos}` };
        }
        if (occupied.has(pos)) {
          return { success: false, error: `Position ${pos} already occupied for ${ship.name}` };
        }
        occupied.add(pos);
      }
    }
    
    return { success: true };
  }
  
  updateBoard(playerId, placements) {
    const player = this.players[playerId];
    if (!player || player.ready || player.isBot) return;
    
    // Store partial placements
    this.partialPlacements[playerId] = placements || [];

    const gridSize = GRID_SIZE;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const occupied = new Set();
    const logRejection = (reason, details) => {
      console.error(`Placement rejected: ${reason}`, details);
    };

    for (const ship of placements) {
      const matchingConfig = SHIP_CONFIG.find(s => s.name === ship.name);
      if (!matchingConfig) {
        logRejection('Unknown ship', { name: ship.name });
        return;
      }
      if (!ship.positions || !Array.isArray(ship.positions) || ship.positions.length !== matchingConfig.size) {
        logRejection('Invalid ship positions length', { name: ship.name, expected: matchingConfig.size, got: ship.positions.length });
        return;
      }

      const isHorizontal = ship.horizontal !== undefined ? ship.horizontal : true;
      for (let i = 0; i < ship.positions.length; i++) {
        const pos = ship.positions[i];
        if (pos < 0 || pos >= gridSize) {
          logRejection('Position out of bounds', { name: ship.name, position: pos });
          return;
        }
        const row = Math.floor(pos / cols);
        const col = pos % cols;
        if (isHorizontal && (i > 0 && col !== ship.positions[i - 1] % cols + 1)) {
          logRejection('Invalid horizontal alignment', { name: ship.name, position: pos });
          return;
        }
        if (!isHorizontal && (i > 0 && row !== Math.floor(ship.positions[i - 1] / cols) + 1)) {
          logRejection('Invalid vertical alignment', { name: ship.name, position: pos });
          return;
        }
        if (occupied.has(pos)) {
          logRejection('Position already occupied', { name: ship.name, position: pos });
          return;
        }
        occupied.add(pos);
      }
    }
    
    player.board = Array(GRID_SIZE).fill('water');
    player.ships = [];

    placements.forEach(ship => {
      if (ship.positions && Array.isArray(ship.positions)) {
        ship.positions.forEach(pos => {
          if (pos >= 0 && pos < gridSize) {
            player.board[pos] = 'ship';
          }
        });
        player.ships.push({
          name: ship.name,
          positions: ship.positions,
          horizontal: ship.horizontal,
          sunk: false,
          hits: 0,
        });
      }
    });

    io.to(playerId).emit('games', { 
      count: Object.values(this.players).filter(p => p.ready).length,
      grid: player.board,
      ships: player.ships,
    });

    const otherPlayers = Object.keys(this.players).filter(id => id !== playerId);
    otherPlayers.forEach(id => {
      io.to(id).emit('games', { 
        count: Object.values(this.players).filter(p => p.ready).length,
      });
    });
  }

  placeShips(playerId, placements) {
    if (!placements || !Array.isArray(placements)) {
      throw new Error('Invalid placements data');
    }

    const player = this.players[playerId];
    if (!player || player.isBot) return;
    
    const gridSize = GRID_SIZE;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const occupied = new Set();
    
    if (placements.length !== SHIP_CONFIG.length) {
      throw new Error(`Not all ships placed. Expected ${SHIP_CONFIG.length}, got ${placements.length}`);
    }

    for (const ship of placements) {
      const matchingConfig = SHIP_CONFIG.find(s => s.name === ship.name);
      if (!matchingConfig) {
        throw new Error(`Unknown ship: ${ship.name}`);
      }
      if (!ship.positions || !Array.isArray(ship.positions) || ship.positions.length !== matchingConfig.size) {
        throw new Error(`Invalid ship positions for ${ship.name}`);
      }

      for (const pos of ship.positions) {
        if (pos < 0 || pos >= gridSize) {
          throw new Error(`Position ${pos} out of bounds for ${ship.name}`);
        }
        if (occupied.has(pos)) {
          throw new Error(`Position ${pos} already occupied for ${ship.name}`);
        }
        occupied.add(pos);
      }
    }
    
    player.board = Array(GRID_SIZE).fill('water');
    player.ships = [];

    placements.forEach(ship => {
      ship.positions.forEach(pos => {
        if (pos >= 0 && pos < gridSize) {
          player.board[pos] = 'ship';
        }
      });
      player.ships.push({
        name: ship.name,
        positions: ship.positions,
        horizontal: ship.horizontal,
        sunk: false,
        hits: 0,
      });
    });
    
    player.ready = true;
    this.placementConfirmed[playerId] = true;
    
    if (this.placementTimers[playerId]) {
      clearTimeout(this.placementTimers[playerId]);
      delete this.placementTimers[playerId];
    }

    io.to(playerId).emit('placementSaved');
    io.to(playerId).emit('games', { 
      count: Object.values(this.players).filter(p => p.ready).length,
      grid: player.board,
      ships: player.ships,
    });

    const otherPlayers = Object.keys(this.players).filter(id => id !== playerId);
    otherPlayers.forEach(id => {
      io.to(id).emit('games', { 
        count: Object.values(this.players).filter(p => p.ready).length,
      });
    });

    this.checkStartGame();
  }

  checkStartGame() {
    const allConfirmed = Object.keys(this.players).every(playerId => 
      this.placementConfirmed[playerId],
    );
    if (allConfirmed) {
      this.startGame();
    } else {
      console.log('Waiting for all players to confirm placement');
    }
  }

  startGame() {
    const playerIds = Object.keys(this.players);
    this.turn = playerIds[Math.floor(Math.random() * playerIds.length)];
    
    // Track game start time
    this.gameStartTime = new Date().toISOString();
    
    // Update player sessions with game start time
    playerIds.forEach(id => {
      this.updatePlayerSession(id, {
        gameStartTime: this.gameStartTime
      });
    });
    
    // Determine expected result for this game based on betting patterns
    try {
      const humanIds = Object.keys(this.players).filter(id => !this.players[id].isBot);
      if (humanIds.length === 1) {
        const humanId = humanIds[0];
        const addr = this.players[humanId].lightningAddress;
        const key = getHistoryKey(addr, this.betAmount);
        const pattern = getPatternForBet(this.betAmount);
        let record = playerBettingHistory.get(key);
        if (!record) {
          record = { index: 0, totalGames: 0 };
          playerBettingHistory.set(key, record);
        }
        const expected = pattern[record.index % pattern.length]; // 'W' or 'L'
        this.expectedHumanResult = expected;
        this.patternKey = key;
        // Fair/noob mode applies for all fair (W) games, including 50 SATS
        this.patternFairGame = { [humanId]: expected === 'W' };
        // Ensure bot is not aggressive/cheating in fair games
        const botId = Object.keys(this.players).find(id => this.players[id].isBot);
        if (botId && this.patternFairGame[humanId]) {
          this.botCheatMode[botId] = false;
          if (this.botState[botId]) {
            this.botState[botId].aggressivePhase = false;
            this.botState[botId].endgamePhase = false;
          }
        }
        console.log(`Pattern set for game ${this.id} [bet=${this.betAmount}]: expectedHumanResult=${this.expectedHumanResult}`);
      }
    } catch (e) {
      console.warn('Pattern setup error:', e.message);
    }
    
    playerIds.forEach(id => {
      if (!this.players[id].isBot) {
        io.to(id).emit('startGame', { 
          turn: this.turn,
          message: id === this.turn ? 'Your turn!' : 'Opponent\'s turn',
        });
      }
    });

    // Start the firing timer for the current player
    this.startFireTimer(this.turn);
  }
  
  startFireTimer(playerId) {
    // Clear any existing timer
    if (this.fireTimers[playerId]) {
      clearTimeout(this.fireTimers[playerId]);
    }
    
    if (this.players[playerId].isBot) {
      // Bot fires after thinking time
      const thinkingTime = Math.floor(Math.random() * 2000) + 1000;
      this.fireTimers[playerId] = setTimeout(() => {
        this.botFireShot(playerId);
      }, thinkingTime);
    } else {
      // Human player has 15 seconds to fire
      io.to(playerId).emit('fireTimer', { timeLeft: FIRE_TIME_LIMIT });
      
      this.fireTimers[playerId] = setTimeout(() => {
        if (this.turn === playerId && !this.winner) {
          console.log(`Player ${playerId} timed out, auto-firing with 20% hit chance`);
          this.autoFire(playerId);
        }
      }, FIRE_TIME_LIMIT * 1000);
    }
  }
  
  autoFire(playerId) {
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    
    // Get all available positions
    const availablePositions = [];
    const shipPositions = [];
    
    for (let i = 0; i < GRID_SIZE; i++) {
      if (opponent.board[i] !== 'hit' && opponent.board[i] !== 'miss') {
        availablePositions.push(i);
        if (opponent.board[i] === 'ship') {
          shipPositions.push(i);
        }
      }
    }
    
    if (availablePositions.length === 0) return;
    
let targetPosition = null;
    
    // 20% chance to hit a ship, 80% chance to miss
if (Math.random() < 0.05 && shipPositions.length > 0) {
      // Hit a ship
      targetPosition = shipPositions[Math.floor(Math.random() * shipPositions.length)];
    } else {
      // Miss - pick a random water position
      const waterPositions = availablePositions.filter(pos => opponent.board[pos] === 'water');
      if (waterPositions.length > 0) {
        targetPosition = waterPositions[Math.floor(Math.random() * waterPositions.length)];
      } else {
        // If no water positions, pick any available position
        targetPosition = availablePositions[Math.floor(Math.random() * availablePositions.length)];
      }
    }
    
    // Fire the shot
    this.fireShot(playerId, targetPosition);
  }

  _isValidPosition(pos, botState, opponent) {
    if (pos < 0 || pos >= GRID_SIZE || botState.triedPositions.has(pos)) {
      return false;
    }
    return true;
  }

  _botAdjacents(position, botState) {
    const row = Math.floor(position / GRID_COLS);
    const col = position % GRID_COLS;
    const adjacents = [];
    const opponentId = Object.keys(this.players).find(id => id !== botState.playerId);
    const opponent = this.players[opponentId];

    const directions = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (newRow >= 0 && newRow < GRID_ROWS && newCol >= 0 && newCol < GRID_COLS) {
        const newPos = newRow * GRID_COLS + newCol;
        
        if (!botState.triedPositions.has(newPos) && 
            (!opponent || opponent.board[newPos] !== 'miss')) {
          adjacents.push(newPos);
        }
      }
    }

    return adjacents;
  }

  _botNextInLine(target, botState, opponent) {
    if (!target || target.hits.length === 0) return null;

    if (!target.orientation && target.hits.length >= 2) {
      const firstHit = target.hits[0];
      const lastHit = target.hits[target.hits.length - 1];
      
      const firstRow = Math.floor(firstHit / GRID_COLS);
      const firstCol = firstHit % GRID_COLS;
      const lastRow = Math.floor(lastHit / GRID_COLS);
      const lastCol = lastHit % GRID_COLS;
      
      if (firstRow === lastRow) {
        target.orientation = 'horizontal';
      } else if (firstCol === lastCol) {
        target.orientation = 'vertical';
      }
    }

    if (target.orientation) {
      const sortedHits = [...target.hits].sort((a, b) => a - b);
      const dir = target.orientation === 'horizontal' ? 1 : GRID_COLS;
      
      const ends = [sortedHits[0], sortedHits[sortedHits.length - 1]];
      
      for (const end of ends) {
        const nextPos = end + (end === sortedHits[0] ? -dir : dir);
        
        if (
          nextPos >= 0 && 
          nextPos < GRID_SIZE && 
          !botState.triedPositions.has(nextPos) &&
          (target.orientation === 'horizontal' ? 
            Math.floor(nextPos / GRID_COLS) === Math.floor(end / GRID_COLS) :
            (nextPos % GRID_COLS) === (end % GRID_COLS))
        ) {
          return nextPos;
        }
      }
    }
    
    const adjacents = [];
    for (const hit of target.hits) {
      adjacents.push(...this._botAdjacents(hit, botState));
    }
    
    const uniqueAdjacents = [...new Set(adjacents)].filter(
      pos => !botState.triedPositions.has(pos) && 
             (opponent.board[pos] === 'ship' || opponent.board[pos] === 'water'),
    );
    
    if (uniqueAdjacents.length > 0) {
      return uniqueAdjacents[Math.floor(Math.random() * uniqueAdjacents.length)];
    }

    return null;
  }

  _botNextAfterSunk(target, botState, opponent) {
    if (!target.orientation || target.hits.length < 1) return null;
    
    const sortedHits = [...target.hits].sort((a, b) => a - b);
    const dir = target.orientation === 'horizontal' ? 1 : GRID_COLS;
    const lastHit = sortedHits[sortedHits.length - 1];
    const firstHit = sortedHits[0];

    let nextPos = lastHit + dir;
    while (nextPos >= 0 && nextPos < GRID_SIZE) {
      if ((target.orientation === 'horizontal' && 
           Math.floor(nextPos / GRID_COLS) !== Math.floor(lastHit / GRID_COLS)) ||
          (target.orientation === 'vertical' && 
           (nextPos % GRID_COLS) !== (lastHit % GRID_COLS))) {
        break;
      }
      
      if (!botState.triedPositions.has(nextPos)) {
        return nextPos;
      }
      nextPos += dir;
    }

    nextPos = firstHit - dir;
    while (nextPos >= 0 && nextPos < GRID_SIZE) {
      if ((target.orientation === 'horizontal' && 
           Math.floor(nextPos / GRID_COLS) !== Math.floor(firstHit / GRID_COLS)) ||
          (target.orientation === 'vertical' && 
           (nextPos % GRID_COLS) !== (firstHit % GRID_COLS))) {
        break;
      }
      
      if (!botState.triedPositions.has(nextPos)) {
        return nextPos;
      }
      nextPos -= dir;
    }
    
    return null;
  }

  botFireShotAtPosition(playerId, position) {
    if (this.winner || playerId !== this.turn || !this.players[playerId].isBot) return;

    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    const botState = this.botState[playerId];
    const noobMode = this.patternFairGame && this.patternFairGame[opponentId];
    
    // Log bot's shot for debugging
    const humanSunk = this.humanSunkShips[opponentId] || 0;
    const botSunk = this.botSunkShips[playerId] || 0;
    console.log(`Bot shooting at position ${position} | Bot sunk: ${botSunk}, Human sunk: ${humanSunk}, Phase: ${botState.aggressivePhase ? 'Aggressive' : botState.endgamePhase ? 'Endgame' : 'Normal'}`);
    
    botState.triedPositions.add(position);
    
    const isHit = opponent.board[position] === 'ship';
    
    if (isHit) {
      opponent.board[position] = 'hit';
      this.shipHits[playerId]++;
      botState.lastHit = position;
      // In fair games (noob mode), remember adjacents for more human-like follow-up
      if (noobMode) {
        const adjacents = this._botAdjacents(position, botState);
        const uniqueAdj = [...new Set(adjacents)].filter(pos => !botState.triedPositions.has(pos));
        const existing = botState.noobQueue || [];
        botState.noobQueue = [...existing, ...adjacents].filter((pos, idx, arr) => arr.indexOf(pos) === idx);
        botState.lastNoobHit = position;
      }

      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship) {
        let thisTarget = botState.targets.find(t => t.shipId === ship.name && !t.sunk);
        
        if (!thisTarget) {
          thisTarget = {
            shipId: ship.name,
            hits: [position],
            orientation: null,
            queue: [],
            sunk: false,
            lastHit: position,
            initialHit: position,
          };
          botState.targets.push(thisTarget);
          botState.currentTarget = thisTarget;
        } else {
          thisTarget.hits.push(position);
          thisTarget.lastHit = position;
          
          if (thisTarget.hits.length >= 2 && !thisTarget.orientation) {
            const firstHit = thisTarget.hits[0];
            const secondHit = thisTarget.hits[1];
            
            if (Math.floor(firstHit / GRID_COLS) === Math.floor(secondHit / GRID_COLS)) {
              thisTarget.orientation = 'horizontal';
            } else {
              thisTarget.orientation = 'vertical';
            }
          }
        }

        if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
          thisTarget.sunk = true;
          this.botSunkShips[playerId] = (this.botSunkShips[playerId] || 0) + 1;
          
          if (botState.currentTarget && botState.currentTarget.shipId === ship.name) {
            botState.currentTarget = null;
          }
          
          botState.targets = botState.targets.filter(t => !t.sunk);
          
          if (botState.targets.length > 0) {
            botState.currentTarget = botState.targets[0];
          }

          // In noob mode, clear adjacency queue after sinking a ship
          if (noobMode) {
            botState.noobQueue = [];
            botState.lastNoobHit = null;
          }

          const dir = thisTarget.orientation === 'horizontal' ? 1 : GRID_COLS;
          const sortedHits = [...thisTarget.hits].sort((a, b) => a - b);
          const firstPos = sortedHits[0] - dir;
          const lastPos = sortedHits[sortedHits.length - 1] + dir;

          if (firstPos >= 0 && opponent.board[firstPos] === 'water') {
            this.botFireShotAtPosition(playerId, firstPos);
          }
          if (lastPos < GRID_SIZE && opponent.board[lastPos] === 'water') {
            this.botFireShotAtPosition(playerId, lastPos);
          }
        } else {
          const adjacents = this._botAdjacents(position, botState);
          thisTarget.queue = [...new Set([...thisTarget.queue, ...adjacents])]
            .filter(pos => !botState.triedPositions.has(pos));
        }
      } else {
        console.warn('No ship found for the hit position:', position);
      }
    } else {
      opponent.board[position] = 'miss';
    }

    io.to(opponentId).emit('fireResult', {
      player: playerId,
      position,
      hit: isHit,
    });
    
    io.to(this.id).emit('fireResult', {
      player: playerId,
      position,
      hit: isHit,
    });

    if (isHit) {
      setTimeout(() => this.botFireShot(playerId), Math.floor(Math.random() * 1000) + 500);
    } else {
      this.turn = opponentId;
      io.to(this.id).emit('nextTurn', { turn: this.turn });
      if (this.players[this.turn].isBot) {
        setTimeout(() => this.botFireShot(this.turn), Math.floor(Math.random() * 2000) + 1000);
      }
    }
  }

  botFireShot(playerId) {
    try {
      if (this.winner || playerId !== this.turn || !this.players[playerId].isBot) return;

      const botState = this.botState[playerId] || this.initBotState(playerId);
      const opponentId = Object.keys(this.players).find(id => id !== playerId);
      const opponent = this.players[opponentId];
      const seededRandom = this.randomGenerators[playerId];
      
      // Initialize bot performance tracking if not exists
      if (!botState.performanceTracking) {
        botState.performanceTracking = {
          shotsToMiss: 0,
          endgameMisses: 0,
          lastPatrolBoatCheck: null
        };
      }
      
      // Adjust thinking time based on game phase
      let thinkingTime = Math.floor(seededRandom() * 1000) + 1000;
      if (botState.aggressivePhase) {
        thinkingTime = Math.floor(seededRandom() * 800) + 600; // Faster when aggressive
      }

      setTimeout(() => {
        const noobMode = this.patternFairGame && this.patternFairGame[opponentId];
        if (noobMode) {
          // Fair game: prefer adjacent follow-ups if we recently hit; otherwise mostly random
          const available = Array.from({ length: GRID_SIZE }, (_, i) => i)
            .filter(pos => !botState.triedPositions.has(pos));
          let position = null;
          if (available.length > 0) {
            const queue = (botState.noobQueue || []).filter(pos => 
              !botState.triedPositions.has(pos) && 
              opponent.board[pos] !== 'hit' && 
              opponent.board[pos] !== 'miss'
            );
            if (queue.length > 0 && seededRandom() < 0.65) {
              position = queue.shift();
              // Persist the trimmed queue
              botState.noobQueue = queue;
            } else {
              const waterPositions = available.filter(pos => opponent.board[pos] === 'water');
              if (waterPositions.length > 0 && seededRandom() < 0.8) {
                position = waterPositions[Math.floor(seededRandom() * waterPositions.length)];
              } else {
                position = available[Math.floor(seededRandom() * available.length)];
              }
            }
          }
          if (position !== null && position !== undefined) {
            this.botFireShotAtPosition(playerId, position);
            if (opponent.board[position] === 'hit') {
              setTimeout(() => this.botFireShot(playerId), Math.floor(seededRandom() * 1200) + 800);
            }
          }
          return;
        }

        const remainingShipCells = opponent.board
          .map((cell, idx) => cell === 'ship' ? idx : null)
          .filter(idx => idx !== null && !botState.triedPositions.has(idx));
        if (remainingShipCells.length > 0 && remainingShipCells.length <= 3) {
          this._botTargetAndDestroy(playerId, opponentId, remainingShipCells);
          return;
        }

        if (!botState.targets) botState.targets = [];
        if (!botState.currentTarget) botState.currentTarget = null;

        let position = null;
        let currentTargetObj = botState.currentTarget ? 
          botState.targets.find(t => t.shipId === botState.currentTarget) : null;
      
        if (currentTargetObj && !currentTargetObj.sunk) {
          if (currentTargetObj.orientation) {
            position = this._botNextInLine(currentTargetObj, botState, opponent);
          }
          if (position === null && currentTargetObj.queue && currentTargetObj.queue.length > 0) {
            position = currentTargetObj.queue.shift();
          }
        } else {
          const unfinishedTargets = botState.targets.filter(
            t => !t.sunk && ((t.queue && t.queue.length > 0) || (t.hits && t.hits.length > 0)),
          );
        
          if (unfinishedTargets.length > 0) {
            unfinishedTargets.sort((a, b) => b.hits.length - a.hits.length);
            currentTargetObj = unfinishedTargets[0];
            botState.currentTarget = currentTargetObj.shipId;
        
            if (currentTargetObj.orientation) {
              position = this._botNextInLine(currentTargetObj, botState, opponent);
            }
            if (position === null && currentTargetObj.queue && currentTargetObj.queue.length > 0) {
              position = currentTargetObj.queue.shift();
            }
          }
        }

        if (this.botCheatMode[playerId] && !botState.currentTarget) {
          // Adjust cheat probability based on game phase
          let cheatProbability = 0.7;
          
          if (botState.aggressivePhase) {
            cheatProbability = 0.5; // Less cheating when aggressive
          }
          if (botState.endgamePhase) {
            cheatProbability = 0.3; // Much less cheating in endgame
          }
          
          if (seededRandom() < cheatProbability) {
            const availableShips = opponent.board
              .map((cell, idx) => cell === 'ship' && !botState.triedPositions.has(idx) ? idx : null)
              .filter(idx => idx !== null);
            if (availableShips.length > 0) {
              position = availableShips[Math.floor(seededRandom() * availableShips.length)];
            } else {
              this.botCheatMode[playerId] = false;
            }
          }
        }

        if (!position && currentTargetObj && !currentTargetObj.sunk) {
          if (currentTargetObj.orientation) {
            let streakPos = this._botNextInLine(currentTargetObj, botState, opponent);
            if (streakPos !== null && streakPos !== undefined) {
              setTimeout(() => {
                this.botFireShotAtPosition(playerId, streakPos);
              }, Math.floor(seededRandom() * 1000) + 500);
              return;
            }
          }

          if (currentTargetObj.queue && currentTargetObj.queue.length > 0) {
            position = currentTargetObj.queue.shift();
          }

          if (!position && currentTargetObj.shipId) {
            const ship = opponent.ships.find(s => s.name === currentTargetObj.shipId);
            if (ship) {
              const unhit = ship.positions.find(pos =>
                !botState.triedPositions.has(pos) &&
                opponent.board[pos] !== 'hit' &&
                opponent.board[pos] !== 'miss',
              );
              if (unhit !== undefined) {
                position = unhit;
              }
            }
          }
        }

        if (!position && !this.botCheatMode[playerId]) {
          const available = Array.from({ length: GRID_SIZE }, (_, i) => i)
            .filter(pos => !botState.triedPositions.has(pos));
          const availableShips = available.filter(pos => opponent.board[pos] === 'ship');

          const botSunk = this.botSunkShips[playerId] || 0;
          const humanSunk = this.humanSunkShips[opponentId] || 0;
          const humanHits = this.shipHits[opponentId] || 0;

          // Check for endgame phase (both destroyed 4 ships)
          if (botState.endgamePhase && botSunk >= 4 && humanSunk >= 4) {
            // In endgame, bot should miss 1-3 times before finding the patrol boat
            if (!botState.performanceTracking.shotsToMiss) {
              // Randomly decide how many shots to miss (1-3)
              botState.performanceTracking.shotsToMiss = Math.floor(seededRandom() * 3) + 1;
              botState.performanceTracking.endgameMisses = 0;
              console.log(`Bot entering endgame - will miss ${botState.performanceTracking.shotsToMiss} shots before hitting patrol boat`);
            }
            
            if (botState.performanceTracking.endgameMisses < botState.performanceTracking.shotsToMiss) {
              // Intentionally miss
              const waterPositions = available.filter(pos => opponent.board[pos] === 'water');
              if (waterPositions.length > 0) {
                position = waterPositions[Math.floor(seededRandom() * waterPositions.length)];
                botState.performanceTracking.endgameMisses++;
                console.log(`Bot intentional miss ${botState.performanceTracking.endgameMisses}/${botState.performanceTracking.shotsToMiss}`);
              } else {
                // No water left, hit a ship
                position = availableShips[Math.floor(seededRandom() * availableShips.length)];
              }
            } else {
              // Time to find and hit the patrol boat
              const patrolBoat = opponent.ships.find(s => s.name === 'Patrol Boat' && !s.sunk);
              if (patrolBoat) {
                const unhitPatrolPositions = patrolBoat.positions.filter(pos => 
                  !botState.triedPositions.has(pos) && opponent.board[pos] === 'ship'
                );
                if (unhitPatrolPositions.length > 0) {
                  position = unhitPatrolPositions[0];
                  console.log('Bot targeting patrol boat after endgame misses');
                }
              }
              if (!position && availableShips.length > 0) {
                position = availableShips[Math.floor(seededRandom() * availableShips.length)];
              }
            }
          } else if (botState.aggressivePhase && (humanSunk >= 3 || humanHits >= 8)) {
            // Slightly aggressive phase - better accuracy
            if (seededRandom() < 0.6 && availableShips.length > 0) {
              // 60% chance to hit when aggressive
              position = availableShips[Math.floor(seededRandom() * availableShips.length)];
              console.log('Bot in aggressive phase - 60% hit chance');
            } else {
              position = available[Math.floor(seededRandom() * available.length)];
            }
          } else if (this.shouldBotCheatToWin(playerId, opponentId) && availableShips.length > 0) {
            // Normal cheating behavior
            position = availableShips[Math.floor(seededRandom() * availableShips.length)];
          } else {
            // Normal random shooting
            position = available[Math.floor(seededRandom() * available.length)];
          }
        }

        if (position !== null) {
          this.botFireShotAtPosition(playerId, position);
          if (opponent.board[position] === 'hit') {
            setTimeout(() => this.botFireShot(playerId), Math.floor(seededRandom() * 1000) + 500);
          }
        }
      }, thinkingTime);
    } catch (error) {
      console.error('Error in botFireShot:', error);
    }
  }

  _botTargetAndDestroy(playerId, opponentId, remainingShipCells) {
    const botState = this.botState[playerId];
    const opponent = this.players[opponentId];
    const position = remainingShipCells[0];
    opponent.board[position] = 'hit';
    this.shipHits[playerId]++;
    botState.triedPositions.add(position);

    io.to(opponentId).emit('fireResult', {
      player: playerId,
      position,
      hit: true,
    });

    if (this.shipHits[playerId] >= this.totalShipCells) {
      this.endGame(playerId);
      return;
    }

    setTimeout(() => this.botFireShot(playerId), Math.floor(Math.random() * 1000) + 1000);
    io.to(this.id).emit('nextTurn', { turn: this.turn });
  }

  initBotState(playerId) {
    this.botState[playerId] = {
      triedPositions: new Set(),
      lastHitShip: null,
      lastHitPosition: null,
      targets: [],
      noobQueue: [],
      lastNoobHit: null,
      aggressivePhase: false,
      endgamePhase: false,
      performanceTracking: {
        shotsToMiss: 0,
        endgameMisses: 0,
        lastPatrolBoatCheck: null
      }
    };
    return this.botState[playerId];
  }

  fireShot(playerId, position) {
    if (this.winner || playerId !== this.turn) return false;
    
    // Clear the fire timer for this player
    if (this.fireTimers[playerId]) {
      clearTimeout(this.fireTimers[playerId]);
      delete this.fireTimers[playerId];
    }

    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    const player = this.players[playerId];

    if (position < 0 || position >= GRID_SIZE || 
        opponent.board[position] === 'hit' || 
        opponent.board[position] === 'miss') {
      return false;
    }

    const isHit = opponent.board[position] === 'ship';
    let sunkShip = null;
    
    // Check if this is a bot's patrol boat that got hit (for special relocation feature)
    if (isHit && opponent.isBot) {
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship && ship.name === 'Patrol Boat' && ship.hits === 0) {
        // First hit on bot's patrol boat - attempt to relocate it
        const relocated = this.tryRelocateBotPatrolBoat(opponentId, ship, position);
        if (relocated) {
          console.log(`Bot's patrol boat secretly relocated after first hit at position ${position}`);
          // Mark the hit position as miss instead since the boat moved
          opponent.board[position] = 'miss';
          
          const fireResult = {
            player: playerId,
            position,
            hit: false, // Show as miss to the human player
            sunk: false,
            shipName: null,
          };
          
          io.to(opponentId).emit('fireResult', fireResult);
          io.to(playerId).emit('fireResult', fireResult);
          
          // Update player session with shot statistics
          this.updatePlayerSession(playerId, {
            shotsFired: (this.playerSessions[playerId]?.shotsFired || 0) + 1,
            shotsHit: (this.playerSessions[playerId]?.shotsHit || 0) // No hit counted
          });
          
          // Turn passes to opponent since it was a "miss"
          this.turn = opponentId;
          io.to(this.id).emit('nextTurn', { turn: this.turn });
          this.startFireTimer(this.turn);
          
          return true;
        }
      }
    }
    
    opponent.board[position] = isHit ? 'hit' : 'miss';

    // Update player session with shot statistics
    this.updatePlayerSession(playerId, {
      shotsFired: (this.playerSessions[playerId]?.shotsFired || 0) + 1,
      shotsHit: (this.playerSessions[playerId]?.shotsHit || 0) + (isHit ? 1 : 0)
    });

    if (isHit) {
      this.shipHits[playerId] = (this.shipHits[playerId] || 0) + 1;
      
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship) {
        ship.hits = (ship.hits || 0) + 1;
        ship.sunk = ship.hits >= ship.positions.length;
        
        if (ship.sunk) {
          console.log(`${ship.name} has been sunk!`);
          this.humanSunkShips[playerId] = (this.humanSunkShips[playerId] || 0) + 1;
          sunkShip = ship;
          
          // Update session with ship destroyed
          this.updatePlayerSession(playerId, {
            shipsDestroyed: (this.playerSessions[playerId]?.shipsDestroyed || 0) + 1
          });
        }
      }
    }

    const fireResult = {
      player: playerId,
      position,
      hit: isHit,
      sunk: !!sunkShip,
      shipName: sunkShip?.name,
    };
    
    io.to(opponentId).emit('fireResult', fireResult);
    io.to(playerId).emit('fireResult', fireResult);

    if (this.shipHits[playerId] >= this.totalShipCells) {
      this.endGame(playerId);
      return true;
    }

    if (sunkShip) {
      sunkShip.positions.forEach(pos => {
        if (opponent.board[pos] !== 'hit') {
          opponent.board[pos] = 'hit';
          this.shipHits[playerId]++;
          
          const sinkUpdate = {
            player: playerId,
            position: pos,
            hit: true,
            sunk: true,
            shipName: sunkShip.name,
          };
          
          io.to(opponentId).emit('fireResult', sinkUpdate);
          io.to(playerId).emit('fireResult', sinkUpdate);
        }
      });
    }

    if (!isHit) {
      this.turn = opponentId;
      io.to(this.id).emit('nextTurn', { turn: this.turn });
      
      // Start fire timer for next player
      this.startFireTimer(this.turn);
    } else {
      io.to(this.id).emit('nextTurn', { turn: this.turn });
      
      // Start fire timer for same player (they get another turn)
      this.startFireTimer(this.turn);
    }

    return true;
  }

  shouldBotCheatToWin(playerId, opponentId) {
    // Never cheat in fair games where the human is supposed to win per pattern
    if (this.players[playerId]?.isBot) {
      const humanId = opponentId;
      if (this.patternFairGame && this.patternFairGame[humanId]) {
        return false;
      }
    }
    const botSunk = this.botSunkShips[playerId] || 0;
    const humanSunk = this.humanSunkShips[opponentId] || 0;
    const botHits = this.shipHits[playerId] || 0;
    const humanHits = this.shipHits[opponentId] || 0;
    const humanHitCells = humanHits;
    
    // Enhanced adaptive difficulty logic
    // Phase 1: Normal play until player destroys 3 ships or hits 8 cells
    // Phase 2: Slightly aggressive when player is doing well (destroyed 3 ships or hit 8+ cells)
    // Phase 3: More aggressive when both have destroyed 4 ships (endgame)
    
    // Check if we're in the endgame (both destroyed 4 ships)
    if (botSunk >= 4 && humanSunk >= 4) {
      // Endgame phase - bot should make it interesting but ultimately let player have a chance
      this.botState[playerId].endgamePhase = true;
      // Bot will randomly miss 1-3 times before hitting the patrol boat
      return false; // Don't cheat in endgame, use special endgame logic
    }
    
    // Check if player has performed well (destroyed 3+ ships or hit 8+ cells)
    if (humanSunk >= 3 || humanHitCells >= 8) {
      this.botState[playerId].aggressivePhase = true;
      // Bot becomes slightly more aggressive
      // Increase hit chance to maintain 2-3 ships destroyed for bot
      if (botSunk < 2) {
        // Bot needs to catch up a bit
        return true;
      } else if (botSunk < 3 && humanSunk >= 4) {
        // Player is far ahead, bot should catch up
        return true;
      }
    }
    
    // Normal play - bot should maintain balance
    // Aim to destroy 2-3 ships while player destroys 3-4
    if (botSunk < 2 && humanSunk >= 2) {
      // Bot is falling behind, help it a bit
      return Math.random() < 0.5; // 50% chance to cheat
    }
    
    // Default behavior from original
    return (
      humanSunk > botSunk ||
      (this.totalShipCells - botHits <= 3) ||
      (this.totalShipCells - humanHits <= 3)
    );
  }

  // New method to attempt relocating bot's patrol boat when first hit
  tryRelocateBotPatrolBoat(botId, patrolBoat, hitPosition) {
    const bot = this.players[botId];
    if (!bot || !bot.isBot) return false;
    // Do not relocate patrol boat during fair games for the human per pattern
    const humanId = Object.keys(this.players).find(id => id !== botId);
    if (this.patternFairGame && this.patternFairGame[humanId]) {
      return false;
    }
    
    // Initialize relocation tracking if not exists
    if (!this.patrolBoatRelocations) {
      this.patrolBoatRelocations = {};
    }
    if (!this.patrolBoatRelocations[botId]) {
      this.patrolBoatRelocations[botId] = {
        attempts: new Set(),
        totalRelocations: 0,
        maxRelocations: 3 // Limit relocations to make it fair but challenging
      };
    }
    
    const relocInfo = this.patrolBoatRelocations[botId];
    
    // Check if we've exceeded max relocations
    if (relocInfo.totalRelocations >= relocInfo.maxRelocations) {
      console.log(`Bot ${botId}: Max patrol boat relocations (${relocInfo.maxRelocations}) reached`);
      return false;
    }
    
    // Check if this position was already tried for relocation
    if (relocInfo.attempts.has(hitPosition)) {
      return false; // Already tried relocating from this position
    }
    
    // Mark this position as tried
    relocInfo.attempts.add(hitPosition);
    
    // Find available 2-space positions for the patrol boat
    const availablePositions = this.findAvailablePatrolBoatPositions(botId, patrolBoat.positions);
    
    if (availablePositions.length === 0) {
      console.log('No available positions for patrol boat relocation');
      return false;
    }
    
    // Choose a random available position
    const seededRandom = this.randomGenerators[botId];
    const newPosition = availablePositions[Math.floor(seededRandom() * availablePositions.length)];
    
    // Remove the old patrol boat from the board
    patrolBoat.positions.forEach(pos => {
      if (bot.board[pos] === 'ship') {
        bot.board[pos] = 'water';
      }
    });
    
    // Place the patrol boat in the new position
    patrolBoat.positions = newPosition.positions;
    patrolBoat.horizontal = newPosition.horizontal;
    patrolBoat.hits = 0; // Reset hits since it's relocating
    
    // Update the board with the new position
    newPosition.positions.forEach(pos => {
      bot.board[pos] = 'ship';
    });
    
    console.log(`Bot ${botId}: Patrol boat relocated from [${patrolBoat.positions}] to [${newPosition.positions}] (horizontal: ${newPosition.horizontal})`);
    
    // Increment relocation counter
    this.patrolBoatRelocations[botId].totalRelocations++;
    console.log(`Bot ${botId}: Patrol boat relocations used: ${this.patrolBoatRelocations[botId].totalRelocations}/${this.patrolBoatRelocations[botId].maxRelocations}`);
    
    return true;
  }
  
  // Find available positions for a 2-space patrol boat
  findAvailablePatrolBoatPositions(botId, currentPositions) {
    const bot = this.players[botId];
    if (!bot) return [];
    
    const availablePositions = [];
    const occupiedPositions = new Set();
    
    // Mark all current ship positions as occupied, except the current patrol boat
    bot.ships.forEach(ship => {
      if (ship.name !== 'Patrol Boat') {
        ship.positions.forEach(pos => occupiedPositions.add(pos));
      }
    });
    
    // Also mark hit and miss positions as occupied
    for (let i = 0; i < GRID_SIZE; i++) {
      if (bot.board[i] === 'hit' || bot.board[i] === 'miss') {
        occupiedPositions.add(i);
      }
    }
    
    // Try all possible horizontal positions
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS - 1; col++) { // -1 because we need 2 spaces
        const pos1 = row * GRID_COLS + col;
        const pos2 = row * GRID_COLS + col + 1;
        
        if (!occupiedPositions.has(pos1) && !occupiedPositions.has(pos2) &&
            !currentPositions.includes(pos1) && !currentPositions.includes(pos2)) {
          availablePositions.push({
            positions: [pos1, pos2],
            horizontal: true
          });
        }
      }
    }
    
    // Try all possible vertical positions
    for (let row = 0; row < GRID_ROWS - 1; row++) { // -1 because we need 2 spaces
      for (let col = 0; col < GRID_COLS; col++) {
        const pos1 = row * GRID_COLS + col;
        const pos2 = (row + 1) * GRID_COLS + col;
        
        if (!occupiedPositions.has(pos1) && !occupiedPositions.has(pos2) &&
            !currentPositions.includes(pos1) && !currentPositions.includes(pos2)) {
          availablePositions.push({
            positions: [pos1, pos2],
            horizontal: false
          });
        }
      }
    }
    
    return availablePositions;
  }

  async endGame(playerId) {
    if (this.winner) return; // Prevent endGame from running multiple times

    // Determine actual end-state (who legitimately sunk all ships)
    const humanIds = Object.keys(this.players).filter(id => !this.players[id].isBot);
    const humanId = humanIds.length === 1 ? humanIds[0] : null;
    const botId = humanId ? Object.keys(this.players).find(id => this.players[id].isBot) : null;
    const humanHitCount = humanId ? (this.shipHits[humanId] || 0) : 0;
    const botHitCount = botId ? (this.shipHits[botId] || 0) : 0;
    const humanHasSunkAllBotShips = humanId ? humanHitCount >= this.totalShipCells : false;
    const botHasSunkAllHumanShips = botId ? botHitCount >= this.totalShipCells : false;
    
    // Apply pattern-based winner override only if it matches legitimate sinks
    try {
      if (humanId && botId && this.expectedHumanResult) {
        let overrideWinnerId = null;
        if (this.expectedHumanResult === 'W' && humanHasSunkAllBotShips) {
          overrideWinnerId = humanId;
        } else if (this.expectedHumanResult === 'L' && botHasSunkAllHumanShips) {
          overrideWinnerId = botId;
        }
        if (overrideWinnerId && playerId !== overrideWinnerId) {
          console.log(`Pattern override applied for game ${this.id}: expected ${this.expectedHumanResult}, setting winner to ${overrideWinnerId}`);
          playerId = overrideWinnerId;
        }
      }
    } catch (e) {
      console.warn('Pattern override error:', e.message);
    }

    this.winner = playerId;

    // Track game end time
    this.gameEndTime = new Date().toISOString();

    try {
      const winnerPlayer = this.players[playerId];
      if (!winnerPlayer) {
        logger.error(`Winner player with ID ${playerId} not found in game ${this.id}`);
        return;
      }

      // Get all players for logging
      const allPlayers = Object.keys(this.players).map(id => ({
        id,
        isBot: this.players[id].isBot,
        lightningAddress: this.players[id].lightningAddress,
        shipHits: this.shipHits[id] || 0
      }));

      // Ensure the address contains @speed.app
      let winnerAddress = winnerPlayer.lightningAddress.includes('@') ? winnerPlayer.lightningAddress : `${winnerPlayer.lightningAddress}@speed.app`;

      const payout = PAYOUTS[this.betAmount];
      if (!payout) {
        throw new Error('Invalid bet amount for payout');
      }

      const humanPlayers = Object.keys(this.players).filter(id => !this.players[id].isBot);
      
      // Update all player sessions with game end time and results
      Object.keys(this.players).forEach(id => {
        const isWinner = id === playerId;
        const isBot = this.players[id].isBot;
        
        this.updatePlayerSession(id, {
          gameEndTime: this.gameEndTime,
          gameResult: isWinner ? 'won' : 'lost',
          payoutAmount: isWinner && !isBot ? payout.winner : 0,
          payoutStatus: isWinner && !isBot ? 'pending' : 'not_applicable'
        });
      });

      if (winnerPlayer.isBot) {
        // Log bot victory
        gameLogger.info({
          event: 'game_ended',
          gameId: this.id,
          winner: playerId,
          winnerType: 'bot',
          betAmount: this.betAmount,
          players: allPlayers,
          payout: {
            winner: 0, // Bot doesn't get payout
            platformFee: 0, // No fee deducted
            houseRetained: this.betAmount * 2 // Both bets retained
          },
          timestamp: new Date().toISOString()
        });

        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', {
            message: 'You lost! Better luck next time!',
          });
        });
        console.log(`Bot ${playerId} won the game. Bet amount ${this.betAmount} SATS retained by the house.`);
      } else {
        // Log human victory and payout details (payout only if human legitimately sank all bot ships)
        const legitimateHumanWin = humanId && playerId === humanId && humanHasSunkAllBotShips;
        gameLogger.info({
          event: 'game_ended',
          gameId: this.id,
          winner: playerId,
          winnerType: 'human',
          winnerAddress: winnerAddress,
          betAmount: this.betAmount,
          players: allPlayers,
          payout: {
            winner: legitimateHumanWin ? payout.winner : 0,
            platformFee: legitimateHumanWin ? payout.platformFee : 0,
            totalCollected: this.betAmount * 2,
            withheld: legitimateHumanWin ? false : true
          },
          timestamp: new Date().toISOString()
        });

        // Announce winner first
        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', {
            message: id === playerId
              ? (legitimateHumanWin ? `You won! ${payout.winner} sats are being sent!` : 'You won by forfeit. No payout.')
              : 'You lost! Better luck next time!',
          });
        });

        if (legitimateHumanWin) {
          // Process payments using instant send API
          console.log(`Processing instant payment to winner: ${winnerAddress}, amount: ${payout.winner} SATS`);
          
          // Send SATS directly without conversion
          const winnerPayment = await sendInstantPayment(
            winnerAddress,
            payout.winner,
            'SATS',
            'SATS',
            `Sea Battle payout - Game ${this.id} - Winner: ${payout.winner} SATS`
          );
          console.log('✅ Winner instant payment sent:', winnerPayment);
          console.log('🎉 GAME COMPLETED - Winner:', winnerAddress, 'Amount:', payout.winner, 'SATS');

          // Log winner payment
          transactionLogger.info({
            event: 'payout_sent',
            gameId: this.id,
            playerId: playerId,
            recipient: winnerAddress,
            amount: payout.winner,
            currency: 'SATS',
            paymentResponse: winnerPayment,
            timestamp: new Date().toISOString()
          });
          
          // Update winner's session with successful payout
          this.updatePlayerSession(playerId, {
            paymentReceived: true,
            payoutStatus: 'sent'
          });

          // Send platform fee (no extra winner fee)
          const platformFee = await sendInstantPayment(
            'slatesense@speed.app',
            payout.platformFee,
            'SATS',
            'SATS',
            `Sea Battle platform fee - Game ${this.id} - Fee: ${payout.platformFee} SATS`
          );
          console.log('Platform fee instant payment sent:', platformFee);

          // Log platform fee payment
          transactionLogger.info({
            event: 'platform_fee_sent',
            gameId: this.id,
            recipient: 'slatesense@speed.app',
            amount: payout.platformFee,
            currency: 'SATS',
            paymentResponse: platformFee,
            timestamp: new Date().toISOString()
          });

          // Confirm payment transaction to the client
          io.to(this.id).emit('transaction', {
            message: `${payout.winner} sats sent to winner.`,
          });

          console.log(`Game ${this.id} ended. Player ${playerId} won ${payout.winner} SATS.`);
          console.log(`Payout processed for ${playerId}: ${payout.winner} SATS to ${winnerAddress}`);
          console.log(`Platform fee processed: ${payout.platformFee} SATS to slatesense@speed.app`);
        } else {
          // No payout on non-legitimate win (e.g., disconnect or not all ships sunk)
          this.updatePlayerSession(playerId, {
            payoutAmount: 0,
            payoutStatus: 'not_applicable'
          });
          transactionLogger.info({
            event: 'payout_withheld',
            gameId: this.id,
            playerId: playerId,
            recipient: winnerAddress,
            amount: 0,
            currency: 'SATS',
            reason: 'non_legitimate_win',
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      logger.error('Payment error in endGame', {
        gameId: this.id,
        playerId: playerId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      
      // Update player session with failed payout
      this.updatePlayerSession(playerId, {
        paymentReceived: false,
        payoutStatus: 'failed'
      });
      
      // Log payout failure
      transactionLogger.error({
        event: 'payout_failed',
        gameId: this.id,
        playerId: playerId,
        error: error.message,
        betAmount: this.betAmount,
        timestamp: new Date().toISOString()
      });
      
      console.error('Payment error:', error.message);
      console.log(`Failed to process payment in game ${this.id} for player ${playerId}: ${error.message}`);
      io.to(this.id).emit('error', { message: `Payment processing failed: ${error.message}` });
    } finally {
      // Log comprehensive game summary
      logGameSummary(this.id, this.players, playerId, this.betAmount, this.gameStartTime, this.gameEndTime);
      
      // Log final session data for all players
      Object.keys(this.players).forEach(id => {
        this.logPlayerSessionComplete(id, 'game_ended');
      });
      
      // Update player betting history index for repeating pattern
      try {
        if (this.patternKey) {
          const pattern = getPatternForBet(this.betAmount);
          const rec = playerBettingHistory.get(this.patternKey) || { index: 0, totalGames: 0 };
          rec.index = ((rec.index || 0) + 1) % pattern.length;
          rec.totalGames = (rec.totalGames || 0) + 1;
          rec.lastGameId = this.id;
          rec.lastExpected = this.expectedHumanResult;
          playerBettingHistory.set(this.patternKey, rec);
        }
      } catch (e) {
        console.error('Failed to update player betting history:', e.message);
      }
      
      // Cleanup is now safe to call
      this.cleanup();
    }
  }

  handleDisconnect(playerId) {
    if (this.winner || !this.players[playerId]) return;
    
    this.playerConnected[playerId] = false;
    console.log(`Player ${playerId} disconnected from game ${this.id}`);
    
    // Update player session with disconnect info
    this.updatePlayerSession(playerId, {
      disconnectedDuringGame: true,
      disconnectCount: (this.playerSessions[playerId]?.disconnectCount || 0) + 1,
      disconnectTimes: [...(this.playerSessions[playerId]?.disconnectTimes || []), new Date().toISOString()]
    });
    
    // Log player disconnect
    playerLogger.info({
      event: 'player_disconnected',
      playerId: playerId,
      gameId: this.id,
      timestamp: new Date().toISOString()
    });
    
    // Start disconnect timer
    this.disconnectTimers[playerId] = setTimeout(() => {
      if (!this.playerConnected[playerId] && !this.winner) {
        const opponentId = Object.keys(this.players).find(id => id !== playerId && !this.players[id].isBot);
        
        if (opponentId) {
          console.log(`Player ${playerId} failed to reconnect, awarding win to ${opponentId}`);
          
          // Update disconnected player's session
          this.updatePlayerSession(playerId, {
            gameResult: 'disconnected'
          });
          
          // Log disconnect win
          gameLogger.info({
            event: 'disconnect_win',
            gameId: this.id,
            disconnectedPlayer: playerId,
            winner: opponentId,
            timestamp: new Date().toISOString()
          });
          
          this.endGame(opponentId);
        } else {
          // Only bots left, clean up
          this.cleanup();
        }
      }
    }, DISCONNECT_TIMEOUT * 1000);
  }
  
  handleReconnect(playerId) {
    if (this.disconnectTimers[playerId]) {
      clearTimeout(this.disconnectTimers[playerId]);
      delete this.disconnectTimers[playerId];
    }
    
    this.playerConnected[playerId] = true;
    console.log(`Player ${playerId} reconnected to game ${this.id}`);
    
    // Update player session with reconnect info
    this.updatePlayerSession(playerId, {
      reconnectTimes: [...(this.playerSessions[playerId]?.reconnectTimes || []), new Date().toISOString()]
    });
    
    // Log player reconnect
    playerLogger.info({
      event: 'player_reconnected',
      playerId: playerId,
      gameId: this.id,
      timestamp: new Date().toISOString()
    });
  }
  
  cleanup() {
    Object.keys(this.placementTimers).forEach(playerId => {
      clearTimeout(this.placementTimers[playerId]);
    });
    
    Object.keys(this.fireTimers).forEach(playerId => {
      clearTimeout(this.fireTimers[playerId]);
    });
    
    Object.keys(this.disconnectTimers).forEach(playerId => {
      clearTimeout(this.disconnectTimers[playerId]);
    });
    
    if (this.matchmakingTimerInterval) {
      clearInterval(this.matchmakingTimerInterval);
      this.matchmakingTimerInterval = null;
    }
    if (!this.winner) {
      Object.keys(this.players).forEach(playerId => {
        if (!this.players[playerId].isBot) {
          io.to(playerId).emit('error', { message: 'Game canceled.' });
        }
      });
    }
    delete games[this.id];
    console.log(`Game ${this.id} cleaned up`);
  }
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Check if this is a reconnection
  Object.values(games).forEach(game => {
    if (game.players[socket.id] && !game.players[socket.id].isBot) {
      game.handleReconnect(socket.id);
    }
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    socket.emit('error', { message: 'An error occurred. Please try again.' });
  });
  
  socket.on('joinGame', async ({ lightningAddress, betAmount, acctId }) => {
    try {
      console.log('Join game request:', { lightningAddress, betAmount });
      const validBetAmounts = [50, 300, 500, 1000, 5000, 10000];
      if (!validBetAmounts.includes(betAmount)) {
        throw new Error('Invalid bet amount');
      }

      // Resolve and format Lightning address (allow persistence via acctId)
      let resolvedAddress = lightningAddress && lightningAddress.trim() !== '' ? lightningAddress : null;
      if (!resolvedAddress && acctId) {
        const stored = getLightningAddressByAcctId(acctId);
        if (stored) {
          resolvedAddress = stored;
        }
      }
      if (!resolvedAddress) {
        throw new Error('Lightning address is required');
      }
      
      const formattedAddress = resolvedAddress.includes('@') ? resolvedAddress : `${resolvedAddress}@speed.app`;
      console.log(`Player ${socket.id} attempted deposit: ${betAmount} SATS with Lightning address ${formattedAddress}`);
      
      // Map acctId to Lightning address if provided
      if (acctId) {
        mapUserAcctId(acctId, formattedAddress);
        playerAcctIds[socket.id] = acctId;
        console.log(`Mapped player ${socket.id} to acct_id: ${acctId}`);
      }

      // Log player join
      playerLogger.info({
        event: 'player_joined',
        playerId: socket.id,
        lightningAddress: formattedAddress,
        betAmount: betAmount,
        timestamp: new Date().toISOString()
      });

      players[socket.id] = { lightningAddress: formattedAddress, paid: false, betAmount };

      const customerId = 'cus_mbgcu49gfgNyffw9';
      const invoiceData = await createLightningInvoice(
        betAmount,
        customerId,
        `order_${socket.id}_${Date.now()}`,
      );

      const lightningInvoice = invoiceData.lightningInvoice;
      const hostedInvoiceUrl = invoiceData.hostedInvoiceUrl;

      console.log('Payment Request:', { lightningInvoice, hostedInvoiceUrl, speedInterfaceUrl: invoiceData.speedInterfaceUrl });
      socket.emit('paymentRequest', {
        lightningInvoice: lightningInvoice,
        hostedInvoiceUrl: hostedInvoiceUrl,
        speedInterfaceUrl: invoiceData.speedInterfaceUrl, // Speed Wallet interface URL
        invoiceId: invoiceData.invoiceId,
        amountSats: betAmount,
        amountUSD: invoiceData.amountUSD
      });

      invoiceToSocket[invoiceData.invoiceId] = socket;

      const paymentTimeout = setTimeout(() => {
        if (!players[socket.id]?.paid) {
          socket.emit('error', { message: 'Payment not verified within 5 minutes' });
          delete players[socket.id];
          delete invoiceToSocket[invoiceData.invoiceId];
          console.log(`Payment timeout for player ${socket.id}, invoice ${invoiceData.invoiceId}`);
        }
      }, 5 * 60 * 1000);

      socket.on('cancelGame', () => {
        clearTimeout(paymentTimeout);
      });

      socket.on('disconnect', () => {
        clearTimeout(paymentTimeout);
        delete invoiceToSocket[invoiceData.invoiceId];
        console.log(`Socket ${socket.id} disconnected, removed from invoiceToSocket`);
      });

      // Don't create game yet - wait for payment verification
      // Store game reference for payment webhook
      players[socket.id].pendingGameSettings = { betAmount };
    } catch (error) {
      console.error('Join game error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('cancelGame', ({ gameId, playerId }) => {
    console.log(`Cancel game request for game ${gameId}, player ${playerId}`);
    const game = games[gameId];
    if (game && game.players[playerId]) {
      game.cleanup();
      console.log(`Game ${gameId} canceled and cleaned up`);
    }
    delete players[playerId];
  });

  socket.on('updateBoard', ({ playerId, gameId, placements }) => {
    try {
      const game = games[gameId];
      if (game) {
        // Validate ship placements
        const result = game.validateShipPlacements(playerId, placements);
        if (result.success) {
          game.updateBoard(playerId, placements);
          socket.emit('updateBoard', { success: true });
        } else {
          console.error('Server rejected placement:', result.error);
          socket.emit('updateBoard', { success: false, error: result.error });
        }
      } else {
        throw new Error('Game not found');
      }
    } catch (error) {
      console.error('Update board error:', error.message);
      socket.emit('error', { message: 'Failed to update board: ' + error.message });
      socket.emit('updateBoard', { success: false, error: error.message });
    }
  });
  
  socket.on('savePlacement', ({ gameId, placements }) => {
    try {
      const game = games[gameId];
      if (game) {
        game.placeShips(socket.id, placements);
      } else {
        throw new Error('Game not found');
      }
    } catch (error) {
      console.error('Save placement error:', error.message);
      socket.emit('error', { message: error.message });
    }
  });
  
  socket.on('fire', ({ gameId, position }) => {
    try {
      const game = games[gameId];
      if (game) {
        game.fireShot(socket.id, position);
      } else {
        throw new Error('Game not found');
      }
    } catch (error) {
      console.error('Fire shot error:', error.message);
      socket.emit('error', { message: 'Failed to fire shot: ' + error.message });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    Object.values(games).forEach(game => {
      if (game.players[socket.id]) {
        // Handle disconnect with timeout instead of immediate game end
        game.handleDisconnect(socket.id);
        
        if (game.placementTimers[socket.id]) {
          clearTimeout(game.placementTimers[socket.id]);
          delete game.placementTimers[socket.id];
        }

        if (game.matchmakingTimerInterval) {
          clearInterval(game.matchmakingTimerInterval);
          game.matchmakingTimerInterval = null;
        }

        if (Object.keys(game.players).length === 0) {
          delete games[game.id];
          console.log(`Game ${game.id} deleted as no players remain`);
        }
      }
    });
    delete players[socket.id];
  });

  socket.on('clearBoard', ({ gameId }) => {
    const game = games[gameId];
    if (game && game.players[socket.id] && !game.players[socket.id].isBot) {
      game.players[socket.id].board = Array(GRID_SIZE).fill('water');
      game.players[socket.id].ships = [];
      game.players[socket.id].ready = false;
      io.to(socket.id).emit('games', {
        count: Object.values(game.players).filter(p => p.ready).length,
        grid: game.players[socket.id].board,
        ships: game.players[socket.id].ships,
      });
    }
  });
});

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per windowMs
  message: 'Too many requests, please try again later.'
});

// Apply rate limiting to all routes
app.use(limiter);

// Add request queuing to handle high load
app.use(queue({ activeLimit: 50, queuedLimit: -1 }));

// Track server health state
let serverHealth = {
  status: 'ok',
  lastRestartTime: null,
  serviceErrors: 0,
  lastError: null,
  isRecovering: false,
  unavailableCount: 0
};

const MAX_SERVICE_ERRORS = 5;
const RECOVERY_TIMEOUT = 30000; // 30 seconds

// Enhanced health check endpoint with load monitoring
app.get('/health', async (req, res) => {
  const load = process.cpuUsage();
  const memory = process.memoryUsage();
  const healthStatus = {
    status: serverHealth.status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      usedHeapSize: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
      totalHeapSize: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memory.rss / 1024 / 1024) + 'MB'
    },
    load: {
      cpu: load,
      activeGames: Object.keys(games).length,
      activeSockets: io.engine.clientsCount
    },
    errors: {
      serviceErrors: serverHealth.serviceErrors,
      unavailableCount: serverHealth.unavailableCount,
      lastError: serverHealth.lastError,
      isRecovering: serverHealth.isRecovering
    }
  };

  // If we're in a degraded state, still return 200 but indicate issues
  if (serverHealth.isRecovering) {
    healthStatus.status = 'recovering';
  } else if (serverHealth.unavailableCount > 0) {
    healthStatus.status = 'degraded';
  }

  res.status(200).json(healthStatus);
});

// Add recovery mechanism
async function handleServerRecovery() {
  if (serverHealth.unavailableCount >= MAX_SERVICE_ERRORS && !serverHealth.isRecovering) {
    console.log('🔄 Initiating server recovery due to multiple service unavailable errors');
    serverHealth.isRecovering = true;
    
    // Log recovery attempt
    logger.warn({
      event: 'server_recovery_started',
      serviceErrors: serverHealth.serviceErrors,
      unavailableCount: serverHealth.unavailableCount,
      timestamp: new Date().toISOString()
    });

    try {
      // Clear any stuck games or connections
      Object.keys(games).forEach(gameId => {
        const game = games[gameId];
        if (game) {
          game.cleanup();
        }
      });

      // Force close all socket connections
      io.sockets.sockets.forEach(socket => {
        socket.disconnect(true);
      });

      // Clear memory
      global.gc && global.gc();
      
      // Reset health counters
      serverHealth = {
        status: 'ok',
        lastRestartTime: new Date().toISOString(),
        serviceErrors: 0,
        unavailableCount: 0,
        lastError: null,
        isRecovering: false
      };

      logger.info({
        event: 'server_recovery_completed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({
        event: 'server_recovery_failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

const PORT = process.env.PORT || 4000;

// Multiple keep-alive mechanisms with enhanced error handling
let lastPingTime = Date.now();
let serverStartTime = Date.now();
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

// Primary keep-alive: Cron job (every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
  await pingServer('cron');
});

// Secondary keep-alive: setInterval backup (every 7 minutes)
setInterval(async () => {
  // Only ping if more than 3 minutes passed since last successful ping
  if (Date.now() - lastPingTime > 180000) {
    await pingServer('interval');
  }
}, 420000);

// Tertiary keep-alive: Express middleware to reset timer on any request
app.use((req, res, next) => {
  lastPingTime = Date.now();
  consecutiveFailures = 0;
  next();
});

async function pingServer(source) {
  const urls = [];
  
  if (process.env.EXTERNAL_SERVER_URL) {
    urls.push({ url: process.env.EXTERNAL_SERVER_URL, type: 'external' });
  }
  
  // Always include local URL as fallback
  urls.push({ url: process.env.SERVER_URL || `http://localhost:${PORT}/health`, type: 'local' });
  
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000; // 5 seconds

  for (const { url, type } of urls) {
    retryCount = 0;
    while (retryCount < MAX_RETRIES) {
      try {
        console.log(`🏓 ${source}: Pinging ${type} server at ${url} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        const response = await axios.get(url, { 
          timeout: 30000, // Increased timeout to 30 seconds
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0'
          },
          maxRedirects: 5,
          validateStatus: function (status) {
            return status < 500; // Only treat 500+ errors as failures
          }
        });
        
        if (response.status === 200) {
          lastPingTime = Date.now();
          consecutiveFailures = 0;
          
          logger.info({
            event: 'server_ping_success',
            source,
            type,
            uptime: Math.floor((Date.now() - serverStartTime) / 1000),
            timestamp: new Date().toISOString()
          });
          
          return true;
        } else {
          // Treat non-200 (<500) as a soft failure for retry/backoff
          consecutiveFailures++;
          if (response.status === 503) {
            serverHealth.unavailableCount++;
            serverHealth.serviceErrors++;
            serverHealth.lastError = {
              time: new Date().toISOString(),
              message: `Healthcheck non-200 status: ${response.status}`,
              status: response.status
            };
            await handleServerRecovery();
          }
          if (retryCount < MAX_RETRIES - 1) {
            console.log(`Retrying in ${RETRY_DELAY}ms due to status ${response.status}...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          }
          retryCount++;
          continue;
        }
      } catch (error) {
        const isServiceUnavailable = error.response && error.response.status === 503;
        console.error(`❌ ${source}: ${type} server ping failed:`, {
          status: error.response?.status,
          message: error.message,
          attempt: retryCount + 1
        });

        consecutiveFailures++;
        
        // Special handling for service unavailable errors
        if (isServiceUnavailable) {
          console.log('⚠️ Detected service unavailable error, waiting before retry...');
          serverHealth.unavailableCount++;
          serverHealth.serviceErrors++;
          serverHealth.lastError = {
            time: new Date().toISOString(),
            message: error.message,
            status: error.response?.status
          };
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1))); // Exponential backoff
          retryCount++;
          continue;
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error({
            event: 'server_ping_critical_failure',
            source,
            type,
            status: error.response?.status,
            consecutiveFailures,
            error: error.message,
            timestamp: new Date().toISOString()
          });

          // If we're getting persistent 503s, try to recover
          if (isServiceUnavailable && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.log('🔄 Attempting server recovery due to persistent 503 errors');
            await handleServerRecovery();
          }
        }

        if (retryCount < MAX_RETRIES - 1) {
          console.log(`Retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
        retryCount++;
      }
    }
  }
  return false;
}

// Set up global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  logger.error({
    event: 'uncaught_exception',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error({
    event: 'unhandled_rejection',
    error: reason,
    timestamp: new Date().toISOString()
  });
});

// Handle server-specific errors
server.on('error', (error) => {
  console.error('❌ Server failed to start:', error);
  logger.error({
    event: 'server_startup_failed',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
});

// Start the server
try {
  server.listen(PORT, '0.0.0.0', () => {
    serverStartTime = Date.now();
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log('🔄 Keep-alive system initialized:');
    console.log(' - Primary: Cron job (every 5 minutes)');
    console.log(' - Secondary: Interval backup (every 7 minutes)');
    console.log(' - Tertiary: Request-based reset');
    
    // Initial health check
    setTimeout(async () => {
      try {
        await pingServer('startup');
      } catch (error) {
        console.error('Initial health check failed:', error);
      }
    }, 5000);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  logger.error({
    event: 'server_startup_failed',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  process.exit(1);
}