# Street Racing Online

Mobile-first 3D browser racing prototype.

## Features
- Three.js 3D road, city blocks, player car and chase camera.
- Touch controls for steering, throttle and brake; keyboard support.
- Node.js + WebSocket room relay, capped at 10 connected players.
- Health endpoint at `/health`.

## Run locally
Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000

## Deployment
A Render Blueprint is included in `render.yaml`. Import this GitHub repository into Render and deploy the detected web service. The service uses `npm install` and `npm start`.

Free server plans may sleep when idle or have usage limits, so multiplayer availability is not guaranteed 24/7. A static-only host such as GitHub Pages cannot run the WebSocket server.

## Current prototype limitations
This is an early playable driving prototype, not a finished commercial racing game. It has no collision physics, lap system, account system, anti-cheat, persistent player profiles, matchmaking, or production-grade authoritative simulation. The WebSocket server only relays player positions.
