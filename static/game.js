document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const menuDiv = document.getElementById('menu');
  const gameDiv = document.getElementById('game');
  const createRoomBtn = document.getElementById('createRoom');
  const joinRoomBtn = document.getElementById('joinRoom');
  const roomInput = document.getElementById('roomInput');
  const playerNameInput = document.getElementById('playerName');
  const roomCodeSpan = document.getElementById('roomCode');
  const snakeIdSpan = document.getElementById('snakeId');
  const playerDisplayNameSpan = document.getElementById('playerDisplayName');
  const timeLeftSpan = document.getElementById('timeLeft');
  const scoresSpan = document.getElementById('scores');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Modal elements
  const winnerModal = document.getElementById('winnerModal');
  const winnerMessage = document.getElementById('winnerMessage');
  const highScoreMessage = document.getElementById('highScoreMessage');
  const modalClose = document.getElementById('modalClose');
  const restartBtn = document.getElementById('restartBtn');

  let roomCode = '';
  let snakeId = 0;
  let playerName = '';
  const cellSize = 20; // Each cell is 20x20 pixels
  const boardWidth = 30;
  const boardHeight = 30;
  
  // Touch variables
  let touchStartX = null;
  let touchStartY = null;
  let currentDirection = null;
  
  // Create mobile controls instruction element
  function createMobileControls() {
    // Only create if it doesn't exist already
    if (!document.getElementById('mobileControls')) {
      const mobileControls = document.createElement('div');
      mobileControls.id = 'mobileControls';
      mobileControls.innerHTML = 'Swipe to control your snake: ⬆️ Up, ⬇️ Down, ⬅️ Left, ➡️ Right';
      gameDiv.insertBefore(mobileControls, canvas);
    }
  }

  // Create a new room.
  createRoomBtn.addEventListener('click', () => {
    playerName = playerNameInput.value.trim() || 'Player';
    socket.emit('create_room', { name: playerName });
  });

  // Join an existing room.
  joinRoomBtn.addEventListener('click', () => {
    playerName = playerNameInput.value.trim() || 'Player';
    const code = roomInput.value.trim().toUpperCase();
    if (code) {
      socket.emit('join_room', { room: code, name: playerName });
    }
  });

  socket.on('room_created', (data) => {
    roomCode = data.room;
    snakeId = data.snake_id;
    roomCodeSpan.textContent = roomCode;
    snakeIdSpan.textContent = snakeId;
    playerDisplayNameSpan.textContent = playerName;
    menuDiv.style.display = 'none';
    gameDiv.style.display = 'block';
    // Setup for mobile if needed
    if (isMobileDevice()) {
      setupMobileControls();
    }
  });

  socket.on('room_joined', (data) => {
    roomCode = data.room;
    snakeId = data.snake_id;
    roomCodeSpan.textContent = roomCode;
    snakeIdSpan.textContent = snakeId;
    playerDisplayNameSpan.textContent = playerName;
    menuDiv.style.display = 'none';
    gameDiv.style.display = 'block';
    // Setup for mobile if needed
    if (isMobileDevice()) {
      setupMobileControls();
    }
  });

  socket.on('start_game', () => {
    console.log("Game Started");
  });

  socket.on('game_update', (state) => {
    timeLeftSpan.textContent = Math.floor(state.time_left);
    let scoreText = '';
    for (const [id, score] of Object.entries(state.points)) {
      const name = state.names[id] || `Snake ${id}`;
      scoreText += `${name}: ${score}  `;
    }
    scoresSpan.textContent = scoreText;
    drawGame(state);
  });

  socket.on('game_over', (state) => {
    // Determine the winner.
    let winnerText = '';
    if (state.winner === 'Tie') {
      winnerText = "It's a Tie!";
    } else {
      winnerText = `${state.winner} Wins!`;
    }
    // Save high score in localStorage.
    const myScore = state.points[snakeId] || 0;
    let highScore = localStorage.getItem('highScore_' + playerName) || 0;
    if (myScore > highScore) {
      localStorage.setItem('highScore_' + playerName, myScore);
      highScore = myScore;
    }
    winnerMessage.textContent = winnerText;
    highScoreMessage.textContent = `Your Score: ${myScore} | High Score: ${highScore}`;
    winnerModal.style.display = 'block';
  });

  modalClose.addEventListener('click', () => {
    winnerModal.style.display = 'none';
  });

  restartBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // Prevent default scrolling behavior for arrow keys.
  document.addEventListener('keydown', (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      let direction = null;
      if (e.key === 'ArrowUp') direction = 'UP';
      else if (e.key === 'ArrowDown') direction = 'DOWN';
      else if (e.key === 'ArrowLeft') direction = 'LEFT';
      else if (e.key === 'ArrowRight') direction = 'RIGHT';
      if (direction) {
        currentDirection = direction;
        socket.emit('change_direction', { room: roomCode, direction: direction });
      }
    }
  });
  
  // Mobile touch controls setup
  function setupMobileControls() {
    createMobileControls();
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Adjust canvas dimensions for mobile
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }
  
  function resizeCanvas() {
    // Get the device width
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    
    let canvasSize;
    if (viewportWidth < 768) {
      // On mobile, use smaller of width/height with padding
      canvasSize = Math.min(viewportWidth * 0.95, viewportHeight * 0.6);
    } else {
      // On desktop, maintain original proportions
      canvasSize = Math.min(600, viewportWidth * 0.9);
    }
    
    // Set canvas dimensions
    canvas.style.width = `${canvasSize}px`;
    canvas.style.height = `${canvasSize}px`;
  }
  
  function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }
  
  function handleTouchMove(e) {
    e.preventDefault(); // Prevent scrolling while playing
  }
  
  function handleTouchEnd(e) {
    e.preventDefault();
    if (!touchStartX || !touchStartY) return;
    
    const touch = e.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;
    
    // Calculate swipe distance
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    
    // Determine if swipe was significant enough (to avoid tiny movements)
    if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
      touchStartX = null;
      touchStartY = null;
      return;
    }
    
    // Determine swipe direction
    let newDirection;
    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Horizontal swipe
      newDirection = diffX > 0 ? 'RIGHT' : 'LEFT';
    } else {
      // Vertical swipe
      newDirection = diffY > 0 ? 'DOWN' : 'UP';
    }
    
    // Check for valid direction change (prevent 180-degree turns)
    const opposites = {
      'UP': 'DOWN',
      'DOWN': 'UP',
      'LEFT': 'RIGHT',
      'RIGHT': 'LEFT'
    };
    
    if (!currentDirection || newDirection !== opposites[currentDirection]) {
      currentDirection = newDirection;
      socket.emit('change_direction', { room: roomCode, direction: newDirection });
    }
    
    // Reset touch start points
    touchStartX = null;
    touchStartY = null;
  }
  
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth < 768;
  }

  function drawGame(state) {
    // Get actual canvas dimensions (may be different from initial settings)
    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    
    // Set drawing dimensions to match display dimensions
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Calculate cell size based on current canvas dimensions
    const actualCellWidth = canvasWidth / boardWidth;
    const actualCellHeight = canvasHeight / boardHeight;
    
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw the food.
    ctx.fillStyle = 'red';
    ctx.fillRect(
      state.food[0] * actualCellWidth, 
      state.food[1] * actualCellHeight, 
      actualCellWidth, 
      actualCellHeight
    );

    // Draw each snake.
    for (const [id, body] of Object.entries(state.snakes)) {
      ctx.fillStyle = (parseInt(id) === snakeId) ? 'green' : 'blue';
      body.forEach(segment => {
        ctx.fillRect(
          segment[0] * actualCellWidth, 
          segment[1] * actualCellHeight, 
          actualCellWidth, 
          actualCellHeight
        );
      });
    }
  }
});