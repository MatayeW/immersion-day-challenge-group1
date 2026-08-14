# Immersion Day Challenge (Group 1)
Adamu Abdullahi
Katlego Maphango
Lisakhanya Gumengi
Mataye Whitelhane
Yoland Magxagxa

## Setup

Make sure you have `openssl` installed. Clone this repository and run:

```
# npm install
...
# openssl genrsa -out certs/key.pem
...
# openssl req -new -key certs/key.pem -out certs/csr.pem
[Hit enter to the end]
# openssl x509 -req -days 9999 -in certs/csr.pem -signkey certs/key.pem -out certs/cert.pem
...
# node server.js
Starting server on port 5001
```

Find some friends connected to the same network, point your modern browser&copy; to `https://<server address>:5001`, accept the security warning, and you're ready.

## How to play

- After loading the game, join a game room.
- Wait for your friends. In the meantime, you can fiddle with options:
  - **Always play audio**: always plays music on your device.
  - **Disable blink**: disables screen blinking when you're moving too much.
  - **Disable vibrate**: disables vibration when you're moving too much.
- When you're ready, press the OK button. The clients will sync — once they're ready, hit the OK button once again to start.
- Try to shake your opponent's device, but don't move your own too fast! You have to move in step with the music: when it's slow, move slowly; when it plays fast, you can move faster!
- The last person standing wins!

## Deploying so others can test on their phones

The steps above are for running the server on your own machine/local network with a self-signed cert. To share a public link instead:

1. Push this repo to GitHub (plain `git push`).
2. Deploy it on a host that runs persistent Node processes — e.g. [Render](https://render.com) or [Railway](https://railway.app) — connected to your GitHub repo, with `node server.js` as the start command.
3. These hosts provide HTTPS automatically, so you can skip the manual `openssl` cert steps above for the deployed version.
4. Share the resulting `https://` URL from the host, not the GitHub repo link — iOS in particular requires HTTPS to grant motion-sensor (`devicemotion`) permission, which this game depends on.

