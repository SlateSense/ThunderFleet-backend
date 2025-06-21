require('dotenv').config();
console.log('Debug-2025-06-16-2: dotenv loaded');

const express = require('express');
console.log('Debug-2025-06-16-2: express loaded');

const socketio = require('socket.io');
console.log('Debug-2025-06-16-2: socket.io loaded');

const http = require('http');
console.log('Debug-2025-06-16-2: http loaded');

const cors = require('cors');
console.log('Debug-2025-06-16-2: cors loaded');

const axios = require('axios');
console.log('Debug-2025-06-16-2: axios loaded');

const { bech32 } = require('bech32');
console.log('Debug-2025-06-16-2: bech32 loaded');

const cron = require('node-cron');
console.log('Debug-2025-06-16-2: node-cron loaded');

const crypto = require('crypto');
console.log('Debug-2025-06-16-2: crypto loaded');

const rateLimit = require('express-rate-limit');
console.log('Debug-2025-06-16-2: express-rate-limit loaded');

const app = express();
console.log('Debug-2025-06-16-2: express app created');

app.set('trust proxy', true);
console.log('Debug-2025-06-16-2: Trust proxy enabled');

app.use(cors({
  origin: '*',
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Signature"]
}));
console.log('Debug-2025-06-16-2: CORS middleware applied');

app.use(express.json());

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
console.log('Debug-2025-06-16-2: Rate limiter configured');

app.get('/', (req, res) => {
  res.status(200).send('Thunderfleet Backend is running');
});
console.log('Debug-2025-06-16-2: Root route added');

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
console.log('Debug-2025-06-16-2: Health route added');

const invoiceToSocket = {};

app.post('/webhook', webhookLimiter, async (req, res) => {
  console.log('Webhook headers:', req.headers);
  const WEBHOOK_SECRET = process.env.SPEED_WALLET_WEBHOOK_SECRET || 'your-webhook-secret';
  const event = req.body;
  console.log('Received webhook:', event);

  try {
    const eventType = event.event_type;
    console.log('Processing event type:', eventType);

    switch (eventType) {
      case 'invoice.paid':
      case 'payment.paid':
      case 'payment.confirmed':
        const invoiceId = event.data?.object?.id;
        if (!invoiceId) {
          console.error('Webhook error: No invoiceId in webhook payload');
          return res.status(400).send('No invoiceId in webhook payload');
        }

        const socket = invoiceToSocket[invoiceId];
        if (!socket) {
          console.warn(`Webhook warning: No socket found for invoice ${invoiceId}. Player may have disconnected.`);
          return res.status(200).send('Webhook received but no socket found');
        }

        socket.emit('paymentVerified');
        players[socket.id].paid = true;
        console.log(`Payment verified for player ${socket.id} via webhook: ${invoiceId}`);

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

      case 'payment.failed':
        const failedInvoiceId = event.data?.object?.id;
        if (!failedInvoiceId) {
          console.error('Webhook error: No invoiceId in webhook payload for payment.failed');
          return res.status(400).send('No invoiceId in webhook payload');
        }

        const failedSocket = invoiceToSocket[failedInvoiceId];
        if (failedSocket) {
          failedSocket.emit('error', { message: 'Payment failed. Please try again.' });
          console.log(`Payment failed for player ${failedSocket.id}: ${failedInvoiceId}`);
          delete players[failedSocket.id];
          delete invoiceToSocket[failedInvoiceId];
        } else {
          console.warn(`Webhook warning: No socket found for failed invoice ${failedInvoiceId}. Player may have disconnected.`);
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
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket'], // Added websocket as fallback
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});
console.log('Debug-2025-06-16-2: Socket.IO initialized');

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
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
  10000: { winner: 17000, platformFee: 3000 }
};

const BOT_JOIN_DELAYS = [13000, 15000, 17000, 19000, 21000, 23000, 25000]; // 13-25 seconds
const BOT_THINKING_TIME = {
  MIN: 1000, // Reduced from 2000
  MAX: 3000  // Reduced from 5000
};
const BOT_BEHAVIOR = {
  HIT_CHANCE: 0.5,            // 50% chance to hit
  ADJACENT_PATTERNS: {
    ONE_ADJACENT: 0.25,       // 25% chance
    TWO_ADJACENT: 0.30,       // 30% chance
    THREE_ADJACENT: 0.20,     // 20% chance
    INSTANT_SINK: 0.25        // 25% chance
  }
};

// ...rest of existing constants...

const GRID_COLS = 9;
const GRID_ROWS = 7;
const GRID_SIZE = GRID_COLS * GRID_ROWS;
const PLACEMENT_TIME = 45;
const SHIP_CONFIG = [
  { name: 'Aircraft Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 3 },
  { name: 'Patrol Boat', size: 2 }
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
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    console.error('Send Payment Error:', errorMessage, error.response?.status);
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
    this.botShots = {};
    this.botTargetedShip = {};
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
        adjacentQueue: [],
        triedPositions: new Set(),
        hitMode: false,
        targets: [] // Initialize targets array
      };
      this.botShots[playerId] = new Set();
      this.botTargetedShip[playerId] = null;
      this.autoPlaceShips(playerId);
      this.players[playerId].ready = true;
      console.log(`Bot ${playerId} joined and placed ships automatically.`);
    } else {
      io.to(playerId).emit('joined', { 
        gameId: this.id, 
        playerId: playerId 
      });
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
      }
    }, delay);
  }

  startPlacing() {
    const playerIds = Object.keys(this.players);
    
    playerIds.forEach(playerId => {
      if (!this.players[playerId].isBot && !this.players[playerId].ready) {
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
      const maxAttempts = 200; // Increase attempts to ensure placement
      
      while (!placed && attempts < maxAttempts) {
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
        } else if (attempts === maxAttempts - 1) {
          // Fallback: Place ship in the first available space if all attempts fail
          let fallbackPos = 0;
          while (occupied.has(fallbackPos) && fallbackPos < gridSize) fallbackPos++;
          if (fallbackPos < gridSize) {
            positions.length = 0; // Clear invalid positions
            for (let i = 0; i < shipConfig.size && fallbackPos + i < gridSize; i++) {
              positions.push(fallbackPos + i);
              occupied.add(fallbackPos + i);
            }
            if (positions.length === shipConfig.size) {
              placements.push({
                name: shipConfig.name,
                positions,
                horizontal: true, // Default to horizontal for fallback
                sunk: false,
                hits: 0
              });
              placed = true;
            }
          }
        }
      }
      if (!placed) {
        console.warn(`Failed to place ${shipConfig.name} for player ${playerId} after ${maxAttempts} attempts`);
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
      // Validate ship config and positions
      const matchingConfig = SHIP_CONFIG.find(s => s.name === ship.name);
      if (!matchingConfig) {
        throw new Error(`Unknown ship: ${ship.name}`);
      }
      if (!ship.positions || !Array.isArray(ship.positions) || ship.positions.length !== matchingConfig.size) {
        throw new Error(`Invalid ship positions for ${ship.name}`);
      }

      // Check for overlap and bounds
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
    
    // If all checks pass, update player board and ships
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

    player.ready = false; // Ensure player is unready after randomization
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
      // Validate ship config and positions
      const matchingConfig = SHIP_CONFIG.find(s => s.name === ship.name);
      if (!matchingConfig) {
        throw new Error(`Unknown ship: ${ship.name}`);
      }
      if (!ship.positions || !Array.isArray(ship.positions) || ship.positions.length !== matchingConfig.size) {
        throw new Error(`Invalid ship positions for ${ship.name}`);
      }

      // Check for overlap and bounds
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
    
    // If all checks pass, update player board and ships
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
    try {
      if (this.winner || playerId !== this.turn || !this.players[playerId].isBot) return;

      const botState = this.botState[playerId] || this.initBotState(playerId);
      const opponentId = Object.keys(this.players).find(id => id !== playerId);
      const opponent = this.players[opponentId];
      const seededRandom = this.randomGenerators[playerId];

      // Always win if only 3 or fewer ship cells remain
      const remainingShipCells = opponent.board
        .map((cell, idx) => cell === 'ship' ? idx : null)
        .filter(idx => idx !== null && !botState.triedPositions.has(idx));
      if (remainingShipCells.length > 0 && remainingShipCells.length <= 3) {
        this._botTargetAndDestroy(playerId, opponentId, remainingShipCells);
        return;
      }

      const thinkingTime = Math.floor(seededRandom() * (BOT_THINKING_TIME.MAX - BOT_THINKING_TIME.MIN)) + BOT_THINKING_TIME.MIN;

      setTimeout(() => {
        // Prioritize the first unfinished target
        let target = botState.targets ? botState.targets.find(t => !t.sunk) : null;
        let position = null;

        if (target) {
          // If orientation is known, continue in that direction
          if (target.orientation) {
            position = this._botNextInLine(target, botState);
          } else if (target.queue.length > 0) {
            // Try next adjacent
            position = target.queue.shift();
          }

          // If the target is fully hit but not marked as sunk, check and update
          const ship = opponent.ships.find(s => s.name === target.shipId);
          if (ship && ship.positions.every(pos => opponent.board[pos] === 'hit')) {
            target.sunk = true;
            const nextGrid = this._botNextAfterSunk(target, botState);
            if (nextGrid !== null) {
              const adj = this._botAdjacents(nextGrid, botState);
              botState.targets.push({
                shipId: null,
                hits: [],
                orientation: null,
                queue: [nextGrid, ...adj],
                sunk: false
              });
            }
          }
        }

        // If no active target or target queue is exhausted, pick a new position only if no unfinished targets remain
        if (position === null && (!botState.targets || botState.targets.every(t => t.sunk))) {
          const available = Array.from({ length: GRID_SIZE }, (_, i) => i)
            .filter(pos => !botState.triedPositions.has(pos));
          position = available[Math.floor(seededRandom() * available.length)];
        }

        if (position === null && botState.targets && botState.targets.length > 0) {
          // Revert to the first unfinished target if no new position is found
          target = botState.targets.find(t => !t.sunk);
          if (target) {
            position = target.queue.length > 0 ? target.queue.shift() : this._botNextInLine(target, botState);
          }
        }

        // Fire at position
        if (position !== null) {
          const isHit = opponent.board[position] === 'ship';
          botState.triedPositions.add(position);

          if (isHit) {
            opponent.board[position] = 'hit';
            this.shipHits[playerId]++;

            // Find which ship was hit
            const ship = opponent.ships.find(s => s.positions.includes(position));
            if (ship) {
              // Find or create a target for this ship
              let thisTarget = botState.targets.find(t => t.shipId === ship.name && !t.sunk);
              if (!thisTarget) {
                const adj = this._botAdjacents(position, botState);
                thisTarget = {
                  shipId: ship.name,
                  hits: [position],
                  orientation: null,
                  queue: adj,
                  sunk: false
                };
                botState.targets.push(thisTarget);
              } else {
                thisTarget.hits.push(position);
                thisTarget.queue = thisTarget.queue.filter(p => p !== position);
              }

              // Deduce orientation if 2+ hits
              if (!thisTarget.orientation && thisTarget.hits.length >= 2) {
                const [a, b] = thisTarget.hits;
                thisTarget.orientation = (Math.abs(a - b) === 1) ? 'horizontal' : 'vertical';
              }

              // If ship is sunk, mark as sunk and try next grid in line
              if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
                thisTarget.sunk = true;
                const nextGrid = this._botNextAfterSunk(thisTarget, botState);
                if (nextGrid !== null) {
                  const adj = this._botAdjacents(nextGrid, botState);
                  botState.targets.push({
                    shipId: null,
                    hits: [],
                    orientation: null,
                    queue: [nextGrid, ...adj],
                    sunk: false
                  });
                }
              }
            }
          }

          // Remove finished targets with empty queue
          if (botState.targets) {
            botState.targets = botState.targets.filter(t => !t.sunk || t.queue.length > 0);
          }

          // Emit result to players
          io.to(opponentId).emit('fireResult', {
            player: playerId,
            position,
            hit: isHit
          });

          // Handle turn change
          if (!isHit) {
            this.turn = opponentId;
            if (this.players[this.turn].isBot) {
              setTimeout(() => this.botFireShot(this.turn),
                Math.floor(seededRandom() * 1000) + 1000);
            }
          } else {
            setTimeout(() => this.botFireShot(playerId),
              Math.floor(seededRandom() * 1000) + 1000);
          }

          io.to(this.id).emit('nextTurn', { turn: this.turn });
        }
      }, thinkingTime);
    } catch (error) {
      console.error('Bot error:', error);
    }
  }

  // Helper: get adjacents for a position
  _botAdjacents(position, botState) {
    const adj = [];
    const row = Math.floor(position / GRID_COLS);
    const col = position % GRID_COLS;
    if (row > 0) adj.push(position - GRID_COLS);
    if (row < GRID_ROWS - 1) adj.push(position + GRID_COLS);
    if (col > 0) adj.push(position - 1);
    if (col < GRID_COLS - 1) adj.push(position + 1);
    return adj.filter(pos => !botState.triedPositions.has(pos));
  }

  // Helper: continue in line if orientation is known
  _botNextInLine(target, botState) {
    const hits = target.hits.slice().sort((a, b) => a - b);
    const dir = target.orientation === 'horizontal' ? 1 : GRID_COLS;
    const before = hits[0] - dir;
    const after = hits[hits.length - 1] + dir;
    if (!botState.triedPositions.has(before) && before >= 0 && before < GRID_SIZE) return before;
    if (!botState.triedPositions.has(after) && after >= 0 && after < GRID_SIZE) return after;
    // If both tried, fallback to any in queue
    if (target.queue.length > 0) return target.queue.shift();
    return null;
  }

  // Helper: after sinking, try next grid in line
  _botNextAfterSunk(target, botState) {
    const hits = target.hits.slice().sort((a, b) => a - b);
    const dir = target.orientation === 'horizontal' ? 1 : GRID_COLS;
    const after = hits[hits.length - 1] + dir;
    if (!botState.triedPositions.has(after) && after >= 0 && after < GRID_SIZE) return after;
    return null;
  }

  // Helper: always win if 3 or fewer ship cells remain
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
      hit: true
    });

    // Only end the game if ALL ship cells are hit
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
      targets: [] // Initialize targets array
    };
    return this.botState[playerId];
  }

  getAdjacentPosition(position, count, botState) {
    const adjacent = [];
    const row = Math.floor(position / GRID_COLS);
    const col = position % GRID_COLS;

    // Get all possible adjacent positions
    for (let i = -count; i <= count; i++) {
      for (let j = -count; j <= count; j++) {
        const newRow = row + i;
        const newCol = col + j;
        const newPos = newRow * GRID_COLS + newCol;

        if (newRow >= 0 && newRow < GRID_ROWS &&
            newCol >= 0 && newCol < GRID_COLS &&
            !botState.triedPositions.has(newPos)) {
          adjacent.push(newPos);
        }
      }
    }

    return adjacent[Math.floor(this.randomGenerators[playerId]() * adjacent.length)];
  }

  getShipPosition(ship) {
    return ship.positions.find(pos => !this.botState[this.turn].triedPositions.has(pos));
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
        console.log(`Bot ${playerId} won the game. Bet amount ${this.betAmount} SATS retained by the house.`);
      } else {
        const winnerPayment = await sendPayment(winnerAddress, payout.winner, 'SATS');
        console.log('Winner payment sent:', winnerPayment);

        const winnerFee = payout.winner * 0.01;
        const platformFee = await sendPayment('slatesense@tryspeed.com', payout.platformFee + winnerFee, 'SATS');
        console.log('Platform fee (including winner fee) sent:', platformFee);
        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', { 
            message: id === playerId ? `You won! ${payout.winner} sats awarded!` : 'You lost! Better luck next time!'
          });
        });
        
        io.to(this.id).emit('transaction', { 
          message: `Payments processed: ${payout.winner} sats to winner, ${payout.platformFee + winnerFee} sats total platform fee.`
        });
        console.log(`Game ${this.id} ended. Player ${playerId} won ${payout.winner} SATS.`);
        console.log(`Payout processed for ${playerId}: ${payout.winner} SATS to ${winnerAddress}`);
        console.log(`Platform fee processed: ${payout.platformFee + winnerFee} SATS to slatesense@tryspeed.com`);
      }
    } catch (error) {
      console.error('Payment error:', error.message);
      console.log(`Failed to process payment in game ${this.id} for player ${playerId}: ${error.message}`);
      io.to(this.id).emit('error', { message: `Payment processing failed: ${error.message}` });
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

  clearBoard(playerId) {
    const player = this.players[playerId];
    if (!player || player.ready || player.isBot) return;

    player.board = Array(GRID_SIZE).fill('water');
    player.ships = [];
    player.ready = false;
    io.to(playerId).emit('games', { 
      count: Object.values(this.players).filter(p => p.ready).length,
      grid: player.board,
      ships: player.ships
    });
  }
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    // Notify client of error
    socket.emit('error', { message: 'An error occurred. Please try again.' });
  });
  
  socket.on('joinGame', async ({ lightningAddress, betAmount }) => {
    try {
      console.log('Join game request:', { lightningAddress, betAmount });
      const validBetAmounts = [300, 500, 1000, 5000, 10000];
      if (!validBetAmounts.includes(betAmount)) {
        throw new Error('Invalid bet amount');
      }

      console.log(`Player ${socket.id} attempted deposit: ${betAmount} SATS with Lightning address ${lightningAddress}`);

      players[socket.id] = { lightningAddress, paid: false, betAmount, joinTime: Date.now() };

      const customerId = 'cus_mbgcu49gfgNyffw9';
      const invoiceData = await createInvoice(
        betAmount,
        customerId,
        `Entry fee for Lightning Sea Battle - Player ${socket.id}`
      );

      const lightningInvoice = invoiceData.lightningInvoice;
      const hostedInvoiceUrl = invoiceData.hostedInvoiceUrl;

      console.log('Payment Request:', { lightningInvoice, hostedInvoiceUrl });
      socket.emit('paymentRequest', {
        lightningInvoice: lightningInvoice,
        hostedInvoiceUrl: hostedInvoiceUrl,
        invoiceId: invoiceData.invoiceId
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

      const game = Object.values(games).find(g => 
        g.betAmount === betAmount && Object.keys(g.players).length < 2
      ) || new SeaBattleGame(crypto.randomBytes(16).toString('hex'), betAmount);

      if (!games[game.id]) {
        games[game.id] = game;
      }

      const botTimer = setTimeout(() => {
        if (Object.keys(game.players).length === 1) {
          const botDelay = BOT_JOIN_DELAYS[
            Math.floor(Math.random() * BOT_JOIN_DELAYS.length)
          ];
          
          const botId = `bot-${Date.now()}`;
          game.addPlayer(botId, 'bot@thunderfleet.com', true);
          game.startMatchmaking();
        }
      }, BOT_JOIN_DELAYS[0]); // Use minimum delay

      // Clear bot timer if second player joins
      game.botTimer = botTimer;
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
        game.updateBoard(playerId, placements);
        // Send success response to client
        socket.emit('updateBoard', { success: true });
      } else {
        throw new Error('Game not found');
      }
    } catch (error) {
      console.error('Update board error:', error.message);
      socket.emit('error', { message: 'Failed to update board: ' + error.message });
      socket.emit('updateBoard', { success: false });
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
  
  socket.on('clearBoard', ({ gameId, playerId }) => {
    try {
      const game = games[gameId];
      if (game) {
        game.clearBoard(playerId);
        socket.emit('games', { 
          count: Object.values(game.players).filter(p => p.ready).length,
          grid: game.players[playerId].board,
          ships: game.players[playerId].ships
        });
      } else {
        throw new Error('Game not found');
      }
    } catch (error) {
      console.error('Clear board error:', error.message);
      socket.emit('error', { message: 'Failed to clear board: ' + error.message });
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

cron.schedule('*/5 * * * *', async () => {
  try {
    await axios.get('https://thunderfleet-backend.onrender.com/health');
    console.log('Health check ping successful:', 
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  } catch (error) {
    console.error('Health check ping failed:', error);
  }
});

const PORT = process.env.PORT || 4000;
let cronJobRunning = false;

const startCronJob = () => {
  if (cronJobRunning) return;
  console.log('Debug-2025-06-16-2: Starting cron job for matchmaking');
  cronJobRunning = true;

  cron.schedule('* * * * *', () => { // Every minute
    console.log('Debug-2025-06-16-2: Running matchmaking cron job at', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const activeGames = Object.keys(games).filter(gameId => {
      const game = games[gameId];
      return Object.keys(game.players).length > 0;
    });
    if (activeGames.length > 0) {
      activeGames.forEach(gameId => {
        const game = games[gameId];
        const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const currentTime = new Date(now);
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();

        if (Object.keys(game.players).length === 1) {
          const playerId = Object.keys(game.players)[0];
          const player = players[playerId];
          if (player && !player.paid) {
            io.to(playerId).emit('matchmakingTimer', {
              message: `Waiting for opponent... ${currentHour}:${currentMinute < 10 ? '0' + currentMinute : currentMinute} IST`
            });
          } else if (player && player.paid) {
            const elapsed = (Date.now() - player.joinTime) / 1000;
            if (elapsed > 25) {
              delete games[gameId];
              delete players[playerId];
              io.to(playerId).emit('error', { message: 'Matchmaking timed out after 25 seconds.' });
            } else {
              io.to(playerId).emit('waitingForOpponent', {
                message: `Waiting for opponent... Estimated wait time: ${Math.ceil(25 - elapsed)} seconds`
              });
            }
          }
        } else if (Object.keys(game.players).length === 2) {
          game.turn = Object.keys(game.players)[0];
          Object.keys(game.players).forEach(playerId => {
            if (!game.players[playerId].isBot) {
              io.to(playerId).emit('startPlacing');
            }
          });
          console.log(`[Server] Game ${gameId} started with players ${Object.keys(game.players).join(', ')}`);
        }
      });
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }).start();
  console.log('Debug-2025-06-16-2: Cron job started');
};

const checkCronStatus = () => {
  if (!cronJobRunning) {
    console.log('Debug-2025-06-16-2: Cron job not running, restarting at', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    startCronJob();
  }
};

setInterval(checkCronStatus, 300000); // Check every 5 minutes

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
  startCronJob();
});