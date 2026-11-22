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

app.use(express.static(path.join(__dirname, "..", "public")));
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

  const id = Math.random().toString(36).slice(2, 9);
  const color = ["#ff4d5a", "#36c7ff", "#ffc247", "#8e7bff", "#5ee0a0", "#ff8ed1"][players.size % 6];
  const player = { id, x: (Math.random() - 0.5) * 5, z: -8 - players.size * 5, rotation: 0, color, name: "Racer " + (players.size + 1) };
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
    current.x = Math.max(-7, Math.min(7, Number(data.x) || 0));
    current.z = Number(data.z) || 0;
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

server.listen(PORT, "0.0.0.0", () => {
  console.log("Street Racing Online listening on " + PORT);
});