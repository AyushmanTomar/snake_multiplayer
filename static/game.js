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
    });
  
    socket.on('room_joined', (data) => {
      roomCode = data.room;
      snakeId = data.snake_id;
      roomCodeSpan.textContent = roomCode;
      snakeIdSpan.textContent = snakeId;
      playerDisplayNameSpan.textContent = playerName;
      menuDiv.style.display = 'none';
      gameDiv.style.display = 'block';
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
          socket.emit('change_direction', { room: roomCode, direction: direction });
        }
      }
    });
  
    function drawGame(state) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  
      // Draw the food.
      ctx.fillStyle = 'red';
      ctx.fillRect(state.food[0] * cellSize, state.food[1] * cellSize, cellSize, cellSize);
  
      // Draw each snake.
      for (const [id, body] of Object.entries(state.snakes)) {
        ctx.fillStyle = (parseInt(id) === snakeId) ? 'green' : 'blue';
        body.forEach(segment => {
          ctx.fillRect(segment[0] * cellSize, segment[1] * cellSize, cellSize, cellSize);
        });
      }
    }
  });
  