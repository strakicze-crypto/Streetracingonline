const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const players = new Map();
const leaderboard = [];

app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json({ limit: "10kb" }));
app.get("/api/scores", (_req, res) => res.json({ scores: leaderboard.slice(0, 100) }));
app.post("/api/scores", (req, res) => {
  const name = String(req.body?.name || "").trim().replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 16);
  const score = Math.floor(Number(req.body?.score));
  const distance = Math.max(0, Math.min(100000, Number(req.body?.distance) || 0));
  const overtakes = Math.max(0, Math.min(100000, Math.floor(Number(req.body?.overtakes) || 0)));
  if (name.length < 2 || !Number.isFinite(score) || score < 1 || score > 100000000) return res.status(400).json({ error: "Invalid score" });
  leaderboard.push({ name, score, distance, overtakes, at: Date.now() });
  leaderboard.sort((a, b) => b.score - a.score || a.at - b.at);
  if (leaderboard.length > 100) leaderboard.length = 100;
  res.json({ ok: true, scores: leaderboard.slice(0, 10) });
});
app.get("/health", (_req, res) => res.json({
  ok: true,
  game: "Street Racing Online",
  players: players.size,
  maxPlayers: MAX_PLAYERS
}));

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcast(data, except) {
  const message = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(message);
  }
}

wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { type: "full", message: "Room is full. Try again in a moment." });
    ws.close();
    return;
  }

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  const id = Math.random().toString(36).slice(2, 9);
  const color = ["#ff4d5a", "#36c7ff", "#ffc247", "#8e7bff", "#5ee0a0", "#ff8ed1"][players.size % 6];
  const player = { id, name: "Racer " + (players.size + 1), x: (Math.random() - 0.5) * 5, z: -16, progress: 0, rotation: 0, color, name: "Racer " + (players.size + 1) };
  players.set(id, player);

  send(ws, { type: "welcome", id, players: Array.from(players.values()) });
  broadcast({ type: "join", player }, ws);
  broadcast({ type: "count", count: players.size });

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type !== "move") return;
    const current = players.get(id);
    if (!current) return;
    if (typeof data.name === "string") current.name = data.name.trim().slice(0, 16) || current.name;
    current.x = Math.max(-7, Math.min(7, Number(data.x) || 0));
    current.z = Number(data.z) || 0;
    current.progress = Math.max(0, Number(data.progress) || 0);
    current.rotation = Number(data.rotation) || 0;
    current.speed = Math.max(0, Math.min(1, Number(data.speed) || 0));
    broadcast({ type: "move", player: current }, ws);
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
    broadcast({ type: "count", count: players.size });
  });
});

// Detect abandoned mobile connections so ghost racers do not stay in the room.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log("Street Racing Online listening on " + PORT);
});