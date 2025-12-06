// Multiplayer Snake IO Game Client
let socket;
let canvas, ctx;
let myPlayer = null;
let players = new Map();
let preyItems = [];
let canvasWidth = 1400;
let canvasHeight = 800;
let keys = {};
let ctrlPressed = false; // Track Ctrl key for snake highlighting
let shiftPressed = false; // Track Shift key for sprint
let lastUpdateTime = Date.now();
let gameActive = true;

// Mobile touch controls
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;
let isMobileDevice = false;

// Login screen
document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('loginScreen');
    const gameScreen = document.getElementById('gameScreen');
    const usernameInput = document.getElementById('usernameInput');
    const joinButton = document.getElementById('joinButton');
    
    // Detect mobile device
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     ('ontouchstart' in window) || 
                     (navigator.maxTouchPoints > 0);
    
    // Initialize canvas
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Adjust canvas size for mobile
    if (isMobileDevice) {
        const maxWidth = Math.min(window.innerWidth - 40, 800);
        const maxHeight = Math.min(window.innerHeight - 200, 600);
        canvasWidth = maxWidth;
        canvasHeight = maxHeight;
        
        // Add mobile control instructions
        const mobileHint = document.createElement('div');
        mobileHint.id = 'mobileHint';
        mobileHint.innerHTML = 'Tap left/right to turn, hold both sides to sprint';
        mobileHint.style.cssText = 'position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); color: white; background: rgba(0,0,0,0.7); padding: 10px 20px; border-radius: 10px; font-size: 14px; z-index: 1000; text-align: center;';
        document.body.appendChild(mobileHint);
        
        // Hide hint after 5 seconds
        setTimeout(() => {
            mobileHint.style.opacity = '0';
            mobileHint.style.transition = 'opacity 1s';
            setTimeout(() => mobileHint.remove(), 1000);
        }, 5000);
    }
    
    // Join game button
    joinButton.addEventListener('click', joinGame);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });
    
    function joinGame() {
        const username = usernameInput.value.trim() || 'Player';
        loginScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        initGame(username);
    }
});

function initGame(username) {
    // Connect to server
    socket = io();
    
    // Socket event listeners
    socket.on('init', (data) => {
        myPlayer = new Snake(
            data.player.id,
            data.player.username,
            data.player.x,
            data.player.y,
            data.player.color
        );
        myPlayer.angle = data.player.angle;
        myPlayer.score = data.player.score;
        myPlayer.targetLength = data.player.length;
        
        canvasWidth = data.canvasWidth;
        canvasHeight = data.canvasHeight;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        // Add other players
        data.players.forEach(p => {
            if (p.id !== myPlayer.id) {
                const snake = new Snake(p.id, p.username, p.x, p.y, p.color);
                snake.angle = p.angle;
                snake.score = p.score;
                snake.targetLength = p.length;
                players.set(p.id, snake);
            }
        });
        
        // Add prey
        preyItems = data.prey;
        
        // Start game loop
        setupControls();
        gameLoop();
    });
    
    socket.on('playerJoined', (player) => {
        const snake = new Snake(player.id, player.username, player.x, player.y, player.color);
        snake.angle = player.angle;
        snake.score = player.score;
        snake.targetLength = player.length;
        players.set(player.id, snake);
    });
    
    socket.on('playerLeft', (playerId) => {
        players.delete(playerId);
    });
    
    socket.on('gameState', (data) => {
        data.players.forEach(p => {
            if (p.id === myPlayer.id) {
                // Update my player from server (score and length only)
                myPlayer.score = p.score;
                myPlayer.targetLength = p.length;
            } else {
                let player = players.get(p.id);
                if (!player) {
                    player = new Snake(p.id, p.username, p.x, p.y, p.color);
                    players.set(p.id, player);
                }
                // Direct position update without interpolation
                player.x = p.x;
                player.y = p.y;
                player.angle = p.angle;
                player.score = p.score;
                player.targetLength = p.length;
                player.body = p.body || [];
            }
        });
        updateLeaderboard();
    });
    
    socket.on('preyCollected', (data) => {
        preyItems = preyItems.filter(p => p.id !== data.preyId);
        if (data.newPrey) {
            preyItems.push(data.newPrey);
        }
        
        if (data.playerId === myPlayer.id) {
            myPlayer.score = data.score;
            myPlayer.targetLength = data.length;
        } else {
            const player = players.get(data.playerId);
            if (player) {
                player.score = data.score;
                player.targetLength = data.length;
            }
        }
    });
    
    socket.on('preyUpdate', (prey) => {
        preyItems = prey;
    });
    
    socket.on('playerDamaged', (data) => {
        if (data.playerId === myPlayer.id) {
            myPlayer.targetLength = data.length;
            myPlayer.score = data.score;
        } else {
            const player = players.get(data.playerId);
            if (player) {
                player.targetLength = data.length;
                player.score = data.score;
            }
        }
    });
    
    socket.on('playerRespawned', (data) => {
        if (data.playerId === myPlayer.id) {
            // Show death screen with final stats
            showDeathScreen(myPlayer.body.length, myPlayer.score);
            
            // Respawn my player
            myPlayer.x = data.player.x;
            myPlayer.y = data.player.y;
            myPlayer.angle = data.player.angle;
            myPlayer.score = data.player.score;
            myPlayer.targetLength = data.player.length;
            myPlayer.body = [{ x: data.player.x, y: data.player.y }];
        } else {
            const player = players.get(data.playerId);
            if (player) {
                player.x = data.player.x;
                player.y = data.player.y;
                player.angle = data.player.angle;
                player.score = data.player.score;
                player.targetLength = data.player.length;
                player.body = [{ x: data.player.x, y: data.player.y }];
            }
        }
        updateLeaderboard();
    });
    
    // Join the game
    socket.emit('join', username);
}

function setupControls() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        // Track Ctrl key (Control for macOS, Control/Ctrl for Windows/Linux)
        if (e.key === 'Control' || e.ctrlKey) {
            ctrlPressed = true;
        }
        // Track Shift key for sprint
        if (e.key === 'Shift' || e.shiftKey) {
            shiftPressed = true;
        }
        e.preventDefault();
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
        // Track Ctrl key release
        if (e.key === 'Control' || !e.ctrlKey) {
            ctrlPressed = false;
        }
        // Track Shift key release
        if (e.key === 'Shift' || !e.shiftKey) {
            shiftPressed = false;
        }
        e.preventDefault();
    });
    
    // Mobile touch controls
    if (isMobileDevice) {
        let activeTouches = new Map();
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                activeTouches.set(touch.identifier, {
                    startX: touch.clientX,
                    startY: touch.clientY,
                    currentX: touch.clientX,
                    currentY: touch.clientY
                });
            }
            
            // Check for sprint (two fingers)
            if (activeTouches.size >= 2) {
                shiftPressed = true;
            }
        }, { passive: false });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                const touchData = activeTouches.get(touch.identifier);
                
                if (touchData && myPlayer) {
                    touchData.currentX = touch.clientX;
                    touchData.currentY = touch.clientY;
                    
                    // Calculate swipe direction for single touch
                    if (activeTouches.size === 1) {
                        const deltaX = touchData.currentX - touchData.startX;
                        const swipeThreshold = 10;
                        
                        if (Math.abs(deltaX) > swipeThreshold) {
                            if (deltaX > 0) {
                                keys['ArrowRight'] = true;
                                keys['ArrowLeft'] = false;
                            } else {
                                keys['ArrowLeft'] = true;
                                keys['ArrowRight'] = false;
                            }
                        }
                    }
                }
            }
        }, { passive: false });
        
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            
            // Remove ended touches
            const remainingTouches = new Set();
            for (let i = 0; i < e.touches.length; i++) {
                remainingTouches.add(e.touches[i].identifier);
            }
            
            activeTouches.forEach((value, key) => {
                if (!remainingTouches.has(key)) {
                    activeTouches.delete(key);
                }
            });
            
            // Release controls when no touches
            if (activeTouches.size === 0) {
                keys['ArrowLeft'] = false;
                keys['ArrowRight'] = false;
                shiftPressed = false;
            } else if (activeTouches.size < 2) {
                shiftPressed = false;
            }
        }, { passive: false });
        
        canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            activeTouches.clear();
            keys['ArrowLeft'] = false;
            keys['ArrowRight'] = false;
            shiftPressed = false;
        }, { passive: false });
    }
    
    // Handle visibility change to keep game running when tab is not active
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Tab is hidden but keep game running
            gameActive = true;
        } else {
            // Tab is visible
            gameActive = true;
            lastUpdateTime = Date.now(); // Reset time to prevent jumps
        }
    });
    
    // Handle window blur/focus
    window.addEventListener('blur', () => {
        // Keep game running even when window loses focus
        gameActive = true;
    });
    
    window.addEventListener('focus', () => {
        gameActive = true;
        lastUpdateTime = Date.now();
    });
}

class Snake {
    constructor(id, username, x, y, color) {
        this.id = id;
        this.username = username;
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.color = color;
        this.score = 0;
        this.body = [{ x, y }];
        this.targetLength = 5;
        this.speed = 3;
        this.turnSpeed = 0.08;
        this.segmentDistance = 8; // Smaller segments
        this.segmentSize = 5; // Smaller size (4-6px range)
        this.sprintSpeed = 6; // Sprint speed (2x normal)
        this.isSprinting = false;
        this.sprintTimer = 0; // Timer for sprint duration
        this.sprintDuration = 1.0; // Sprint lasts 1 second
        this.sprintCooldown = 0; // Cooldown timer
        this.sprintCooldownDuration = 5.0; // 5 second cooldown
        this.lengthReductionRate = 0.05; // Reduce length during sprint
    }
    
    update(deltaTime = 1) {
        // Handle input for my player
        if (this.id === myPlayer.id) {
            if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
                this.angle -= this.turnSpeed * deltaTime;
            }
            if (keys['ArrowRight'] || keys['d'] || keys['D']) {
                this.angle += this.turnSpeed * deltaTime;
            }
            
            // Sprint mechanics
            const timeInSeconds = deltaTime / 60; // Convert to seconds
            
            // Update cooldown timer
            if (this.sprintCooldown > 0) {
                this.sprintCooldown -= timeInSeconds;
                if (this.sprintCooldown < 0) this.sprintCooldown = 0;
            }
            
            // Check if can sprint: shift pressed, length > 5, and not in cooldown
            const canSprint = shiftPressed && this.targetLength > 5 && this.sprintCooldown <= 0;
            
            if (canSprint && !this.isSprinting) {
                // Start sprinting
                this.isSprinting = true;
                this.sprintTimer = this.sprintDuration;
            }
            
            if (this.isSprinting) {
                // Update sprint timer
                this.sprintTimer -= timeInSeconds;
                
                // Reduce length during sprint
                this.targetLength -= this.lengthReductionRate * deltaTime;
                this.targetLength = Math.max(5, this.targetLength);
                
                // Check if sprint duration ended
                if (this.sprintTimer <= 0) {
                    this.isSprinting = false;
                    this.sprintCooldown = this.sprintCooldownDuration; // Start cooldown
                }
            }
            
            // Stop sprinting if shift is released
            if (!shiftPressed && this.isSprinting) {
                this.isSprinting = false;
                this.sprintCooldown = this.sprintCooldownDuration; // Start cooldown
            }
            
            // Always move forward with sprint or normal speed
            const currentSpeed = this.isSprinting ? this.sprintSpeed : this.speed;
            this.x += Math.cos(this.angle) * currentSpeed * deltaTime;
            this.y += Math.sin(this.angle) * currentSpeed * deltaTime;
            
            // Screen wrapping
            this.x = ((this.x % canvasWidth) + canvasWidth) % canvasWidth;
            this.y = ((this.y % canvasHeight) + canvasHeight) % canvasHeight;
            
            // Update body
            this.updateBody();
            
            // Check prey collision
            this.checkPreyCollision();
            
            // Check other player collisions
            this.checkPlayerCollisions();
            
            // Send position to server
            socket.emit('move', {
                x: this.x,
                y: this.y,
                angle: this.angle,
                body: this.body.slice(0, 10) // Send limited body data
            });
        }
    }
    
    updateBody() {
        // Add head position
        this.body.unshift({ x: this.x, y: this.y });
        
        // Dynamic growth mechanics: faster initial growth, slower for longer snakes
        const growthRate = this.calculateGrowthRate();
        const currentLength = this.body.length;
        
        // Adjust body length based on target
        if (currentLength < this.targetLength * growthRate) {
            // Keep growing
        } else if (currentLength > this.targetLength) {
            // Trim excess
            this.body = this.body.slice(0, Math.ceil(this.targetLength));
        }
        
        // Maintain segment spacing
        const maxSegments = Math.ceil(this.targetLength * 1.5);
        if (this.body.length > maxSegments) {
            this.body.pop();
        }
        
        // Smooth body following
        for (let i = 1; i < this.body.length; i++) {
            const current = this.body[i];
            const target = this.body[i - 1];
            
            let dx = target.x - current.x;
            let dy = target.y - current.y;
            
            // Handle wrapping
            if (Math.abs(dx) > canvasWidth / 2) {
                dx = dx > 0 ? dx - canvasWidth : dx + canvasWidth;
            }
            if (Math.abs(dy) > canvasHeight / 2) {
                dy = dy > 0 ? dy - canvasHeight : dy + canvasHeight;
            }
            
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > this.segmentDistance) {
                const ratio = this.segmentDistance / distance;
                current.x = target.x - dx * ratio;
                current.y = target.y - dy * ratio;
                
                // Wrap coordinates
                current.x = ((current.x % canvasWidth) + canvasWidth) % canvasWidth;
                current.y = ((current.y % canvasHeight) + canvasHeight) % canvasHeight;
            }
        }
    }
    
    calculateGrowthRate() {
        // SIGNIFICANTLY enhanced growth: much faster and larger throughout
        // Growth multiplier: starts at 8x for small snakes, stays very high
        const length = this.body.length;
        if (length < 40) {
            return 8.0; // Extremely fast initial growth
        } else if (length < 80) {
            return 7.0; // Very fast growth
        } else if (length < 120) {
            return 6.0; // Fast growth
        } else if (length < 200) {
            return 5.5; // Moderate-fast growth
        } else {
            return 5.0; // Still fast growth even for long snakes
        }
    }
    
    checkPreyCollision() {
        preyItems.forEach(prey => {
            const dx = this.x - prey.x;
            const dy = this.y - prey.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < prey.size + 8) {
                socket.emit('collectPrey', prey.id);
            }
        });
    }
    
    checkPlayerCollisions() {
        players.forEach(player => {
            if (player.id === this.id) return;
            
            // Check collision with other player's body (skip first 3 segments to avoid head collisions)
            for (let i = 3; i < player.body.length; i++) {
                const segment = player.body[i];
                const dx = this.x - segment.x;
                const dy = this.y - segment.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 10) {
                    socket.emit('collision', { targetId: player.id, fatal: true });
                    return; // Exit immediately after collision
                }
            }
        });
        
        // Check collision with own body (self-collision after segment 5)
        for (let i = 5; i < this.body.length; i++) {
            const segment = this.body[i];
            const dx = this.x - segment.x;
            const dy = this.y - segment.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 8) {
                socket.emit('collision', { targetId: this.id, fatal: true });
                return; // Exit immediately after collision
            }
        }
    }
    
    draw(ctx, isMe = false) {
        // Apply special highlighting when Ctrl is pressed and this is my snake
        const isHighlighted = isMe && ctrlPressed;
        const isSprinting = isMe && this.isSprinting;
        
        // Draw body
        for (let i = this.body.length - 1; i >= 0; i--) {
            const segment = this.body[i];
            const alpha = Math.max(0.5, 1 - (i * 0.01));
            const size = i === 0 ? this.segmentSize + 2 : this.segmentSize;
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            
            // Enhanced visual effects for sprinting
            if (isSprinting) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#FFD700'; // Golden glow when sprinting
                
                // Draw sprint trail effect
                if (i < 5) {
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(segment.x, segment.y, size + 3, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else {
                ctx.shadowBlur = isHighlighted ? 25 : (isMe ? 10 : 5);
            }
            
            // Add extra visual emphasis when highlighted
            if (isHighlighted) {
                // Draw outer glow ring
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(segment.x, segment.y, size + 4, 0, Math.PI * 2);
                ctx.stroke();
                
                // Draw inner bright glow
                ctx.shadowColor = 'white';
            }
            
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, size, 0, Math.PI * 2);
            ctx.fill();
            
            // Head eyes
            if (i === 0) {
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'white';
                const eyeOffset = 3;
                const eyeSize = 1.5;
                
                ctx.beginPath();
                ctx.arc(
                    segment.x + Math.cos(this.angle + 0.5) * eyeOffset,
                    segment.y + Math.sin(this.angle + 0.5) * eyeOffset,
                    eyeSize, 0, Math.PI * 2
                );
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(
                    segment.x + Math.cos(this.angle - 0.5) * eyeOffset,
                    segment.y + Math.sin(this.angle - 0.5) * eyeOffset,
                    eyeSize, 0, Math.PI * 2
                );
                ctx.fill();
            }
            
            ctx.restore();
        }
        
        // Draw username above snake
        if (isMe || this.body.length > 0) {
            ctx.save();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 3;
            ctx.fillText(this.username, this.x, this.y - 15);
            ctx.restore();
        }
    }
}

function gameLoop() {
    // Calculate delta time for smooth animation
    const currentTime = Date.now();
    const deltaTime = Math.min((currentTime - lastUpdateTime) / 16.67, 2); // Cap at 2x normal speed
    lastUpdateTime = currentTime;
    
    // Update only if game is active or tab is visible
    if (myPlayer && gameActive) {
        myPlayer.update(deltaTime);
    }
    
    // Always draw even when tab is hidden (for smooth transitions)
    draw();
    
    requestAnimationFrame(gameLoop);
}

function draw() {
    // Clear canvas
    const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    
    for (let x = 0; x <= canvasWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }
    
    for (let y = 0; y <= canvasHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }
    
    // Draw prey
    preyItems.forEach(prey => {
        ctx.save();
        ctx.fillStyle = prey.color;
        ctx.shadowColor = prey.color;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.arc(prey.x, prey.y, prey.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(prey.x, prey.y, prey.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    });
    
    // Draw other players
    players.forEach(player => {
        player.draw(ctx, false);
    });
    
    // Draw my player on top
    if (myPlayer) {
        myPlayer.draw(ctx, true);
    }
}

function showDeathScreen(finalLength, finalScore) {
    const deathScreen = document.getElementById('deathScreen');
    const finalLengthSpan = document.getElementById('finalLength');
    const finalScoreSpan = document.getElementById('finalScore');
    
    // Update the death screen with final stats
    finalLengthSpan.textContent = finalLength;
    finalScoreSpan.textContent = finalScore;
    
    // Show the death screen
    deathScreen.classList.remove('hidden');
    
    // Hide after 2.5 seconds
    setTimeout(() => {
        deathScreen.classList.add('hidden');
    }, 2500);
}

function updateLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    
    // Collect all players
    const allPlayers = [];
    if (myPlayer) {
        allPlayers.push({
            id: myPlayer.id,
            username: myPlayer.username,
            score: myPlayer.score,
            length: myPlayer.body.length,
            color: myPlayer.color
        });
    }
    players.forEach(p => {
        allPlayers.push({
            id: p.id,
            username: p.username,
            score: p.score,
            length: p.body.length,
            color: p.color
        });
    });
    
    // Sort by score
    allPlayers.sort((a, b) => b.score - a.score);
    
    // Update display
    leaderboardList.innerHTML = '';
    allPlayers.forEach((player, index) => {
        const entry = document.createElement('div');
        entry.className = 'leaderboard-entry';
        if (myPlayer && player.id === myPlayer.id) {
            entry.classList.add('current-player');
        }
        
        const colorDiv = document.createElement('div');
        colorDiv.className = 'player-color';
        colorDiv.style.backgroundColor = player.color;
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'player-name';
        nameDiv.textContent = `${index + 1}. ${player.username}`;
        
        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'player-score';
        scoreDiv.textContent = `${player.score} (${player.length})`;
        
        entry.appendChild(colorDiv);
        entry.appendChild(nameDiv);
        entry.appendChild(scoreDiv);
        leaderboardList.appendChild(entry);
    });
}
