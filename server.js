require('dotenv').config();

const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const cors = require('cors');
const axios = require('axios');
const { bech32 } = require('bech32');
const cron = require('node-cron');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
require('winston-daily-rotate-file');

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
function logPlayerSession(playerId, sessionData) {
  const sessionEntry = {
    playerId,
    timestamp: new Date().toISOString(),
    sessionData,
    // Core tracking fields
    gameId: sessionData.gameId || null,
    lightningAddress: sessionData.lightningAddress || null,
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

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const invoiceToSocket = {};

app.post('/webhook', webhookLimiter, async (req, res) => {
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
        const invoiceId = event.data?.object?.id;
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
        transactionLogger.info({
          event: 'payment_verified',
          playerId: socket.id,
          invoiceId: invoiceId,
          amount: players[socket.id]?.betAmount || 'unknown',
          lightningAddress: players[socket.id]?.lightningAddress || 'unknown',
          timestamp: new Date().toISOString(),
          eventType: eventType
        });

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
        game.updatePlayerSession(socket.id, {
          paymentSent: true
        });

        socket.emit('matchmakingTimer', { message: 'Estimated wait time: 10-25 seconds' });
        delete invoiceToSocket[invoiceId];
        break;

      case 'payment.failed':
        const failedInvoiceId = event.data?.object?.id;
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

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com'; // Replace with actual API base URL
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const SPEED_WALLET_WEBHOOK_SECRET = process.env.SPEED_WALLET_WEBHOOK_SECRET;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

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

async function createInvoice(amountSats, customerId, description) {
  try {
    console.log('Creating invoice with params:', { amountSats, customerId, description });
    const createResponse = await axios.post(
      `${SPEED_WALLET_API_BASE}/invoices`,
      {
        currency: 'SATS',
        customer_id: customerId,
        payment_methods: ['lightning'],
        invoice_line_items: [
          {
            type: 'custom_line_item',
            quantity: 1,
            name: description,
            unit_amount: amountSats,
          }
        ],
      },
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    const invoiceId = createResponse.data.id;
    console.log('Created draft invoice:', invoiceId);

    await axios.post(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}/finalize`,
      {},
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15',
        },
        timeout: 5000,
      }
    );
    console.log('Finalized invoice:', invoiceId);

    const retrieveResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15',
        },
        timeout: 5000,
      }
    );
    console.log('Retrieved invoice:', retrieveResponse.data.id);
    const invoiceData = retrieveResponse.data;

    console.log('Full invoice data:', JSON.stringify(invoiceData, null, 2));

    let lightningInvoice = invoiceData.payment_request || 
                          invoiceData.bolt11 || 
                          invoiceData.lightning_invoice || 
                          invoiceData.invoice || 
                          invoiceData.lightning_payment_request || 
                          invoiceData.lightning || 
                          invoiceData.ln_invoice;

    if (lightningInvoice && lightningInvoice.toLowerCase().startsWith('lnurl1')) {
      console.log('Detected LN-URL in payment_request:', lightningInvoice);
      lightningInvoice = await decodeAndFetchLnUrl(lightningInvoice);
      console.log('Fetched BOLT11 invoice from LN-URL:', lightningInvoice);
    }

    if (!lightningInvoice) {
      console.warn('No Lightning invoice found in response. Falling back to hosted_invoice_url.');
      console.warn('Available fields:', Object.keys(invoiceData));
      console.warn('Full invoice data for inspection:', invoiceData);
      lightningInvoice = invoiceData.hosted_invoice_url;
    } else {
      console.log('Found Lightning invoice:', lightningInvoice);
    }

    return {
      hostedInvoiceUrl: invoiceData.hosted_invoice_url,
      lightningInvoice: lightningInvoice,
      invoiceId: invoiceData.id,
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
    logPlayerSession(playerId, {
      event: 'session_created',
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
      
      // Log session update
      logPlayerSession(playerId, {
        event: 'session_updated',
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
        opponentType,
        gameDuration,
        sessionEndTime: new Date().toISOString()
      };
      
      logPlayerSession(playerId, completeSessionData);
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
        // Bot takes time to "think" about placement
        setTimeout(() => {
          this.autoPlaceShips(playerId);
          this.players[playerId].ready = true;
          this.placementConfirmed[playerId] = true;
          console.log(`Bot ${playerId} finished placing ships`);
          this.checkStartGame();
        }, BOT_PLACEMENT_DELAY * 1000);
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
    
    botState.triedPositions.add(position);
    
    const isHit = opponent.board[position] === 'ship';
    
    if (isHit) {
      opponent.board[position] = 'hit';
      this.shipHits[playerId]++;
      botState.lastHit = position;

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
      const thinkingTime = Math.floor(seededRandom() * 1000) + 1000;

      setTimeout(() => {
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
          if (seededRandom() < 0.7) {
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

          if (this.shouldBotCheatToWin(playerId, opponentId) && availableShips.length > 0) {
            position = availableShips[Math.floor(seededRandom() * availableShips.length)];
          } else {
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
    const botSunk = this.botSunkShips[playerId] || 0;
    const humanSunk = this.humanSunkShips[opponentId] || 0;
    const botHits = this.shipHits[playerId] || 0;
    const humanHits = this.shipHits[opponentId] || 0;
    return (
      humanSunk > botSunk ||
      (this.totalShipCells - botHits <= 3) ||
      (this.totalShipCells - humanHits <= 3)
    );
  }

  async endGame(playerId) {
    if (this.winner) return; // Prevent endGame from running multiple times
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
        // Log human victory and payout details
        gameLogger.info({
          event: 'game_ended',
          gameId: this.id,
          winner: playerId,
          winnerType: 'human',
          winnerAddress: winnerAddress,
          betAmount: this.betAmount,
          players: allPlayers,
          payout: {
            winner: payout.winner,
            platformFee: payout.platformFee,
            totalCollected: this.betAmount * 2
          },
          timestamp: new Date().toISOString()
        });

        // Announce winner first
        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', {
            message: id === playerId ? `You won! ${payout.winner} sats are being sent!` : 'You lost! Better luck next time!',
          });
        });

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
        console.log('Winner instant payment sent:', winnerPayment);

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
          message: `Payments processed: ${payout.winner} sats to winner, ${payout.platformFee} sats platform fee.`,
        });

        console.log(`Game ${this.id} ended. Player ${playerId} won ${payout.winner} SATS.`);
        console.log(`Payout processed for ${playerId}: ${payout.winner} SATS to ${winnerAddress}`);
        console.log(`Platform fee processed: ${payout.platformFee} SATS to slatesense@speed.app`);
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
  
  socket.on('joinGame', async ({ lightningAddress, betAmount }) => {
    try {
      console.log('Join game request:', { lightningAddress, betAmount });
      const validBetAmounts = [300, 500, 1000, 5000, 10000];
      if (!validBetAmounts.includes(betAmount)) {
        throw new Error('Invalid bet amount');
      }

      // Validate and format Lightning address
      if (!lightningAddress || lightningAddress.trim() === '') {
        throw new Error('Lightning address is required');
      }
      
      const formattedAddress = lightningAddress.includes('@') ? lightningAddress : `${lightningAddress}@speed.app`;
      console.log(`Player ${socket.id} attempted deposit: ${betAmount} SATS with Lightning address ${formattedAddress}`);

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
      const invoiceData = await createInvoice(
        betAmount,
        customerId,
        `Entry fee for Lightning Sea Battle - Player ${socket.id}`,
      );

      const lightningInvoice = invoiceData.lightningInvoice;
      const hostedInvoiceUrl = invoiceData.hostedInvoiceUrl;

      console.log('Payment Request:', { lightningInvoice, hostedInvoiceUrl });
      socket.emit('paymentRequest', {
        lightningInvoice: lightningInvoice,
        hostedInvoiceUrl: hostedInvoiceUrl,
        invoiceId: invoiceData.invoiceId,
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

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});