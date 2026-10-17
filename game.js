/* Block Duel shared code: rules and pacing, the board engine (Game), the computer player (Bot), sound effects (SFX) and canvas drawing.
   Loaded as a plain script by both the TV page (tv.html) and the phone page (play.html), so everything here is a global. */
'use strict';
/* The game clock. Pausing stops it, so gravity, lock delay, garbage delay, effects, KO respawns and the match clock all freeze. */
var CLOCK={off:0,at:null};
function gameNow(){return (CLOCK.at!==null?CLOCK.at:performance.now())-CLOCK.off;}
function pauseClock(){if(CLOCK.at===null)CLOCK.at=performance.now();}
function resumeClock(){if(CLOCK.at!==null){CLOCK.off+=performance.now()-CLOCK.at;CLOCK.at=null;}}
function clockPaused(){return CLOCK.at!==null;}
var COLS=10, ROWS=20, LOCK_MS=500, COUNTDOWN=3000, FORFEIT_MS=10000;
/* Pacing knobs. Garbage sent by lines cleared (index = lines): a single sends nothing, a double 1, a triple 1, a Tetris 3.
   Incoming garbage lands at most GARBAGE_PER_LOCK rows at a time, the queue is capped at GARBAGE_CAP, and speed rises slowly.
   Incoming garbage waits GARBAGE_DELAY_MS before it can land (as in TETR.IO), so there is time to clear lines and cancel it. */
/* KO rules (Tetris Friends style): topping out clears your board after KO_RESPAWN_MS and gives the other player a KO.
   First to KO_TO_WIN wins; when the match time runs out, most KOs wins, then most garbage sent, otherwise it is a draw.
   The match time is picked on the phones from KO_MINUTES (0 means no time limit). */
var KO_TO_WIN=3, KO_MINUTES=[2,3,5,0], KO_RESPAWN_MS=1600;
/* Versus players share one level: it rises with both players' lines together (twice LEVEL_EVERY_LINES per level) and with match time. */
function sharedLevel(lines,elapsed){return 1+Math.floor(lines/(LEVEL_EVERY_LINES*2))+Math.floor(Math.max(0,elapsed)/LEVEL_EVERY_MS);}
var GARBAGE_TABLE=[0,0,1,1,3], GARBAGE_PER_LOCK=4, GARBAGE_CAP=10, GARBAGE_DELAY_MS=1500, LEVEL_EVERY_LINES=8, LEVEL_EVERY_MS=90000, GRAVITY_START=800, GRAVITY_STEP=55, GRAVITY_MIN=100;
var css=getComputedStyle(document.documentElement);
function tok(n,fallback){return css.getPropertyValue(n).trim()||fallback||'';}
var PAL=[null,tok('--p1','#4cc9f0'),tok('--p2','#f2b134'),tok('--p3','#b08af0'),tok('--p4','#46d695'),tok('--p5','#ea5a5f'),tok('--p6','#5f8cf0'),tok('--p7','#ff8f4a'),tok('--p8','#566170')];
var C_BOARD=tok('--board','#0b0f14'), C_GRID=tok('--gridline','#18202a'), C_DANGER=tok('--danger','#ea5a5f'), C_SHINE=tok('--shine','rgba(255,255,255,.22)'), C_SHADE=tok('--shade','rgba(0,0,0,.24)'), C_FG=tok('--fg','#e9edf2'), C_SCRIM=tok('--scrim','rgba(10,13,18,.86)');

/* Power pieces (versus, when Power-ups is on). Now and then a piece shimmers through the power colours while it falls; when it is
   placed it settles on one power and its blocks keep that colour. The power goes off when a line holding one of those blocks is
   cleared, so the player picks the moment; the piece's other blocks then go grey. Both players get them on the same pieces of their
   (identical) sequence, at least POWER_GAP pieces apart. Self powers help you; the others hit the opponent for dur ms unless their
   Shield is up. Fill lines the gaps of up to FILL_ROWS rows of your stack up into one open column; its new blocks are CELL_FILLED. */
/* While a power piece falls it steps through the powers, POWER_STEP_MS each, from a random start; it settles on whichever power is
   showing when it locks, so a well-timed drop picks the power. */
var POWER_GAP=5, POWER_CHANCE=0.16, POWER_STEP_MS=700, FILL_ROWS=8, CELL_FILLED=15, CELL_SPENT=8;
/* which power a falling power piece shows at time t, and how far through that step it is (0..1) */
function powerAt(cur,t){
  var e=Math.max(0,t-cur.spT0), k=Math.floor(e/POWER_STEP_MS), n=POWER_KEYS.length;
  return {p:POWER_KEYS[(cur.spOff+k)%n],next:POWER_KEYS[(cur.spOff+k+1)%n],f:(e%POWER_STEP_MS)/POWER_STEP_MS};
}
var POWERS={
  fill:  {id:9,  name:'Fill',   icon:'\u2726', col:'#ffd34d', deep:'#a8740a', self:true,  note:'lines the gaps in your stack up into one column'},
  flip:  {id:10, name:'Flip',   icon:'\u21c5', col:'#ff4f6a', deep:'#9c1030', dur:8000,  hit:'Flipped', note:'turns the other board upside down'},
  swap:  {id:11, name:'Swap',   icon:'\u21c4', col:'#b76cff', deep:'#5a22a6', dur:8000,  hit:'Swapped', note:'swaps the other player\'s left and right'},
  rush:  {id:12, name:'Rush',   icon:'\u00bb', col:'#ff8f2e', deep:'#a84800', dur:6000,  hit:'Rushed',  note:'makes the other pieces fall fast'},
  shield:{id:13, name:'Shield', icon:'\u25c8', col:'#3fe28d', deep:'#0e7a45', self:true, dur:10000, note:'wipes your incoming garbage and blocks attacks'},
  blast: {id:14, name:'Blast',  icon:'\u2738', col:'#4cc8ff', deep:'#0a6aa3', self:true,  note:'clears your bottom two rows'}
};
var POWER_KEYS=['fill','flip','swap','rush','shield','blast'], POWER_BY_ID={};
POWER_KEYS.forEach(function(k){POWER_BY_ID[POWERS[k].id]=k;});
/* Colour packs: each player picks one on their phone. Order: I, O, T, S, Z, J, L, garbage. Power colours stay the same in every pack. */
var PACKS={
  classic:{name:'Classic', c:[PAL[1],PAL[2],PAL[3],PAL[4],PAL[5],PAL[6],PAL[7],PAL[8]]},
  neon:   {name:'Neon',    c:['#00f0ff','#fff200','#d000ff','#39ff14','#ff1f4b','#3d6bff','#ff9100','#3a404d']},
  pastel: {name:'Pastel',  c:['#a5dcf7','#ffe8a3','#d9c2ff','#b2ebc1','#ffb3ae','#b3c8ff','#ffd0a6','#6d7684']},
  sunset: {name:'Sunset',  c:['#ffcf5c','#ffa62b','#ff5e7e','#ff8a65','#c77dff','#ff7aa8','#ffc4a3','#4d3d52']},
  retro:  {name:'Retro',   c:['#c7f0a5','#9bbc0f','#7da35c','#5e8f3c','#3f7a3a','#2f6a4f','#a3c46b','#2a3d2a']},
  clear:  {name:'Clear',   c:['#56b4e9','#f0e442','#cc79a7','#009e73','#d55e00','#0072b2','#e69f00','#5f6670']}
};
var PACK_KEYS=['classic','neon','pastel','sunset','retro','clear'];
function packPal(k){var pk=PACKS[k]||PACKS.classic; return [null].concat(pk.c);}

/* ------------------------------------------------------------- engine */
var SHAPES={
  I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O:[[1,1],[1,1]],
  T:[[0,1,0],[1,1,1],[0,0,0]],
  S:[[0,1,1],[1,1,0],[0,0,0]],
  Z:[[1,1,0],[0,1,1],[0,0,0]],
  J:[[1,0,0],[1,1,1],[0,0,0]],
  L:[[0,0,1],[1,1,1],[0,0,0]]
};
var IDS={I:1,O:2,T:3,S:4,Z:5,J:6,L:7};
var ORDER=['I','O','T','S','Z','J','L'];
var KICKS=[[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1]];
function rot(m){var n=m.length,o=[],r,c;for(r=0;r<n;r++)o.push(new Array(n).fill(0));for(r=0;r<n;r++)for(c=0;c<n;c++)o[c][n-1-r]=m[r][c];return o;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* o (optional): cols, spawnAt/spawnW (the columns a new piece is centred over), shared (an object whose .board this lane uses
   instead of its own; co-op), noSpawn (the caller spawns the first piece). */
function Game(seed,o){
  o=o||{};
  this.cols=o.cols||COLS; this.spawnAt=o.spawnAt||0; this.spawnW=o.spawnW||this.cols;
  if(o.shared)Object.defineProperty(this,'board',{get:function(){return o.shared.board;},set:function(v){o.shared.board=v;}});
  else{this.board=[]; for(var r=0;r<ROWS;r++)this.board.push(new Array(this.cols).fill(0));}
  this.rng=mulberry32(seed); this.bag=[]; this.queue=[]; this.cur=null;
  this.pending=0; this.incoming=[]; this.lines=0; this.sent=0; this.over=false; this.level=1;
  this.lastFall=0; this.groundAt=null; this.resets=0; this.fx=null; this.started=false;
  this.held=null; this.canHold=true; this.sfx=function(){};
  this.onSend=function(){}; this.onOver=function(){}; this.onLock=function(){};
  this.powers=!!o.powers; this.prng=mulberry32((seed^0x5bd1e995)>>>0); this.qsp=[]; this.sinceSp=0; this.heldSp=false;
  this.effects={}; this.banner=null; this.burst=null; this.filled=null; this.blasted=0; this.hits=0; this.lastHit=null;
  this.onPower=function(){}; this.pal=null;
  if(!o.noSpawn)this.spawn();
}
Game.prototype.refill=function(){
  while(this.queue.length<5){
    if(!this.bag.length){
      var b=ORDER.slice();
      for(var i=b.length-1;i>0;i--){var j=Math.floor(this.rng()*(i+1));var t=b[i];b[i]=b[j];b[j]=t;}
      this.bag=b;
    }
    var sp=false;
    if(this.powers){this.sinceSp++; if(this.sinceSp>=POWER_GAP&&this.prng()<POWER_CHANCE){sp=true;this.sinceSp=0;}}
    this.queue.push(this.bag.pop()); this.qsp.push(sp);
  }
};
function collideOn(board,m,x,y){
  for(var r=0;r<m.length;r++)for(var c=0;c<m[r].length;c++){
    if(!m[r][c])continue;
    var nx=x+c, ny=y+r;
    if(nx<0||nx>=board[0].length||ny>=ROWS)return true;
    if(ny>=0&&board[ny][nx])return true;
  }
  return false;
}
Game.prototype.collide=function(m,x,y){return collideOn(this.board,m,x,y);};
Game.prototype.spawn=function(forced,forcedSp){
  var t=forced, sp=!!forcedSp;
  if(!t){this.refill(); t=this.queue.shift(); sp=!!this.qsp.shift(); this.refill();}
  var m=SHAPES[t].map(function(r){return r.slice();});
  this.cur={t:t,m:m,x:this.spawnAt+Math.floor((this.spawnW-m.length)/2),y:t==='I'?-1:0,sp:sp};
  if(sp){this.cur.spT0=gameNow(); this.cur.spOff=Math.floor(this.prng()*POWER_KEYS.length);}
  this.groundAt=null; this.resets=0; this.lastFall=gameNow();
  return !this.collide(this.cur.m,this.cur.x,this.cur.y);
};
Game.prototype.touchReset=function(){if(this.groundAt!=null&&this.resets<12){this.groundAt=null;this.resets++;}};
Game.prototype.move=function(dx){if(this.over)return;var c=this.cur;if(!this.collide(c.m,c.x+dx,c.y)){c.x+=dx;this.touchReset();this.sfx('move');}};
Game.prototype.hold=function(){
  if(this.over||!this.canHold)return;
  var t=this.cur.t, sp=!!this.cur.sp, ok;
  if(this.held){var h=this.held, hs=this.heldSp; this.held=t; this.heldSp=sp; ok=this.spawn(h,hs);}
  else{this.held=t; this.heldSp=sp; ok=this.spawn();}
  this.canHold=false; this.sfx('hold');
  if(!ok)this.die();
};
Game.prototype.soft=function(){if(this.over)return;var c=this.cur;if(!this.collide(c.m,c.x,c.y+1)){c.y++;this.lastFall=gameNow();}};
Game.prototype.rotate=function(dir){
  if(this.over)return;
  var c=this.cur; if(c.t==='O')return;
  var m=dir>0?rot(c.m):rot(rot(rot(c.m)));
  for(var i=0;i<KICKS.length;i++){
    var k=KICKS[i];
    if(!this.collide(m,c.x+k[0],c.y+k[1])){c.m=m;c.x+=k[0];c.y+=k[1];this.touchReset();this.sfx('rotate');return;}
  }
};
Game.prototype.hard=function(){
  if(this.over)return;
  var c=this.cur, y0=c.y;
  while(!this.collide(c.m,c.x,c.y+1))c.y++;
  this.fx={t:gameNow(),col:PAL[IDS[c.t]],m:c.m,x:c.x,y0:y0,y1:c.y};
  this.sfx('hard',c.y-y0);
  this.lock();
};
Game.prototype.receive=function(n){
  if(this.fxOn('shield'))return;                 /* the shield swallows garbage */
  n=Math.min(n,GARBAGE_CAP-this.pending); if(n<=0)return;
  this.incoming.push({n:n,t:gameNow()}); this.pending+=n;
};
Game.prototype.cancel=function(n){        /* oldest garbage goes first; returns what is left over */
  while(n>0&&this.incoming.length){var e=this.incoming[0], k=Math.min(n,e.n); e.n-=k; n-=k; this.pending-=k; if(!e.n)this.incoming.shift();}
  return n;
};
Game.prototype.armed=function(){          /* rows whose delay has run out */
  var now=gameNow(), a=0;
  this.incoming.forEach(function(e){if(now-e.t>=GARBAGE_DELAY_MS)a+=e.n;});
  return a;
};
Game.prototype.addGarbage=function(k){
  var topOut=false, hole=Math.floor(Math.random()*this.cols);   /* one shared hole per batch: easier to dig, so games run longer */
  for(var i=0;i<k;i++){
    var out=this.board.shift();
    if(out.some(function(v){return v;}))topOut=true;
    var row=new Array(this.cols).fill(8); row[hole]=0;
    this.board.push(row);
  }
  return topOut;
};
/* clears full rows; powers whose blocks were in them are queued in this.fired, and the rest of those blocks go grey */
Game.prototype.clearFull=function(){
  var fired=this.fired||(this.fired=[]);
  var kept=this.board.filter(function(row){
    if(!row.every(function(v){return v;}))return true;
    row.forEach(function(v){var k=POWER_BY_ID[v]; if(k&&fired.indexOf(k)<0)fired.push(k);});
    return false;
  }), n=ROWS-kept.length;
  while(kept.length<ROWS)kept.unshift(new Array(this.cols).fill(0));
  this.board=kept;
  if(fired.length)this.board.forEach(function(row){for(var c=0;c<row.length;c++){var k=POWER_BY_ID[row[c]]; if(k&&fired.indexOf(k)>=0)row[c]=CELL_SPENT;}});
  return n;
};
Game.prototype.lock=function(){
  var c=this.cur, topOut=false, r, cc;
  var pw=c.sp?powerAt(c,gameNow()).p:null, val=pw?POWERS[pw].id:IDS[c.t];
  for(r=0;r<c.m.length;r++)for(cc=0;cc<c.m[r].length;cc++){
    if(!c.m[r][cc])continue;
    var y=c.y+r;
    if(y<0){topOut=true;continue;}
    this.board[y][c.x+cc]=val;
  }
  if(topOut){this.die();return;}
  if(pw){this.burst={t:gameNow(),p:pw,x:c.x+c.m.length/2,y:c.y+c.m.length/2}; this.banner={p:pw,t:gameNow(),mode:'armed'}; this.sfx('arm',pw);}
  this.fired=[];
  var n=this.clearFull();
  if(n)this.lines+=n;
  this.onLock(n);
  var fired=this.fired; this.fired=[];
  for(var f=0;f<fired.length;f++)n+=this.usePower(fired[f]);
  if(n){
    var s=this.cancel(GARBAGE_TABLE[Math.min(n,GARBAGE_TABLE.length-1)]);
    if(s>0){this.sent+=s; this.onSend(s);}
    this.sfx('clear',n);
  }else{
    this.sfx('lock');
    var g=Math.min(this.armed(),GARBAGE_PER_LOCK);
    if(g>0){
      this.cancel(g);
      this.sfx('garbage',g);
      if(this.addGarbage(g)){this.die();return;}
    }
  }
  this.canHold=true;
  if(!this.spawn())this.die();
};
/* a power goes off (its line was cleared): self powers act here, the rest go to the opponent through onPower. Returns extra lines cleared. */
Game.prototype.usePower=function(pw){
  var P=POWERS[pw], now=gameNow(), extra=0, r, c;
  this.banner={p:pw,t:now,mode:P.self?'self':'send'};
  this.sfx('power',pw);
  if(pw==='fill'){
    var top=ROWS; for(r=0;r<ROWS;r++)if(this.board[r].some(function(v){return v;})){top=r;break;}
    var low=ROWS, changed=[], best=-1, well=this.cols-1, self=this;
    function count(row){return self.board[row].filter(function(v){return v;}).length;}
    while(low-1>=top&&ROWS-(low-1)<=FILL_ROWS&&count(low-1)*2>=self.cols)low--;   /* the solid part of the stack, at most FILL_ROWS rows */
    for(c=0;c<this.cols;c++){                      /* the well goes where most gaps already are (rightmost on a tie) */
      var empty=0; for(r=low;r<ROWS;r++)if(!this.board[r][c])empty++;
      if(empty>=best){best=empty;well=c;}
    }
    for(r=low;r<ROWS&&top<ROWS;r++)for(c=0;c<this.cols;c++){
      if(c===well){if(this.board[r][c]){this.board[r][c]=0;changed.push([r,c]);}}
      else if(!this.board[r][c]){this.board[r][c]=CELL_FILLED;changed.push([r,c]);}
    }
    for(r=top;r<low;r++)if(this.board[r][well]){this.board[r][well]=0;changed.push([r,well]);}   /* keep the well open to the top */
    this.filled={t:now,cells:changed};
  }else if(pw==='blast'){
    this.board.splice(ROWS-2,2);
    this.board.unshift(new Array(this.cols).fill(0),new Array(this.cols).fill(0));
    this.blasted=now;
  }else if(pw==='shield'){
    this.incoming=[]; this.pending=0; this.effects.shield=now+P.dur;
  }else this.onPower(pw);
  return extra;
};
/* an attack from the other player; returns false when the shield blocked it */
Game.prototype.hit=function(pw){
  var P=POWERS[pw]; if(!P||P.self||this.over)return false;
  var now=gameNow();
  if(this.fxOn('shield')){this.banner={p:'shield',t:now,mode:'block'};this.sfx('block');return false;}
  this.effects[pw]=now+P.dur; this.banner={p:pw,t:now,mode:'hit'}; this.hits++; this.lastHit=pw;
  this.sfx('zap',pw);
  return true;
};
Game.prototype.fxOn=function(k){return (this.effects[k]||0)>gameNow();};
Game.prototype.revive=function(){
  for(var r=0;r<ROWS;r++)this.board[r].fill(0);
  this.effects={};
  this.incoming=[]; this.pending=0; this.held=null; this.canHold=true; this.fx=null;
  this.over=false; this.koUntil=0; this.spawn();
};
Game.prototype.die=function(){
  if(this.over)return;
  this.over=true;
  this.onOver();
};
Game.prototype.apply=function(k){
  if(this.over)return;
  if(this.fxOn('swap')){if(k==='L')k='R';else if(k==='R')k='L';}
  if(k==='L')this.move(-1);
  else if(k==='R')this.move(1);
  else if(k==='D')this.soft();
  else if(k==='U')this.rotate(1);
  else if(k==='Z')this.rotate(-1);
  else if(k==='H')this.hard();
  else if(k==='C')this.hold();
};
Game.prototype.tick=function(ts,t0){
  if(this.over)return;
  if(!this.started){this.started=true;this.lastFall=ts;}
  this.level=this.levelOverride||(1+Math.floor(this.lines/LEVEL_EVERY_LINES)+Math.floor((ts-t0)/LEVEL_EVERY_MS));
  var iv=Math.max(GRAVITY_MIN,GRAVITY_START-(this.level-1)*GRAVITY_STEP), c=this.cur;
  if(this.fxOn('rush'))iv=Math.max(45,iv/4);
  if(ts-this.lastFall>=iv){this.lastFall=ts;if(!this.collide(c.m,c.x,c.y+1))c.y++;}
  if(this.collide(c.m,c.x,c.y+1)){
    if(this.groundAt==null)this.groundAt=ts;
    else if(ts-this.groundAt>=LOCK_MS)this.lock();
  }else this.groundAt=null;
};

/* ------------------------------------------------------------- co-op */
/* Co-op: both players drop pieces into one COOP_COLS-wide board and clear lines together. Each player is a Game lane that shares
   the board, so moving, rotating, holding and locking work as in versus. Falling pieces pass through each other and only meet the
   board; when one locks where the other is falling, the other is lifted clear. Each lane spawns over its own half of the board.
   Speed rises with lines and time; the run ends when the stack tops out.
   Co-op against the computer pits two of these boards against each other as teams: lines send garbage to the other team (it goes
   to whichever lane has less waiting), power pieces work as in versus (an attack hits both lanes; a Shield covers both), and with KO
   rules a topped-out team board is cleared and the other team scores a KO. o (optional): powers. */
var COOP_COLS=16, COOP_LEVEL_LINES=12;
function CoopGame(seed,o){
  var co=this, r; o=o||{};
  this.board=[]; for(r=0;r<ROWS;r++)this.board.push(new Array(COOP_COLS).fill(0));
  this.lines=0; this.level=1; this.levelOverride=0; this.over=false; this.koUntil=0; this.pal=null; this.notice=null;
  this.onOver=function(){}; this.sfx=function(){}; this.onSend=function(){}; this.onPower=function(){};
  this.p=[0,1].map(function(i){
    var half=COOP_COLS/2, g=new Game(seed+i,{cols:COOP_COLS,shared:co,spawnAt:i*half,spawnW:half,powers:!!o.powers});
    g.seat=i;
    g.sfx=function(n,a){co.sfx(i,n,a);};
    g.onLock=function(n){co.locked(i,n);};
    g.onOver=function(){co.die();};
    g.onSend=function(n){co.onSend(n);};
    g.onPower=function(pw){co.onPower(pw);};
    var rise=g.addGarbage;
    g.addGarbage=function(k){var out=rise.call(g,k); co.lift(1-i); return out;};
    var use=g.usePower;
    g.usePower=function(pw){                        /* a Shield covers the whole team */
      var x=use.call(g,pw);
      if(pw==='shield'){var t=co.p[1-i]; t.effects.shield=g.effects.shield; t.incoming=[]; t.pending=0;}
      return x;
    };
    return g;
  });
}
CoopGame.prototype.receive=function(n){var a=this.p[0], b=this.p[1]; (a.pending<=b.pending?a:b).receive(n);};
CoopGame.prototype.hit=function(pw){var ok=false; this.p.forEach(function(g){if(g.hit(pw))ok=true;}); return ok;};
CoopGame.prototype.fxOn=function(k){return this.p.some(function(g){return g.fxOn(k);});};
CoopGame.prototype.pendingAll=function(){return this.p[0].pending+this.p[1].pending;};
CoopGame.prototype.armedAll=function(){return this.p[0].armed()+this.p[1].armed();};
CoopGame.prototype.sentAll=function(){return this.p[0].sent+this.p[1].sent;};
CoopGame.prototype.revive=function(){              /* KO: clear the board and start both lanes again */
  for(var r=0;r<ROWS;r++)this.board[r].fill(0);
  this.over=false; this.koUntil=0;
  this.p.forEach(function(g){g.revive();});
};
CoopGame.prototype.locked=function(i,n){
  var co=this;
  if(n){this.lines+=n;}
  this.p.forEach(function(g){g.lines=co.lines;});
  this.lift(1-i);
};
/* the board changed under lane i's falling piece (a piece placed over it, rows shifting, garbage rising): lift it clear */
CoopGame.prototype.lift=function(i){
  var o=this.p[i], c=o.cur;
  if(!c||o.over)return;
  while(collideOn(this.board,c.m,c.x,c.y)&&c.y>-4)c.y--;
  if(collideOn(this.board,c.m,c.x,c.y))this.die();
};
CoopGame.prototype.die=function(){
  if(this.over)return;
  this.over=true; this.p.forEach(function(g){g.over=true;});
  this.onOver();
};
CoopGame.prototype.apply=function(i,k){
  var g=this.p[i]; if(this.over||!g||g.over)return;
  g.apply(k);
};
CoopGame.prototype.tick=function(ts,t0){
  if(this.over)return;
  this.level=this.levelOverride||(1+Math.floor(this.lines/COOP_LEVEL_LINES)+Math.floor((ts-t0)/LEVEL_EVERY_MS));
  for(var i=0;i<2;i++){
    if(this.over)return;
    var g=this.p[i];
    g.levelOverride=this.level;
    g.tick(ts,t0);
  }
};

/* ------------------------------------------------------------- computer player */
/* The bot tries every rotation and column for its piece (and for the hold piece), scores each resulting board on height, holes and
   bumpiness, then plays the best spot through the same inputs a phone sends, one step at a time. When its stack is low it leaves the
   right-hand column open and holds out for multi-line clears, because singles send nothing. Difficulty sets how quickly it thinks and
   moves, and how often it settles for a worse spot. */
var CPU={
  easy:  {think:700,step:190,slip:0.35,hold:false,greed:0},
  normal:{think:380,step:110,slip:0.12,hold:true, greed:0.6, adapt:true},
  hard:  {think:170,step:55, slip:0,   hold:true, greed:1,   adapt:true}
};
var CPU_NAME={easy:'Easy',normal:'Normal',hard:'Hard'};
/* Board score: El-Tetris weights (landing height, rows cleared, row and column transitions, holes, wells). */
function evalBoard(b,n,land,greed){
  var W=b[0].length, rowT=0, colT=0, holes=0, wells=0, max=0, r, c;
  for(r=0;r<ROWS;r++){
    var prev=1;
    for(c=0;c<W;c++){var f=b[r][c]?1:0; if(f!==prev)rowT++; prev=f;}
    if(!prev)rowT++;
  }
  for(c=0;c<W;c++){
    var above=0, seen=false;
    for(r=0;r<ROWS;r++){
      var v=b[r][c]?1:0;
      if(v&&!seen){seen=true; if(ROWS-r>max)max=ROWS-r;}
      if(v!==above)colT++;
      if(!v&&seen)holes++;
      above=v;
    }
    if(!above)colT++;
  }
  var well=greed>0&&max+n<=9;               /* stack is low: keep the right-hand column open and hold out for multi-line clears */
  for(c=0;c<W;c++){
    if(well&&c===W-1)continue;
    var depth=0;
    for(r=0;r<ROWS;r++){
      var l=c===0||b[r][c-1], rt=c===W-1||b[r][c+1];
      if(!b[r][c]&&l&&rt){depth++; wells+=depth;}else if(b[r][c])break;else depth=0;
    }
  }
  var s=-4.5*land+3.42*n-3.22*rowT-9.35*colT-7.9*holes-3.39*wells;
  if(well){
    var h9=0; for(r=0;r<ROWS;r++)if(b[r][W-1]){h9=ROWS-r;break;}
    s+=greed*([0,-14,-10,4,40][n]-6*h9);
  }
  return s;
}
function placements(board,t,greed){
  var m=SHAPES[t].map(function(r){return r.slice();}), out=[], spins=t==='O'?1:4;
  for(var k=0;k<spins;k++){
    var top=0; while(!m[top].some(function(v){return v;}))top++;
    var bot=m.length-1; while(!m[bot].some(function(v){return v;}))bot--;
    for(var x=-2;x<board[0].length;x++){
      if(collideOn(board,m,x,0))continue;
      var y=0; while(!collideOn(board,m,x,y+1))y++;
      var b=board.map(function(row){return row.slice();}), r, c;
      for(r=0;r<m.length;r++)for(c=0;c<m[r].length;c++)if(m[r][c])b[y+r][x+c]=1;
      var kept=b.filter(function(row){return !row.every(function(v){return v;});}), n=ROWS-kept.length;
      while(kept.length<ROWS)kept.unshift(new Array(board[0].length).fill(0));
      out.push({m:m,x:x,s:evalBoard(kept,n,ROWS-(y+(top+bot)/2),greed)});
    }
    m=rot(m);
  }
  return out;
}
function sameMat(a,b){return a.length===b.length&&a.every(function(row,r){return row.every(function(v,c){return v===b[r][c];});});}
function Bot(g,level){this.g=g;this.cfg=CPU[level];this.zone=g.seat!=null&&g.cols===COOP_COLS?[g.seat*COOP_COLS/2,g.seat*COOP_COLS/2+COOP_COLS/2-1]:null;this.piece=null;this.plan=null;this.next=0;}
Bot.prototype.pick=function(t){
  var list=placements(this.g.board,t,this.cfg.greed); if(!list.length)return null;
  if(this.zone){                                  /* co-op lanes: keep to this lane's half when there is a spot there */
    var z=this.zone, inZone=list.filter(function(o){var w=0;o.m.forEach(function(row){row.forEach(function(v,c){if(v)w=Math.max(w,c);});});return o.x>=z[0]-1&&o.x+w<=z[1]+1;});
    if(inZone.length)list=inZone;
  }
  list.sort(function(a,b){return b.s-a.s;});
  if(this.cfg.slip&&Math.random()<this.cfg.slip)return list[Math.floor(Math.random()*Math.min(4,list.length))];
  return list[0];
};
Bot.prototype.decide=function(){
  var g=this.g, best=this.pick(g.cur.t);
  if(this.cfg.hold&&g.canHold){
    var alt=g.held||g.queue[0];
    if(alt&&alt!==g.cur.t){var b2=this.pick(alt); if(b2&&(!best||b2.s>best.s+0.5))return {hold:true};}
  }
  return best?{m:best.m,x:best.x,spins:0}:{m:g.cur.m,x:g.cur.x,spins:0};
};
Bot.prototype.tick=function(ts){
  var g=this.g; if(g.over)return;
  if(g.cur!==this.piece){this.piece=g.cur;this.plan=this.decide();this.next=ts+this.cfg.think*(0.7+Math.random()*0.6);return;}
  if(ts<this.next)return;
  this.next=ts+this.cfg.step*(0.8+Math.random()*0.4);
  var p=this.plan, c=g.cur;
  if(p.hold){p.hold=false;g.apply('C');return;}
  if(!sameMat(c.m,p.m)&&p.spins<4){p.spins++;g.apply('U');return;}
  if(c.x!==p.x){
    var x0=c.x, dir=c.x<p.x?'R':'L';
    if(this.cfg.adapt&&g.fxOn('swap'))dir=dir==='R'?'L':'R';   /* Normal and Hard notice their controls are swapped */
    g.apply(dir); if(c.x!==x0)return;
  }
  g.apply('H');
};

/* ------------------------------------------------------------- sound */
/* Everything is synthesised with Web Audio, so there are no audio files. Browsers keep audio locked until the page has been clicked or a key pressed once, so the TV page asks for that. Press M to mute. */
var SFX=(function(){
  var ctx=null, master=null, on=true, small=false, unlocked=false, stale=false, api;
  try{on=localStorage.getItem('bd-sound')!=='0';}catch(e){}
  /* Fergie mode (a per-phone choice): each left or right move plays the next step of a tune instead of the usual click. If a MIDI
     file named fergie.mid sits next to server.js, its notes are used, in order (notes starting together play together), each as a
     short pitched click; the file is git-ignored, so it stays on this computer. Without it, this original beat plays. Each step
     lists the hits played together: kick, snare, hat, clap, and bass:N (a note from BASS). Either way, the tune starts again from
     the top after a pause in moving. */
  var BASS=[98,98,116.5,130.8,146.8,87.3];
  var BEAT=[
    ['kick','bass:0'], ['hat'],          ['snare','clap'], ['hat'],
    ['kick','bass:1'], ['kick','bass:2'], ['snare'],        ['hat','bass:3'],
    ['kick','bass:4'], ['hat'],          ['snare','clap'], ['clap'],
    ['kick','bass:5'], ['hat'],          ['snare','clap'], ['hat','bass:3']
  ];
  var beatOn=false, beatI=0, beatAt=0, midiSteps=null, midiTried=false;
  try{beatOn=localStorage.getItem('bd-beat')==='fergie';}catch(e){}
  function loadMidi(){
    if(midiTried)return; midiTried=true;
    fetch('/fergie.mid',{cache:'no-store'}).then(function(r){return r.ok?r.arrayBuffer():null;})
      .then(function(b){if(b){midiSteps=parseMidi(b); if(midiSteps&&!midiSteps.length)midiSteps=null;} if(api&&api.onchange)api.onchange();})
      .catch(function(){});
  }
  if(beatOn)loadMidi();
  function badge(){
    if(api&&api.onchange)api.onchange();
    var el=document.getElementById('snd'); if(!el)return;
    var running=!!ctx&&ctx.state==='running';
    el.textContent=!on?'Sound off · press M':(running?'Sound on · press M to mute':'Click this screen once to turn on sound');
    el.className=running&&on?'ok':'';
  }
  function init(){
    /* iPhone: Web Audio is muted by the silent switch unless the page asks for media playback (Safari 16.4 and later) */
    try{if(navigator.audioSession&&navigator.audioSession.type!=='playback')navigator.audioSession.type='playback';}catch(e){}
    /* After the page was hidden (screen lock, app switch) iOS can leave the context reporting 'running' while it plays nothing,
       so a context that went through that is closed and a fresh one is made inside this tap. */
    if(ctx&&(stale||ctx.state==='interrupted'||ctx.state==='closed')){
      var old=ctx; ctx=null; master=null; unlocked=false;
      try{old.onstatechange=null; old.close();}catch(e){}
    }
    stale=false;
    if(!ctx){
      var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
      ctx=new AC(); master=ctx.createGain(); master.gain.value=small?0.9:0.55; master.connect(ctx.destination);
      ctx.onstatechange=badge;
    }
    if(ctx.state!=='running'&&ctx.state!=='closed'){var r=ctx.resume(); if(r&&r.then)r.then(badge,function(){});}   /* 'suspended', or 'interrupted' after a call or another app */
    if(!unlocked){                         /* older iOS only unlocks once a sound has been started inside a tap */
      try{var b=ctx.createBuffer(1,1,22050), src=ctx.createBufferSource(); src.buffer=b; src.connect(ctx.destination); src.start(0); unlocked=true;}catch(e){}
    }
    badge();
  }
  /* Phone speakers cannot play much below 300 Hz, so on a phone the low thuds are moved up and everything is louder. */
  function phone(){small=true; if(master)master.gain.value=0.9;}
  function reset(){if(ctx)stale=true;}   /* rebuild the context on the next tap */
  document.addEventListener('visibilitychange',function(){if(document.hidden)reset();});
  window.addEventListener('pagehide',reset);
  window.addEventListener('pageshow',function(e){if(e.persisted)reset();});
  function out(pan){
    if(ctx.createStereoPanner&&pan){var p=ctx.createStereoPanner();p.pan.value=pan;p.connect(master);return p;}
    return master;
  }
  function tone(f0,f1,dur,type,vol,pan,delay){
    var t=ctx.currentTime+(delay||0), o=ctx.createOscillator(), g=ctx.createGain();
    if(small){if(f0<300)f0*=2.5; if(f1<300)f1*=2.5; vol=Math.min(0.5,vol*1.6);}
    o.type=type; o.frequency.setValueAtTime(f0,t);
    if(f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+0.008); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t+dur+0.02);
  }
  function noise(dur,vol,pan,fc,delay){
    var t=ctx.currentTime+(delay||0), n=Math.floor(ctx.sampleRate*dur), b=ctx.createBuffer(1,n,ctx.sampleRate), d=b.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
    var s=ctx.createBufferSource(); s.buffer=b;
    var f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=small?Math.max(fc,2500):fc;
    var g=ctx.createGain(); g.gain.value=vol;
    s.connect(f); f.connect(g); g.connect(out(pan)); s.start(t);
  }
  var NOTE={c5:523,e5:659,g5:784,c6:1047,a4:440,f5:698,e4:330,c4:262};
  function hit(v,pan){
    var k=v.split(':');
    switch(k[0]){
      case 'kick': tone(150,48,0.2,'sine',0.55,pan); tone(90,60,0.05,'triangle',0.2,pan); break;
      case 'snare': noise(0.13,0.28,pan,6000); tone(230,180,0.07,'triangle',0.14,pan); break;
      case 'hat': noise(0.035,0.1,pan,14000); break;
      case 'clap': [0,0.011,0.023].forEach(function(d){noise(0.05,0.16,pan,4000,d);}); break;
      case 'bass': {var f=BASS[(+k[1]||0)%BASS.length]; tone(f,f,0.17,'square',0.13,pan); tone(f*2,f*2,0.12,'triangle',0.05,pan); break;}
    }
  }
  function click(n,pan){                          /* one MIDI note as a short pitched click */
    var f=440*Math.pow(2,(n-69)/12);
    tone(f,f,0.07,'triangle',0.22,pan); tone(f*2,f*2,0.04,'sine',0.08,pan); noise(0.012,0.08,pan,9000);
  }
  function beatStep(pan){
    var t=Date.now(); if(t-beatAt>2500)beatI=0;     /* a fresh run of moves starts on the downbeat */
    beatAt=t;
    if(midiSteps)midiSteps[beatI%midiSteps.length].forEach(function(n){click(n,pan);});
    else BEAT[beatI%BEAT.length].forEach(function(v){hit(v,pan);});
    beatI++;
  }
  function play(name,pan,arg){
    if(!on||!ctx||ctx.state!=='running')return;
    switch(name){
      case 'move': if(beatOn){beatStep(pan);break;} tone(900,700,0.03,'square',0.035,pan); break;
      case 'rotate': tone(520,780,0.05,'triangle',0.09,pan); break;
      case 'hold': tone(700,420,0.09,'sine',0.14,pan); tone(420,640,0.09,'sine',0.1,pan,0.07); break;
      case 'lock': tone(180,110,0.07,'triangle',0.16,pan); break;
      case 'hard': tone(160,45,0.16,'sine',0.4,pan); noise(0.08,0.18,pan,1800); break;
      case 'clear': {
        var n=Math.min(4,arg||1), seq=[NOTE.c5,NOTE.e5,NOTE.g5,NOTE.c6];
        for(var i=0;i<n;i++)tone(seq[i],seq[i],0.14,'triangle',0.16,pan,i*0.06);
        if(n===4){tone(NOTE.c6*1.5,NOTE.c6*1.5,0.35,'square',0.07,pan,0.26);noise(0.25,0.12,pan,6000,0.24);}
        break;
      }
      case 'garbage': tone(90,55,0.22,'sawtooth',0.2,pan); noise(0.18,0.2,pan,700); break;
      case 'tick': tone(NOTE.a4,NOTE.a4,0.12,'square',0.08,0); break;
      case 'go': tone(NOTE.a4*2,NOTE.a4*2,0.35,'square',0.1,0); break;
      case 'win': [NOTE.c5,NOTE.e5,NOTE.g5,NOTE.c6].forEach(function(f,i){tone(f,f,0.22,'triangle',0.2,0,i*0.11);}); tone(NOTE.c6,NOTE.c6,0.5,'triangle',0.2,0,0.5); break;
      case 'ko': tone(420,70,0.5,'sawtooth',0.18,pan); noise(0.35,0.22,pan,1200); break;
      case 'power': [784,988,1175,1568].forEach(function(f,i){tone(f,f*1.01,0.12,'triangle',0.13,pan,i*0.045);}); noise(0.2,0.06,pan,9000,0.12); break;
      case 'arm': [988,1319].forEach(function(f,i){tone(f,f,0.09,'triangle',0.08,pan,i*0.05);}); break;
      case 'level': [NOTE.c5,NOTE.g5,NOTE.c6].forEach(function(f,i){tone(f,f,0.14,'square',0.07,0,i*0.08);}); tone(NOTE.c6*1.5,NOTE.c6*1.5,0.3,'triangle',0.1,0,0.24); break;
      case 'zap': tone(1400,180,0.35,'sawtooth',0.12,pan); tone(700,90,0.35,'square',0.06,pan,0.03); noise(0.15,0.12,pan,4000); break;
      case 'block': tone(1320,1320,0.25,'sine',0.16,pan); tone(1980,1980,0.2,'sine',0.08,pan,0.03); break;
      case 'lose': [NOTE.e4,NOTE.c4].forEach(function(f,i){tone(f*1.2,f*0.9,0.3,'sawtooth',0.12,0,i*0.22);}); break;
    }
  }
  function toggle(){on=!on;try{localStorage.setItem('bd-sound',on?'1':'0');}catch(e){} badge();}
  /* phones only unlock audio on the end of a touch (touchend, pointerup, click), not on touchstart */
  ['pointerdown','pointerup','touchstart','touchend','click','keydown'].forEach(function(ev){document.addEventListener(ev,function(e){if(ev==='keydown'&&(e.key==='m'||e.key==='M'))return;init();},{passive:true,capture:true});});   /* capture, so a rebuilt context is ready before the tap's own sound plays */
  document.addEventListener('keydown',function(e){if(e.key==='m'||e.key==='M'){init();toggle();}});
  badge();
  function setBeat(v){beatOn=!!v; beatI=0; try{localStorage.setItem('bd-beat',beatOn?'fergie':'click');}catch(e){} if(beatOn)loadMidi();}
  api={init:init,play:play,toggle:toggle,phone:phone,reset:reset,setBeat:setBeat,beatOn:function(){return beatOn;},beatPos:function(){return beatI;},midiNotes:function(){return midiSteps?midiSteps.length:0;},onchange:null,isOn:function(){return on;},state:function(){return ctx?ctx.state:'none';}};
  return api;
})();


/* Reads a standard MIDI file (format 0 or 1) and returns its note starts in time order, as steps: each step is the list of
   note numbers that begin on the same tick. Everything else in the file is skipped. Returns null if it is not a MIDI file. */
function parseMidi(buf){
  try{
    var d=new DataView(buf), p=0, at={}, MAX=4096;
    function tag(o){return String.fromCharCode(d.getUint8(o),d.getUint8(o+1),d.getUint8(o+2),d.getUint8(o+3));}
    function vlq(){var v=0,b;do{b=d.getUint8(p++);v=(v<<7)|(b&127);}while(b&128);return v;}
    if(tag(0)!=='MThd')return null;
    var tracks=d.getUint16(10); p=8+d.getUint32(4);
    for(var t=0;t<tracks&&p+8<=d.byteLength;t++){
      if(tag(p)!=='MTrk')break;
      var end=p+8+d.getUint32(p+4), tick=0, run=0; p+=8;
      while(p<end){
        tick+=vlq();
        var st=d.getUint8(p);
        if(st&128)p++; else st=run;
        if(st===0xFF){p++; var ml=vlq(); p+=ml; continue;}      /* meta event */
        if(st===0xF0||st===0xF7){var sl=vlq(); p+=sl; continue;} /* sysex */
        run=st;
        var type=st&0xF0, a=d.getUint8(p++), b=(type===0xC0||type===0xD0)?0:d.getUint8(p++);
        if(type===0x90&&b>0){(at[tick]||(at[tick]=[])).push(a);}
      }
      p=end;
    }
    return Object.keys(at).map(Number).sort(function(x,y){return x-y;}).slice(0,MAX).map(function(k){return at[k];});
  }catch(e){return null;}
}

/* ------------------------------------------------------------- canvas */
function setCanvas(cv,w,h){
  var dpr=Math.min(window.devicePixelRatio||1,3);
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
  cv.style.width=w+'px'; cv.style.height=h+'px';
  cv.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
  cv._w=w; cv._h=h;
}

/* ------------------------------------------------------------- drawing */
function cell(ctx,x,y,s,col){
  var hl=Math.max(2,s*0.16), sh=Math.max(2,s*0.12);
  ctx.fillStyle=col; ctx.fillRect(x+0.5,y+0.5,s-1,s-1);
  ctx.fillStyle=C_SHINE; ctx.fillRect(x+0.5,y+0.5,s-1,hl);
  ctx.fillStyle=C_SHADE; ctx.fillRect(x+0.5,y+s-0.5-sh,s-1,sh);
}
function rgbOf(hex){var n=parseInt(hex.slice(1),16);return [n>>16&255,n>>8&255,n&255];}
function mixCol(a,b,k){var x=rgbOf(a),y=rgbOf(b);return 'rgb('+Math.round(x[0]+(y[0]-x[0])*k)+','+Math.round(x[1]+(y[1]-x[1])*k)+','+Math.round(x[2]+(y[2]-x[2])*k)+')';}
/* the colour a power piece shows while it falls: it glides through every power colour */
function shimmerCol(t,off){
  var f=((t/170+(off||0))%POWER_KEYS.length+POWER_KEYS.length)%POWER_KEYS.length, i=Math.floor(f), k=f-i;
  k=k*k*(3-2*k);
  return mixCol(POWERS[POWER_KEYS[i]].col,POWERS[POWER_KEYS[(i+1)%POWER_KEYS.length]].col,k);
}
/* a block left by a power piece: metallic, with a slow light sweep */
function powerCell(ctx,x,y,s,P,t){
  var g=ctx.createLinearGradient(x,y,x+s,y+s);
  g.addColorStop(0,P.col); g.addColorStop(0.55,P.col); g.addColorStop(1,P.deep);
  ctx.fillStyle=g; ctx.fillRect(x+0.5,y+0.5,s-1,s-1);
  ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=1; ctx.strokeRect(x+2,y+2,s-4,s-4);
  var band=((t/1600+(x+y)/(s*40))%1)*s*3-s;
  ctx.save(); ctx.beginPath(); ctx.rect(x+0.5,y+0.5,s-1,s-1); ctx.clip();
  ctx.fillStyle='rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.moveTo(x+band,y); ctx.lineTo(x+band+s*0.35,y); ctx.lineTo(x+band+s*0.35-s,y+s); ctx.lineTo(x+band-s,y+s); ctx.fill();
  ctx.restore();
}
/* a cell of a falling power piece: glow and a glint; col defaults to a colour gliding through all the powers */
function shimmerCell(ctx,x,y,s,t,k,col){
  col=col||shimmerCol(t,k*0.35);
  ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=s*0.7;
  cell(ctx,x,y,s,col);
  ctx.restore();
  var tw=(Math.sin(t/140+k*1.7)+1)/2;
  ctx.fillStyle='rgba(255,255,255,'+(0.35+0.6*tw).toFixed(2)+')';
  var cx=x+s*0.3, cy=y+s*0.3, r=s*(0.12+0.1*tw);
  ctx.beginPath(); ctx.moveTo(cx,cy-r*2); ctx.lineTo(cx+r*0.5,cy); ctx.lineTo(cx,cy+r*2); ctx.lineTo(cx-r*0.5,cy); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx-r*2,cy); ctx.lineTo(cx,cy+r*0.5); ctx.lineTo(cx+r*2,cy); ctx.lineTo(cx,cy-r*0.5); ctx.fill();
}
function drawGrid(cv,cols,cs){
  var ctx=cv.getContext('2d'), r, c;
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
  ctx.strokeStyle=C_GRID; ctx.lineWidth=1; ctx.beginPath();
  for(c=1;c<cols;c++){ctx.moveTo(c*cs+0.5,0);ctx.lineTo(c*cs+0.5,cv._h);}
  for(r=1;r<ROWS;r++){ctx.moveTo(0,r*cs+0.5);ctx.lineTo(cv._w,r*cs+0.5);}
  ctx.stroke();
}
function drawCells(ctx,board,cs,pal){
  var t=gameNow(); pal=pal||PAL;
  for(var r=0;r<ROWS;r++)for(var c=0;c<board[r].length;c++){
    var v=board[r][c]; if(!v)continue;
    if(v>=9&&POWER_BY_ID[v])powerCell(ctx,c*cs,r*cs,cs,POWERS[POWER_BY_ID[v]],t);
    else if(v===CELL_FILLED)powerCell(ctx,c*cs,r*cs,cs,POWERS.fill,0);
    else cell(ctx,c*cs,r*cs,cs,pal[v]||PAL[8]);
  }
}
/* the falling piece and its ghost; mark, if given, outlines the piece in a player's colour (co-op) */
function drawPiece(ctx,g,cur,cs,mark,pal){
  var r, c, t=gameNow(), now=cur.sp&&cur.spT0!=null?powerAt(cur,t):null, col, gy=cur.y, k=0;
  if(now){                                         /* the power it would settle on now, fading into the next just before it changes */
    var a=POWERS[now.p].col, b=POWERS[now.next].col;
    col=now.f>0.82?mixCol(a,b,(now.f-0.82)/0.18):a;
  }else col=cur.sp?shimmerCol(t):(pal||PAL)[IDS[cur.t]];
  while(!g.collide(cur.m,cur.x,gy+1))gy++;
  ctx.strokeStyle=mark||col; ctx.globalAlpha=0.55; ctx.lineWidth=2;
  for(r=0;r<cur.m.length;r++)for(c=0;c<cur.m[r].length;c++){
    if(cur.m[r][c]&&gy+r>=0)ctx.strokeRect((cur.x+c)*cs+2,(gy+r)*cs+2,cs-4,cs-4);
  }
  ctx.globalAlpha=1;
  for(r=0;r<cur.m.length;r++)for(c=0;c<cur.m[r].length;c++){
    if(!cur.m[r][c]||cur.y+r<0)continue;
    if(cur.sp)shimmerCell(ctx,(cur.x+c)*cs,(cur.y+r)*cs,cs,t,k++,now?col:null);
    else cell(ctx,(cur.x+c)*cs,(cur.y+r)*cs,cs,col);
    if(mark){ctx.strokeStyle=mark;ctx.lineWidth=2;ctx.strokeRect((cur.x+c)*cs+1,(cur.y+r)*cs+1,cs-2,cs-2);}
  }
  if(now)drawPowerTag(ctx,cur,cs,now);
}
/* the tag riding on a falling power piece: what it would give now, what comes next, and a bar running down to the switch */
function drawPowerTag(ctx,cur,cs,now){
  var r, c, top=9, bot=-1, minC=9, maxC=-1;
  for(r=0;r<cur.m.length;r++)for(c=0;c<cur.m[r].length;c++)if(cur.m[r][c]){top=Math.min(top,r);bot=Math.max(bot,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);}
  var P=POWERS[now.p], N=POWERS[now.next], h=Math.max(16,Math.round(cs*0.85)), font=Math.round(h*0.6);
  ctx.save();
  ctx.font='800 '+font+'px '+tok('--font-mono','monospace');
  var label=P.icon+' '+P.name.toUpperCase(), w=ctx.measureText(label).width+h*1.6;
  var cx=(cur.x+(minC+maxC+1)/2)*cs, y=(cur.y+top)*cs-h-5;
  if(y<2)y=(cur.y+bot+1)*cs+5;                     /* no room above: hang it below the piece */
  var x=Math.max(2,Math.min((ctx.canvas._w||ctx.canvas.width)-w-2,cx-w/2));
  ctx.globalAlpha=0.94; ctx.fillStyle='rgba(10,13,18,.88)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle=P.col; ctx.lineWidth=1.5; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
  ctx.fillStyle=P.col; ctx.fillRect(x,y+h-3,w*(1-now.f),3);
  ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(label,x+h*0.35,y+h*0.46);
  ctx.globalAlpha=0.6; ctx.fillStyle=N.col; ctx.textAlign='right'; ctx.fillText(N.icon,x+w-h*0.3,y+h*0.46);
  ctx.restore();
}
function drawFx(ctx,g,cs){                       /* hard drop: a streak behind the piece and a puff of dust where it lands */
  if(!g.fx)return;
  var age=gameNow()-g.fx.t;
  if(age>=320){g.fx=null;return;}
  var fm=g.fx.m, rr, cc2, d=age/320;
  ctx.fillStyle=C_FG;
  for(cc2=0;cc2<fm[0].length;cc2++){
    var bot=-1; for(rr=fm.length-1;rr>=0;rr--)if(fm[rr][cc2]){bot=rr;break;}
    if(bot<0)continue;
    var px=(g.fx.x+cc2+0.5)*cs, py=(g.fx.y1+bot+1)*cs-1, spread=cs*(0.2+d*0.9), lift=cs*0.35*Math.sin(d*Math.PI);
    ctx.globalAlpha=0.5*(1-d);
    ctx.beginPath(); ctx.arc(px-spread,py-lift,Math.max(1,cs*0.09*(1-d)),0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(px+spread,py-lift,Math.max(1,cs*0.09*(1-d)),0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  if(age>=240)return;
  var k=1-age/240;
  ctx.fillStyle=g.fx.col;
  for(cc2=0;cc2<fm[0].length;cc2++){
    var top=-1;
    for(rr=0;rr<fm.length;rr++)if(fm[rr][cc2]){top=rr;break;}
    if(top<0)continue;
    var ty=Math.max(0,(g.fx.y0+top)*cs), by=(g.fx.y1+top)*cs;
    if(by>ty){ctx.globalAlpha=0.38*k;ctx.fillRect((g.fx.x+cc2)*cs+2,ty,cs-4,by-ty);}
  }
  ctx.fillStyle=C_FG; ctx.globalAlpha=0.55*k;
  for(rr=0;rr<fm.length;rr++)for(cc2=0;cc2<fm[rr].length;cc2++){
    if(fm[rr][cc2]&&g.fx.y1+rr>=0)ctx.fillRect((g.fx.x+cc2)*cs,(g.fx.y1+rr)*cs,cs,cs);
  }
  ctx.globalAlpha=1;
}
/* power effects on a board: the burst where a power piece settled, the banner, live effects and their countdowns */
function drawPowerFx(ctx,cv,g,cs){
  var now=gameNow(), W=cv._w, H=cv._h, P, age, k, i;
  if(g.fxOn&&g.fxOn('shield')){                   /* shield: a breathing green frame */
    P=POWERS.shield; var pulse=0.55+0.45*Math.sin(now/220);
    ctx.save(); ctx.shadowColor=P.col; ctx.shadowBlur=cs*0.8*pulse; ctx.strokeStyle=P.col; ctx.globalAlpha=0.6+0.4*pulse; ctx.lineWidth=Math.max(3,cs*0.16);
    ctx.strokeRect(2,2,W-4,H-4); ctx.restore();
  }
  if(g.fxOn&&g.fxOn('rush')){                     /* rush: streaks racing down both edges */
    P=POWERS.rush; ctx.save(); ctx.strokeStyle=P.col; ctx.lineWidth=Math.max(2,cs*0.1);
    for(i=0;i<10;i++){
      var y=((now*1.4+i*H/10*1.7)%(H+cs*3))-cs*2, x=i%2?cs*0.35:W-cs*0.35;
      ctx.globalAlpha=0.35+0.25*(i%3)/2; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+cs*2); ctx.stroke();
    }
    ctx.restore();
  }
  if(g.filled){                                    /* fill: the new blocks flash white, then settle */
    age=now-g.filled.t;
    if(age>700)g.filled=null;
    else{ctx.fillStyle='#fff'; ctx.globalAlpha=0.8*(1-age/700); g.filled.cells.forEach(function(h){ctx.fillRect(h[1]*cs,h[0]*cs,cs,cs);}); ctx.globalAlpha=1;}
  }
  if(g.blasted){                                   /* blast: a shockwave off the floor */
    age=now-g.blasted;
    if(age>600)g.blasted=0;
    else{
      k=age/600; P=POWERS.blast;
      var grad=ctx.createLinearGradient(0,H,0,H-cs*6*k-cs);
      grad.addColorStop(0,'rgba(255,255,255,'+(0.9*(1-k)).toFixed(2)+')'); grad.addColorStop(0.4,P.col); grad.addColorStop(1,'rgba(0,0,0,0)');
      ctx.globalAlpha=1-k; ctx.fillStyle=grad; ctx.fillRect(0,H-cs*6*k-cs,W,cs*6*k+cs); ctx.globalAlpha=1;
    }
  }
  if(g.burst){                                     /* the piece settles: a ring and sparks in the power's colour */
    age=now-g.burst.t;
    if(age>750)g.burst=null;
    else{
      k=age/750; P=POWERS[g.burst.p]; var bx=g.burst.x*cs, by=g.burst.y*cs, ease=1-Math.pow(1-k,3);
      ctx.save(); ctx.globalAlpha=1-k; ctx.strokeStyle=P.col; ctx.shadowColor=P.col; ctx.shadowBlur=cs;
      ctx.lineWidth=Math.max(2,cs*0.25*(1-k)); ctx.beginPath(); ctx.arc(bx,by,cs*(0.8+ease*5),0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=P.col;
      for(i=0;i<16;i++){
        var a=i/16*Math.PI*2+i*0.37, d=cs*(0.5+ease*(3+(i%4)));
        ctx.beginPath(); ctx.arc(bx+Math.cos(a)*d,by+Math.sin(a)*d,Math.max(1.5,cs*0.14*(1-k)),0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }
  var badges=[];                                   /* live effects, top left, with seconds left */
  if(g.effects)POWER_KEYS.forEach(function(key){var left=(g.effects[key]||0)-now; if(left>0)badges.push([key,left]);});
  badges.forEach(function(b,j){
    var Pb=POWERS[b[0]], h=Math.max(16,cs*0.9), w=h*2.6, x=cs*0.3, y=cs*0.3+j*(h+4), frac=b[1]/Pb.dur;
    ctx.save(); ctx.globalAlpha=0.92; ctx.fillStyle='rgba(10,13,18,.75)'; ctx.fillRect(x,y,w,h);
    ctx.fillStyle=Pb.col; ctx.fillRect(x,y+h-3,w*frac,3);
    ctx.strokeStyle=Pb.col; ctx.lineWidth=1.5; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
    ctx.fillStyle=Pb.col; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.font='700 '+Math.round(h*0.62)+'px '+tok('--font-mono','monospace');
    ctx.fillText(Pb.icon+' '+Math.ceil(b[1]/1000),x+h*0.3,y+h*0.47); ctx.restore();
  });
  drawNotice(ctx,cv,g,cs);
  if(g.banner){                                    /* the big word in the middle */
    age=now-g.banner.t;
    if(age>1500)g.banner=null;
    else{
      P=POWERS[g.banner.p]; var mode=g.banner.mode;
      var word=mode==='hit'?P.hit+'!':mode==='block'?'Blocked':mode==='send'?P.name+' →':P.name+(mode==='armed'?'':'!');
      var sub=mode==='armed'?(P.self?'clear it to use':'clear it to send'):'';
      var pop=age<180?1.5-0.5*(age/180):1, fade=age>1100?1-(age-1100)/400:1;
      var size=Math.round(Math.min(cs*2.2,W/(word.length*0.62+1.6))*pop);
      ctx.save(); ctx.globalAlpha=Math.max(0,fade); ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.translate(W/2,H*0.42);
      ctx.font='900 '+Math.round(size*0.9)+'px '+tok('--font-display','Impact,sans-serif');
      ctx.fillStyle=P.col; ctx.shadowColor=P.col; ctx.shadowBlur=cs*1.2;
      ctx.fillText(P.icon,0,-size*0.95);
      ctx.font='900 '+size+'px '+tok('--font-display','Impact,sans-serif');
      ctx.lineWidth=Math.max(3,size*0.12); ctx.strokeStyle='rgba(10,13,18,.9)'; ctx.shadowBlur=0; ctx.strokeText(word.toUpperCase(),0,0);
      ctx.shadowBlur=cs; ctx.fillText(word.toUpperCase(),0,0);
      if(sub){
        ctx.font='700 '+Math.max(10,Math.round(size*0.32))+'px '+tok('--font-mono','monospace'); ctx.shadowBlur=0;
        ctx.lineWidth=3; ctx.strokeText(sub.toUpperCase(),0,size*0.8); ctx.fillStyle='#fff'; ctx.fillText(sub.toUpperCase(),0,size*0.8);
      }
      ctx.restore();
    }
  }
}
/* a short notice across the top third of a board, such as a level change */
function drawNotice(ctx,cv,g,cs){
  if(!g.notice)return;
  var age=gameNow()-g.notice.t, W=cv._w, H=cv._h;
  if(age>1800){g.notice=null;return;}
  var pop=age<200?1.4-0.4*(age/200):1, fade=age>1300?1-(age-1300)/500:1, size=Math.round(Math.min(cs*1.8,W/7)*pop);
  ctx.save(); ctx.globalAlpha=Math.max(0,fade); ctx.textAlign='center'; ctx.textBaseline='middle';
  var y=H*0.2, bandH=size*1.9;
  var grad=ctx.createLinearGradient(0,0,W,0);
  grad.addColorStop(0,'rgba(242,177,52,0)'); grad.addColorStop(0.5,'rgba(242,177,52,.28)'); grad.addColorStop(1,'rgba(242,177,52,0)');
  ctx.fillStyle=grad; ctx.fillRect(0,y-bandH/2,W,bandH);
  ctx.font='900 '+size+'px '+tok('--font-display','Impact,sans-serif');
  ctx.lineWidth=Math.max(3,size*0.12); ctx.strokeStyle='rgba(10,13,18,.9)'; ctx.strokeText(g.notice.text.toUpperCase(),0+W/2,y-size*0.15);
  ctx.fillStyle='#f2b134'; ctx.shadowColor='#f2b134'; ctx.shadowBlur=cs; ctx.fillText(g.notice.text.toUpperCase(),W/2,y-size*0.15);
  if(g.notice.sub){
    ctx.shadowBlur=0; ctx.font='700 '+Math.max(10,Math.round(size*0.36))+'px '+tok('--font-mono','monospace');
    ctx.fillStyle='#fff'; ctx.fillText(g.notice.sub.toUpperCase(),W/2,y+size*0.62);
  }
  ctx.restore();
}
/* tells a board (or co-op board) that the level went up */
function levelUp(g,lv){if(g)g.notice={text:'Level '+lv,sub:'Faster',t:gameNow()};}
function drawBoard(cv,g,cs){
  var ctx=cv.getContext('2d');
  drawGrid(cv,g.board[0].length,cs); drawCells(ctx,g.board,cs,g.pal);
  if(g.cur&&!g.over)drawPiece(ctx,g,g.cur,cs,null,g.pal);
  if(g.pending>0){                          /* garbage meter: solid once it can land, faint while it is still on its way */
    var ph=Math.min(g.pending,ROWS)*cs, ah=Math.min(g.armed(),ROWS)*cs, mw=Math.max(4,cs*0.18);
    ctx.fillStyle=C_DANGER; ctx.globalAlpha=0.4; ctx.fillRect(0,cv._h-ph,mw,ph-ah);
    ctx.globalAlpha=1; ctx.fillRect(0,cv._h-ah,mw,ah);
  }
  drawFx(ctx,g,cs);
  drawPowerFx(ctx,cv,g,cs);
}
/* co-op board: both falling pieces, each outlined in its player's colour */
function drawCoop(cv,co,cs){
  var ctx=cv.getContext('2d');
  drawGrid(cv,co.board[0].length,cs); drawCells(ctx,co.board,cs,co.pal);
  for(var i=0;i<2;i++){
    var g=co.p[i];
    if(g.cur&&!co.over)drawPiece(ctx,g,g.cur,cs,co.marks?co.marks[i]:PAL[1+i],co.pal);
    drawFx(ctx,g,cs);
  }
  var pend=co.pendingAll?co.pendingAll():0;
  if(pend>0){                                      /* the team's waiting garbage */
    var ph=Math.min(pend,ROWS)*cs, ah=Math.min(co.armedAll(),ROWS)*cs, mw=Math.max(4,cs*0.18);
    ctx.fillStyle=C_DANGER; ctx.globalAlpha=0.4; ctx.fillRect(0,cv._h-ph,mw,ph-ah);
    ctx.globalAlpha=1; ctx.fillRect(0,cv._h-ah,mw,ah);
  }
  if(co.p[0].effects)co.p.forEach(function(g,i){
    var save=g.notice; g.notice=null;
    if(i===1){var e=g.effects; g.effects={};}     /* the lanes share effects: draw the badges once */
    drawPowerFx(ctx,cv,g,cs);
    if(i===1)g.effects=e;
    g.notice=save;
  });
  drawNotice(ctx,cv,co,cs);
}
/* the board turns upside down while Flip is on (a CSS flip on the element around the canvas) */
function syncFlip(el,g){if(el)el.classList.toggle('flipped',!!(g&&g.fxOn&&g.fxOn('flip')));}
function drawKO(cv,cs){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_SCRIM; ctx.fillRect(0,0,cv._w,cv._h);
  ctx.fillStyle=C_DANGER; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='900 '+Math.round(cs*4)+'px '+tok('--font-display');
  ctx.fillText('KO',cv._w/2,cv._h/2);
}
function drawMini(ctx,t,sp,ox,oy,s,pal,kOff){
  var m=SHAPES[t], minR=9,maxR=-1,minC=9,maxC=-1,r,c,k=0,now=gameNow();
  for(r=0;r<m.length;r++)for(c=0;c<m[r].length;c++)if(m[r][c]){minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);}
  var bw=(maxC-minC+1)*s, bh=(maxR-minR+1)*s;
  ox-=bw/2; oy-=bh/2;
  for(r=minR;r<=maxR;r++)for(c=minC;c<=maxC;c++)if(m[r][c]){
    if(sp)shimmerCell(ctx,ox+(c-minC)*s,oy+(r-minR)*s,s,now,(kOff||0)+k++);
    else cell(ctx,ox+(c-minC)*s,oy+(r-minR)*s,s,(pal||PAL)[IDS[t]]);
  }
}
function drawNext(cv,g,s,count){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
  for(var q=0;q<(count||2);q++){
    var t=g.queue[q]; if(!t)continue;
    drawMini(ctx,t,g.qsp&&g.qsp[q],cv._w/2,q*3*s+1.5*s,s,g.pal,q*4);
  }
}
function drawHold(cv,g,s){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
  var t=g.held; if(!t)return;
  ctx.globalAlpha=g.canHold?1:0.35;
  drawMini(ctx,t,g.heldSp,cv._w/2,cv._h/2,s,g.pal,0);
  ctx.globalAlpha=1;
}
function drawEmptyBoard(cv){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
}
