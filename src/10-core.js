/* ==========================================================================
   COUCH CO-OP ENGINE · core
   Tokens, utilities, saves, sound, input (two seats), drawing helpers.
   Everything hangs off one global: Couch.
   ========================================================================== */
'use strict';
const Couch = {};
(() => {
const W = 1920, H = 1080;           // logical screen. Everything is drawn in these units.
const STEP = 1 / 120;               // fixed update step, seconds

// ---- Tokens (dark, low glare; the two players carry the colour) -----------
const T = {
  bg: '#0B0E13', s1: '#11151C', s2: '#171C25', s3: '#202632', bar: '#07090D',
  line: 'rgba(255,255,255,0.07)', line2: 'rgba(255,255,255,0.14)',
  text: '#E4E7ED', muted: '#A0A8B6', faint: '#8A93A3',
  p: ['#6EA2FF', '#F2A93B'],        // P1 blue (circle), P2 amber (diamond)
  pSoft: ['rgba(110,162,255,0.16)', 'rgba(242,169,59,0.16)'],
  good: '#2EBD85', bad: '#F0616D',
};
const FS = { xs: 22, sm: 28, md: 36, lg: 52, xl: 96 };
const FONT = "Geist, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, ui-monospace, monospace";

// ---- Utilities -------------------------------------------------------------
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt),   // frame-rate independent smoothing
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  dist2: (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  approach: (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target)),
  angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; },
  range: (rng, a, b) => a + rng() * (b - a),
  shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  weighted(rng, items, weight) { let t = 0; for (const it of items) t += weight(it); let r = rng() * t; for (const it of items) { r -= weight(it); if (r <= 0) return it; } return items[items.length - 1]; },
  gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
  noise2(x, y, seed = 0) {                    // smooth random field, 0..1, for caves and terrain
    const h = (ix, iy) => { let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  },
  pick: (rng, arr) => arr[Math.floor(rng() * arr.length)],
  time(s) {                                   // 161.34 -> "2:41.3"
    const m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  },
};
function mulberry32(a) {                      // seeded random, so runs can be repeated
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Saves (localStorage, with an in-memory fallback) -----------------------
const Save = {
  KEY: 'couch-coop-v1', persistent: false, data: null,
  load() {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const d = { v: 1, settings: { volume: 7, music: 5, rumble: true, shake: reduced ? 0 : 2, perf: false }, assists: [0, 0], games: {} };
    try {
      localStorage.setItem(this.KEY + ':t', '1'); localStorage.removeItem(this.KEY + ':t');
      this.persistent = true;
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.v === 1) {
          Object.assign(d.settings, s.settings || {});
          if (Array.isArray(s.assists)) d.assists = [s.assists[0] | 0, s.assists[1] | 0];
          if (s.games && typeof s.games === 'object') d.games = s.games;
        }
      }
    } catch (e) { this.persistent = false; }
    this.data = d;
  },
  flush() {
    if (!this.persistent) return;
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { this.persistent = false; }
  },
  peek(id) { return this.data.games[id] || { plays: 0, wins: 0, best: null, data: {} }; },   // read without creating
  game(id) {
    const g = this.data.games;
    if (!g[id]) g[id] = { plays: 0, wins: 0, best: null, data: {} };
    if (!g[id].data) g[id].data = {};
    return g[id];
  },
};

// ---- Sound (synthesised, no files) -----------------------------------------
const Sfx = {
  ctx: null, master: null, musicBus: null, mute: false, _noise: null,
  init() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.ctx.destination);
      this.setVolume(Save.data.settings.volume); this.setMusicVolume(Save.data.settings.music);
    } catch (e) { this.ctx = null; }
  },
  get locked() { return !this.ctx || this.ctx.state !== 'running'; },
  unlock() { if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume().catch(() => {}); } catch (e) {} } },
  setVolume(v) { if (this.master) this.master.gain.value = (v / 10) * 0.6; },
  setMusicVolume(v) { if (this.musicBus) this.musicBus.gain.value = (v / 10) * 0.5; },
  _out(node, o) {                               // o.pan: -1 left .. 1 right;  o.music: goes to the music volume
    const bus = o.music ? this.musicBus : this.master;
    if (o.pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = U.clamp(o.pan, -1, 1); node.connect(p); p.connect(bus); }
    else node.connect(bus);
  },
  tone(f, dur, o = {}) {
    if (this.locked || this.mute) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0), p = o.pitch || 1;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(f * p, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to * p, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); this._out(g, o);
    osc.start(t); osc.stop(t + dur + 0.03);
  },
  noise(dur, o = {}) {
    if (this.locked || this.mute) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    if (!this._noise) {
      this._noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this._noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this._noise; src.loop = true;
    f.type = 'bandpass'; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.25, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); this._out(g, o);
    src.start(t); src.stop(t + dur + 0.03);
  },
  // Named sounds. Games can add their own: Sfx.bank.myThing = o => { ... }
  bank: {
    move: (S, o) => S.tone(520, 0.04, { vol: 0.12, ...o }),
    select: (S, o) => { S.tone(660, 0.07, o); S.tone(990, 0.1, { delay: 0.05, ...o }); },
    back: (S, o) => S.tone(440, 0.09, { to: 300, vol: 0.16, ...o }),
    deny: (S, o) => S.tone(150, 0.13, { type: 'square', vol: 0.09, ...o }),
    join: (S, o) => { S.tone(523, 0.08, o); S.tone(784, 0.14, { delay: 0.07, ...o }); },
    leave: (S, o) => S.tone(392, 0.12, { to: 262, ...o }),
    tick: (S, o) => S.tone(880, 0.03, { vol: 0.08, ...o }),
    ready: (S, o) => { S.tone(587, 0.07, o); S.tone(880, 0.16, { delay: 0.06, ...o }); },
    pickup: (S, o) => S.tone(880, 0.06, { type: 'sine', vol: 0.16, ...o }),
    dash: (S, o) => S.noise(0.14, { freq: 1800, vol: 0.2, ...o }),
    hit: (S, o) => { S.noise(0.2, { freq: 500, vol: 0.3, ...o }); S.tone(120, 0.22, { to: 50, type: 'sawtooth', vol: 0.18, ...o }); },
    down: (S, o) => S.tone(300, 0.45, { to: 70, type: 'sawtooth', vol: 0.16, ...o }),
    revive: (S, o) => [392, 523, 659, 784].forEach((f, i) => S.tone(f, 0.12, { delay: i * 0.06, ...o })),
    open: (S, o) => { S.tone(196, 0.35, { to: 392, vol: 0.2, ...o }); S.noise(0.3, { freq: 300, vol: 0.12, ...o }); },
    win: (S, o) => [523, 659, 784, 1047].forEach((f, i) => S.tone(f, 0.22, { delay: i * 0.11, vol: 0.22, ...o })),
    lose: (S, o) => [392, 330, 262, 196].forEach((f, i) => S.tone(f, 0.26, { delay: i * 0.14, type: 'sawtooth', vol: 0.12, ...o })),
  },
  play(name, o) { const fn = this.bank[name]; if (fn) fn(this, o || {}); },
  // A small step sequencer. A song is { bpm, root (Hz), tracks: [{ notes: [semitones or null, ...], wave, oct, vol, len, at }] }.
  // Sixteen steps to the bar. A track with at: 0.5 only plays once music.intensity reaches 0.5, so games can layer tension.
  music: {
    song: null, step: 0, next: 0, timer: null, intensity: 1,
    play(song) { this.stop(); if (!Sfx.ctx) return; this.song = song; this.step = 0; this.next = 0; this.timer = setInterval(() => this._tick(), 40); },
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.song = null; },
    _tick() {
      const S = Sfx, sg = this.song; if (!sg || S.locked || S.mute) return;
      const c = S.ctx, spb = 60 / sg.bpm / 4;
      if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
      while (this.next < c.currentTime + 0.2) {
        for (const tr of sg.tracks) {
          if ((tr.at || 0) > this.intensity) continue;
          const n = tr.notes[this.step % tr.notes.length]; if (n == null) continue;
          const delay = this.next - c.currentTime;
          if (tr.wave === 'noise') S.noise(tr.len || 0.04, { freq: tr.freq || 7000, q: 1.5, vol: tr.vol || 0.05, delay, music: true });
          else S.tone((sg.root || 110) * Math.pow(2, (n + (tr.oct || 0) * 12) / 12), (tr.len || 1) * spb, { type: tr.wave || 'triangle', vol: tr.vol || 0.08, delay, music: true });
        }
        this.step++; this.next += spb;
      }
    },
  },
};

// ---- Input: devices, two seats ----------------------------------------------
// Buttons use the browser's standard gamepad layout. Games ask a seat, never a device:
//   seat.move.x / .y      left stick (or D-pad), dead zone removed, length 0..1
//   seat.aim.x / .y       right stick
//   seat.pressed('a')     true on the step the button goes down
//   seat.down('a')        true while held;  seat.released('a');  seat.held('a') seconds held
//   seat.value('rt')      analog 0..1 (triggers)
//   seat.rumble(0.6, 150) strength 0..1, milliseconds
const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15 };
const KEYBOARDS = [
  { id: 'kb1', label: 'Keyboard, W A S D', move: ['KeyW', 'KeyS', 'KeyA', 'KeyD'],
    map: { a: 'Space', b: 'KeyQ', x: 'KeyE', y: 'KeyR', lb: 'Digit1', rb: 'Digit2', lt: 'ShiftLeft', rt: 'KeyF', start: 'Escape', select: 'Tab' },
    names: { a: 'Space', b: 'Q', x: 'E', y: 'R', lb: '1', rb: '2', lt: 'Shift', rt: 'F', start: 'Esc', select: 'Tab', move: 'W A S D', aim: 'none' } },
  { id: 'kb2', label: 'Keyboard, arrows', move: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    map: { a: 'Enter', b: 'Backspace', x: 'Period', y: 'Slash', lb: 'BracketLeft', rb: 'BracketRight', lt: 'ShiftRight', rt: 'ControlRight', start: 'KeyP', select: 'Backslash' },
    names: { a: 'Enter', b: 'Bksp', x: '.', y: '/', lb: '[', rb: ']', lt: 'R Shift', rt: 'R Ctrl', start: 'P', select: '\\', move: 'Arrows', aim: 'none' } },
];
const PAD_NAMES = {
  xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', start: 'Start', select: 'Back', move: 'L stick', aim: 'R stick', ls: 'L3', rs: 'R3' },
  ps: { a: '', b: '', x: '', y: '', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', start: 'Options', select: 'Share', move: 'L stick', aim: 'R stick', ls: 'L3', rs: 'R3' },
  nin: { a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', start: '+', select: '−', move: 'L stick', aim: 'R stick', ls: 'L3', rs: 'R3' },
  touch: { a: 'Tap', b: '2-finger tap', x: 'n/a', y: 'n/a', lb: 'n/a', rb: 'n/a', lt: 'n/a', rt: 'n/a', start: 'Tap top right', select: 'n/a', move: 'Drag', aim: 'n/a' },
};

function makeDevice(id, kind, label, type, names) {
  return { id, kind, label, type, names, connected: true, seat: null, pad: null,
    lx: 0, ly: 0, rx: 0, ry: 0, b: new Float32Array(16), pb: new Float32Array(16) };
}
function deadzone(x, y) {                      // radial dead zone, rescaled so there is no jump at the edge
  const m = Math.hypot(x, y), inner = 0.18, outer = 0.95;
  if (m < inner) return [0, 0];
  const s = Math.min(1, (m - inner) / (outer - inner)) / m;
  return [x * s, y * s];
}

class Seat {
  constructor(index) {
    this.index = index; this.device = null;
    this.move = { x: 0, y: 0 }; this.aim = { x: 0, y: 0 };
    this._held = new Float32Array(16); this._navDir = { x: 0, y: 0 }; this._navT = 0; this._nav = { x: 0, y: 0 };
    this.joinT = 9;                           // seconds since joining, for the join pop
  }
  get joined() { return !!this.device; }
  get lost() { return !!this.device && !this.device.connected; }
  get bot() { return !!this.device && this.device.kind === 'bot'; }
  get type() { return this.device ? this.device.type : 'xbox'; }
  down(n) { const d = this.device; return !!d && d.b[BTN[n]] > 0.5; }
  pressed(n) { const d = this.device, i = BTN[n]; return !!d && d.b[i] > 0.5 && d.pb[i] <= 0.5; }
  released(n) { const d = this.device, i = BTN[n]; return !!d && d.b[i] <= 0.5 && d.pb[i] > 0.5; }
  value(n) { const d = this.device; return d ? d.b[BTN[n]] : 0; }
  held(n) { return this._held[BTN[n]]; }
  nav() { return this._nav; }                 // menu steps with auto-repeat: {x:-1|0|1, y:-1|0|1}
  rumble(strength = 0.5, ms = 120, weak) {
    const d = this.device;
    if (!d || !d.pad || !Save.data.settings.rumble) return;
    const va = d.pad.vibrationActuator;
    if (!va || !va.playEffect) return;
    try {
      const p = va.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: U.clamp(strength, 0, 1), weakMagnitude: U.clamp(weak == null ? strength : weak, 0, 1) });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  _update(dt) {
    const d = this.device; this.joinT += dt;
    if (!d || !d.connected) { this.move.x = this.move.y = this.aim.x = this.aim.y = 0; this._nav.x = this._nav.y = 0; this._held.fill(0); return; }
    let mx = d.lx, my = d.ly;
    if (mx === 0 && my === 0) {               // D-pad stands in for the stick
      mx = (d.b[15] > 0.5 ? 1 : 0) - (d.b[14] > 0.5 ? 1 : 0);
      my = (d.b[13] > 0.5 ? 1 : 0) - (d.b[12] > 0.5 ? 1 : 0);
      const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    }
    this.move.x = mx; this.move.y = my; this.aim.x = d.rx; this.aim.y = d.ry;
    for (let i = 0; i < 16; i++) this._held[i] = d.b[i] > 0.5 ? this._held[i] + dt : 0;
    const nx = mx > 0.55 ? 1 : mx < -0.55 ? -1 : 0, ny = my > 0.55 ? 1 : my < -0.55 ? -1 : 0;
    this._nav.x = this._nav.y = 0;
    if (nx !== this._navDir.x || ny !== this._navDir.y) {
      this._navDir.x = nx; this._navDir.y = ny; this._navT = 0.36;
      this._nav.x = nx; this._nav.y = ny;
    } else if (nx || ny) {
      this._navT -= dt;
      if (this._navT <= 0) { this._navT = 0.13; this._nav.x = nx; this._nav.y = ny; }
    }
  }
}

const Input = {
  BTN, devs: new Map(), seats: [new Seat(0), new Seat(1)], keys: new Set(), _fresh: new Set(), _late: new Set(), padsBlocked: false,
  menu: { dx: 0, dy: 0, a: false, b: false, x: false, y: false, start: false, seat: 0 },
  lastType: 'xbox', lastPadType: 'xbox',
  touch: { id: null, x0: 0, y0: 0, x: 0, y: 0, t0: 0, moved: false, two: false, pulse: null, w: 1, h: 1 },

  init(canvas) {
    for (const k of KEYBOARDS) { const d = makeDevice(k.id, 'kb', k.label, 'kb', k.names); d.kb = k; this.devs.set(k.id, d); }
    const used = new Set(); for (const k of KEYBOARDS) { k.move.forEach(c => used.add(c)); Object.values(k.map).forEach(c => used.add(c)); }
    addEventListener('keydown', e => { if (used.has(e.code)) { if (!this.keys.has(e.code)) this._fresh.add(e.code); this.keys.add(e.code); if (!e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault(); } Sfx.unlock(); });
    addEventListener('keyup', e => { if (this._fresh.has(e.code)) this._late.add(e.code); else this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('pointerdown', () => Sfx.unlock());
    const t = this.touch;
    const pos = e => { const r = canvas.getBoundingClientRect(); t.w = r.width; t.h = r.height; return r; };
    canvas.addEventListener('touchstart', e => {
      e.preventDefault(); Sfx.unlock();
      if (!this.devs.has('touch')) this.devs.set('touch', makeDevice('touch', 'touch', 'Touch screen', 'touch', PAD_NAMES.touch));
      if (t.id === null) { const c = e.changedTouches[0]; pos(e); t.id = c.identifier; t.x0 = t.x = c.clientX; t.y0 = t.y = c.clientY; t.t0 = performance.now(); t.moved = false; t.two = false; }
      else t.two = true;
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const c of e.changedTouches) if (c.identifier === t.id) { t.x = c.clientX; t.y = c.clientY; if (Math.hypot(t.x - t.x0, t.y - t.y0) > 18) t.moved = true; }
    }, { passive: false });
    const end = e => {
      for (const c of e.changedTouches) if (c.identifier === t.id) {
        if (!t.moved && performance.now() - t.t0 < 320) t.pulse = t.two ? 'b' : (t.x0 > t.w * 0.82 && t.y0 < t.h * 0.2 ? 'start' : 'a');
        t.id = null;
      }
    };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  },

  poll(dt) {
    for (const d of this.devs.values()) { d.pb.set(d.b); if (d.kind === 'pad') d.seen = false; }
    // Controllers
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { this.padsBlocked = true; }
    for (const p of pads) {
      if (!p || !p.connected) continue;
      let d = this.devs.get('pad' + p.index);
      if (!d) {
        const id = p.id || '';
        const type = /054c|dualsense|dualshock|playstation/i.test(id) ? 'ps' : /057e|nintendo|switch|joy-con/i.test(id) ? 'nin' : 'xbox';
        const label = type === 'ps' ? 'PlayStation controller' : type === 'nin' ? 'Switch controller' : /xbox|045e|xinput/i.test(id) ? 'Xbox controller' : 'Controller';
        d = makeDevice('pad' + p.index, 'pad', label, type, PAD_NAMES[type]); d.rawId = id;
        this.devs.set(d.id, d);
      }
      d.seen = true; d.connected = true; d.pad = p;
      const ax = p.axes || [];
      [d.lx, d.ly] = deadzone(ax[0] || 0, ax[1] || 0);
      [d.rx, d.ry] = deadzone(ax[2] || 0, ax[3] || 0);
      const n = Math.min(16, p.buttons.length);
      for (let i = 0; i < n; i++) { const bt = p.buttons[i]; let v = bt.value || 0; if (bt.pressed && v < 0.5) v = 1; d.b[i] = v; }
    }
    for (const d of this.devs.values()) if (d.kind === 'pad' && !d.seen) { d.connected = false; d.pad = null; d.b.fill(0); d.lx = d.ly = d.rx = d.ry = 0; }
    // Keyboards
    for (const d of this.devs.values()) {
      if (d.kind !== 'kb') continue;
      const k = d.kb, K = this.keys;
      let x = (K.has(k.move[3]) ? 1 : 0) - (K.has(k.move[2]) ? 1 : 0), y = (K.has(k.move[1]) ? 1 : 0) - (K.has(k.move[0]) ? 1 : 0);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      d.lx = x; d.ly = y;
      for (const n in k.map) d.b[BTN[n]] = K.has(k.map[n]) ? 1 : 0;
    }
    for (const d of this.devs.values()) if (d.kind === 'bot') this.readBot(d);
    for (const code of this._late) this.keys.delete(code);   // a tap shorter than one step was still seen once
    this._late.clear(); this._fresh.clear();
    // Touch: drag = stick, tap = A, long press = hold A, two-finger tap = B, tap top right = Start
    const td = this.devs.get('touch');
    if (td) {
      const t = this.touch; td.b.fill(0); td.lx = td.ly = 0;
      if (t.id !== null) {
        if (t.moved) { let x = (t.x - t.x0) / 70, y = (t.y - t.y0) / 70; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } td.lx = x; td.ly = y; }
        else if (performance.now() - t.t0 > 320) td.b[0] = 1;
      }
      if (t.pulse) { td.b[BTN[t.pulse]] = 1; t.pulse = null; }
    }
    // Which kind of device was touched last (drives the button pictures in shared menus)
    for (const d of this.devs.values()) {
      if (!d.connected || d.kind === 'bot') continue;
      for (let i = 0; i < 16; i++) if (d.b[i] > 0.5 && d.pb[i] <= 0.5) { this.lastType = d.type; if (d.kind === 'pad') this.lastPadType = d.type; break; }
    }
    // Seats, and the shared menu signal (either joined player can drive menus)
    const m = this.menu; m.dx = m.dy = 0; m.a = m.b = m.x = m.y = m.start = false;
    for (const s of this.seats) {
      s._update(dt);
      if (!s.joined || s.lost || s.bot) continue;
      const n = s.nav();
      if (!m.dx && n.x) m.dx = n.x;
      if (!m.dy && n.y) m.dy = n.y;
      for (const k of ['a', 'b', 'x', 'y', 'start']) if (s.pressed(k)) { m[k] = true; m.seat = s.index; }
    }
  },

  // A practice bot is a pretend controller. A game steers it by writing to its ctl:
  //   ctl.x, ctl.y (left stick), ctl.ax, ctl.ay (right stick), ctl.set('a', true), ctl.set('rt', 0.6)
  makeBot(i) {
    const d = makeDevice('bot' + i, 'bot', 'Practice bot', 'xbox', PAD_NAMES.xbox);
    d.ctl = { x: 0, y: 0, ax: 0, ay: 0, b: new Float32Array(16),
      set(n, v = true) { this.b[BTN[n]] = v === true ? 1 : v ? +v : 0; }, clear() { this.x = this.y = this.ax = this.ay = 0; this.b.fill(0); } };
    return d;
  },
  addBot(seat) { const d = this.makeBot(seat.index); this.devs.set(d.id, d); this.assign(d, seat); return d; },
  removeBot(seat) { const d = seat.device; if (d && d.kind === 'bot') { this.unassign(seat); this.devs.delete(d.id); } },
  readBot(d) { const c = d.ctl; let x = c.x, y = c.y; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } d.lx = x; d.ly = y; d.rx = c.ax; d.ry = c.ay; d.b.set(c.b); },
  assign(dev, seat) { if (seat.device) seat.device.seat = null; seat.device = dev; dev.seat = seat; seat.joinT = 0; seat._held.fill(0); },
  unassign(seat) { if (seat.device) seat.device.seat = null; seat.device = null; },
  joined() { return this.seats.filter(s => s.joined); },
  // Connected devices nobody has claimed, that pressed A on this step
  joiners() { const out = []; for (const d of this.devs.values()) if (d.connected && !d.seat && d.b[0] > 0.5 && d.pb[0] <= 0.5) out.push(d); return out; },
};

// ---- Drawing helpers ---------------------------------------------------------
const G = {
  c: null,
  _fonts: new Map(),
  font(o = {}) { const k = (o.weight || 400) * 4096 + (o.size || FS.sm) * 2 + (o.mono ? 1 : 0); let f = this._fonts.get(k); if (!f) { f = `${o.weight || 400} ${o.size || FS.sm}px ${o.mono ? MONO : FONT}`; this._fonts.set(k, f); } return f; },
  text(s, x, y, o = {}) {
    const c = this.c;
    c.font = this.font(o); c.fillStyle = o.color || T.text;
    c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'alphabetic';
    const track = 'letterSpacing' in c;
    if (track) c.letterSpacing = (o.track || 0) + 'px';
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.fillText(o.upper ? String(s).toUpperCase() : String(s), x, y);
    if (o.alpha != null) c.globalAlpha = 1;
    if (track) c.letterSpacing = '0px';
  },
  eyebrow(s, x, y, o = {}) { this.text(s, x, y, { size: FS.xs, weight: 500, color: T.muted, track: 1.6, upper: true, ...o }); },
  measure(s, o = {}) {
    const c = this.c; c.font = this.font(o);
    const track = 'letterSpacing' in c; if (track) c.letterSpacing = (o.track || 0) + 'px';
    const w = c.measureText(o.upper ? String(s).toUpperCase() : String(s)).width;
    if (track) c.letterSpacing = '0px';
    return w;
  },
  wrap(s, x, y, maxW, lineH, o = {}, maxLines = 9) {      // returns the number of lines drawn
    const words = String(s).split(' '); let line = '', n = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (line && this.measure(test, o) > maxW) {
        if (n === maxLines - 1) { this.text(line.replace(/[.,;]?$/, '') + '…', x, y + n * lineH, o); return n + 1; }
        this.text(line, x, y + n * lineH, o); n++; line = words[i];
      } else line = test;
    }
    if (line) { this.text(line, x, y + n * lineH, o); n++; }
    return n;
  },
  rrect(x, y, w, h, r, fill, stroke, lw = 2) {
    const c = this.c; c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  },
  circle(x, y, r, fill, stroke, lw = 2) {
    const c = this.c; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  },
  ring(x, y, r, frac, color, lw = 6) {                    // progress ring, clockwise from the top
    const c = this.c; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * U.clamp(frac, 0, 1));
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
  },
  line(x1, y1, x2, y2, color, lw = 2) { const c = this.c; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = lw; c.stroke(); },
  bar(x, y, w, h, frac, color, back = T.s3) {
    this.rrect(x, y, w, h, h / 2, back);
    const f = U.clamp(frac, 0, 1); if (f > 0) this.rrect(x, y, Math.max(h, w * f), h, h / 2, color);
  },
  // A player's mark: P1 is a circle, P2 a diamond. Shape and colour together, never colour alone.
  marker(i, x, y, r, o = {}) {
    const c = this.c, col = o.color || T.p[i];
    c.beginPath();
    if (i === 0) c.arc(x, y, r, 0, Math.PI * 2);
    else { const d = r * 1.18; c.moveTo(x, y - d); c.lineTo(x + d, y); c.lineTo(x, y + d); c.lineTo(x - d, y); c.closePath(); }
    if (o.hollow) { c.strokeStyle = col; c.lineWidth = o.lw || 3; c.stroke(); }
    else { c.fillStyle = col; c.fill(); }
  },
  tick(x, y, s, color) { const c = this.c; c.beginPath(); c.moveTo(x - s, y); c.lineTo(x - s * 0.25, y + s * 0.7); c.lineTo(x + s, y - s * 0.7); c.strokeStyle = color; c.lineWidth = Math.max(3, s * 0.3); c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); c.lineCap = 'butt'; c.lineJoin = 'miter'; },
  // A button picture for a device type. Left edge at x, centred on y. Returns its width.
  glyph(type, btn, x, y, s = 40, o = {}) {
    const c = this.c, names = type === 'kb' ? (o.names || KEYBOARDS[0].names) : (PAD_NAMES[type] || PAD_NAMES.xbox);
    const face = (btn === 'a' || btn === 'b' || btn === 'x' || btn === 'y') && type !== 'kb' && type !== 'touch';
    const fill = o.lit ? (o.color || T.text) : T.s3, ink = o.lit ? T.bg : T.text;
    if (face) {
      const r = s / 2, cx = x + r;
      this.circle(cx, y, r, fill, o.lit ? null : T.line2, 2);
      if (type === 'ps') {
        const k = r * 0.42; c.strokeStyle = ink; c.lineWidth = Math.max(2, s * 0.07); c.beginPath();
        if (btn === 'a') { c.moveTo(cx - k, y - k); c.lineTo(cx + k, y + k); c.moveTo(cx + k, y - k); c.lineTo(cx - k, y + k); }
        else if (btn === 'b') c.arc(cx, y, k * 1.15, 0, Math.PI * 2);
        else if (btn === 'x') c.rect(cx - k, y - k, k * 2, k * 2);
        else { c.moveTo(cx, y - k * 1.2); c.lineTo(cx + k * 1.2, y + k * 0.85); c.lineTo(cx - k * 1.2, y + k * 0.85); c.closePath(); }
        c.stroke();
      } else this.text(names[btn], cx, y + s * 0.03, { size: s * 0.56, weight: 700, color: ink, align: 'center', base: 'middle' });
      return s;
    }
    const label = names[btn] || btn, fo = { size: s * 0.5, weight: 500 };
    const w = Math.max(s, this.measure(label, fo) + s * 0.7);
    this.rrect(x, y - s / 2, w, s, type === 'kb' ? s * 0.2 : s / 2, fill, o.lit ? null : T.line2, 2);
    this.text(label, x + w / 2, y + s * 0.03, { ...fo, color: ink, align: 'center', base: 'middle' });
    return w;
  },
  // A row of "button + what it does" hints. items: [['a','Play'], ['b','Back']]
  hints(x, y, items, type, o = {}) {
    const s = o.size || 36, fo = { size: FS.xs, color: T.muted };
    let total = 0;
    if (o.align === 'right') { for (const [b, l] of items) total += this.glyphWidth(type, b, s, o) + 12 + this.measure(l, fo) + 40; x -= total - 40; }
    for (const [b, l] of items) {
      x += this.glyph(type, b, x, y, s, o) + 12;
      this.text(l, x, y + 1, { ...fo, base: 'middle' });
      x += this.measure(l, fo) + 40;
    }
  },
  glyphWidth(type, btn, s, o = {}) {
    const face = (btn === 'a' || btn === 'b' || btn === 'x' || btn === 'y') && type !== 'kb' && type !== 'touch';
    if (face) return s;
    const names = type === 'kb' ? (o.names || KEYBOARDS[0].names) : (PAD_NAMES[type] || PAD_NAMES.xbox);
    return Math.max(s, this.measure(names[btn] || btn, { size: s * 0.5, weight: 500 }) + s * 0.7);
  },
  panel(x, y, w, h, r = 14) { this.rrect(x, y, w, h, r, 'rgba(17,21,28,0.86)', T.line); },   // the standard HUD box
  // A "press this" bubble for one player, centred on x,y. progress 0..1 draws a hold ring.
  prompt(seat, btn, label, x, y, o = {}) {
    const type = seat.type, names = seat.device ? seat.device.names : undefined, s = 40, col = T.p[seat.index];
    const gw = this.glyphWidth(type, btn, s, { names }), lw = label ? this.measure(label, { size: FS.xs, weight: 500 }) + 12 : 0, w = gw + lw + 28;
    this.rrect(x - w / 2, y - 30, w, 60, 30, 'rgba(7,9,13,0.9)', col, 2);
    this.glyph(type, btn, x - w / 2 + 12, y, s, { names });
    if (label) this.text(label, x - w / 2 + 12 + gw + 10, y + 1, { size: FS.xs, weight: 500, base: 'middle' });
    if (o.progress > 0) this.bar(x - w / 2 + 16, y + 38, w - 32, 6, o.progress, col);
  },
  // Text with a button picture inside it: G.inline(x, y, ['Press ', {btn:'a'}, ' to join'], type, {size})
  inline(x, y, parts, type, o = {}) {
    const size = o.size || FS.sm, s = size * 1.2;
    for (const p of parts) {
      if (typeof p === 'string') { this.text(p, x, y, { ...o, base: 'middle' }); x += this.measure(p, o); }
      else x += this.glyph(type, p.btn, x, y - 1, s, { names: o.names });
    }
    return x;
  },
};

Object.assign(Couch, { W, H, STEP, T, FS, FONT, MONO, U, mulberry32, Save, Sfx, Input, G, BTN, KEYBOARDS, PAD_NAMES, Seat });
})();
