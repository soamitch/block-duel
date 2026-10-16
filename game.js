/* Block Duel shared code: rules and pacing, the board engine (Game), the computer player (Bot), sound effects (SFX) and canvas drawing.
   Loaded as a plain script by both the TV page (tv.html) and the phone page (play.html), so everything here is a global. */
'use strict';
var COLS=10, ROWS=20, LOCK_MS=500, COUNTDOWN=3000, FORFEIT_MS=10000;
/* Pacing knobs. Garbage sent by lines cleared (index = lines): a single sends nothing, a double 1, a triple 1, a Tetris 3.
   Incoming garbage lands at most GARBAGE_PER_LOCK rows at a time, the queue is capped at GARBAGE_CAP, and speed rises slowly.
   Incoming garbage waits GARBAGE_DELAY_MS before it can land (as in TETR.IO), so there is time to clear lines and cancel it. */
/* KO rules (Tetris Friends style): topping out clears your board after KO_RESPAWN_MS and gives the other player a KO.
   First to KO_TO_WIN wins; when the match time runs out, most KOs wins, then most garbage sent, otherwise it is a draw.
   The match time is picked on the phones from KO_MINUTES (0 means no time limit). */
var KO_TO_WIN=3, KO_MINUTES=[2,3,5,0], KO_RESPAWN_MS=1600;
var GARBAGE_TABLE=[0,0,1,1,3], GARBAGE_PER_LOCK=4, GARBAGE_CAP=10, GARBAGE_DELAY_MS=1500, LEVEL_EVERY_LINES=8, LEVEL_EVERY_MS=90000, GRAVITY_START=800, GRAVITY_STEP=55, GRAVITY_MIN=100;
var css=getComputedStyle(document.documentElement);
function tok(n,fallback){return css.getPropertyValue(n).trim()||fallback||'';}
var PAL=[null,tok('--p1','#4cc9f0'),tok('--p2','#f2b134'),tok('--p3','#b08af0'),tok('--p4','#46d695'),tok('--p5','#ea5a5f'),tok('--p6','#5f8cf0'),tok('--p7','#ff8f4a'),tok('--p8','#566170')];
var C_BOARD=tok('--board','#0b0f14'), C_GRID=tok('--gridline','#18202a'), C_DANGER=tok('--danger','#ea5a5f'), C_SHINE=tok('--shine','rgba(255,255,255,.22)'), C_SHADE=tok('--shade','rgba(0,0,0,.24)'), C_FG=tok('--fg','#e9edf2'), C_SCRIM=tok('--scrim','rgba(10,13,18,.86)');

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

function Game(seed){
  this.board=[]; for(var r=0;r<ROWS;r++)this.board.push(new Array(COLS).fill(0));
  this.rng=mulberry32(seed); this.bag=[]; this.queue=[]; this.cur=null;
  this.pending=0; this.incoming=[]; this.lines=0; this.sent=0; this.over=false; this.level=1;
  this.lastFall=0; this.groundAt=null; this.resets=0; this.fx=null; this.started=false;
  this.held=null; this.canHold=true; this.sfx=function(){};
  this.onSend=function(){}; this.onOver=function(){};
  this.spawn();
}
Game.prototype.refill=function(){
  while(this.queue.length<5){
    if(!this.bag.length){
      var b=ORDER.slice();
      for(var i=b.length-1;i>0;i--){var j=Math.floor(this.rng()*(i+1));var t=b[i];b[i]=b[j];b[j]=t;}
      this.bag=b;
    }
    this.queue.push(this.bag.pop());
  }
};
function collideOn(board,m,x,y){
  for(var r=0;r<m.length;r++)for(var c=0;c<m[r].length;c++){
    if(!m[r][c])continue;
    var nx=x+c, ny=y+r;
    if(nx<0||nx>=COLS||ny>=ROWS)return true;
    if(ny>=0&&board[ny][nx])return true;
  }
  return false;
}
Game.prototype.collide=function(m,x,y){return collideOn(this.board,m,x,y);};
Game.prototype.spawn=function(forced){
  var t=forced;
  if(!t){this.refill(); t=this.queue.shift(); this.refill();}
  var m=SHAPES[t].map(function(r){return r.slice();});
  this.cur={t:t,m:m,x:Math.floor((COLS-m.length)/2),y:t==='I'?-1:0};
  this.groundAt=null; this.resets=0; this.lastFall=performance.now();
  return !this.collide(this.cur.m,this.cur.x,this.cur.y);
};
Game.prototype.touchReset=function(){if(this.groundAt!=null&&this.resets<12){this.groundAt=null;this.resets++;}};
Game.prototype.move=function(dx){if(this.over)return;var c=this.cur;if(!this.collide(c.m,c.x+dx,c.y)){c.x+=dx;this.touchReset();this.sfx('move');}};
Game.prototype.hold=function(){
  if(this.over||!this.canHold)return;
  var t=this.cur.t, ok;
  if(this.held){var h=this.held; this.held=t; ok=this.spawn(h);}
  else{this.held=t; ok=this.spawn();}
  this.canHold=false; this.sfx('hold');
  if(!ok)this.die();
};
Game.prototype.soft=function(){if(this.over)return;var c=this.cur;if(!this.collide(c.m,c.x,c.y+1)){c.y++;this.lastFall=performance.now();}};
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
  this.fx={t:performance.now(),col:PAL[IDS[c.t]],m:c.m,x:c.x,y0:y0,y1:c.y};
  this.thud=performance.now();
  this.sfx('hard',c.y-y0);
  this.lock();
};
Game.prototype.receive=function(n){
  n=Math.min(n,GARBAGE_CAP-this.pending); if(n<=0)return;
  this.incoming.push({n:n,t:performance.now()}); this.pending+=n;
};
Game.prototype.cancel=function(n){        /* oldest garbage goes first; returns what is left over */
  while(n>0&&this.incoming.length){var e=this.incoming[0], k=Math.min(n,e.n); e.n-=k; n-=k; this.pending-=k; if(!e.n)this.incoming.shift();}
  return n;
};
Game.prototype.armed=function(){          /* rows whose delay has run out */
  var now=performance.now(), a=0;
  this.incoming.forEach(function(e){if(now-e.t>=GARBAGE_DELAY_MS)a+=e.n;});
  return a;
};
Game.prototype.addGarbage=function(k){
  var topOut=false, hole=Math.floor(Math.random()*COLS);   /* one shared hole per batch: easier to dig, so games run longer */
  for(var i=0;i<k;i++){
    var out=this.board.shift();
    if(out.some(function(v){return v;}))topOut=true;
    var row=new Array(COLS).fill(8); row[hole]=0;
    this.board.push(row);
  }
  return topOut;
};
Game.prototype.lock=function(){
  var c=this.cur, topOut=false, r, cc;
  for(r=0;r<c.m.length;r++)for(cc=0;cc<c.m[r].length;cc++){
    if(!c.m[r][cc])continue;
    var y=c.y+r;
    if(y<0){topOut=true;continue;}
    this.board[y][c.x+cc]=IDS[c.t];
  }
  if(topOut){this.die();return;}
  var kept=this.board.filter(function(row){return !row.every(function(v){return v;});});
  var n=ROWS-kept.length;
  while(kept.length<ROWS)kept.unshift(new Array(COLS).fill(0));
  this.board=kept;
  if(n){
    this.lines+=n;
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
Game.prototype.revive=function(){
  for(var r=0;r<ROWS;r++)this.board[r].fill(0);
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
  this.level=1+Math.floor(this.lines/LEVEL_EVERY_LINES)+Math.floor((ts-t0)/LEVEL_EVERY_MS);
  var iv=Math.max(GRAVITY_MIN,GRAVITY_START-(this.level-1)*GRAVITY_STEP), c=this.cur;
  if(ts-this.lastFall>=iv){this.lastFall=ts;if(!this.collide(c.m,c.x,c.y+1))c.y++;}
  if(this.collide(c.m,c.x,c.y+1)){
    if(this.groundAt==null)this.groundAt=ts;
    else if(ts-this.groundAt>=LOCK_MS)this.lock();
  }else this.groundAt=null;
};

/* ------------------------------------------------------------- computer player */
/* The bot tries every rotation and column for its piece (and for the hold piece), scores each resulting board on height, holes and
   bumpiness, then plays the best spot through the same inputs a phone sends, one step at a time. When its stack is low it leaves the
   right-hand column open and holds out for multi-line clears, because singles send nothing. Difficulty sets how quickly it thinks and
   moves, and how often it settles for a worse spot. */
var CPU={
  easy:  {think:700,step:190,slip:0.35,hold:false,greed:0},
  normal:{think:380,step:110,slip:0.12,hold:true, greed:0.6},
  hard:  {think:170,step:55, slip:0,   hold:true, greed:1}
};
var CPU_NAME={easy:'Easy',normal:'Normal',hard:'Hard'};
/* Board score: El-Tetris weights (landing height, rows cleared, row and column transitions, holes, wells). */
function evalBoard(b,n,land,greed){
  var rowT=0, colT=0, holes=0, wells=0, max=0, r, c;
  for(r=0;r<ROWS;r++){
    var prev=1;
    for(c=0;c<COLS;c++){var f=b[r][c]?1:0; if(f!==prev)rowT++; prev=f;}
    if(!prev)rowT++;
  }
  for(c=0;c<COLS;c++){
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
  for(c=0;c<COLS;c++){
    if(well&&c===COLS-1)continue;
    var depth=0;
    for(r=0;r<ROWS;r++){
      var l=c===0||b[r][c-1], rt=c===COLS-1||b[r][c+1];
      if(!b[r][c]&&l&&rt){depth++; wells+=depth;}else if(b[r][c])break;else depth=0;
    }
  }
  var s=-4.5*land+3.42*n-3.22*rowT-9.35*colT-7.9*holes-3.39*wells;
  if(well){
    var h9=0; for(r=0;r<ROWS;r++)if(b[r][COLS-1]){h9=ROWS-r;break;}
    s+=greed*([0,-14,-10,4,40][n]-6*h9);
  }
  return s;
}
function placements(board,t,greed){
  var m=SHAPES[t].map(function(r){return r.slice();}), out=[], spins=t==='O'?1:4;
  for(var k=0;k<spins;k++){
    var top=0; while(!m[top].some(function(v){return v;}))top++;
    var bot=m.length-1; while(!m[bot].some(function(v){return v;}))bot--;
    for(var x=-2;x<COLS;x++){
      if(collideOn(board,m,x,0))continue;
      var y=0; while(!collideOn(board,m,x,y+1))y++;
      var b=board.map(function(row){return row.slice();}), r, c;
      for(r=0;r<m.length;r++)for(c=0;c<m[r].length;c++)if(m[r][c])b[y+r][x+c]=1;
      var kept=b.filter(function(row){return !row.every(function(v){return v;});}), n=ROWS-kept.length;
      while(kept.length<ROWS)kept.unshift(new Array(COLS).fill(0));
      out.push({m:m,x:x,s:evalBoard(kept,n,ROWS-(y+(top+bot)/2),greed)});
    }
    m=rot(m);
  }
  return out;
}
function sameMat(a,b){return a.length===b.length&&a.every(function(row,r){return row.every(function(v,c){return v===b[r][c];});});}
function Bot(g,level){this.g=g;this.cfg=CPU[level];this.piece=null;this.plan=null;this.next=0;}
Bot.prototype.pick=function(t){
  var list=placements(this.g.board,t,this.cfg.greed); if(!list.length)return null;
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
  if(c.x!==p.x){var x0=c.x;g.apply(c.x<p.x?'R':'L');if(c.x!==x0)return;}
  g.apply('H');
};

/* ------------------------------------------------------------- sound */
/* Everything is synthesised with Web Audio, so there are no audio files. Browsers keep audio locked until the page has been clicked or a key pressed once, so the TV page asks for that. Press M to mute. */
var SFX=(function(){
  var ctx=null, master=null, on=true, small=false, unlocked=false, stale=false, api;
  try{on=localStorage.getItem('bd-sound')!=='0';}catch(e){}
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
  function play(name,pan,arg){
    if(!on||!ctx||ctx.state!=='running')return;
    switch(name){
      case 'move': tone(900,700,0.03,'square',0.035,pan); break;
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
      case 'lose': [NOTE.e4,NOTE.c4].forEach(function(f,i){tone(f*1.2,f*0.9,0.3,'sawtooth',0.12,0,i*0.22);}); break;
    }
  }
  function toggle(){on=!on;try{localStorage.setItem('bd-sound',on?'1':'0');}catch(e){} badge();}
  /* phones only unlock audio on the end of a touch (touchend, pointerup, click), not on touchstart */
  ['pointerdown','pointerup','touchstart','touchend','click','keydown'].forEach(function(ev){document.addEventListener(ev,function(e){if(ev==='keydown'&&(e.key==='m'||e.key==='M'))return;init();},{passive:true,capture:true});});   /* capture, so a rebuilt context is ready before the tap's own sound plays */
  document.addEventListener('keydown',function(e){if(e.key==='m'||e.key==='M'){init();toggle();}});
  badge();
  api={init:init,play:play,toggle:toggle,phone:phone,reset:reset,onchange:null,isOn:function(){return on;},state:function(){return ctx?ctx.state:'none';}};
  return api;
})();


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
function drawBoard(cv,g,cs){
  var ctx=cv.getContext('2d'), r, c;
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
  ctx.strokeStyle=C_GRID; ctx.lineWidth=1; ctx.beginPath();
  for(c=1;c<COLS;c++){ctx.moveTo(c*cs+0.5,0);ctx.lineTo(c*cs+0.5,cv._h);}
  for(r=1;r<ROWS;r++){ctx.moveTo(0,r*cs+0.5);ctx.lineTo(cv._w,r*cs+0.5);}
  ctx.stroke();
  for(r=0;r<ROWS;r++)for(c=0;c<COLS;c++){var v=g.board[r][c];if(v)cell(ctx,c*cs,r*cs,cs,PAL[v]);}
  var cur=g.cur;
  if(cur&&!g.over){
    var gy=cur.y; while(!g.collide(cur.m,cur.x,gy+1))gy++;
    ctx.strokeStyle=PAL[IDS[cur.t]]; ctx.globalAlpha=0.55; ctx.lineWidth=2;
    for(r=0;r<cur.m.length;r++)for(c=0;c<cur.m[r].length;c++){
      if(cur.m[r][c]&&gy+r>=0)ctx.strokeRect((cur.x+c)*cs+2,(gy+r)*cs+2,cs-4,cs-4);
    }
    ctx.globalAlpha=1;
    for(r=0;r<cur.m.length;r++)for(c=0;c<cur.m[r].length;c++){
      if(cur.m[r][c]&&cur.y+r>=0)cell(ctx,(cur.x+c)*cs,(cur.y+r)*cs,cs,PAL[IDS[cur.t]]);
    }
  }
  if(g.pending>0){                          /* garbage meter: solid once it can land, faint while it is still on its way */
    var ph=Math.min(g.pending,ROWS)*cs, ah=Math.min(g.armed(),ROWS)*cs, mw=Math.max(4,cs*0.18);
    ctx.fillStyle=C_DANGER; ctx.globalAlpha=0.4; ctx.fillRect(0,cv._h-ph,mw,ph-ah);
    ctx.globalAlpha=1; ctx.fillRect(0,cv._h-ah,mw,ah);
  }
  if(g.fx){
    var age=performance.now()-g.fx.t;
    if(age>=240)g.fx=null;
    else{
      var k=1-age/240, fm=g.fx.m, rr, cc2;
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
  }
}
function drawKO(cv,cs){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_SCRIM; ctx.fillRect(0,0,cv._w,cv._h);
  ctx.fillStyle=C_DANGER; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='900 '+Math.round(cs*4)+'px '+tok('--font-display');
  ctx.fillText('KO',cv._w/2,cv._h/2);
}
function drawNext(cv,g,s,count){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
  for(var q=0;q<(count||2);q++){
    var t=g.queue[q]; if(!t)continue;
    var m=SHAPES[t], minR=9,maxR=-1,minC=9,maxC=-1,r,c;
    for(r=0;r<m.length;r++)for(c=0;c<m[r].length;c++)if(m[r][c]){minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);}
    var bw=(maxC-minC+1)*s, bh=(maxR-minR+1)*s;
    var ox=(cv._w-bw)/2, oy=q*3*s+(3*s-bh)/2;
    for(r=minR;r<=maxR;r++)for(c=minC;c<=maxC;c++)if(m[r][c])cell(ctx,ox+(c-minC)*s,oy+(r-minR)*s,s,PAL[IDS[t]]);
  }
}
function drawHold(cv,g,s){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
  var t=g.held; if(!t)return;
  var m=SHAPES[t], minR=9,maxR=-1,minC=9,maxC=-1,r,c;
  for(r=0;r<m.length;r++)for(c=0;c<m[r].length;c++)if(m[r][c]){minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);}
  var ox=(cv._w-(maxC-minC+1)*s)/2, oy=(cv._h-(maxR-minR+1)*s)/2;
  ctx.globalAlpha=g.canHold?1:0.35;
  for(r=minR;r<=maxR;r++)for(c=minC;c<=maxC;c++)if(m[r][c])cell(ctx,ox+(c-minC)*s,oy+(r-minR)*s,s,PAL[IDS[t]]);
  ctx.globalAlpha=1;
}
function drawEmptyBoard(cv){
  var ctx=cv.getContext('2d');
  ctx.fillStyle=C_BOARD; ctx.fillRect(0,0,cv._w,cv._h);
}
