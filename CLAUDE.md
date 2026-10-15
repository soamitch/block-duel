# Block Duel (TV edition)

Two-player falling-block game. A Node server on a PC relays messages; the TV browser page runs the game; two phones are swipe controllers on the same Wi-Fi.

## Layout
- `server.js`: dependency-free HTTP and WebSocket relay (`/ws`), `/qr.svg` (built-in QR encoder), `/info`. Run with `node server.js` or `start.bat` on Windows. Env: `PORT`, `HOST_ADDRESS`.
- `tv.html`: the game. The `Game` class (10x20 board, 7-bag, SRS-lite kicks, hold, garbage), lobby, panels, Web Audio sound effects (`SFX`). Pacing constants are at the top of the script.
- `play.html`: phone controller. Swipe only: drag sideways = move, tap = rotate, flick down = hard drop, flick up = hold. Haptics via `navigator.vibrate` (Android); iPhone has no working web vibration.
- Protocol: pad to server `in {k: L/R/D/U/Z/H/C}`, `ready`; TV to server `bc` (state broadcast to pads).

## Notes
- No npm dependencies; keep it that way so `git pull` is the whole update.
- The separate claude.ai artifact version is no longer maintained.
- Test by running the server and driving `/` and `/play` with Playwright (two phone-sized pages plus a TV-sized page).
