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
  MIN: 1000,
  MAX: 3000
};
const BOT_BEHAVIOR = {
  HIT_CHANCE: 0.5,
  ADJACENT_PATTERNS: {
    ONE_ADJACENT: 0,
    TWO_ADJACENT: 0.30,
    THREE_ADJACENT: 0.20,
    INSTANT_SINK: 0.25
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
        targets: [],
        missShotsAfterSink: 0
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

  _isValidPosition(pos, botState) {
    return pos >= 0 && pos < GRID_SIZE && !botState.triedPositions.has(pos);
  }

  _botAdjacents(position, botState) {
    const row = Math.floor(position / GRID_COLS);
    const col = position % GRID_COLS;
    const adjacents = [];

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
        if (this._isValidPosition(newPos, botState)) {
          adjacents.push(newPos);
        }
      }
    }

    return adjacents;
  }

  _botNextInLine(target, botState, opponent) {
    if (!target.hits.length) return null;

    const lastHit = target.hits[target.hits.length - 1];
    const directions = target.orientation === 'horizontal' ? [1, -1] : [GRID_COLS, -GRID_COLS];

    for (const dir of directions) {
      let nextPos = lastHit + dir;
      while (this._isValidPosition(nextPos, botState)) {
        const row = Math.floor(nextPos / GRID_COLS);
        const col = nextPos % GRID_COLS;
        if ((target.orientation === 'horizontal' && row !== Math.floor(lastHit / GRID_COLS)) ||
            (target.orientation === 'vertical' && col !== lastHit % GRID_COLS)) {
          break;
        }
        if (opponent.board[nextPos] === 'water' || opponent.board[nextPos] === 'ship') {
          return nextPos;
        }
        nextPos += dir;
      }
    }
    return null;
  }

  botFireShot(playerId) {
    if (this.winner || playerId !== this.turn || !this.players[playerId].isBot) return;

    const botState = this.botState[playerId];
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    const seededRandom = this.randomGenerators[playerId];
    const thinkingTime = Math.floor(seededRandom() * (BOT_THINKING_TIME.MAX - BOT_THINKING_TIME.MIN) + BOT_THINKING_TIME.MIN);

    setTimeout(() => {
      // Win condition for last few cells
      const remainingShipCells = opponent.board
        .map((cell, idx) => cell === 'ship' && !botState.triedPositions.has(idx) ? idx : null)
        .filter(idx => idx !== null);
      if (remainingShipCells.length <= 3 && remainingShipCells.length > 0) {
        this._botTargetAndDestroy(playerId, opponentId, remainingShipCells);
        return;
      }

      let position = null;
      let currentTarget = botState.targets.find(t => !t.sunk && t.hits.length > 0);

      if (currentTarget) {
        // Continue targeting the current ship
        if (currentTarget.orientation) {
          position = this._botNextInLine(currentTarget, botState, opponent);
        }
        if (!position && currentTarget.queue.length > 0) {
          position = currentTarget.queue.shift();
        }
        if (!position) {
          const ship = opponent.ships.find(s => s.name === currentTarget.shipId);
          position = ship.positions.find(pos => this._isValidPosition(pos, botState));
          if (!position) {
            currentTarget.sunk = true; // Mark as sunk if no valid positions remain
            botState.targets = botState.targets.filter(t => !t.sunk);
            currentTarget = null;

            // Check next and previous positions after sinking
            if (ship) {
              const lastHitPos = currentTarget.hits[currentTarget.hits.length - 1];
              const nextPos = lastHitPos + 1;
              const prevPos = lastHitPos - 1;
              if (nextPos < GRID_SIZE && !botState.triedPositions.has(nextPos) && opponent.board[nextPos] !== 'hit' && opponent.board[nextPos] !== 'miss') {
                position = nextPos;
              } else if (prevPos >= 0 && !botState.triedPositions.has(prevPos) && opponent.board[prevPos] !== 'hit' && opponent.board[prevPos] !== 'miss') {
                position = prevPos;
              }
            }

            // Add intentional misses after sinking
            if (!position && botState.missShotsAfterSink === 0) {
              botState.missShotsAfterSink = Math.floor(seededRandom() * 4) + 1; // 1 to 4 misses
            }
            if (botState.missShotsAfterSink > 0) {
              const availableMisses = Array.from({ length: GRID_SIZE }, (_, i) => i)
                .filter(pos => !botState.triedPositions.has(pos) && opponent.board[pos] !== 'ship');
              if (availableMisses.length > 0) {
                position = availableMisses[Math.floor(seededRandom() * availableMisses.length)];
                botState.missShotsAfterSink--;
              }
            }
          }
        }
      }

      if (!currentTarget) {
        // Find a new target or random shot
        const available = Array.from({ length: GRID_SIZE }, (_, i) => i)
          .filter(pos => !botState.triedPositions.has(pos));
        if (available.length === 0) {
          this.turn = opponentId;
          io.to(this.id).emit('nextTurn', { turn: this.turn });
          return;
        }

        const shipCells = available.filter(pos => opponent.board[pos] === 'ship');
        position = shipCells.length > 0 && seededRandom() < BOT_BEHAVIOR.HIT_CHANCE
          ? shipCells[Math.floor(seededRandom() * shipCells.length)]
          : available[Math.floor(seededRandom() * available.length)];
      }

      botState.triedPositions.add(position);
      const isHit = opponent.board[position] === 'ship';

      if (isHit) {
        opponent.board[position] = 'hit';
        this.shipHits[playerId]++;
        botState.lastHit = position;

        const ship = opponent.ships.find(s => s.positions.includes(position));
        if (ship) {
          ship.hits++;
          let target = botState.targets.find(t => t.shipId === ship.name);
          if (!target) {
            target = {
              shipId: ship.name,
              hits: [position],
              orientation: null,
              queue: this._botAdjacents(position, botState),
              sunk: false
            };
            botState.targets.push(target);
          } else {
            target.hits.push(position);
            target.queue = target.queue.filter(p => p !== position);
          }

          if (target.hits.length >= 2 && !target.orientation) {
            const [a, b] = target.hits;
            target.orientation = Math.abs(a - b) === 1 ? 'horizontal' : 'vertical';
          }

          if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
            target.sunk = true;
            this.botSunkShips[playerId] = (this.botSunkShips[playerId] || 0) + 1;
            botState.missShotsAfterSink = 0; // Reset misses after sinking
          }
        }
      } else {
        opponent.board[position] = 'miss';
      }

      io.to(opponentId).emit('fireResult', { player: playerId, position, hit: isHit });
      io.to(this.id).emit('fireResult', { player: playerId, position, hit: isHit });

      if (this.shipHits[playerId] >= this.totalShipCells) {
        this.endGame(playerId);
        return;
      }

      if (isHit) {
        setTimeout(() => this.botFireShot(playerId), thinkingTime);
      } else {
        this.turn = opponentId;
        io.to(this.id).emit('nextTurn', { turn: this.turn });
        if (this.players[this.turn].isBot) {
          setTimeout(() => this.botFireShot(this.turn), thinkingTime);
        }
      }
    }, thinkingTime);
  }

  _botTargetAndDestroy(playerId, opponentId, remainingShipCells) {
    const botState = this.botState[playerId];
    const opponent = this.players[opponentId];
    const position = remainingShipCells[0];
    opponent.board[position] = 'hit';
    this.shipHits[playerId]++;
    botState.triedPositions.add(position);

    io.to(opponentId).emit('fireResult', { player: playerId, position, hit: true });
    io.to(this.id).emit('fireResult', { player: playerId, position, hit: true });

    if (this.shipHits[playerId] >= this.totalShipCells) {
      this.endGame(playerId);
    } else {
      setTimeout(() => this.botFireShot(playerId), Math.floor(Math.random() * 1000) + 1000);
    }
  }

  fireShot(playerId, position) {
    if (this.winner || playerId !== this.turn) return false;

    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];

    if (position < 0 || position >= GRID_SIZE || 
        opponent.board[position] === 'hit' || 
        opponent.board[position] === 'miss') {
      return false;
    }

    const isHit = opponent.board[position] === 'ship';
    opponent.board[position] = isHit ? 'hit' : 'miss';

    if (isHit) {
      this.shipHits[playerId]++;
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship) {
        ship.hits++;
        if (ship.positions.every(pos => opponent.board[pos] === 'hit')) {
          this.humanSunkShips[playerId] = (this.humanSunkShips[playerId] || 0) + 1;
        }
      }
    }

    io.to(opponentId).emit('fireResult', { player: playerId, position, hit: isHit });
    io.to(playerId).emit('fireResult', { player: playerId, position, hit: isHit });

    if (this.shipHits[playerId] >= this.totalShipCells) {
      this.endGame(playerId);
      return true;
    }

    if (!isHit) {
      this.turn = opponentId;
      io.to(this.id).emit('nextTurn', { turn: this.turn });
      if (this.players[this.turn].isBot) {
        setTimeout(() => this.botFireShot(this.turn), Math.floor(Math.random() * 2000) + 1000);
      }
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
          io.to(id).emit('gameEnd', { message: 'You lost! Better luck next time!' });
        });
      } else {
        const winnerPayment = await sendPayment(winnerAddress, payout.winner, 'SATS');
        console.log('Winner payment sent:', winnerPayment);
        const platformFee = await sendPayment('slatesense@tryspeed.com', payout.platformFee, 'SATS');
        console.log('Platform fee sent:', platformFee);
        humanPlayers.forEach(id => {
          io.to(id).emit('gameEnd', { 
            message: id === playerId ? `You won! ${payout.winner} sats awarded!` : 'You lost!'
          });
        });
      }
    } catch (error) {
      console.error('Payment error:', error.message);
      io.to(this.id).emit('error', { message: `Payment failed: ${error.message}` });
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
    }
    delete games[this.id];
  }
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('joinGame', async ({ lightningAddress, betAmount }) => {
    try {
      const validBetAmounts = [300, 500, 1000, 5000, 10000];
      if (!validBetAmounts.includes(betAmount)) {
        throw new Error('Invalid bet amount');
      }

      players[socket.id] = { lightningAddress, paid: false, betAmount };
      const invoiceData = await createInvoice(
        betAmount,
        'cus_mbgcu49gfgNyffw9',
        `Entry fee for Lightning Sea Battle - Player ${socket.id}`
      );

      socket.emit('paymentRequest', {
        lightningInvoice: invoiceData.lightningInvoice,
        hostedInvoiceUrl: invoiceData.hostedInvoiceUrl,
        invoiceId: invoiceData.invoiceId
      });

      invoiceToSocket[invoiceData.invoiceId] = socket;
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('savePlacement', ({ gameId, placements }) => {
    const game = games[gameId];
    if (game) game.placeShips(socket.id, placements);
  });

  socket.on('fire', ({ gameId, position }) => {
    const game = games[gameId];
    if (game) game.fireShot(socket.id, position);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    Object.values(games).forEach(game => {
      if (game.players[socket.id]) {
        delete game.players[socket.id];
        if (Object.keys(game.players).length === 0) {
          delete games[game.id];
        }
      }
    });
    delete players[socket.id];
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
});