# Block Duel, TV edition

Two players, one TV, two phones. The TV shows both boards. Each phone is a
controller driven by swipe gestures. Everything stays on your home network.

No TV handy? The phones can also play on their own screens (see "Playing on phones only").

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
4. The TV keeps a win tally between rematches.

One phone alone can tap "Play on my own" for a practice run, or play the computer
(Easy, Normal or Hard).

In versus both players are always on the same level. It rises with both players' lines
together and with match time, and a "Level N · Faster" banner shows on both boards when it goes up.

**Rules** (either phone can change them in the lobby):
- **KO** (default): topping out clears your board and gives the other player a KO.
  First to 3 KOs wins. Pick a time limit of 2, 3 or 5 minutes, or none; when time
  runs out the most KOs wins, then the most garbage sent.
- **Classic**: top out once and you lose.

**Power-ups** (versus, on by default, Powers: On / Off in the lobby): now and then a piece
glows in a power's colour as it falls, with a tag naming the power. It steps through the
powers in a fixed order, about 0.7 seconds each (the tag's bar runs down to the next one and
shows what comes next), and settles on whichever power is showing when it lands, so time your
drop to pick it. Its blocks keep that colour. The power goes off when you clear a line holding one of
those blocks, so you choose when to send it; the piece's other blocks then turn grey. Both
players get them on the same pieces.
- **Fill** (gold): lines up the gaps in your stack (up to 8 rows) into one open column, ready for a long piece.
- **Flip** (red): turns the other board upside down for 8 seconds.
- **Swap** (purple): swaps the other player's left and right for 8 seconds.
- **Rush** (orange): makes the other player's pieces fall fast for 6 seconds.
- **Shield** (green): wipes your incoming garbage and blocks attacks for 10 seconds.
- **Blast** (blue): clears your bottom two rows.

**Colour packs**: open "Your colours, swipe and sound" in the phone lobby to pick Classic,
Neon, Pastel, Sunset, Retro or Clear (colour-blind friendly). Your board uses your pack on
the TV and on your phone.

**Co-op**: pick Mode: Co-op in the phone lobby and both tap Ready. You share one wide
board (16 columns), each dropping your own pieces (outlined in your colour) with your own
hold and next. Falling pieces pass through each other; they only meet once placed. Clear lines together; speed rises over time, and the run ends when the
stack reaches the top. The best run is remembered. Works on the TV and on phones only
(there, player 1's phone runs the board and player 2 sees it a moment later over Wi-Fi).

**Co-op against the computer**: in co-op, set Against to Easy, Normal or Hard. You two share
one wide board against a computer team on another; lines send garbage across, power pieces
work as in versus (an attack hits both of you, a Shield covers both), and KO rules and the
time limit apply. Both boards share one level. On the TV the computer team's board is shown small, beside yours.

**Pause**: tap the pause button at the top of a phone during a game. Everything freezes for
both players. Either phone can Resume, or End match to go back to the lobby (nobody scores).

## Playing on phones only

With no TV page open, each phone shows its own board and you play on the phone
itself: practice, against the computer, or against the other phone (each phone shows
a small view of the other player's board). With a TV page open, use **Screen: TV /
Phones** in the phone lobby to choose. The server still needs to run on the computer,
because it hands out the page and passes messages between the phones.

## Controls on the phone

- Drag sideways on the big area to move the piece.
- Tap to rotate.
- Drag down slowly to soft drop.
- Flick straight down to hard drop.
- Flick up to hold the current piece (once per piece).
- The phone buzzes on each move (Android only: iPhone Safari does not allow web pages to vibrate).

The swipe sensitivity slider in the phone lobby sets how far a drag moves the piece. It is saved on each phone.

## Sound
The TV plays the big moments: line clears, garbage landing, KOs, the countdown and the result. Click the TV screen once after opening it (browsers keep audio locked until then), and press M to mute.
Each phone plays the sounds of its own moves, rotations, drops and holds. When playing on phones only, each phone plays all the sounds for its own board. Turn phone sound on or off in the phone lobby.

Clearing 2, 3 or 4 lines at once sends 1, 1 or 3 garbage rows to the other board.
Incoming garbage waits 1.5 seconds before it lands, so you can clear lines to cancel it.
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
- The game runs in the TV page (or on each phone in phones-only mode). The server only
  hands out the pages and passes messages, so there is no lag from game logic.
- Reloading the TV page resets the score tally. In phones-only mode, player 1's phone
  keeps the tally.

## Files

- `start.bat`: double-click launcher for Windows.
- `server.js`: web server, QR code and message relay. No dependencies.
- `game.js`: the game itself (board, computer player, sounds, drawing), shared by both pages.
- `tv.html`: the TV page.
- `play.html`: the phone page: controller, and the game screen in phones-only mode.
