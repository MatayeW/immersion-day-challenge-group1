# JS JOUST

A phone-motion party game, inspired by Johann Sebastian Joust: hold your phone, follow
the music, don't move too much. Last knight standing wins.

This is a rewrite of the original slim version with a real **host dashboard** and
**QR-code join** flow:

- **One person hosts** from a laptop/desktop (or a TV). They name the tournament and
  get a room code + QR code to share.
- **Everyone else scans the QR code** on their phone, types a name, and taps ready —
  no typing IP addresses, no fumbling with settings.
- The **host's screen** is the admin view: a live grid of everyone in the lobby, who's
  ready, who's still in, who's out (with their finishing place), and who won.
- Each **player's phone** just shows what matters to them: a big "you won" or
  "you're out" screen at the end.
- No player limit — colors are generated on the fly instead of picked from a fixed
  palette of 6.
- No audio files to install — the music/warning stings are synthesized in the
  browser with the Web Audio API. Swap in real tracks if you want (see "Custom
  audio" below).

## Setup

```
npm install
npm start
```

By default this listens on port 5001. Open `http://localhost:5001/host` on the
computer that will run the game.

## The one thing to know about phones and HTTPS

Browsers only allow a page to read the accelerometer (`devicemotion`) in a
**secure context** — that's `https://`, or `http://localhost` on the same
machine. A plain `http://192.168.x.x:5001` link (the old "type in the host's IP"
approach) will *load* fine on a phone, but the browser will silently refuse to
report motion, so nobody will ever get "hit."

Two easy ways to fix that instead of the old self-signed-certificate dance:

**Option A — a tunnel (recommended for parties, works over any network):**
```
npx localtunnel --port 5001
# or: ngrok http 5001
```
Then start the server as normal and open the **tunnel's https URL** on `/host`
instead of `localhost`. The QR code the host page generates uses whatever
origin you're viewing it from, so it will automatically point everyone at the
tunnel URL — real HTTPS, no browser warnings, works even if guests aren't on
your Wi-Fi.

**Option B — a local self-signed cert (LAN only, like the original setup):**
```
mkdir certs
openssl genrsa -out certs/key.pem 2048
openssl req -new -key certs/key.pem -out certs/csr.pem
openssl x509 -req -days 9999 -in certs/csr.pem -signkey certs/key.pem -out certs/cert.pem
npm start
```
The server auto-detects `certs/key.pem` + `certs/cert.pem` and switches to HTTPS.
Everyone will need to accept one security warning the first time (same as before),
but now they do it by scanning a QR code instead of typing an IP address.

## How to play

1. Host opens `/host`, names the tournament, and shares the QR code (or the
   4-letter code, read aloud) with everyone.
2. Players scan it, enter a name, and tap **I'm Ready** (this is also what
   requests motion-sensor permission on their phone).
3. Once everyone the host wants is ready, they tap **Start the Joust**.
4. Phones follow a rising danger meter — move too much and you're out. The
   host's screen updates live with who's still in and who's out, in order.
5. Last player standing wins. The host taps **New Round** to go again with the
   same lobby.

## Custom audio

`SynthAudio` in `public/js/engine.js` generates the drone and win/fail stings
procedurally so the game works with zero asset files. If you'd rather ship real
music, drop files in a `static/` folder (served at `/static/...`) and swap the
calls in `public/js/player.js` for an `<audio>`/`AudioBufferSourceNode`-based
player instead.

## Project layout

```
server.js              Express + Socket.IO server; room/game state lives here
public/
  index.html            Landing page (host or join-by-code)
  host.html + js/host.js Desktop dashboard: create room, QR code, live grid
  play.html + js/player.js  Phone flow: join -> ready -> play -> result
  js/engine.js           Motion tracking, warning flash, track playback, synth audio
  js/qrcode.js            Vendored QR generator (kazuhikoarase/qrcode-generator, MIT)
  css/styles.css          Shared design system
```

## Thanks

Thanks to the original [jsjsj](https://github.com/kesiev/jsjsj) this
project builds on.
