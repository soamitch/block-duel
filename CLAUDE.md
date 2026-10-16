# Block Duel (TV edition)

Two-player falling-block game. A Node server on a PC relays messages. In TV mode the TV browser page runs the game and two phones are swipe controllers on the same Wi-Fi. In phone mode (Screen: Phones, or no TV page open) each phone runs and shows its own board.

## Layout
- `server.js`: dependency-free HTTP and WebSocket relay (`/ws`), `/game.js`, `/qr.svg` (built-in QR encoder), `/info`. Holds the room's screen mode (`screen()`). Run with `node server.js` or `start.bat` on Windows. Env: `PORT`, `HOST_ADDRESS`.
- `game.js`: shared by both pages as plain globals. Pacing constants, the `Game` class (10x20 board, 7-bag, SRS-lite kicks, hold, delayed garbage, KO respawn), the `Bot` computer player (El-Tetris board scoring; `CPU` holds the Easy/Normal/Hard settings), Web Audio sound effects (`SFX`; the TV filters to `TV_SFX`, phones play their own input sounds), canvas drawing.
- `tv.html`: TV mode: lobby, panels, match flow (ready, countdown, KOs, clock, wins).
- `play.html`: phone page. In phone mode it also runs the match flow (`R`, a port of the TV's) for its own practice/CPU games and, on player 1's phone, two-phone matches; player 2 plays its own board (`G`) and follows player 1's state. Swipe only: drag sideways = move, tap = rotate, flick down = hard drop, flick up = hold. Swipe sensitivity (5 levels) is stored per phone in localStorage. Haptics via `navigator.vibrate` (Android); iPhone has no working web vibration.
- Protocol: pad to server `in {k: L/R/D/U/Z/H/C}`, `ready {v, solo, cpu: easy/normal/hard}`, `rules {v: true=KO, false=Classic}`, `kotime {min: 2/3/5/0}` (0 = no limit), `screen {v: tv/phone}`; TV to server `bc` (state broadcast to pads); server to pads `room {seats, tv, screen}`.
- Phone mode: pad `p {m}` is passed to the other pad as `p {from, m}`. `m.k`: `state` (player 1 to 2: lobby/match state, seed, countdown and time left), `hello`, `pad` (player 2's lobby actions), `atk {n}` (garbage), `ko` (player 2 topped out), `snap` (board snapshot for the small opponent view, about 10 per second).

## Notes
- No npm dependencies; keep it that way so `git pull` is the whole update.
- The separate claude.ai artifact version is no longer maintained.
- Test by running the server and driving `/` and `/play` with Playwright (two phone-sized pages plus a TV-sized page). Two pads in one browser share a seat id in localStorage, so open the second one on another origin (`127.0.0.1` vs `localhost`). Hidden or background tabs pause `requestAnimationFrame`, which stops the game loops.
