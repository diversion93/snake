const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from parent directory
app.use(express.static(path.join(__dirname, '../..')));

const PORT = process.env.PORT || 3001;

// Game state
const players = new Map();
const preyItems = [];
const MAX_PLAYERS = 20;
const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 800;
const ADMIN_CODE = '19931993';
let gamePaused = false;
console.log('[SERVER INIT] gamePaused initialized to:', gamePaused);

// Generate random color
function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 60%)`;
}

// Generate random position
function randomPosition() {
  return {
    x: Math.random() * (CANVAS_WIDTH - 100) + 50,
    y: Math.random() * (CANVAS_HEIGHT - 100) + 50
  };
}

// Generate prey
function generatePrey() {
  const colors = [
    { color: '#ffeb3b', points: 10 },
    { color: '#4caf50', points: 20 },
    { color: '#2196f3', points: 30 },
    { color: '#9c27b0', points: 50 },
    { color: '#ff9800', points: 100 }
  ];
  
  const numPrey = Math.max(10, players.size * 2);
  preyItems.length = 0;
  
  for (let i = 0; i < numPrey; i++) {
    const type = colors[Math.floor(Math.random() * colors.length)];
    const pos = randomPosition();
    preyItems.push({
      id: `prey_${i}_${Date.now()}`,
      x: pos.x,
      y: pos.y,
      color: type.color,
      points: type.points,
      size: 6
    });
  }
}

// Initialize prey
generatePrey();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);
  
  // Handle player join
  socket.on('join', (data) => {
    if (players.size >= MAX_PLAYERS) {
      socket.emit('error', 'Game is full');
      return;
    }
    
    // Handle both old string format and new object format
    const username = typeof data === 'string' ? data : (data.username || `Player${players.size + 1}`);
    const adminCode = typeof data === 'object' ? data.adminCode : '';
    
    // Validate admin code
    const isAdmin = adminCode === ADMIN_CODE;
    
    const pos = randomPosition();
    const player = {
      id: socket.id,
      username: username,
      x: pos.x,
      y: pos.y,
      angle: Math.random() * Math.PI * 2,
      color: randomColor(),
      score: 0,
      length: 5,
      body: [{ x: pos.x, y: pos.y }],
      speed: 3,
      isAdmin: isAdmin
    };
    
    players.set(socket.id, player);
    
    // Send game state to new player
    socket.emit('init', {
      playerId: socket.id,
      player: player,
      players: Array.from(players.values()),
      prey: preyItems,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT
    });
    
    // Send admin status and current game state
    socket.emit('adminStatus', { isAdmin: isAdmin });
    
    // Send current pause state to new player
    console.log(`[SERVER] Sending gamePaused state to ${socket.id}: ${gamePaused}`);
    socket.emit('gamePaused', { paused: gamePaused });
    
    // Notify other players
    socket.broadcast.emit('playerJoined', player);
    
    console.log(`Player ${player.username} joined${isAdmin ? ' (ADMIN)' : ''}. Total players: ${players.size}`);
  });
  
  // Handle player movement
  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    player.angle = data.angle;
    player.x = data.x;
    player.y = data.y;
    player.body = data.body;
  });
  
  // Handle prey collection
  socket.on('collectPrey', (preyId) => {
    const preyIndex = preyItems.findIndex(p => p.id === preyId);
    if (preyIndex === -1) return;
    
    const prey = preyItems[preyIndex];
    const player = players.get(socket.id);
    if (!player) return;
    
    player.score += prey.points;
    player.length += 1;
    
    // Remove collected prey
    preyItems.splice(preyIndex, 1);
    
    // Generate new prey if needed
    if (preyItems.length < players.size * 2) {
      const colors = [
        { color: '#ffeb3b', points: 10 },
        { color: '#4caf50', points: 20 },
        { color: '#2196f3', points: 30 },
        { color: '#9c27b0', points: 50 },
        { color: '#ff9800', points: 100 }
      ];
      const type = colors[Math.floor(Math.random() * colors.length)];
      const pos = randomPosition();
      preyItems.push({
        id: `prey_${Date.now()}_${Math.random()}`,
        x: pos.x,
        y: pos.y,
        color: type.color,
        points: type.points,
        size: 6
      });
    }
    
    // Broadcast prey collection
    io.emit('preyCollected', {
      playerId: socket.id,
      preyId: preyId,
      newPrey: preyItems[preyItems.length - 1],
      score: player.score,
      length: player.length
    });
  });
  
  // Handle player collision (damage or death)
  socket.on('collision', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    if (data.fatal) {
      // Fatal collision - respawn the player
      const pos = randomPosition();
      player.x = pos.x;
      player.y = pos.y;
      player.angle = Math.random() * Math.PI * 2;
      player.score = Math.max(0, Math.floor(player.score * 0.5)); // Lose half score
      player.length = 5; // Reset length
      player.body = [{ x: pos.x, y: pos.y }];
      
      io.emit('playerRespawned', {
        playerId: socket.id,
        player: {
          id: player.id,
          username: player.username,
          x: player.x,
          y: player.y,
          angle: player.angle,
          score: player.score,
          length: player.length,
          color: player.color
        }
      });
    } else {
      // Non-fatal collision - reduce length
      player.length = Math.max(3, player.length - 2);
      player.score = Math.max(0, player.score - 10);
      
      io.emit('playerDamaged', {
        playerId: socket.id,
        length: player.length,
        score: player.score
      });
    }
  });
  
  // Handle resume request from any player
  socket.on('requestResume', () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    // Allow any player to resume the game when paused
    if (gamePaused) {
      console.log(`[SERVER] Resume requested by ${player.username}. Resuming game...`);
      gamePaused = false;
      io.emit('gamePaused', { paused: false });
      console.log(`Game resumed by ${player.username}`);
    }
  });
  
  // Handle admin actions
  socket.on('adminAction', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.isAdmin) {
      console.log(`Unauthorized admin action attempt from ${socket.id}`);
      return;
    }
    
    switch (data.type) {
      case 'togglePause':
        console.log(`[SERVER] togglePause called. Current state: ${gamePaused}, New state: ${!gamePaused}`);
        gamePaused = !gamePaused;
        console.log(`[SERVER] Broadcasting gamePaused state to all clients: ${gamePaused}`);
        io.emit('gamePaused', { paused: gamePaused });
        console.log(`Game ${gamePaused ? 'paused' : 'resumed'} by admin ${player.username}`);
        break;
        
      case 'renamePlayer':
        const targetPlayer = players.get(data.playerId);
        if (targetPlayer && data.newName) {
          const oldName = targetPlayer.username;
          targetPlayer.username = data.newName.trim().substring(0, 15);
          io.emit('playerRenamed', {
            playerId: data.playerId,
            newName: targetPlayer.username
          });
          console.log(`Admin ${player.username} renamed ${oldName} to ${targetPlayer.username}`);
        }
        break;
        
      default:
        console.log(`Unknown admin action: ${data.type}`);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`Player ${player.username} disconnected`);
      players.delete(socket.id);
      io.emit('playerLeft', socket.id);
      
      // Reset pause state if no players remain
      if (players.size === 0 && gamePaused) {
        console.log('[SERVER] All players disconnected, resetting gamePaused to false');
        gamePaused = false;
      }
      
      // Regenerate prey based on new player count
      if (players.size > 0) {
        generatePrey();
        io.emit('preyUpdate', preyItems);
      }
    }
  });
});

// Broadcast game state periodically (10 times per second)
setInterval(() => {
  if (players.size > 0) {
    io.emit('gameState', {
      players: Array.from(players.values()).map(p => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        angle: p.angle,
        color: p.color,
        score: p.score,
        length: p.length,
        body: p.body
      }))
    });
  }
}, 100);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
