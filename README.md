# Snake IO - Multiplayer Online Game

A simple, reliable multiplayer Snake game that supports up to 20 players simultaneously with dynamic growth mechanics and forgiving collision systems.

## Features

- **Multiplayer Support**: Up to 20 players in a single room
- **Dynamic Growth**: Faster initial growth, slower for longer snakes
- **Forgiving Collisions**: Damage instead of instant elimination
- **Larger Canvas**: 1400x800 pixels with smaller 4-6px snake segments
- **Real-time Leaderboard**: Live player rankings displayed in-game
- **Simple Authentication**: Just enter a username to join

## Installation

1. Install Node.js (if not already installed): https://nodejs.org/

2. Install server dependencies:
```bash
cd server
npm install
```

## Running the Game Locally

1. Start the server:
```bash
cd server
npm start
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Enter a username and start playing!

## Controls

- **Arrow Keys** or **A/D**: Turn left/right
- Snakes automatically move forward

## Setting Up Cloudflare Tunnel

To host the game on your computer and make it accessible online:

### Step 1: Install Cloudflare Tunnel (cloudflared)

**macOS:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

**Windows:**
Download from: https://github.com/cloudflare/cloudflared/releases

**Linux:**
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Step 2: Authenticate Cloudflare

```bash
cloudflared tunnel login
```

This will open a browser window to authenticate with your Cloudflare account.

### Step 3: Create a Tunnel

```bash
cloudflared tunnel create snake-io
```

### Step 4: Start the Game Server

In one terminal, start the game server:
```bash
cd server
npm start
```

### Step 5: Start the Cloudflare Tunnel

In another terminal, create a tunnel to your local server:
```bash
cloudflared tunnel --url http://localhost:3000
```

This will output a URL like `https://something.trycloudflare.com` that you can share with friends!

### Alternative: Quick Tunnel (No Authentication)

For quick testing without account setup:
```bash
cloudflared tunnel --url http://localhost:3000
```

This creates a temporary tunnel without requiring Cloudflare authentication.

## Game Mechanics

### Dynamic Growth System

- **Small snakes (0-10 segments)**: 2x growth rate (very fast)
- **Medium snakes (10-20 segments)**: 1.5x growth rate (fast)
- **Large snakes (20-40 segments)**: 1.2x growth rate (moderate)
- **Long snakes (40+ segments)**: 1x growth rate (slow)

### Prey Point Values

- Yellow: 10 points
- Green: 20 points
- Blue: 30 points
- Purple: 50 points
- Orange: 100 points

### Collision Mechanics

- Collision with other snakes: -2 segments, -10 points
- Forgiving system: no instant elimination
- Minimum length: 3 segments

## Technical Details

- **Server**: Node.js with Express and Socket.IO
- **Client**: Vanilla JavaScript with HTML5 Canvas
- **Network**: WebSocket for real-time communication
- **Update Rate**: 10 updates/second
- **Canvas Size**: 1400x800 pixels
- **Snake Segments**: 4-6 pixels
- **Max Players**: 20

## Project Structure

```
snakeIO/
├── index.html          # Client HTML
├── style.css           # Client styles
├── script.js           # Client game logic
├── README.md           # This file
└── server/
    ├── package.json    # Server dependencies
    └── src/
        └── server.js   # Server logic
```

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, set a different port:
```bash
PORT=3001 npm start
```

### Players Can't Connect
- Make sure the server is running
- Check firewall settings
- For Cloudflare tunnel, ensure the tunnel is active

### Game Performance Issues
- Close unnecessary browser tabs
- Reduce number of players
- Check network connection

## Development

To modify game parameters:

**Server (server/src/server.js):**
- `MAX_PLAYERS`: Maximum player count
- `CANVAS_WIDTH/HEIGHT`: Game area size
- Update interval: Line 197 (currently 100ms = 10 updates/sec)

**Client (script.js):**
- `segmentSize`: Snake segment size (line 195)
- `speed`: Snake movement speed (line 198)
- `turnSpeed`: Turning speed (line 199)

## License

ISC

## Credits

Created as a simple, reliable multiplayer Snake game demo.
