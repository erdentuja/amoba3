// Game constants
const BASE_CELL_SIZE = 35; // Base cell size for desktop
let CELL_SIZE = BASE_CELL_SIZE;
let BOARD_SIZE = 15;
let CANVAS_SIZE = BOARD_SIZE * CELL_SIZE;

// Responsive canvas sizing
function calculateResponsiveCanvasSize() {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Mobile detection
  const isMobile = screenWidth <= 768;
  const isPortrait = screenHeight > screenWidth;

  // Calculate maximum available space
  let maxWidth, maxHeight;

  if (isMobile) {
    // Mobile: use most of the screen width
    maxWidth = screenWidth * 0.95; // 95% of screen width
    maxHeight = screenHeight * (isPortrait ? 0.5 : 0.7); // 50% portrait, 70% landscape
  } else {
    // Desktop: use reasonable size
    maxWidth = Math.min(screenWidth * 0.6, 700);
    maxHeight = screenHeight * 0.7;
  }

  // Calculate cell size to fit
  const maxSize = Math.min(maxWidth, maxHeight);
  let newCellSize = Math.floor(maxSize / (BOARD_SIZE + 2)); // +2 for padding

  // Minimum cell size for playability
  newCellSize = Math.max(newCellSize, isMobile ? 18 : 25);
  // Maximum cell size to avoid huge boards
  newCellSize = Math.min(newCellSize, 50);

  return {
    cellSize: newCellSize,
    canvasSize: newCellSize * BOARD_SIZE,
    isMobile: isMobile,
    isPortrait: isPortrait
  };
}

// Apply responsive sizing
function applyResponsiveCanvas() {
  const sizing = calculateResponsiveCanvasSize();
  CELL_SIZE = sizing.cellSize;
  CANVAS_SIZE = sizing.canvasSize;

  // Update canvas if it exists
  if (typeof canvas !== 'undefined' && canvas) {
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    canvas.style.width = CANVAS_SIZE + 'px';
    canvas.style.height = CANVAS_SIZE + 'px';

    // Redraw board if game is active
    if (typeof gameState !== 'undefined' && gameState) {
      drawBoard();
    }
  }

  console.log(`📱 Canvas resized: ${CANVAS_SIZE}x${CANVAS_SIZE} (cell: ${CELL_SIZE}px, mobile: ${sizing.isMobile})`);
}

console.log('%c 🚀 VERSION 2.0 LOADED - MOBILE OPTIMIZED 🚀 ', 'background: #222; color: #bada55; font-size: 20px;');

// DOM elements
const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');
const boardSizeInput = document.getElementById('boardSize');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomsListDiv = document.getElementById('roomsList');
const undoBtn = document.getElementById('undoBtn');
const resetBtn = document.getElementById('resetBtn');
const leaveBtn = document.getElementById('leaveBtn');
const leaveSpectatorBtn = document.getElementById('leaveSpectatorBtn');
const logoutBtn = document.getElementById('logoutBtn');
const welcomePlayerName = document.getElementById('welcomePlayerName');
const lobbyOnlinePlayersList = document.getElementById('lobbyOnlinePlayersList');
const lobbyOnlineCount = document.getElementById('lobbyOnlineCount');
const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');
const currentTurnDiv = document.getElementById('currentTurn');
const messagesDiv = document.getElementById('messages');
const player1Info = document.getElementById('player1Info');
const player2Info = document.getElementById('player2Info');
const timerDiv = document.getElementById('timer');
const timerDisplay = document.getElementById('timerDisplay');
const timerProgressFill = document.getElementById('timerProgressFill');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const victoryNewGameBtn = document.getElementById('victoryNewGameBtn');
const victoryLeaveBtn = document.getElementById('victoryLeaveBtn');
const newGameRequestModal = document.getElementById('newGameRequestModal');
const acceptNewGameBtn = document.getElementById('acceptNewGameBtn');
const declineNewGameBtn = document.getElementById('declineNewGameBtn');
const undoRequestModal = document.getElementById('undoRequestModal');
const acceptUndoBtn = document.getElementById('acceptUndoBtn');
const declineUndoBtn = document.getElementById('declineUndoBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const lobbyChatMessages = document.getElementById('lobbyChatMessages');
const lobbyChatInput = document.getElementById('lobbyChatInput');
const lobbyChatSendBtn = document.getElementById('lobbyChatSendBtn');
const viewStatsBtn = document.getElementById('viewStatsBtn');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');
const statsView = document.getElementById('statsView');
const defeatModal = document.getElementById('defeatModal');
const defeatNewGameBtn = document.getElementById('defeatNewGameBtn');
const defeatLeaveBtn = document.getElementById('defeatLeaveBtn');
const messageModal = document.getElementById('messageModal');
const messageModalClose = document.querySelector('.message-modal-close');
const messageModalBtn = document.getElementById('messageModalBtn');
const messageModalText = document.getElementById('messageModalText');
const messageModalTitle = document.getElementById('messageModalTitle');
const messageModalIcon = document.getElementById('messageModalIcon');

// Game state
let socket = null;
let gameState = null;
let myPlayerId = null;
let myPlayerName = null;
let currentRoomId = null;
let isLoggedIn = false;
let isAdmin = false;
let isSpectator = false;
let timerInterval = null;
let winningAnimationFrame = 0;
let animationInterval = null;

// Theme system variables
let currentTheme = 'light';
let currentBoardTheme = 'wood';
let currentPieceColor = 'classic';

// Sound system
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioContext();
let soundEnabled = true;

// Sound effects using Web Audio API
const sounds = {
  click: () => {
    if (!soundEnabled) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  },

  win: () => {
    if (!soundEnabled) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'triangle';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    // Victory melody
    const notes = [523, 659, 784, 1047]; // C, E, G, C
    notes.forEach((freq, i) => {
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.15);
    });

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.6);
  },

  gameStart: () => {
    if (!soundEnabled) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(554, audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  },

  error: () => {
    if (!soundEnabled) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 200;

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  }
};

function toggleSound() {
  soundEnabled = !soundEnabled;
  const soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    soundBtn.textContent = soundEnabled ? '🔊 Hang BE' : '🔇 Hang KI';
    soundBtn.classList.toggle('sound-off', !soundEnabled);
  }
  localStorage.setItem('soundEnabled', soundEnabled);
}

// Initialize
function init() {
  console.log('🚀 Init started');

  // Initialize theme system with error handling
  try {
    initThemeSystem();
    console.log('🎨 Theme system initialized');
  } catch (error) {
    console.error('❌ Error initializing theme system:', error);
  }

  // Set initial canvas size (responsive)
  applyResponsiveCanvas();

  // Add window resize listener for responsive canvas
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      applyResponsiveCanvas();
    }, 250); // Debounce resize events
  });

  // Add orientation change listener for mobile
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      applyResponsiveCanvas();
    }, 300); // Wait for orientation change to complete
  });

  // Load sound preference
  const savedSound = localStorage.getItem('soundEnabled');
  if (savedSound !== null) {
    soundEnabled = savedSound === 'true';
  }

  setupEventListeners();
  drawBoard();
  initSocketConnection();

  // Initialize sound button state
  const soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    soundBtn.textContent = soundEnabled ? '🔊 Hang BE' : '🔇 Hang KI';
    soundBtn.classList.toggle('sound-off', !soundEnabled);
  }

  // Check for Google OAuth callback parameters
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('playerName')) {
    const playerName = urlParams.get('playerName');
    const playerEmail = urlParams.get('playerEmail');
    const authMethod = urlParams.get('authMethod');

    console.log('🔐 Google OAuth login detected:', playerName, playerEmail);

    // Store Google user data in localStorage
    localStorage.setItem('playerName', playerName);
    localStorage.setItem('playerEmail', playerEmail || '');
    localStorage.setItem('isGuest', 'false');
    localStorage.setItem('authMethod', authMethod || 'google');

    // Clear query parameters from URL (for security and cleanliness)
    window.history.replaceState({}, document.title, '/game');
  }

  // Auto-login if player name is saved
  const savedPlayerName = localStorage.getItem('playerName');
  const savedPlayerPassword = localStorage.getItem('playerPassword');

  if (savedPlayerName) {
    console.log('🔄 Auto-login for:', savedPlayerName);
    // Wait for socket connection to be established
    // Loading screen is visible by default in HTML
    setTimeout(() => {
      if (socket) {
        socket.emit('login', {
          playerName: savedPlayerName,
          password: savedPlayerPassword || ''
        });
      }
    }, 100);
  } else {
    // No saved name, redirect to landing page
    window.location.href = '/landing.html';
  }
}

// Initialize socket connection
function initSocketConnection() {
  console.log('🔌 initSocketConnection called');

  if (typeof io === 'undefined') {
    console.error('❌ Socket.IO client library not loaded!');
    showModalMessage('Hiba: A Socket.IO könyvtár nem töltődött be!', 'error');
    return;
  }

  if (!socket) {
    console.log('🔌 Connecting to socket...');
    socket = io();

    // Set myPlayerId when connected
    socket.on('connect', () => {
      myPlayerId = socket.id;
      console.log('✅ Socket connected! My ID:', myPlayerId);

      // If user was logged in before, re-login automatically
      if (isLoggedIn && myPlayerName) {
        console.log('🔄 Auto re-login as:', myPlayerName);
        socket.emit('login', { playerName: myPlayerName });
      }
    });

    // Handle rooms list updates
    socket.on('roomsList', (rooms) => {
      console.log('📋 Received roomsList:', rooms.length, 'rooms');
      console.log('  Room IDs:', rooms.map(r => r.roomId));
      updateRoomsList(rooms);
    });

    // Handle chat cleared
    socket.on('chatCleared', () => {
      console.log('🧹 chatCleared event received!');
      const lobbyChatMessages = document.getElementById('lobbyChatMessages');
      if (lobbyChatMessages) {
        lobbyChatMessages.innerHTML = '';
        const systemMsg = document.createElement('div');
        systemMsg.className = 'chat-message system-message';
        systemMsg.textContent = '🧹 A chat előzményeket az admin törölte.';
        systemMsg.style.color = '#888';
        systemMsg.style.fontStyle = 'italic';
        systemMsg.style.textAlign = 'center';
        systemMsg.style.padding = '10px';
        lobbyChatMessages.appendChild(systemMsg);
      } else {
        console.error('❌ lobbyChatMessages element not found!');
      }
    });

    // Handle undo settings changes
    socket.on('undoSettingsChanged', (enabled) => {
      console.log('🔄 Global Undo settings changed:', enabled);
      if (gameState) {
        gameState.undoEnabled = enabled;
        updateGameDisplay();
      }
    });

    // Handle lobby players list updates
    socket.on('lobbyPlayers', (players) => {
      updateLobbyPlayersList(players);
    });

    // Handle login success
    socket.on('loginSuccess', ({ playerName, isAdmin: adminStatus, rank }) => {
      myPlayerName = playerName;
      isLoggedIn = true;
      isAdmin = adminStatus || false; // Update global isAdmin flag

      const loadingScreen = document.getElementById('loadingScreen');
      if (loadingScreen) loadingScreen.style.display = 'none';

      lobby.style.display = 'flex';

      // Save login status to localStorage for auto-login on page refresh
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');

      // Update welcome section
      if (welcomePlayerName) {
        welcomePlayerName.textContent = playerName;
      }

      // Show/Hide Admin Button based on rights
      const adminBtn = document.getElementById('adminLoginBtn');
      if (adminBtn) {
        if (isAdmin) {
          adminBtn.style.display = 'block';
        } else {
          adminBtn.style.display = 'none';
        }
      }

      console.log('Logged in as:', playerName, isAdmin ? '(ADMIN)' : '');

      // Auto-rejoin room if there was a saved room (for F5 refresh)
      const savedRoomId = localStorage.getItem('currentRoomId');
      const savedIsSpectator = localStorage.getItem('isSpectator') === 'true';

      if (savedRoomId) {
        console.log('🔄 Auto-rejoining room:', savedRoomId, 'as', savedIsSpectator ? 'spectator' : 'player');
        setTimeout(() => {
          if (savedIsSpectator) {
            socket.emit('watchRoom', { roomId: savedRoomId });
          } else {
            socket.emit('joinRoom', { roomId: savedRoomId });
          }
        }, 200);
      }
    });

    // Handle login failed
    socket.on('loginFailed', ({ error }) => {
      // Clear saved credentials and redirect to landing
      localStorage.removeItem('playerName');
      localStorage.removeItem('playerPassword');
      localStorage.removeItem('isAdmin');

      alert(error);
      window.location.href = '/landing.html';
    });
    // Handle room created
    socket.on('roomCreated', ({ roomId, boardSize }) => {
      showMessage(`Szoba létrehozva: ${roomId}. Most csatlakozz hozzá!`);
    });

    // Handle room joined
    socket.on('roomJoined', ({ roomId, boardSize, players, gameMode }) => {
      currentRoomId = roomId;
      BOARD_SIZE = boardSize;
      CANVAS_SIZE = BOARD_SIZE * CELL_SIZE;
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;

      // Save room state to localStorage for auto-rejoin on refresh
      localStorage.setItem('currentRoomId', roomId);
      localStorage.setItem('isSpectator', 'false');

      // Update room ID display
      if (roomIdDisplay) {
        roomIdDisplay.textContent = `Szoba: ${roomId}`;
        roomIdDisplay.style.display = 'block';
      }

      lobby.style.display = 'none';
      gameArea.style.display = 'flex';

      // Reset game state
      gameState = null;
      drawBoard();
      updatePlayerInfo(players);

      // Show/hide spectator button
      if (isSpectator) {
        leaveSpectatorBtn.style.display = 'inline-block';
        undoBtn.style.display = 'none';
        resetBtn.style.display = 'none';
        leaveBtn.style.display = 'none';
      } else {
        leaveSpectatorBtn.style.display = 'none';
        undoBtn.style.display = 'inline-block';
        resetBtn.style.display = 'inline-block';
        leaveBtn.style.display = 'inline-block';
      }
    });

    // Handle reactions
    socket.on('reaction', ({ emoji }) => {
      showReaction(emoji);
    });

    // Handle game state update
    socket.on('gameState', (state) => {
      gameState = state;
      updateGameDisplay(); // Use the comprehensive update function

      if (state.lastMove) {
        // Play click sound if it's a new move
        sounds.click();
      }

      // Check for win/draw
      if (state.winner) {
        handleGameOver(state.winner);
      } else if (state.isDraw) {
        handleGameOver(null); // Draw
      }
    });

    // Handle chat message
    socket.on('chatMessage', (message) => {
      addChatMessage(message);
    });

    // Handle lobby chat message
    socket.on('lobbyChatMessage', (message) => {
      addLobbyChatMessage(message);
    });

    // Handle error
    // Handle error
    socket.on('error', (data) => {
      const message = typeof data === 'object' && data.message ? data.message : data;
      showModalMessage(message, 'error');
      sounds.error();

      // If error is about room not existing, clear saved room state
      if (message && message.includes('nem létezik')) {
        console.log('🧹 Clearing saved room state (room does not exist)');
        localStorage.removeItem('currentRoomId');
        localStorage.removeItem('isSpectator');
      }
    });

    // Handle spectator update
    socket.on('spectatorUpdate', ({ count }) => {
      console.log(`Spectators: ${count}`);
    });

    // Handle opponent left
    socket.on('opponentLeft', () => {
      showMessage('Az ellenfél kilépett a szobából.');

      // Reset button visibility
      leaveSpectatorBtn.style.display = 'none';
      undoBtn.style.display = 'inline-block';
      resetBtn.style.display = 'inline-block';
      leaveBtn.style.display = 'inline-block';
      isSpectator = false;
      currentRoomId = null;
      gameArea.style.display = 'none';
      lobby.style.display = 'flex';

      // Hide room ID display
      if (roomIdDisplay) {
        roomIdDisplay.style.display = 'none';
      }

      gameState = null;
      stopTimer();
    });

    // Handle messages
    socket.on('message', (msg) => {
      showMessage(msg);
    });

    // Handle spectator joined
    socket.on('spectatorJoined', ({ roomId }) => {
      isSpectator = true;
      currentRoomId = roomId;

      // Save room state to localStorage for auto-rejoin on refresh
      localStorage.setItem('currentRoomId', roomId);
      localStorage.setItem('isSpectator', 'true');

      lobby.style.display = 'none';
      gameArea.style.display = 'flex';

      // Show room ID for spectators
      if (roomIdDisplay) {
        roomIdDisplay.textContent = `📺 Szoba: ${roomId}`;
        roomIdDisplay.style.display = 'block';
      }

      // Show leave spectator button, hide game controls for spectators
      leaveSpectatorBtn.style.display = 'inline-block';
      undoBtn.style.display = 'none';
      resetBtn.style.display = 'none';
      leaveBtn.style.display = 'none';

      showMessage(`🎬 Nézői mód aktív`);
    });

    // Handle left spectator mode
    socket.on('leftSpectator', () => {
      isSpectator = false;
      currentRoomId = null;
      gameArea.style.display = 'none';
      lobby.style.display = 'flex';

      // Hide room ID display
      if (roomIdDisplay) {
        roomIdDisplay.style.display = 'none';
      }

      // Reset button visibility
      leaveSpectatorBtn.style.display = 'none';
      undoBtn.style.display = 'inline-block';
      resetBtn.style.display = 'inline-block';
      leaveBtn.style.display = 'inline-block';

      gameState = null;
      stopTimer();
    });

    // Handle room closed
    socket.on('roomClosed', ({ message }) => {
      isSpectator = false;
      currentRoomId = null;

      // Clear room state from localStorage
      localStorage.removeItem('currentRoomId');
      localStorage.removeItem('isSpectator');

      gameArea.style.display = 'none';
      lobby.style.display = 'flex';

      // Hide room ID display
      if (roomIdDisplay) {
        roomIdDisplay.style.display = 'none';
      }

      // Reset button visibility
      leaveSpectatorBtn.style.display = 'none';
      undoBtn.style.display = 'inline-block';
      resetBtn.style.display = 'inline-block';
      leaveBtn.style.display = 'inline-block';

      gameState = null;
      stopTimer();
    });

    // Handle new game request
    socket.on('newGameRequest', ({ requesterName }) => {
      const message = document.getElementById('newGameRequestMessage');
      if (message) {
        message.textContent = `${requesterName} új játékot szeretne kezdeni.`;
      }
      newGameRequestModal.style.display = 'flex';
    });

    // Handle new game accepted
    socket.on('newGameAccepted', () => {
      closeVictoryModal();
      showMessage('🎮 Az ellenfél elfogadta! Új játék indul...');
    });

    // Handle new game declined
    socket.on('newGameDeclined', () => {
      showMessage('❌ Az ellenfél elutasította az új játék kérést');
    });

    // Handle undo request
    socket.on('undoRequested', () => {
      undoRequestModal.style.display = 'flex';
    });

    // Handle undo accepted
    socket.on('undoAccepted', () => {
      showMessage('✅ Visszavonás elfogadva!', 'success');
    });

    // Handle undo declined
    socket.on('undoDeclined', () => {
      showMessage('❌ Visszavonás elutasítva.', 'error');
    });

    // Setup admin listeners
    setupAdminListeners();

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      if (isLoggedIn) {
        showMessage('⚠️ Kapcsolat megszakadt... Újracsatlakozás...');
      }
    });
  }
}

function setupEventListeners() {
  // Room creation
  createRoomBtn.addEventListener('click', handleCreateRoom);

  // Game controls
  console.log('🔌 Setting up Undo button listener'); // DEBUG
  undoBtn.addEventListener('click', undoMove);
  resetBtn.addEventListener('click', resetGame);
  leaveBtn.addEventListener('click', leaveGame);
  leaveSpectatorBtn.addEventListener('click', handleLeaveSpectator);

  // Undo request modal buttons
  acceptUndoBtn.addEventListener('click', acceptUndo);
  declineUndoBtn.addEventListener('click', declineUndo);
  logoutBtn.addEventListener('click', handleLogout);
  viewStatsBtn.addEventListener('click', showStatsView);
  backToLobbyBtn.addEventListener('click', hideStatsView);

  // Profile button and back button
  const viewProfileBtn = document.getElementById('viewProfileBtn');
  const backToLobbyFromProfile = document.getElementById('backToLobbyFromProfile');

  if (viewProfileBtn) {
    viewProfileBtn.addEventListener('click', showPlayerProfile);
  }

  if (backToLobbyFromProfile) {
    backToLobbyFromProfile.addEventListener('click', () => {
      document.getElementById('profileView').style.display = 'none';
      lobby.style.display = 'flex';
    });
  }

  // Canvas events for both mouse and touch
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('touchstart', handleCanvasClick, { passive: false });

  // Victory modal controls
  if (victoryNewGameBtn) victoryNewGameBtn.addEventListener('click', requestNewGame);
  if (victoryLeaveBtn) victoryLeaveBtn.addEventListener('click', leaveGameFromVictory);

  // Defeat modal controls
  if (defeatNewGameBtn) defeatNewGameBtn.addEventListener('click', requestNewGame);
  if (defeatLeaveBtn) defeatLeaveBtn.addEventListener('click', leaveGameFromVictory);

  // New game request modal
  if (acceptNewGameBtn) acceptNewGameBtn.addEventListener('click', acceptNewGame);
  if (declineNewGameBtn) declineNewGameBtn.addEventListener('click', declineNewGame);

  // Message modal controls
  if (messageModalClose) messageModalClose.addEventListener('click', hideMessageModal);
  if (messageModalBtn) messageModalBtn.addEventListener('click', hideMessageModal);
  if (messageModal) {
    messageModal.addEventListener('click', (e) => {
      if (e.target === messageModal) hideMessageModal();
    });
  }

  // Chat controls
  if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // Lobby chat controls
  if (lobbyChatSendBtn) lobbyChatSendBtn.addEventListener('click', sendLobbyChatMessage);
  if (lobbyChatInput) {
    lobbyChatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendLobbyChatMessage();
    });
  }

  // Admin: Clear chat button
  const clearChatBtn = document.getElementById('clearChatBtn');
  if (clearChatBtn) {
    console.log('✅ clearChatBtn found in setupEventListeners');
    clearChatBtn.addEventListener('click', () => {
      console.log('🖱️ clearChatBtn clicked');
      if (confirm('Biztosan törölni szeretnéd a teljes chat előzményt?')) {
        console.log('📡 Emitting adminClearChat');
        socket.emit('adminClearChat');
      }
    });
  } else {
    console.warn('⚠️ clearChatBtn not found in setupEventListeners (might be hidden or not loaded yet)');
  }
}

// ============================================================================
// UNDO (LÉPÉS VISSZAVONÁSA)
// ============================================================================

function undoMove() {
  console.log('Undo button clicked!');
  if (!currentRoomId) {
    console.error('No currentRoomId!');
    return;
  }
  // Send request to server
  console.log('Sending requestUndo for room:', currentRoomId);
  socket.emit('requestUndo', { roomId: currentRoomId });
  showMessage('Visszavonási kérelem elküldve...', 'info');
}
window.undoMove = undoMove;

function acceptUndo() {
  if (!currentRoomId) return;
  socket.emit('acceptUndo', { roomId: currentRoomId });
  undoRequestModal.style.display = 'none';
}

function declineUndo() {
  if (!currentRoomId) return;
  socket.emit('declineUndo', { roomId: currentRoomId });
  undoRequestModal.style.display = 'none';
}

// Victory/Defeat modal control functions
function requestNewGame() {
  if (socket && currentRoomId) {
    // For AI vs AI games, directly reset the game
    if (gameState && gameState.gameMode === 'ai-vs-ai') {
      console.log('🔄 Resetting AI vs AI game');
      socket.emit('resetGame');
      closeVictoryModal();
      closeDefeatModal();
    } else {
      // For PvP games, request new game from opponent
      socket.emit('requestNewGame');
      closeVictoryModal();
      closeDefeatModal();
    }
  }
}

function acceptNewGame() {
  if (socket) {
    socket.emit('acceptNewGame');
    newGameRequestModal.style.display = 'none';
  }
}

function declineNewGame() {
  if (socket) {
    socket.emit('declineNewGame');
    newGameRequestModal.style.display = 'none';
  }
}

function leaveGameFromVictory() {
  closeVictoryModal();
  closeDefeatModal();
  leaveGame();
}

// Handle game over (victory/defeat)
function handleGameOver(winner) {
  console.log('=== GAME OVER ===');
  console.log('Winner:', winner);
  console.log('My Player ID:', myPlayerId);
  console.log('Players:', gameState?.players);
  console.log('Is Spectator:', isSpectator);

  // Stop the timer
  stopTimer();

  // Start winning animation if there's a winner
  if (winner) {
    startWinningAnimation();
  }

  // Show modals for players or AI vs AI games
  if (gameState && gameState.players) {
    const amIPlayer = !isSpectator && gameState.players.some(p => p.id === myPlayerId);
    const isAIvsAI = gameState.gameMode === 'ai-vs-ai';

    console.log('🔍 MODAL DEBUG:');
    console.log('  - Am I a player?', amIPlayer);
    console.log('  - Is AI vs AI?', isAIvsAI);
    console.log('  - gameMode:', gameState.gameMode);
    console.log('  - isSpectator:', isSpectator);
    console.log('  - winner:', winner);

    if (amIPlayer) {
      // I'm a player in the game
      if (winner) {
        // Check if I won or lost
        if (winner.id === myPlayerId) {
          // I won - show victory modal
          console.log('➡️ I WON! Showing victory modal');
          showVictoryModal(winner);
        } else {
          // I lost - show defeat modal
          console.log('➡️ I LOST! Showing defeat modal');
          showDefeatModal(winner);
        }
      } else {
        // Draw - show message modal
        console.log('➡️ DRAW! Showing message modal');
        showModalMessage('Döntetlen! 🤝', 'info');
      }
    } else if (isAIvsAI) {
      // AI vs AI game ended - show victory modal for anyone watching (creator, spectator, observer)
      console.log('➡️ AI vs AI game ended! Showing victory modal for observer/spectator');
      if (winner) {
        showVictoryModal(winner);
      } else {
        showModalMessage('Döntetlen az AI játékban! 🤝', 'info');
      }
    } else {
      console.log('➡️ Not showing modal - not a player and not AI vs AI');
    }
  }
}

// ============================================================================
// JÁTÉK LOGIKA FÜGGVÉNYEK
// ============================================================================

/**
 * Új szoba létrehozása a megadott paraméterekkel
 * @returns {void}
 * @emits createRoom - Socket.IO event {boardSize, gameMode}
 */
function handleCreateRoom() {
  // Explicitly get elements to ensure they exist
  const boardSizeEl = document.getElementById('boardSize');
  const gameModeEl = document.getElementById('gameMode');

  if (!boardSizeEl) {
    console.error('❌ boardSize element not found!');
    return;
  }

  const boardSize = parseInt(boardSizeEl.value);
  const gameMode = gameModeEl ? gameModeEl.value : 'pvp';

  console.log('🎲 Creating room with size:', boardSize, 'mode:', gameMode);

  if (!isLoggedIn) {
    showModalMessage('Kérlek először jelentkezz be!', 'warning');
    return;
  }

  socket.emit('createRoom', { boardSize, gameMode });
}

// Update rooms list
function updateRoomsList(rooms) {
  if (rooms.length === 0) {
    roomsListDiv.innerHTML = '<p class="no-rooms">Jelenleg nincsenek szobák...</p>';
    return;
  }

  roomsListDiv.innerHTML = '';
  rooms.forEach(room => {
    const roomDiv = document.createElement('div');
    roomDiv.className = 'room-item';

    const playersList = room.players.length > 0 ? room.players.join(', ') : `${room.creatorName} (Létrehozó)`;
    const statusClass = room.status === 'waiting' ? 'waiting' : 'in-progress';
    const statusText = room.status === 'waiting' ? 'Várakozik' : 'Játék folyamatban';

    // Check if current user is the creator
    const isCreator = room.creatorId === myPlayerId;

    // Action buttons
    let actionButtons = '';
    if (room.status === 'waiting') {
      const joinBtn = `<button class="btn btn-primary" onclick="joinExistingRoom('${room.roomId}')" style="width: auto; flex: 1;">Csatlakozás</button>`;
      const deleteBtn = isCreator
        ? `<button class="btn btn-danger" onclick="deleteMyRoom('${room.roomId}')" style="width: auto;">🗑️ Törlés</button>`
        : '';
      actionButtons = `<div style="display: flex; gap: 10px; margin-top: 10px;">${joinBtn}${deleteBtn}</div>`;
    } else {
      const watchBtn = `<button class="btn btn-secondary" onclick="watchGame('${room.roomId}')" style="flex: 1;">👁️ Megnézem (${room.spectatorCount || 0} néző)</button>`;

      // Allow creator OR ADMIN to delete AI vs AI room even if in progress
      const deleteBtn = ((isCreator || isAdmin) && room.gameMode === 'ai-vs-ai')
        ? `<button class="btn btn-danger" onclick="deleteMyRoom('${room.roomId}')" style="width: auto; margin-left: 10px;">🗑️ Törlés</button>`
        : '';

      actionButtons = `<div style="display: flex; margin-top: 10px;">${watchBtn}${deleteBtn}</div>`;
    }

    roomDiv.innerHTML = `
      <div class="room-header">
        <span class="room-id">🎮 ${room.roomId}</span>
        <span class="room-status ${statusClass}">${statusText}</span>
      </div>
      <div class="room-info">
        <span>👥 ${room.playerCount}/2 játékos</span>
        <span>📏 ${room.boardSize}x${room.boardSize}</span>
      </div>
      <div class="room-players">
        ${room.playerCount > 0 ? 'Játékosok: ' + playersList : 'Létrehozó: ' + room.creatorName}
      </div>
      ${actionButtons}
    `;
    roomsListDiv.appendChild(roomDiv);
  });
}

// Update lobby players list
function updateLobbyPlayersList(players) {
  if (lobbyOnlineCount) {
    lobbyOnlineCount.textContent = players.length;
  }

  if (!lobbyOnlinePlayersList) return;

  if (players.length === 0) {
    lobbyOnlinePlayersList.innerHTML = '<p class="no-players">Nincsenek online játékosok...</p>';
    return;
  }

  lobbyOnlinePlayersList.innerHTML = '';
  players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'lobby-player-item';

    const statusText = player.room ? `Játékban: ${player.room}` : 'Lobbiban';
    const isCurrentPlayer = player.socketId === socket.id;

    playerDiv.innerHTML = `
      <div class="lobby-player-info">
        <span class="lobby-player-name">${isCurrentPlayer ? '👤 ' : ''}${player.name}${isCurrentPlayer ? ' (Te)' : ''}</span>
        <span class="lobby-player-status">${statusText}</span>
      </div>
      ${isAdmin && !isCurrentPlayer ? `<button class="btn btn-danger" onclick="kickPlayerFromLobby('${player.socketId}')">Kick</button>` : ''}
    `;
    lobbyOnlinePlayersList.appendChild(playerDiv);
  });
}

// Kick player from lobby (admin only)
function kickPlayerFromLobby(socketId) {
  if (!isAdmin) return;
  if (confirm('Biztosan kickelni szeretnéd ezt a játékost?')) {
    socket.emit('adminKickPlayer', { targetSocketId: socketId });
  }
}

// Delete own waiting room
function deleteMyRoom(roomId) {
  if (confirm('Biztosan törölni szeretnéd ezt a szobát?')) {
    socket.emit('deleteRoom', { roomId });
  }
}

// Handle logout
function handleLogout() {
  if (confirm('Biztosan ki szeretnél lépni?')) {
    // Clear ALL saved login data
    localStorage.removeItem('playerName');
    localStorage.removeItem('playerPassword');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('currentRoomId');
    localStorage.removeItem('isSpectator');

    // Disconnect socket
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    // Redirect to landing page
    window.location.href = '/landing.html';
  }
}

// Show statistics view
function showStatsView() {
  lobby.style.display = 'none';
  statsView.style.display = 'block';

  // Request stats from server
  socket.emit('requestStats');
}

// Hide statistics view and return to lobby
function hideStatsView() {
  statsView.style.display = 'none';
  lobby.style.display = 'flex';
}

// Watch a game as spectator
function watchGame(roomId) {
  if (!isLoggedIn) {
    showModalMessage('Kérlek először jelentkezz be!', 'warning');
    return;
  }

  socket.emit('watchRoom', { roomId });
}

// Handle leave spectator mode
function handleLeaveSpectator() {
  if (confirm('Kilépés a nézői módból?')) {
    socket.emit('leaveSpectator');
  }
}

// Join existing room
function joinExistingRoom(roomId) {
  if (!isLoggedIn) {
    showModalMessage('Kérlek először jelentkezz be!', 'warning');
    return;
  }

  socket.emit('joinRoom', { roomId });

  // Set current room ID
  currentRoomId = roomId;

  // Show game area
  lobby.style.display = 'none';
  gameArea.style.display = 'block';
}

/**
 * Kilépés a jelenlegi játékból
 * @returns {void}
 * @emits leaveRoom - Socket.IO event
 */
function leaveGame() {
  // Notify server that player is leaving
  if (socket && currentRoomId) {
    socket.emit('leaveRoom');
  }

  // Clear room state from localStorage
  localStorage.removeItem('currentRoomId');
  localStorage.removeItem('isSpectator');

  stopTimer();
  clearChat();
  gameArea.style.display = 'none';
  lobby.style.display = 'flex';
  gameState = null;
  currentRoomId = null;
}

/**
 * Lépés visszavonása
 * @returns {void}
 * @emits undoMove - Socket.IO event
 */
function undoMove() {
  if (socket) {
    socket.emit('undoMove');
  }
}

/**
 * Új játék indítása ugyanabban a szobában
 * @returns {void}
 * @emits resetGame - Socket.IO event
 */
function resetGame() {
  if (socket) {
    socket.emit('resetGame');
  }
}

// Timer functions
let clientTimerEndTime = null;

function startTimer() {
  stopTimer();

  timerInterval = setInterval(() => {
    if (gameState && gameState.timerEnabled && clientTimerEndTime) {
      // Calculate remaining time from end time
      const remaining = Math.max(0, Math.ceil((clientTimerEndTime - Date.now()) / 1000));
      updateTimerDisplay(remaining);

      // If time is up, stop the interval
      if (remaining === 0) {
        stopTimer();
      }
    }
  }, 100); // Update every 100ms for smooth countdown
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay(seconds) {
  console.log('🕐 updateTimerDisplay called with seconds:', seconds);
  console.log('🕐 timerDiv:', timerDiv);
  console.log('🕐 timerDisplay:', timerDisplay);
  console.log('🕐 timerProgressFill:', timerProgressFill);

  if (seconds === null || seconds === undefined || !timerDiv) {
    console.log('🕐 Hiding timer - seconds or timerDiv is null');
    if (timerDiv) timerDiv.style.display = 'none';
    return;
  }

  console.log('🕐 Showing timer with', seconds, 'seconds');

  // Show timer
  timerDiv.style.display = 'block';

  // Update timer text
  if (timerDisplay) {
    timerDisplay.textContent = `${seconds}s`;
  }

  // Calculate progress percentage
  const totalDuration = gameState && gameState.timerDuration ? gameState.timerDuration : 60;
  const percentage = (seconds / totalDuration) * 100;

  console.log('🕐 Timer progress:', percentage + '%', 'of', totalDuration + 's');

  // Update progress bar width with proper display
  if (timerProgressFill) {
    timerProgressFill.style.width = `${percentage}%`;
    timerProgressFill.style.display = 'block'; // Ensure it's visible
    console.log('🕐 Progress bar width set to:', percentage + '%');
  }

  // Change color based on remaining time
  if (timerDisplay) {
    if (seconds <= 10) {
      timerDisplay.style.color = '#ffffff';
      timerDisplay.style.fontWeight = 'bold';
    } else if (seconds <= 30) {
      timerDisplay.style.color = '#ffffff';
      timerDisplay.style.fontWeight = 'normal';
    } else {
      timerDisplay.style.color = '#ffffff';
      timerDisplay.style.fontWeight = 'normal';
    }
  }
}

function handleCanvasClick(e) {
  if (!gameState || gameState.gameOver) return;

  // Prevent default touch behavior
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();

  // Get coordinates from either touch or mouse event
  let clientX, clientY;
  if (e.type.startsWith('touch')) {
    const touch = e.touches[0] || e.changedTouches[0];
    clientX = touch.clientX;
    clientY = touch.clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  // Calculate position relative to canvas, accounting for scaling
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  const col = Math.floor(x / CELL_SIZE);
  const row = Math.floor(y / CELL_SIZE);

  if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    socket.emit('makeMove', { row, col });
  }
}

function updateGameDisplay() {
  if (!gameState) return;

  // Update player info
  if (gameState.players.length >= 1) {
    const p1 = gameState.players[0];
    player1Info.querySelector('.player-name').textContent = p1.name;
    player1Info.classList.toggle('active', gameState.currentPlayer === 0 && !gameState.gameOver);
  }

  if (gameState.players.length >= 2) {
    const p2 = gameState.players[1];
    player2Info.querySelector('.player-name').textContent = p2.name;
    player2Info.classList.toggle('active', gameState.currentPlayer === 1 && !gameState.gameOver);
  } else {
    player2Info.querySelector('.player-name').textContent = 'Várakozás...';
  }

  // Update current turn message
  if (gameState.gameOver) {
    if (gameState.winner) {
      currentTurnDiv.textContent = `🏆 ${gameState.winner.name} nyert!`;
      currentTurnDiv.style.color = '#4CAF50';

      // Start winning animation
      startWinningAnimation();

      // Show victory or defeat modal (only for actual players in the game)
      // Check if I'm actually a player in this game (not spectator, not just watching)
      console.log('=== GAME OVER DEBUG ===');
      console.log('Winner:', gameState.winner);
      console.log('My Player ID:', myPlayerId);
      console.log('Players:', gameState.players);
      console.log('Is Spectator:', isSpectator);

      const amIPlayer = gameState.players.some(p => p.id === myPlayerId);
      console.log('Am I a player?', amIPlayer);

      if (amIPlayer) {
        // Check if I won or lost
        if (gameState.winner.id === myPlayerId) {
          // I won - show victory modal
          console.log('➡️ I WON! Showing victory modal');
          showVictoryModal(gameState.winner);
        } else {
          // I lost - show defeat modal
          console.log('➡️ I LOST! Showing defeat modal');
          showDefeatModal(gameState.winner);
        }
      } else {
        console.log('➡️ Not showing modal - not a player');
      }
    } else {
      currentTurnDiv.textContent = '🤝 Döntetlen!';
      currentTurnDiv.style.color = '#FF9800';
    }
  } else {
    // Stop winning animation if game is not over
    stopWinningAnimation();

    if (gameState.players.length < 2) {
      // Don't show waiting message in spectator mode
      if (!isSpectator) {
        currentTurnDiv.textContent = 'Várakozás másik játékosra...';
        currentTurnDiv.style.color = '#999';
      } else {
        currentTurnDiv.textContent = 'Játék hamarosan kezdődik...';
        currentTurnDiv.style.color = '#999';
      }
    } else {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      const prefix = isSpectator ? '👁️ ' : '';
      currentTurnDiv.textContent = `${prefix}${currentPlayer.name} következik (${currentPlayer.symbol})`;
      currentTurnDiv.style.color = '#667eea';
    }
  }

  // Update undo button
  if (undoBtn) {
    // Check if global undo is enabled (default to true if undefined)
    const isUndoEnabled = gameState.undoEnabled !== undefined ? gameState.undoEnabled : true;

    if (!isUndoEnabled) {
      undoBtn.disabled = true;
      undoBtn.title = "A visszavonás ki van kapcsolva";
    } else {
      undoBtn.title = "Lépés visszavonása";

      const isGameActive = !gameState.gameOver && gameState.players.length === 2;
      const amIPlayer = gameState.players.some(p => p.id === myPlayerId);

      if (!isGameActive || !amIPlayer || isSpectator) {
        undoBtn.disabled = true;
      } else {
        const myPlayerIndex = gameState.players.findIndex(p => p.id === myPlayerId);
        const isMyTurn = gameState.currentPlayer === myPlayerIndex;
        const isAIGame = gameState.players.some(p => p.isAI);

        if (isAIGame) {
          // Against AI: Always enabled if it's my turn (since AI moves instantly)
          // We undo both moves (AI's and mine)
          undoBtn.disabled = !isMyTurn;
        } else {
          // PvP: Enabled only if it is NOT my turn (meaning I just moved)
          // "Mindig csak annál legyen aktív aki gondolkodik" -> Aki vár (az ellenfél gondolkodik)
          undoBtn.disabled = isMyTurn;
        }
      }
    }
  }

  // Update timer
  if (gameState.timerEnabled) {
    timerDiv.style.display = 'flex'; // Always show if enabled

    if (gameState.timerRemaining !== null) {
      // Game is running, timer is active
      clientTimerEndTime = Date.now() + (gameState.timerRemaining * 1000);
      updateTimerDisplay(gameState.timerRemaining);
      if (!timerInterval) {
        startTimer();
      }
    } else {
      // Game waiting / not started yet
      // Show default state (full bar, max time)
      const duration = gameState.timerDuration || 60;
      timerDisplay.textContent = duration;
      if (timerProgressFill) {
        timerProgressFill.style.width = '100%';
        timerProgressFill.style.backgroundColor = '#4CAF50'; // Reset color
      }
      clientTimerEndTime = null;
      stopTimer();
    }
  } else {
    timerDiv.style.display = 'none';
    clientTimerEndTime = null;
    stopTimer();
  }

  // Draw the board
  drawBoard();
}

// Start winning animation
/**
 * Elindítja a nyerő animációt
 * @returns {void}
 * @global {number} animationInterval - Animation interval ID
 */
function startWinningAnimation() {
  if (animationInterval) return; // Already running

  animationInterval = setInterval(() => {
    winningAnimationFrame++;
    drawBoard();
  }, 50); // 20 FPS animation
}

// Stop winning animation
/**
 * Leállítja a nyerő animációt
 * @returns {void}
 * @global {number} animationInterval - Animation interval ID
 */
function stopWinningAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
    winningAnimationFrame = 0;
  }
}

// ============================================================================
// CANVAS RAJZOLÁS
// ============================================================================

/**
 * Rajzolja a játéktáblát (grid lines, star points)
 * @returns {void}
 * @global {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @global {number} BOARD_SIZE - Tábla méret
 * @global {number} CELL_SIZE - Cella pixel méret
 */
function drawBoard() {
  // Clear canvas
  ctx.fillStyle = '#fef8e8';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;

  for (let i = 0; i < BOARD_SIZE; i++) {
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
    ctx.stroke();

    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
    ctx.stroke();
  }

  // Draw star points (traditional Go board style)
  let starPoints = [];
  if (BOARD_SIZE === 9) {
    starPoints = [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
  } else if (BOARD_SIZE === 13) {
    starPoints = [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]];
  } else if (BOARD_SIZE === 15) {
    starPoints = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
  } else if (BOARD_SIZE === 19) {
    starPoints = [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
  }
  ctx.fillStyle = '#333';
  starPoints.forEach(([row, col]) => {
    ctx.beginPath();
    ctx.arc(col * CELL_SIZE + CELL_SIZE / 2, row * CELL_SIZE + CELL_SIZE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw pieces
  if (gameState && gameState.board) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = gameState.board[row][col];
        if (cell) {
          // Check if this piece is a winning piece
          const isWinningPiece = gameState.winningPieces &&
            gameState.winningPieces.some(([r, c]) => r === row && c === col);

          // Check if this is the last move
          const isLastMove = gameState.lastMove &&
            gameState.lastMove.row === row && gameState.lastMove.col === col;

          drawPiece(row, col, cell, isLastMove, isWinningPiece);
        }
      }
    }
  }
}

/**
 * Rajzol egy bábut a megadott pozícióra
 * @param {number} row - Sor index (0-based)
 * @param {number} col - Oszlop index (0-based)
 * @param {string} symbol - Szimbólum ('X' vagy 'O')
 * @param {boolean} [isLastMove=false] - Ez az utolsó lépés?
 * @param {boolean} [isWinning=false] - Része a nyerő sornak?
 * @param {number} [animFrame=0] - Animációs frame (0-1)
 * @returns {void}
 */
function drawPiece(row, col, symbol, isLastMove = false, isWinning = false, animFrame = 0) {
  const x = col * CELL_SIZE + CELL_SIZE / 2;
  const y = row * CELL_SIZE + CELL_SIZE / 2;
  let radius = CELL_SIZE / 2 - 5;

  // Pulsing effect for winning pieces
  if (isWinning) {
    const pulseScale = 1 + Math.sin(winningAnimationFrame * 0.15) * 0.15;
    radius = radius * pulseScale;
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  if (symbol === 'X') {
    // Black stone
    const gradient = ctx.createRadialGradient(x - 5, y - 5, 5, x, y, radius);
    if (isWinningPiece) {
      // Gold glow for winning piece
      gradient.addColorStop(0, '#FFD700');
      gradient.addColorStop(0.3, '#333');
      gradient.addColorStop(1, '#000');
    } else {
      gradient.addColorStop(0, '#555');
      gradient.addColorStop(1, '#000');
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = isWinningPiece ? '#FFD700' : '#000';
    ctx.lineWidth = isWinningPiece ? 4 : 2;
    ctx.stroke();
  } else {
    // White stone
    const gradient = ctx.createRadialGradient(x - 5, y - 5, 5, x, y, radius);
    if (isWinningPiece) {
      // Gold glow for winning piece
      gradient.addColorStop(0, '#FFD700');
      gradient.addColorStop(0.3, '#fff');
      gradient.addColorStop(1, '#ddd');
    } else {
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(1, '#ddd');
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = isWinningPiece ? '#FFD700' : '#999';
    ctx.lineWidth = isWinningPiece ? 4 : 2;
    ctx.stroke();
  }

  // Add extra glow effect for winning pieces
  if (isWinningPiece) {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw last move indicator (small red dot)
  if (isLastMove && !isWinningPiece) {
    ctx.fillStyle = '#FF4444';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Add white border for visibility
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Update player info display
function updatePlayerInfo(players) {
  if (!players || players.length === 0) return;

  // Update player 1 info
  if (players.length >= 1 && player1Info) {
    const p1 = players[0];
    const p1NameElem = player1Info.querySelector('.player-name');
    if (p1NameElem) {
      p1NameElem.textContent = p1.name || 'Várakozás...';
    }
    // Update active state for player 1
    if (gameState && !gameState.gameOver) {
      player1Info.classList.toggle('active', gameState.currentPlayer === 0);
    } else {
      player1Info.classList.remove('active');
    }
  }

  // Update player 2 info
  if (player2Info) {
    const p2NameElem = player2Info.querySelector('.player-name');
    if (players.length >= 2) {
      const p2 = players[1];
      if (p2NameElem) {
        p2NameElem.textContent = p2.name || 'Várakozás...';
      }
      // Update active state for player 2
      if (gameState && !gameState.gameOver) {
        player2Info.classList.toggle('active', gameState.currentPlayer === 1);
      } else {
        player2Info.classList.remove('active');
      }
    } else {
      if (p2NameElem) {
        p2NameElem.textContent = 'Várakozás...';
      }
      player2Info.classList.remove('active');
    }
  }
}

// Update turn indicator
function updateTurnIndicator(currentTurn) {
  if (!gameState || !currentTurnDiv) return;

  if (gameState.gameOver) {
    if (gameState.winner) {
      currentTurnDiv.textContent = `🏆 ${gameState.winner.name} nyert!`;
      currentTurnDiv.style.color = '#4CAF50';
    } else if (gameState.isDraw) {
      currentTurnDiv.textContent = '🤝 Döntetlen!';
      currentTurnDiv.style.color = '#FF9800';
    }
  } else {
    if (gameState.players && gameState.players.length >= 2) {
      // Use gameState.currentPlayer (which is the index) instead of parameter
      const currentPlayerIndex = gameState.currentPlayer !== undefined ? gameState.currentPlayer : currentTurn;
      const currentPlayer = gameState.players[currentPlayerIndex];
      const prefix = isSpectator ? '👁️ ' : '';
      currentTurnDiv.textContent = `${prefix}${currentPlayer.name} következik (${currentPlayer.symbol})`;
      currentTurnDiv.style.color = '#667eea';
    } else {
      currentTurnDiv.textContent = 'Várakozás másik játékosra...';
      currentTurnDiv.style.color = '#999';
    }
  }
}

// Show modal message
function showModalMessage(message, type = 'info') {
  console.log('==== showModalMessage START ====');
  console.log('Message:', message);
  console.log('Type:', type);
  console.log('messageModal:', messageModal);
  console.log('messageModalText:', messageModalText);
  console.log('messageModalText.textContent BEFORE:', messageModalText ? messageModalText.textContent : 'NULL');

  if (!messageModal || !messageModalText) {
    console.error('❌ messageModal or messageModalText is null!');
    return;
  }

  // Set icon and title based on type
  if (messageModalIcon) {
    switch (type) {
      case 'error':
        messageModalIcon.textContent = '❌';
        if (messageModalTitle) messageModalTitle.textContent = 'Hiba';
        break;
      case 'warning':
        messageModalIcon.textContent = '⚠️';
        if (messageModalTitle) messageModalTitle.textContent = 'Figyelmeztetés';
        break;
      case 'success':
        messageModalIcon.textContent = '✅';
        if (messageModalTitle) messageModalTitle.textContent = 'Siker';
        break;
      default:
        messageModalIcon.textContent = 'ℹ️';
        if (messageModalTitle) messageModalTitle.textContent = 'Üzenet';
    }
  }

  // Set message text
  console.log('Setting textContent to:', message);
  messageModalText.textContent = message;
  console.log('messageModalText.textContent AFTER:', messageModalText.textContent);
  console.log('messageModalText innerHTML:', messageModalText.innerHTML);

  // Show modal
  messageModal.style.display = 'flex';
  console.log('Modal displayed');

  // Check after a delay to see if something changes it
  setTimeout(() => {
    console.log('AFTER 100ms - messageModalText.textContent:', messageModalText.textContent);
  }, 100);

  console.log('==== showModalMessage END ====');
}

// Hide message modal
function hideMessageModal() {
  if (messageModal) {
    messageModal.style.display = 'none';
  }
}

// Show victory modal
function showVictoryModal(winner) {
  const victoryModal = document.getElementById('victoryModal');
  const victoryWinnerName = document.getElementById('victoryWinnerName');

  if (!victoryModal) return;

  if (victoryWinnerName) {
    victoryWinnerName.textContent = winner.name;
  }

  // Play victory sound
  sounds.win();

  // Show modal with animation
  victoryModal.style.display = 'flex';

  // Start confetti animation
  startConfetti();
}

// Show defeat modal
function showDefeatModal(winner) {
  const defeatModal = document.getElementById('defeatModal');
  const defeatWinnerName = document.getElementById('defeatWinnerName');

  if (!defeatModal) return;

  if (defeatWinnerName) {
    defeatWinnerName.textContent = winner.name;
  }

  // Show modal
  defeatModal.style.display = 'flex';
}

// Close victory modal
function closeVictoryModal() {
  const victoryModal = document.getElementById('victoryModal');
  if (victoryModal) {
    victoryModal.style.display = 'none';
  }
}

// Close defeat modal
function closeDefeatModal() {
  const defeatModal = document.getElementById('defeatModal');
  if (defeatModal) {
    defeatModal.style.display = 'none';
  }
}

// Simple confetti animation
function startConfetti() {
  const confettiContainer = document.getElementById('confettiContainer');
  if (!confettiContainer) return;

  confettiContainer.innerHTML = '';

  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti-piece';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.animationDelay = Math.random() * 3 + 's';
    confetti.style.backgroundColor = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'][Math.floor(Math.random() * 5)];
    confettiContainer.appendChild(confetti);
  }

  // Clear confetti after animation
  setTimeout(() => {
    confettiContainer.innerHTML = '';
  }, 5000);
}

function showMessage(msg) {
  messagesDiv.textContent = msg;
  setTimeout(() => {
    messagesDiv.textContent = '';
  }, 5000);
}

// Admin functionality
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminModal = document.getElementById('adminModal');
const adminCodeInput = document.getElementById('adminCodeInput');
const adminSubmitBtn = document.getElementById('adminSubmitBtn');
const closeModalBtn = document.querySelector('.close');
const adminPanel = document.getElementById('adminPanel');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const registeredUsersListDiv = document.getElementById('registeredUsersList');
const guestUsersListDiv = document.getElementById('guestUsersList');
const adminRoomsListDiv = document.getElementById('adminRoomsList');
const roomsCountSpan = document.getElementById('roomsCount');
const timerEnabledCheckbox = document.getElementById('timerEnabled');
const timerDurationInput = document.getElementById('timerDuration');
const timerStatusText = document.getElementById('timerStatusText');
const aiVsAiEnabledCheckbox = document.getElementById('aiVsAiEnabled');
const aiStatusText = document.getElementById('aiStatusText');
const adminUndoToggle = document.getElementById('adminUndoToggle');
const undoStatusText = document.getElementById('undoStatusText');
const clearStatsBtn = document.getElementById('clearStatsBtn');

// Admin modal controls
adminLoginBtn.addEventListener('click', () => {
  if (isAdmin) {
    // Admin user - direct access to admin panel
    adminPanel.style.display = 'block';
    adminLoginBtn.style.display = 'none';
    lobby.style.display = 'none';

    // Request data
    socket.emit('adminGetTimerSettings');
    socket.emit('adminGetOnlinePlayers');
  } else {
    // Not an admin user - show error
    sounds.error();
    alert('⛔ Nincs jogosultságod az admin panelhez! Csak admin felhasználók férhetnek hozzá.');
  }
});

closeModalBtn.addEventListener('click', () => {
  adminModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === adminModal) {
    adminModal.style.display = 'none';
  }
});

adminSubmitBtn.addEventListener('click', () => {
  const code = adminCodeInput.value.trim();
  if (code && socket) {
    // Security: Do not store admin code in localStorage
    socket.emit('adminLogin', { adminCode: code });
    adminCodeInput.value = ''; // Clear input after submit
  }
});

adminCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    adminSubmitBtn.click();
  }
});

adminLogoutBtn.addEventListener('click', () => {
  // DON'T set isAdmin = false! User is still logged in as admin
  // Just return to lobby while keeping admin privileges
  adminPanel.style.display = 'none';
  adminLoginBtn.style.display = 'block';
  lobby.style.display = 'flex';
});

// Auto-save timer settings when toggle changes
timerEnabledCheckbox.addEventListener('change', () => {
  const enabled = timerEnabledCheckbox.checked;
  const duration = parseInt(timerDurationInput.value);

  // Update status text
  if (timerStatusText) {
    timerStatusText.textContent = enabled ? 'Be' : 'Ki';
    timerStatusText.style.color = enabled ? '#2ecc71' : '#999';
  }

  socket.emit('adminSetTimer', { enabled, duration });
});

// Auto-save timer settings when duration changes
timerDurationInput.addEventListener('change', () => {
  const enabled = timerEnabledCheckbox.checked;
  const duration = parseInt(timerDurationInput.value);

  socket.emit('adminSetTimer', { enabled, duration });
});

// AI toggle handler - auto-save when toggled
if (aiVsAiEnabledCheckbox && aiStatusText) {
  aiVsAiEnabledCheckbox.addEventListener('change', () => {
    const isEnabled = aiVsAiEnabledCheckbox.checked;
    aiStatusText.textContent = isEnabled ? 'Be' : 'Ki';
    aiStatusText.style.color = isEnabled ? '#4CAF50' : '#999';

    socket.emit('adminSetAISettings', { aiVsAiEnabled: isEnabled });
  });
}

// Undo toggle handler
if (adminUndoToggle && undoStatusText) {
  adminUndoToggle.addEventListener('change', () => {
    const isEnabled = adminUndoToggle.checked;
    undoStatusText.textContent = isEnabled ? 'Be' : 'Ki';
    undoStatusText.style.color = isEnabled ? '#2ecc71' : '#999';

    socket.emit('updateUndoSettings', isEnabled);
  });
}

// Clear stats button handler
if (clearStatsBtn) {
  clearStatsBtn.addEventListener('click', () => {
    if (confirm('Biztosan törölni szeretnéd az összes statisztikát? Ez a művelet nem vonható vissza!')) {
      socket.emit('adminClearStats');
    }
  });
}

// Admin password change removed - use user management "Jelszó" button instead



// Handle admin login response
function setupAdminListeners() {
  socket.on('adminLoginSuccess', () => {
    isAdmin = true;
    localStorage.setItem('isAdminSession', 'true');
    adminModal.style.display = 'none';
    adminCodeInput.value = '';
    adminPanel.style.display = 'block';
    adminLoginBtn.style.display = 'none';
    lobby.style.display = 'none';
    gameArea.style.display = 'none';

    // Request timer settings
    socket.emit('adminGetTimerSettings');

    // Request online players for admin panel
    socket.emit('adminGetUserLists');
  });

  socket.on('adminLoginFailed', ({ error }) => {
    showModalMessage(error || 'Helytelen admin kód', 'error');
    adminCodeInput.value = '';
  });

  socket.on('adminUserLists', (lists) => {
    updateAdminUserLists(lists);
  });

  socket.on('roomsList', (rooms) => {
    if (isAdmin) {
      updateAdminRoomsList(rooms);
    }
    updateRoomsList(rooms);
  });

  socket.on('kicked', ({ message }) => {
    showModalMessage(message, 'warning');
    // Clear session to prevent auto-relogin
    localStorage.removeItem('playerName');
    localStorage.removeItem('isAdminSession');

    setTimeout(() => {
      location.reload();
    }, 2000);
  });

  socket.on('timerSettings', (settings) => {
    if (timerEnabledCheckbox && timerDurationInput) {
      timerEnabledCheckbox.checked = settings.enabled;
      timerDurationInput.value = settings.duration;

      // Update status text
      if (timerStatusText) {
        timerStatusText.textContent = settings.enabled ? 'Be' : 'Ki';
        timerStatusText.style.color = settings.enabled ? '#2ecc71' : '#999';
      }
    }
  });

  socket.on('aiSettings', (settings) => {
    if (aiVsAiEnabledCheckbox) {
      aiVsAiEnabledCheckbox.checked = settings.aiVsAiEnabled;
    }
  });

  socket.on('adminStats', (stats) => {
    console.log('📊 Admin stats received:', stats);

    // Update online players list
    if (stats.userLists) {
      updateAdminUserLists(stats.userLists);
    } else {
      // Fallback: request lists if not in stats
      socket.emit('adminGetUserLists');
    }

    // Update rooms list
    if (stats.rooms) {
      updateAdminRooms(stats.rooms);
      if (roomsCountSpan) {
        roomsCountSpan.textContent = stats.rooms.length;
      }
    }

    // Update Undo toggle
    if (stats.undoEnabled !== undefined && adminUndoToggle && undoStatusText) {
      adminUndoToggle.checked = stats.undoEnabled;
      undoStatusText.textContent = stats.undoEnabled ? 'Be' : 'Ki';
      undoStatusText.style.color = stats.undoEnabled ? '#2ecc71' : '#999';
    }
  });

  socket.on('gameStats', (stats) => {
    updateGameStats(stats);
    updateStatsView(stats);
  });
}

function updateAdminUserLists({ registered, guests }) {
  // 1. Registered Users
  if (registered.length === 0) {
    registeredUsersListDiv.innerHTML = '<p style="text-align: center; color: #999;">Nincs regisztrált felhasználó</p>';
  } else {
    registeredUsersListDiv.innerHTML = '';
    registered.forEach(user => {
      const div = document.createElement('div');
      div.className = 'admin-item';

      const statusColor = user.isOnline ? '#2ecc71' : '#95a5a6';
      const statusText = user.isOnline ? 'Online' : 'Offline';
      const rankBadge = `<span style="background: #667eea; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">${user.rank}</span>`;
      const scoreBadge = `<span style="background: #f1c40f; color: black; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">🏆 ${user.score || 0}</span>`;

      div.innerHTML = `
        <div class="admin-item-info">
          <span class="admin-item-name">
            ${user.isAdmin ? '🛡️ ' : ''}${user.name}
            ${rankBadge}
            ${scoreBadge}
          </span>
          <span class="admin-item-detail" style="color: ${statusColor}; font-weight: bold;">
            ${statusText} ${user.room ? `(Szoba: ${user.room})` : ''}
          </span>
        </div>
        ${user.isOnline && !user.isAdmin ? `<button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;" onclick="kickPlayer('${user.socketId}')">Kick</button>` : ''}
      `;
      registeredUsersListDiv.appendChild(div);
    });
  }

  // 2. Guest Users
  if (guests.length === 0) {
    guestUsersListDiv.innerHTML = '<p style="text-align: center; color: #999;">Nincs vendég</p>';
  } else {
    guestUsersListDiv.innerHTML = '';
    guests.forEach(user => {
      const div = document.createElement('div');
      div.className = 'admin-item';

      div.innerHTML = `
        <div class="admin-item-info">
          <span class="admin-item-name">${user.name}</span>
          <span class="admin-item-detail">Szoba: ${user.room || 'Lobby'}</span>
        </div>
        <button class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;" onclick="kickPlayer('${user.socketId}')">Kick</button>
      `;
      guestUsersListDiv.appendChild(div);
    });
  }
}

function updateAdminRoomsList(rooms) {
  roomsCountSpan.textContent = rooms.length;

  if (rooms.length === 0) {
    adminRoomsListDiv.innerHTML = '<p style="text-align: center; color: #999;">Nincs aktív szoba</p>';
    return;
  }

  adminRoomsListDiv.innerHTML = '';
  rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = 'admin-item';
    div.innerHTML = `
      <div class="admin-item-info">
        <span class="admin-item-name">🎮 ${room.roomId}</span>
        <span class="admin-item-detail">${room.playerCount}/2 játékos | ${room.boardSize}x${room.boardSize}</span>
      </div>
      <button class="btn btn-danger" onclick="closeRoom('${room.roomId}')">Bezár</button>
    `;
    adminRoomsListDiv.appendChild(div);
  });
}

function kickPlayer(socketId) {
  if (confirm('Biztosan kickelni szeretnéd ezt a játékost?')) {
    socket.emit('adminKickPlayer', { targetSocketId: socketId });
  }
}

function closeRoom(roomId) {
  if (confirm(`Biztosan bezárod a(z) "${roomId}" szobát?`)) {
    socket.emit('adminCloseRoom', { roomId });
  }
}

// Update game statistics in admin panel
function updateGameStats(stats) {
  console.log('📊 Updating game stats:', stats);

  const totalGamesEl = document.getElementById('totalGames');
  const activeGamesEl = document.getElementById('activeGames');
  const completedGamesEl = document.getElementById('completedGames');
  const playerWinsEl = document.getElementById('playerWins');

  if (totalGamesEl) totalGamesEl.textContent = stats.totalGames || 0;
  if (activeGamesEl) activeGamesEl.textContent = stats.activeGames || 0;
  if (completedGamesEl) completedGamesEl.textContent = stats.completedGames || 0;
  if (playerWinsEl) playerWinsEl.textContent = stats.playerWins || 0;
}

// Update stats view (detailed statistics page)
function updateStatsView(stats) {
  console.log('📈 Updating stats view:', stats);
  // This function can be extended if there's a detailed stats view
  // For now, it's a placeholder that does nothing
}

// ============================================================================
// MODAL ABLAKOK KEZELÉSE
// ============================================================================

/**
 * Megjeleníti a győzelem modalt konfetti effekttel
 * @param {Object} winner - A nyertes játékos objektum
 * @param {string} winner.name - A játékos neve
 * @param {string} winner.symbol - A játékos szimbóluma (X vagy O)
 * @returns {void}
 */
function showVictoryModal(winner) {
  console.log('🏆 showVictoryModal called with winner:', winner);
  const victoryModal = document.getElementById('victoryModal');
  const victoryWinnerName = document.getElementById('victoryWinnerName');

  console.log('Victory modal element:', victoryModal);
  console.log('Victory winner name element:', victoryWinnerName);

  if (!victoryModal || !victoryWinnerName) {
    console.error('❌ Victory modal elements not found!');
    return;
  }

  victoryWinnerName.textContent = winner.name;
  victoryModal.style.display = 'flex';
  console.log('✅ Victory modal displayed');

  // Create confetti effect
  createConfetti();
}

function closeVictoryModal() {
  const victoryModal = document.getElementById('victoryModal');
  if (victoryModal) {
    victoryModal.style.display = 'none';
    clearConfetti();
  }
}

/**
 * Megjeleníti a vereség modalt
 * @param {Object} winner - A nyertes ellenfél adatai
 * @param {string} winner.name - Az ellenfél neve
 * @returns {void}
 */
function showDefeatModal(winner) {
  console.log('😢 showDefeatModal called with winner:', winner);
  console.log('Defeat modal element:', defeatModal);

  if (!defeatModal) {
    console.error('❌ Defeat modal element not found!');
    return;
  }

  const defeatWinnerName = document.getElementById('defeatWinnerName');
  console.log('Defeat winner name element:', defeatWinnerName);

  if (defeatWinnerName) {
    defeatWinnerName.textContent = winner.name;
  }

  defeatModal.style.display = 'flex';
  console.log('✅ Defeat modal displayed');
}

/**
 * Bezárja a vereség modalt és törli a konfettit
 * @returns {void}
 */
function closeDefeatModal() {
  if (defeatModal) {
    defeatModal.style.display = 'none';
  }
}

/**
 * Megjelenít egy üzenet modalt (alert helyett)
 * @param {string} message - Az üzenet szövege
 * @param {'info'|'error'|'success'|'warning'} [type='info'] - Üzenet típusa
 * @returns {void}
 */
function showModalMessage(message, type = 'info') {
  if (!messageModal) return;

  const messageModalIcon = document.getElementById('messageModalIcon');
  const messageModalTitle = document.getElementById('messageModalTitle');
  const messageModalText = document.getElementById('messageModalText');
  const messageModalContent = messageModal.querySelector('.message-modal-content') || messageModal.querySelector('div');

  // Force styles (bypass CSS cache issues)
  messageModal.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
  messageModal.style.display = 'flex';
  messageModal.style.justifyContent = 'center';
  messageModal.style.alignItems = 'center';
  messageModal.style.zIndex = '2001';

  if (messageModalContent) {
    messageModalContent.style.backgroundColor = 'white';
    messageModalContent.style.padding = '40px 50px';
    messageModalContent.style.borderRadius = '20px';
    messageModalContent.style.textAlign = 'center';
    messageModalContent.style.color = '#333';
  }

  if (messageModalText) {
    messageModalText.style.color = '#555';
    messageModalText.style.fontSize = '18px';
    messageModalText.textContent = message;
  }

  // Set icon based on type
  let icon = 'ℹ️';
  let title = 'Üzenet';
  if (type === 'error') {
    icon = '❌';
    title = 'Hiba';
    if (messageModalIcon) messageModalIcon.className = 'message-modal-icon error';
  } else if (type === 'success') {
    icon = '✅';
    title = 'Siker';
    if (messageModalIcon) messageModalIcon.className = 'message-modal-icon success';
  } else if (type === 'warning') {
    icon = '⚠️';
    title = 'Figyelmeztetés';
    if (messageModalIcon) messageModalIcon.className = 'message-modal-icon warning';
  } else {
    if (messageModalIcon) messageModalIcon.className = 'message-modal-icon';
  }

  if (messageModalIcon) messageModalIcon.textContent = icon;
  if (messageModalTitle) messageModalTitle.textContent = title;

  messageModal.style.display = 'flex';
}

function hideMessageModal() {
  if (messageModal) {
    messageModal.style.display = 'none';
  }
}

// Request new game
function requestNewGame() {
  closeVictoryModal();
  closeDefeatModal();
  socket.emit('requestNewGame');
  showMessage('Új játék kérés elküldve...');
}

// Leave game from victory/defeat modal
function leaveGameFromVictory() {
  closeVictoryModal();
  closeDefeatModal();
  leaveGame();
}

// Accept new game request
function acceptNewGame() {
  newGameRequestModal.style.display = 'none';
  socket.emit('acceptNewGame');
}

// Decline new game request
function declineNewGame() {
  newGameRequestModal.style.display = 'none';
  socket.emit('declineNewGame');
  showMessage('Új játék kérés elutasítva');
}

// Confetti effect
function createConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;

  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
  const confettiCount = 100;

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 3 + 's';
    confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
    container.appendChild(confetti);
  }
}

function clearConfetti() {
  const container = document.getElementById('confettiContainer');
  if (container) {
    container.innerHTML = '';
  }
}

// Chat functions
function sendChatMessage() {
  const message = chatInput.value.trim();

  if (!message || !socket) return;

  socket.emit('chatMessage', { message });
  chatInput.value = '';
}

function addChatMessage(data) {
  const messageDiv = document.createElement('div');
  const isOwnMessage = data.senderId === socket.id;
  const isSystemMessage = data.senderId === 'system';

  messageDiv.className = `chat-message ${isSystemMessage ? 'system' : isOwnMessage ? 'own' : 'other'}`;

  if (!isSystemMessage) {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'chat-message-header';
    headerDiv.textContent = data.senderName;
    messageDiv.appendChild(headerDiv);
  }

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'chat-message-bubble';
  bubbleDiv.textContent = data.message;
  messageDiv.appendChild(bubbleDiv);

  chatMessages.appendChild(messageDiv);

  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearChat() {
  if (chatMessages) {
    chatMessages.innerHTML = '';
  }
}

// Chat event listeners
if (chatSendBtn) {
  chatSendBtn.addEventListener('click', sendChatMessage);
}

if (chatInput) {
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}

// Lobby chat functions
function sendLobbyChatMessage() {
  const message = lobbyChatInput.value.trim();

  if (!message || !socket) return;

  socket.emit('lobbyChatMessage', { message });
  lobbyChatInput.value = '';
}

function addLobbyChatMessage(data) {
  const messageDiv = document.createElement('div');
  const isOwnMessage = data.senderId === socket.id;
  const isBotMessage = data.senderId === 'bot';

  messageDiv.className = `chat-message ${isBotMessage ? 'bot' : isOwnMessage ? 'own' : 'other'}`;

  const headerDiv = document.createElement('div');
  headerDiv.className = 'chat-message-header';
  headerDiv.textContent = data.senderName;
  messageDiv.appendChild(headerDiv);

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'chat-message-bubble';
  bubbleDiv.textContent = data.message;
  messageDiv.appendChild(bubbleDiv);

  lobbyChatMessages.appendChild(messageDiv);

  // Auto-scroll to bottom
  lobbyChatMessages.scrollTop = lobbyChatMessages.scrollHeight;
}

// Lobby chat event listeners
if (lobbyChatSendBtn) {
  lobbyChatSendBtn.addEventListener('click', sendLobbyChatMessage);
}

if (lobbyChatInput) {
  lobbyChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendLobbyChatMessage();
    }
  });
}

// Start the game
init();

// Game Statistics Charts
let peakTimesChart = null;
let boardSizesChart = null;
let gameModesChart = null;
let resultsChart = null;

// Stats view charts (separate instances)
let statsPeakTimesChart = null;
let statsBoardSizesChart = null;
let statsGameModesChart = null;
let statsResultsChart = null;

function updateGameStats(stats) {
  // Update stat cards
  const totalGamesEl = document.getElementById('totalGames');
  if (totalGamesEl) totalGamesEl.textContent = stats.totalGames || 0;

  const activeGamesEl = document.getElementById('activeGames');
  if (activeGamesEl) activeGamesEl.textContent = stats.activeGames || 0;

  const completedGamesEl = document.getElementById('completedGames');
  if (completedGamesEl) completedGamesEl.textContent = stats.totalGamesCompleted || 0;

  const playerWinsEl = document.getElementById('playerWins');
  if (playerWinsEl) {
    playerWinsEl.textContent = stats.playerWins || 0;
  }

  // Update charts
  updatePeakTimesChart(stats.peakTimes);
  updateBoardSizesChart(stats.boardSizes);
  updateGameModesChart(stats.gameModes);
  updateResultsChart(stats);
}

// Update stats view (for public statistics page)
function updateStatsView(stats) {
  // Update stat cards
  const statsTotalGames = document.getElementById('statsTotalGames');
  const statsActiveGames = document.getElementById('statsActiveGames');
  const statsCompletedGames = document.getElementById('statsCompletedGames');
  const statsAiWinRate = document.getElementById('statsAiWinRate');

  if (statsTotalGames) statsTotalGames.textContent = stats.totalGames || 0;
  if (statsActiveGames) statsActiveGames.textContent = stats.activeGames || 0;
  if (statsCompletedGames) statsCompletedGames.textContent = stats.totalGamesCompleted || 0;

  // Calculate AI win rate
  const totalFinished = stats.playerWins + stats.aiWins;
  const aiWinRate = totalFinished > 0 ? Math.round((stats.aiWins / totalFinished) * 100) : 0;
  if (statsAiWinRate) statsAiWinRate.textContent = aiWinRate + '%';

  // Update charts
  updateStatsPeakTimesChart(stats.peakTimes);
  updateStatsBoardSizesChart(stats.boardSizes);
  updateStatsGameModesChart(stats.gameModes);
  updateStatsResultsChart(stats);
}

function updatePeakTimesChart(peakTimes) {
  const ctx = document.getElementById('peakTimesChart');
  if (!ctx) return;

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  if (peakTimesChart) {
    peakTimesChart.data.datasets[0].data = peakTimes;
    peakTimesChart.update();
  } else {
    peakTimesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Játékok száma',
          data: peakTimes,
          borderColor: 'rgb(102, 126, 234)',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }
}

function updateBoardSizesChart(boardSizes) {
  const ctx = document.getElementById('boardSizesChart');
  if (!ctx) return;

  const labels = Object.keys(boardSizes).map(size => `${size}x${size}`);
  const data = Object.values(boardSizes);

  if (boardSizesChart) {
    boardSizesChart.data.labels = labels;
    boardSizesChart.data.datasets[0].data = data;
    boardSizesChart.update();
  } else {
    boardSizesChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

function updateGameModesChart(gameModes) {
  const ctx = document.getElementById('gameModesChart');
  if (!ctx) return;

  const modeLabels = {
    'pvp': 'PvP',
    'ai-easy': 'AI Easy',
    'ai-medium': 'AI Medium',
    'ai-hard': 'AI Hard',
    'ai-vs-ai': 'AI vs AI'
  };

  const labels = Object.keys(gameModes).map(mode => modeLabels[mode] || mode);
  const data = Object.values(gameModes);

  if (gameModesChart) {
    gameModesChart.data.labels = labels;
    gameModesChart.data.datasets[0].data = data;
    gameModesChart.update();
  } else {
    gameModesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Játékok száma',
          data: data,
          backgroundColor: [
            'rgba(102, 126, 234, 0.8)',
            'rgba(118, 75, 162, 0.8)',
            'rgba(237, 100, 166, 0.8)',
            'rgba(255, 154, 158, 0.8)',
            'rgba(250, 208, 196, 0.8)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }
}

function updateResultsChart(stats) {
  const ctx = document.getElementById('resultsChart');
  if (!ctx) return;

  const data = [stats.playerWins || 0, stats.aiWins || 0, stats.draws || 0];

  if (resultsChart) {
    resultsChart.data.datasets[0].data = data;
    resultsChart.update();
  } else {
    resultsChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Játékos győzelem', 'AI győzelem', 'Döntetlen'],
        datasets: [{
          data: data,
          backgroundColor: [
            'rgba(75, 192, 192, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(255, 206, 86, 0.8)'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

// Stats view chart functions (duplicates for separate canvas instances)
function updateStatsPeakTimesChart(peakTimes) {
  const ctx = document.getElementById('statsPeakTimesChart');
  if (!ctx) return;

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

  if (statsPeakTimesChart) {
    statsPeakTimesChart.data.datasets[0].data = peakTimes;
    statsPeakTimesChart.update();
  } else {
    statsPeakTimesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Játékok száma',
          data: peakTimes,
          borderColor: 'rgb(102, 126, 234)',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }
}

function updateStatsBoardSizesChart(boardSizes) {
  const ctx = document.getElementById('statsBoardSizesChart');
  if (!ctx) return;

  const data = [boardSizes['9'] || 0, boardSizes['13'] || 0, boardSizes['15'] || 0, boardSizes['19'] || 0];

  if (statsBoardSizesChart) {
    statsBoardSizesChart.data.datasets[0].data = data;
    statsBoardSizesChart.update();
  } else {
    statsBoardSizesChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['9x9', '13x13', '15x15', '19x19'],
        datasets: [{
          data: data,
          backgroundColor: [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

function updateStatsGameModesChart(gameModes) {
  const ctx = document.getElementById('statsGameModesChart');
  if (!ctx) return;

  const labels = ['PvP', 'AI Könnyű', 'AI Közepes', 'AI Nehéz', 'AI vs AI'];
  const data = [
    gameModes['pvp'] || 0,
    gameModes['ai-easy'] || 0,
    gameModes['ai-medium'] || 0,
    gameModes['ai-hard'] || 0,
    gameModes['ai-vs-ai'] || 0
  ];

  if (statsGameModesChart) {
    statsGameModesChart.data.labels = labels;
    statsGameModesChart.data.datasets[0].data = data;
    statsGameModesChart.update();
  } else {
    statsGameModesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Játékok száma',
          data: data,
          backgroundColor: [
            'rgba(102, 126, 234, 0.8)',
            'rgba(118, 75, 162, 0.8)',
            'rgba(237, 100, 166, 0.8)',
            'rgba(255, 154, 158, 0.8)',
            'rgba(250, 208, 196, 0.8)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }
}

function updateStatsResultsChart(stats) {
  const ctx = document.getElementById('statsResultsChart');
  if (!ctx) return;

  const data = [stats.playerWins || 0, stats.aiWins || 0, stats.draws || 0];

  if (statsResultsChart) {
    statsResultsChart.data.datasets[0].data = data;
    statsResultsChart.update();
  } else {
    statsResultsChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Játékos győzelem', 'AI győzelem', 'Döntetlen'],
        datasets: [{
          data: data,
          backgroundColor: [
            'rgba(75, 192, 192, 0.8)',
            'rgba(255, 99, 132, 0.8)',
            'rgba(255, 206, 86, 0.8)'
          ],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

// Theme System
// Theme variables are declared at the top of the file (lines 70-72)

// Get CSS variable value
function getCSSVariable(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Load theme from localStorage
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const savedBoardTheme = localStorage.getItem('boardTheme') || 'wood';
  const savedPieceColor = localStorage.getItem('pieceColor') || 'classic';

  setTheme(savedTheme);
  setBoardTheme(savedBoardTheme);
  setPieceColor(savedPieceColor);
}

// Set main theme (dark/light)
function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  // Update all theme toggle buttons
  const themeToggleBtns = [
    document.getElementById('themeToggleBtn'),
    document.getElementById('themeToggleBtnLobby'),
    document.getElementById('themeToggleBtnGame')
  ];
  const icon = theme === 'dark' ? '☀️' : '🌓';
  themeToggleBtns.forEach(btn => {
    if (btn) {
      btn.textContent = icon;
    }
  });

  // Redraw board with new theme
  if (gameState) {
    drawBoard();
  }
}

// Toggle dark/light mode
function toggleTheme() {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

// Set board theme
function setBoardTheme(theme) {
  currentBoardTheme = theme;
  document.documentElement.setAttribute('data-board-theme', theme);
  localStorage.setItem('boardTheme', theme);

  // Update active state
  document.querySelectorAll('[data-board-theme]').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`[data-board-theme="${theme}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Redraw board
  if (gameState) {
    drawBoard();
  }
}

// Set piece color scheme
function setPieceColor(colorScheme) {
  currentPieceColor = colorScheme;
  document.documentElement.setAttribute('data-piece-color', colorScheme);
  localStorage.setItem('pieceColor', colorScheme);

  // Update active state
  document.querySelectorAll('[data-piece-color]').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`[data-piece-color="${colorScheme}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Redraw board
  if (gameState) {
    drawBoard();
  }
}

// Get star positions based on board size
function getStarPositions() {
  if (BOARD_SIZE === 9) {
    return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
  } else if (BOARD_SIZE === 13) {
    return [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]];
  } else if (BOARD_SIZE === 15) {
    return [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
  } else if (BOARD_SIZE === 19) {
    return [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
  }
  return [];
}

// Initialize theme system
function initThemeSystem() {
  // Load saved theme
  loadTheme();

  // Theme toggle buttons (login, lobby, game)
  const themeToggleBtns = [
    document.getElementById('themeToggleBtn'),
    document.getElementById('themeToggleBtnLobby'),
    document.getElementById('themeToggleBtnGame')
  ];
  themeToggleBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  });

  // Theme settings buttons (login, lobby, game)
  const themeSettingsBtns = [
    document.getElementById('themeSettingsBtn'),
    document.getElementById('themeSettingsBtnLobby'),
    document.getElementById('themeSettingsBtnGame')
  ];
  const themeModal = document.getElementById('themeModal');
  const themeClose = themeModal?.querySelector('.theme-close');

  themeSettingsBtns.forEach(btn => {
    if (btn && themeModal) {
      btn.addEventListener('click', () => {
        themeModal.style.display = 'flex';
      });
    }
  });

  if (themeClose && themeModal) {
    themeClose.addEventListener('click', () => {
      themeModal.style.display = 'none';
    });
  }

  // Board theme buttons
  document.querySelectorAll('[data-board-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-board-theme');
      setBoardTheme(theme);
    });
  });

  // Piece color buttons
  document.querySelectorAll('[data-piece-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      const colorScheme = btn.getAttribute('data-piece-color');
      setPieceColor(colorScheme);
    });
  });

  // Close modal on outside click
  window.addEventListener('click', (e) => {
    if (e.target === themeModal) {
      themeModal.style.display = 'none';
    }
  });
}

// Override drawBoard to use CSS variables
const originalDrawBoard = drawBoard;
drawBoard = function () {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Get colors from CSS variables
  const boardBg = getCSSVariable('--board-bg');
  const boardLine = getCSSVariable('--board-line');
  const boardStar = getCSSVariable('--board-star');

  // Draw background with gradient for depth
  const bgGradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  bgGradient.addColorStop(0, boardBg);
  bgGradient.addColorStop(1, shadeColor(boardBg, -10));
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw grid lines (at cell edges, not centers)
  ctx.strokeStyle = boardLine;
  ctx.lineWidth = 2;

  for (let i = 0; i <= BOARD_SIZE; i++) {
    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE);
    ctx.stroke();

    // Horizontal lines
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE);
    ctx.stroke();
  }

  // Draw star points in cell centers
  ctx.fillStyle = boardStar;
  const starPositions = getStarPositions();
  starPositions.forEach(([row, col]) => {
    const x = col * CELL_SIZE + CELL_SIZE / 2;
    const y = row * CELL_SIZE + CELL_SIZE / 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw pieces
  if (gameState && gameState.board) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = gameState.board[row][col];
        if (cell) {
          const isWinningPiece = gameState.winningPieces &&
            gameState.winningPieces.some(([r, c]) => r === row && c === col);
          const isLastMove = gameState.lastMove &&
            gameState.lastMove.row === row && gameState.lastMove.col === col;
          drawPiece(row, col, cell, isWinningPiece, isLastMove);
        }
      }
    }
  }
};

// Helper function to shade color
function shadeColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255))
    .toString(16).slice(1);
}

// Override drawPiece to use CSS variables
const originalDrawPiece = drawPiece;
drawPiece = function (row, col, symbol, isWinning = false, isLastMove = false) {
  const x = col * CELL_SIZE + CELL_SIZE / 2;
  const y = row * CELL_SIZE + CELL_SIZE / 2;
  const radius = CELL_SIZE * 0.4;

  // Get piece colors from CSS variables
  const player1Color = getCSSVariable('--piece-player1');
  const player2Color = getCSSVariable('--piece-player2');
  const shadowColor = getCSSVariable('--piece-shadow');

  const pieceColor = symbol === 'X' ? player1Color : player2Color;

  // Draw shadow
  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  // Draw piece with gradient
  const gradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
  gradient.addColorStop(0, lightenColor(pieceColor, 30));
  gradient.addColorStop(1, pieceColor);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Draw winning animation
  if (isWinning) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw last move indicator
  if (isLastMove && !isWinning) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
};

// Helper function to lighten color
function lightenColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ============================================================================
// ALKALMAZÁS INICIALIZÁLÁS
// ============================================================================

// Initialize the application when page loads

// ============================================================================
// EMOJI REAKCIÓK
// ============================================================================

function sendReaction(emoji) {
  if (!currentRoomId) return;

  // Show locally immediately
  showReaction(emoji);

  // Send to server
  if (socket) {
    socket.emit('sendReaction', { roomId: currentRoomId, emoji });
  }
}

function showReaction(emoji) {
  const overlay = document.getElementById('reactionOverlay');
  if (!overlay) return;

  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;

  // Random position around center (30% - 70%)
  const randomX = 30 + Math.random() * 40;
  const randomY = 30 + Math.random() * 40;

  el.style.left = `${randomX}%`;
  el.style.top = `${randomY}%`;

  overlay.appendChild(el);

  // Remove after animation
  setTimeout(() => {
    el.remove();
  }, 2000);
}

// Make globally available
window.sendReaction = sendReaction;

window.onload = init;

// ============================================================================
// PLAYER PROFILE FUNCTIONS
// ============================================================================

function showPlayerProfile() {
  if (!myPlayerName) {
    sounds.error();
    alert('Nincs bejelentkezve!');
    return;
  }

  // Hide lobby, show profile view
  lobby.style.display = 'none';
  document.getElementById('profileView').style.display = 'block';

  // Clear previous profile data (to avoid showing old user's data)
  document.getElementById('profilePlayerName').textContent = 'Töltés...';
  document.getElementById('profileRank').textContent = '...';
  document.getElementById('profileScore').textContent = '0';
  document.getElementById('statTotalGames').textContent = '0';
  document.getElementById('statWins').textContent = '0';
  document.getElementById('statLosses').textContent = '0';
  document.getElementById('statDraws').textContent = '0';
  document.getElementById('statWinRate').textContent = '0%';
  document.getElementById('statAvgMoves').textContent = '0';
  document.getElementById('statPvpWins').textContent = '0';
  document.getElementById('statPvpLosses').textContent = '0';
  document.getElementById('statAiEasy').textContent = '0';
  document.getElementById('statAiMedium').textContent = '0';
  document.getElementById('statAiHard').textContent = '0';
  document.getElementById('statAiLosses').textContent = '0';
  document.getElementById('statLongestStreak').textContent = '0';
  document.getElementById('statCurrentStreak').textContent = '0';
  document.getElementById('statFastestWin').textContent = '-';
  document.getElementById('boardPref9').style.width = '0%';
  document.getElementById('boardPref9Count').textContent = '0';
  document.getElementById('boardPref13').style.width = '0%';
  document.getElementById('boardPref13Count').textContent = '0';
  document.getElementById('boardPref15').style.width = '0%';
  document.getElementById('boardPref15Count').textContent = '0';
  document.getElementById('boardPref19').style.width = '0%';
  document.getElementById('boardPref19Count').textContent = '0';
  document.getElementById('statLastPlayed').textContent = 'Soha';

  // Request player stats from server
  socket.emit('requestPlayerProfile', { playerName: myPlayerName });
}

function displayPlayerProfile(profileData) {
  console.log('🔍 displayPlayerProfile called with:', profileData);
  const {name, rank, score, stats} = profileData;

  // Update profile header
  document.getElementById('profilePlayerName').textContent = name;
  document.getElementById('profileRank').textContent = rank || 'Újonc';
  document.getElementById('profileScore').textContent = score || 0;

  // Ensure stats exist
  if (!stats) {
    console.warn('❌ No stats available for player');
    return;
  }
  console.log('✅ Stats object:', stats);

  // Update overall stats
  document.getElementById('statTotalGames').textContent = stats.totalGames || 0;
  document.getElementById('statWins').textContent = stats.wins || 0;
  document.getElementById('statLosses').textContent = stats.losses || 0;
  document.getElementById('statDraws').textContent = stats.draws || 0;
  document.getElementById('statWinRate').textContent = (stats.winRate || 0) + '%';
  document.getElementById('statAvgMoves').textContent = stats.avgMovesPerGame || 0;

  // Update PvP stats
  document.getElementById('statPvpWins').textContent = stats.pvpWins || 0;
  document.getElementById('statPvpLosses').textContent = stats.pvpLosses || 0;

  // Update AI stats
  document.getElementById('statAiEasy').textContent = stats.aiEasyWins || 0;
  document.getElementById('statAiMedium').textContent = stats.aiMediumWins || 0;
  document.getElementById('statAiHard').textContent = stats.aiHardWins || 0;
  document.getElementById('statAiLosses').textContent = stats.aiLosses || 0;

  // Update achievements
  document.getElementById('statLongestStreak').textContent = stats.longestWinStreak || 0;
  document.getElementById('statCurrentStreak').textContent = stats.currentWinStreak || 0;
  document.getElementById('statFastestWin').textContent = stats.fastestWin ? `${stats.fastestWin} lépés` : '-';

  // Update board preferences
  const boardPrefs = stats.boardSizePreference || {'9': 0, '13': 0, '15': 0, '19': 0};
  const maxGames = Math.max(boardPrefs['9'], boardPrefs['13'], boardPrefs['15'], boardPrefs['19'], 1);

  ['9', '13', '15', '19'].forEach(size => {
    const count = boardPrefs[size] || 0;
    const percentage = maxGames > 0 ? (count / maxGames) * 100 : 0;

    document.getElementById(`boardPref${size}`).style.width = percentage + '%';
    document.getElementById(`boardPref${size}Count`).textContent = count;
  });

  // Update last played
  if (stats.lastPlayed) {
    const lastPlayed = new Date(stats.lastPlayed);
    const now = new Date();
    const diffMs = now - lastPlayed;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let lastPlayedText;
    if (diffMins < 1) {
      lastPlayedText = 'Most';
    } else if (diffMins < 60) {
      lastPlayedText = `${diffMins} perce`;
    } else if (diffHours < 24) {
      lastPlayedText = `${diffHours} órája`;
    } else {
      lastPlayedText = `${diffDays} napja`;
    }

    document.getElementById('statLastPlayed').textContent = lastPlayedText;
  } else {
    document.getElementById('statLastPlayed').textContent = 'Soha';
  }

  // Profile view is already visible (shown in showPlayerProfile)
  console.log('✅ Profile displayed successfully!');
}

// Socket event for receiving player profile
socket.on('playerProfile', (profileData) => {
  displayPlayerProfile(profileData);
});

socket.on('profileError', (error) => {
  sounds.error();
  alert('Hiba a profil betöltésekor: ' + error);
});


// ===== USER MANAGEMENT ADMIN FUNCTIONS =====

let selectedUsers = new Set();
let allUsers = [];

// Load users into admin cards
function loadUsersTable() {
  if (!socket || !isAdmin) return;

  // Show loading state
  const container = document.getElementById('userCardsContainer');
  if (container) {
    container.innerHTML = '<div class="user-cards-loading">⏳ Felhasználók betöltése...</div>';
  }

  console.log('📊 Loading all users...');
  socket.emit('adminGetAllUsers');
}

// Render users as cards
function renderUsersTable(users) {
  allUsers = users;
  const container = document.getElementById('userCardsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!users || users.length === 0) {
    container.innerHTML = '<div class="user-cards-empty">📭 Nincs felhasználó</div>';
    return;
  }

  // Sort users: Admins first, then by score
  const sortedUsers = [...users].sort((a, b) => {
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    return (b.score || 0) - (a.score || 0);
  });

  sortedUsers.forEach(user => {
    const card = document.createElement('div');
    card.className = 'user-card';

    // Add card classes for visual distinction
    if (user.isBanned) {
      card.classList.add('user-banned');
    } else if (user.isAdmin) {
      card.classList.add('user-admin');
    }

    const isOnline = Array.from(document.querySelectorAll('.online-player')).some(el =>
      el.textContent.includes(user.username)
    );

    const username = user.username.replace(/'/g, "\\'");

    card.innerHTML = `
      <input type="checkbox" class="user-card-checkbox user-checkbox" data-username="${username}" title="${user.isAdmin ? 'Admin felhasználó' : 'Kijelölés'}">

      <div class="user-card-header">
        <h3 class="user-card-name">${user.username}</h3>
        <div class="user-card-badges">
          ${user.isBanned ? '<span class="user-status status-banned">🚫 Bannolva</span>' : ''}
          ${user.isAdmin ? '<span class="user-status status-admin">👑 Admin</span>' : ''}
          ${isOnline ? '<span class="user-status status-online">🟢 Online</span>' : '<span class="user-status status-offline">⚫ Offline</span>'}
        </div>
      </div>

      <div class="user-card-body">
        <div class="user-card-field">
          <span class="user-card-label">Email</span>
          <span class="user-card-value">${user.email || '-'}</span>
        </div>
        <div class="user-card-field">
          <span class="user-card-label">Rang</span>
          <span class="user-card-value">${user.rank || 'Újonc'}</span>
        </div>
        <div class="user-card-field">
          <span class="user-card-label">Pontszám</span>
          <span class="user-card-value"><strong>${user.score || 0}</strong></span>
        </div>
        <div class="user-card-field">
          <span class="user-card-label">Játékok</span>
          <span class="user-card-value">${user.stats?.totalGames || 0}</span>
        </div>
      </div>

      <div class="user-card-actions">
        <button class="btn btn-info btn-sm" onclick="viewUserDetails('${username}')" title="Részletek">👁️</button>
        ${!user.isBanned ?
          `<button class="btn btn-warning btn-sm" onclick="openBanModal('${username}')" title="Bannolás">🚫</button>` :
          `<button class="btn btn-success btn-sm" onclick="unbanUser('${username}')" title="Unban">✅</button>`
        }
        <button class="btn btn-primary btn-sm" onclick="openResetPasswordModal('${username}')" title="Jelszó">🔑</button>
        <button class="btn btn-${user.isAdmin ? 'warning' : 'success'} btn-sm" onclick="toggleUserAdmin('${username}')" title="${user.isAdmin ? 'Admin ↓' : 'Admin ↑'}">
          ${user.isAdmin ? '👤' : '👑'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${username}')" title="Törlés">🗑️</button>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach checkbox event listeners
  document.querySelectorAll('.user-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleUserCheckbox);
  });

  console.log(`✅ ${sortedUsers.length} felhasználó betöltve (card view)`);
}

// Handle individual checkbox
function handleUserCheckbox(event) {
  const username = event.target.dataset.username;

  if (event.target.checked) {
    selectedUsers.add(username);
  } else {
    selectedUsers.delete(username);
  }

  updateBulkActionsBar();
}

// Handle select all button
const selectAllUsersBtn = document.getElementById('selectAllUsersBtn');
if (selectAllUsersBtn) {
  selectAllUsersBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.user-checkbox');

    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      const username = checkbox.dataset.username;
      selectedUsers.add(username);
    });

    updateBulkActionsBar();
  });
}

// Update bulk actions bar visibility and count
function updateBulkActionsBar() {
  const bulkActionsBar = document.getElementById('bulkActionsBar');
  const selectedCount = document.getElementById('selectedCount');

  if (selectedUsers.size > 0) {
    bulkActionsBar.style.display = 'flex';
    selectedCount.textContent = `${selectedUsers.size} kiválasztva`;
  } else {
    bulkActionsBar.style.display = 'none';
  }
}

// Deselect all
const deselectAllBtn = document.getElementById('deselectAllBtn');
if (deselectAllBtn) {
  deselectAllBtn.addEventListener('click', () => {
    selectedUsers.clear();
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
    updateBulkActionsBar();
  });
}

// View user details
function viewUserDetails(username) {
  if (!socket) return;
  socket.emit('adminGetUserDetails', { username });
}

// Display user details modal
function displayUserDetails(userDetails) {
  const modal = document.getElementById('userDetailsModal');
  const content = document.getElementById('userDetailsContent');

  if (!modal || !content) return;

  const activityLog = userDetails.activityLog || [];
  const stats = userDetails.stats || {};

  content.innerHTML = `
    <div class="user-details-section">
      <h3>📋 Alapadatok</h3>
      <div class="detail-row">
        <span class="detail-label">Felhasználónév:</span>
        <span class="detail-value"><strong>${userDetails.username}</strong></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Email:</span>
        <span class="detail-value">${userDetails.email || '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Rang:</span>
        <span class="detail-value">${userDetails.rank || 'Újonc'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Pontszám:</span>
        <span class="detail-value">${userDetails.score || 0}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Regisztráció:</span>
        <span class="detail-value">${userDetails.createdAt ? new Date(userDetails.createdAt).toLocaleString('hu-HU') : '-'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Utolsó belépés:</span>
        <span class="detail-value">${userDetails.lastLogin ? new Date(userDetails.lastLogin).toLocaleString('hu-HU') : 'Soha'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Admin:</span>
        <span class="detail-value">${userDetails.isAdmin ? '✅ Igen' : '❌ Nem'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Bannolva:</span>
        <span class="detail-value">${userDetails.isBanned ? '🚫 Igen' : '✅ Nem'}</span>
      </div>
      ${userDetails.isBanned ? `
        <div class="detail-row">
          <span class="detail-label">Ban indoka:</span>
          <span class="detail-value">${userDetails.banReason || '-'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Ban lejár:</span>
          <span class="detail-value">${userDetails.banExpiry ? new Date(userDetails.banExpiry).toLocaleString('hu-HU') : 'Végleges'}</span>
        </div>
      ` : ''}
    </div>

    <div class="user-details-section">
      <h3>📊 Statisztikák</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalGames || 0}</div>
          <div class="stat-label">Játékok</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.wins || 0}</div>
          <div class="stat-label">Győzelmek</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.losses || 0}</div>
          <div class="stat-label">Vereségek</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.winRate || 0}%</div>
          <div class="stat-label">Nyerési arány</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.longestWinStreak || 0}</div>
          <div class="stat-label">Legjobb sorozat</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.fastestWin || '-'}</div>
          <div class="stat-label">Leggyorsabb győzelem</div>
        </div>
      </div>
    </div>

    <div class="user-details-section">
      <h3>📝 Aktivitási napló (utolsó 20)</h3>
      ${activityLog.length === 0 ? '<p style="color: #999;">Nincs aktivitás</p>' : ''}
      ${activityLog.slice(-20).reverse().map(entry => `
        <div class="activity-log-entry action-${entry.action}">
          <div class="activity-timestamp">${new Date(entry.timestamp).toLocaleString('hu-HU')}</div>
          <div class="activity-action">${translateAction(entry.action)}</div>
          <div class="activity-details">${JSON.stringify(entry.details, null, 2)}</div>
        </div>
      `).join('')}
    </div>
  `;

  modal.style.display = 'flex';
}

function closeUserDetailsModal() {
  const modal = document.getElementById('userDetailsModal');
  if (modal) modal.style.display = 'none';
}

// Translate action names to Hungarian
function translateAction(action) {
  const translations = {
    'banned': '🚫 Bannolva',
    'unbanned': '✅ Ban feloldva',
    'password_reset': '🔑 Jelszó visszaállítva',
    'promoted_to_admin': '👑 Admin jogok megadva',
    'demoted_from_admin': '👤 Admin jogok elvéve',
    'ban_expired': '⏰ Ban lejárt',
    'login': '🔐 Belépés',
    'logout': '🚪 Kilépés',
    'game_won': '🏆 Játék megnyerve',
    'game_lost': '😞 Játék elvesztve'
  };
  return translations[action] || action;
}

// Ban user modal
let currentBanUsername = '';

function openBanModal(username) {
  currentBanUsername = username;
  document.getElementById('banUsername').textContent = username;
  document.getElementById('banReason').value = '';
  document.getElementById('banDuration').value = '';
  document.getElementById('banUserModal').style.display = 'flex';
}

function closeBanModal() {
  document.getElementById('banUserModal').style.display = 'none';
  currentBanUsername = '';
}

const confirmBanBtn = document.getElementById('confirmBanBtn');
if (confirmBanBtn) {
  confirmBanBtn.addEventListener('click', () => {
    const reason = document.getElementById('banReason').value.trim();
    const duration = document.getElementById('banDuration').value;

    if (!reason) {
      alert('Kérlek add meg a ban indokát!');
      return;
    }

    const durationMinutes = duration ? parseInt(duration) : null;

    if (socket) {
      socket.emit('adminBanUser', {
        username: currentBanUsername,
        reason,
        durationMinutes
      });
    }

    closeBanModal();
  });
}

// Unban user
function unbanUser(username) {
  if (!confirm(`Biztosan feloldod ${username} banját?`)) return;

  if (socket) {
    socket.emit('adminUnbanUser', { username });
  }
}

// Delete user
function deleteUser(username) {
  if (!confirm(`FIGYELEM! Biztosan TÖRÖLNI szeretnéd ${username} felhasználót? Ez a művelet NEM VISSZAVONHATÓ!`)) return;

  if (socket) {
    socket.emit('adminDeleteUser', { username });
  }
}

// Reset password modal
let currentResetPasswordUsername = '';

function openResetPasswordModal(username) {
  currentResetPasswordUsername = username;
  document.getElementById('resetPasswordUsername').textContent = username;
  document.getElementById('newUserPassword').value = '';
  document.getElementById('resetPasswordModal').style.display = 'flex';
}

function closeResetPasswordModal() {
  document.getElementById('resetPasswordModal').style.display = 'none';
  currentResetPasswordUsername = '';
}

const confirmResetPasswordBtn = document.getElementById('confirmResetPasswordBtn');
if (confirmResetPasswordBtn) {
  confirmResetPasswordBtn.addEventListener('click', () => {
    const newPassword = document.getElementById('newUserPassword').value;

    if (!newPassword || newPassword.length < 4) {
      alert('A jelszónak legalább 4 karakter hosszúnak kell lennie!');
      return;
    }

    if (socket) {
      socket.emit('adminResetPassword', {
        username: currentResetPasswordUsername,
        newPassword
      });
    }

    closeResetPasswordModal();
  });
}

// Toggle admin rights
function toggleUserAdmin(username) {
  if (!confirm(`Biztosan módosítod ${username} admin jogosultságait?`)) return;

  if (socket) {
    socket.emit('adminToggleAdmin', { username });
  }
}

// Bulk ban
const bulkBanBtn = document.getElementById('bulkBanBtn');
if (bulkBanBtn) {
  bulkBanBtn.addEventListener('click', () => {
    const reason = prompt('Add meg a ban indokát:');
    if (!reason) return;

    const duration = prompt('Időtartam percben (hagyd üresen a véglegeshez):');
    const durationMinutes = duration ? parseInt(duration) : null;

    const usernames = Array.from(selectedUsers);

    if (socket) {
      socket.emit('adminBulkBan', {
        usernames,
        reason,
        durationMinutes
      });
    }

    selectedUsers.clear();
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateBulkActionsBar();
  });
}

// Bulk delete
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
if (bulkDeleteBtn) {
  bulkDeleteBtn.addEventListener('click', () => {
    const usernames = Array.from(selectedUsers);

    if (!confirm(`FIGYELEM! Biztosan TÖRÖLNI szeretnéd a következő ${usernames.length} felhasználót?\n\n${usernames.join(', ')}\n\nEz a művelet NEM VISSZAVONHATÓ!`)) return;

    if (socket) {
      socket.emit('adminBulkDelete', { usernames });
    }

    selectedUsers.clear();
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = false);
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateBulkActionsBar();
  });
}

// Socket.IO listeners for admin responses
if (socket) {
  socket.on('userDetails', (userDetails) => {
    displayUserDetails(userDetails);
  });

  socket.on('adminActionSuccess', (data) => {
    alert(`✅ Művelet sikeres: ${data.action} - ${data.username}`);
    loadUsersTable(); // Reload table
  });

  socket.on('bulkActionResult', (results) => {
    alert(`✅ Bulk művelet eredménye:\n\nSikeres: ${results.success.length}\nSikertelen: ${results.failed.length}`);
    loadUsersTable(); // Reload table
  });

  socket.on('banned', (data) => {
    alert(`🚫 Bannolva lettél!\n\nIndok: ${data.reason}\n\nLejárat: ${data.expiry ? new Date(data.expiry).toLocaleString('hu-HU') : 'Végleges'}`);
    window.location.reload();
  });

  socket.on('accountDeleted', () => {
    alert('⚠️ A fiókod törölve lett az admin által!');
    localStorage.clear();
    window.location.reload();
  });

  socket.on('adminRightsChanged', (data) => {
    alert(`${data.isAdmin ? '👑 Admin jogokat kaptál!' : '👤 Admin jogokat elvesztettél!'}`);
    window.location.reload();
  });
}

// Load users table when admin panel opens
if (typeof adminPanel !== 'undefined' && adminPanel) {
  const adminPanelObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        if (adminPanel.style.display !== 'none' && isAdmin) {
          loadUsersTable();
        }
      }
    });
  });

  adminPanelObserver.observe(adminPanel, { attributes: true });
}

// Socket listener for all users response
if (socket) {
  socket.on('allUsers', (users) => {
    renderUsersTable(users);
  });
}
