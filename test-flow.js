const { io } = require('socket.io-client');
const URL = 'http://localhost:5001';

function connect() {
  return io(URL, { transports: ['websocket'] });
}

(async () => {
  const host = connect();
  const p1 = connect();
  const p2 = connect();

  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => p1.on('connect', r));
  await new Promise((r) => p2.on('connect', r));
  console.log('all connected');

  host.on('lobby:update', (s) => console.log('HOST lobby:update', JSON.stringify(s.players.map((p) => [p.name, p.state]))));
  host.on('game:update', (s) => console.log('HOST game:update', JSON.stringify(s.players.map((p) => [p.name, p.state, p.place]))));
  host.on('game:end', (d) => console.log('HOST game:end', JSON.stringify(d.results)));

  const created = await new Promise((res) => host.emit('host:create', { name: 'Test Cup' }, res));
  console.log('created room', created);
  const code = created.code;

  const j1 = await new Promise((res) => p1.emit('player:join', { code, name: 'Alice' }, res));
  const j2 = await new Promise((res) => p2.emit('player:join', { code, name: 'Bob' }, res));
  console.log('joins', j1, j2);

  p1.emit('player:ready');
  p2.emit('player:ready');

  await new Promise((r) => setTimeout(r, 200));

  host.emit('host:start');
  console.log('sent host:start, waiting for countdown + go...');

  let gotGo = false;
  p1.on('game:go', () => (gotGo = true));
  await new Promise((r) => setTimeout(r, 3500));
  console.log('game:go received by p1?', gotGo);

  // Alice fails first -> Bob should win
  p1.emit('player:fail');

  await new Promise((r) => setTimeout(r, 300));

  process.exit(0);
})();
