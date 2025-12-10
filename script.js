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
let isAdmin = false;
let gamePaused = false;
console.log('[CLIENT INIT] gamePaused initialized to:', gamePaused);

// Mobile touch controls
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;
let isMobileDevice = false;
let joystickActive = false;
let joystickAngle = 0;
let joystickMagnitude = 0;

// Admin code validation
const ADMIN_CODE = '19931993';
const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_ATTEMPT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

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
        mobileHint.innerHTML = 'Use joystick to move, push far to sprint (needs length > 10)';
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
        const adminCode = document.getElementById('adminCodeInput').value.trim();
        
        loginScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        initGame(username, adminCode);
    }
});

function initGame(username, adminCode = '') {
    // Connect to server
    socket = io();
    
    // Validate admin code locally before sending
    if (adminCode) {
        if (!validateAdminCodeAttempt(adminCode)) {
            alert('Too many admin code attempts. Please wait before trying again.');
            adminCode = '';
        }
    }
    
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
        setupMobileJoystick();
        setupAdminSocketListeners();
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
    socket.emit('join', { username, adminCode });
}

function setupControls() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        // Handle ESC or Enter to resume game when paused
        if (gamePaused && (e.key === 'Escape' || e.key === 'Enter')) {
            console.log('[CLIENT] Resume key pressed:', e.key);
            if (isAdmin) {
                // Admin can toggle pause
                socket.emit('adminAction', { type: 'togglePause' });
            } else {
                // Non-admin can request resume (server will handle permission check)
                socket.emit('requestResume');
            }
            e.preventDefault();
            return;
        }
        
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
            
            // Check if can sprint: shift pressed, length > 10 (safer threshold), and not in cooldown
            const canSprint = shiftPressed && this.targetLength > 10 && this.sprintCooldown <= 0;
            
            if (canSprint && !this.isSprinting) {
                // Start sprinting
                this.isSprinting = true;
                this.sprintTimer = this.sprintDuration;
            }
            
            if (this.isSprinting) {
                // Update sprint timer
                this.sprintTimer -= timeInSeconds;
                
                // Dynamic length reduction: gentler for smaller snakes
                const currentLength = this.body.length;
                let lengthReduction = this.lengthReductionRate;
                
                // Reduce length reduction rate for smaller snakes
                if (currentLength < 30) {
                    lengthReduction = this.lengthReductionRate * 0.3; // 70% slower for small snakes
                } else if (currentLength < 60) {
                    lengthReduction = this.lengthReductionRate * 0.6; // 40% slower for medium snakes
                }
                
                // Apply length reduction with safer minimum
                this.targetLength -= lengthReduction * deltaTime;
                this.targetLength = Math.max(10, this.targetLength); // Safer minimum of 10
                
                // Auto-stop sprint if getting too small
                if (this.targetLength <= 12) {
                    this.isSprinting = false;
                    this.sprintCooldown = this.sprintCooldownDuration;
                }
                
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
        
        // Check collision with own body (self-collision after segment 20)
        // Increased from 5 to 20 to prevent false collisions when using joystick
        // and quickly changing direction (especially 180-degree turns)
        for (let i = 20; i < this.body.length; i++) {
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
        // Always highlight own snake (persistent), extra highlighting when Ctrl is pressed
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
                // Always have some glow for own snake, extra when Ctrl is pressed
                ctx.shadowBlur = isHighlighted ? 25 : (isMe ? 15 : 5);
            }
            
            // Persistent own-snake highlighting
            if (isMe) {
                // Draw persistent subtle outline for own snake
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(segment.x, segment.y, size + 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            // Add extra visual emphasis when Ctrl is pressed
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
    let deltaTime = 1; // Default delta time
    
    // Only calculate and update deltaTime when game is active
    if (gameActive && !gamePaused) {
        deltaTime = Math.min((currentTime - lastUpdateTime) / 16.67, 2); // Cap at 2x normal speed
        lastUpdateTime = currentTime;
    }
    
    // Update only if game is active and not paused
    if (myPlayer && gameActive && !gamePaused) {
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

// Admin code validation with session-based rate limiting
function validateAdminCodeAttempt(code) {
    const sessionAttempts = parseInt(sessionStorage.getItem('adminCodeAttempts') || '0');
    const lastAttemptTime = parseInt(sessionStorage.getItem('lastAdminCodeAttempt') || '0');
    const currentTime = Date.now();
    
    // Reset attempts if cooldown period has passed
    if (currentTime - lastAttemptTime > ADMIN_ATTEMPT_COOLDOWN) {
        sessionStorage.setItem('adminCodeAttempts', '0');
        sessionStorage.setItem('lastAdminCodeAttempt', currentTime.toString());
    }
    
    // Check if max attempts reached
    if (sessionAttempts >= MAX_ADMIN_ATTEMPTS) {
        const timePassed = currentTime - lastAttemptTime;
        if (timePassed < ADMIN_ATTEMPT_COOLDOWN) {
            return false;
        }
    }
    
    // Increment and store attempts
    sessionStorage.setItem('adminCodeAttempts', (sessionAttempts + 1).toString());
    sessionStorage.setItem('lastAdminCodeAttempt', currentTime.toString());
    
    return true;
}

// Setup mobile joystick controls
function setupMobileJoystick() {
    if (!isMobileDevice) return;
    
    const mobileControls = document.getElementById('mobileControls');
    const joystickBase = document.querySelector('.joystick-base');
    const joystickThumb = document.querySelector('.joystick-thumb');
    
    if (!mobileControls || !joystickBase || !joystickThumb) return;
    
    // Show mobile controls
    mobileControls.classList.remove('hidden');
    
    let startX = 0;
    let startY = 0;
    const maxDistance = 35; // Maximum distance thumb can move from center
    const sprintThreshold = 0.75; // Sprint when magnitude > 75%
    
    joystickBase.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const rect = joystickBase.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
        joystickActive = true;
    }, { passive: false });
    
    joystickBase.addEventListener('touchmove', (e) => {
        if (!joystickActive || !myPlayer) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        
        // Calculate angle and magnitude
        joystickAngle = Math.atan2(deltaY, deltaX);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        joystickMagnitude = Math.min(distance / maxDistance, 1);
        
        // Update thumb position (clamped to maxDistance)
        const clampedDistance = Math.min(distance, maxDistance);
        const thumbX = Math.cos(joystickAngle) * clampedDistance;
        const thumbY = Math.sin(joystickAngle) * clampedDistance;
        
        joystickThumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;
        
        // Update snake angle directly
        myPlayer.angle = joystickAngle;
        
        // Sprint detection based on magnitude
        if (joystickMagnitude > sprintThreshold) {
            shiftPressed = true;
            joystickBase.classList.add('sprinting');
        } else {
            shiftPressed = false;
            joystickBase.classList.remove('sprinting');
        }
    }, { passive: false });
    
    joystickBase.addEventListener('touchend', (e) => {
        e.preventDefault();
        joystickActive = false;
        shiftPressed = false;
        joystickBase.classList.remove('sprinting');
        
        // Reset thumb position with smooth transition
        joystickThumb.style.transition = 'transform 0.2s ease-out';
        joystickThumb.style.transform = 'translate(-50%, -50%)';
        
        setTimeout(() => {
            joystickThumb.style.transition = '';
        }, 200);
    }, { passive: false });
    
    joystickBase.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        joystickActive = false;
        shiftPressed = false;
        joystickBase.classList.remove('sprinting');
        joystickThumb.style.transform = 'translate(-50%, -50%)';
    }, { passive: false });
}

// Setup admin panel and controls
function setupAdminPanel() {
    console.log('setupAdminPanel called');
    const adminPanel = document.getElementById('adminPanel');
    const pauseBtn = document.getElementById('pauseGameBtn');
    const editPlayersBtn = document.getElementById('editPlayersBtn');
    const playerEditModal = document.getElementById('playerEditModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    
    console.log('Admin panel elements:', { adminPanel, pauseBtn, editPlayersBtn });
    
    if (!adminPanel) {
        console.error('Admin panel not found!');
        return;
    }
    
    if (!pauseBtn) {
        console.error('Pause button not found!');
        return;
    }
    
    // Show admin panel
    adminPanel.classList.remove('hidden');
    
    // Pause/Resume game button
    pauseBtn.addEventListener('click', () => {
        console.log('Pause button clicked!');
        // Don't toggle locally, wait for server response to avoid double-toggle
        socket.emit('adminAction', { type: 'togglePause' });
    });
    
    // Edit players button
    editPlayersBtn.addEventListener('click', () => {
        openPlayerEditModal();
    });
    
    // Close modal button
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            playerEditModal.classList.add('hidden');
        });
    }
}

// Open player edit modal
function openPlayerEditModal() {
    const modal = document.getElementById('playerEditModal');
    const playerEditList = document.getElementById('playerEditList');
    
    if (!modal || !playerEditList) return;
    
    // Clear existing list
    playerEditList.innerHTML = '';
    
    // Collect all players
    const allPlayers = [];
    if (myPlayer) {
        allPlayers.push({
            id: myPlayer.id,
            username: myPlayer.username,
            color: myPlayer.color
        });
    }
    players.forEach(p => {
        allPlayers.push({
            id: p.id,
            username: p.username,
            color: p.color
        });
    });
    
    // Create player edit items
    allPlayers.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-edit-item';
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'player-color-indicator';
        colorIndicator.style.backgroundColor = player.color;
        
        const currentName = document.createElement('span');
        currentName.className = 'current-name';
        currentName.textContent = player.username;
        
        playerInfo.appendChild(colorIndicator);
        playerInfo.appendChild(currentName);
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New name';
        input.maxLength = 15;
        input.dataset.playerId = player.id;
        
        // Prevent keyboard events from propagating to game controls
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        
        input.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        
        input.addEventListener('keypress', (e) => {
            e.stopPropagation();
            // Allow Enter to trigger rename
            if (e.key === 'Enter') {
                const newName = input.value.trim();
                if (newName && newName !== player.username) {
                    socket.emit('adminAction', {
                        type: 'renamePlayer',
                        playerId: player.id,
                        newName: newName
                    });
                    currentName.textContent = newName;
                    input.value = '';
                }
            }
        });
        
        const button = document.createElement('button');
        button.textContent = 'Rename';
        button.addEventListener('click', () => {
            const newName = input.value.trim();
            if (newName && newName !== player.username) {
                socket.emit('adminAction', {
                    type: 'renamePlayer',
                    playerId: player.id,
                    newName: newName
                });
                currentName.textContent = newName;
                input.value = '';
            }
        });
        
        item.appendChild(playerInfo);
        item.appendChild(input);
        item.appendChild(button);
        
        playerEditList.appendChild(item);
    });
    
    // Show modal
    modal.classList.remove('hidden');
}

// Add socket event listeners for admin functionality
function setupAdminSocketListeners() {
    socket.on('adminStatus', (data) => {
        isAdmin = data.isAdmin;
        if (isAdmin) {
            setupAdminPanel();
        }
    });
    
    socket.on('gamePaused', (data) => {
        console.log('[CLIENT] Received gamePaused event:', data.paused);
        console.log('[CLIENT] Previous gamePaused state:', gamePaused);
        console.trace('[CLIENT] gamePaused event call stack');
        gamePaused = data.paused;
        console.log('[CLIENT] New gamePaused state:', gamePaused);
        
        // Reset time when resuming to prevent delta time jumps
        if (!gamePaused) {
            console.log('[CLIENT] Game resumed, resetting lastUpdateTime');
            lastUpdateTime = Date.now();
        }
        
        // Update pause button UI if admin
        if (isAdmin) {
            console.log('[CLIENT] Updating pause button UI, isAdmin:', isAdmin);
            const pauseBtn = document.getElementById('pauseGameBtn');
            if (pauseBtn) {
                if (gamePaused) {
                    pauseBtn.classList.add('active');
                    pauseBtn.textContent = '▶ Resume';
                    console.log('[CLIENT] Pause button set to Resume');
                } else {
                    pauseBtn.classList.remove('active');
                    pauseBtn.textContent = '⏸ Pause';
                    console.log('[CLIENT] Pause button set to Pause');
                }
            }
        }
        
        // Show pause overlay if needed
        if (gamePaused) {
            console.log('[CLIENT] Showing pause overlay');
            showPauseOverlay();
        } else {
            console.log('[CLIENT] Hiding pause overlay');
            hidePauseOverlay();
        }
    });

    
    socket.on('playerRenamed', (data) => {
        // Update player name in local state
        if (myPlayer && myPlayer.id === data.playerId) {
            myPlayer.username = data.newName;
        } else {
            const player = players.get(data.playerId);
            if (player) {
                player.username = data.newName;
            }
        }
        updateLeaderboard();
    });
}

// Show pause overlay
function showPauseOverlay() {
    let overlay = document.getElementById('pauseOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pauseOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1500;
        `;
        
        const message = document.createElement('div');
        message.style.cssText = `
            color: white;
            font-size: 3em;
            font-weight: bold;
            text-align: center;
            text-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
            margin-bottom: 20px;
        `;
        message.textContent = '⏸ GAME PAUSED';
        
        const instructions = document.createElement('div');
        instructions.style.cssText = `
            color: rgba(255, 255, 255, 0.9);
            font-size: 1.2em;
            text-align: center;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        `;
        instructions.innerHTML = 'Press <kbd style="background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 5px; font-family: monospace;">ESC</kbd> or <kbd style="background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 5px; font-family: monospace;">ENTER</kbd> to resume';
        
        overlay.appendChild(message);
        overlay.appendChild(instructions);
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

// Hide pause overlay
function hidePauseOverlay() {
    const overlay = document.getElementById('pauseOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}
