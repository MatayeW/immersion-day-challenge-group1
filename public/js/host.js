'use strict';

const socket = io();

const el = {
  setup: document.getElementById('setup'),
  dashboard: document.getElementById('dashboard'),
  roomNameInput: document.getElementById('roomName'),
  createBtn: document.getElementById('createBtn'),
  roomTitle: document.getElementById('roomTitle'),
  phaseTag: document.getElementById('phaseTag'),
  qrcode: document.getElementById('qrcode'),
  roomCode: document.getElementById('roomCode'),
  roomUrl: document.getElementById('roomUrl'),
  panelTitle: document.getElementById('panelTitle'),
  countBadge: document.getElementById('countBadge'),
  playerGrid: document.getElementById('playerGrid'),
  emptyHint: document.getElementById('emptyHint'),
  podium: document.getElementById('podium'),
  startBtn: document.getElementById('startBtn'),
  restartBtn: document.getElementById('restartBtn')
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase();
}

function statusLabel(p) {
  switch (p.state) {
    case 'lobby': return 'Waiting';
    case 'ready': return 'Ready';
    case 'running': return 'Jousting';
    case 'out': return p.place ? `Out · ${ordinal(p.place)}` : 'Out';
    case 'winner': return '🏆 Winner';
    default: return p.state;
  }
}

function renderGrid(players) {
  el.countBadge.textContent = `${players.length} ${players.length === 1 ? 'knight' : 'knights'}`;
  el.emptyHint.style.display = players.length ? 'none' : 'block';
  el.playerGrid.style.display = players.length ? 'grid' : 'none';

  el.playerGrid.innerHTML = players
    .map((p) => `
      <div class="player-card ${p.state === 'winner' ? 'winner' : ''} ${p.state === 'out' ? 'out' : ''}">
        <div class="crest" style="background:${p.color}">${initials(p.name)}</div>
        <div class="info">
          <div class="name">${escapeHtml(p.name)}</div>
          <span class="status-pill ${p.state}">${statusLabel(p)}</span>
        </div>
      </div>
    `)
    .join('');
}

function renderPodium(results) {
  el.podium.style.display = 'flex';
  el.podium.innerHTML = results
    .map(
      (p) => `
      <div class="podium-row ${p.place === 1 ? 'p1' : ''}">
        <span class="podium-rank">${ordinal(p.place)}</span>
        <div class="crest" style="background:${p.color}; width:32px; height:32px; font-size:0.85rem;">${initials(p.name)}</div>
        <span style="font-weight:700; color:var(--parchment);">${escapeHtml(p.name)}</span>
      </div>`
    )
    .join('');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function setPhaseTag(phase) {
  const map = {
    lobby: ['lobby', 'Lobby open'],
    preparing: ['running', 'Starting…'],
    playing: ['running', 'Jousting in progress'],
    ended: ['winner', 'Round over']
  };
  const [cls, label] = map[phase] || ['lobby', phase];
  el.phaseTag.className = `status-pill ${cls}`;
  el.phaseTag.textContent = label;
}

let currentPhase = 'lobby';

function applySnapshot(snapshot) {
  currentPhase = snapshot.phase;
  setPhaseTag(snapshot.phase);

  el.podium.style.display = 'none';
  el.playerGrid.style.display = 'grid';

  renderGrid(snapshot.players);

  const enoughPlayers = snapshot.players.length >= 2;
  const allReady = snapshot.players.length > 0 && snapshot.players.every((p) => p.state === 'ready');
  el.startBtn.style.display = snapshot.phase === 'ended' ? 'none' : 'inline-block';
  el.startBtn.disabled = !(snapshot.phase === 'lobby' && enoughPlayers && allReady);
  if (snapshot.phase === 'lobby' && !enoughPlayers) {
    el.startBtn.textContent = 'Waiting for 2+ knights…';
  } else if (snapshot.phase === 'lobby' && !allReady) {
    el.startBtn.textContent = 'Waiting for everyone to be ready…';
  } else {
    el.startBtn.textContent = '⚔️ Start the Joust';
  }
  el.restartBtn.style.display = snapshot.phase === 'ended' ? 'inline-block' : 'none';
  el.panelTitle.textContent = snapshot.phase === 'lobby' ? "Who's here" : 'Live standings';
}

el.createBtn.addEventListener('click', () => {
  const name = el.roomNameInput.value.trim();
  el.createBtn.disabled = true;
  socket.emit('host:create', { name }, (res) => {
    el.createBtn.disabled = false;
    if (!res || !res.ok) return;

    el.roomTitle.textContent = res.name;
    el.roomCode.textContent = res.code;

    const joinUrl = `${location.origin}/play/${res.code}`;
    el.roomUrl.textContent = joinUrl;

    el.qrcode.innerHTML = '';
    const qr = qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    el.qrcode.innerHTML = qr.createSvgTag({ scalable: true });

    el.setup.style.display = 'none';
    el.dashboard.style.display = 'block';
  });
});

el.startBtn.addEventListener('click', () => {
  socket.emit('host:start');
});

el.restartBtn.addEventListener('click', () => {
  socket.emit('host:restart');
});

socket.on('lobby:update', applySnapshot);
socket.on('game:update', applySnapshot);

socket.on('game:end', (data) => {
  currentPhase = 'ended';
  setPhaseTag('ended');
  el.panelTitle.textContent = 'Final standings';
  renderGrid(data.players);
  renderPodium(data.results);
  el.startBtn.style.display = 'none';
  el.restartBtn.style.display = 'inline-block';
});

window.addEventListener('beforeunload', (e) => {
  if (el.dashboard.style.display === 'block' && currentPhase !== 'ended') {
    e.preventDefault();
    e.returnValue = '';
  }
});
