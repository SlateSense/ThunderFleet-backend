const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const cors = require('cors');
const axios = require('axios');
const { bech32 } = require('bech32');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allow frontend URL or localhost for dev
    methods: ["GET", "POST"]
  }
});

const SPEED_WALLET_API_BASE = 'https://api.tryspeed.com';
const SPEED_WALLET_SECRET_KEY = process.env.SPEED_WALLET_SECRET_KEY;
const AUTH_HEADER = Buffer.from(`${SPEED_WALLET_SECRET_KEY}:`).toString('base64');

console.log('Using API base:', SPEED_WALLET_API_BASE);
console.log('Using SPEED_WALLET_SECRET_KEY:', SPEED_WALLET_SECRET_KEY?.slice(0, 5) + '...');

const PAYOUTS = {
  300: { winner: 500, platformFee: 100 },
  500: { winner: 800, platformFee: 200 },
  1000: { winner: 1700, platformFee: 300 },
  5000: { winner: 8000, platformFee: 2000 },
  10000: { winner: 17000, platformFee: 3000 }
};

async function decodeAndFetchLnUrl(lnUrl) {
  try {
    console.log('Decoding LN-URL:', lnUrl);
    const { words } = bech32.decode(lnUrl, 2000);
    const decoded = bech32.fromWords(words);
    const url = Buffer.from(decoded).toString('utf8');
    console.log('Decoded LN-URL to URL:', url);

    const response = await axios.get(url);
    console.log('LN-URL response:', response.data);

    if (response.data.tag !== 'payRequest') {
      throw new Error('LN-URL response is not a payRequest');
    }

    const callbackUrl = response.data.callback;
    const amountMsats = response.data.minSendable;

    const callbackResponse = await axios.get(`${callbackUrl}?amount=${amountMsats}`);
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
        }
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
        }
      }
    );
    console.log('Finalized invoice:', invoiceId);

    const retrieveResponse = await axios.get(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15'
        }
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
      console.warn('No Lightning invoice found in response. Available fields:', Object.keys(invoiceData));
      console.warn('Full invoice data for inspection:', invoiceData);
    } else {
      console.log('Found Lightning invoice:', lightningInvoice);
    }

    return {
      hostedInvoiceUrl: invoiceData.hosted_invoice_url,
      lightningInvoice: lightningInvoice || null,
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

async function verifyPayment(invoiceId) {
  try {
    console.log('Verifying payment for invoice:', invoiceId);
    const response = await axios.get(
      `${SPEED_WALLET_API_BASE}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Basic ${AUTH_HEADER}`,
          'speed-version': '2022-04-15'
        }
      }
    );
    console.log('Verify Payment Response:', response.data.status);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    console.error('Verify Payment Error:', errorMessage, error.response?.status);
    throw new Error(`Failed to verify payment: ${errorMessage}`);
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
        }
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

const games = {};
const players = {};
const PLACEMENT_TIME = 30;
const MATCHMAKING_TIMEOUT = 10;

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
  }

  addPlayer(playerId, lightningAddress, isBot = false) {
    this.players[playerId] = {
      lightningAddress,
      board: Array(63).fill('water'),
      ships: [],
      ready: false,
      isBot
    };
    this.bets[playerId] = false;
    this.payments[playerId] = false;
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
    }

    if (Object.keys(this.players).length === 2) {
      if (this.matchmakingTimerInterval) {
        clearInterval(this.matchmakingTimerInterval);
        this.matchmakingTimerInterval = null;
      }
      setTimeout(() => {
        this.startPlacing();
      }, 500);
    }
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
    const gridSize = 63;
    const cols = 9;
    const rows = 7;
    
    const placements = [];
    const occupied = new Set();
    
    const shipConfigs = [
      { name: 'Aircraft Carrier', size: 5 },
      { name: 'Battleship', size: 4 },
      { name: 'Submarine', size: 3 },
      { name: 'Destroyer', size: 3 },
      { name: 'Patrol Boat', size: 2 }
    ];
    
    const seededRandom = this.randomGenerators[playerId];
    
    shipConfigs.forEach(shipConfig => {
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
            sunk: false
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

    const gridSize = 63;
    const cols = 9;
    const rows = 7;
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

    player.board = Array(63).fill('water');
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
          sunk: false
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
    const player = this.players[playerId];
    if (player.isBot) return;
    
    const gridSize = 63;
    const cols = 9;
    const rows = 7;
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
    
    player.board = Array(63).fill('water');
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
        sunk: false
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
      setTimeout(() => this.botFireShot(this.turn), 2000);
    }
  }

  botFireShot(playerId) {
    if (this.winner || playerId !== this.turn || !this.players[playerId].isBot) return;

    const botState = this.botState[playerId];
    const opponentId = Object.keys(this.players).find(id => id !== playerId);
    const opponent = this.players[opponentId];
    const cols = 9;
    const gridSize = 63;

    let position;
    const seededRandom = this.randomGenerators[playerId];

    if (botState.lastHit !== null && botState.positionsToTry.length > 0) {
      position = botState.positionsToTry.shift();
      botState.triedPositions.add(position);
    } else {
      let attempts = 0;
      const hitProbability = seededRandom();
      const shouldHit = hitProbability < 0.6;

      while (attempts < 100) {
        position = Math.floor(seededRandom() * gridSize);
        if (!botState.triedPositions.has(position)) {
          botState.triedPositions.add(position);
          if (shouldHit) {
            if (opponent.board[position] === 'ship') break;
          } else {
            if (opponent.board[position] !== 'ship') break;
          }
        }
        attempts++;
      }
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
      
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship && ship.positions.every(pos => opponent.board[pos] === 'hit')) {
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
      
      if (opponent.ships.every(s => s.sunk)) {
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
        setTimeout(() => this.botFireShot(this.turn), 2000);
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
      
      const ship = opponent.ships.find(s => s.positions.includes(position));
      if (ship && ship.positions.every(pos => opponent.board[pos] === 'hit')) {
        ship.sunk = true;
      }
      
      if (opponent.ships.every(s => s.sunk)) {
        this.endGame(playerId);
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
        setTimeout(() => this.botFireShot(this.turn), 2000);
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

      const winnerPayment = await sendPayment(winnerAddress, payout.winner, 'SATS');
      console.log('Winner payment sent:', winnerPayment);

      const platformFeePayment = await sendPayment('YOUR_PLATFORM_LN_ADDRESS', payout.platformFee, 'SATS');
      console.log('Platform fee sent:', platformFeePayment);

      const humanPlayers = Object.keys(this.players).filter(id => !this.players[id].isBot);
      humanPlayers.forEach(id => {
        io.to(id).emit('gameEnd', { 
          message: id === playerId ? `You won! ${payout.winner} sats awarded!` : 'You lost! Better luck next time!'
        });
      });
      
      io.to(this.id).emit('transaction', { 
        message: `Payments processed: ${payout.winner} sats to winner, ${payout.platformFee} sats total platform fee.`
      });
      
    } catch (error) {
      console.error('Payment error:', error.message);
      io.to(this.id).emit('error', { message: 'Payment processing failed: ' + error.message });
    } finally {
      Object.keys(this.players).forEach(id => {
        delete this.players[id];
      });
      delete games[this.id];
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
  }
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  socket.on('joinGame', async ({ lightningAddress, betAmount }) => {
    try {
      console.log('Join game request:', { lightningAddress, betAmount });
      const validBetAmounts = [300, 500, 1000, 5000, 10000];
      if (!validBetAmounts.includes(betAmount)) {
        throw new Error('Invalid bet amount');
      }

      players[socket.id] = { lightningAddress, paid: false, betAmount };

      const customerId = 'cus_mbgcu49gfgNyffw9';
      const invoiceData = await createInvoice(
        betAmount,
        customerId,
        `Entry fee for Lightning Sea Battle - Player ${socket.id}`
      );

      const lightningInvoice = invoiceData.lightningInvoice;
      const hostedInvoiceUrl = invoiceData.hostedInvoiceUrl;
      if (!hostedInvoiceUrl) {
        throw new Error('No hosted invoice URL in invoice response');
      }
      if (!lightningInvoice) {
        console.warn('No Lightning invoice available, falling back to hosted URL');
      }

      console.log('Payment Request:', lightningInvoice);
      socket.emit('paymentRequest', {
        lightningInvoice: lightningInvoice || hostedInvoiceUrl,
        hostedInvoiceUrl,
        invoiceId: invoiceData.invoiceId
      });

      let paymentVerified = false;
      let paymentCanceled = false;
      const maxAttempts = 300;
      let attempts = 0;

      const cancelListener = ({ gameId, playerId }) => {
        if (playerId === socket.id) {
          paymentCanceled = true;
        }
      };
      socket.on('cancelGame', cancelListener);

      while (attempts < maxAttempts && !paymentVerified && !paymentCanceled) {
        const paymentStatus = await verifyPayment(invoiceData.invoiceId);
        if (paymentStatus.status === 'paid') {
          paymentVerified = true;
          players[socket.id].paid = true;
          
          socket.emit('paymentVerified');
          
          let game = Object.values(games).find(g => 
            Object.keys(g.players).length === 1 && g.betAmount === betAmount
          );
          
          if (!game) {
            const gameId = `game_${Date.now()}`;
            game = new SeaBattleGame(gameId, betAmount);
            games[gameId] = game;
          }
          
          game.addPlayer(socket.id, lightningAddress);
          socket.join(game.id);

          let timer = MATCHMAKING_TIMEOUT;
          game.matchmakingTimerInterval = setInterval(() => {
            socket.emit('matchmakingTimer', { timeLeft: timer });
            timer--;
            if (timer < 0) {
              clearInterval(game.matchmakingTimerInterval);
              game.matchmakingTimerInterval = null;
              if (Object.keys(game.players).length === 1) {
                const botId = `bot_${Date.now()}`;
                game.addPlayer(botId, 'bot@tryspeed.com', true);
                socket.emit('matchedWithBot', { message: 'Playing against a bot!' });
                console.log(`Added bot ${botId} to game ${gameId}`);
              }
            } else if (Object.keys(game.players).length === 2) {
              clearInterval(game.matchmakingTimerInterval);
              game.matchmakingTimerInterval = null;
              socket.emit('matchmakingTimer', { timeLeft: 0 });
            }
          }, 1000);

          break;
        }
        attempts++;
        console.log(`Payment verification attempt ${attempts}/${maxAttempts}: Not paid yet`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      socket.off('cancelGame', cancelListener);

      if (paymentCanceled) {
        throw new Error('Payment canceled by user');
      }

      if (!paymentVerified) {
        throw new Error('Payment not verified within 5 minutes');
      }
    } catch (error) {
      console.error('Join error:', error.message);
      socket.emit('error', { message: 'Failed to join game: ' + error.message });
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
    const game = games[gameId];
    if (game) {
      game.updateBoard(playerId, placements);
    }
  });
  
  socket.on('savePlacement', ({ gameId, placements }) => {
    const game = games[gameId];
    if (game) {
      try {
        game.placeShips(socket.id, placements);
      } catch (e) {
        socket.emit('error', { message: e.message });
      }
    }
  });
  
  socket.on('fire', ({ gameId, position }) => {
    const game = games[gameId];
    if (game) {
      game.fireShot(socket.id, position);
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

const PORT = process.env.PORT || 4000;

server.listen(PORT, err => {
  if (err) console.error('Server failed to start:', err);
  else console.log(`Server running on port ${PORT}`);
});