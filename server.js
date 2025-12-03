const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const PORT = process.env.PORT || 9000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin123'; // Change this in production!
const BCRYPT_ROUNDS = 10; // Salt rounds for bcrypt

// Sanitization configuration
const sanitizeConfig = {
  allowedTags: [], // No HTML tags allowed
  allowedAttributes: {}, // No attributes allowed
  textFilter: (text) => text // Keep text as-is after stripping tags
};

// Utility function to sanitize user input
function sanitizeInput(input, maxLength = 200) {
  if (!input || typeof input !== 'string') return '';

  // Remove HTML tags and dangerous content
  const sanitized = sanitizeHtml(input, sanitizeConfig);

  // Trim whitespace
  const trimmed = sanitized.trim();

  // Limit length
  return trimmed.substring(0, maxLength);
}

// Rate limiting for Socket.IO events
const socketRateLimits = new Map(); // socketId -> { eventName -> [timestamps] }

const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMITS = {
  'chatMessage': 20,      // 20 messages per minute
  'lobbyChatMessage': 20, // 20 messages per minute
  'makeMove': 60,         // 60 moves per minute (1 per second)
  'undoMove': 10,         // 10 undo requests per minute
  'emojiReaction': 30,    // 30 emojis per minute
  'default': 100          // 100 requests per minute for other events
};

function checkRateLimit(socketId, eventName) {
  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(socketId, new Map());
  }

  const socketLimits = socketRateLimits.get(socketId);
  const now = Date.now();
  const limit = RATE_LIMITS[eventName] || RATE_LIMITS.default;

  // Get timestamps for this event
  let timestamps = socketLimits.get(eventName) || [];

  // Remove timestamps outside the window
  timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);

  // Check if limit exceeded
  if (timestamps.length >= limit) {
    return false; // Rate limit exceeded
  }

  // Add current timestamp
  timestamps.push(now);
  socketLimits.set(eventName, timestamps);

  return true; // Within rate limit
}

function cleanupRateLimit(socketId) {
  socketRateLimits.delete(socketId);
}

// Data file paths
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const CHAT_HISTORY_FILE = path.join(__dirname, 'data', 'chat-history.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// User Manager
const UserManager = {
  users: {},

  async init() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(USERS_FILE);
      try {
        await fs.access(dataDir);
      } catch {
        console.log('📂 Creating data directory...');
        await fs.mkdir(dataDir, { recursive: true });
      }

      const data = await fs.readFile(USERS_FILE, 'utf8');
      this.users = JSON.parse(data);
      console.log('👥 Users loaded:', Object.keys(this.users).length);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('⚠️ Users file not found, creating default...');
        // Create default admin user
        this.users = {
          'András': { password: 'admin123', isAdmin: true, rank: 'Főadmin', score: 0 }
        };
        await this.save();
      } else {
        console.error('❌ Error loading users:', error);
      }
    }
  },

  async save() {
    try {
      // Ensure data directory exists before saving
      const dataDir = path.dirname(USERS_FILE);
      try {
        await fs.access(dataDir);
      } catch {
        await fs.mkdir(dataDir, { recursive: true });
      }

      await fs.writeFile(USERS_FILE, JSON.stringify(this.users, null, 2));
      console.log('💾 Users saved');
    } catch (error) {
      console.error('❌ Error saving users:', error);
    }
  },

  getUser(username) {
    return this.users[username];
  },

  async createUser(username, password) {
    // Hash password if provided
    const hashedPassword = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;

    this.users[username] = {
      password: hashedPassword,
      isAdmin: false,
      rank: 'Újonc',
      score: 0,
      createdAt: new Date().toISOString(),
      stats: {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        pvpWins: 0,
        pvpLosses: 0,
        aiEasyWins: 0,
        aiMediumWins: 0,
        aiHardWins: 0,
        aiLosses: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        fastestWin: null,
        boardSizePreference: { '9': 0, '13': 0, '15': 0, '19': 0 },
        totalMoves: 0,
        avgMovesPerGame: 0,
        lastPlayed: null
      }
    };
    await this.save();
    return this.users[username];
  },

  // Initialize stats for existing users without stats
  async ensureUserStats(username) {
    const user = this.users[username];
    if (!user) return false;

    if (!user.stats) {
      user.stats = {
        totalGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        pvpWins: 0,
        pvpLosses: 0,
        aiEasyWins: 0,
        aiMediumWins: 0,
        aiHardWins: 0,
        aiLosses: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        fastestWin: null,
        boardSizePreference: { '9': 0, '13': 0, '15': 0, '19': 0 },
        totalMoves: 0,
        avgMovesPerGame: 0,
        lastPlayed: null
      };
      await this.save();
      console.log(`📊 Stats initialized for: ${username}`);
      return true;
    }
    return false;
  },

  // Update player statistics after game
  async updatePlayerStats(username, gameResult) {
    const user = this.users[username];
    if (!user) return;

    this.ensureUserStats(username);
    const stats = user.stats;

    // Update basic stats
    stats.totalGames++;
    stats.lastPlayed = new Date().toISOString();
    stats.totalMoves += gameResult.moves || 0;
    stats.avgMovesPerGame = Math.round(stats.totalMoves / stats.totalGames);

    // Update board size preference
    if (gameResult.boardSize) {
      stats.boardSizePreference[gameResult.boardSize]++;
    }

    // Update win/loss/draw stats
    if (gameResult.result === 'win') {
      stats.wins++;
      stats.currentWinStreak++;

      // Update longest win streak
      if (stats.currentWinStreak > stats.longestWinStreak) {
        stats.longestWinStreak = stats.currentWinStreak;
      }

      // Update fastest win
      if (!stats.fastestWin || gameResult.moves < stats.fastestWin) {
        stats.fastestWin = gameResult.moves;
      }

      // Update mode-specific wins
      if (gameResult.mode === 'pvp') {
        stats.pvpWins++;
      } else if (gameResult.mode === 'ai-easy') {
        stats.aiEasyWins++;
      } else if (gameResult.mode === 'ai-medium') {
        stats.aiMediumWins++;
      } else if (gameResult.mode === 'ai-hard') {
        stats.aiHardWins++;
      }
    } else if (gameResult.result === 'loss') {
      stats.losses++;
      stats.currentWinStreak = 0; // Reset win streak

      // Update mode-specific losses
      if (gameResult.mode === 'pvp') {
        stats.pvpLosses++;
      } else if (gameResult.mode.startsWith('ai-')) {
        stats.aiLosses++;
      }
    } else if (gameResult.result === 'draw') {
      stats.draws++;
      stats.currentWinStreak = 0; // Reset win streak
    }

    // Calculate win rate
    const totalDecidedGames = stats.wins + stats.losses;
    stats.winRate = totalDecidedGames > 0 ? Math.round((stats.wins / totalDecidedGames) * 100) : 0;

    // Update score (simple: +10 for win, -5 for loss, +2 for draw)
    if (gameResult.result === 'win') {
      user.score += 10;
    } else if (gameResult.result === 'loss') {
      user.score = Math.max(0, user.score - 5);
    } else if (gameResult.result === 'draw') {
      user.score += 2;
    }

    // Update rank based on score
    if (user.score >= 100) {
      user.rank = 'Nagymester';
    } else if (user.score >= 50) {
      user.rank = 'Mester';
    } else if (user.score >= 20) {
      user.rank = 'Haladó';
    } else {
      user.rank = 'Újonc';
    }

    await this.save();
    console.log(`📊 Stats updated for ${username}: ${stats.wins}W-${stats.losses}L-${stats.draws}D (${stats.winRate}%)`);
  },

  async setPassword(username, password) {
    if (this.users[username]) {
      // Hash password before storing
      this.users[username].password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.save();
      return true;
    }
    return false;
  },

  async verifyPassword(username, password) {
    const user = this.users[username];
    if (!user || !user.password) {
      return false;
    }

    // Check if password is already hashed (starts with $2b$ for bcrypt)
    if (!user.password.startsWith('$2b$')) {
      // Legacy plain text password - compare directly and then migrate
      if (user.password === password) {
        console.log(`⚠️ Migrating plain text password for user: ${username}`);
        await this.setPassword(username, password);
        return true;
      }
      return false;
    }

    // Compare hashed password
    return await bcrypt.compare(password, user.password);
  },

  async migrateAllPasswords() {
    console.log('🔄 Starting password migration...');
    let migrated = 0;

    for (const [username, user] of Object.entries(this.users)) {
      if (user.password && !user.password.startsWith('$2b$')) {
        console.log(`🔐 Migrating password for: ${username}`);
        const plainPassword = user.password;
        user.password = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
        migrated++;
      }
    }

    if (migrated > 0) {
      await this.save();
      console.log(`✅ Migrated ${migrated} passwords to bcrypt`);
    } else {
      console.log('✅ All passwords already hashed');
    }
  },

  async updateScore(username, points) {
    if (this.users[username]) {
      this.users[username].score = (this.users[username].score || 0) + points;
      await this.save();
      console.log(`🏆 Score updated for ${username}: +${points} (Total: ${this.users[username].score})`);
      return this.users[username].score;
    }
    return null;
  },

  getAdminUserLists(connectedClients) {
    const registered = [];
    const guests = [];
    const onlineSocketIds = new Set();

    // 1. Process Connected Clients (Guests & Online Registered)
    connectedClients.forEach((client, socketId) => {
      onlineSocketIds.add(socketId);
      const user = this.users[client.name];

      if (user) {
        // Online Registered User
        registered.push({
          name: client.name,
          rank: user.rank || (user.isAdmin ? 'Admin' : 'Újonc'),
          score: user.score || 0,
          isAdmin: user.isAdmin,
          isOnline: true,
          socketId: socketId,
          room: client.room
        });
      } else {
        // Guest User
        guests.push({
          name: client.name,
          rank: 'Vendég',
          isAdmin: false,
          isOnline: true,
          socketId: socketId,
          room: client.room
        });
      }
    });

    // 2. Process Offline Registered Users
    Object.entries(this.users).forEach(([name, user]) => {
      // Check if already added as online
      const isOnline = registered.some(r => r.name === name);
      if (!isOnline) {
        registered.push({
          name: name,
          rank: user.rank || (user.isAdmin ? 'Admin' : 'Újonc'),
          score: user.score || 0,
          isAdmin: user.isAdmin,
          isOnline: false,
          socketId: null,
          room: null
        });
      }
    });

    return { registered, guests };
  }
};

// Initialize UserManager
(async () => {
  await UserManager.init();
  await UserManager.migrateAllPasswords();
})();

// Global timer settings (admin configurable)
let globalTimerSettings = {
  enabled: false,
  duration: 60 // seconds
};
let globalUndoEnabled = true; // Default: Undo enabled

// Global AI settings (admin configurable)
let globalAISettings = {
  aiVsAiEnabled: false // AI vs AI mode toggle
};

// Game statistics tracking
let gameStats = {
  totalGames: 0,
  totalGamesCompleted: 0,
  activeGames: 0,
  peakTimes: Array(24).fill(0), // Hourly game count
  boardSizes: { '9': 0, '13': 0, '15': 0, '19': 0 },
  gameModes: { 'pvp': 0, 'ai-easy': 0, 'ai-medium': 0, 'ai-hard': 0, 'ai-vs-ai': 0 },
  aiWins: 0,
  playerWins: 0,
  draws: 0
};

// Balambér chatbot messages
const balamberMessages = [
  'Sziasztok! Balambér vagyok, a ti virtuális játékmesteretek! 🎮',
  'Ki mer velem megmérkőzni? Én aztán nem ismerek kegyelmet! 😎',
  'Tudtátok, hogy az öt egy sorban a harmadik legjobb dolog a világon? Az első kettő titkos. 🤫',
  'Néha csak ülök itt és gondolkodom... Mit is csinálok én itt? 🤔',
  'A legjobb játékosok mindig a lobbyban kezdik! És itt vagyok én is! 😄',
  'Psszt... Próbáltátok már az AI vs AI módot? Lenyűgöző! 🤖⚔️🤖',
  'Mindig tanulok új stratégiákat. Ti is így csináljátok? 📚',
  'Ígérem, nem spiccelem ki a játékokat... Vagy mégis? 😈',
  'Halló? Van itt valaki? Vagy csak én beszélek magamban megint? 👻',
  'Fun fact: Az amőba neve a latin "amoeba"-ból származik. Most mindannyian okosabbak lettünk! 🧠',
  'Szerintem ma mindenkinek szerencséje lesz! Főleg nekem! 🍀',
  'Emlékeztek még mikor először játszottatok amőbát? Én igen, tegnap volt. 😅',
  'A győzelem kulcsa: stratégia, türelem, és egy csipet szerencse! ✨',
  'Néha csak nézem a játékokat és tanulok belőlük. Ti is így csináljátok? 👀',
  'Ki szereti a 15x15-ös táblát? Én azt mondom, minél nagyobb, annál jobb! 🎯'
];

// Lobby chat history (last 10 messages)
let lobbyChatHistory = [];

// Track connected clients
const connectedClients = new Map(); // socketId -> {name, isAdmin, connectedAt, createdRoom}
const loggedInPlayers = new Map(); // socketId -> {name, loggedInAt}

// Security headers with helmet (CSP relaxed for inline handlers and CDN)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:", "https://cdn.jsdelivr.net"], // Allow CDN and WebSocket
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Serve static files
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state management
const rooms = new Map();
const pendingRoomDeletions = new Map(); // roomId -> timeout (for delayed room deletion after disconnect)
let roomIdCounter = 1000; // Start from 1000 for nicer room IDs

// Generate unique room ID
function generateRoomId() {
  return `SZOBA-${roomIdCounter++}`;
}

// Funny AI name generator
function generateFunnyAIName(difficulty) {
  const funnyNames = [
    'Terminátor', 'SzuperAgy', 'Géniusz', 'Mesterlövész', 'Bajnok',
    'Robotkommandó', 'Stratéga', 'Taktikus', 'Nagymester', 'Professzor',
    'Kódoló', 'Számológép', 'Kvantum', 'Neuron', 'Algoritmus',
    'Bináris Zseni', 'Logikai Ász', 'Következtető', 'Sakkóriás', 'Gondolkodó',
    'Digitális Mester', 'Elektronagy', 'Megamind', 'Brainiac', 'Szuperkomputer',
    'Kalkulátor', 'Problémamegoldó', 'Tervező', 'Kiborg', 'Neo'
  ];

  const randomName = funnyNames[Math.floor(Math.random() * funnyNames.length)];
  return `${randomName} (AI)`;
}

// MCTS Node class
class MCTSNode {
  constructor(board, boardSize, move, parent, playerSymbol) {
    this.board = board; // board state (not used after creation to save memory)
    this.boardSize = boardSize;
    this.move = move; // [row, col] that led to this node
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.playerSymbol = playerSymbol; // symbol of player who just moved
    this.untriedMoves = null; // populated lazily
  }

  // UCB1 formula for node selection
  getUCB1(explorationConstant = 1.41) {
    if (this.visits === 0) return Infinity;
    return (this.wins / this.visits) + explorationConstant * Math.sqrt(Math.log(this.parent.visits) / this.visits);
  }

  // Select best child using UCB1
  selectChild() {
    return this.children.reduce((best, child) =>
      child.getUCB1() > best.getUCB1() ? child : best
    );
  }

  // Add child node
  addChild(move, board, boardSize, playerSymbol) {
    const childBoard = board.map(row => [...row]);
    childBoard[move[0]][move[1]] = playerSymbol;
    const child = new MCTSNode(childBoard, boardSize, move, this, playerSymbol);
    this.untriedMoves = this.untriedMoves.filter(m => m[0] !== move[0] || m[1] !== move[1]);
    this.children.push(child);
    return child;
  }

  // Get untried moves (lazy initialization)
  getUntriedMoves(board, boardSize) {
    if (this.untriedMoves === null) {
      this.untriedMoves = this.getPossibleMoves(board, boardSize);
    }
    return this.untriedMoves;
  }

  // Get possible moves near occupied cells
  getPossibleMoves(board, boardSize) {
    const moves = [];
    const occupied = [];

    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        if (board[row][col] !== null) {
          occupied.push([row, col]);
        }
      }
    }

    if (occupied.length === 0) {
      const center = Math.floor(boardSize / 2);
      return [[center, center]];
    }

    const radius = 2;
    const nearbyMoves = new Set();
    for (const [row, col] of occupied) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < boardSize && c >= 0 && c < boardSize && board[r][c] === null) {
            nearbyMoves.add(`${r},${c}`);
          }
        }
      }
    }

    nearbyMoves.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      moves.push([r, c]);
    });

    return moves;
  }
}

// AI Logic - Minimax with Alpha-Beta Pruning + MCTS for Extreme
class GomokuAI {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    this.maxDepth = this.getDepthByDifficulty(difficulty);
  }

  getDepthByDifficulty(difficulty) {
    switch (difficulty) {
      case 'easy': return 1;      // 🤪 Bugyuta - 1 lépés előre
      case 'medium': return 2;    // 😊 Közepes - 2 lépés előre
      case 'hard': return 3;      // 😎 Nehéz - 3 lépés előre
      case 'very-hard': return 4; // 🔥 Nagyon nehéz - 4 lépés előre
      case 'extreme': return 5;   // 💀 Extrém - Uses MCTS!
      default: return 2;
    }
  }

  // Evaluate board position
  evaluateBoard(board, boardSize, aiSymbol, playerSymbol) {
    let score = 0;

    // Check all lines (horizontal, vertical, diagonals)
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        for (const [dx, dy] of directions) {
          const lineScore = this.evaluateLine(board, boardSize, row, col, dx, dy, aiSymbol, playerSymbol);
          score += lineScore;
        }
      }
    }

    return score;
  }

  // Evaluate a single line
  evaluateLine(board, boardSize, row, col, dx, dy, aiSymbol, playerSymbol) {
    let aiCount = 0;
    let playerCount = 0;
    let empty = 0;

    for (let i = 0; i < 5; i++) {
      const r = row + i * dx;
      const c = col + i * dy;

      if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) return 0;

      const cell = board[r][c];
      if (cell === aiSymbol) aiCount++;
      else if (cell === playerSymbol) playerCount++;
      else empty++;
    }

    // Can't make 5 in a row here
    if (aiCount > 0 && playerCount > 0) return 0;

    // Score based on pattern (IMPROVED SCORING)
    if (aiCount === 5) return 100000;  // Win
    if (playerCount === 5) return -100000;  // Loss
    if (aiCount === 4 && empty === 1) return 50000;  // 4 in a row (almost win) - INCREASED
    if (playerCount === 4 && empty === 1) return -40000;  // Block opponent's 4 - MUST BLOCK!
    if (aiCount === 3 && empty === 2) return 5000;  // 3 in a row - INCREASED
    if (playerCount === 3 && empty === 2) return -4500;  // Block opponent's 3 - HIGHER PRIORITY
    if (aiCount === 2 && empty === 3) return 500;  // 2 in a row - INCREASED
    if (playerCount === 2 && empty === 3) return -450;  // Block opponent's 2

    return 0;
  }

  // SMART MOVE ORDERING - prioritize threatening moves
  orderMovesByPriority(moves, board, boardSize, aiSymbol, playerSymbol) {
    const scored = moves.map(([row, col]) => {
      let score = 0;

      // Try the move and evaluate
      board[row][col] = aiSymbol;
      const aiEval = this.evaluatePosition(board, boardSize, row, col, aiSymbol);
      board[row][col] = playerSymbol;
      const playerEval = this.evaluatePosition(board, boardSize, row, col, playerSymbol);
      board[row][col] = null;

      // Prioritize: blocking > attacking
      score = playerEval * 1.2 + aiEval;

      return { move: [row, col], score };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.move);
  }

  // Evaluate a single position quickly
  evaluatePosition(board, boardSize, row, col, symbol) {
    let score = 0;
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

    for (const [dx, dy] of directions) {
      let count = 1;
      let empty = 0;

      // Check forward
      for (let i = 1; i < 5; i++) {
        const r = row + i * dx;
        const c = col + i * dy;
        if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) break;
        if (board[r][c] === symbol) count++;
        else if (board[r][c] === null) empty++;
        else break;
      }

      // Check backward
      for (let i = 1; i < 5; i++) {
        const r = row - i * dx;
        const c = col - i * dy;
        if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) break;
        if (board[r][c] === symbol) count++;
        else if (board[r][c] === null) empty++;
        else break;
      }

      // Score based on count
      if (count >= 4) score += 10000;  // Winning/blocking move!
      else if (count === 3) score += 1000;
      else if (count === 2) score += 100;
    }

    return score;
  }

  // Get all possible moves (with smart filtering)
  getPossibleMoves(board, boardSize, aiSymbol, playerSymbol, useOrdering = true) {
    const moves = [];
    const occupied = [];

    // Find all occupied cells
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        if (board[row][col] !== null) {
          occupied.push([row, col]);
        }
      }
    }

    // If board is empty, start in center
    if (occupied.length === 0) {
      const center = Math.floor(boardSize / 2);
      return [[center, center]];
    }

    // Get cells near occupied ones - OPTIMIZED for speed
    const radius = 1;  // Only check immediate neighbors
    const nearbyMoves = new Set();
    for (const [row, col] of occupied) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < boardSize && c >= 0 && c < boardSize && board[r][c] === null) {
            nearbyMoves.add(`${r},${c}`);
          }
        }
      }
    }

    nearbyMoves.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      moves.push([r, c]);
    });

    // Limit number of moves
    const maxMoves = 12;  // Reduced further for speed
    if (moves.length > maxMoves) {
      // Use move ordering for better pruning
      if (useOrdering) {
        const ordered = this.orderMovesByPriority(moves, board, boardSize, aiSymbol, playerSymbol);
        return ordered.slice(0, maxMoves);
      } else {
        return moves.slice(0, maxMoves);
      }
    }

    return useOrdering && moves.length > 0 ?
      this.orderMovesByPriority(moves, board, boardSize, aiSymbol, playerSymbol) : moves;
  }

  getAllEmptyCells(board, boardSize) {
    const moves = [];
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        if (board[row][col] === null) {
          moves.push([row, col]);
        }
      }
    }
    return moves;
  }

  // Minimax with Alpha-Beta Pruning + Move Ordering
  minimax(board, boardSize, depth, alpha, beta, isMaximizing, aiSymbol, playerSymbol) {
    // Check terminal states
    const winner = this.checkWinner(board, boardSize);
    if (winner === aiSymbol) return 100000;
    if (winner === playerSymbol) return -100000;
    if (depth === 0) {
      return this.evaluateBoard(board, boardSize, aiSymbol, playerSymbol);
    }

    // USE MOVE ORDERING for better alpha-beta pruning!
    const moves = this.getPossibleMoves(board, boardSize, aiSymbol, playerSymbol, true);
    if (moves.length === 0) return 0;  // Draw

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const [row, col] of moves) {
        board[row][col] = aiSymbol;
        const evaluation = this.minimax(board, boardSize, depth - 1, alpha, beta, false, aiSymbol, playerSymbol);
        board[row][col] = null;
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;  // Beta cutoff
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const [row, col] of moves) {
        board[row][col] = playerSymbol;
        const evaluation = this.minimax(board, boardSize, depth - 1, alpha, beta, true, aiSymbol, playerSymbol);
        board[row][col] = null;
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;  // Alpha cutoff
      }
      return minEval;
    }
  }

  // Check if there's a winner
  checkWinner(board, boardSize) {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        const symbol = board[row][col];
        if (symbol === null) continue;

        for (const [dx, dy] of directions) {
          let count = 1;
          for (let i = 1; i < 5; i++) {
            const r = row + i * dx;
            const c = col + i * dy;
            if (r < 0 || r >= boardSize || c < 0 || c >= boardSize || board[r][c] !== symbol) break;
            count++;
          }
          if (count >= 5) return symbol;
        }
      }
    }
    return null;
  }

  // Evaluate immediate value of a move (for move ordering)
  evaluateMove(board, boardSize, row, col, symbol) {
    board[row][col] = symbol;
    const score = this.evaluateBoard(board, boardSize, symbol, symbol === 'X' ? 'O' : 'X');
    board[row][col] = null;
    return score;
  }

  // Get best move
  getBestMove(board, boardSize, aiSymbol, playerSymbol) {
    const moves = this.getPossibleMoves(board, boardSize);
    if (moves.length === 0) return null;

    // For easy mode, add some randomness
    if (this.difficulty === 'easy' && Math.random() < 0.4) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // Use MCTS for extreme difficulty
    if (this.difficulty === 'extreme') {
      return this.getBestMoveMCTS(board, boardSize, aiSymbol, playerSymbol, 2000); // 2 second limit
    }

    // Use minimax for other difficulties
    let bestMove = moves[0];
    let bestValue = -Infinity;

    // Sort moves by immediate value for better alpha-beta pruning
    const scoredMoves = moves.map(move => ({
      move,
      score: this.evaluateMove(board, boardSize, move[0], move[1], aiSymbol)
    }));
    scoredMoves.sort((a, b) => b.score - a.score);

    for (const { move } of scoredMoves) {
      const [row, col] = move;
      board[row][col] = aiSymbol;
      const moveValue = this.minimax(board, boardSize, this.maxDepth, -Infinity, Infinity, false, aiSymbol, playerSymbol);
      board[row][col] = null;

      if (moveValue > bestValue) {
        bestValue = moveValue;
        bestMove = [row, col];
      }
    }

    return bestMove;
  }

  // Monte Carlo Tree Search - for extreme difficulty
  getBestMoveMCTS(board, boardSize, aiSymbol, playerSymbol, timeLimit = 2000) {
    const rootBoard = board.map(row => [...row]);
    const root = new MCTSNode(rootBoard, boardSize, null, null, playerSymbol); // last move was by player

    const startTime = Date.now();
    let iterations = 0;

    // Run MCTS iterations within time limit
    while (Date.now() - startTime < timeLimit) {
      iterations++;

      // 1. SELECTION - Traverse tree using UCB1
      let node = root;
      let currentBoard = board.map(row => [...row]);
      let currentSymbol = aiSymbol; // AI moves first from root

      while (node.getUntriedMoves(currentBoard, boardSize).length === 0 && node.children.length > 0) {
        node = node.selectChild();
        if (node.move) {
          currentBoard[node.move[0]][node.move[1]] = node.playerSymbol;
          currentSymbol = node.playerSymbol === 'X' ? 'O' : 'X';
        }
      }

      // 2. EXPANSION - Add new child node
      const untriedMoves = node.getUntriedMoves(currentBoard, boardSize);
      if (untriedMoves.length > 0 && !this.checkWinner(currentBoard, boardSize)) {
        const move = untriedMoves[Math.floor(Math.random() * untriedMoves.length)];
        node = node.addChild(move, currentBoard, boardSize, currentSymbol);
        currentBoard[move[0]][move[1]] = currentSymbol;
        currentSymbol = currentSymbol === 'X' ? 'O' : 'X';
      }

      // 3. SIMULATION - Random playout
      let simBoard = currentBoard.map(row => [...row]);
      let simSymbol = currentSymbol;
      let winner = this.checkWinner(simBoard, boardSize);
      let maxSimMoves = 50; // Limit simulation depth
      let simMoves = 0;

      while (!winner && simMoves < maxSimMoves) {
        const moves = this.getSimulationMoves(simBoard, boardSize);
        if (moves.length === 0) break;

        const move = moves[Math.floor(Math.random() * moves.length)];
        simBoard[move[0]][move[1]] = simSymbol;
        winner = this.checkWinner(simBoard, boardSize);
        simSymbol = simSymbol === 'X' ? 'O' : 'X';
        simMoves++;
      }

      // 4. BACKPROPAGATION - Update statistics
      let result = 0;
      if (winner === aiSymbol) result = 1;
      else if (winner === playerSymbol) result = -1;

      while (node !== null) {
        node.visits++;
        // Update wins from perspective of node's player
        if (node.playerSymbol === aiSymbol) {
          node.wins += result;
        } else {
          node.wins -= result;
        }
        node = node.parent;
      }
    }

    console.log(`🎲 MCTS: ${iterations} iterations in ${Date.now() - startTime}ms`);

    // Select best move based on visit count (most visited = most promising)
    if (root.children.length === 0) return null;

    const bestChild = root.children.reduce((best, child) =>
      child.visits > best.visits ? child : best
    );

    const winRate = (bestChild.wins / bestChild.visits * 100).toFixed(1);
    console.log(`🎯 Best move: [${bestChild.move}] - ${bestChild.visits} visits, ${winRate}% win rate`);

    return bestChild.move;
  }

  // Simplified move generation for MCTS simulations
  getSimulationMoves(board, boardSize) {
    const moves = [];
    const occupied = [];

    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        if (board[row][col] !== null) {
          occupied.push([row, col]);
        }
      }
    }

    if (occupied.length === 0) {
      const center = Math.floor(boardSize / 2);
      return [[center, center]];
    }

    const radius = 1; // Only immediate neighbors for fast simulation
    const nearbyMoves = new Set();
    for (const [row, col] of occupied) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < boardSize && c >= 0 && c < boardSize && board[r][c] === null) {
            nearbyMoves.add(`${r},${c}`);
          }
        }
      }
    }

    nearbyMoves.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      moves.push([r, c]);
    });

    // Limit moves for fast simulation
    return moves.length > 20 ? moves.slice(0, 20) : moves;
  }
}

class GameRoom {
  constructor(roomId, boardSize = 15, creatorId = null, creatorName = null, gameMode = 'pvp', io = null) {
    this.roomId = roomId;
    this.boardSize = boardSize;
    this.creatorId = creatorId;
    this.creatorName = creatorName;
    this.gameMode = gameMode;  // 'pvp', 'ai-easy', 'ai-medium', 'ai-hard'
    this.io = io; // Store io instance for timer callbacks
    this.players = [];
    this.spectators = []; // {id, name}
    this.status = 'waiting'; // 'waiting' or 'in_progress'
    this.board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
    this.currentPlayer = 0; // 0 or 1
    this.gameOver = false;
    this.winner = null;
    this.winningPieces = null;
    this.lastMove = null; // {row, col} - track last move
    this.moveHistory = []; // [{row, col, symbol, player}, ...]
    this.timer = null;
    this.timerEndTime = null;

    // AI setup
    if (gameMode.startsWith('ai-')) {
      if (gameMode === 'ai-vs-ai') {
        // AI vs AI mode: create two AI players immediately
        this.isAIVsAI = true;
        this.isAIGame = false;
        this.ai = new GomokuAI('easy'); // Use easy AI for speed in AI vs AI
        this.status = 'in_progress'; // Start immediately

        // Add two AI players
        this.players.push({
          id: 'AI1',
          name: `${generateFunnyAIName('easy')} #1`,
          symbol: 'X',
          isAI: true
        });
        this.players.push({
          id: 'AI2',
          name: `${generateFunnyAIName('easy')} #2`,
          symbol: 'O',
          isAI: true
        });
      } else {
        const difficulty = gameMode.replace('ai-', '');
        this.ai = new GomokuAI(difficulty);
        this.isAIGame = true;
        this.isAIVsAI = false;
      }
    } else {
      this.ai = null;
      this.isAIGame = false;
      this.isAIVsAI = false;
    }
  }

  addPlayer(playerId, playerName) {
    // Don't allow players to join AI vs AI games
    if (this.isAIVsAI) {
      return false;
    }

    if (this.players.length < 2) {
      this.players.push({ id: playerId, name: playerName, symbol: this.players.length === 0 ? 'X' : 'O', isAI: false });

      // If this is an AI game and we just added the first player, add AI as second player
      if (this.isAIGame && this.players.length === 1) {
        const aiDifficulty = this.gameMode.replace('ai-', '');
        const aiName = generateFunnyAIName(aiDifficulty);
        this.players.push({ id: 'AI', name: aiName, symbol: 'O', isAI: true });
      }

      // Update status to in_progress when 2 players are in the room
      if (this.players.length === 2) {
        this.status = 'in_progress';
        // Start timer when game starts
        this.startTimer(() => this.handleTimerExpiry());
      }

      return true;
    }
    return false;
  }

  addSpectator(spectatorId, spectatorName) {
    // Only allow spectators if game is in progress
    if (this.status === 'in_progress') {
      this.spectators.push({ id: spectatorId, name: spectatorName });
      return true;
    }
    return false;
  }

  removeSpectator(spectatorId) {
    this.spectators = this.spectators.filter(s => s.id !== spectatorId);
  }

  // Make AI move
  makeAIMove() {
    if (!this.isAIGame || this.gameOver || this.players.length < 2) return null;

    const aiPlayer = this.players.find(p => p.isAI);
    if (!aiPlayer) return null;

    const aiPlayerIndex = this.players.indexOf(aiPlayer);
    if (aiPlayerIndex !== this.currentPlayer) return null;

    const aiSymbol = aiPlayer.symbol;
    const playerSymbol = this.players.find(p => !p.isAI).symbol;

    // FIX #1: Add null check for AI move
    const move = this.ai.getBestMove(this.board, this.boardSize, aiSymbol, playerSymbol);
    if (!move || !Array.isArray(move) || move.length !== 2) {
      console.error('AI failed to generate valid move');
      return null;
    }
    const [row, col] = move;

    // Use the AI player's ID
    return this.makeMove('AI', row, col);
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
  }

  makeMove(playerId, row, col) {
    if (this.gameOver) return { success: false, error: 'Game is over' };
    if (this.players.length < 2) return { success: false, error: 'Waiting for opponent' };
    if (this.players[this.currentPlayer].id !== playerId) return { success: false, error: 'Not your turn' };
    if (row < 0 || row >= this.boardSize || col < 0 || col >= this.boardSize) return { success: false, error: 'Invalid position' };
    if (this.board[row][col] !== null) return { success: false, error: 'Cell already occupied' };

    const symbol = this.players[this.currentPlayer].symbol;
    this.board[row][col] = symbol;
    this.lastMove = { row, col };
    this.moveHistory.push({
      row,
      col,
      symbol,
      player: this.currentPlayer
    });

    // Clear any existing timer
    this.clearTimer();

    // Check for win
    const winningPieces = this.checkWin(row, col, symbol);
    if (winningPieces) {
      this.gameOver = true;
      this.winner = this.players[this.currentPlayer];
      this.winningPieces = winningPieces;
      return { success: true, gameOver: true, winner: this.winner, winningPieces: winningPieces };
    }

    // Check for draw
    if (this.isBoardFull()) {
      this.gameOver = true;
      return { success: true, gameOver: true, draw: true };
    }

    // Switch player
    this.currentPlayer = 1 - this.currentPlayer;

    // Restart timer for next player
    this.startTimer(() => this.handleTimerExpiry());

    return { success: true, gameOver: false };
  }

  checkWin(row, col, symbol) {
    const directions = [
      [0, 1],   // horizontal
      [1, 0],   // vertical
      [1, 1],   // diagonal \
      [1, -1]   // diagonal /
    ];

    for (const [dx, dy] of directions) {
      let count = 1;
      const winningPieces = [[row, col]]; // Start with the current piece

      // Check positive direction
      for (let i = 1; i < 5; i++) {
        const newRow = row + dx * i;
        const newCol = col + dy * i;
        if (newRow >= 0 && newRow < this.boardSize && newCol >= 0 && newCol < this.boardSize && this.board[newRow][newCol] === symbol) {
          count++;
          winningPieces.push([newRow, newCol]);
        } else {
          break;
        }
      }

      // Check negative direction
      for (let i = 1; i < 5; i++) {
        const newRow = row - dx * i;
        const newCol = col - dy * i;
        if (newRow >= 0 && newRow < this.boardSize && newCol >= 0 && newCol < this.boardSize && this.board[newRow][newCol] === symbol) {
          count++;
          winningPieces.push([newRow, newCol]);
        } else {
          break;
        }
      }

      if (count >= 5) {
        // Return only the first 5 pieces (in case there are more than 5 in a row)
        return winningPieces.slice(0, 5);
      }
    }

    return null;
  }

  isBoardFull() {
    for (let i = 0; i < this.boardSize; i++) {
      for (let j = 0; j < this.boardSize; j++) {
        if (this.board[i][j] === null) return false;
      }
    }
    return true;
  }

  undoMove() {
    if (this.moveHistory.length === 0) {
      return { success: false, error: 'No moves to undo' };
    }

    if (this.gameOver) {
      return { success: false, error: 'Cannot undo after game is over' };
    }

    // Get the last move
    const lastMove = this.moveHistory.pop();

    // Remove from board
    this.board[lastMove.row][lastMove.col] = null;

    // Switch back to previous player
    this.currentPlayer = lastMove.player;

    // Clear timer
    this.clearTimer();

    return { success: true };
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.timerEndTime = null;
    }
  }

  startTimer(callback) {
    this.clearTimer();

    console.log(`🔍 startTimer called: io=${!!this.io}, enabled=${globalTimerSettings.enabled}, players=${this.players.length}, gameOver=${this.gameOver}`);

    if (!this.io) {
      console.log('❌ CRITICAL: this.io is NULL or undefined! Timer cannot start!');
      return;
    }

    if (globalTimerSettings.enabled && this.players.length === 2 && !this.gameOver) {
      this.timerEndTime = Date.now() + (globalTimerSettings.duration * 1000);

      console.log(`⏱️ Timer started for ${globalTimerSettings.duration}s in room ${this.roomId}, current player: ${this.currentPlayer}`);

      this.timer = setTimeout(() => {
        console.log(`⏰ Timer expired in room ${this.roomId}! Current player before: ${this.currentPlayer}`);
        // Time's up! Call the callback to handle turn skip
        // DON'T switch player here - let handleTimerExpiry do it
        if (callback) {
          callback();
        } else {
          console.log('❌ No callback provided to timer!');
        }
      }, globalTimerSettings.duration * 1000);
    } else {
      console.log(`⏱️ Timer NOT started: enabled=${globalTimerSettings.enabled}, players=${this.players.length}, gameOver=${this.gameOver}`);
    }
  }

  handleTimerExpiry() {
    console.log(`🔔 handleTimerExpiry called! Room: ${this.roomId}, gameOver: ${this.gameOver}, currentPlayer before: ${this.currentPlayer}`);

    if (this.gameOver) {
      console.log('⏹️ Game is over, not switching player');
      return;
    }

    // Switch to next player (skip turn)
    const oldPlayer = this.currentPlayer;
    this.currentPlayer = (this.currentPlayer + 1) % 2;
    console.log(`🔄 Player switched from ${oldPlayer} to ${this.currentPlayer}`);

    // Broadcast update with new current player
    this.io.to(this.roomId).emit('gameState', this.getState());
    this.io.to(this.roomId).emit('message', '⏰ Lejárt az idő! Kör átugrva.');
    console.log(`📤 Broadcasted gameState and message to room ${this.roomId}`);

    // Restart timer for the next player
    this.startTimer(() => this.handleTimerExpiry());

    // IMPORTANT: If it's an AI game and now it's AI's turn, trigger AI move
    if (this.isAIGame && !this.gameOver) {
      const currentPlayerObj = this.players[this.currentPlayer];
      if (currentPlayerObj && currentPlayerObj.isAI) {
        console.log(`🤖 AI's turn after timer expiry, triggering AI move...`);
        setTimeout(() => {
          const aiResult = this.makeAIMove();
          if (aiResult && aiResult.success) {
            this.io.to(this.roomId).emit('gameState', this.getState());
            console.log(`🤖 AI move completed after timer expiry`);

            if (aiResult.gameOver) {
              this.io.to(this.roomId).emit('message', `${aiResult.winner ? aiResult.winner.name + ' wins!' : "It's a draw!"}`);
            }
          }
        }, 500);
      }
    }
  }

  getTimerRemaining() {
    if (!this.timerEndTime) return null;
    const remaining = Math.max(0, Math.ceil((this.timerEndTime - Date.now()) / 1000));
    return remaining;
  }

  reset() {
    this.board = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
    this.currentPlayer = 0;
    this.gameOver = false;
    this.winner = null;
    this.winningPieces = null;
    this.lastMove = null;
    this.moveHistory = [];
    this.clearTimer();
  }

  getState() {
    return {
      board: this.board,
      boardSize: this.boardSize,
      players: this.players,
      spectators: this.spectators,
      status: this.status,
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver,
      winner: this.winner,
      winningPieces: this.winningPieces,
      lastMove: this.lastMove,
      canUndo: this.moveHistory.length > 0 && !this.gameOver,
      timerEnabled: globalTimerSettings.enabled,
      timerDuration: globalTimerSettings.duration,
      timerRemaining: this.getTimerRemaining(),
      undoEnabled: globalUndoEnabled, // Send global setting to client
      gameMode: this.gameMode // Send game mode (pvp, ai-easy, ai-medium, ai-hard, ai-vs-ai)
    };
  }
}

// Helper function to get rooms list
function getRoomsList() {
  const roomsList = [];
  rooms.forEach((room, roomId) => {
    roomsList.push({
      roomId: roomId,
      playerCount: room.players.length,
      spectatorCount: room.spectators.length,
      boardSize: room.boardSize,
      players: room.players.map(p => p.name),
      creatorName: room.creatorName,
      creatorId: room.creatorId, // Add creator ID for delete button permission
      status: room.status, // 'waiting' or 'in_progress'
      isWaiting: room.status === 'waiting',
      isFull: room.players.length === 2,
      gameStarted: room.status === 'in_progress'
    });
  });
  return roomsList;
}

// Broadcast rooms list to all connected clients
function broadcastRoomsList() {
  io.emit('roomsList', getRoomsList());
}

// Get online players list
function getOnlinePlayersList() {
  const players = [];
  connectedClients.forEach((client, socketId) => {
    players.push({
      socketId: socketId,
      name: client.name,
      isAdmin: client.isAdmin,
      connectedAt: client.connectedAt,
      room: client.room || null
    });
  });
  return players;
}

// Broadcast online players list to admins
function broadcastOnlinePlayers() {
  const playersList = getOnlinePlayersList();
  connectedClients.forEach((client, socketId) => {
    if (client.isAdmin) {
      io.to(socketId).emit('onlinePlayers', playersList);
    }
  });
}

// Broadcast online players list to all users (for lobby)
function broadcastLobbyPlayers() {
  const playersList = [];
  connectedClients.forEach((client, socketId) => {
    if (!client.isAdmin) {
      playersList.push({
        socketId: socketId,
        name: client.name,
        room: client.room || null
      });
    }
  });
  io.emit('lobbyPlayers', playersList);
}

// Broadcast game statistics to all admins
function broadcastStatsToAdmins() {
  // Add global settings to stats
  const statsToSend = { ...gameStats, undoEnabled: globalUndoEnabled };

  connectedClients.forEach((client, sid) => {
    if (client.isAdmin) {
      io.to(sid).emit('gameStats', statsToSend);
    }
  });
}

// Start AI vs AI automatic game
function startAIvsAIGame(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.isAIVsAI) return;

  console.log(`Starting AI vs AI game in room ${roomId}`);

  // Broadcast initial game state
  io.to(roomId).emit('gameState', room.getState());
  io.to(roomId).emit('message', '🤖 AI vs AI játék kezdődik!');

  // Function to make next AI move
  function makeNextAIMove() {
    if (room.gameOver) {
      console.log(`AI vs AI game in room ${roomId} finished`);
      return;
    }

    const currentPlayer = room.players[room.currentPlayer];
    const otherPlayer = room.players[1 - room.currentPlayer];

    // Make AI move
    const [row, col] = room.ai.getBestMove(
      room.board,
      room.boardSize,
      currentPlayer.symbol,
      otherPlayer.symbol
    );

    const result = room.makeMove(currentPlayer.id, row, col);

    if (result.success) {
      // Broadcast updated state
      io.to(roomId).emit('gameState', room.getState());

      if (result.gameOver) {
        // Track statistics - AI vs AI game ended
        gameStats.activeGames = Math.max(0, gameStats.activeGames - 1);
        gameStats.totalGamesCompleted++;

        if (result.draw) {
          gameStats.draws++;
          io.to(roomId).emit('message', '🤝 Döntetlen!');
          // Announce AI vs AI draw to lobby
          announceGameResult(currentPlayer.name, otherPlayer.name, true);
        } else {
          gameStats.aiWins++; // Both players are AI
          io.to(roomId).emit('message', `🏆 ${result.winner.name} nyert!`);
          // Announce AI vs AI winner to lobby
          const loser = room.players.find(p => p.id !== result.winner.id);
          announceGameResult(result.winner.name, loser?.name || 'AI Ellenfél');
        }

        // Save stats to file
        saveStats().catch(err => console.error('Failed to save stats:', err));

        // Broadcast updated stats to admins
        broadcastStatsToAdmins();
      } else {
        // Schedule next move
        setTimeout(makeNextAIMove, 800); // 800ms delay between moves
      }
    }
  }

  // Start the first move after a short delay
  setTimeout(makeNextAIMove, 1000);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send current rooms list and online players to newly connected client
  socket.emit('roomsList', getRoomsList());
  socket.emit('lobbyPlayers', (function () {
    const playersList = [];
    connectedClients.forEach((client, socketId) => {
      if (!client.isAdmin) {
        playersList.push({
          socketId: socketId,
          name: client.name,
          room: client.room || null
        });
      }
    });
    return playersList;
  })());

  // Player login (just registers the player)
  socket.on('login', async ({ playerName, password }) => {
    // Sanitize and validate username (max 50 chars for usernames)
    const name = sanitizeInput(playerName, 50);

    if (!name) {
      socket.emit('error', 'Kérlek adj meg egy érvényes nevet!');
      return;
    }

    // Check if name is already taken by another active connection
    let nameTaken = false;
    connectedClients.forEach((client, socketId) => {
      if (client.name === name && socketId !== socket.id) {
        nameTaken = true;
      }
    });

    if (nameTaken) {
      socket.emit('error', `A "${name}" név már foglalt! Kérlek válassz másik nevet.`);
      return;
    }

    // AUTHENTICATION LOGIC
    let user = UserManager.getUser(name);
    let isAdmin = false;

    if (user) {
      // User exists
      if (user.password) {
        // Password required - use bcrypt verification
        if (!password) {
          socket.emit('loginFailed', { error: 'Ehhez a névhez jelszó szükséges!' });
          return;
        }
        const passwordValid = await UserManager.verifyPassword(name, password);
        if (!passwordValid) {
          socket.emit('loginFailed', { error: 'Helytelen jelszó! Ehhez a névhez jelszó tartozik.' });
          return;
        }
      } else {
        // No password set yet
        if (password) {
          // Set password on first login with password
          await UserManager.setPassword(name, password);
          console.log(`🔐 Password set for user: ${name}`);
        }
      }
      isAdmin = user.isAdmin || false;
    } else {
      // New user
      await UserManager.createUser(name, password);
      console.log(`👤 New user created: ${name}`);
    }

    // Add to connected clients
    connectedClients.set(socket.id, {
      name: name,
      isAdmin: isAdmin,
      connectedAt: new Date(),
      createdRoom: null,
      room: null
    });

    // Add to logged in players
    loggedInPlayers.set(socket.id, {
      name: name,
      loggedInAt: new Date()
    });

    const userRank = user ? (user.rank || (isAdmin ? 'Admin' : 'Újonc')) : 'Vendég';

    // Ensure user has stats initialized
    if (user) {
      await UserManager.ensureUserStats(name);
    }

    socket.emit('loginSuccess', { playerName: name, isAdmin, rank: userRank });
    console.log('Player logged in:', name, socket.id, isAdmin ? '(ADMIN)' : '', `[${userRank}]`);

    // Send lobby chat history to the newly logged-in player
    setTimeout(() => {
      lobbyChatHistory.forEach(msg => {
        socket.emit('lobbyChatMessage', msg);
      });
    }, 100);

    // Announce login to lobby (with slight delay to ensure client is ready)
    setTimeout(() => {
      const loginMessages = [
        `👋 ${name} belépett a lobbiba! Üdv! 🎮`,
        `🎉 ${name} csatlakozott! Hajrá! 💪`,
        `✨ ${name} érkezett! Sok sikert! 🍀`,
        `🚀 ${name} itt van! Rajta! ⚡`
      ];
      announceLobbyEvent(loginMessages[Math.floor(Math.random() * loginMessages.length)]);
    }, 200);

    // Broadcast updated players list to admins and lobby
    broadcastOnlinePlayers();
    broadcastLobbyPlayers();
  });

  // Create room (without joining) - auto-generates room ID
  socket.on('createRoom', ({ boardSize, gameMode }) => {
    console.log(`📝 createRoom request received: size=${boardSize} (${typeof boardSize}), mode=${gameMode}`); // DEBUG

    const client = connectedClients.get(socket.id);

    if (!client) {
      socket.emit('error', 'Kérlek először jelentkezz be!');
      return;
    }

    // Check if player already created a room
    if (client.createdRoom) {
      socket.emit('error', 'Már hoztál létre egy szobát! Csak egy szobát hozhatsz létre egyszerre.');
      return;
    }

    // Check if AI vs AI mode is allowed (admin must enable it)
    if (gameMode === 'ai-vs-ai' && !globalAISettings.aiVsAiEnabled) {
      socket.emit('error', 'AI vs AI mód jelenleg nem elérhető. Az admin engedélyezheti az admin panelben.');
      return;
    }

    // Auto-generate unique room ID
    const roomId = generateRoomId();

    // Validate and parse board size
    let size = parseInt(boardSize);
    const allowedSizes = [9, 13, 15, 19];
    if (isNaN(size) || !allowedSizes.includes(size)) {
      console.warn(`⚠️ Invalid board size received: ${boardSize}. Defaulting to 15.`);
      size = 15;
    }

    const mode = gameMode || 'pvp';
    const newRoom = new GameRoom(roomId, size, socket.id, client.name, mode, io);
    rooms.set(roomId, newRoom);

    // Track statistics
    gameStats.totalGames++;
    gameStats.boardSizes[size] = (gameStats.boardSizes[size] || 0) + 1;
    gameStats.gameModes[mode] = (gameStats.gameModes[mode] || 0) + 1;
    saveStats(); // Save stats after room creation

    // Track that this player created this room
    client.createdRoom = roomId;

    socket.emit('roomCreated', { roomId, boardSize: size, gameMode: mode });
    console.log(`Room ${roomId} created by ${client.name} (mode: ${mode})`);

    // Announce room creation to lobby
    const gameModeText = mode === 'pvp' ? 'PvP' : mode === 'ai-vs-ai' ? 'AI vs AI' : `AI ${mode.split('-')[1]}`;
    const roomMessages = [
      `🎮 ${client.name} létrehozott egy ${size}x${size} szobát (${gameModeText})! 🆕`,
      `🏗️ ${client.name} új szobát nyitott: ${size}x${size} (${gameModeText})! ✨`,
      `🎯 ${client.name} szobát készített: ${size}x${size} (${gameModeText})! 🚀`
    ];
    announceLobbyEvent(roomMessages[Math.floor(Math.random() * roomMessages.length)]);

    // FIX #4: Save stats consistently with error handling
    saveStats().catch(err => console.error('Failed to save stats:', err));
    broadcastRoomsList();

    // If AI vs AI mode, start the automatic game
    if (mode === 'ai-vs-ai') {
      startAIvsAIGame(roomId);
    }
  });

  // Admin login
  socket.on('adminLogin', ({ adminCode }) => {
    if (adminCode === ADMIN_CODE) {
      const client = connectedClients.get(socket.id);
      if (client) {
        client.isAdmin = true;
        client.name = 'Admin';
        socket.emit('adminLoginSuccess', { isAdmin: true });
        socket.emit('onlinePlayers', getOnlinePlayersList());
        socket.emit('timerSettings', globalTimerSettings);
        socket.emit('aiSettings', globalAISettings);
        socket.emit('gameStats', gameStats);
        console.log('Admin logged in:', socket.id);
      }
    } else {
      socket.emit('adminLoginFailed', { error: 'Invalid admin code' });
    }
  });

  socket.on('joinRoom', ({ roomId }) => {
    const client = connectedClients.get(socket.id);

    if (!client) {
      socket.emit('error', 'Kérlek először jelentkezz be!');
      return;
    }

    if (!rooms.has(roomId)) {
      socket.emit('error', 'Ez a szoba nem létezik!');
      return;
    }

    const room = rooms.get(roomId);
    const joined = room.addPlayer(socket.id, client.name);

    if (joined) {
      socket.join(roomId);
      socket.roomId = roomId;

      // Cancel pending room deletion (player reconnected!)
      if (pendingRoomDeletions.has(roomId)) {
        console.log(`✅ Player reconnected to room ${roomId}. Cancelling deletion.`);
        clearTimeout(pendingRoomDeletions.get(roomId));
        pendingRoomDeletions.delete(roomId);
      }

      // Update connected client info
      client.room = roomId;

      // Clear createdRoom flag since player actually joined
      if (client.createdRoom === roomId) {
        client.createdRoom = null;
      }

      // Send roomJoined event with board size info to the joining player
      socket.emit('roomJoined', {
        roomId: roomId,
        boardSize: room.boardSize,
        players: room.players.map(p => ({ id: p.id, name: p.name, symbol: p.symbol })),
        gameMode: room.gameMode
      });

      io.to(roomId).emit('gameState', room.getState());
      io.to(roomId).emit('message', `${client.name} csatlakozott a játékhoz`);

      // Send chat system message
      io.to(roomId).emit('chatMessage', {
        senderId: 'system',
        senderName: 'Rendszer',
        message: `${client.name} csatlakozott a szobához`,
        timestamp: Date.now()
      });

      if (room.players.length === 2) {
        io.to(roomId).emit('message', 'Játék elindult! X kezd.');

        // Track statistics - game started
        gameStats.activeGames++;
        const currentHour = new Date().getHours();
        gameStats.peakTimes[currentHour]++;
        // FIX #4: Save stats consistently
        saveStats().catch(err => console.error('Failed to save stats:', err));

        // Announce game start to lobby
        const player1 = room.players[0]?.name || 'Játékos 1';
        const player2 = room.players[1]?.name || 'Játékos 2';
        const gameStartMessages = [
          `⚔️ Játék indult! ${player1} vs ${player2}! Ki fog nyerni? 🎮`,
          `🔥 Harc kezdődött: ${player1} vs ${player2}! Hajrá! 💪`,
          `🎯 ${player1} és ${player2} csatáznak! Izgalmas lesz! ⚡`,
          `🏁 START! ${player1} vs ${player2}! Győzzön a jobb! 🏆`
        ];
        announceLobbyEvent(gameStartMessages[Math.floor(Math.random() * gameStartMessages.length)]);

        // Start timer for first player
        room.startTimer(() => {
          io.to(roomId).emit('message', 'Idő lejárt! Kör átugrva.');
          io.to(roomId).emit('gameState', room.getState());
        });
      }

      // Broadcast updated rooms list
      broadcastRoomsList();
      broadcastOnlinePlayers();
      broadcastLobbyPlayers();

      console.log(`${client.name} joined room ${roomId}`);
    } else {
      socket.emit('error', 'A szoba tele van!');
    }
  });

  // Watch a game as spectator
  socket.on('watchRoom', ({ roomId }) => {
    const client = connectedClients.get(socket.id);

    if (!client) {
      socket.emit('error', 'Kérlek először jelentkezz be!');
      return;
    }

    if (!rooms.has(roomId)) {
      socket.emit('error', 'Ez a szoba nem létezik!');
      return;
    }

    const room = rooms.get(roomId);

    // FIX #8: Check if already spectating this room
    if (socket.isSpectator && socket.roomId === roomId) {
      socket.emit('error', 'Már nézed ezt a szobát!');
      return;
    }

    // Prevent room creator from spectating their own room if not a player, UNLESS it's AI vs AI
    if (room.creatorId === socket.id && !room.players.find(p => p.id === socket.id) && room.gameMode !== 'ai-vs-ai') {
      socket.emit('error', 'Nem nézheted meg a saját szobádat nézőként! Csatlakozz játékosként.');
      return;
    }

    const added = room.addSpectator(socket.id, client.name);

    if (added) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.isSpectator = true;

      // Update connected client info
      client.room = roomId;

      // Send roomJoined event with board size info to spectator
      socket.emit('roomJoined', {
        roomId: roomId,
        boardSize: room.boardSize,
        players: room.players.map(p => ({ id: p.id, name: p.name, symbol: p.symbol })),
        gameMode: room.gameMode
      });

      socket.emit('spectatorJoined', { roomId });
      socket.emit('gameState', room.getState());
      io.to(roomId).emit('message', `${client.name} nézi a játékot`);

      // Send chat system message
      io.to(roomId).emit('chatMessage', {
        senderId: 'system',
        senderName: 'Rendszer',
        message: `👁️ ${client.name} nézi a játékot`,
        timestamp: Date.now()
      });

      // Broadcast updated rooms list
      broadcastRoomsList();

      console.log(`${client.name} watching room ${roomId}`);
    } else {
      socket.emit('error', 'Nem lehet nézni ezt a játékot! (Még nem kezdődött el)');
    }
  });

  // Leave spectator mode
  socket.on('leaveSpectator', () => {
    if (!socket.roomId || !socket.isSpectator) {
      return;
    }

    const room = rooms.get(socket.roomId);
    if (room) {
      // AI vs AI: Close room if creator leaves
      if (room.gameMode === 'ai-vs-ai' && room.creatorId === socket.id) {
        io.to(socket.roomId).emit('roomClosed', { message: 'A szoba létrehozója kilépett, szoba bezárva' });

        // Remove all spectators (including self)
        room.spectators.forEach(s => {
          const sSocket = io.sockets.sockets.get(s.id);
          if (sSocket) {
            sSocket.leave(socket.roomId);
            sSocket.roomId = null;
            sSocket.isSpectator = false;
            const sClient = connectedClients.get(s.id);
            if (sClient) sClient.room = null;
            sSocket.emit('leftSpectator');
          }
        });

        // Clear creator's room reference
        const client = connectedClients.get(socket.id);
        if (client) {
          client.createdRoom = null;
          client.room = null;
        }

        rooms.delete(socket.roomId);
        broadcastRoomsList();
        console.log(`AI vs AI room ${socket.roomId} closed by creator ${socket.id}`);
        return;
      }
      const client = connectedClients.get(socket.id);
      room.removeSpectator(socket.id);
      io.to(socket.roomId).emit('message', `${client?.name || 'Néző'} kilépett a nézői módból`);

      // Broadcast updated room state to remaining users
      io.to(socket.roomId).emit('gameState', room.getState());
    }

    socket.leave(socket.roomId);
    const client = connectedClients.get(socket.id);
    if (client) {
      client.room = null;
    }
    socket.roomId = null;
    socket.isSpectator = false;

    socket.emit('leftSpectator');

    // Broadcast updated rooms list
    broadcastRoomsList();
  });

  // Delete own waiting room
  socket.on('deleteRoom', ({ roomId }) => {
    const client = connectedClients.get(socket.id);
    if (!client) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'A szoba nem található');
      return;
    }

    // Check if the user is the creator or admin
    if (client.createdRoom !== roomId && !client.isAdmin) {
      socket.emit('error', 'Csak a saját várakozó szobádat törölheted!');
      return;
    }

    // Check if room is waiting (not started)
    // Allow deleting AI vs AI rooms even if in progress
    if ((room.players.length > 1 || room.status === 'in_progress') && room.gameMode !== 'ai-vs-ai') {
      socket.emit('error', 'Nem törölhetsz már elindult játékot!');
      return;
    }

    // Notify anyone in the room
    io.to(roomId).emit('roomClosed', { message: 'A létrehozó törölte a szobát' });

    // Clear players and spectators from the room
    room.players.forEach(p => {
      if (!p.isAI) {
        const playerSocket = io.sockets.sockets.get(p.id);
        if (playerSocket) {
          playerSocket.leave(roomId);
          playerSocket.roomId = null;
          const playerClient = connectedClients.get(p.id);
          if (playerClient) {
            playerClient.room = null;
          }
        }
      }
    });

    room.spectators.forEach(spectator => {
      const spectatorSocket = io.sockets.sockets.get(spectator.id);
      if (spectatorSocket) {
        spectatorSocket.leave(roomId);
        spectatorSocket.roomId = null;
        spectatorSocket.isSpectator = false;
        const spectatorClient = connectedClients.get(spectator.id);
        if (spectatorClient) {
          spectatorClient.room = null;
        }
      }
    });

    // Clear creator's room reference
    client.createdRoom = null;
    client.room = null;
    socket.leave(roomId);
    socket.roomId = null;

    // Delete the room
    rooms.delete(roomId);
    console.log(`Room deleted by creator: ${roomId}`);

    // Broadcast updated rooms list
    broadcastRoomsList();

    socket.emit('message', 'Várakozó szoba törölve');
  });

  // Leave room (player leaving game)
  socket.on('leaveRoom', () => {
    console.log('🚪 leaveRoom event received');
    console.log('  - socket.roomId:', socket.roomId);
    console.log('  - socket.isSpectator:', socket.isSpectator);

    if (!socket.roomId) {
      console.log('  ❌ No roomId, returning');
      return;
    }

    const room = rooms.get(socket.roomId);
    if (!room) {
      console.log('  ❌ Room not found, returning');
      socket.roomId = null;
      return;
    }

    const client = connectedClients.get(socket.id);
    const player = room.players.find(p => p.id === socket.id);
    const isAIvsAI = room.gameMode === 'ai-vs-ai';

    console.log('  - room.gameMode:', room.gameMode);
    console.log('  - isAIvsAI:', isAIvsAI);
    console.log('  - player:', player ? player.name : 'null');
    console.log('  - Will delete room?', !!(player || isAIvsAI));

    // Delete room if a player leaves OR if it's an AI vs AI game
    if (player || isAIvsAI) {
      console.log('  ✅ Deleting room:', socket.roomId);

      // IMPORTANT: Save roomId before modifying socket properties!
      const roomIdToDelete = socket.roomId;

      try {
        // If a player leaves or AI vs AI spectator leaves, delete the entire room and kick everyone
        console.log('  📤 Emitting roomClosed...');
        io.to(roomIdToDelete).emit('roomClosed', { message: 'Játékos kilépett, szoba bezárva' });
        console.log('  ✅ roomClosed emitted');

        // Clear all players and spectators
        console.log('  🧹 Clearing', room.players.length, 'players...');
        room.players.forEach((p, index) => {
          console.log('    - Processing player', index, ':', p.name, 'isAI:', p.isAI);
          if (p.id !== socket.id && !p.isAI) {
            const playerSocket = io.sockets.sockets.get(p.id);
            if (playerSocket) {
              playerSocket.leave(roomIdToDelete);
              playerSocket.roomId = null;
              const playerClient = connectedClients.get(p.id);
              if (playerClient) {
                playerClient.room = null;
              }
            }
          }
        });
        console.log('  ✅ Players cleared');

        console.log('  🧹 Clearing', room.spectators.length, 'spectators...');
        room.spectators.forEach((spectator, index) => {
          console.log('    - Processing spectator', index, ':', spectator.name, 'id:', spectator.id);
          const spectatorSocket = io.sockets.sockets.get(spectator.id);
          if (spectatorSocket) {
            console.log('      - Removing spectator from room');
            spectatorSocket.leave(roomIdToDelete);
            spectatorSocket.roomId = null;  // This may set socket.roomId to null if spectator is the one leaving!
            spectatorSocket.isSpectator = false;
            const spectatorClient = connectedClients.get(spectator.id);
            if (spectatorClient) {
              spectatorClient.room = null;
            }
            console.log('      - Spectator removed');
          }
        });
        console.log('  ✅ Spectators cleared');

        console.log('  🗑️ Calling rooms.delete() with roomId:', roomIdToDelete);
        rooms.delete(roomIdToDelete);  // Use saved roomId instead of socket.roomId (which may be null now)
        console.log('  ✅ rooms.delete() completed!');
        console.log('  📋 Rooms after delete:', Array.from(rooms.keys()));
      } catch (error) {
        console.error('  ❌ ERROR in room deletion:', error);
        console.error('  Stack:', error.stack);
      }
    }

    socket.leave(socket.roomId);
    if (client) {
      client.room = null;
    }
    socket.roomId = null;

    // Broadcast updated rooms list
    console.log('  📢 Broadcasting rooms list...');
    broadcastRoomsList();
    console.log('  📋 Final rooms count:', rooms.size);
    broadcastOnlinePlayers();
    broadcastLobbyPlayers();
  });

  socket.on('makeMove', ({ row, col }) => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, 'makeMove')) {
      socket.emit('error', 'Túl gyorsan próbálsz lépni! Várj egy kicsit.');
      return;
    }

    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const result = room.makeMove(socket.id, row, col);

    if (result.success) {
      io.to(socket.roomId).emit('gameState', room.getState());

      if (result.gameOver) {
        // Track statistics - game ended
        gameStats.activeGames = Math.max(0, gameStats.activeGames - 1);
        gameStats.totalGamesCompleted++;

        // Prepare game result data for stat tracking
        const gameResult = {
          boardSize: room.boardSize.toString(),
          mode: room.gameMode,
          moves: room.moveHistory.length
        };

        if (result.draw) {
          gameStats.draws++;
          io.to(socket.roomId).emit('message', "It's a draw!");

          // Update player stats for draw
          room.players.forEach(p => {
            if (!p.isAI) {
              // Award points for draw (3 points) - kept for compatibility
              UserManager.updateScore(p.name, 3).catch(err => console.error('❌ Score update error:', err));

              // Update detailed player stats
              UserManager.updatePlayerStats(p.name, {
                ...gameResult,
                result: 'draw'
              }).catch(err => console.error('❌ Player stats update error:', err));
            }
          });

          // Announce draw to lobby
          const player1 = room.players[0]?.name || 'Játékos 1';
          const player2 = room.players[1]?.name || 'Játékos 2';
          announceGameResult(player1, player2, true);
        } else {
          // Track AI wins vs player wins
          if (result.winner.isAI) {
            gameStats.aiWins++;
          } else {
            gameStats.playerWins++;
            // Award points for win (10 points) - kept for compatibility
            UserManager.updateScore(result.winner.name, 10).catch(err => console.error('❌ Score update error:', err));

            // Update winner's detailed stats
            UserManager.updatePlayerStats(result.winner.name, {
              ...gameResult,
              result: 'win'
            }).catch(err => console.error('❌ Player stats update error:', err));
          }

          // Award points for loss (1 point) - kept for compatibility
          const loser = room.players.find(p => p.id !== result.winner.id);
          if (loser && !loser.isAI) {
            UserManager.updateScore(loser.name, 1).catch(err => console.error('❌ Score update error:', err));

            // Update loser's detailed stats
            UserManager.updatePlayerStats(loser.name, {
              ...gameResult,
              result: 'loss'
            }).catch(err => console.error('❌ Player stats update error:', err));
          }

          saveStats(); // Save stats after game end

          io.to(socket.roomId).emit('message', `${result.winner.name} wins!`);
          // Announce winner to lobby
          announceGameResult(result.winner.name, loser?.name || 'Ellenfél');
        }

        // Broadcast updated stats to admins
        broadcastStatsToAdmins();
      } else {
        // FIX #2: Removed nested timer callback to prevent memory leak
        // Timer for next player handled automatically by move logic
        // Start timer for next player
        room.startTimer(() => {
          io.to(socket.roomId).emit('message', 'Idő lejárt! Kör átugrva.');
          io.to(socket.roomId).emit('gameState', room.getState());
        });

        // If it's an AI game and AI's turn, make AI move after a short delay
        if (room.isAIGame && !room.gameOver) {
          setTimeout(() => {
            const aiResult = room.makeAIMove();
            if (aiResult && aiResult.success) {
              io.to(socket.roomId).emit('gameState', room.getState());

              if (aiResult.gameOver) {
                // Track statistics - AI game ended
                gameStats.activeGames = Math.max(0, gameStats.activeGames - 1);
                gameStats.totalGamesCompleted++;

                if (aiResult.draw) {
                  gameStats.draws++;
                  io.to(socket.roomId).emit('message', "It's a draw!");
                  // Announce draw to lobby
                  const player1 = room.players[0]?.name || 'Játékos 1';
                  const player2 = room.players[1]?.name || 'Játékos 2';
                  announceGameResult(player1, player2, true);
                } else {
                  // Track AI wins vs player wins
                  if (aiResult.winner.isAI) {
                    gameStats.aiWins++;
                  } else {
                    gameStats.playerWins++;
                  }

                  io.to(socket.roomId).emit('message', `${aiResult.winner.name} wins!`);
                  // Announce winner to lobby
                  const loser = room.players.find(p => p.id !== aiResult.winner.id);
                  announceGameResult(aiResult.winner.name, loser?.name || 'Ellenfél');
                }

                // Broadcast updated stats to admins
                broadcastStatsToAdmins();
              }
            }
          }, 500);  // 500ms delay to make AI feel more natural
        }
      }
    } else {
      socket.emit('error', result.error);
    }
  });

  socket.on('chatMessage', ({ message }) => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, 'chatMessage')) {
      socket.emit('error', 'Túl gyorsan küldesz üzeneteket! Várj egy kicsit.');
      return;
    }

    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const client = connectedClients.get(socket.id);
    if (!client) return;

    // Sanitize and validate message (XSS protection)
    const sanitizedMessage = sanitizeInput(message, 200);
    if (!sanitizedMessage) return;

    // Broadcast message to everyone in the room
    io.to(socket.roomId).emit('chatMessage', {
      senderId: socket.id,
      senderName: client.name,
      message: sanitizedMessage,
      timestamp: Date.now()
    });
  });

  socket.on('lobbyChatMessage', ({ message }) => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, 'lobbyChatMessage')) {
      socket.emit('error', 'Túl gyorsan küldesz üzeneteket! Várj egy kicsit.');
      return;
    }

    const client = connectedClients.get(socket.id);
    if (!client) return;

    // Sanitize and validate message (XSS protection)
    const sanitizedMessage = sanitizeInput(message, 200);
    if (!sanitizedMessage) return;

    // Create message object
    const chatMessage = {
      senderId: socket.id,
      senderName: client.name,
      message: sanitizedMessage,
      timestamp: Date.now()
    };

    // Add to chat history
    addToLobbyChatHistory(chatMessage);

    // Broadcast message to everyone in lobby (not in a room)
    connectedClients.forEach((c, sid) => {
      if (!c.room && !c.isAdmin) {
        io.to(sid).emit('lobbyChatMessage', chatMessage);
      }
    });
  });

  socket.on('undoMove', () => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, 'undoMove')) {
      socket.emit('error', 'Túl gyakran próbálsz visszavonni! Várj egy kicsit.');
      return;
    }

    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const result = room.undoMove();

    if (result.success) {
      io.to(socket.roomId).emit('message', 'Lépés visszavonva!');
      io.to(socket.roomId).emit('gameState', room.getState());

      // Restart timer for current player
      room.startTimer(() => {
        io.to(socket.roomId).emit('message', 'Idő lejárt! Kör átugrva.');
        io.to(socket.roomId).emit('gameState', room.getState());
      });
    } else {
      socket.emit('error', result.error);
    }
  });

  socket.on('resetGame', () => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.reset();
    io.to(socket.roomId).emit('gameState', room.getState());
    io.to(socket.roomId).emit('message', 'Game reset! X goes first.');
  });

  // Request new game
  socket.on('requestNewGame', () => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    const client = connectedClients.get(socket.id);
    if (!client) return;

    // Find the opponent (not spectators, only players)
    const opponent = room.players.find(p => p.id !== socket.id && !p.isAI);
    if (opponent) {
      io.to(opponent.id).emit('newGameRequest', { requesterName: client.name });
    }
  });

  // Accept new game
  socket.on('acceptNewGame', () => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    // Reset the game
    room.reset();

    // Notify both players
    io.to(socket.roomId).emit('newGameAccepted');
    io.to(socket.roomId).emit('gameState', room.getState());
    io.to(socket.roomId).emit('message', '🎮 Új játék kezdődik! X kezd.');

    // Start timer if enabled
    room.startTimer(() => {
      io.to(socket.roomId).emit('message', 'Idő lejárt! Kör átugrva.');
      io.to(socket.roomId).emit('gameState', room.getState());
    });
  });

  // Decline new game
  socket.on('declineNewGame', () => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    // Find the requester (opponent)
    const opponent = room.players.find(p => p.id !== socket.id && !p.isAI);
    if (opponent) {
      io.to(opponent.id).emit('newGameDeclined');
    }
  });

  // Admin: Update Undo settings
  socket.on('updateUndoSettings', (enabled) => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }
    globalUndoEnabled = enabled;
    console.log(`Admin ${client.name} set Undo to: ${enabled}`);

    // Broadcast to all clients to update UI immediately
    io.emit('undoSettingsChanged', globalUndoEnabled);

    // Also broadcast stats to update admin panel
    broadcastStatsToAdmins();
  });

  // Admin: Clear chat history
  socket.on('adminClearChat', () => {
    console.log(`🧹 adminClearChat received from ${socket.id}`);
    const client = connectedClients.get(socket.id);

    if (!client) {
      console.log('❌ Client not found in connectedClients');
      socket.emit('error', 'Unauthorized: Client not found');
      return;
    }

    console.log(`👤 Client: ${client.name}, IsAdmin: ${client.isAdmin}`);

    if (!client.isAdmin) {
      console.log('❌ Client is NOT admin');
      socket.emit('error', 'Unauthorized: You are not an admin');
      return;
    }

    // Clear history
    lobbyChatHistory = [];
    saveChatHistory().catch(err => console.error('Failed to save cleared chat history:', err));

    console.log(`✅ Chat history cleared by ${client.name}. Broadcasting chatCleared...`);

    // Broadcast to all clients
    io.emit('chatCleared');
    console.log('📡 chatCleared broadcasted');
  });

  // Request undo
  socket.on('requestUndo', () => {
    if (!socket.roomId) return;

    // Check global setting
    if (!globalUndoEnabled) {
      socket.emit('error', 'A visszavonás jelenleg ki van kapcsolva.');
      return;
    }

    const room = rooms.get(socket.roomId);
    if (!room) return;

    // Check if game is in progress
    if (room.status !== 'in_progress') {
      socket.emit('error', 'Csak játék közben lehet visszavonni');
      return;
    }

    // AI Game Logic: Undo 2 moves (AI's and Player's)
    if (room.isAIGame) {
      if (room.moveHistory.length < 2) {
        socket.emit('error', 'Nincs mit visszavonni');
        return;
      }

      // Undo AI move
      room.undoMove();
      // Undo Player move
      room.undoMove();

      io.to(socket.roomId).emit('undoAccepted');
      io.to(socket.roomId).emit('gameState', room.getState());
      io.to(socket.roomId).emit('message', 'Lépés visszavonva (AI ellen).');
      return;
    }

    // PvP Logic
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    // In PvP, you can only request undo if you just moved (so it's opponent's turn)
    if (room.currentPlayer === playerIndex) {
      socket.emit('error', 'Csak a saját lépésedet vonhatod vissza, miután léptél.');
      return;
    }

    const opponent = room.players.find(p => p.id !== socket.id && !p.isAI);
    if (opponent) {
      io.to(opponent.id).emit('undoRequested');
    }
  });

  // Accept undo
  socket.on('acceptUndo', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;

    // Undo 1 move (the requester's move)
    const result = room.undoMove();
    if (result.success) {
      io.to(socket.roomId).emit('undoAccepted');
      io.to(socket.roomId).emit('gameState', room.getState());
      io.to(socket.roomId).emit('message', 'Lépés visszavonva.');

      // Restart timer for the player who is now active (the requester)
      room.startTimer(() => {
        io.to(socket.roomId).emit('message', 'Idő lejárt! Kör átugrva.');
        io.to(socket.roomId).emit('gameState', room.getState());
      });
    }
  });

  // Decline undo
  socket.on('declineUndo', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const opponent = room.players.find(p => p.id !== socket.id && !p.isAI);
    if (opponent) {
      io.to(opponent.id).emit('undoDeclined');
    }
  });

  // Handle emoji reactions
  socket.on('sendReaction', ({ roomId, emoji }) => {
    if (!roomId) return;
    // Broadcast to everyone in the room except sender
    socket.to(roomId).emit('reaction', { emoji, from: socket.id });
  });

  // Admin: Kick player
  socket.on('adminKickPlayer', ({ targetSocketId }) => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('kicked', { message: 'You have been kicked by an admin' });
      targetSocket.disconnect(true);
      console.log(`Admin ${socket.id} kicked player ${targetSocketId}`);
    }
  });

  // Admin: Close room
  socket.on('adminCloseRoom', ({ roomId }) => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    const room = rooms.get(roomId);
    if (room) {
      // Kick all players from the room
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('roomClosed', { message: 'Room has been closed by an admin' });
          playerSocket.leave(roomId);
        }
      });

      rooms.delete(roomId);
      broadcastRoomsList();
      broadcastOnlinePlayers();
      console.log(`Admin ${socket.id} closed room ${roomId}`);
    }
  });

  // Admin: Get timer settings
  socket.on('adminGetTimerSettings', () => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    socket.emit('timerSettings', globalTimerSettings);
  });

  // Admin: Set timer settings
  socket.on('adminSetTimer', ({ enabled, duration }) => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    if (typeof enabled === 'boolean') {
      globalTimerSettings.enabled = enabled;
    }

    if (typeof duration === 'number' && duration > 0 && duration <= 300) {
      globalTimerSettings.duration = duration;
    }

    // Broadcast to all admins
    connectedClients.forEach((c, sid) => {
      if (c.isAdmin) {
        io.to(sid).emit('timerSettings', globalTimerSettings);
      }
    });

    // Update all active rooms
    rooms.forEach(room => {
      io.to(room.roomId).emit('gameState', room.getState());
    });

    console.log('Timer settings updated:', globalTimerSettings);
  });

  socket.on('adminSetAISettings', ({ aiVsAiEnabled }) => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    if (typeof aiVsAiEnabled === 'boolean') {
      globalAISettings.aiVsAiEnabled = aiVsAiEnabled;
    }

    // Broadcast to all admins
    connectedClients.forEach((c, sid) => {
      if (c.isAdmin) {
        io.to(sid).emit('aiSettings', globalAISettings);
      }
    });

    console.log('AI settings updated:', globalAISettings);
  });

  // Admin: Clear statistics
  socket.on('adminClearStats', () => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    // Reset all stats to default
    gameStats = {
      totalGames: 0,
      totalGamesCompleted: 0,
      activeGames: 0,
      peakTimes: Array(24).fill(0),
      boardSizes: { '9': 0, '13': 0, '15': 0, '19': 0 },
      gameModes: { 'pvp': 0, 'ai-easy': 0, 'ai-medium': 0, 'ai-hard': 0, 'ai-vs-ai': 0 },
      playerWins: 0,
      aiWins: 0,
      draws: 0
    };

    // Save cleared stats to file
    saveStats().catch(err => console.error('Failed to save cleared stats:', err));

    // Broadcast updated stats to all admins
    broadcastStatsToAdmins();

    console.log('📊 Statistics cleared by admin');
    socket.emit('message', 'Statisztikák törölve!');
  });

  // Admin change password
  socket.on('adminChangePassword', async ({ currentPassword, newPassword }) => {
    const client = connectedClients.get(socket.id);
    if (!client || !client.isAdmin) {
      socket.emit('error', 'Unauthorized');
      return;
    }

    try {
      // Sanitize inputs
      const sanitizedCurrent = sanitizeInput(currentPassword, 100);
      const sanitizedNew = sanitizeInput(newPassword, 100);

      if (!sanitizedCurrent || !sanitizedNew) {
        socket.emit('error', 'Érvénytelen jelszó!');
        return;
      }

      if (sanitizedNew.length < 4) {
        socket.emit('error', 'Az új jelszónak legalább 4 karakter hosszúnak kell lennie!');
        return;
      }

      // Get admin username (the logged in admin user)
      const adminUsername = client.name;

      // Verify current password
      const isValid = await UserManager.verifyPassword(adminUsername, sanitizedCurrent);
      if (!isValid) {
        console.log(`🔒 Failed password change attempt for: ${adminUsername}`);
        socket.emit('error', 'Hibás jelenlegi jelszó!');
        return;
      }

      // Set new password (will be hashed by UserManager)
      await UserManager.setPassword(adminUsername, sanitizedNew);

      console.log(`🔑 Password changed successfully for admin: ${adminUsername}`);
      socket.emit('message', '✅ Jelszó sikeresen megváltoztatva!');

    } catch (error) {
      console.error('Error changing password:', error);
      socket.emit('error', 'Hiba történt a jelszó módosítása során!');
    }
  });

  // Handle stats request (for public statistics view)
  socket.on('requestStats', () => {
    socket.emit('gameStats', gameStats);
  });

  // Player profile request
  socket.on('requestPlayerProfile', ({ playerName }) => {
    const sanitizedName = sanitizeInput(playerName, 50);

    if (!sanitizedName) {
      socket.emit('profileError', 'Invalid player name');
      return;
    }

    const user = UserManager.getUser(sanitizedName);

    if (!user) {
      socket.emit('profileError', 'Player not found');
      return;
    }

    // Ensure user has stats
    UserManager.ensureUserStats(sanitizedName);

    // Prepare profile data
    const profileData = {
      name: sanitizedName,
      rank: user.rank || 'Újonc',
      score: user.score || 0,
      stats: user.stats || {}
    };

    console.log(`📊 Profile requested for: ${sanitizedName}`);
    console.log(`📊 Sending profile data:`, JSON.stringify(profileData, null, 2));

    // Send profile data
    socket.emit('playerProfile', profileData);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Cleanup rate limiting data
    cleanupRateLimit(socket.id);

    const client = connectedClients.get(socket.id);

    // Announce disconnect to lobby (if not admin and has name)
    if (client && !client.isAdmin && client.name) {
      const disconnectMessages = [
        `👋 ${client.name} kilépett... Szia! 😢`,
        `🚪 ${client.name} távozott... Viszlát! 👋`,
        `💨 ${client.name} elment... Gyere vissza! 🙏`,
        `😔 ${client.name} otthagyta a lobbyt... 💔`
      ];
      announceLobbyEvent(disconnectMessages[Math.floor(Math.random() * disconnectMessages.length)]);
    }

    // Remove from connected clients and logged in players
    connectedClients.delete(socket.id);
    loggedInPlayers.delete(socket.id);

    // If player created a room, delete it if they never joined as a player
    if (client && client.createdRoom) {
      const createdRoom = rooms.get(client.createdRoom);
      if (createdRoom) {
        // Check if the creator is actually a player in the room
        const isPlayerInRoom = createdRoom.players.find(p => p.id === socket.id && !p.isAI);

        // Delete room if creator never joined, OR if it's an AI vs AI room (creator is not a player)
        if (!isPlayerInRoom) {
          // Notify anyone watching (spectators or AI vs AI watchers)
          io.to(client.createdRoom).emit('roomClosed', { message: 'A szoba létrehozója kilépett, szoba bezárva' });

          rooms.delete(client.createdRoom);
          console.log(`Deleted room ${client.createdRoom} created by ${client.name} (creator left without joining)`);
        }
      }
    }

    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        const player = room.players.find(p => p.id === socket.id);
        const isPlayer = player !== undefined;
        const isSpectator = socket.isSpectator;

        if (isPlayer) {
          // If a player disconnects, wait 10 seconds before deleting the room
          // This allows F5 refresh or quick reconnects
          const roomId = socket.roomId;
          console.log(`⏱️ Player ${player.name} disconnected from room ${roomId}. Waiting 10s before deletion...`);

          // Clear any existing pending deletion for this room
          if (pendingRoomDeletions.has(roomId)) {
            clearTimeout(pendingRoomDeletions.get(roomId));
          }

          // Schedule room deletion after 10 seconds
          const deletionTimeout = setTimeout(() => {
            const roomToDelete = rooms.get(roomId);
            if (roomToDelete) {
              console.log(`⏰ 10 seconds passed. Deleting room ${roomId}`);

              // Notify everyone in the room
              io.to(roomId).emit('roomClosed', { message: 'Játékos nem tért vissza, szoba bezárva' });

              // Kick all spectators back to lobby
              roomToDelete.spectators.forEach(spectator => {
                const spectatorSocket = io.sockets.sockets.get(spectator.id);
                if (spectatorSocket) {
                  spectatorSocket.leave(roomId);
                  spectatorSocket.roomId = null;
                  spectatorSocket.isSpectator = false;
                }
              });

              rooms.delete(roomId);
              pendingRoomDeletions.delete(roomId);
              broadcastRoomsList();
            }
          }, 10000); // 10 seconds

          pendingRoomDeletions.set(roomId, deletionTimeout);
        } else if (isSpectator) {
          // If a spectator disconnects, just remove them
          room.removeSpectator(socket.id);
          io.to(socket.roomId).emit('message', `${client?.name || 'Néző'} kilépett a nézői módból`);
          io.to(socket.roomId).emit('gameState', room.getState());
          console.log(`Spectator ${client?.name} left room ${socket.roomId}`);
        }

        // Broadcast updated rooms list
        broadcastRoomsList();
      }
    }

    // Broadcast updated online players list to admins and rooms list
    broadcastOnlinePlayers();
    broadcastRoomsList();
    broadcastLobbyPlayers();
  });
});

// Balambér announces game result to lobby
function announceGameResult(winnerName, loserName, isDraw = false) {
  // Check if there are players in lobby (not in a room and not admin)
  const lobbyPlayers = [];
  connectedClients.forEach((client, sid) => {
    if (!client.room && !client.isAdmin) {
      lobbyPlayers.push(sid);
    }
  });

  // Only send if there are players in lobby
  if (lobbyPlayers.length > 0) {
    let message;
    if (isDraw) {
      message = `⚡ Döntetlen! ${winnerName} és ${loserName} nem tudtak nyerni! 🤝`;
    } else {
      const announcements = [
        `🏆 ${winnerName} legyőzte ${loserName}-t! Gratulálok! 🎉`,
        `⚔️ ${winnerName} nyert ${loserName} ellen! Szép játék! 👏`,
        `🎯 ${winnerName} győzött! ${loserName} legközelebb több szerencsét! 🍀`,
        `🔥 ${winnerName} simán verte ${loserName}-t! Respect! 💪`,
        `✨ ${winnerName} csapata nyert! ${loserName} majd legközelebb! 😊`
      ];
      message = announcements[Math.floor(Math.random() * announcements.length)];
    }

    announceLobbyEvent(message);
  }
}

// Generic function to announce events to lobby
function announceLobbyEvent(message, excludeSocketId = null) {
  const lobbyPlayers = [];
  connectedClients.forEach((client, sid) => {
    if (!client.room && !client.isAdmin && sid !== excludeSocketId) {
      lobbyPlayers.push(sid);
    }
  });

  if (lobbyPlayers.length > 0) {
    const chatMessage = {
      senderId: 'bot',
      senderName: '🤖 Balambér',
      message: message,
      timestamp: Date.now()
    };

    // Add to chat history
    addToLobbyChatHistory(chatMessage);

    lobbyPlayers.forEach(sid => {
      io.to(sid).emit('lobbyChatMessage', chatMessage);
    });

    console.log(`Balambér announced: "${message}" to ${lobbyPlayers.length} players`);
  }
}

// Balambér chatbot - sends random messages to lobby
function sendBalamberMessage() {
  // Check if there are players in lobby (not in a room and not admin)
  const lobbyPlayers = [];
  connectedClients.forEach((client, sid) => {
    if (!client.room && !client.isAdmin) {
      lobbyPlayers.push(sid);
    }
  });

  // Only send if there are players in lobby
  if (lobbyPlayers.length > 0) {
    const randomMessage = balamberMessages[Math.floor(Math.random() * balamberMessages.length)];

    const chatMessage = {
      senderId: 'bot',
      senderName: '🤖 Balambér',
      message: randomMessage,
      timestamp: Date.now()
    };

    // Add to chat history
    addToLobbyChatHistory(chatMessage);

    lobbyPlayers.forEach(sid => {
      io.to(sid).emit('lobbyChatMessage', chatMessage);
    });

    console.log(`Balambér said: "${randomMessage}" to ${lobbyPlayers.length} players`);
  }
}

// Start Balambér chatbot (sends message every 60-120 seconds)
function scheduleNextBalamberMessage() {
  const delay = 60000 + Math.random() * 60000; // 60-120 seconds
  setTimeout(() => {
    sendBalamberMessage();
    scheduleNextBalamberMessage();
  }, delay);
}

// === Data Persistence Functions ===

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Save statistics to file
async function saveStats() {
  try {
    await ensureDataDirectory();
    await fs.writeFile(STATS_FILE, JSON.stringify(gameStats, null, 2));
    console.log('📊 Statistics saved');
  } catch (error) {
    console.error('Error saving statistics:', error);
  }
}

// Load statistics from file
async function loadStats() {
  try {
    const data = await fs.readFile(STATS_FILE, 'utf8');
    const loadedStats = JSON.parse(data);
    // Merge loaded stats with default structure (in case of new fields)
    gameStats = { ...gameStats, ...loadedStats };
    console.log('📊 Statistics loaded from file');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error loading statistics:', error);
    } else {
      console.log('📊 No previous statistics found, starting fresh');
    }
  }
}

// Save chat history to file
async function saveChatHistory() {
  try {
    await ensureDataDirectory();
    await fs.writeFile(CHAT_HISTORY_FILE, JSON.stringify(lobbyChatHistory, null, 2));
    console.log('💬 Chat history saved');
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

// Load chat history from file
async function loadChatHistory() {
  try {
    const data = await fs.readFile(CHAT_HISTORY_FILE, 'utf8');
    lobbyChatHistory = JSON.parse(data);
    console.log('💬 Chat history loaded from file');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error loading chat history:', error);
    } else {
      console.log('💬 No previous chat history found, starting fresh');
    }
  }
}

// Add message to lobby chat history (keep last 10)
function addToLobbyChatHistory(message) {
  lobbyChatHistory.push(message);
  // Keep only last 10 messages
  if (lobbyChatHistory.length > 10) {
    lobbyChatHistory = lobbyChatHistory.slice(-10);
  }
  // Save to file (async, don't wait)
  saveChatHistory().catch(err => console.error('Failed to save chat history:', err));
}

// Start server and load data
async function startServer() {
  try {
    // Load persisted data
    await loadStats();
    await loadChatHistory();

    http.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT} (Restarted)`);
      console.log(`Open http://localhost:${PORT} in your browser`);

      // Start Balambér chatbot after 30 seconds
      setTimeout(() => {
        console.log('🤖 Balambér chatbot activated!');
        scheduleNextBalamberMessage();
      }, 30000);

      // FIX #13: Removed duplicate io.on('connection') handler
      // The lobby chat history is already sent in the login event handler
    });
  } catch (error) {
    console.error('CRITICAL SERVER ERROR:', error);
  }
}

// Start the server
startServer();
