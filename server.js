<<<<<<< HEAD
// Dependencies
const fs = require('fs');
var express = require('express');
var https = require('http');
=======
var http = require('http');
>>>>>>> 16c14d3 (updated server,js)
var path = require('path');
var socketIO = require('socket.io');
=======
const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const https = require("https");
const socketIO = require("socket.io");
const QRCode = require("qrcode");
>>>>>>> ba8c75b (changed some things)

const app = express();
const port = process.env.PORT || 5001;
const hasCert = fs.existsSync(path.join(__dirname, "certs", "key.pem")) &&
                fs.existsSync(path.join(__dirname, "certs", "cert.pem"));

const server = hasCert
  ? https.createServer({
      key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
      cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem"))
    }, app)
  : http.createServer(app);

const io = socketIO(server);

app.use("/static", express.static(path.join(__dirname, "static")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

<<<<<<< HEAD
// Starts the server.
var port = process.env.PORT || 5001;
server.listen(port, function() {
<<<<<<< HEAD
	console.log('Starting server on port ' + port);
=======
	console.log('Starting server on port' + port);
>>>>>>> 16c14d3 (updated server,js)
=======
// Generate QR codes on the server so the app has no external QR-code dependency.
app.get("/qr", async (req, res) => {
  const text = String(req.query.text || "").slice(0, 2048);
  if (!text) return res.status(400).send("Missing text");

  try {
    const png = await QRCode.toBuffer(text, {
      type: "png",
      width: 520,
      margin: 2,
      errorCorrectionLevel: "M"
    });
    res.type("png").set("Cache-Control", "no-store").send(png);
  } catch (error) {
    console.error("QR generation failed:", error);
    res.status(500).send("Could not generate QR code");
  }
>>>>>>> ba8c75b (changed some things)
});

const MAX_PLAYERS = 6;
const rooms = {};

const palette = [
  { bg: "#ef4444", fg: "#ffffff" },
  { bg: "#22c55e", fg: "#ffffff" },
  { bg: "#3b82f6", fg: "#ffffff" },
  { bg: "#f59e0b", fg: "#111827" },
  { bg: "#06b6d4", fg: "#ffffff" },
  { bg: "#a855f7", fg: "#ffffff" }
];

function broadcast(room, type, message) {
  if (!room) return;
  for (const player of Object.values(room.players)) {
    player.socket.emit(type, message);
  }
}

function publicPlayers(room) {
  const result = {};
  for (const [id, player] of Object.entries(room.players)) {
    result[id] = {
      color: palette[player.color],
      state: player.state
    };
  }
  return result;
}

io.on("connection", socket => {
  let id = null;
  let room = null;

  socket.on("join", data => {
    const requestedRoom = String(data?.room || "").trim().slice(0, 24);
    id = String(data?.id || "").slice(0, 80);

    if (!requestedRoom || !id) {
      socket.emit("joinError", { message: "Invalid room." });
      return;
    }

    if (room) return;

    if (!rooms[requestedRoom]) {
      rooms[requestedRoom] = {
        id: requestedRoom,
        players: {},
        paletteUsed: []
      };
      console.log(`Creating room ${requestedRoom}`);
    }

    room = rooms[requestedRoom];

    if (Object.keys(room.players).length >= MAX_PLAYERS) {
      socket.emit("roomFull");
      room = null;
      return;
    }

    // Prevent a stale duplicate player ID from occupying two slots.
    if (room.players[id]) {
      room.players[id].socket.disconnect(true);
      delete room.players[id];
    }

    let color = room.paletteUsed.findIndex(value => !value);
    if (color === -1) {
      socket.emit("roomFull");
      room = null;
      return;
    }

    room.paletteUsed[color] = id;
    room.players[id] = {
      socket,
      color,
      state: "idle"
    };

    socket.emit("players", publicPlayers(room));
    broadcast(room, "join", {
      id,
      data: {
        state: "idle",
        color: palette[color]
      }
    });

    console.log(`${id} joined ${room.id} (${Object.keys(room.players).length}/${MAX_PLAYERS})`);
  });

  socket.on("data", data => {
    if (!room || !id) return;
    broadcast(room, "data", {
      ...data,
      id
    });
  });

  socket.on("disconnect", () => {
    if (!room || !id || !room.players[id]) return;

    const color = room.players[id].color;
    delete room.players[id];
    room.paletteUsed[color] = false;

    broadcast(room, "left", { id });

    if (Object.keys(room.players).length === 0) {
      console.log(`Closing room ${room.id}`);
      delete rooms[room.id];
    }
  });
});

server.listen(port, () => {
  const protocol = hasCert ? "https" : "http";
  console.log(`Joust running at ${protocol}://localhost:${port}`);
  if (!hasCert) {
    console.log("No TLS certificates found; using HTTP. HTTPS is required by some mobile browsers for motion sensors.");
  }
});
