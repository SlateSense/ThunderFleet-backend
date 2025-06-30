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
  transports: ['websocket', 'polling']
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
    ONE_ADJACENT: 0,
    TWO_ADJACENT: 0.30,       // 30% chance
    THREE_ADJACENT: 0.20,     // 20% chance
    INSTANT_SINK: 0.25        // 25% chance
  }
};

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
    this.botCheatMode = {};
    this.botSunkShips = {};
    this.humanSunkShips = {};
    this.placementConfirmed = {}; // Track placement confirmation
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
    this.placementConfirmed[playerId] = false; // Initialize placement confirmation
    const seed = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + Date.now();
    this.randomGenerators[playerId] = mulberry32(seed);

    if (isBot) {
      this.botState[playerId] = {
        lastHit: null,
        adjacentQueue: [],
        triedPositions: new Set(),
        hitMode: false,
        targets: []
      };
      this.botShots[playerId] = new Set();
      this.botTargetedShip[playerId] = null;
      console.log(`Bot ${playerId} joined but will place ships on startPlacing.`);
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
            this.placementConfirmed[playerId] = true;
            io.to(playerId).emit('placementAutoSaved');
            this.checkStartGame();
          }
        }, this.placementTime * 1000);
      } else if (this.players[playerId].isBot) {
        this.autoPlaceShips(playerId); // Place ships for bot
        this.players[playerId].ready = false; // Reset ready for bot until human is ready
        this.placementConfirmed[playerId] = true; // Bot placement is confirmed
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
      io.to(playerId).emit('games', { 
        count: Object.values(this.players).filter(p => p.ready).length,
        grid: player.board,
        ships: placements
      });
    } else {
      this.placementConfirmed[playerId] = true; // Confirm bot placement
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
      const matchingConfig = SHIP_CONFIG.find(s => s.name === ship.name);
      if (!matchingConfig) {
        throw new Error(`Unknown ship: ${ship.name}`);
      }
      if (!ship.positions || !Array.isArray(ship.positions) || ship.positions.length !== matchingConfig.size) {
        throw new Error(`Invalid ship positions length for ${ship.name}. Expected ${matchingConfig.size}, got ${ship.positions.length}`);
      }

      const isHorizontal = ship.horizontal !== undefined ? ship.horizontal : true;
      for (let i = 0; i < ship.positions.length; i++) {
        const pos = ship.positions[i];
        if (pos < 0 || pos >= gridSize) {
          throw new Error(`Position ${pos} out of bounds for ${ship.name}`);
        }
        const row = Math.floor(pos / cols);
        const col = pos % cols;
        if (isHorizontal && (i > 0 && col !== ship.positions[i - 1] % cols + 1)) {
          throw new Error(`Invalid horizontal alignment for ${ship.name} at position ${pos}`);
        }
        if (!isHorizontal && (i > 0 && row !== Math.floor(ship.positions[i - 1] / cols) + 1)) {
          throw new Error(`Invalid vertical alignment for ${ship.name} at position ${pos}`);
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
        hits: 0
      });
    });
    
    player.ready = true;
    this.placementConfirmed[playerId] = true; // Mark placement as confirmed
    
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
    const allConfirmed = Object.keys(this.players).every(playerId => 
      this.placementConfirmed[playerId]
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
      [-1, 0],  // Up
      [1, 0],   // Down
      [0, -1],  // Left
      [0, 1]    // Right
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
             (opponent.board[pos] === 'ship' || opponent.board[pos] === 'water')
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

  botFireShotAtPosition(playerId, position, direction = null, chainMode = false) {
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
            initialHit: position
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

        // If ship is sunk, mark as sunk
        if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
          thisTarget.sunk = true;
          this.botSunkShips[playerId] = (this.botSunkShips[playerId] || 0) + 1;

          // Remove sunk target from current
          if (botState.currentTarget && botState.currentTarget.shipId === ship.name) {
            botState.currentTarget = null;
          }
          botState.targets = botState.targets.filter(t => !t.sunk);

          // --- CHAIN DESTRUCTION LOGIC ---
          // If orientation is known, keep firing in both directions until water/edge/already tried
          if (thisTarget.orientation) {
            const dir = thisTarget.orientation === 'horizontal' ? 1 : GRID_COLS;
            const sortedHits = [...thisTarget.hits].sort((a, b) => a - b);

            // Forward direction
            let next = sortedHits[sortedHits.length - 1] + dir;
            while (
              next >= 0 && next < GRID_SIZE &&
              !botState.triedPositions.has(next) &&
              ((dir === 1) ? Math.floor(next / GRID_COLS) === Math.floor(sortedHits[sortedHits.length - 1] / GRID_COLS)
               : (next % GRID_COLS) === (sortedHits[sortedHits.length - 1] % GRID_COLS))
            ) {
              if (opponent.board[next] === 'ship') {
                // Fire at next and continue chain
                this.botFireShotAtPosition(playerId, next, dir, true);
                return;
              } else {
                break;
              }
            }

            // Backward direction
            next = sortedHits[0] - dir;
            while (
              next >= 0 && next < GRID_SIZE &&
              !botState.triedPositions.has(next) &&
              ((dir === 1) ? Math.floor(next / GRID_COLS) === Math.floor(sortedHits[0] / GRID_COLS)
               : (next % GRID_COLS) === (sortedHits[0] % GRID_COLS))
            ) {
              if (opponent.board[next] === 'ship') {
                // Fire at next and continue chain
                this.botFireShotAtPosition(playerId, next, -dir, true);
                return;
              } else {
                break;
              }
            }
          }
        } else {
          // If not sunk, add adjacents to queue (only after first hit)
          if (thisTarget.hits.length === 1) {
            const adjacents = this._botAdjacents(position, botState);
            thisTarget.queue = [...new Set([...thisTarget.queue, ...adjacents])]
              .filter(pos => !botState.triedPositions.has(pos));
          }
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
      hit: isHit
    });
    
    io.to(this.id).emit('fireResult', {
      player: playerId,
      position,
      hit: isHit
    });

    if (this.shipHits[playerId] >= this.totalShipCells) {
      this.endGame(playerId);
      return;
    }

    // If chainMode, do not streak again (already handled)
    if (isHit && !chainMode) {
      setTimeout(() => this.botFireShot(playerId), Math.floor(Math.random() * 1000) + 500);
    } else if (!isHit) {
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
            t => !t.sunk && ((t.queue && t.queue.length > 0) || (t.hits && t.hits.length > 0))
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
                opponent.board[pos] !== 'miss'
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
        
          if (available.length === 0) {
            this.turn = opponentId;
            io.to(this.id).emit('nextTurn', { turn: this.turn });
            if (this.players[this.turn].isBot) {
              setTimeout(() => this.botFireShot(this.turn), Math.floor(seededRandom() * 2000) + 1000);
            }
            return;
          }

          const hitProbability = 0.6;
          if (availableShips.length > 0 && seededRandom() < hitProbability) {
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
      hit: true
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
      targets: []
    };
    return this.botState[playerId];
  }

  fireShot(playerId, position) {
    if (this.winner || playerId !== this.turn) return false;

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
        }
      }
    }

    const fireResult = {
      player: playerId,
      position,
      hit: isHit,
      sunk: !!sunkShip,
      shipName: sunkShip?.name
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
            shipName: sunkShip.name
          };
          
          io.to(opponentId).emit('fireResult', sinkUpdate);
          io.to(playerId).emit('fireResult', sinkUpdate);
        }
      });
    }

    if (!isHit) {
      this.turn = opponentId;
      io.to(this.id).emit('nextTurn', { turn: this.turn });
      
      if (this.players[this.turn].isBot) {
        const thinkingTime = Math.floor(Math.random() * 2000) + 1000;
        setTimeout(() => this.botFireShot(this.turn), thinkingTime);
      }
    } else {
      io.to(this.id).emit('nextTurn', { turn: this.turn });
    }

    return true;
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
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
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

      console.log(`Player ${socket.id} attempted deposit: ${betAmount} SATS with Lightning address ${lightningAddress}`);

      players[socket.id] = { lightningAddress, paid: false, betAmount };

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
      }, BOT_JOIN_DELAYS[0]);

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

  socket.on('clearBoard', ({ gameId }) => {
    const game = games[gameId];
    if (game && game.players[socket.id] && !game.players[socket.id].isBot) {
      game.players[socket.id].board = Array(GRID_SIZE).fill('water');
      game.players[socket.id].ships = [];
      game.players[socket.id].ready = false;
      io.to(socket.id).emit('games', {
        count: Object.values(game.players).filter(p => p.ready).length,
        grid: game.players[socket.id].board,
        ships: game.players[socket.id].ships
      });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});