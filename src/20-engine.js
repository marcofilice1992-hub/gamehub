/* ==========================================================================
   COUCH CO-OP ENGINE · world helpers, loop, scenes, game plug-in API
   ========================================================================== */
(() => {
const { W, H, STEP, T, FS, U, Save, Sfx, Input, G, mulberry32 } = Couch;

// ---- Camera that frames both players on one screen ---------------------------
class Camera {
  constructor(o = {}) {
    this.x = o.x || 0; this.y = o.y || 0; this.zoom = o.zoom || 1;
    this.minZoom = o.minZoom || 0.4; this.maxZoom = o.maxZoom || 1;
    this.margin = o.margin == null ? 260 : o.margin;      // world units kept clear around the players
    this.bounds = o.bounds || null;                        // {x,y,w,h} the view may not leave
    this.sx = 0; this.sy = 0; this._seed = Math.random() * 100;
  }
  follow(points, dt, snap) {
    if (!points.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    const z = U.clamp(Math.min(W / (x1 - x0 + 2 * this.margin), H / (y1 - y0 + 2 * this.margin)), this.minZoom, this.maxZoom);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (snap) { this.x = cx; this.y = cy; this.zoom = z; }
    else { this.x = U.damp(this.x, cx, 6, dt); this.y = U.damp(this.y, cy, 6, dt); this.zoom = U.damp(this.zoom, z, 3.5, dt); }
    const b = this.bounds;
    if (b) {
      const hw = W / 2 / this.zoom, hh = H / 2 / this.zoom;
      this.x = b.w <= hw * 2 ? b.x + b.w / 2 : U.clamp(this.x, b.x + hw, b.x + b.w - hw);
      this.y = b.h <= hh * 2 ? b.y + b.h / 2 : U.clamp(this.y, b.y + hh, b.y + b.h - hh);
    }
  }
  begin(c) {
    const tr = Engine.trauma, amp = tr * tr * 24, t = Engine.t;
    this.sx = amp * Math.sin(t * 61 + this._seed); this.sy = amp * Math.sin(t * 47 + this._seed * 2);
    c.save(); c.translate(W / 2 + this.sx, H / 2 + this.sy); c.scale(this.zoom, this.zoom); c.translate(-this.x, -this.y);
  }
  end(c) { c.restore(); }
  toScreen(wx, wy) { return { x: (wx - this.x) * this.zoom + W / 2, y: (wy - this.y) * this.zoom + H / 2 }; }
  toWorld(sx, sy) { return { x: (sx - W / 2) / this.zoom + this.x, y: (sy - H / 2) / this.zoom + this.y }; }
  view() { const w = W / this.zoom, h = H / this.zoom; return { x: this.x - w / 2, y: this.y - h / 2, w, h }; }
  // An arrow at the screen edge pointing at something off screen. Call after end(). Returns true if it drew one.
  indicator(wx, wy, color = T.text, seatIndex) {
    const p = this.toScreen(wx, wy), m = 64;
    if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) return false;
    const x = U.clamp(p.x, m, W - m), y = U.clamp(p.y, m, H - m), a = Math.atan2(p.y - y, p.x - x), c = Engine.c;
    c.beginPath(); c.moveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); c.lineTo(x + Math.cos(a + 2.4) * 22, y + Math.sin(a + 2.4) * 22); c.lineTo(x + Math.cos(a - 2.4) * 22, y + Math.sin(a - 2.4) * 22); c.closePath();
    c.fillStyle = color; c.fill();
    if (seatIndex != null) G.marker(seatIndex, x - Math.cos(a) * 26, y - Math.sin(a) * 26, 10);
    return true;
  }
}

// ---- Particles: a fixed pool, so bursts never allocate -----------------------
class Particles {
  constructor(n = 1500) {
    this.n = n; this.i = 0;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.size = new Float32Array(n); this.drag = new Float32Array(n);
    this.col = new Array(n).fill('#fff');
  }
  emit(x, y, vx, vy, life, size, color, drag = 2.5) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = this.max[i] = life; this.size[i] = size; this.col[i] = color; this.drag[i] = drag;
  }
  burst(x, y, count, o = {}) {
    const a0 = o.angle == null ? 0 : o.angle, spread = o.spread == null ? Math.PI * 2 : o.spread;
    const s0 = o.speed ? o.speed[0] : 80, s1 = o.speed ? o.speed[1] : 320;
    for (let k = 0; k < count; k++) {
      const a = a0 + (Math.random() - 0.5) * spread, s = s0 + Math.random() * (s1 - s0);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, (o.life || 0.5) * (0.6 + Math.random() * 0.8), (o.size || 8) * (0.6 + Math.random() * 0.8), o.color || T.text, o.drag);
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] *= k; this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }
  }
  draw(c) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const a = this.life[i] / this.max[i], s = this.size[i] * (0.4 + 0.6 * a);
      c.globalAlpha = a; c.fillStyle = this.col[i]; c.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
    }
    c.globalAlpha = 1;
  }
}

// ---- Floating text ("+1", "Here!") ------------------------------------------
class Floaters {
  constructor() { this.list = []; }
  add(text, x, y, o = {}) { this.list.push({ text, x, y, life: o.life || 0.9, max: o.life || 0.9, color: o.color || T.text, size: o.size || FS.sm, rise: o.rise == null ? 70 : o.rise }); }
  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) { const f = this.list[i]; f.life -= dt; f.y -= f.rise * dt; if (f.life <= 0) this.list.splice(i, 1); } }
  draw() { for (const f of this.list) G.text(f.text, f.x, f.y, { size: f.size, weight: 700, color: f.color, align: 'center', alpha: Math.min(1, f.life / f.max * 2) }); }
}

// ---- Spatial grid: "what is near this point?" without checking everything ----
class SpatialGrid {
  constructor(w, h, cell = 128, ox = 0, oy = 0) {
    this.cell = cell; this.ox = ox; this.oy = oy;
    this.cols = Math.max(1, Math.ceil(w / cell)); this.rows = Math.max(1, Math.ceil(h / cell));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.maxR = cell / 2;                                  // largest object radius you insert
  }
  _col(x) { return U.clamp(Math.floor((x - this.ox) / this.cell), 0, this.cols - 1); }
  _row(y) { return U.clamp(Math.floor((y - this.oy) / this.cell), 0, this.rows - 1); }
  clear() { for (const c of this.cells) c.length = 0; }
  insert(o) { this.cells[this._row(o.y) * this.cols + this._col(o.x)].push(o); }
  remove(o) { const a = this.cells[this._row(o.y) * this.cols + this._col(o.x)], k = a.indexOf(o); if (k >= 0) { a[k] = a[a.length - 1]; a.pop(); } }
  query(x, y, r, fn) {                                     // calls fn(obj) for everything that could be within r
    const R = r + this.maxR, c0 = this._col(x - R), c1 = this._col(x + R), r0 = this._row(y - R), r1 = this._row(y + R);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const a = this.cells[row * this.cols + col];
      for (let i = a.length - 1; i >= 0; i--) fn(a[i]);
    }
  }
}

// ---- Timers and tweens --------------------------------------------------------
class Timers {
  constructor() { this.list = []; }
  after(sec, fn) { this.list.push({ t: sec, fn }); }
  tween(obj, prop, to, sec, ease = U.easeOut) { this.list.push({ t: sec, d: sec, obj, prop, from: obj[prop], to, ease }); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i]; m.t -= dt;
      if (m.obj) m.obj[m.prop] = U.lerp(m.from, m.to, m.ease(U.clamp(1 - m.t / m.d, 0, 1)));
      if (m.t <= 0) { this.list.splice(i, 1); if (m.fn) m.fn(); }
    }
  }
}

// ---- A vertical menu used by pause, settings and results ---------------------
class Menu {
  constructor(items) { this.items = items; this.i = 0; }   // item: {label, value?:()=>string, adjust?:(dir)=>void, act?:()=>void}
  update(m) {
    const n = this.items.length;
    if (m.dy) { this.i = (this.i + m.dy + n) % n; Sfx.play('move'); }
    const it = this.items[this.i];
    if (m.dx && it.adjust) { it.adjust(m.dx); Sfx.play('tick'); }
    if (m.a) { if (it.act) { Sfx.play('select'); it.act(); } else if (it.adjust) { it.adjust(1); Sfx.play('tick'); } }
  }
  draw(x, y, w) {
    const rh = 76;
    this.items.forEach((it, k) => {
      const sel = k === this.i, yy = y + k * (rh + 8);
      G.rrect(x, yy, w, rh, 12, sel ? T.s3 : T.s1, sel ? T.text : T.line, sel ? 3 : 2);
      G.text(it.label, x + 28, yy + rh / 2 + 1, { size: FS.sm, weight: sel ? 500 : 400, color: sel ? T.text : T.muted, base: 'middle' });
      if (it.value) {
        const v = it.value();
        G.text(v, x + w - (it.adjust ? 64 : 28), yy + rh / 2 + 1, { size: FS.sm, color: T.text, align: 'right', base: 'middle', mono: /^[\d\s/.:%−+-]+$/.test(v) });
        if (it.adjust && sel) {
          G.text('›', x + w - 28, yy + rh / 2 - 1, { size: FS.sm, color: T.muted, align: 'right', base: 'middle' });
          G.text('‹', x + w - 72 - G.measure(v, { size: FS.sm, mono: /^[\d\s/.:%−+-]+$/.test(v) }), yy + rh / 2 - 1, { size: FS.sm, color: T.muted, align: 'right', base: 'middle' });
        }
      }
    });
    return this.items.length * (rh + 8);
  }
}

// =============================================================================
// Engine: canvas, fixed-step loop, scene stack
// =============================================================================
const Engine = {
  canvas: null, c: null, scale: 1, ox: 0, oy: 0,
  scenes: [], fade: { a: 1, dir: -1, next: null },
  t: 0, acc: 0, last: 0, trauma: 0, hitstop: 0, timeScale: 1, debug: false,
  perf: { fps: 0, upd: 0, drw: 0, steps: 0, _f: 0, _t: 0, _u: 0, _d: 0, _s: 0 },

  init() {
    Save.load();
    const cv = this.canvas = document.getElementById('screen');
    this.c = G.c = cv.getContext('2d', { alpha: false });
    Sfx.init(); Input.init(cv);
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.max(1, Math.round(innerWidth * dpr)), ch = Math.max(1, Math.round(innerHeight * dpr));
      cv.width = cw; cv.height = ch;
      this.scale = Math.min(cw / W, ch / H); this.ox = (cw - W * this.scale) / 2; this.oy = (ch - H * this.scale) / 2;
    };
    addEventListener('resize', fit); fit();
    cv.addEventListener('dblclick', () => {                 // a click may ask for fullscreen; a controller may not
      try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
    });
    addEventListener('keydown', e => {                      // developer keys
      if (e.code === 'F3') { Save.data.settings.perf = !Save.data.settings.perf; Save.flush(); e.preventDefault(); }
      if (e.code === 'F4') { this.debug = !this.debug; e.preventDefault(); }                       // show colliders
      if (e.code === 'F6') { this.timeScale = this.timeScale === 1 ? 0.25 : 1; e.preventDefault(); } // slow motion
      if (e.code === 'F7' || e.code === 'F8') { const h = this.scenes.find(q => q.inner); if (h && h.inner.dev) { h.inner.dev(e.code); e.preventDefault(); } }   // per-game cheats
    });
    document.addEventListener('visibilitychange', () => { this.last = 0; });
    if (document.fonts && document.fonts.load) { for (const f of ['400 28px Geist', '500 28px Geist', '700 96px Geist', "400 28px 'JetBrains Mono'"]) { try { document.fonts.load(f).catch(() => {}); } catch (e) {} } }
    this.scenes = [new JoinScene()];
    requestAnimationFrame(t => this.frame(t));
  },

  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    if (!this.last) this.last = now;
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;
    const p = this.perf; let steps = 0, t0 = performance.now();
    while (this.acc >= STEP && steps < 10) { this.step(STEP); this.acc -= STEP; steps++; }
    if (steps === 10) this.acc = 0;                         // too far behind: drop the backlog instead of spiralling
    const t1 = performance.now();
    this.render(this.acc / STEP);
    const t2 = performance.now();
    p._f++; p._t += dt; p._u += t1 - t0; p._d += t2 - t1; p._s += steps;
    if (p._t >= 0.5) { p.fps = p._f / p._t; p.upd = p._u / p._f; p.drw = p._d / p._f; p.steps = p._s / p._f; p._f = p._t = p._u = p._d = p._s = 0; }
  },

  step(dt) {
    this.t += dt;
    Input.poll(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const f = this.fade;
    if (f.dir === 1) {                                      // fading out: nothing updates, then swap scenes
      f.a += dt / 0.16;
      if (f.a >= 1) { f.a = 1; for (const s of this.scenes) if (s.exit) s.exit(); this.scenes = [f.next()]; f.next = null; f.dir = -1; this.trauma = 0; this.hitstop = 0; }
      return;
    }
    if (f.dir === -1) { f.a -= dt / 0.22; if (f.a <= 0) { f.a = 0; f.dir = 0; } }
    const top = this.scenes[this.scenes.length - 1];
    if (top) top.update(dt);
  },

  render(alpha) {
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = T.bar; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    let base = this.scenes.length - 1; while (base > 0 && this.scenes[base].overlay) base--;
    for (let i = Math.max(0, base); i < this.scenes.length; i++) this.scenes[i].draw(alpha);
    if (this.fade.a > 0) { c.globalAlpha = U.clamp(this.fade.a, 0, 1); c.fillStyle = T.bg; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    if (Save.data.settings.perf) {
      const p = this.perf, host = this.scenes.find(q => q.kit);
      let s = `${p.fps.toFixed(0)} fps · update ${p.upd.toFixed(2)} ms · draw ${p.drw.toFixed(2)} ms`;
      if (host) for (const key in host.kit.watch) s += ` · ${key} ${host.kit.watch[key]}`;
      const w = G.measure(s, { size: FS.xs, mono: true }) + 32;
      G.rrect((W - w) / 2, H - 52, w, 40, 8, 'rgba(7,9,13,0.85)'); G.text(s, W / 2, H - 31, { size: FS.xs, mono: true, color: T.muted, align: 'center', base: 'middle' });
    }
    c.restore();
    if (this.canvas.height > this.canvas.width * 1.25) {     // tall phone: the 16:9 picture is tiny
      c.setTransform(1, 0, 0, 1, 0, 0); const cw = this.canvas.width, fs = Math.round(cw / 24);
      c.font = `400 ${fs}px ${Couch.FONT}`; c.fillStyle = T.muted; c.textAlign = 'center'; c.textBaseline = 'top';
      const y = this.oy + H * this.scale + fs * 1.6;
      c.fillText('Built for a big screen and two controllers.', cw / 2, y); c.fillText('Turn the phone sideways for a closer look.', cw / 2, y + fs * 1.5);
    }
  },

  go(make) { if (this.fade.dir === 1) return; this.fade.dir = 1; this.fade.next = make; },   // fade to a new scene
  push(scene) { this.scenes.push(scene); },
  pop() { const s = this.scenes.pop(); if (s && s.exit) s.exit(); },
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount * (Save.data.settings.shake / 2)); },
};

// =============================================================================
// Game registry. A game is one call:
//
//   Couch.register({
//     id: 'swarm-night',                 // matches a slot in the manifest, or adds a new one
//     players: 2,                        // fewest players it needs (1 or 2)
//     best: 'low' | 'high' | null,       // which way a better score runs
//     how: ['Up to three short lines.'],
//     controls: [['move','Move'], ['a','Dash']],          // or [[...P1 rows], [...P2 rows]] when seats differ
//     assistText: ['Off', 'Light: …', 'Strong: …'],       // what the assist levels mean in this game
//     create(k) { return { update(dt) {}, draw(alpha) {}, exit() {} }; }
//   });
//
// k is the game kit: k.players (seats), k.rng, k.time, k.assist(i), k.shake(n), k.hitstop(sec),
// k.finish({won, score, stats, note}), k.save (an object that persists), plus Camera, Particles,
// Floaters, SpatialGrid, Timers, G, U, T, FS, Sfx, W, H.
// =============================================================================
const games = [];
function register(def) {
  const slot = games.find(g => g.id === def.id);
  if (slot) Object.assign(slot, def); else games.push(def);
  return slot || def;
}
function makeKit(def, opt = {}) {
  const M = Couch.modules, sim = !!opt.sim;
  const seed = opt.seed != null ? opt.seed >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  return {
    def, W, H, T, FS, G, U, Sfx, BTN: Couch.BTN, c: Engine.c, time: 0, sim, seed,
    players: opt.players || Input.joined(), seats: Input.seats, rng: mulberry32(seed),
    save: sim ? {} : Save.game(def.id).data,
    Camera, Particles, Floaters, SpatialGrid, Timers, ...M,
    timers: new Timers(), routines: new M.Routines(), events: new M.Events(),
    toasts: [], watch: {}, result: null, scale: 1, _slow: 0,
    assist: i => (opt.assists ? opt.assists[i] | 0 : Save.data.assists[i] | 0),
    shake: n => { if (!sim) Engine.shake(n); }, hitstop: sec => { if (!sim) Engine.hitstop = Math.max(Engine.hitstop, sec); },
    after(sec, fn) { this.timers.after(sec, fn); }, tween(obj, prop, to, sec, ease) { this.timers.tween(obj, prop, to, sec, ease); },
    run(gen) { return this.routines.run(gen); },                       // a script with waits
    on(name, fn) { return this.events.on(name, fn); }, emit(name, data) { this.events.emit(name, data); },
    slowmo(scale, sec) { this.scale = scale; this._slow = sec; },       // sec is real time
    toast(text, o = {}) { this.toasts.push({ text, t: o.time || 2.6, max: o.time || 2.6, seat: o.seat, color: o.color }); if (this.toasts.length > 4) this.toasts.shift(); },
    choose(o) {                                                        // pick-one cards; the game waits underneath
      const h = Couch.makeHandle();
      if (sim) h.resolve(o.pick ? o.pick(o.options, this.rng) : Math.floor(this.rng() * o.options.length));
      else Engine.push(new Couch.ChoiceScene(this, o, h));
      return h;
    },
    sfxAt(name, wx, cam, o) { const sx = cam ? cam.toScreen(wx, 0).x : wx; Sfx.play(name, { pan: U.clamp((sx - W / 2) / (W / 2), -1, 1) * 0.8, ...o }); },
    _tick(dt) {
      this.timers.update(dt); this.routines.update(dt);
      for (let i = this.toasts.length - 1; i >= 0; i--) if ((this.toasts[i].t -= dt) <= 0) this.toasts.splice(i, 1);
    },
    finished: false,
    finish(result) {
      if (this.finished) return; this.finished = true; this.result = result;
      if (sim) return;
      const g = Save.game(def.id); g.plays++; if (result.won) g.wins++;
      let isBest = false;
      if (result.won && def.best && typeof result.score === 'number') {
        isBest = g.best == null || (def.best === 'low' ? result.score < g.best : result.score > g.best);
        if (isBest) g.best = result.score;
      }
      Save.flush(); Sfx.play(result.won ? 'win' : 'lose');
      Engine.go(() => new ResultsScene(def, result, isBest));
    },
  };
}
const fmtScore = (def, v) => (v == null ? 'none yet' : def.formatScore ? def.formatScore(v) : def.best === 'low' ? U.time(v) : String(v));

// ---- Shared drawing bits -----------------------------------------------------
function drawSeatChips(xRight, y) {                          // "P1 Xbox controller" chips, right-aligned
  let x = xRight;
  for (let i = 1; i >= 0; i--) {
    const s = Input.seats[i], label = !s.joined ? 'Not joined' : s.lost ? 'Disconnected' : s.device.label;
    const o = { size: FS.xs, color: s.joined && !s.lost ? T.text : T.faint };
    const w = G.measure(label, o) + 104;
    x -= w;
    G.rrect(x, y - 26, w, 52, 26, T.s1, T.line);
    G.marker(i, x + 30, y, 11, { hollow: !s.joined || s.lost, color: s.joined && !s.lost ? T.p[i] : T.faint });
    G.text('P' + (i + 1), x + 52, y + 1, { size: FS.xs, weight: 700, color: s.joined && !s.lost ? T.p[i] : T.faint, base: 'middle' });
    G.text(label, x + 88, y + 1, { ...o, base: 'middle' });
    x -= 16;
  }
}
function drawStatus(y) {                                     // quiet footer: what is and is not working
  const bits = [];
  if (Input.padsBlocked) bits.push('Controllers are blocked in this view. Open the file in Chrome instead');
  if (Sfx.locked) bits.push('Sound is off until you click or press a key once');
  bits.push(Save.persistent ? 'Progress saves in this browser' : 'Progress will not be saved here');
  G.text(bits.join('  ·  '), W - 60, y, { size: FS.xs, color: T.faint, align: 'right', base: 'middle' });
}
function dim() { const c = Engine.c; c.fillStyle = 'rgba(7,9,13,0.82)'; c.fillRect(0, 0, W, H); }

// =============================================================================
// Scenes
// =============================================================================

// ---- Join: each player claims a seat -----------------------------------------
class JoinScene {
  update(dt) {
    const seats = Input.seats, fresh = new Set();
    for (const d of Input.joiners()) {
      const s = seats.find(q => !q.joined); if (!s) break;
      Input.assign(d, s); fresh.add(s); Sfx.play('join', { pitch: s.index ? 1.25 : 1 }); s.rumble(0.5, 140);
    }
    for (const s of seats) {
      if (!s.joined || fresh.has(s) || s.lost || s.bot) continue;
      if (s.pressed('y')) {                                  // a practice bot takes the empty seat, for testing alone
        const b = seats.find(q => q.bot), free = seats.find(q => !q.joined);
        if (b) { Input.removeBot(b); Sfx.play('leave'); } else if (free) { Input.addBot(free); Sfx.play('join', { pitch: 1.5 }); }
        continue;
      }
      if (s.pressed('b')) { Input.unassign(s); const b = seats.find(q => q.bot); if (b && !seats.some(q => q.joined && !q.bot)) Input.removeBot(b); Sfx.play('leave'); continue; }
      if (s.pressed('a') || s.pressed('start')) { Sfx.play('select'); Engine.go(() => new LauncherScene()); return; }
    }
    for (const s of seats) if (s.lost) Input.unassign(s);
  }
  draw() {
    const seats = Input.seats, n = Input.joined().length;
    G.eyebrow('15 games for two', 120, 236);
    G.text('Couch Co-op', 114, 340, { size: FS.xl, weight: 700 });
    G.text('Pick up a controller each.', 120, 404, { size: FS.sm, color: T.muted });
    seats.forEach((s, i) => {
      const x = 120 + i * 880, y = 488, w = 800, h = 300, on = s.joined;
      G.rrect(x, y, w, h, 16, on ? T.s2 : T.s1, on ? T.p[i] : T.line, on ? 3 : 2);
      const pop = on ? 1 + 0.25 * Math.max(0, 1 - s.joinT / 0.18) : 1;
      G.marker(i, x + 110, y + h / 2, 52 * pop, { hollow: !on, color: on ? T.p[i] : T.faint, lw: 4 });
      G.eyebrow('Player ' + (i + 1), x + 216, y + 104, { color: on ? T.p[i] : T.muted });
      if (on) {
        G.text(s.device.label, x + 216, y + 162, { size: FS.md, weight: 500 });
        if (s.bot) G.inline(x + 216, y + 214, [{ btn: 'y' }, '  on the other controller to remove'], Input.lastType, { size: FS.xs, color: T.muted });
        else G.inline(x + 216, y + 214, [{ btn: 'b' }, '  to leave'], s.type, { size: FS.xs, color: T.muted, names: s.device.names });
      } else {
        G.inline(x + 216, y + 150, ['Press ', { btn: 'a' }, ' to join'], Input.lastPadType, { size: FS.md, weight: 500 });
        G.text('No controller? ' + (i ? 'Enter' : 'Space') + ' on the keyboard, or tap.', x + 216, y + 214, { size: FS.xs, color: T.faint });
      }
    });
    const y = 872;
    if (n === 2) G.inline(120, y, ['Both in. Press ', { btn: 'a' }, ' to start.'], Input.lastType, { size: FS.sm });
    else if (n === 1) G.inline(120, y, ['Waiting for player 2. Press ', { btn: 'y' }, ' for a practice bot, or ', { btn: 'a' }, ' to go on alone.'], Input.lastType, { size: FS.sm, color: T.muted });
    else G.text('Waiting for players.', 120, y, { size: FS.sm, color: T.muted, base: 'middle' });
    G.text('Fullscreen: F11, or double-click', 60, 1036, { size: FS.xs, color: T.faint, base: 'middle' });
    drawStatus(1036);
  }
}

// ---- Launcher: the 15 slots, by group ----------------------------------------
const GROUPS = ['Chaos kitchen', 'Tethered and puzzle', 'Asymmetric', 'Run-based action', 'Cosy and long-form'];
const UTIL = [
  { id: 'test-range', title: 'Test Range', line: 'A small complete game' },
  { id: 'engine-lab', title: 'Engine Lab', line: 'Platforms, swarm, workshop' },
  { id: '@pads', title: 'Controller test', line: 'Sticks, buttons and rumble' },
  { id: '@settings', title: 'Settings', line: 'Volume, rumble, screen shake' },
];
class LauncherScene {
  constructor(focusId) {
    this.col = 0; this.row = 3; this.u = 0; this.deny = 0;
    const slots = games.filter(g => g.n);
    if (focusId) {
      const g = slots.find(q => q.id === focusId), u = UTIL.findIndex(q => q.id === focusId);
      if (g) { this.col = Math.floor((g.n - 1) / 3); this.row = (g.n - 1) % 3; } else if (u >= 0) { this.u = u; }
    } else {
      const g = slots.find(q => q.create); if (g) { this.col = Math.floor((g.n - 1) / 3); this.row = (g.n - 1) % 3; }
    }
  }
  current() {
    if (this.row === 3) { const u = UTIL[this.u]; return games.find(g => g.id === u.id) || u; }
    return games.find(g => g.n === this.col * 3 + this.row + 1);
  }
  update(dt) {
    const m = Input.menu; this.deny = Math.max(0, this.deny - dt);
    const last = UTIL.length - 1;
    if (m.dy) { const r = U.clamp(this.row + m.dy, 0, 3); if (r !== this.row) { if (r === 3) this.u = Math.round(this.col * last / 4); else if (this.row === 3) this.col = Math.round(this.u * 4 / last); this.row = r; Sfx.play('move'); } }
    if (m.dx) {
      if (this.row === 3) { const u = U.clamp(this.u + m.dx, 0, last); if (u !== this.u) { this.u = u; Sfx.play('move'); } }
      else { const c = U.clamp(this.col + m.dx, 0, 4); if (c !== this.col) { this.col = c; Sfx.play('move'); } }
    }
    if (m.b) { Sfx.play('back'); Engine.go(() => new JoinScene()); return; }
    if (m.a) {
      const g = this.current();
      if (g.id === '@pads') { Sfx.play('select'); Engine.go(() => new PadTestScene()); }
      else if (g.id === '@settings') { Sfx.play('select'); Engine.push(new SettingsScene()); }
      else if (g.create) { Sfx.play('select'); Engine.go(() => new BriefScene(g)); }
      else { Sfx.play('deny'); this.deny = 0.3; }
    }
  }
  draw() {
    G.text('Couch Co-op', 58, 104, { size: FS.lg, weight: 700 });
    drawSeatChips(W - 60, 84);
    const cw = 344, ch = 196, gap = 20, x0 = 60, y0 = 204;
    GROUPS.forEach((name, col) => G.eyebrow(name, x0 + col * (cw + gap), 178, { color: T.faint }));
    const cur = this.current();
    for (const g of games) {
      if (!g.n) continue;
      const col = Math.floor((g.n - 1) / 3), row = (g.n - 1) % 3, sel = g === cur, built = !!g.create;
      let x = x0 + col * (cw + gap), y = y0 + row * (ch + gap);
      if (sel && this.deny > 0) x += Math.sin(this.deny * 60) * 6 * (this.deny / 0.3);
      G.rrect(x, y, cw, ch, 14, sel ? T.s3 : built ? T.s2 : T.s1, sel ? T.text : T.line, sel ? 3 : 2);
      G.text(String(g.n).padStart(2, '0'), x + 24, y + 44, { size: FS.xs, mono: true, color: T.faint });
      if (built) { G.circle(x + cw - 132, y + 37, 6, T.good); G.text('Playable', x + cw - 24, y + 44, { size: FS.xs, weight: 500, color: T.good, align: 'right' }); }
      else G.text('Not built', x + cw - 24, y + 44, { size: FS.xs, color: T.faint, align: 'right' });
      G.text(g.title, x + 24, y + 96, { size: FS.sm, weight: 700, color: built || sel ? T.text : T.muted });
      G.wrap(g.line, x + 24, y + 134, cw - 48, 30, { size: FS.xs, color: built || sel ? T.muted : T.faint }, 2);
    }
    // Detail line for whatever is selected
    const dy = 876;
    if (cur.n) {
      const st = Save.peek(cur.id);
      const bits = [cur.pace + ' pace', cur.create ? (cur.best ? 'Best: ' + fmtScore(cur, st.best) : st.plays + ' plays') : 'Not built yet. Size: ' + ({ S: 'a weekend', M: 'two or three weekends', L: 'a month of evenings' })[cur.size]];
      G.text(cur.title, x0, dy, { size: FS.xs, weight: 700, base: 'middle' });
      G.text(bits.join('  ·  '), x0 + G.measure(cur.title, { size: FS.xs, weight: 700 }) + 20, dy, { size: FS.xs, color: T.muted, base: 'middle' });
    }
    // Utility strip
    const uw = (W - 120 - 20 * (UTIL.length - 1)) / UTIL.length, uy = 904, uh = 92;
    UTIL.forEach((u, k) => {
      const sel = this.row === 3 && this.u === k, x = x0 + k * (uw + 20);
      G.rrect(x, uy, uw, uh, 14, sel ? T.s3 : T.s1, sel ? T.text : T.line, sel ? 3 : 2);
      G.text(u.title, x + 24, uy + 40, { size: FS.sm, weight: 500, color: sel ? T.text : T.muted });
      G.text(u.line, x + 24, uy + 70, { size: FS.xs, color: T.faint });
    });
    G.hints(x0, 1042, [['a', cur.create || String(cur.id)[0] === '@' ? 'Open' : 'Not built yet'], ['b', 'Change seats']], Input.lastType);
    drawStatus(1042);
  }
}

// ---- Brief: how to play, assists, both hold A to start -------------------------
const ASSIST = ['Off', 'Light', 'Strong'];
class BriefScene {
  constructor(def) { this.def = def; this.ready = [false, false]; this.hold = [0, 0]; this.players = Input.joined(); }
  update(dt) {
    const def = this.def, need = def.players || 2, ps = this.players = Input.joined().filter(s => !s.lost);
    const blocked = ps.length < need;
    let anyReady = false;
    for (const s of ps) {
      const i = s.index;
      if (s.bot) { this.ready[i] = true; continue; }
      if (this.ready[i]) { anyReady = true; if (s.pressed('b')) { this.ready[i] = false; Sfx.play('back'); return; } continue; }
      const n = s.nav();
      if (n.x) { Save.data.assists[i] = U.clamp((Save.data.assists[i] | 0) + n.x, 0, 2); Save.flush(); Sfx.play('tick'); }
      if (!blocked && s.down('a')) { this.hold[i] += dt; if (this.hold[i] >= 0.5) { this.ready[i] = true; Sfx.play('ready', { pitch: i ? 1.25 : 1 }); s.rumble(0.4, 100); } }
      else this.hold[i] = Math.max(0, this.hold[i] - dt * 3);
    }
    if (!anyReady) for (const s of ps) if (s.pressed('b')) { Sfx.play('back'); Engine.go(() => new LauncherScene(def.id)); return; }
    if (!blocked && ps.length && ps.every(s => this.ready[s.index])) Engine.go(() => new GameHost(def));
  }
  draw() {
    const def = this.def, ps = this.players, need = def.players || 2, st = Save.peek(def.id);
    G.eyebrow(def.n ? `${GROUPS[Math.floor((def.n - 1) / 3)]} · ${String(def.n).padStart(2, '0')}` : 'Engine', 120, 216);
    G.text(def.title, 118, 296, { size: FS.lg, weight: 700 });
    let y = 352 + 36 * (G.wrap(def.line, 120, 352, 760, 36, { size: FS.sm, color: T.muted }) - 1);
    y += 84;
    (def.how || []).forEach((line, k) => {
      G.text(String(k + 1), 120, y, { size: FS.xs, mono: true, color: T.faint });
      y += 40 * G.wrap(line, 164, y, 716, 40, { size: FS.sm }) + 16;
    });
    const info = [st.plays + (st.plays === 1 ? ' play' : ' plays')]; if (def.best) info.push('Best: ' + fmtScore(def, st.best));
    G.text(info.join('  ·  '), 120, 900, { size: FS.xs, color: T.faint });
    if (ps.length < need) G.text('This one needs two players. Go back and join a second controller.', 120, 960, { size: FS.sm, color: T.bad });
    const ph = 392, px = 1000, pw = 800, py0 = ps.length > 1 ? 112 : 320;
    ps.forEach((s, k) => {
      const i = s.index, y0 = py0 + k * (ph + 24), rdy = this.ready[i], names = s.device.names;
      G.rrect(px, y0, pw, ph, 16, T.s1, rdy ? T.p[i] : T.line, rdy ? 3 : 2);
      G.marker(i, px + 56, y0 + 58, 20);
      G.eyebrow('Player ' + (i + 1), px + 96, y0 + 54, { color: T.p[i] });
      G.text(s.device.label + (s.bot && !def.bots ? ' (stands still in this game)' : ''), px + 96, y0 + 84, { size: FS.xs, color: T.faint });
      const rows = Array.isArray(def.controls && def.controls[0] && def.controls[0][0]) ? (def.controls[i] || def.controls[0]) : (def.controls || []);
      const rh = Math.min(48, 176 / Math.max(1, rows.length));
      rows.forEach(([btn, label], r) => {
        const yy = y0 + 136 + r * rh;
        G.glyph(s.type, btn, px + 40, yy, Math.min(38, rh - 8), { names });
        G.text(label, px + 240, yy + 1, { size: rh < 44 ? FS.xs : FS.sm, base: 'middle' });
      });
      // assist
      const ay = y0 + ph - 68, lvl = Save.data.assists[i] | 0;
      G.eyebrow('Assist', px + 40, ay, { base: 'middle' });
      G.text((rdy || s.bot ? '' : '‹  ') + ASSIST[lvl] + (rdy || s.bot ? '' : '  ›'), px + 240, ay + 1, { size: FS.sm, weight: 500, base: 'middle', color: lvl ? T.text : T.muted });
      const at = def.assistText && def.assistText[lvl];
      if (at && lvl) G.text(at, px + 240, ay + 34, { size: FS.xs, color: T.faint, base: 'middle' });
      // ready
      const rx = px + pw - 248;
      if (rdy) { G.tick(rx + 20, ay, 14, T.good); G.text('Ready', rx + 52, ay + 1, { size: FS.sm, weight: 700, color: T.good, base: 'middle' }); }
      else {
        G.inline(rx, ay - 14, ['Hold ', { btn: 'a' }], s.type, { size: FS.xs, color: T.muted, names });
        G.bar(rx, ay + 16, 208, 8, this.hold[i] / 0.5, T.p[i]);
      }
    });
    G.hints(120, 1042, [['b', ps.some(s => !s.bot && this.ready[s.index]) ? 'Not ready' : 'Back']], Input.lastType);
  }
}

// ---- Game host: runs a game, owns pause and dropped controllers ----------------
class GameHost {
  constructor(def) { this.def = def; this.kit = makeKit(def); this.inner = def.create(this.kit); }
  update(dt) {
    const k = this.kit;
    if (k.players.some(s => s.lost)) { Engine.push(new DisconnectScene(this.def)); return; }
    if (!k.finished) for (const s of k.players) if (s.pressed('start')) { Sfx.play('back'); Engine.push(new PauseScene(this.def, s.index)); return; }
    if (Engine.hitstop > 0) { Engine.hitstop -= dt; return; }
    if (k._slow > 0) { k._slow -= dt; if (k._slow <= 0) k.scale = 1; }
    const gdt = dt * k.scale * Engine.timeScale, inner = this.inner;
    if (inner.bot) for (const s of k.players) if (s.bot) { s.device.ctl.clear(); inner.bot(s, s.device.ctl); }
    k.time += gdt; k._tick(gdt); inner.update(gdt);
  }
  draw(alpha) {
    this.inner.draw(alpha);
    this.kit.toasts.forEach((t, i) => {                      // banners, newest at the bottom
      const a = Math.min(1, t.t / 0.3, (t.max - t.t) / 0.15), w = G.measure(t.text, { size: FS.sm, weight: 500 }) + (t.seat != null ? 100 : 64), x = (W - w) / 2, y = 148 + i * 68;
      Engine.c.globalAlpha = U.clamp(a, 0, 1);
      G.rrect(x, y, w, 56, 28, 'rgba(7,9,13,0.9)', t.color || (t.seat != null ? T.p[t.seat] : T.line2), 2);
      if (t.seat != null) G.marker(t.seat, x + 34, y + 28, 10);
      G.text(t.text, x + (t.seat != null ? 60 : 32), y + 29, { size: FS.sm, weight: 500, base: 'middle' });
      Engine.c.globalAlpha = 1;
    });
  }
  exit() { Sfx.music.stop(); if (this.inner.exit) this.inner.exit(); }
}

class PauseScene {
  constructor(def, who) {
    this.overlay = true; this.def = def; this.who = who;
    this.menu = new Menu([
      { label: 'Resume', act: () => Engine.pop() },
      { label: 'Restart', act: () => Engine.go(() => new GameHost(def)) },
      { label: 'Settings', act: () => Engine.push(new SettingsScene()) },
      { label: 'Quit to menu', act: () => Engine.go(() => new LauncherScene(def.id)) },
    ]);
  }
  update() { const m = Input.menu; if (m.start || m.b) { Sfx.play('back'); Engine.pop(); return; } this.menu.update(m); }
  draw() {
    dim(); const x = 600, w = 720;
    G.marker(this.who, x + 14, 290, 11); G.eyebrow('Paused by player ' + (this.who + 1), x + 40, 298);
    G.text(this.def.title, x - 2, 372, { size: FS.lg, weight: 700 });
    this.menu.draw(x, 420, w);
    G.hints(x, 800, [['a', 'Choose'], ['start', 'Resume']], Input.lastType);
  }
}

class DisconnectScene {
  constructor(def) { this.overlay = true; this.def = def; }
  update() {
    const lost = Input.seats.filter(s => s.lost);
    if (!lost.length) { Engine.pop(); Engine.push(new PauseScene(this.def, 0)); return; }
    const d = Input.joiners()[0];
    if (d) { Input.assign(d, lost[0]); Sfx.play('join'); return; }
    for (const s of Input.seats) if (s.joined && !s.lost && s.pressed('start')) { for (const q of lost) Input.unassign(q); Engine.go(() => new LauncherScene(this.def.id)); return; }
  }
  draw() {
    dim(); const lost = Input.seats.filter(s => s.lost), i = lost.length ? lost[0].index : 0, x = 480;
    G.marker(i, x + 14, 410, 11, { hollow: true }); G.eyebrow('Player ' + (i + 1), x + 40, 418, { color: T.p[i] });
    G.text('Controller disconnected', x - 2, 492, { size: FS.lg, weight: 700 });
    G.inline(x, 560, ['Reconnect it, or press ', { btn: 'a' }, ' on another controller to take the seat.'], Input.lastPadType, { size: FS.sm, color: T.muted });
    G.hints(x, 660, [['start', 'Quit to menu']], Input.lastType);
  }
}

class SettingsScene {
  constructor() {
    this.overlay = true; const s = Save.data.settings;
    this.menu = new Menu([
      { label: 'Volume', value: () => String(s.volume) + ' / 10', adjust: d => { s.volume = U.clamp(s.volume + d, 0, 10); Sfx.setVolume(s.volume); Save.flush(); Sfx.play('pickup'); } },
      { label: 'Music', value: () => String(s.music) + ' / 10', adjust: d => { s.music = U.clamp(s.music + d, 0, 10); Sfx.setMusicVolume(s.music); Save.flush(); } },
      { label: 'Rumble', value: () => (s.rumble ? 'On' : 'Off'), adjust: () => { s.rumble = !s.rumble; Save.flush(); for (const q of Input.joined()) q.rumble(0.7, 180); } },
      { label: 'Screen shake', value: () => ['Off', 'Low', 'Full'][s.shake], adjust: d => { s.shake = U.clamp(s.shake + d, 0, 2); Save.flush(); Engine.shake(0.6); } },
      { label: 'Performance readout', value: () => (s.perf ? 'On' : 'Off'), adjust: () => { s.perf = !s.perf; Save.flush(); } },
      { label: 'Done', act: () => Engine.pop() },
    ]);
  }
  update() { const m = Input.menu; if (m.b || m.start) { Sfx.play('back'); Engine.pop(); return; } this.menu.update(m); }
  draw() {
    dim(); const x = 560, w = 800;
    G.eyebrow('Applies to every game', x, 190);
    G.text('Settings', x - 2, 264, { size: FS.lg, weight: 700 });
    const h = this.menu.draw(x, 312, w);
    G.text('Fullscreen: F11 or double-click.  Developer keys: F3 timings, F4 colliders, F6 slow motion, F7 and F8 game cheats.', x, 312 + h + 36, { size: FS.xs, color: T.faint });
    G.hints(x, 312 + h + 96, [['move', 'Change'], ['b', 'Back']], Input.lastType);
  }
}

class ResultsScene {
  constructor(def, result, isBest) {
    this.def = def; this.r = result; this.isBest = isBest; this.t = 0;
    this.menu = new Menu([
      { label: 'Play again', act: () => Engine.go(() => new GameHost(def)) },
      { label: 'Back to menu', act: () => Engine.go(() => new LauncherScene(def.id)) },
    ]);
  }
  update(dt) { this.t += dt; if (this.t > 0.5) this.menu.update(Input.menu); }
  draw() {
    const def = this.def, r = this.r, col = r.won ? T.good : T.bad;
    G.eyebrow(def.title, 120, 236);
    if (r.won) G.tick(144, 318, 22, col); else { G.line(124, 298, 164, 338, col, 7); G.line(164, 298, 124, 338, col, 7); }
    G.text(r.title || (r.won ? 'Cleared' : 'Down and out'), 196, 352, { size: FS.xl, weight: 700 });
    if (r.note) G.text(r.note, 120, 420, { size: FS.sm, color: T.muted });
    let y = 520; const x = 120, w = 800;
    if (def.best && typeof r.score === 'number' && r.won) {
      G.text(def.scoreLabel || 'Score', x, y, { size: FS.sm, color: T.muted });
      G.text(fmtScore(def, r.score), x + w, y, { size: FS.md, weight: 500, mono: true, align: 'right' });
      const st = Save.game(def.id);
      G.text(this.isBest ? 'New best' : 'Best ' + fmtScore(def, st.best), x + w, y + 36, { size: FS.xs, weight: this.isBest ? 700 : 400, color: this.isBest ? T.good : T.faint, align: 'right' });
      y += 56; G.line(x, y, x + w, y, T.line2, 2); y += 60;
    }
    for (const [label, value] of r.stats || []) {
      G.text(label, x, y, { size: FS.sm, color: T.muted });
      G.text(String(value), x + w, y, { size: FS.sm, mono: /^[\d\s/.:%−+,-]+$/.test(String(value)), align: 'right' });   // numbers in mono, words in the UI font
      G.line(x, y + 22, x + w, y + 22, T.line, 2); y += 60;
    }
    this.menu.draw(1100, 492, 700);
    G.hints(1100, 700, [['a', 'Choose']], Input.lastType);
  }
}

// ---- Controller test -----------------------------------------------------------
class PadTestScene {
  constructor() { this.hold = 0; this.rt = 0; }
  update(dt) {
    let exit = false; this.rt -= dt;
    for (const s of Input.joined()) {
      if (s.down('start')) exit = true;
      if (s.value('lt') > 0.5 && s.value('rt') > 0.5 && this.rt <= 0) s.rumble(1, 220);
    }
    if (this.rt <= 0) this.rt = 0.18;
    this.hold = exit ? this.hold + dt : 0;
    if (this.hold > 0.6) { Sfx.play('back'); Engine.go(() => new LauncherScene('@pads')); }
  }
  draw() {
    G.text('Controller test', 58, 104, { size: FS.lg, weight: 700 });
    G.text('Everything you press should light up. Squeeze both triggers to feel the rumble.', 60, 150, { size: FS.xs, color: T.muted });
    Input.seats.forEach((s, i) => {
      const x = 60 + i * 920, y = 196, w = 880, h = 760, col = T.p[i];
      G.rrect(x, y, w, h, 16, T.s1, T.line);
      G.marker(i, x + 52, y + 56, 18, { hollow: !s.joined }); G.eyebrow('Player ' + (i + 1), x + 88, y + 64, { color: col });
      if (!s.joined) { G.text('Not joined', x + 88, y + 400, { size: FS.md, color: T.faint }); return; }
      G.text(s.device.label, x + w - 40, y + 64, { size: FS.xs, color: T.muted, align: 'right' });
      const names = s.device.names, type = s.type, lit = b => ({ lit: s.down(b), color: col, names });
      // triggers and shoulders
      [['lt', x + 60], ['rt', x + w - 360]].forEach(([b, bx]) => {
        G.glyph(type, b, bx, y + 140, 40, lit(b));
        G.bar(bx + 110, y + 132, 130, 16, s.value(b), col);
        G.text(s.value(b).toFixed(2), bx + 300, y + 141, { size: FS.xs, mono: true, color: T.muted, align: 'right', base: 'middle' });
      });
      G.glyph(type, 'lb', x + 60, y + 208, 40, lit('lb')); G.glyph(type, 'rb', x + w - 360, y + 208, 40, lit('rb'));
      // sticks
      const stick = (cx, cy, v, b, label) => {
        G.circle(cx, cy, 92, T.s2, T.line2); G.line(cx - 92, cy, cx + 92, cy, T.line, 2); G.line(cx, cy - 92, cx, cy + 92, T.line, 2);
        G.circle(cx + v.x * 70, cy + v.y * 70, 26, s.down(b) ? col : T.s3, col, 3);
        G.text(label, cx, cy + 132, { size: FS.xs, color: T.faint, align: 'center' });
        G.text((v.x >= 0 ? '+' : '−') + Math.abs(v.x).toFixed(2) + '  ' + (v.y >= 0 ? '+' : '−') + Math.abs(v.y).toFixed(2), cx, cy + 164, { size: FS.xs, mono: true, color: T.muted, align: 'center' });
      };
      stick(x + 200, y + 380, { x: s.device.lx, y: s.device.ly }, 'ls', 'Left stick');
      stick(x + w - 200, y + 380, { x: s.aim.x, y: s.aim.y }, 'rs', 'Right stick');
      // face buttons
      const fx = x + w / 2, fy = y + 380, o = 62;
      [['y', 0, -o], ['a', 0, o], ['x', -o, 0], ['b', o, 0]].forEach(([b, ox, oy]) => G.glyph(type, b, fx + ox - (type === 'kb' || type === 'touch' ? G.glyphWidth(type, b, 52, { names }) / 2 : 26), fy + oy, 52, lit(b)));
      // d-pad, start, select
      const dx = x + 200, dyy = y + 640, q = 40;
      [['up', 0, -q], ['down', 0, q], ['left', -q, 0], ['right', q, 0]].forEach(([b, ox, oy]) => G.rrect(dx + ox - 18, dyy + oy - 18, 36, 36, 6, s.down(b) ? col : T.s3, T.line2));
      G.text('D-pad', dx, dyy + 92, { size: FS.xs, color: T.faint, align: 'center' });
      G.glyph(type, 'select', fx - 150, dyy, 40, lit('select')); G.glyph(type, 'start', fx + 20, dyy, 40, lit('start'));
    });
    G.inline(60, 1042, ['Hold ', { btn: 'start' }, ' to go back'], Input.lastType, { size: FS.xs, color: T.muted });
    if (this.hold > 0) G.bar(60, 1066, 240, 6, this.hold / 0.6, T.text);
    drawStatus(1042);
  }
}

Object.assign(Couch, { Engine, Camera, Particles, Floaters, SpatialGrid, Timers, Menu, register, games, GROUPS, makeKit,
  scenes: { JoinScene, LauncherScene, BriefScene, GameHost, PauseScene, SettingsScene, ResultsScene, PadTestScene, DisconnectScene } });
})();
