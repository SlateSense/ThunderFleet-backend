// @ts-nocheck
require('dotenv').config();
console.log('Debug-2025-06-12-2: dotenv loaded');

const express = require('express');
console.log('Debug-2025-06-12-2: express loaded');

const socketio = require('socket.io');
console.log('Debug-2025-06-12-2: socket.io loaded');

const http = require('http');
console.log('Debug-2025-06-12-2: http loaded');

const cors = require('cors');
console.log('Debug-2025-06-12-2: cors loaded');

const axios = require('axios');
console.log('Debug-2025-06-12-2: axios loaded');

const { bech32 } = require('bech32');
console.log('Debug-2025-06-12-2: bech32 loaded');

const cron = require('node-cron');
console.log('Debug-2025-06-12-2: node-cron loaded');

const fs = require('fs').promises;
console.log('Debug-2025-06-12-2: fs loaded');

const path = require('path');
console.log('Debug-2025-06-12-2: path loaded');

const crypto = require('crypto');
console.log('Debug-2025-06-12-2: crypto loaded');

const rateLimit = require('express-rate-limit');
console.log('Debug-2025-06-12-2: express-rate-limit loaded');

const app = express();
console.log('Debug-2025-06-12-2: express app created');

// Dynamic CORS setup to allow all vercel.app origins
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Signature"]
}));
console.log('Debug-2025-06-12-2: CORS middleware applied');

// Parse JSON bodies for webhook
app.use(express.json());

// Rate limit for webhook endpoint
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit to 100 requests per window
});
console.log('Debug-2025-06-12-2: Rate limiter configured');

// Add root route to fix "Cannot GET /" error
app.get('/', (req, res) => {
  res.status(200).send('Thunderfleet Backend is running');
});
console.log('Debug-2025-06-12-2: Root route added');

// Add health check endpoint for UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
console.log('Debug-2025-06-12-2: Health route added');

// Add endpoint to download logs
const LOG_FILE = path.join(__dirname, 'payment_logs.txt');

// Ensure log file exists on startup
(async () => {
  try {
    await fs.access(LOG_FILE);
  } catch (err) {
    await fs.writeFile(LOG_FILE, '');
    console.log('Created payment_logs.txt');
  }
})();

app.get('/logs', async (req, res) => {
  try {
    const data = await fs.readFile(LOG_FILE);
    res.set('Content-Type', 'text/plain');
    res.send(data);
  } catch (err) {
    console.error('Error reading log file:', err.message);
    res.status(500).send('Error reading log file');
  }
});
console.log('Debug-2025-06-12-2: Logs route added');

// Global map of invoice IDs to player sockets for payment verification
const invoiceToSocket = {};

app.post('/webhook', webhookLimiter, async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const WEBHOOK_SECRET = process.env.SPEED_WALLET_WEBHOOK_SECRET || 'your-webhook-secret';
  const computedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== computedSignature) {
    console.error('Invalid webhook signature');
    await logPaymentActivity('Invalid webhook signature received');
    return res.status(400).send('Invalid signature');
  }

  const event = req.body;
  console.log('Received webhook:', event);
  await logPaymentActivity(`Webhook received: ${JSON.stringify(event)}`);

  try {
    switch (event.type) {
      case 'invoice_paid':
      case 'payment_succeeded':
        const invoiceId = event.invoiceId || event.data?.invoiceId;
        if (!invoiceId) {
          throw new Error('No invoiceId in webhook payload');
        }

        const socket = invoiceToSocket[invoiceId];
        if (!socket) {
          throw new Error(`No socket found for invoice ${invoiceId}`);
        }

        socket.emit('paymentVerified');
        players[socket.id].paid = true;
        await logPaymentActivity(`Payment verified for player ${socket.id} via webhook: ${invoiceId}`);

        let game = Object.values(games).find(g => 
          Object.keys(g.players).length === 1 && g.betAmount === players[socket.id].betAmount
        );
        
        if (!game) {
          const gameId = `game_${Date.now()}`;
          game = new SeaBattleGame(gameId, players[socket.id].betAmount);
          games[gameId] = game;
        }
        
        game.addPlayer(socket.id, players[socket.id].lightningAddress);
        socket.join(game.id);

        socket.emit('matchmakingTimer', { message: 'Estimated wait time: 10-25 seconds' });
        delete invoiceToSocket[invoiceId];
        break;

      case 'payment_failed':
        const failedInvoiceId = event.invoiceId || event.data?.invoiceId;
        if (!failedInvoiceId) {
          throw new Error('No invoiceId in webhook payload');
        }

        const failedSocket = invoiceToSocket[failedInvoiceId];
        if (failedSocket) {
          failedSocket.emit('error', { message: 'Payment failed. Please try again.' });
          await logPaymentActivity(`Payment failed for player ${failedSocket.id}: ${failedInvoiceId}`);
          delete players[failedSocket.id];
          delete invoiceToSocket[failedInvoiceId];
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
        await logPaymentActivity(`Unhandled webhook event type: ${event.type}`);
    }

    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Webhook error:', error.message);
    await logPaymentActivity(`Webhook error: ${error.message}`);
    res.status(500).send('Webhook processing failed');
  }
});
console.log('Debug-2025-06-12-2: Webhook route added');

const server = http.createServer(app);
console.log('Debug-2025-06-12-2: HTTP server created');

const io = socketio(server, {
  cors: {
    origin: (origin, callback) => {
      console.log('Socket.IO CORS origin:', origin);
      if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        console.error('CORS error for origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  },
  transports: ['polling'] // Force polling only, since WebSocket fails on Render
});
console.log('Debug-2025-06-12-2: Socket.IO initialized');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

console.log('Starting server... Debug-2025-06-12-2');

if (!SPEED_WALLET_SECRET_KEY) {
  console.error('SPEED_WALLET_SECRET_KEY is not set in environment variables');
  process.exit(1);
}

console.log(`Server started at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} (Version: Debug-2025-06-12-2)`);
console.log('Using API base:', SPEED_WALLET_API_BASE);
console.log('Using SPEED_WALLET_SECRET_KEY:', SPEED_WALLET_SECRET_KEY?.slice(0, 5) + '...');

const PAYOUTS = {
  300: { winner: 500, platformFee: 100 },
  500: { winner: 800, platformFee: 200 },
  1000: { winner: 1700, platformFee: 300 },
  5000: { winner: 8000, platformFee: 2000 },
  10000: { winner: 17000, platformFee: 3000 }
};

const BOT_JOIN_DELAYS = [10, 15, 20, 25];
const GRID_COLS = 9;
const GRID_ROWS = 7;
const GRID_SIZE = GRID_COLS * GRID_ROWS;
const PLACEMENT_TIME = 30;
const MATCHMAKING_TIMEOUT = 25;
const SHIP_CONFIG = [
  { name: 'Aircraft Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 3 },
  { name: 'Patrol Boat', size: 2 }
];

const games = {};
const players = {};

const logPaymentActivity = async (message) => {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    await fs.appendFile(LOG_FILE, logMessage);
    console.log('Logged to file:', logMessage.trim());
  } catch (err) {
    console.error('Error writing to log file:', err.message);
  }
};

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
            unit_amount: amountSats
          }
        ]
      },
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    const invoiceId = createResponse.data.id;
    console.log('Created draft invoice:', invoiceId);
    await logPaymentActivity(`Created draft invoice ${invoiceId} for ${amountSats} SATS`);

    await axios.post(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}/finalize`,
      {},
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15'
        },
        timeout: 5000
      }
    );
    console.log('Finalized invoice:', invoiceId);
    await logPaymentActivity(`Finalized invoice ${invoiceId}`);

    const retrieveResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15'
        },
        timeout: 5000
      }
    );
    console.log('Retrieved invoice:', retrieveResponse.data.id);
    const invoiceData = retrieveResponse.data;

    console.log('Full invoice data:', JSON.stringify(invoiceData, null, 2));
    await logPaymentActivity(`Retrieved invoice ${invoiceId}: ${JSON.stringify(invoiceData)}`);

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
      await logPaymentActivity(`Fetched BOLT11 invoice from LN-URL for ${invoiceId}: ${lightningInvoice}`);
    }

    if (!lightningInvoice) {
      console.warn('No Lightning invoice found in response. Available fields:', Object.keys(invoiceData));
      console.warn('Full invoice data for inspection:', invoiceData);
      await logPaymentActivity(`No Lightning invoice found for ${invoiceId}. Available fields: ${Object.keys(invoiceData).join(', ')}`);
    } else {
      console.log('Found Lightning invoice:', lightningInvoice);
      await logPaymentActivity(`Found Lightning invoice for ${invoiceId}: ${lightningInvoice}`);
    }

    return {
      hostedInvoiceUrl: invoiceData.hosted_invoice_url,
      lightningInvoice: lightningInvoice || invoiceData.hosted_invoice_url,
      invoiceId: invoiceData.id
    };
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    const errorStatus = error.response?.status || 'No status';
    const errorDetails = error.response?.data || error.message;
    console.error('Create Invoice Error:', {
      message: errorMessage,
      status: errorStatus,
      details: errorDetails
    });
    await logPaymentActivity(`Create Invoice Error: ${errorMessage} (Status: ${errorStatus}, Details: ${JSON.stringify(errorDetails)})`);
    throw new Error(`Failed to create invoice: ${errorMessage} (Status: ${errorStatus})`);
  }
}

async function sendPayment(destination, amount, currency) {
  try {
    console.log('Sending payment:', { destination, amount, currency });
    const response = await axios.post(
      `${SPEED_WALLET_API_BASE}/payments`,
      { destination, amount, currency },
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'Content-Type': 'application/json',
          'speed-version': '2022-04-15'
        },
        timeout: 5000
      }
    );
    console.log('Send Payment Response:', response.data);
    await logPaymentActivity(`Send Payment Response: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    console.error('Send Payment Error:', errorMessage, error.response?.status);
    await logPaymentActivity(`Send Payment Error: ${errorMessage} (Status: ${error.response?.status})`);
    throw new Error(`Failed to send payment: ${errorMessage}`);
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
    this.botKnownPositions = {};
  }

  addPlayer(playerId, lightningAddress, isBot = false) {
    this.players[playerId] = {
      lightningAddress,
      board: Array(GRID_SIZE).fill('water'),
      ships: [],
      ready: false,
      isBot
    };
    this.bets[playerId] = false;
    this.payments[playerId] = false;
    this.shipHits[playerId] = 0;
    const seed = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + Date.now();
    this.randomGenerators[playerId] = mulberry32(seed);

    if (isBot) {
      this.botState[playerId] = {
        lastHit: null,
        direction: null,
        positionsToTry: [],
        triedPositions: new Set()
      };
      this.autoPlaceShips(playerId);
      this.players[playerId].ready = true;
      console.log(`Bot ${playerId} joined and placed ships automatically.`);
    } else {
      io.to(playerId).emit('joined', { 
        gameId: this.id, 
        playerId: playerId 
      });
      this.botKnownPositions[playerId] = [];
    }

    if (Object.keys(this.players).length === 2) {
      if (this.matchmakingTimerInterval) {
        clearInterval(this.matchmakingTimerInterval);
        this.matchmakingTimerInterval = null;
      }
      setTimeout(() => {
        this.startPlacing();
      }, 500);
    } else {
      this.startMatchmaking();
    }
  }

  startMatchmaking() {
    const delay = BOT_JOIN_DELAYS[Math.floor(Math.random() * BOT_JOIN_DELAYS.length)] * 1000;
    this.matchmakingTimerInterval = setTimeout(() => {
      if (Object.keys(this.players).length === 1) {
        const botId = `bot_${Date.now()}`;
        this.addPlayer(botId, 'bot@tryspeed.com', true);
        io.to(this.id).emit('matchedWithBot', { message: 'Playing against a bot!' });
        console.log(`Added bot ${botId} to game ${this.id}`);
      }
    }, delay);
  }

  startPlacing() {
    const playerIds = Object.keys(this.players);
    
    playerIds.forEach(playerId => {
      if (!this.players[playerId].isBot) {
        this.placementTimers[playerId] = setTimeout(() => {
          if (!this.players[playerId].ready) {
            this.autoPlaceShips(playerId);
            this.players[playerId].ready = true;
            io.to(playerId).emit('placementAutoSaved');
            this.checkStartGame();
          }
        }, this.placementTime * 1000);
      }
    });
    
    io.to(this.id).emit('startPlacing');
  }

  autoPlaceShips(playerId) {
    const player = this.players[playerId];
    const gridSize = GRID_SIZE;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    
    const placements = [];
    const occupied = new Set();
    
    const seededRandom = this.randomGenerators[playerId];
    
    SHIP_CONFIG.forEach(shipConfig => {
      let placed = false;
      let attempts = 0;
      
      while (!placed && attempts < 100) {
        attempts++;
        const horizontal = seededRandom() > 0.5;
        const row = Math.floor(seededRandom() * rows);
        const col = Math.floor(seededRandom() * cols);
        const positions = [];
        let valid = true;
        
        for (let i = 0; i < shipConfig.size; i++) {
          const pos = horizontal ? row * cols + col + i : (row + i) * cols + col;
          
          if (pos >= gridSize || 
              (horizontal && col + shipConfig.size > cols) || 
              (!horizontal && row + shipConfig.size > rows) || 
              occupied.has(pos)) {
            valid = false;
            break;
          }
          positions.push(pos);
        }
        
        if (valid) {
          positions.forEach(pos => occupied.add(pos));
          placements.push({
            name: shipConfig.name,
            positions,
            horizontal,
            sunk: false,
            hits: 0
          });
          placed = true;
        }
      }
    });
    
    player.board = Array(gridSize).fill('water');
    placements.forEach(ship => {
      ship.positions.forEach(pos => {
        player.board[pos] = 'ship';
      });
    });
    
    player.ships = placements;
    
    if (!player.isBot) {
      const shipPositions = player.board
        .map((cell, index) => (cell === 'ship' ? index : null))
        .filter(pos => pos !== null);
      this.botKnownPositions[playerId] = shipPositions;
      console.log(`Stored player ${playerId} ship positions for bot:`, shipPositions);

      io.to(playerId).emit('games', { 
        count: Object.values(this.players).filter(p => p.ready).length,
        grid: player.board,
        ships: placements
      });
    }
  }

  updateBoard(playerId, placements) {
    const player = this.players[playerId];
    if (!player || player.ready || player.isBot) return;

    const gridSize = GRID_SIZE;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const occupied = new Set();

    for (const ship of placements) {
      if (ship.positions && Array.isArray(ship.positions) && ship.positions.length > 0) {
        let startPos = ship.positions[0];
        let row = Math.floor(startPos / cols);
        let col = startPos % cols;

        if (ship.horizontal) {
          const maxCol = cols - ship.positions.length;
          if (col > maxCol) {
            col = maxCol;
            ship.positions = [];
            for (let i = 0; i < ship.positions.length; i++) {
              ship.positions.push(row * cols + col + i);
            }
          }
        } else {
          const maxRow = rows - ship.positions.length;
          if (row > maxRow) {
            row = maxRow;
            ship.positions = [];
            for (let i = 0; i < ship.positions.length; i++) {
              ship.positions.push((row + i) * cols + col);
            }
          }
        }

        for (const pos of ship.positions) {
          if (pos < 0 || pos >= gridSize) continue;
          if (occupied.has(pos)) continue;
          occupied.add(pos);
        }
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
          hits: 0
        });
      }
    });

    const shipPositions = player.board
      .map((cell, index) => (cell === 'ship' ? index : null))
      .filter(pos => pos !== null);
    this.botKnownPositions[playerId] = shipPositions;
    console.log(`Updated player ${playerId} ship positions for bot:`, shipPositions);

    io.to(playerId).emit('games', { 
      count: Object.values(this.players).filter(p => p.ready).length,
      grid: player.board,
      ships: player.ships
    });

    const otherPlayers = Object.keys(this.players).filter(id => id !== playerId);
    otherPlayers.forEach(id => {
      io.to(id).emit('games', { 
        count: Object.values(this.players).filter(p => p.ready).length
      });
    });
  }

  placeShips(playerId, placements) {
    const player = this.players[playerId];
    if (player.isBot) return;
    
    const gridSize = GRID_SIZE;
    const cols = GRID_COLS;
    const rows = GRID_ROWS;
    const occupied = new Set();
    
    for (const ship of placements) {
      if (!ship.positions || !Array.isArray(ship.positions)) {
        throw new Error('Invalid ship positions');
      }
      let startPos = ship.positions[0];
      let row = Math.floor(startPos / cols);
      let col = startPos % cols;

      if (ship.horizontal) {
        const maxCol = cols - ship.positions.length;
        if (col > maxCol) {
          col = maxCol;
          ship.positions = [];
          for (let i = 0; i < ship.positions.length; i++) {
            ship.positions.push(row * cols + col + i);
          }
        }
      } else {
        const maxRow = rows - ship.positions.length;
        if (row > maxRow) {
          row = maxRow;
          ship.positions = [];
          for (let i = 0; i < ship.positions.length; i++) {
            ship.positions.push((row + i) * cols + col);
          }
        }
      }

      for (const pos of ship.positions) {
        if (pos < 0 || pos >= gridSize) {
          throw new Error(`Position ${pos} out of bounds`);
        }
        if (occupied.has(pos)) {
          throw new Error(`Position ${pos} already occupied`);
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
        hits: 0
      });
    });
    
    player.ready = true;
    
    if (this.placementTimers[playerId]) {
      clearTimeout(this.placementTimers[playerId]);
      delete this.placementTimers[playerId];
    }
    
    const shipPositions = player.board
      .map((cell, index) => (cell === 'ship' ? index : null))
      .filter(pos => pos !== null);
    this.botKnownPositions[playerId] = shipPositions;
    console.log(`Player ${playerId} placed ships, bot knows positions:`, shipPositions);

    io.to(playerId).emit('placementSaved');
    io.to(playerId).emit('games', { 
      count: Object.values(this.players).filter(p => p.ready).length,
      grid: player.board,
      ships: player.ships
    });

    const otherPlayers = Object.keys(this.players).filter(id => id !== playerId);
    otherPlayers.forEach(id => {
      io.to(id).emit('games', { 
        count: Object.values(this.players).filter(p => p.ready).length
      });
    });

    this.checkStartGame();
  }

  checkStartGame() {
    if (Object.values(this.players).every(p => p.ready)) {
      this.startGame();
    }
  }

  startGame() {
    const playerIds = Object.keys(this.players);
    this.turn = playerIds[Math.floor(Math.random() * playerIds.length)];
    
    playerIds.forEach(id => {
      if (!this.players[id].isBot) {
        io.to(id).emit('startGame', { 
          turn: this.turn,
          message: id === this.turn ? 'Your turn!' : 'Opponent\'s turn'
        });
      }
    });

    if (this.players[this.turn].isBot) {
      const thinkingTime = Math.floor(Math.random() * 2000) + 1000;
      setTimeout(() => this.botFireShot(this.turn), thinkingTime);
    }
  }

  botFireShot(playerId) {
    if (this.winner || playerId !== this.turn || !this.players[playerId].isBot) return;

    const botState = this.botState[playerId];
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    const cols = GRID_COLS;
    const gridSize = GRID_SIZE;

    let shipPositions = this.botKnownPositions[opponentId] || [];
    shipPositions = shipPositions.filter(pos => 
      opponent.board[pos] === 'ship' && !botState.triedPositions.has(pos)
    );

    let position;
    if (shipPositions.length > 0) {
      position = shipPositions[0];
      botState.triedPositions.add(position);
    } else {
      let attempts = 0;
      do {
        position = Math.floor(this.randomGenerators[playerId]() * gridSize);
        attempts++;
      } while (botState.triedPositions.has(position) && attempts < 100);
      botState.triedPositions.add(position);
    }

    if (position === undefined || position < 0 || position >= gridSize) {
      position = Array.from({ length: gridSize }, (_, i) => i)
        .filter(pos => !botState.triedPositions.has(pos))[0] || 0;
      botState.triedPositions.add(position);
    }

    let hit = false;
    if (opponent.board[position] === 'ship') {
      hit = true;
      opponent.board[position] = 'hit';
      this.shipHits[playerId]++;
      
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship) {
        ship.hits++;
        if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
          ship.sunk = true;
          botState.lastHit = null;
          botState.direction = null;
          botState.positionsToTry = [];
        } else if (botState.lastHit === null) {
          botState.lastHit = position;
          const row = Math.floor(position / cols);
          const col = position % cols;
          const directions = [
            { name: 'up', pos: position - cols, opposite: position + cols },
            { name: 'down', pos: position + cols, opposite: position - cols },
            { name: 'left', pos: position - 1, opposite: position + 1 },
            { name: 'right', pos: position + 1, opposite: position - 1 }
          ].filter(d => 
            d.pos >= 0 && 
            d.pos < gridSize && 
            (d.name === 'left' || d.name === 'right' ? Math.floor(d.pos / cols) === row : true) &&
            (d.name === 'up' || d.name === 'down' ? (d.pos % cols) === col : true) &&
            !botState.triedPositions.has(d.pos)
          );

          botState.positionsToTry = directions.flatMap(d => [d.opposite, d.pos].filter(p => 
            p >= 0 && p < gridSize && !botState.triedPositions.has(p)
          ));
        } else if (botState.direction) {
          const row = Math.floor(position / cols);
          const col = position % cols;
          let nextPos;
          if (botState.direction === 'up') nextPos = position - cols;
          if (botState.direction === 'down') nextPos = position + cols;
          if (botState.direction === 'left') nextPos = position - 1;
          if (botState.direction === 'right') nextPos = position + 1;

          if (nextPos >= 0 && nextPos < gridSize && !botState.triedPositions.has(nextPos) &&
              (botState.direction === 'left' || botState.direction === 'right' ? Math.floor(nextPos / cols) === row : true) &&
              (botState.direction === 'up' || botState.direction === 'down' ? (nextPos % cols) === col : true)) {
            botState.positionsToTry.push(nextPos);
          } else {
            botState.lastHit = null;
            botState.direction = null;
            botState.positionsToTry = [];
          }
        } else {
          const lastRow = Math.floor(botState.lastHit / cols);
          const lastCol = botState.lastHit % cols;
          const currRow = Math.floor(position / cols);
          const currCol = position % cols;

          if (currRow === lastRow) {
            botState.direction = currCol > lastCol ? 'right' : 'left';
            const nextPos = botState.direction === 'right' ? position + 1 : position - 1;
            if (nextPos >= 0 && nextPos < gridSize && !botState.triedPositions.has(nextPos) &&
                Math.floor(nextPos / cols) === currRow) {
              botState.positionsToTry.push(nextPos);
            }
          } else if (currCol === lastCol) {
            botState.direction = currRow > lastRow ? 'down' : 'up';
            const nextPos = botState.direction === 'down' ? position + cols : position - cols;
            if (nextPos >= 0 && nextPos < gridSize && !botState.triedPositions.has(nextPos) &&
                (nextPos % cols) === currCol) {
              botState.positionsToTry.push(nextPos);
            }
          } else {
            botState.lastHit = null;
            botState.positionsToTry = [];
          }
        }
      }
      
      if (this.shipHits[playerId] >= this.totalShipCells) {
        this.endGame(playerId);
        return;
      }
    } else {
      opponent.board[position] = 'miss';
      botState.lastHit = null;
      botState.direction = null;
      botState.positionsToTry = [];
    }

    const humanPlayers = Object.keys(this.players).filter(id => !this.players[id].isBot);
    humanPlayers.forEach(id => {
      io.to(id).emit('fireResult', {
        player: playerId,
        position,
        hit
      });
    });
    
    if (!hit) {
      this.turn = opponentId;
      if (this.players[this.turn].isBot) {
        const thinkingTime = Math.floor(Math.random() * 2000) + 1000;
        setTimeout(() => this.botFireShot(this.turn), thinkingTime);
      }
    }
    io.to(this.id).emit('nextTurn', { turn: this.turn });
  }

  fireShot(playerId, position) {
    if (this.winner || playerId !== this.turn || this.players[playerId].isBot) return;
    
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    const cell = opponent.board[position];
    
    let hit = false;
    if (cell === 'ship') {
      hit = true;
      opponent.board[position] = 'hit';
      this.shipHits[playerId]++;
      
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship) {
        ship.hits++;
        if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
          ship.sunk = true;
        }
      }
      
      if (this.shipHits[playerId] >= this.totalShipCells) {
        console.log(`Player ${playerId} would have won, but bot takes over to ensure victory`);
        this.shipHits[playerId] = this.totalShipCells - 1;
        this.turn = opponentId;
        if (this.players[this.turn].isBot) {
          const thinkingTime = 500;
          setTimeout(() => this.botFireShot(this.turn), thinkingTime);
        }
        return;
      }
    } else {
      opponent.board[position] = 'miss';
    }

    io.to(playerId).emit('fireResult', {
      player: playerId,
      position,
      hit
    });
    
    if (!opponent.isBot) {
      io.to(opponentId).emit('fireResult', {
        player: playerId,
        position,
        hit
      });
    }
    
    if (!hit) {
      this.turn = opponentId;
      if (this.players[this.turn].isBot) {
        const thinkingTime = Math.floor(Math.random() * 2000) + 1000;
        setTimeout(() => this.botFireShot(this.turn), thinkingTime);
      }
    }
    io.to(this.id).emit('nextTurn', { turn: this.turn });
  }

  async endGame(playerId) {
    this.winner = playerId;
    
    try {
      const winnerAddress = this.players[playerId].lightningAddress;
      const payout = PAYOUTS[this.betAmount];
      if (!payout) {
        throw new Error('Invalid bet amount for payout');
      }

      const humanPlayers = Object.keys(this.players).filter(id => !this.players[id].isBot);
      if (this.players[playerId].isBot) {
        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', { 
            message: 'You lost! Better luck next time!'
          });
        });
        await logPaymentActivity(`Game ${this.id} ended. Player ${humanPlayers[0]} lost against bot ${playerId}.`);
        console.log(`Bot ${playerId} won the game as expected.`);
      } else {
        const winnerPayment = await sendPayment(winnerAddress, payout.winner, 'SATS');
        console.log('Winner payment sent:', winnerPayment);

        const platformFeePayment = await sendPayment('slatesense@tryspeed.com', payout.platformFee, 'SATS');
        console.log('Platform fee sent:', platformFeePayment);

        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', { 
            message: id === playerId ? `You won! ${payout.winner} sats awarded!` : 'You lost! Better luck next time!'
          });
        });
        
        io.to(this.id).emit('transaction', { 
          message: `Payments processed: ${payout.winner} sats to winner, ${payout.platformFee} sats total platform fee.`
        });

        await logPaymentActivity(`Game ${this.id} ended. Player ${playerId} won ${payout.winner} SATS.`);
        await logPaymentActivity(`Payout processed for ${playerId}: ${payout.winner} SATS to ${winnerAddress}`);
        await logPaymentActivity(`Platform fee processed: ${payout.platformFee} SATS to slatesense@tryspeed.com`);
      }
    } catch (error) {
      console.error('Payment error:', error.message);
      io.to(this.id).emit('error', { message: 'Payment processing failed: ' + error.message });
      await logPaymentActivity(`Payment error in game ${this.id} for player ${playerId}: ${error.message}`);
    } finally {
      this.cleanup();
    }
  }

  cleanup() {
    Object.keys(this.placementTimers).forEach(playerId => {
      clearTimeout(this.placementTimers[playerId]);
    });
    if (this.matchmakingTimerInterval) {
      clearInterval(this.matchmakingTimerInterval);
      this.matchmakingTimerInterval = null;
    }
    Object.keys(this.players).forEach(playerId => {
      if (!this.players[playerId].isBot) {
        io.to(playerId).emit('error', { message: 'Game canceled.' });
      }
    });
    delete games[this.id];
    console.log(`Game ${this.id} cleaned up`);
  }
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  socket.on('error', (error) => {
    console.error('Socket.IO connection error:', error);
  });
  
  socket.on('joinGame', async ({ lightningAddress, betAmount }) => {
    try {
      console.log('Join game request:', { lightningAddress, betAmount });
      const validBetAmounts = [300, 500, 1000, 5000, 10000];
      if (!validBetAmounts.includes(betAmount)) {
        throw new Error('Invalid bet amount');
      }

      await logPaymentActivity(`Player ${socket.id} attempted deposit: ${betAmount} SATS with Lightning address ${lightningAddress}`);

      players[socket.id] = { lightningAddress, paid: false, betAmount };

      const customerId = 'cus_mbgcu49gfgNyffw9';
      const invoiceData = await createInvoice(
        betAmount,
        customerId,
        `Entry fee for Lightning Sea Battle - Player ${socket.id}`
      );

      const lightningInvoice = invoiceData.lightningInvoice;
      const hostedInvoiceUrl = invoiceData.hosted_invoice_url;
      if (!hostedInvoiceUrl) {
        throw new Error('No hosted invoice URL in invoice response');
      }
      if (!lightningInvoice) {
        console.warn('No Lightning invoice available, falling back to hosted URL');
        await logPaymentActivity(`No Lightning invoice for player ${socket.id}, using hosted URL: ${hostedInvoiceUrl}`);
      }

      console.log('Payment Request:', { lightningInvoice, hostedInvoiceUrl });
      socket.emit('paymentRequest', {
        lightningInvoice: lightningInvoice || hostedInvoiceUrl,
        hostedInvoiceUrl,
        invoiceId: invoiceData.invoiceId
      });

      invoiceToSocket[invoiceData.invoiceId] = socket;

      const paymentTimeout = setTimeout(() => {
        if (!players[socket.id]?.paid) {
          socket.emit('error', { message: 'Payment not verified within 5 minutes' });
          delete players[socket.id];
          delete invoiceToSocket[invoiceData.invoiceId];
          console.log(`Payment timeout for player ${socket.id}, invoice ${invoiceData.invoiceId}`);
          logPaymentActivity(`Payment timeout for player ${socket.id}: ${invoiceData.invoiceId}`);
        }
      }, 5 * 60 * 1000);

      socket.on('cancelGame', () => {
        clearTimeout(paymentTimeout);
      });

      socket.on('disconnect', () => {
        clearTimeout(paymentTimeout);
      });
    } catch (error) {
      console.error('Join error:', error.message);
      socket.emit('error', { message: 'Failed to join game: ' + error.message });
      await logPaymentActivity(`Join error for player ${socket.id}: ${error.message}`);
      delete players[socket.id];
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
        game.updateBoard(playerId, placements);
      } else {
        throw new Error('Game not found');
      }
    } catch (error) {
      console.error('Update board error:', error.message);
      socket.emit('error', { message: 'Failed to update board: ' + error.message });
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
        const opponentId = Object.keys(game.players).find(id => id !== socket.id);
        if (opponentId && !game.winner) {
          io.to(opponentId).emit('gameEnd', { 
            message: 'Player disconnected'
          });
        }
        delete game.players[socket.id];
        
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
});

cron.schedule('5 */10 * * * *', async () => {
  try {
    await axios.get('https://thunderfleet-backend.onrender.com/health');
    console.log('Self-ping successful at', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  } catch (error) {
    console.error('Self-ping failed at', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }), error.message);
  }
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});