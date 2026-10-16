'use strict';
/*
 * Block Duel, local network edition.
 * No dependencies. Needs Node 16 or newer.
 *
 *   node server.js
 *
 * Serves the TV page at /, the phone controller at /play, a QR code at /qr.svg
 * and a small WebSocket relay at /ws. The game itself runs in the TV page.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ---------------------------------------------------------------- address */

function lanAddress() {
  const found = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      if ((n.family === 'IPv4' || n.family === 4) && !n.internal) found.push(n.address);
    });
  });
  const rank = (a) => (/^192\.168\./.test(a) ? 0 : /^10\./.test(a) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3);
  found.sort((a, b) => rank(a) - rank(b));
  return found[0] || 'localhost';
}
const HOST = process.env.HOST_ADDRESS || lanAddress();
const BASE = 'http://' + HOST + ':' + PORT;
const PLAY_URL = BASE + '/play';

/* ---------------------------------------------------------------- QR code */
/* Byte mode, error correction L, versions 1 to 5. Enough for a local URL. */

function qrMatrix(text) {
  const data = Buffer.from(text, 'utf8');
  const DATA = [0, 19, 34, 55, 80, 108];
  const ECC = [0, 7, 10, 15, 20, 26];
  const ALIGN = [0, 0, 18, 22, 26, 30];
  let v = 1;
  while (v <= 5 && data.length > DATA[v] - 2) v++;
  if (v > 5) throw new Error('Address too long for the QR code');
  const size = 17 + 4 * v;

  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4);
  put(data.length, 8);
  for (const b of data) put(b, 8);
  put(0, Math.min(4, DATA[v] * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let x = 0;
    for (let j = 0; j < 8; j++) x = (x << 1) | bits[i + j];
    cw.push(x);
  }
  for (let pad = 0xec; cw.length < DATA[v]; pad ^= 0xec ^ 0x11) cw.push(pad);

  const exp = new Array(512);
  const log = new Array(256);
  let gx = 1;
  for (let i = 0; i < 255; i++) { exp[i] = gx; log[gx] = i; gx <<= 1; if (gx & 256) gx ^= 0x11d; }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const gmul = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
  let gen = [1];
  for (let i = 0; i < ECC[v]; i++) {
    const ng = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) { ng[j] ^= gen[j]; ng[j + 1] ^= gmul(gen[j], exp[i]); }
    gen = ng;
  }
  const rem = new Array(ECC[v]).fill(0);
  for (const d of cw) {
    const f = d ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < rem.length; i++) rem[i] ^= gmul(gen[i + 1], f);
  }
  const all = cw.concat(rem);

  const mod = [];
  const fn = [];
  for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
  const setFn = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (v >= 2) {
    const c = ALIGN[v];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const d = (1 << 3) | mask;
    let r = d << 10;
    for (let i = 14; i >= 10; i--) if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
    const f = ((d << 10) | r) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);

  const total = all.length * 8;
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && k < total) { mod[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0; k++; }
      }
    }
  }

  const maskFn = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  ];
  const penalty = () => {
    let p = 0;
    const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const B = A.slice().reverse();
    const line = (get) => {
      let run = 1;
      for (let i = 1; i < size; i++) {
        if (get(i) === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
      }
      for (let i = 0; i + 11 <= size; i++) {
        let a = true, b = true;
        for (let j = 0; j < 11; j++) {
          const val = get(i + j) ? 1 : 0;
          if (val !== A[j]) a = false;
          if (val !== B[j]) b = false;
        }
        if (a || b) p += 40;
      }
    };
    for (let y = 0; y < size; y++) line((i) => mod[y][i]);
    for (let x = 0; x < size; x++) line((i) => mod[i][x]);
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (mod[y][x]) dark++;
      if (x + 1 < size && y + 1 < size) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
    }
    p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    return p;
  };
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestP) { bestP = p; best = m; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}

function qrSvg(text) {
  const m = qrMatrix(text);
  const n = m.length, q = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
  const w = n + q * 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + w + '" shape-rendering="crispEdges">' +
    '<rect width="' + w + '" height="' + w + '" fill="#fff"/><path d="' + d + '" fill="#10141a"/></svg>';
}

/* ------------------------------------------------------------------- HTTP */

function file(name) { return fs.readFileSync(path.join(__dirname, name)); }
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url === '/' || url === '/tv') return send(200, 'text/html; charset=utf-8', file('tv.html'));
    if (url === '/play') return send(200, 'text/html; charset=utf-8', file('play.html'));
    if (url === '/game.js') return send(200, 'text/javascript; charset=utf-8', file('game.js'));
    if (url === '/qr.svg') return send(200, 'image/svg+xml', qrSvg(PLAY_URL));
    if (url === '/info') return send(200, 'application/json', JSON.stringify({ playUrl: PLAY_URL, tvUrl: BASE + '/' }));
  } catch (e) {
    return send(500, 'text/plain; charset=utf-8', 'Server error: ' + e.message);
  }
  send(404, 'text/plain; charset=utf-8', 'Not found');
});

/* -------------------------------------------------------------- WebSocket */

class Conn {
  constructor(socket, head) {
    this.s = socket;
    this.buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    this.open = true;
    this.alive = true;
    this.frag = null;
    this.fragOp = 0;
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    if (this.buf.length) this.parse();
  }
  parse() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        if (b.readUInt32BE(2) !== 0) { this.close(1009); return; }
        len = b.readUInt32BE(6); off = 10;
      }
      if (len > 65536) { this.close(1009); return; }
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let payload = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const key = b.subarray(off, off + 4);
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ key[i & 3];
        payload = out;
      }
      this.buf = b.subarray(need);
      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this.frame(0xa, payload); continue; }
      if (op === 0xa) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        if (op !== 0x0) { this.frag = []; this.fragOp = op; }
        if (!this.frag) continue;
        this.frag.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.frag);
          const isText = this.fragOp === 0x1;
          this.frag = null;
          if (isText && this.onmessage) this.onmessage(msg.toString('utf8'));
        }
      }
    }
  }
  frame(op, payload) {
    if (!this.open && op !== 0x8) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(n, 6); }
    try { this.s.write(Buffer.concat([head, payload])); } catch (e) { /* socket gone */ }
  }
  send(str) { if (this.open) this.frame(0x1, Buffer.from(str, 'utf8')); }
  ping() { this.frame(0x9, Buffer.alloc(0)); }
  close(code) {
    if (!this.open) return;
    const c = Buffer.alloc(2);
    c.writeUInt16BE(code || 1000, 0);
    this.frame(0x8, c);
    this.finish();
    try { this.s.end(); } catch (e) { /* ignore */ }
    setTimeout(() => { try { this.s.destroy(); } catch (e) { /* ignore */ } }, 500);
  }
  finish() {
    if (!this.open) return;
    this.open = false;
    if (this.onclose) this.onclose();
  }
}

const conns = new Set();
let tv = null;
const seats = [null, null]; /* each: { id, conn } */
let lastState = null;
/* Where the game is shown: 'tv' (the TV page runs it) or 'phone' (each phone shows its own board, and in a two-phone match
   player 1's phone keeps score). A phone picks it; with no TV page open it is always 'phone'. */
let screenPref = 'tv';
let tvGoneAt = 0;   /* a TV page that comes back within TV_GRACE_MS (a reload) keeps the room as it was */
const TV_GRACE_MS = 15000;

function send(c, obj) { if (c && c.open) c.send(JSON.stringify(obj)); }
function seatInfo() { return seats.map((s) => (s ? { connected: !!(s.conn && s.conn.open) } : null)); }
function tvOn() { return !!(tv && tv.open); }
function screen() { return tvOn() ? screenPref : 'phone'; }
function pushSeats() {
  send(tv, { t: 'seats', seats: seatInfo(), screen: screen() });
  const room = { t: 'room', seats: seatInfo(), tv: tvOn(), screen: screen() };
  seats.forEach((s) => { if (s) send(s.conn, room); });
}

function handle(conn) {
  let role = null;
  let seat = -1;
  conn.onmessage = (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (!role) {
      if (m.t !== 'hello') return;
      if (m.role === 'tv') {
        role = 'tv';
        /* phones already playing on their own stay that way when a TV page opens; a phone can switch to it */
        if (!tvOn() && Date.now() - tvGoneAt > TV_GRACE_MS && seats.some((s) => s && s.conn && s.conn.open)) screenPref = 'phone';
        if (tv && tv !== conn) tv.close(4000);
        tv = conn;
        pushSeats();
      } else if (m.role === 'pad' && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 64) {
        let i = seats.findIndex((s) => s && s.id === m.id);
        if (i < 0) i = seats.findIndex((s) => !s);
        if (i < 0) i = seats.findIndex((s) => s && !(s.conn && s.conn.open));
        if (i < 0) { send(conn, { t: 'full' }); conn.close(1000); return; }
        const prev = seats[i] && seats[i].conn;
        seats[i] = { id: m.id, conn };
        if (prev && prev !== conn) prev.close(4001);
        role = 'pad';
        seat = i;
        send(conn, { t: 'seat', seat: i });
        if (lastState && tvOn()) send(conn, { t: 'tv', m: lastState });
        pushSeats();
      }
      return;
    }
    if (role === 'tv') {
      if (m.t === 'bc' && m.m && typeof m.m === 'object') {
        lastState = m.m;
        seats.forEach((s) => { if (s) send(s.conn, { t: 'tv', m: m.m }); });
      }
    } else if (role === 'pad') {
      if (m.t === 'screen' && (m.v === 'tv' || m.v === 'phone')) { screenPref = m.v; pushSeats(); return; }
      if (m.t === 'p' && m.m && typeof m.m === 'object') {      /* phone mode: pass straight to the other phone */
        const o = seats[1 - seat];
        if (o) send(o.conn, { t: 'p', from: seat, m: m.m });
        return;
      }
      if (screen() !== 'tv') return;
      if ((m.t === 'in' && typeof m.k === 'string' && m.k.length <= 8) || m.t === 'ready' || m.t === 'rules' || m.t === 'kotime' || m.t === 'mode') {
        send(tv, { t: 'pad', seat, m: { t: m.t, k: m.k, v: !!m.v, solo: !!m.solo, cpu: ['easy', 'normal', 'hard'].includes(m.cpu) ? m.cpu : undefined, min: Number.isInteger(m.min) ? m.min : undefined } });
      }
    }
  };
  conn.onclose = () => {
    conns.delete(conn);
    if (role === 'tv' && tv === conn) { tv = null; tvGoneAt = Date.now(); pushSeats(); }
    if (role === 'pad' && seat >= 0 && seats[seat] && seats[seat].conn === conn) {
      seats[seat].conn = null;
      pushSeats();
    }
  };
}

server.on('upgrade', (req, socket, head) => {
  const url = req.url.split('?')[0];
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  const origin = req.headers.origin;
  let sameOrigin = true;
  if (origin) {
    try { sameOrigin = new URL(origin).host === req.headers.host; } catch (e) { sameOrigin = false; }
  }
  if (url !== '/ws' || upgrade !== 'websocket' || !key || !sameOrigin) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = new Conn(socket, head);
  conns.add(conn);
  handle(conn);
});

setInterval(() => {
  conns.forEach((c) => {
    if (!c.alive) { c.finish(); try { c.s.destroy(); } catch (e) { /* ignore */ } return; }
    c.alive = false;
    c.ping();
  });
}, 15000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Block Duel is running.');
  console.log('');
  console.log('  Open on the TV:   ' + BASE + '/');
  console.log('  Phones join at:   ' + PLAY_URL + '   (the TV shows a QR code for this)');
  console.log('');
  console.log('  If the address above is wrong, set it yourself:');
  console.log('  HOST_ADDRESS=192.168.1.20 node server.js');
  console.log('');
});
