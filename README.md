# Block Duel, TV edition

Two players, one TV, two phones. The TV shows both boards. Each phone is a
controller with swipe gestures and buttons. Everything stays on your home network.

## Run it

Needs Node 16 or newer (https://nodejs.org, the LTS version). There is nothing else to install.

**Windows:** double-click `start.bat`. Do not double-click `server.js`: Windows opens it
with the wrong program and shows a "Windows Script Host" syntax error.

**Any system, from a terminal in this folder:**

    node server.js

On Windows you can open a terminal here by typing `cmd` in the folder's address bar.
The first time, Windows may ask whether to let Node through the firewall. Allow it on
private networks, otherwise the phones cannot connect.

`start.bat` uses port 3000 and opens the page on this computer for you. To use another
port, run `PORT=3001 node server.js` from a terminal instead.

The terminal prints two addresses:

- **Open on the TV**: put this in the TV's browser, or open it on a laptop that is
  plugged into the TV (HDMI or cast). A laptop is the most reliable choice.
- **Phones join at**: the TV shows a QR code for this. You can also type it in.

Both phones must be on the same Wi-Fi as the computer running the server.

## Play

1. Open the TV address. You see the lobby with a QR code.
2. Each player scans the code. Player 1 is cyan, Player 2 is amber.
3. Tap Ready on both phones. A 3 second countdown starts the match.
4. First stack to reach the top loses. The TV keeps a win tally between rematches.

One phone alone can tap "Play on my own" for a practice run.

## Controls on the phone

- Drag sideways on the big area to move the piece.
- Tap to rotate.
- Drag down slowly to soft drop.
- Flick straight down to hard drop.
- The buttons along the bottom do the same: left, soft drop, right, rotate, hard drop.

Clearing 2, 3 or 4 lines at once sends 1, 2 or 4 garbage rows to the other board.
Both players get the same pieces in the same order.

## If something does not work

- **Phone cannot open the page.** Check that it is on the same Wi-Fi, not a guest
  network (guest networks often block phones from reaching other devices). Some
  computers also need the firewall to allow Node on private networks.
- **The printed address is wrong** (for example a VPN or virtual adapter was picked):
  `HOST_ADDRESS=192.168.1.20 node server.js` (on Windows PowerShell:
  `$env:HOST_ADDRESS="192.168.1.20"; node server.js`).
- **Port 3000 is taken:** `PORT=3001 node server.js`.
- **A phone shows "Seat taken".** The same phone opened the page in a second tab.
  Close the other tab and reload.
- **A phone drops out mid-match.** It rejoins on its own. If it is gone for 10 seconds
  the match counts as forfeited.

## Notes

- The page is served over plain HTTP, which is fine on a home network. It means the
  phone's haptic buzz on hard drops may not fire on every phone.
- The game runs in the TV page. The server only hands out the pages and passes
  messages between the phones and the TV, so there is no lag from game logic.
- Reloading the TV page resets the score tally.

## Files

- `start.bat`: double-click launcher for Windows.
- `server.js`: web server, QR code and message relay. No dependencies.
- `tv.html`: the TV page with the game.
- `play.html`: the phone controller.
