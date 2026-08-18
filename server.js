'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const socketIO = require('socket.io');

const app = express();

/* ------------------------------------------------------------------
   HTTPS is used when certs are present (see README). Motion sensors
   only work in a "secure context" on phones (HTTPS, or the tunnel
   URL from a service like ngrok) - plain http:// will load the pages
   fine but devicemotion will be silently blocked by the browser.
   ------------------------------------------------------------------ */
let server;
let usingHttps = false;
try {
  const key = fs.readFileSync(path.join(__dirname, 'certs/key.pem'));
  const cert = fs.readFileSync(path.join(__dirname, 'certs/cert.pem'));
  server = require('https').createServer({ key, cert }, app);
  usingHttps = true;
} catch (err) {
  server = require('http').createServer(app);
}

const io = socketIO(server);

/* ------------------------------------------------------------------
   Static assets - only the public/ folder is ever exposed. server.js,
   package.json, and certs/ (which holds the private key) are never
   reachable over HTTP.
   ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', express.static(path.join(__dirname, 'static'))); // optional custom audio, see README

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public/host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public/play.html')));
app.get('/play/:code', (req, res) => res.sendFile(path.join(__dirname, 'public/play.html')));

const port = process.env.PORT || 5001;
server.listen(port, () => {
  console.log(`JS Joust listening on port ${port} (${usingHttps ? 'https' : 'http'})`);
  if (!usingHttps) {
    console.log(
      'No TLS certs found in ./certs - running over plain HTTP. That is fine for ' +
        'the host dashboard, but phones will refuse to share motion data outside ' +
        'a secure context. See README.md for the two easy fixes (a tunnel like ' +
        'ngrok, or a local self-signed cert).'
    );
  }
});

/* ====================================================================
   Room / game model

   Everything about a round of play lives on the room. The HOST socket
   is the sole authority that starts, restarts, and (implicitly) owns
   the room - players can only join, ready up, and report a fail.
   ==================================================================== */

const rooms = new Map(); // code -> room

const PHASES = Object.freeze({
  LOBBY: 'lobby',
  PREPARING: 'preparing',
  PLAYING: 'playing',
  ENDED: 'ended'
});

function makeRoomCode() {
  // Unambiguous alphabet: no 0/O/1/I, easy to read off a screen or say aloud.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function colorForIndex(i) {
  // Golden-angle hue rotation gives visually distinct colors for any
  // number of players, unlike the old fixed 6-color palette.
  const hue = Math.round((i * 137.508) % 360);
  return `hsl(${hue}, 78%, 52%)`;
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, color: p.color, state: p.state, place: p.place };
}

function roomSnapshot(room) {
  return {
    code: room.code,
    name: room.name,
    phase: room.phase,
    players: [...room.players.values()].map(publicPlayer)
  };
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobby:update', roomSnapshot(room));
}

function broadcastGame(room) {
  io.to(room.code).emit('game:update', roomSnapshot(room));
}

// Same track-generation idea as the original game: a shuffled sequence
// of speed/threshold changes so nobody can memorize a fixed pattern.
const trackPieces = [
  { time: [5, 15], cmd: { rate: 1, threshold: 150 } },
  { time: [5, 15], cmd: { rate: 2, threshold: 300 } },
  { time: [5, 15], cmd: { rate: 0.5, threshold: 50 } }
];

function createTrack() {
  const track = [{ time: 0, cmd: trackPieces[0].cmd }];
  let bag = [];
  let time = 0;
  for (let i = 0; i < 120; i++) {
    if (!bag.length) bag = trackPieces.map((_, idx) => idx);
    const pick = bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
    const piece = trackPieces[pick];
    time += piece.time[0] + Math.floor(Math.random() * (piece.time[1] - piece.time[0]));
    track.push({ time: time * 1000, cmd: piece.cmd });
  }
  return track;
}

// If only one (or zero) players remain "running", the round is over.
function maybeEndRound(room) {
  if (room.phase !== PHASES.PLAYING) return;
  const running = [...room.players.values()].filter((p) => p.state === 'running');
  if (running.length > 1) return;

  if (running.length === 1) {
    running[0].state = 'winner';
    running[0].place = 1;
  }
  room.phase = PHASES.ENDED;

  const results = [...room.players.values()]
    .filter((p) => p.place !== null)
    .sort((a, b) => a.place - b.place)
    .map(publicPlayer);

  io.to(room.code).emit('game:end', { results, players: roomSnapshot(room).players });
}

io.on('connection', (socket) => {
  let roomCode = null;
  let role = null; // 'host' | 'player'
  let playerId = null;

  // ---------------- Host ----------------

  socket.on('host:create', (data, ack) => {
    const name = (data && data.name ? String(data.name) : 'Untitled Joust').slice(0, 40).trim() || 'Untitled Joust';
    const code = makeRoomCode();
    const room = {
      code,
      name,
      hostSocketId: socket.id,
      phase: PHASES.LOBBY,
      players: new Map(),
      nextColorIndex: 0
    };
    rooms.set(code, room);
    roomCode = code;
    role = 'host';
    socket.join(code);
    if (typeof ack === 'function') ack({ ok: true, code, name });
  });

  socket.on('host:start', () => {
    const room = rooms.get(roomCode);
    if (!room || role !== 'host' || room.hostSocketId !== socket.id) return;
    const players = [...room.players.values()];
    if (players.length < 2) return;
    if (!players.every((p) => p.state === 'ready')) return; // everyone must have granted motion access

    room.phase = PHASES.PREPARING;
    room.track = createTrack();
    for (const p of room.players.values()) {
      p.state = 'running';
      p.place = null;
    }
    io.to(room.code).emit('game:starting', { track: room.track, countdownMs: 3000 });
    broadcastGame(room);

    setTimeout(() => {
      if (rooms.get(roomCode) !== room || room.phase !== PHASES.PREPARING) return;
      room.phase = PHASES.PLAYING;
      io.to(room.code).emit('game:go');
      broadcastGame(room);
    }, 3000);
  });

  socket.on('host:restart', () => {
    const room = rooms.get(roomCode);
    if (!room || role !== 'host' || room.hostSocketId !== socket.id) return;
    room.phase = PHASES.LOBBY;
    for (const p of room.players.values()) {
      p.state = 'lobby';
      p.place = null;
    }
    broadcastLobby(room);
  });

  socket.on('host:kick', (data) => {
    const room = rooms.get(roomCode);
    if (!room || role !== 'host' || room.hostSocketId !== socket.id) return;
    const target = room.players.get(data && data.playerId);
    if (!target) return;
    room.players.delete(target.id);
    io.to(target.socketId).emit('player:kicked');
    broadcastLobby(room);
  });

  // ---------------- Player ----------------

  socket.on('player:join', (data, ack) => {
    const code = ((data && data.code) || '').toUpperCase().trim();
    const name = ((data && data.name) || '').slice(0, 20).trim() || 'Player';
    const room = rooms.get(code);

    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'That room code was not found.' });
      return;
    }
    if (room.phase !== PHASES.LOBBY) {
      if (typeof ack === 'function') ack({ ok: false, error: 'This joust already started. Ask the host for a new game.' });
      return;
    }

    const id = `p${Math.random().toString(36).slice(2, 9)}`;
    const player = {
      id,
      socketId: socket.id,
      name,
      color: colorForIndex(room.nextColorIndex++),
      state: 'lobby',
      place: null
    };
    room.players.set(id, player);

    roomCode = code;
    role = 'player';
    playerId = id;
    socket.join(code);

    if (typeof ack === 'function') {
      ack({ ok: true, playerId: id, color: player.color, roomName: room.name });
    }
    broadcastLobby(room);
  });

  socket.on('player:ready', () => {
    const room = rooms.get(roomCode);
    const player = room && room.players.get(playerId);
    if (!room || !player || room.phase !== PHASES.LOBBY) return;
    player.state = player.state === 'ready' ? 'lobby' : 'ready';
    broadcastLobby(room);
  });

  socket.on('player:fail', () => {
    const room = rooms.get(roomCode);
    const player = room && room.players.get(playerId);
    if (!room || !player || room.phase !== PHASES.PLAYING) return;
    if (player.state !== 'running') return;

    const stillRunning = [...room.players.values()].filter((p) => p.state === 'running').length;
    player.state = 'out';
    player.place = stillRunning; // e.g. 4 were running, you just left -> you placed 4th
    broadcastGame(room);
    maybeEndRound(room);
  });

  // ---------------- Disconnect (either role) ----------------

  socket.on('disconnect', () => {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === 'host' && room.hostSocketId === socket.id) {
      io.to(room.code).emit('host:left');
      rooms.delete(room.code);
      return;
    }

    if (role === 'player' && room.players.has(playerId)) {
      const player = room.players.get(playerId);
      if (room.phase === PHASES.PLAYING && player.state === 'running') {
        const stillRunning = [...room.players.values()].filter((p) => p.state === 'running').length;
        player.state = 'out';
        player.place = stillRunning;
        room.players.delete(playerId);
        broadcastGame(room);
        maybeEndRound(room);
      } else {
        room.players.delete(playerId);
        broadcastLobby(room);
      }
    }
  });
});
