import { MotionTracker, Warning, Track, SynthAudio, requestMotionPermission } from './engine.js';

const socket = io();

const screens = {
  join: document.getElementById('screen-join'),
  ready: document.getElementById('screen-ready'),
  waiting: document.getElementById('screen-waiting'),
  countdown: document.getElementById('screen-countdown'),
  playing: document.getElementById('screen-playing'),
  result: document.getElementById('screen-result'),
  kicked: document.getElementById('screen-kicked')
};
function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

const stage = document.getElementById('stage');
const el = {
  roomBadge: document.getElementById('roomBadge'),
  roomNameLabel: document.getElementById('roomNameLabel'),
  codeInput: document.getElementById('codeInput'),
  nameInput: document.getElementById('nameInput'),
  joinBtn: document.getElementById('joinBtn'),
  errorMsg: document.getElementById('errorMsg'),
  myCrest: document.getElementById('myCrest'),
  myName: document.getElementById('myName'),
  readyBtn: document.getElementById('readyBtn'),
  waitingCount: document.getElementById('waitingCount'),
  countdownNum: document.getElementById('countdownNum'),
  playTitle: document.getElementById('playTitle'),
  playStatus: document.getElementById('playStatus'),
  resultEmoji: document.getElementById('resultEmoji'),
  resultTitle: document.getElementById('resultTitle'),
  resultPlace: document.getElementById('resultPlace')
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Room code comes from the URL path (how QR codes and shared links work);
// fall back to a manual field for anyone who hit /play directly.
let roomCode = (location.pathname.match(/\/play\/([A-Za-z0-9]{4})/) || [])[1];
if (roomCode) {
  roomCode = roomCode.toUpperCase();
  el.roomBadge.textContent = 'Joining';
  el.roomNameLabel.textContent = roomCode;
} else {
  el.codeInput.style.display = 'block';
  el.roomNameLabel.textContent = 'Enter your code';
}

let myColor = '#f2b705';
let myName = '';
let myPlayerId = null;
const motion = new MotionTracker();
const warning = new Warning();
const track = new Track();
const audio = new SynthAudio();

warning.onFlash = (isFlash, bg, fg) => {
  stage.style.backgroundColor = bg;
  stage.style.color = fg;
};

el.joinBtn.addEventListener('click', () => {
  const codeFromField = el.codeInput.style.display !== 'none' ? el.codeInput.value.trim().toUpperCase() : null;
  const code = roomCode || codeFromField;
  const name = el.nameInput.value.trim();

  if (!code || code.length !== 4) {
    el.errorMsg.textContent = 'Enter the 4-letter room code the host gave you.';
    return;
  }
  if (!name) {
    el.errorMsg.textContent = 'Pick a name so people know it was you.';
    return;
  }

  el.joinBtn.disabled = true;
  socket.emit('player:join', { code, name }, (res) => {
    el.joinBtn.disabled = false;
    if (!res || !res.ok) {
      el.errorMsg.textContent = (res && res.error) || 'Could not join that game.';
      return;
    }
    roomCode = code;
    myColor = res.color;
    myName = name;
    myPlayerId = res.playerId;
    el.myCrest.style.background = myColor;
    el.myCrest.textContent = name.slice(0, 2).toUpperCase();
    el.myName.textContent = name;
    el.errorMsg.textContent = '';
    show('ready');
  });
});

el.readyBtn.addEventListener('click', async () => {
  el.readyBtn.disabled = true;
  el.readyBtn.textContent = 'Requesting motion access…';
  await requestMotionPermission();
  audio.resume();
  socket.emit('player:ready');
  el.waitingCount.textContent = '';
  show('waiting');
});

socket.on('lobby:update', (snapshot) => {
  if (screens.waiting.classList.contains('active')) {
    const ready = snapshot.players.filter((p) => p.state === 'ready').length;
    el.waitingCount.textContent = `${ready} of ${snapshot.players.length} knights ready`;
  }
});

socket.on('game:starting', (data) => {
  track.plug(data.track);
  let count = Math.round((data.countdownMs || 3000) / 1000);
  el.countdownNum.textContent = count;
  show('countdown');
  const timer = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(timer);
      return;
    }
    el.countdownNum.textContent = count;
  }, 1000);
});

socket.on('game:go', () => {
  show('playing');
  el.playTitle.textContent = 'Hold steady…';
  el.playStatus.textContent = '';
  motion.setThreshold(10000);
  track.play();
  audio.startDrone(1);
  motion.play((strength, failed) => {
    warning.setLevel(strength);
    if (failed) doFail();
  });
  warning.play(myColor, '#111');
});

function doFail() {
  motion.stop();
  track.stop();
  warning.stop();
  audio.stopDrone();
  audio.sting('fail');
  stage.style.backgroundColor = '';
  stage.style.color = '';
  socket.emit('player:fail');
  el.playTitle.textContent = 'Oh no!';
  el.playStatus.textContent = 'Waiting for the round to finish…';
}

socket.on('game:update', (snapshot) => {
  if (!screens.playing.classList.contains('active')) return;
  const running = snapshot.players.filter((p) => p.state === 'running').length;
  if (running > 0) el.playStatus.textContent = `${running} still jousting`;
});

socket.on('game:end', (data) => {
  motion.stop();
  track.stop();
  warning.stop();
  audio.stopDrone();
  stage.style.backgroundColor = '';
  stage.style.color = '';

  const me = data.results.find((p) => p.id === myPlayerId);
  const won = me && me.place === 1;

  audio.sting(won ? 'win' : 'fail');
  el.resultEmoji.textContent = won ? '🏆' : '💀';
  el.resultTitle.textContent = won ? 'You won!' : "You're unhorsed!";
  el.resultPlace.textContent = me ? `Finished ${ordinal(me.place)} of ${data.results.length}` : '';
  show('result');
});

socket.on('player:kicked', () => show('kicked'));

setInterval(() => {
  track.tick((cmd) => {
    if (cmd.cmd.rate !== undefined) audio.setRate(cmd.cmd.rate);
    if (cmd.cmd.threshold !== undefined) motion.setThreshold(cmd.cmd.threshold);
  });
  warning.tick();
}, 16);
