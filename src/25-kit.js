/* ==========================================================================
   COUCH CO-OP ENGINE · game kit
   The systems games are built from. Every class here is also on the kit a
   game receives, so inside a game it is k.World, k.Tilemap, k.Rope and so on.

     World        entities with tags, fast "what is near", walls, rays
     Tilemap      levels from rows of text, collision, rays, cached drawing
     Platformer   a jumping body with coyote time and jump buffering
     Rope         a rope between two bodies
     Sprite       draw a shape once, stamp it thousands of times
     Routines     scripts written top to bottom with waits (generators)
     FSM, Events  state machines and messages
     Path         A* route finding;  FlowField: many chasers, one cheap search
     Hex          hex-grid maths for board games
     Darkness     lights and vision cones
     Interact     "press A here" prompts, hold-to-use, carry and throw
     ChoiceScene  pick-one-of-these cards (upgrades, votes)
     simulate     run a game with bots, no screen, as fast as possible
   ========================================================================== */
(() => {
const { W, H, STEP, T, FS, U, G, Sfx, Input, Engine, SpatialGrid, Timers, BTN } = Couch;

// ---- Pool: reuse objects instead of creating thousands -------------------------
class Pool {
  constructor(make, reset) { this.make = make; this.reset = reset; this.free = []; }
  get() { const o = this.free.pop() || this.make(); if (this.reset) this.reset(o); return o; }
  put(o) { this.free.push(o); }
}

// ---- Sprite: bake a drawing to an image, then stamp it --------------------------
class Sprite {
  // draw(c) paints around 0,0. G helpers work inside it.
  static bake(w, h, draw, res = 2) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w * res); cv.height = Math.ceil(h * res);
    const c = cv.getContext('2d'); c.scale(res, res); c.translate(w / 2, h / 2);
    const prev = G.c; G.c = c; try { draw(c); } finally { G.c = prev; }
    return new Sprite(cv, w, h);
  }
  constructor(img, w, h) { this.img = img; this.w = w; this.h = h; }
  spin(n = 32) { return new SpinSprite(this, n); }
  draw(c, x, y, rot = 0, scale = 1, alpha = 1) {
    if (alpha <= 0) return;
    const w = this.w * scale, h = this.h * scale;
    if (alpha !== 1) c.globalAlpha = alpha;
    if (rot) { c.translate(x, y); c.rotate(rot); c.drawImage(this.img, -w / 2, -h / 2, w, h); c.rotate(-rot); c.translate(-x, -y); }
    else c.drawImage(this.img, x - w / 2, y - h / 2, w, h);
    if (alpha !== 1) c.globalAlpha = 1;
  }
}
// The same sprite turned to n angles ahead of time, so a rotated draw is one plain stamp. Use for crowds.
//   const bug = k.Sprite.bake(40, 40, draw).spin(32);   bug.draw(c, x, y, angle)
class SpinSprite {
  constructor(base, n) {
    this.n = n; this.w = base.w; this.h = base.h; this.frames = []; const d = Math.ceil(Math.hypot(base.w, base.h)), res = base.img.width / base.w; this.d = d;
    for (let i = 0; i < n; i++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(d * res); const c = cv.getContext('2d');
      c.translate(cv.width / 2, cv.height / 2); c.rotate((i / n) * Math.PI * 2); c.drawImage(base.img, -base.img.width / 2, -base.img.height / 2); this.frames.push(cv);
    }
  }
  draw(c, x, y, rot = 0, scale = 1) {
    const n = this.n, i = ((Math.round((rot / (Math.PI * 2)) * n) % n) + n) % n, d = this.d * scale;
    c.drawImage(this.frames[i], x - d / 2, y - d / 2, d, d);
  }
}
const Shapes = {
  poly(c, x, y, r, n, rot = 0) { c.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); },
  star(c, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * Math.PI * 2, q = i % 2 ? r * inner : r; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); },
  arrow(c, x, y, ang, s) { c.beginPath(); c.moveTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s); c.lineTo(x + Math.cos(ang + 2.5) * s, y + Math.sin(ang + 2.5) * s); c.lineTo(x + Math.cos(ang - 2.5) * s, y + Math.sin(ang - 2.5) * s); c.closePath(); },
};

// ---- Collision basics ------------------------------------------------------------
function pushCircleRect(e, rx, ry, rw, rh) {               // moves circle e out of a rectangle; true if it was touching
  const cx = U.clamp(e.x, rx, rx + rw), cy = U.clamp(e.y, ry, ry + rh), dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= e.r * e.r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (e.r - d) / d; e.x += dx * k; e.y += dy * k; }
  else {
    const l = e.x - rx, r = rx + rw - e.x, t = e.y - ry, b = ry + rh - e.y, m = Math.min(l, r, t, b);
    if (m === l) e.x = rx - e.r; else if (m === r) e.x = rx + rw + e.r; else if (m === t) e.y = ry - e.r; else e.y = ry + rh + e.r;
  }
  return true;
}
function rayRect(x1, y1, x2, y2, r) {                      // 0..1 along the ray where it enters r, or -1
  const dx = x2 - x1, dy = y2 - y1; let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x1, dx, r.x, r.x + r.w], [y1, dy, r.y, r.y + r.h]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return -1; continue; }
    let a = (lo - p) / d, b = (hi - p) / d; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return -1;
  }
  return t0;
}
// Moves a box (centre x,y; size w,h) and stops it at solid tiles and rectangles. One axis at a time.
function moveBox(b, dx, dy, map, rects) {
  const res = { x: false, y: false, ground: false, ceil: false }, hw = b.w / 2, hh = b.h / 2;
  const each = fn => {
    if (map) {
      const s = map.size, x0 = Math.floor((b.x - hw) / s), x1 = Math.floor((b.x + hw - 0.001) / s), y0 = Math.floor((b.y - hh) / s), y1 = Math.floor((b.y + hh - 0.001) / s);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (map.isSolid(tx, ty)) fn(tx * s, ty * s, s, s);
    }
    if (rects) for (const r of rects) if (r !== b && b.x + hw > r.x && b.x - hw < r.x + r.w && b.y + hh > r.y && b.y - hh < r.y + r.h) fn(r.x, r.y, r.w, r.h);
  };
  const lim = map ? map.size * 0.45 : 32, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / lim));
  for (let i = 0; i < n; i++) {
    if (dx) { b.x += dx / n; each((rx, ry, rw) => { if (dx > 0) b.x = Math.min(b.x, rx - hw); else b.x = Math.max(b.x, rx + rw + hw); res.x = true; }); }
    if (dy) { b.y += dy / n; each((rx, ry, rw, rh) => { if (dy > 0) { b.y = Math.min(b.y, ry - hh); res.ground = true; } else { b.y = Math.max(b.y, ry + rh + hh); res.ceil = true; } res.y = true; }); }
  }
  return res;
}

// ---- Tilemap: a level written as rows of text ---------------------------------------
//   new k.Tilemap({ size: 64, rows: ['#####', '#..*#', '#####'], solid: '#', colors: { '#': T.s2 } })
class Tilemap {
  constructor(o) {
    this.size = o.size || 64; this.solid = new Set((o.solid || '#').split(''));
    this.cols = Math.max(...o.rows.map(r => r.length)); this.nrows = o.rows.length;
    this.rows = o.rows.map(r => r.padEnd(this.cols, '.').split(''));
    this.edge = o.edge == null ? [...this.solid][0] : o.edge;   // what lies beyond the map
    this.colors = o.colors || {}; this.paint = o.paint || null;
    this.w = this.cols * this.size; this.h = this.nrows * this.size; this._cv = null; this._cx = null;
    this.cache = o.cache !== false;                         // false: paint visible tiles each frame (better for big, sparse maps)
  }
  at(tx, ty) { return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.nrows ? this.edge : this.rows[ty][tx]; }
  isSolid(tx, ty) { return this.solid.has(this.at(tx, ty)); }
  solidAt(wx, wy) { return this.isSolid(Math.floor(wx / this.size), Math.floor(wy / this.size)); }
  tile(wx, wy) { return { tx: Math.floor(wx / this.size), ty: Math.floor(wy / this.size) }; }
  centre(tx, ty) { return { x: (tx + 0.5) * this.size, y: (ty + 0.5) * this.size }; }
  set(tx, ty, ch) { if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.nrows) return; this.rows[ty][tx] = ch; if (this._cx) for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) this._paint(this._cx, x, y); }
  find(ch) { const out = []; for (let ty = 0; ty < this.nrows; ty++) for (let tx = 0; tx < this.cols; tx++) if (this.rows[ty][tx] === ch) out.push({ tx, ty, x: (tx + 0.5) * this.size, y: (ty + 0.5) * this.size }); return out; }
  _paint(c, tx, ty, direct) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.nrows) return;
    const s = this.size, ch = this.rows[ty][tx], x = tx * s, y = ty * s;
    if (!direct) c.clearRect(x, y, s, s);
    if (this.paint) { this.paint(c, ch, x, y, s, tx, ty, this); return; }
    const col = this.colors[ch] || (this.solid.has(ch) ? T.s2 : null);
    if (!col) return;
    c.fillStyle = col; c.fillRect(x, y, s, s);
    if (this.solid.has(ch)) {                               // a lighter edge wherever a solid tile meets open space
      c.fillStyle = T.line2;
      if (!this.isSolid(tx, ty - 1)) c.fillRect(x, y, s, 3);
      if (!this.isSolid(tx, ty + 1)) c.fillRect(x, y + s - 3, s, 3);
      if (!this.isSolid(tx - 1, ty)) c.fillRect(x, y, 3, s);
      if (!this.isSolid(tx + 1, ty)) c.fillRect(x + s - 3, y, 3, s);
    }
  }
  draw(c, view) {
    if (this.cache && !this._cv && this.w * this.h <= 4096 * 4096) {     // paint the whole level once, then reuse the picture
      this._cv = document.createElement('canvas'); this._cv.width = this.w; this._cv.height = this.h; this._cx = this._cv.getContext('2d');
      for (let ty = 0; ty < this.nrows; ty++) for (let tx = 0; tx < this.cols; tx++) this._paint(this._cx, tx, ty);
    }
    const v = view || { x: 0, y: 0, w: this.w, h: this.h };
    if (this._cv) {
      const sx = Math.max(0, Math.floor(v.x)), sy = Math.max(0, Math.floor(v.y)), ex = Math.min(this.w, Math.ceil(v.x + v.w)), ey = Math.min(this.h, Math.ceil(v.y + v.h));
      if (ex > sx && ey > sy) c.drawImage(this._cv, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    } else {
      const s = this.size;
      for (let ty = Math.max(0, Math.floor(v.y / s)); ty <= Math.min(this.nrows - 1, Math.floor((v.y + v.h) / s)); ty++)
        for (let tx = Math.max(0, Math.floor(v.x / s)); tx <= Math.min(this.cols - 1, Math.floor((v.x + v.w) / s)); tx++) this._paint(c, tx, ty, true);
    }
  }
  collideCircle(e) {
    const s = this.size; let hit = false;
    for (let ty = Math.floor((e.y - e.r) / s); ty <= Math.floor((e.y + e.r) / s); ty++)
      for (let tx = Math.floor((e.x - e.r) / s); tx <= Math.floor((e.x + e.r) / s); tx++)
        if (this.isSolid(tx, ty) && pushCircleRect(e, tx * s, ty * s, s, s)) hit = true;
    return hit;
  }
  ray(x1, y1, x2, y2) {                                    // walks the grid tile by tile; exact and cheap
    const s = this.size; let dx = x2 - x1, dy = y2 - y1; const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { hit: this.solidAt(x1, y1), x: x1, y: y1, dist: 0 };
    dx /= len; dy /= len;
    let tx = Math.floor(x1 / s), ty = Math.floor(y1 / s), t = 0;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, ddx = dx ? Math.abs(s / dx) : Infinity, ddy = dy ? Math.abs(s / dy) : Infinity;
    let mx = dx ? (dx > 0 ? (tx + 1) * s - x1 : x1 - tx * s) / Math.abs(dx) : Infinity, my = dy ? (dy > 0 ? (ty + 1) * s - y1 : y1 - ty * s) / Math.abs(dy) : Infinity;
    while (t <= len) {
      if (this.isSolid(tx, ty)) return { hit: true, x: x1 + dx * t, y: y1 + dy * t, dist: t, tx, ty };
      if (mx < my) { t = mx; mx += ddx; tx += sx; } else { t = my; my += ddy; ty += sy; }
    }
    return { hit: false, x: x2, y: y2, dist: len };
  }
  los(x1, y1, x2, y2) { return !this.ray(x1, y1, x2, y2).hit; }
}

// ---- Platformer body -------------------------------------------------------------------
//   const p = new k.Platformer({ x, y });
//   p.update(dt, map, { move: seat.move.x, jump: seat.down('a'), jumpPressed: seat.pressed('a') });
class Platformer {
  constructor(o = {}) {
    Object.assign(this, { x: 0, y: 0, w: 44, h: 60, vx: 0, vy: 0, speed: 460, accel: 5200, air: 3000, gravity: 3000, jump: 1080, maxFall: 1500,
      coyote: 0.1, buffer: 0.12, cut: 0.45, ground: false, face: 1, jumped: false, landed: false, _coy: 0, _buf: 0, _rise: false }, o);
  }
  update(dt, map, input, rects) {
    const mv = input.move || 0;
    this.vx = U.approach(this.vx, mv * this.speed, (this.ground ? this.accel : this.air) * dt);
    if (mv) this.face = mv > 0 ? 1 : -1;
    this._coy = this.ground ? this.coyote : this._coy - dt;            // a moment of grace after walking off a ledge
    this._buf = input.jumpPressed ? this.buffer : this._buf - dt;      // a jump pressed slightly early still counts
    this.jumped = false;
    if (this._buf > 0 && this._coy > 0) { this.vy = -this.jump; this._buf = 0; this._coy = 0; this.jumped = true; this._rise = true; }
    if (this._rise && this.vy < 0 && !input.jump) { this.vy *= this.cut; this._rise = false; }   // let go early for a short hop
    if (this.vy >= 0) this._rise = false;
    this.vy = Math.min(this.maxFall, this.vy + this.gravity * dt);
    const was = this.ground, r = moveBox(this, this.vx * dt, this.vy * dt, map, rects);
    if (r.x) this.vx = 0;
    this.ground = r.ground; if (r.y) this.vy = 0;
    this.landed = this.ground && !was;
    return r;
  }
}

// ---- Rope between two bodies ---------------------------------------------------------------
//   rope.constrain(a, b, share, map)  keeps them within rope.length; share is how much of the pull a takes (0..1)
//   rope.update(dt, a, b, map)        moves the drawn rope;  rope.draw(c, colour)
class Rope {
  constructor(o = {}) {
    this.n = o.segments || 14; this.length = o.length || 480; this.gravity = o.gravity == null ? 1800 : o.gravity; this.iter = o.iterations || 8;
    this.pts = Array.from({ length: this.n + 1 }, () => ({ x: 0, y: 0, px: 0, py: 0 })); this.stretch = 0; this._init = false;
  }
  reset(a, b) { this.pts.forEach((p, i) => { const t = i / this.n; p.x = p.px = U.lerp(a.x, b.x, t); p.y = p.py = U.lerp(a.y, b.y, t); }); this._init = true; }
  constrain(a, b, share = 0.5, map, rects) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    this.stretch = Math.max(0, d - this.length);
    if (d <= this.length || d === 0) return 0;
    const over = d - this.length, nx = dx / d, ny = dy / d, sa = share, sb = 1 - share;
    const nudge = (o, mx, my) => { if (o.w && (map || rects)) moveBox(o, mx, my, map, rects); else { o.x += mx; o.y += my; } };
    nudge(a, nx * over * sa, ny * over * sa); nudge(b, -nx * over * sb, -ny * over * sb);
    if (a.vx != null && b.vx != null) {                    // stop them flying apart; what is left is the swing
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv > 0) { a.vx += nx * rv * sa; a.vy += ny * rv * sa; b.vx -= nx * rv * sb; b.vy -= ny * rv * sb; }
    }
    return over;
  }
  update(dt, a, b, map) {
    if (!this._init) this.reset(a, b);
    const P = this.pts, n = this.n, seg = this.length / n, g = this.gravity * dt * dt;
    for (let i = 1; i < n; i++) { const p = P[i], vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985; p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + g; }
    for (let k = 0; k < this.iter; k++) {
      P[0].x = a.x; P[0].y = a.y; P[n].x = b.x; P[n].y = b.y;
      for (let i = 0; i < n; i++) {
        const p = P[i], q = P[i + 1], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d <= seg || d === 0) continue;                 // a rope, not a rod: slack is allowed
        const f = (d - seg) / d / 2, ox = dx * f, oy = dy * f;
        if (i > 0) { p.x += ox; p.y += oy; } if (i + 1 < n) { q.x -= ox; q.y -= oy; }
      }
    }
    if (map) for (let i = 1; i < n; i++) { const p = P[i]; if (map.solidAt(p.x, p.y)) { p.x = p.px; p.y = p.py; } }
  }
  draw(c, color = T.text, lw = 5) {
    const P = this.pts; c.beginPath(); c.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length - 1; i++) c.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2);
    c.lineTo(P[P.length - 1].x, P[P.length - 1].y);
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); c.lineCap = 'butt'; c.lineJoin = 'miter';
  }
}

// ---- World: everything that moves ---------------------------------------------------------------
//   An entity is any object with x, y, r and a tag. Optional: update(dt, world), draw(c), layer.
class World {
  constructor(o = {}) {
    this.w = o.w || W; this.h = o.h || H; this.map = o.map || null; this.walls = o.walls || [];
    this.grid = new SpatialGrid(this.w, this.h, o.cell || 128);
    this.list = []; this.tags = new Map(); this._dead = 0; this._vis = [];
  }
  add(e) { if (!e.r) e.r = 16; e.alive = true; this.list.push(e); const t = e.tag || ''; if (!this.tags.has(t)) this.tags.set(t, []); this.tags.get(t).push(e); return e; }
  remove(e) { if (e.alive) { e.alive = false; this._dead++; } }
  each(tag, fn) { const a = this.tags.get(tag); if (a) for (let i = a.length - 1; i >= 0; i--) if (a[i].alive) fn(a[i]); }
  count(tag) { const a = tag == null ? this.list : this.tags.get(tag); let n = 0; if (a) for (const e of a) if (e.alive) n++; return n; }
  update(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) { const e = L[i]; if (e.alive && e.update) e.update(dt, this); }
    if (this._dead) { this.list = L.filter(e => e.alive); for (const [t, a] of this.tags) this.tags.set(t, a.filter(e => e.alive)); this._dead = 0; }
    this.regrid();
  }
  regrid() { const g = this.grid; g.clear(); let mr = 8; for (const e of this.list) { g.insert(e); if (e.r > mr) mr = e.r; } g.maxR = mr; }
  near(x, y, r, tag, fn) { this.grid.query(x, y, r, e => { if (e.alive && (tag == null || e.tag === tag)) { const m = r + e.r; if (U.dist2(x, y, e.x, e.y) <= m * m) fn(e); } }); }
  nearest(x, y, r, tag, skip) { let best = null, bd = Infinity; this.near(x, y, r, tag, e => { if (e === skip) return; const d = U.dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }); return best; }
  collide(e) {                                             // push a circle out of walls, tiles and the world edge
    let hit = false;
    for (const r of this.walls) if (pushCircleRect(e, r.x, r.y, r.w, r.h)) hit = true;
    if (this.map && this.map.collideCircle(e)) hit = true;
    const x = U.clamp(e.x, e.r, this.w - e.r), y = U.clamp(e.y, e.r, this.h - e.r); if (x !== e.x || y !== e.y) { e.x = x; e.y = y; hit = true; }
    return hit;
  }
  move(e, dx, dy) { e.x += dx; e.y += dy; return this.collide(e); }
  separate(tag, strength = 0.5) {                          // crowd members shoulder each other apart
    // Each pair is handled once: a cell against itself and against four of its neighbours.
    // Works for bodies no wider than a grid cell, which is what crowds are.
    const g = this.grid, cols = g.cols, rows = g.rows, cells = g.cells;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const a = cells[row * cols + col], na = a.length; if (!na) continue;
      for (let k = 0; k < 5; k++) {
        const c2 = col + (k === 1 || k === 3 ? 1 : k === 4 ? -1 : 0), r2 = row + (k >= 2 ? 1 : 0);
        if (c2 < 0 || c2 >= cols || r2 >= rows) continue;
        const b = k === 0 ? a : cells[r2 * cols + c2], nb = b.length;
        for (let i = 0; i < na; i++) {
          const e = a[i]; if (e.tag !== tag || !e.alive) continue;
          for (let j = k === 0 ? i + 1 : 0; j < nb; j++) {
            const o = b[j]; if (o.tag !== tag || !o.alive) continue;
            const dx = e.x - o.x, dy = e.y - o.y, min = e.r + o.r, d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            if (d2 < 1e-6) { e.x += 0.5; o.y += 0.5; continue; }
            const d = Math.sqrt(d2), f = ((min - d) / d) * strength * 0.5;
            e.x += dx * f; e.y += dy * f; o.x -= dx * f; o.y -= dy * f;
          }
        }
      }
    }
  }
  ray(x1, y1, x2, y2) {
    let best = this.map ? this.map.ray(x1, y1, x2, y2) : { hit: false, x: x2, y: y2, dist: Math.hypot(x2 - x1, y2 - y1) };
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (const r of this.walls) { const t = rayRect(x1, y1, x2, y2, r); if (t >= 0 && t * len < best.dist) best = { hit: true, x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, dist: t * len, wall: r }; }
    return best;
  }
  los(x1, y1, x2, y2) { return !this.ray(x1, y1, x2, y2).hit; }
  draw(c, view) {                                          // only what is on screen, back layers first
    const V = this._vis; V.length = 0; let layered = false;
    for (const e of this.list) {
      if (!e.alive || !e.draw) continue;
      if (view && (e.x + e.r * 2 < view.x || e.x - e.r * 2 > view.x + view.w || e.y + e.r * 2 < view.y || e.y - e.r * 2 > view.y + view.h)) continue;
      if (e.layer) layered = true; V.push(e);
    }
    if (layered) V.sort((a, b) => (a.layer || 0) - (b.layer || 0));
    for (let i = 0; i < V.length; i++) V[i].draw(c, V[i]);
    if (Engine.debug) {
      c.lineWidth = 2; c.strokeStyle = 'rgba(240,97,109,0.8)'; for (const e of V) { c.beginPath(); c.arc(e.x, e.y, e.r, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = 'rgba(110,162,255,0.8)'; for (const r of this.walls) c.strokeRect(r.x, r.y, r.w, r.h);
    }
    return V.length;
  }
}

// ---- Routines: a script that waits ---------------------------------------------------------------
//   k.run(function* () { yield 1.5; k.toast('Wave 2'); const pick = yield k.choose({...}); yield () => boss.dead; });
//   yield a number = wait that many seconds; a function = wait until it returns true; a choice = wait for the answer.
function makeHandle() {
  return { done: false, value: undefined, _cb: [],
    then(f) { if (this.done) f(this.value); else this._cb.push(f); return this; },
    resolve(v) { if (this.done) return; this.done = true; this.value = v; for (const f of this._cb) f(v); } };
}
class Routines {
  constructor() { this.list = []; }
  run(gen) { const r = { g: typeof gen === 'function' ? gen() : gen, wait: 0, until: null, handle: null, done: false }; this.list.push(r); this._step(r); return r; }
  _step(r, val) {
    let res; try { res = r.g.next(val); } catch (e) { r.done = true; console.error(e); return; }
    if (res.done) { r.done = true; return; }
    const v = res.value; r.wait = 0;
    if (typeof v === 'number') r.wait = v; else if (typeof v === 'function') r.until = v; else if (v && typeof v === 'object' && 'done' in v) r.handle = v;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      if (r.done) { this.list.splice(i, 1); continue; }
      if (r.handle) { if (r.handle.done) { const h = r.handle; r.handle = null; this._step(r, h.value); } continue; }
      if (r.until) { if (r.until()) { r.until = null; this._step(r); } continue; }
      r.wait -= dt; if (r.wait <= 0) this._step(r);
    }
  }
  stop(r) { r.done = true; }
  clear() { this.list.length = 0; }
}
class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, []); this.map.get(name).push(fn); return () => { const a = this.map.get(name), i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; }
  emit(name, data) { const a = this.map.get(name); if (a) for (const f of a.slice()) f(data); }
}
//   new k.FSM({ idle: { enter() {}, update(dt, fsm) {}, exit() {} }, chase: {...} }, 'idle', owner)
class FSM {
  constructor(states, start, owner) { this.states = states; this.owner = owner; this.state = null; this.time = 0; if (start) this.go(start); }
  go(name, arg) { const p = this.states[this.state]; if (p && p.exit) p.exit.call(this.owner, this); this.state = name; this.time = 0; const s = this.states[name]; if (s && s.enter) s.enter.call(this.owner, this, arg); }
  update(dt) { this.time += dt; const s = this.states[this.state]; if (s && s.update) s.update.call(this.owner, dt, this); }
  is(name) { return this.state === name; }
}

// ---- Route finding ------------------------------------------------------------------------------------
// A grid is anything with cols, nrows, size and isSolid(tx, ty). A Tilemap is one. Path.grid() makes one from walls.
const Path = {
  grid(w, h, size, walls, pad = 0) {
    const cols = Math.ceil(w / size), nrows = Math.ceil(h / size), solid = new Uint8Array(cols * nrows);
    for (let ty = 0; ty < nrows; ty++) for (let tx = 0; tx < cols; tx++) {
      const cx = (tx + 0.5) * size, cy = (ty + 0.5) * size;
      for (const r of walls) if (cx > r.x - pad && cx < r.x + r.w + pad && cy > r.y - pad && cy < r.y + r.h + pad) { solid[ty * cols + tx] = 1; break; }
    }
    return { cols, nrows, size, solid, isSolid(tx, ty) { return tx < 0 || ty < 0 || tx >= cols || ty >= nrows || solid[ty * cols + tx] === 1; } };
  },
  // Shortest route between two tiles. Returns [{tx, ty, x, y}] from start to goal, or null.
  astar(grid, sx, sy, gx, gy, o = {}) {
    const cols = grid.cols, rows = grid.nrows, N = cols * rows, diag = o.diagonal !== false, s = grid.size || 1;
    if (grid.isSolid(gx, gy) || grid.isSolid(sx, sy)) return null;
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], hf = [];                              // binary heap of tile indices, ordered by hf
    const push = (i, f) => { let k = heap.length; heap.push(i); hf.push(f); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
    const pop = () => { const top = heap[0], li = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = li; hf[0] = lf; let k = 0; for (;;) { const a = k * 2 + 1, b = a + 1; let m = k; if (a < heap.length && hf[a] < hf[m]) m = a; if (b < heap.length && hf[b] < hf[m]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return diag ? Math.max(dx, dy) + 0.4142 * Math.min(dx, dy) : dx + dy; };
    const start = sy * cols + sx, goal = gy * cols + gx; g[start] = 0; push(start, h(sx, sy));
    let guard = o.limit || N * 4;
    while (heap.length && guard-- > 0) {
      const cur = pop(); if (cur === goal) break; if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % cols, cy = (cur / cols) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!diag && dx && dy) continue;
        const nx = cx + dx, ny = cy + dy; if (grid.isSolid(nx, ny)) continue;
        if (dx && dy && (grid.isSolid(cx + dx, cy) || grid.isSolid(cx, cy + dy))) continue;   // no squeezing past corners
        const ni = ny * cols + nx, ng = g[cur] + (dx && dy ? 1.4142 : 1);
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ni, ng + h(nx, ny)); }
      }
    }
    if (from[goal] < 0 && goal !== start) return null;
    const out = []; for (let i = goal; i >= 0; i = from[i]) { const tx = i % cols, ty = (i / cols) | 0; out.push({ tx, ty, x: (tx + 0.5) * s, y: (ty + 0.5) * s }); if (i === start) break; }
    return out.reverse();
  },
};
// One search from the targets outward; then every chaser just reads which way is downhill.
class FlowField {
  constructor(grid) { this.g = grid; this.cols = grid.cols; this.rows = grid.nrows; this.size = grid.size; this.dist = new Uint16Array(this.cols * this.rows).fill(65535); this.q = new Int32Array(this.cols * this.rows); this.out = { x: 0, y: 0 }; }
  compute(targets) {
    const d = this.dist, q = this.q, cols = this.cols, rows = this.rows, g = this.g; d.fill(65535); let head = 0, tail = 0;
    for (const t of targets) { const tx = Math.floor(t.x / this.size), ty = Math.floor(t.y / this.size); if (g.isSolid(tx, ty)) continue; const i = ty * cols + tx; if (d[i]) { d[i] = 0; q[tail++] = i; } }
    while (head < tail) {
      const i = q[head++], x = i % cols, y = (i / cols) | 0, nd = d[i] + 1;
      if (x > 0 && d[i - 1] > nd && !g.isSolid(x - 1, y)) { d[i - 1] = nd; q[tail++] = i - 1; }
      if (x < cols - 1 && d[i + 1] > nd && !g.isSolid(x + 1, y)) { d[i + 1] = nd; q[tail++] = i + 1; }
      if (y > 0 && d[i - cols] > nd && !g.isSolid(x, y - 1)) { d[i - cols] = nd; q[tail++] = i - cols; }
      if (y < rows - 1 && d[i + cols] > nd && !g.isSolid(x, y + 1)) { d[i + cols] = nd; q[tail++] = i + cols; }
    }
  }
  distAt(wx, wy) { const tx = Math.floor(wx / this.size), ty = Math.floor(wy / this.size); return tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows ? 65535 : this.dist[ty * this.cols + tx]; }
  dir(wx, wy) {                                            // unit vector toward the nearest target (shared object: read it straight away)
    const o = this.out, cols = this.cols, rows = this.rows, d = this.dist, g = this.g;
    const tx = U.clamp(Math.floor(wx / this.size), 0, cols - 1), ty = U.clamp(Math.floor(wy / this.size), 0, rows - 1), i = ty * cols + tx, here = d[i];
    o.x = o.y = 0;
    if (here === 0 || here === 65535) return o;
    const cap = here + 1;                                  // walls and unreachable tiles count as "one step worse"
    const l = tx > 0 && d[i - 1] < cap ? d[i - 1] : cap, r = tx < cols - 1 && d[i + 1] < cap ? d[i + 1] : cap;
    const u = ty > 0 && d[i - cols] < cap ? d[i - cols] : cap, dn = ty < rows - 1 && d[i + cols] < cap ? d[i + cols] : cap;
    let gx = l - r, gy = u - dn;
    if (!gx && !gy) { if (r < here) gx = 1; else if (l < here) gx = -1; else if (dn < here) gy = 1; else if (u < here) gy = -1; }
    if (gx && gy && g.isSolid(tx + (gx > 0 ? 1 : -1), ty + (gy > 0 ? 1 : -1))) { if ((gx > 0 ? r : l) <= (gy > 0 ? dn : u)) gy = 0; else gx = 0; }   // never aim into a corner
    const m = Math.hypot(gx, gy); if (m) { o.x = gx / m; o.y = gy / m; }
    return o;
  }
}

// ---- Hex grids (pointy-top, axial q,r) ------------------------------------------------------------------
const Hex = {
  dirs: [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],
  key: (q, r) => q + ',' + r,
  toPixel: (q, r, size) => ({ x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r }),
  fromPixel(x, y, size) { return Hex.round((Math.sqrt(3) / 3 * x - y / 3) / size, (2 / 3 * y) / size); },
  round(q, r) { let x = q, z = r, y = -x - z, rx = Math.round(x), ry = Math.round(y), rz = Math.round(z); const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z); if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry; return { q: rx + 0, r: rz + 0 }; },
  neighbors: (q, r) => Hex.dirs.map(([a, b]) => ({ q: q + a, r: r + b })),
  distance: (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2,
  disc(radius) { const out = []; for (let q = -radius; q <= radius; q++) for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push({ q, r }); return out; },
  path(c, x, y, size) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); c[i ? 'lineTo' : 'moveTo'](x + size * Math.cos(a), y + size * Math.sin(a)); } c.closePath(); },
};

// ---- Darkness: lights and vision cones, in screen space ------------------------------------------------
//   dark.begin(); dark.light(sx, sy, radius); dark.cone(sx, sy, angle, spread, radius); dark.end(c);
class Darkness {
  constructor(o = {}) {
    this.res = o.res || 0.5; this.ambient = o.ambient == null ? 0.86 : o.ambient; this.rgb = o.rgb || '5,7,10';
    this.cv = document.createElement('canvas'); this.cv.width = W * this.res; this.cv.height = H * this.res; this.c = this.cv.getContext('2d');
  }
  begin() { const c = this.c; c.setTransform(this.res, 0, 0, this.res, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H); c.fillStyle = `rgba(${this.rgb},${this.ambient})`; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'destination-out'; }
  _grad(x, y, radius, strength) { const g = this.c.createRadialGradient(x, y, radius * 0.2, x, y, radius); g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(1, 'rgba(0,0,0,0)'); this.c.fillStyle = g; }
  light(x, y, radius, strength = 1) { const c = this.c; this._grad(x, y, radius, strength); c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); }
  cone(x, y, angle, spread, radius, strength = 1) { const c = this.c; this._grad(x, y, radius, strength); c.beginPath(); c.moveTo(x, y); c.arc(x, y, radius, angle - spread / 2, angle + spread / 2); c.closePath(); c.fill(); }
  end(target) { target.drawImage(this.cv, 0, 0, W, H); }
}

// ---- Interact: prompts, hold-to-use, carry and throw ------------------------------------------------------
//   act.add({ x, y, r: 90, btn: 'a', label: 'Pick up', hold: 0, can: actor => true, use: actor => {} })
//   An actor is a player object with seat, x, y (and fx, fy, r if it carries things).
class Interact {
  constructor() { this.list = []; }
  add(o) { o.r = o.r || 90; o.btn = o.btn || 'a'; o.hold = o.hold || 0; o.progress = 0; this.list.push(o); return o; }
  remove(o) { const i = this.list.indexOf(o); if (i >= 0) this.list.splice(i, 1); }
  update(dt, actors) {
    for (const o of this.list) o._busy = false;
    for (const a of actors) {
      a.used = null; let best = null, bd = Infinity;
      for (const o of this.list) { if (o.can && !o.can(a)) continue; const d = U.dist2(a.x, a.y, o.x, o.y); if (d < o.r * o.r && d < bd) { bd = d; best = o; } }
      a.focus = best; if (!best) { a._wait = null; continue; }
      const s = a.seat;
      if (best.hold > 0) {
        if (a._wait === best) { if (!s.down(best.btn)) a._wait = null; continue; }      // let go before going again
        if (s.down(best.btn)) { best._busy = true; best.progress += dt / best.hold; if (best.progress >= 1) { best.progress = 0; a._wait = best; a.used = best; best.use(a); } }
      } else if (s.pressed(best.btn)) { a.used = best; best.use(a); }
    }
    for (const o of this.list) if (o.hold > 0 && !o._busy) o.progress = Math.max(0, o.progress - dt * 2);
  }
  draw(cam, actors) {                                      // call after cam.end(): prompts are drawn in screen space
    for (const a of actors) {
      const o = a.focus; if (!o) continue;
      const p = cam ? cam.toScreen(o.x, o.y - (o.lift == null ? o.r * 0.7 : o.lift)) : { x: o.x, y: o.y - (o.lift == null ? o.r * 0.7 : o.lift) };
      G.prompt(a.seat, o.btn, typeof o.label === 'function' ? o.label(a) : o.label, p.x, p.y, { progress: o.hold > 0 ? o.progress : 0 });
    }
  }
  // Carrying: an item is any object with x, y, r, vx, vy.
  hold(a, item) { if (item.held) item.held.carry = null; item.held = a; a.carry = item; item.vx = item.vy = 0; }
  release(a, vx = 0, vy = 0) { const it = a.carry; if (!it) return null; a.carry = null; it.held = null; it.vx = vx; it.vy = vy; return it; }
  updateItems(dt, items, world) {
    for (const it of items) {
      if (it.held) { const a = it.held, d = (a.r || 30) + it.r * 0.5; it.x = a.x + (a.fx || 0) * d; it.y = a.y + (a.fy || 0) * d; continue; }
      if (!it.vx && !it.vy) continue;
      const wx = it.x + it.vx * dt, wy = it.y + it.vy * dt; it.x = wx; it.y = wy;
      if (world && world.collide(it)) { if (Math.abs(it.x - wx) > 0.01) it.vx *= -0.45; if (Math.abs(it.y - wy) > 0.01) it.vy *= -0.45; it.bounced = true; }
      const k = Math.max(0, 1 - (it.drag || 3) * dt); it.vx *= k; it.vy *= k;
      if (Math.hypot(it.vx, it.vy) < 14) it.vx = it.vy = 0;
    }
  }
}

// ---- Choice: pick one card ------------------------------------------------------------------------------------
//   const i = yield k.choose({ title: 'Level up', by: seatIndex, options: [{ title, text, tag, icon(c, x, y, s) }] });
//   by: a seat index (that player picks), or leave it out and either player can.
class ChoiceScene {
  constructor(kit, o, handle) {
    this.overlay = true; this.k = kit; this.o = o; this.h = handle; this.i = Math.min(o.start || 0, o.options.length - 1); this.t = 0;
    this.seat = o.by == null ? null : Input.seats[o.by];
  }
  update(dt) {
    this.t += dt; const n = this.o.options.length, s = this.seat;
    if (s && s.bot) { if (this.t > 0.7) this._pick(this.o.pick ? this.o.pick(this.o.options, this.k.rng) : Math.floor(this.k.rng() * n)); return; }
    const dx = s ? s.nav().x : Input.menu.dx, a = s ? s.pressed('a') : Input.menu.a;
    if (dx) { const j = U.clamp(this.i + dx, 0, n - 1); if (j !== this.i) { this.i = j; Sfx.play('move'); } }
    if (a && this.t > 0.35) this._pick(this.i);            // a short lock-out so a stray press cannot choose
  }
  _pick(i) { Sfx.play('ready'); Engine.pop(); this.h.resolve(i); }
  draw() {
    const c = Engine.c, o = this.o, n = o.options.length, by = o.by, col = by == null ? T.text : T.p[by];
    c.fillStyle = 'rgba(7,9,13,0.86)'; c.fillRect(0, 0, W, H);
    const cw = Math.min(420, (W - 240 - (n - 1) * 32) / n), ch = 460, tw = n * cw + (n - 1) * 32, x0 = (W - tw) / 2, y0 = 360;
    if (by != null) { G.marker(by, x0 + 12, 226, 11); G.eyebrow('Player ' + (by + 1) + ' chooses', x0 + 38, 234, { color: col }); } else G.eyebrow('Either player chooses', x0, 234);
    G.text(o.title || 'Choose', x0 - 2, 306, { size: FS.lg, weight: 700 });
    const ease = U.easeOut(U.clamp(this.t / 0.25, 0, 1));
    o.options.forEach((op, k) => {
      const sel = k === this.i, x = x0 + k * (cw + 32), y = y0 + (1 - ease) * 40 - (sel ? 10 : 0);
      c.globalAlpha = ease;
      G.rrect(x, y, cw, ch, 16, sel ? T.s3 : T.s1, sel ? col : T.line, sel ? 4 : 2);
      if (op.icon) op.icon(c, x + cw / 2, y + 120, 64, sel);
      if (op.tag) G.eyebrow(op.tag, x + 28, y + 236, { color: T.faint });
      G.text(op.title, x + 28, y + 282, { size: FS.sm, weight: 700, color: sel ? T.text : T.muted });
      G.wrap(op.text || '', x + 28, y + 326, cw - 56, 32, { size: FS.xs, color: sel ? T.muted : T.faint }, 4);
      c.globalAlpha = 1;
    });
    const type = this.seat ? this.seat.type : Input.lastType, names = this.seat && this.seat.device ? this.seat.device.names : undefined;
    G.hints(x0, y0 + ch + 60, [['move', 'Look'], ['a', 'Take it']], type, { names });
  }
}

// ---- Simulate: play a game with bots and no screen ---------------------------------------------------------------
//   Couch.simulate('test-range', { seed: 7, seconds: 300 })  ->  { result, time, steps }
//   The game must have a bot(seat, ctl) method. Use it for balance runs: loop over seeds and count wins.
function simulate(id, o = {}) {
  const def = Couch.games.find(g => g.id === id);
  if (!def || !def.create) throw new Error('No playable game called ' + id);
  const n = o.players || Math.max(def.players || 2, 2), seats = [];
  for (let i = 0; i < n; i++) { const s = new Couch.Seat(i), d = Input.makeBot(i); s.device = d; d.seat = s; seats.push(s); }
  const wasMute = Sfx.mute; Sfx.mute = true;
  try {
    const kit = Couch.makeKit(def, { sim: true, seed: o.seed == null ? 1 : o.seed, players: seats, assists: o.assists || [0, 0] });
    const inner = def.create(kit), max = o.seconds || 600, step = o.step || STEP; let steps = 0;   // a bigger step runs faster, a little less exactly
    while (!kit.result && kit.time < max) {
      if (inner.bot) for (const s of seats) { s.device.ctl.clear(); inner.bot(s, s.device.ctl); }
      for (const s of seats) { const d = s.device; d.pb.set(d.b); Input.readBot(d); s._update(step); }
      kit.time += step; kit._tick(step); inner.update(step); steps++;
    }
    return { result: kit.result, time: kit.time, steps, inner };
  } finally { Sfx.mute = wasMute; }
}

Couch.modules = { Pool, Sprite, Shapes, Tilemap, Platformer, Rope, World, Routines, Events, FSM, Path, FlowField, Hex, Darkness, Interact, moveBox, pushCircleRect, rayRect };
Object.assign(Couch, Couch.modules, { ChoiceScene, makeHandle, simulate });
})();
