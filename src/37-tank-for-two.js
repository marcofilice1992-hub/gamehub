/* ==========================================================================
   TANK FOR TWO · slot 10 · Run-based action
   One tank, two seats. The driver steers, boosts and picks up crates. The
   gunner aims, picks a shell, fires and reloads. Ten waves; between waves one
   of you picks an upgrade, and you can swap seats.

   Developer keys while playing: F7 clears the current wave, F8 repairs the hull.
   Balance runs from the console: Couch.simulate('tank-for-two', { seed: 1, step: 1 / 30 })
   ========================================================================== */
(() => {
const { T, FS, G, U, Sfx, W, H } = Couch;
const TILE = 80, TAU = Math.PI * 2, WAVES = 10, ICE = '#BDEBFF', PEACH = '#FFB089';
const clock = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---- Sounds this game adds ---------------------------------------------------------------------
Object.assign(Sfx.bank, {
  cannon: (S, o) => { S.noise(0.26, { freq: 320, q: 0.7, vol: 0.3, ...o }); S.tone(95, 0.24, { to: 40, type: 'sawtooth', vol: 0.18, ...o }); },
  mg: (S, o) => S.noise(0.045, { freq: 2600, vol: 0.09, ...o }),
  clang: (S, o) => { S.tone(1250, 0.07, { type: 'square', vol: 0.05, ...o }); S.tone(1850, 0.05, { type: 'square', vol: 0.035, delay: 0.02, ...o }); },
  boom: (S, o) => { S.noise(0.45, { freq: 170, q: 0.6, vol: 0.32, ...o }); S.tone(70, 0.4, { to: 30, type: 'sine', vol: 0.26, ...o }); },
  reload: (S, o) => { S.tone(300, 0.05, { type: 'square', vol: 0.06, ...o }); S.tone(460, 0.06, { type: 'square', vol: 0.06, delay: 0.08, ...o }); },
  perfect: (S, o) => [660, 880, 1320].forEach((f, i) => S.tone(f, 0.08, { delay: i * 0.04, vol: 0.12, ...o })),
  jam: (S, o) => S.tone(110, 0.32, { type: 'square', vol: 0.09, ...o }),
});

// ---- Bugs --------------------------------------------------------------------------------------------
// armour: half-angle of the armoured front, in radians
const FOES = {
  crawler:   { name: 'Crawler',      r: 16, hp: 20,   sp: 195, dmg: 14, col: '#F0616D' },
  spitter:   { name: 'Spitter',      r: 22, hp: 50,   sp: 110, dmg: 12, col: '#B48CF2' },
  shellback: { name: 'Shellback',    r: 34, hp: 170,  sp: 82,  dmg: 16, col: '#D9507E', armour: 1.15, turn: 1.6 },
  hornet:    { name: 'Hornet',       r: 15, hp: 18,   sp: 300, dmg: 12, col: '#F07FA8', fly: true },
  siege:     { name: 'Siege beetle', r: 72, hp: 1800, sp: 58,  dmg: 24, col: '#C04A6A', armour: 1.0, turn: 0.9 },
};
const TIPS = {
  crawler: 'Crawlers burst when they touch you. Shoot them first.',
  spitter: 'Spitters shoot from range. Driver, dodge the shots.',
  shellback: 'Shellbacks are armoured at the front. Flank them, or use HE.',
  hornet: 'Hornets circle, then dive. Flak and the machine gun catch them.',
  siege: 'A Siege beetle. Armoured, it shoots, and it brings friends.',
};
const SHELLS = [
  { id: 'ap', name: 'AP', full: 'Armour-piercing', col: T.text, speed: 1500 },
  { id: 'he', name: 'HE', full: 'Explosive', col: PEACH, speed: 1000 },
  { id: 'flak', name: 'Flak', full: 'Flak', col: ICE, speed: 1300 },
];

// ---- Upgrades: role says whose job it changes ---------------------------------------------------
const UPGRADES = {
  mag:     { name: 'Big magazine', role: 'Gunner', max: 2, prio: 6, text: 'Three more rounds before you reload.', apply: g => { g.tank.magMax += 3; g.tank.mag = g.tank.magMax; } },
  loader:  { name: 'Quick loader', role: 'Gunner', max: 2, prio: 5, text: 'Reloading is 25% faster, and the green zone is wider.', apply: g => { g.st.reload *= 0.75; g.st.window += 0.04; } },
  sabot:   { name: 'Sabot rounds', role: 'Gunner', max: 2, prio: 6, text: 'AP does 40% more damage and passes through one more bug.', apply: g => { g.st.ap *= 1.4; g.st.pierce++; } },
  bigbang: { name: 'Big bang', role: 'Gunner', max: 2, prio: 5, text: 'HE blasts are 35% wider and hit 25% harder.', apply: g => { g.st.heRad *= 1.35; g.st.he *= 1.25; } },
  flak:    { name: 'Wide flak', role: 'Gunner', max: 2, prio: 4, text: 'Three more flak pellets, reaching 25% further.', apply: g => { g.st.flakN += 3; g.st.flakLife *= 1.25; } },
  cool:    { name: 'Cool barrel', role: 'Gunner', max: 2, prio: 4, text: 'The machine gun overheats 40% slower and hits 30% harder.', apply: g => { g.st.mgHeat *= 0.6; g.st.mg *= 1.3; } },
  twin:    { name: 'Twin barrel', role: 'Gunner', max: 1, prio: 9, needs: g => g.wave >= 4, text: 'The main gun fires two shells at once.', apply: g => { g.st.twin = true; } },
  plate:   { name: 'Plating', role: 'Driver', max: 3, prio: 5, text: '80 more hull, and 80 repaired now.', apply: g => { g.baseHp += 80; g.fitHull(); g.tank.hp = Math.min(g.tank.maxHp, g.tank.hp + 80); } },
  plough:  { name: 'Ram plough', role: 'Driver', max: 1, prio: 6, text: 'Boost into bugs for triple ram damage. Crawlers no longer hurt you when you ram them.', apply: g => { g.st.plough = true; } },
  turbo:   { name: 'Turbo', role: 'Driver', max: 2, prio: 4, text: 'Boost lasts 50% longer and refills faster. 8% more top speed.', apply: g => { g.st.boostDrain *= 0.66; g.st.boostRegen *= 1.4; g.st.speed *= 1.08; } },
  mines:   { name: 'Mine layer', role: 'Driver', max: 2, prio: 6, text: 'The driver presses A to drop a mine behind the tank.', apply: g => { g.st.mines++; } },
  repair:  { name: 'Field repair', role: 'Both of you', max: 2, prio: 5, text: 'The hull slowly repairs itself, all the time.', apply: g => { g.st.regen += 1.6; } },
  racks:   { name: 'Ammo racks', role: 'Both of you', max: 2, prio: 4, text: 'Carry 50% more HE and flak, and fill up now.', apply: g => { const t = g.tank; t.cap.he = Math.round(t.cap.he * 1.5); t.cap.flak = Math.round(t.cap.flak * 1.5); t.res.he = t.cap.he; t.res.flak = t.cap.flak; } },
};

// ---- Music -------------------------------------------------------------------------------------------
const SONG = { bpm: 104, root: 49, tracks: [
  { wave: 'triangle', oct: 1, vol: 0.11, len: 1.4, notes: [0, null, 0, null, null, null, 0, null, 3, null, 3, null, null, null, 5, null] },
  { wave: 'noise', vol: 0.05, len: 0.06, freq: 220, notes: [1, null, null, null, 1, null, null, null, 1, null, null, null, 1, null, 1, null] },
  { wave: 'noise', vol: 0.02, len: 0.03, freq: 8000, at: 0.3, notes: [null, null, 1, null, null, null, 1, null, null, null, 1, null, null, null, 1, 1] },
  { wave: 'square', oct: 3, vol: 0.018, len: 0.8, at: 0.6, notes: [7, null, 7, null, 10, null, 7, null, 5, null, 5, null, 3, null, 2, null] },
] };

// ---- Pictures -----------------------------------------------------------------------------------------
function foeShape(c, id, r, col) {
  const S = Couch.Shapes; c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = Math.max(2.5, r * 0.14);
  const done = (a = 0.3) => { c.globalAlpha = a; c.fillStyle = col; c.fill(); c.globalAlpha = 1; c.strokeStyle = col; c.stroke(); };
  c.beginPath();
  if (id === 'crawler') { S.star(c, 0, 0, r * 1.1, 7, 0.62, 0); done(0.35); c.beginPath(); c.arc(r * 0.3, 0, r * 0.22, 0, TAU); c.fillStyle = col; c.fill(); }
  else if (id === 'spitter') { S.poly(c, 0, 0, r * 1.05, 4, 0); done(); c.beginPath(); c.arc(r * 0.2, 0, r * 0.32, 0, TAU); c.fillStyle = col; c.fill(); }
  else if (id === 'hornet') { c.moveTo(r * 1.4, 0); c.lineTo(-r * 0.6, r * 0.4); c.lineTo(-r * 0.3, 0); c.lineTo(-r * 0.6, -r * 0.4); c.closePath(); done(0.45); c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 0.5, r * 1.1); c.moveTo(0, 0); c.lineTo(-r * 0.5, -r * 1.1); c.stroke(); }
  else {                                                      // shellback and siege: a body, and a thick pale plate on the armoured front
    const big = id === 'siege', arm = FOES[id].armour;
    c.arc(0, 0, r * 0.82, 0, TAU); done(0.3);
    if (big) { for (let i = 0; i < 6; i++) { const a = Math.PI * 0.6 + (i / 5) * Math.PI * 0.8; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); c.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); c.stroke(); } }
    c.beginPath(); c.arc(0, 0, r * 0.98, -arm, arm); c.strokeStyle = '#F4E6EA'; c.lineWidth = r * (big ? 0.26 : 0.3); c.stroke();
    c.beginPath(); c.arc(r * 0.15, 0, r * 0.18, 0, TAU); c.fillStyle = col; c.fill();
  }
}
function bakeSprites(k) {
  const out = {};
  for (const id in FOES) {
    const d = FOES[id], size = d.r * 3, make = col => k.Sprite.bake(size, size, c => foeShape(c, id, d.r, col)).spin(32);
    out[id] = { base: make(d.col), hit: make('#FFFFFF') };
  }
  out.ammo = k.Sprite.bake(60, 60, c => { G.rrect(-22, -22, 44, 44, 8, 'rgba(255,176,137,0.18)', PEACH, 3); for (const [x, col] of [[-9, PEACH], [0, ICE], [9, T.text]]) G.rrect(x - 3, -12, 6, 24, 3, col); });
  out.repair = k.Sprite.bake(60, 60, c => { G.rrect(-22, -22, 44, 44, 8, 'rgba(46,189,133,0.2)', T.good, 3); G.line(0, -11, 0, 11, T.text, 6); G.line(-11, 0, 11, 0, T.text, 6); });
  return out;
}
function drawIcon(c, id, x, y, s, col) {
  const h = s / 2, S = Couch.Shapes;
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, s * 0.08); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  switch (id) {
    case 'mag': for (const o of [-0.5, 0, 0.5]) { c.rect(x + h * o - h * 0.14, y - h * 0.5, h * 0.28, h * 1.1); } c.stroke(); break;
    case 'loader': c.arc(x, y, h * 0.72, 0, TAU); c.moveTo(x, y - h * 0.4); c.lineTo(x, y); c.lineTo(x + h * 0.3, y + h * 0.18); c.stroke(); break;
    case 'sabot': c.moveTo(x - h * 0.8, y); c.lineTo(x + h * 0.3, y); c.stroke(); S.arrow(c, x + h * 0.45, y, 0, h * 0.45); c.fill(); break;
    case 'bigbang': S.star(c, x, y, h * 0.85, 8, 0.5); c.stroke(); break;
    case 'flak': for (const a of [-0.5, -0.17, 0.17, 0.5]) { c.moveTo(x - h * 0.75, y); c.lineTo(x - h * 0.75 + Math.cos(a) * h * 1.5, y + Math.sin(a) * h * 1.5); } c.stroke(); break;
    case 'cool': for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; c.moveTo(x + Math.cos(a) * h * 0.8, y + Math.sin(a) * h * 0.8); c.lineTo(x - Math.cos(a) * h * 0.8, y - Math.sin(a) * h * 0.8); } c.stroke(); break;
    case 'twin': c.moveTo(x - h * 0.7, y - h * 0.25); c.lineTo(x + h * 0.7, y - h * 0.25); c.moveTo(x - h * 0.7, y + h * 0.25); c.lineTo(x + h * 0.7, y + h * 0.25); c.lineWidth *= 1.6; c.stroke(); break;
    case 'plate': c.moveTo(x, y - h * 0.8); c.lineTo(x + h * 0.7, y - h * 0.45); c.lineTo(x + h * 0.55, y + h * 0.35); c.lineTo(x, y + h * 0.8); c.lineTo(x - h * 0.55, y + h * 0.35); c.lineTo(x - h * 0.7, y - h * 0.45); c.closePath(); c.stroke(); break;
    case 'plough': c.moveTo(x + h * 0.8, y); c.lineTo(x - h * 0.4, y - h * 0.8); c.lineTo(x - h * 0.4, y + h * 0.8); c.closePath(); c.stroke(); break;
    case 'turbo': for (const o of [-0.4, 0, 0.4]) { c.moveTo(x + h * o - h * 0.25, y - h * 0.55); c.lineTo(x + h * o + h * 0.2, y); c.lineTo(x + h * o - h * 0.25, y + h * 0.55); } c.stroke(); break;
    case 'mines': c.arc(x, y, h * 0.55, 0, TAU); c.stroke(); c.beginPath(); c.arc(x, y, h * 0.18, 0, TAU); c.fill(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(x + Math.cos(a) * h * 0.55, y + Math.sin(a) * h * 0.55); c.lineTo(x + Math.cos(a) * h * 0.85, y + Math.sin(a) * h * 0.85); c.stroke(); } break;
    case 'repair': case 'heal': c.lineWidth *= 1.6; c.moveTo(x, y - h * 0.6); c.lineTo(x, y + h * 0.6); c.moveTo(x - h * 0.6, y); c.lineTo(x + h * 0.6, y); c.stroke(); break;
    case 'racks': c.rect(x - h * 0.75, y - h * 0.5, h * 1.5, h); c.moveTo(x - h * 0.25, y - h * 0.5); c.lineTo(x - h * 0.25, y + h * 0.5); c.moveTo(x + h * 0.25, y - h * 0.5); c.lineTo(x + h * 0.25, y + h * 0.5); c.stroke(); break;
  }
  c.restore();
}
function buildMap(k) {
  const C = 36, R = 22, grid = [];
  for (let y = 0; y < R; y++) { grid.push([]); for (let x = 0; x < C; x++) grid[y].push(x === 0 || y === 0 || x === C - 1 || y === R - 1 ? '#' : '.'); }
  const blocks = [[7, 4, 3, 2], [26, 4, 3, 2], [7, 16, 3, 2], [26, 16, 3, 2], [15, 7, 6, 1], [15, 14, 6, 1], [11, 10, 1, 2], [24, 10, 1, 2], [3, 9, 1, 4], [32, 9, 1, 4]];
  for (const [bx, by, bw, bh] of blocks) for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) grid[y][x] = '#';
  return new k.Tilemap({ size: TILE, rows: grid.map(r => r.join('')), solid: '#', paint(c, ch, x, y, s, tx, ty, m) {
    if (ch === '#') {
      c.fillStyle = '#141922'; c.fillRect(x, y, s, s); c.fillStyle = T.line2;
      if (!m.isSolid(tx, ty - 1)) c.fillRect(x, y, s, 3); if (!m.isSolid(tx, ty + 1)) c.fillRect(x, y + s - 3, s, 3);
      if (!m.isSolid(tx - 1, ty)) c.fillRect(x, y, 3, s); if (!m.isSolid(tx + 1, ty)) c.fillRect(x + s - 3, y, 3, s);
    } else { c.fillStyle = 'rgba(255,255,255,0.035)'; c.fillRect(x, y, s, 2); c.fillRect(x, y, 2, s); }
  } });
}

// ---- Bug behaviour (this = the bug) --------------------------------------------------------------------
function FOE_UPDATE(dt) {
  const g = this.g, t = g.tank, d = FOES[this.type];
  if (this.flash > 0) this.flash -= dt;
  const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy) || 1, toT = Math.atan2(dy, dx), ox = this.x, oy = this.y;
  let sx = 0, sy = 0, face = null; this.stT -= dt;
  const chase = sp => { if (d.fly || dist < TILE * 1.6) { sx = dx / dist * sp; sy = dy / dist * sp; } else { const f = g.flow.dir(this.x, this.y); sx = f.x * sp; sy = f.y * sp; } };
  if (this.type === 'crawler') chase(this.sp);
  else if (this.type === 'spitter') {
    if (dist < 560 && g.map.los(this.x, this.y, t.x, t.y)) {
      face = toT; if (dist < 320) { sx = -dx / dist * this.sp * 0.7; sy = -dy / dist * this.sp * 0.7; }
      if (this.stT <= 0) { g.bolt(this.x, this.y, toT, 340); this.stT = 2.6; }
    } else chase(this.sp);
  } else if (this.type === 'hornet') {
    if (this.st === 0) {
      this.orb += dt * this.spin; const px = t.x + Math.cos(this.orb) * 380, py = t.y + Math.sin(this.orb) * 380, ex = px - this.x, ey = py - this.y, ed = Math.hypot(ex, ey) || 1;
      sx = ex / ed * Math.min(this.sp, ed * 4); sy = ey / ed * Math.min(this.sp, ed * 4);
      if (this.stT <= 0) { this.st = 1; this.stT = 0.6; }
    } else if (this.st === 1) { face = toT; this.dx = dx / dist; this.dy = dy / dist; if (this.stT <= 0) { this.st = 2; this.stT = 0.85; } }
    else { sx = this.dx * 760; sy = this.dy * 760; face = Math.atan2(this.dy, this.dx); if (this.stT <= 0) { this.st = 0; this.stT = U.range(g.k.rng, 2.5, 4.5); this.orb = Math.atan2(this.y - t.y, this.x - t.x); } }
  } else {                                                     // shellback, siege: turn the armour toward you, walk in
    this.a += U.clamp(U.angleDiff(this.a, toT), -d.turn * dt, d.turn * dt); face = this.a;
    chase(this.sp * (Math.abs(U.angleDiff(this.a, toT)) > 1.2 ? 0.5 : 1));
    if (this.type === 'siege') {
      if ((this.fireT -= dt) <= 0 && g.map.los(this.x, this.y, t.x, t.y)) { for (let i = -2; i <= 2; i++) g.bolt(this.x + Math.cos(this.a) * 60, this.y + Math.sin(this.a) * 60, this.a + i * 0.16, 300); this.fireT = 3.2; }
      if ((this.spawnT -= dt) <= 0) { for (let i = 0; i < 3; i++) { const a = this.a + Math.PI + (i - 1) * 0.6; g.spawn('crawler', this.x + Math.cos(a) * 100, this.y + Math.sin(a) * 100); } this.spawnT = 9; }
    }
  }
  if (face == null && (sx || sy)) face = Math.atan2(sy, sx);
  if (face != null) this.a = face;
  this.x += (sx + this.kx) * dt; this.y += (sy + this.ky) * dt; const kd = Math.max(0, 1 - 6 * dt); this.kx *= kd; this.ky *= kd;
  if (d.fly) { this.x = U.clamp(this.x, this.r, g.map.w - this.r); this.y = U.clamp(this.y, this.r, g.map.h - this.r); } else g.map.collideCircle(this);
  this.vx = (this.x - ox) / dt; this.vy = (this.y - oy) / dt;
}
function FOE_DRAW(c, e) {
  const g = e.g, s = g.spr[e.type], d = FOES[e.type];
  if (e.type === 'hornet' && e.st === 1) { c.globalAlpha = 0.5; c.setLineDash([12, 10]); G.line(e.x, e.y, e.x + e.dx * 700, e.y + e.dy * 700, d.col, 3); c.setLineDash([]); c.globalAlpha = 1; }
  const blink = e.type === 'hornet' && e.st === 1 && Math.floor(e.stT * 14) % 2 === 0;
  (e.flash > 0 || blink ? s.hit : s.base).draw(c, e.x, e.y, e.a, e.r / d.r);
  if (e.type === 'siege') G.bar(e.x - 70, e.y - e.r - 34, 140, 10, e.hp / e.max, T.bad);
}
function PICKUP_DRAW(c, e) { e.g.spr[e.kind].draw(c, e.x, e.y + Math.sin(e.g.time * 3 + e.x) * 4); }

// =============================================================================================
class TankForTwo {
  constructor(k) {
    this.k = k; const map = this.map = buildMap(k);
    this.world = new k.World({ w: map.w, h: map.h, cell: 128, map });
    this.flow = new k.FlowField(map); this.ft = 0;
    this.cam = new k.Camera({ minZoom: 0.84, maxZoom: 0.84, margin: 0, bounds: { x: -100, y: -230, w: map.w + 200, h: map.h + 460 } });
    this.fx = new k.Particles(1600); this.floats = new k.Floaters(); this.spr = bakeSprites(k);
    this.shells = []; this.bolts = []; this.bullets = []; this.mines = []; this.rings = [];
    this.gates = [[18, 1], [18, 20], [1, 11], [34, 11]].map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, warn: 0 }));
    this.st = { speed: 300, turn: 3.2, boostMul: 1.75, boostDrain: 0.5, boostRegen: 0.3, reload: 1.6, window: 0, ap: 34, pierce: 1, he: 22, heRad: 120, heSplash: 30,
      flakN: 7, flak: 9, flakLife: 0.36, mg: 5, mgHeat: 0.045, twin: false, plough: false, mines: 0, regen: 0, magnet: 140 };
    this.baseHp = 300; this.taken = {}; this.time = 0; this.wave = 0; this.over = false; this.left = 0; this.seen = {};
    this.stats = { kills: 0, shots: 0, perfect: 0, rams: 0, crates: 0 };
    this.driver = k.players[0]; this.gunner = k.players[1] || k.players[0];
    const cx = map.w / 2, cy = map.h / 2;
    this.tank = { x: cx, y: cy, r: 46, a: -Math.PI / 2, ta: -Math.PI / 2, v: 0, vx: 0, vy: 0, hp: 0, maxHp: 1, iframe: 0, hurtT: 0, boost: 1, boostCd: 0, boosting: false,
      mag: 6, magMax: 6, shell: 0, res: { he: 12, flak: 20 }, cap: { he: 24, flak: 40 }, cd: 0, rel: null, heat: 0, over: false, mgT: 0, recoil: 0, mineCd: 0, buff: 0 };
    this.fitHull(); this.tank.hp = this.tank.maxHp;
    this.banner = null; this.swapT = 0; this.swapWant = {}; this.crateT = 8; this.sndT = 0;
    this.flow.compute([this.tank]); this.cam.follow([this.tank], 0, true);
    if (!k.sim) Sfx.music.play(SONG);
    this.script();
  }
  fitHull() {                                                // the driver's assist sets how much hull there is
    const t = this.tank, f = t.maxHp > 1 ? t.hp / t.maxHp : 1;
    t.maxHp = Math.round(this.baseHp * [1, 1.3, 1.6][this.k.assist(this.driver.index)]); t.hp = f * t.maxHp;
  }
  get gAssist() { return this.k.assist(this.gunner.index); }

  // ---- The run: ten waves, upgrades and seat swaps between them ----------------------------------------
  script() {
    const self = this, k = this.k;
    k.run(function* () {
      yield 0.8;
      for (let n = 1; n <= WAVES; n++) {
        self.wave = n; const plan = self.plan(n);
        self.left = plan.reduce((a, gr) => a + gr.units.length, 0);
        const fresh = [...new Set(plan.flatMap(gr => gr.units))].filter(id => !self.seen[id]); fresh.forEach(id => { self.seen[id] = true; });
        self.banner = { title: (n === WAVES ? 'Final wave' : 'Wave ' + n), sub: fresh.length ? TIPS[fresh[fresh.length - 1]] : (n === 5 || n === 10 ? TIPS.siege : ''), t: 3 };
        Sfx.play('open', { pitch: 0.8 }); self.fighting = true;
        yield 2.2;
        for (const gr of plan) {
          if (self.skip) break;
          const gate = self.gates[gr.gate]; gate.warn = 1.1; yield 1.1;
          if (self.skip) break;
          gr.units.forEach((id, i) => { const a = (i / gr.units.length) * TAU; self.spawn(id, gate.x + Math.cos(a) * 34, gate.y + Math.sin(a) * 34, true); });
          yield gr.gap;
        }
        yield () => self.world.count('enemy') === 0;
        self.skip = false; self.fighting = false;
        if (self.over) return;
        if (n === WAVES) break;
        self.tank.hp = Math.min(self.tank.maxHp, self.tank.hp + self.tank.maxHp * 0.08);
        k.toast('Wave ' + n + ' cleared. Hull patched up a little.', { color: T.good });
        yield 1.2;
        const who = k.players[(n - 1) % k.players.length], opts = self.cards();
        const i = yield k.choose({ title: 'Wave ' + n + ' cleared. Pick an upgrade.', by: who.index, options: opts, pick: o => o.reduce((b, x, j) => (x.prio > o[b].prio ? j : b), 0) });
        opts[i].apply(); k.toast(opts[i].title, { seat: who.index });
        if (k.players.length > 1) { self.swapT = 4.5; self.swapWant = {}; yield () => self.swapT <= 0; }
      }
      self.win();
    });
  }
  plan(n) {
    const rng = this.k.rng, c = { crawler: 8 + n * 5, spitter: n >= 2 ? Math.floor(1 + n * 0.7) : 0, shellback: n >= 3 ? Math.floor((n - 1) / 1.8) : 0, hornet: n >= 4 ? (n - 3) * 2 : 0 };
    const units = []; for (const id in c) for (let i = 0; i < c[id]; i++) units.push(id);
    U.shuffle(rng, units);
    const groups = [], gap = Math.max(1.4, 4.2 - n * 0.24);
    if (n === 5 || n === 10) groups.push({ units: ['siege'], gate: Math.floor(rng() * 4), gap: 5 });
    while (units.length) groups.push({ units: units.splice(0, 3 + Math.floor(rng() * 4)), gate: Math.floor(rng() * 4), gap });
    return groups;
  }
  spawn(type, x, y, counted) {
    const d = FOES[type], n = Math.max(1, this.wave), hm = 1 + 0.16 * (n - 1) * (type === 'siege' ? 0 : 1), hp = (type === 'siege' ? (n >= 10 ? 3200 : 1400) : d.hp) * hm, rng = this.k.rng;
    if (counted) this.left--;
    if (!d.fly && this.map.solidAt(x, y)) { x = this.map.w / 2; y = TILE * 2; }
    return this.world.add({ tag: 'enemy', type, g: this, x, y, r: d.r, hp, max: hp, sp: d.sp * U.range(rng, 0.9, 1.1), dmg: d.dmg, kx: 0, ky: 0, vx: 0, vy: 0, flash: 0,
      a: Math.atan2(this.tank.y - y, this.tank.x - x), st: 0, stT: U.range(rng, 1, 3), orb: rng() * TAU, spin: rng() < 0.5 ? 1.1 : -1.1, fireT: 2, spawnT: 6, ramT: 0,
      update: FOE_UPDATE, draw: FOE_DRAW });
  }
  dmgMul() { return 1 + 0.11 * (Math.max(1, this.wave) - 1); }

  // ---- The step -----------------------------------------------------------------------------------------
  update(dt) {
    const k = this.k, t = this.tank;
    if (!this.over) this.time += dt;
    this.drive(dt); this.gun(dt);
    if ((this.ft -= dt) <= 0) { this.flow.compute([t]); this.ft = 0.3; }
    this.world.separate('enemy', 0.5); this.world.update(dt);
    if (!this.over) this.contacts();
    this.updateShells(dt); this.updateBolts(dt); this.updateMines(dt); this.pickups(dt);
    for (const gt of this.gates) gt.warn = Math.max(0, gt.warn - dt);
    let j = 0; for (const r of this.rings) { r.t += dt; if (r.t < r.life) this.rings[j++] = r; } this.rings.length = j;
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.swapT > 0) this.swapStep(dt);
    this.fx.update(dt); this.floats.update(dt);
    const look = 170; this.cam.follow([{ x: t.x + Math.cos(t.ta) * look, y: t.y + Math.sin(t.ta) * look }], dt);
    this.sndT -= dt;
    if (!k.sim) Sfx.music.intensity = U.clamp(this.world.count('enemy') / 30 + this.wave / 14, 0, 1);
    k.watch.wave = this.wave; k.watch.bugs = this.world.count('enemy');
  }
  drive(dt) {
    const t = this.tank, st = this.st, s = this.driver;
    t.iframe -= dt; t.hurtT -= dt; t.recoil = Math.max(0, t.recoil - dt * 6);
    if (this.over) { t.v = U.damp(t.v, 0, 4, dt); return; }
    t.hp = Math.min(t.maxHp, t.hp + st.regen * dt);
    const mx = s.move.x, my = s.move.y, mag = Math.min(1, Math.hypot(mx, my));
    t.boosting = s.value('rt') > 0.3 && t.boost > 0.02 && mag > 0.2;
    if (t.boosting) { t.boost = Math.max(0, t.boost - st.boostDrain * dt); t.boostCd = 0.6; }
    else if ((t.boostCd -= dt) <= 0) t.boost = Math.min(1, t.boost + st.boostRegen * dt);
    let target = 0;
    if (mag > 0.15) {
      const want = Math.atan2(my, mx); let d = U.angleDiff(t.a, want), rev = false;
      if (Math.abs(d) > Math.PI * 0.62) { rev = true; d = U.angleDiff(t.a, want + Math.PI); }   // a tank backs up rather than turning all the way round
      t.a += U.clamp(d, -st.turn * dt, st.turn * dt);
      target = st.speed * mag * Math.max(0, Math.cos(d)) * (t.boosting ? st.boostMul : 1) * (rev ? -0.75 : 1);
    }
    t.v = U.damp(t.v, target, 6, dt);
    const ox = t.x, oy = t.y; t.x += Math.cos(t.a) * t.v * dt; t.y += Math.sin(t.a) * t.v * dt;
    this.world.collide(t); t.vx = (t.x - ox) / dt; t.vy = (t.y - oy) / dt;
    if (t.boosting && Math.random() < 0.5) this.fx.emit(t.x - Math.cos(t.a) * 50, t.y - Math.sin(t.a) * 50, -Math.cos(t.a) * 200 + (Math.random() - 0.5) * 80, -Math.sin(t.a) * 200 + (Math.random() - 0.5) * 80, 0.3, 9, T.p[s.index]);
    t.mineCd -= dt;
    if (st.mines && s.pressed('a') && t.mineCd <= 0 && this.mines.length < 8) {
      this.mines.push({ x: t.x - Math.cos(t.a) * 64, y: t.y - Math.sin(t.a) * 64, arm: 0.6, big: st.mines > 1 });
      t.mineCd = st.mines > 1 ? 1.8 : 3; Sfx.play('tick', { pitch: 0.6 });
    }
  }
  gun(dt) {
    const t = this.tank, st = this.st, s = this.gunner, k = this.k, a = this.gAssist;
    t.cd -= dt; t.buff = Math.max(0, t.buff - dt);
    if (this.over) return;
    // aim with either stick; the assist pulls toward the nearest bug in a cone
    let ax = s.move.x, ay = s.move.y; if (Math.hypot(ax, ay) < 0.3) { ax = s.aim.x; ay = s.aim.y; }
    if (Math.hypot(ax, ay) >= 0.3) {
      let want = Math.atan2(ay, ax);
      if (a) {
        const cone = [0, 0.2, 0.42][a]; let best = null, bd = cone;
        this.world.near(t.x, t.y, 950, 'enemy', e => { const d = Math.abs(U.angleDiff(want, Math.atan2(e.y - t.y, e.x - t.x))); if (d < bd) { bd = d; best = e; } });
        if (best) want = Math.atan2(best.y - t.y, best.x - t.x);
      }
      const rate = [6, 7, 8.5][a] * dt; t.ta += U.clamp(U.angleDiff(t.ta, want), -rate, rate);
    }
    // shell type
    const step = (s.pressed('rb') ? 1 : 0) - (s.pressed('lb') ? 1 : 0);
    if (step) { t.shell = (t.shell + step + 3) % 3; Sfx.play('move'); if (t.shell && !t.res[SHELLS[t.shell].id]) this.floats.add('No ' + SHELLS[t.shell].name + ' left', t.x, t.y - 90, { color: T.muted }); }
    // reload: press X to start, then again in the green to finish early
    const r = t.rel;
    if (r) {
      r.t += dt; const p = r.t / r.dur, w = st.window + [0, 0.04, 0.08][a], g0 = 0.42 - w / 2, g1 = 0.62 + w / 2, p0 = 0.48 - w / 4, p1 = 0.555 + w / 4;
      r.g0 = g0; r.g1 = g1; r.p0 = p0; r.p1 = p1;
      if (s.pressed('x') && !r.tried) {
        r.tried = true;
        if (p >= p0 && p <= p1) { this.finishReload(true); return; }
        if (p >= g0 && p <= g1) { this.finishReload(false); return; }
        r.dur += 0.9; r.jam = true; Sfx.play('jam'); this.floats.add('Jammed', t.x, t.y - 100, { color: T.bad }); s.rumble(0.4, 200);
      }
      if (r.t >= r.dur) this.finishReload(false);
    } else if (s.pressed('x') && t.mag < t.magMax) { t.rel = { t: 0, dur: st.reload, tried: false }; Sfx.play('tick'); }
    // main gun
    if (!t.rel && s.value('rt') > 0.5 && t.cd <= 0) {
      const sh = SHELLS[t.shell];
      if (t.shell && t.res[sh.id] <= 0) { t.shell = 0; this.floats.add('Out of ' + sh.name + '. Back to AP.', t.x, t.y - 90, { color: T.muted }); }
      else this.fire();
    }
    // machine gun
    t.mgT -= dt; const mg = s.value('lt') > 0.5 && !t.over;
    if (mg && t.mgT <= 0) {
      t.mgT = 0.075; t.heat += st.mgHeat; if (t.heat >= 1) { t.over = true; Sfx.play('deny'); }
      const ang = t.ta + (k.rng() - 0.5) * 0.12, mx = t.x + Math.cos(t.ta) * 40 + Math.cos(t.ta + Math.PI / 2) * 16, my = t.y + Math.sin(t.ta) * 40 + Math.sin(t.ta + Math.PI / 2) * 16;
      this.shells.push({ x: mx, y: my, vx: Math.cos(ang) * 1600, vy: Math.sin(ang) * 1600, r: 6, kind: 'mg', dmg: st.mg, pierce: 0, life: 0.55, hits: [] });
      if (this.sndT <= 0) { Sfx.play('mg'); this.sndT = 0.07; }
    } else if (!mg) t.heat = Math.max(0, t.heat - 0.5 * dt);
    if (t.over && t.heat < 0.3) t.over = false;
    if (t.over) t.heat = Math.max(0, t.heat - 0.5 * dt);
  }
  finishReload(perfect) {
    const t = this.tank; t.mag = t.magMax; t.rel = null;
    if (perfect) { t.buff = 6; this.stats.perfect++; Sfx.play('perfect'); this.floats.add('Perfect', t.x, t.y - 100, { color: T.good }); this.gunner.rumble(0.3, 80); }
    else Sfx.play('reload');
  }
  fire() {
    const t = this.tank, st = this.st, sh = SHELLS[t.shell], k = this.k, mul = t.buff > 0 ? 1.25 : 1;
    const barrels = st.twin ? [-12, 12] : [0];
    for (const off of barrels) {
      const px = t.x + Math.cos(t.ta) * 70 + Math.cos(t.ta + Math.PI / 2) * off, py = t.y + Math.sin(t.ta) * 70 + Math.sin(t.ta + Math.PI / 2) * off;
      if (sh.id === 'flak') {
        for (let i = 0; i < st.flakN; i++) { const a = t.ta + (i / (st.flakN - 1) - 0.5) * 0.55 + (k.rng() - 0.5) * 0.05; this.shells.push({ x: px, y: py, vx: Math.cos(a) * sh.speed, vy: Math.sin(a) * sh.speed, r: 7, kind: 'flak', dmg: st.flak * mul, pierce: 0, life: st.flakLife * U.range(k.rng, 0.85, 1.1), hits: [] }); }
      } else this.shells.push({ x: px, y: py, vx: Math.cos(t.ta) * sh.speed, vy: Math.sin(t.ta) * sh.speed, r: sh.id === 'he' ? 11 : 8, kind: sh.id, dmg: (sh.id === 'he' ? st.he : st.ap) * mul, pierce: sh.id === 'ap' ? st.pierce : 0, life: 1.1, hits: [] });
      this.fx.burst(px, py, 8, { color: sh.col, angle: t.ta, spread: 0.7, speed: [200, 600], life: 0.2, size: 7 });
    }
    if (t.shell) t.res[sh.id]--;
    t.mag--; t.cd = 0.42; t.recoil = 1; this.stats.shots++;
    k.shake(0.12); this.gunner.rumble(0.35, 90, 0.2); this.driver.rumble(0.15, 90, 0.1); k.sfxAt('cannon', t.x, this.cam);
    if (t.mag <= 0) t.rel = { t: 0, dur: st.reload, tried: false };
  }

  // ---- Hits ---------------------------------------------------------------------------------------------
  hurt(e, dmg, kind, fx, fy) {
    if (!e.alive) return;
    const d = FOES[e.type];
    if (d.armour && kind !== 'splash' && kind !== 'ram') {
      if (Math.abs(U.angleDiff(e.a, Math.atan2(fy - e.y, fx - e.x))) < d.armour) {   // hit on the armoured front
        dmg *= kind === 'ap' ? 0.6 : 0.2;
        this.fx.burst(fx, fy, 5, { color: '#F4E6EA', speed: [120, 380], life: 0.2, size: 5 });
        if (this.sndT <= 0) { this.k.sfxAt('clang', e.x, this.cam); this.sndT = 0.06; }
      }
    }
    e.hp -= dmg; e.flash = 0.06;
    if (e.hp <= 0) this.kill(e);
  }
  kill(e) {
    if (!e.alive) return;
    this.world.remove(e); this.stats.kills++;
    const d = FOES[e.type], rng = this.k.rng;
    this.fx.burst(e.x, e.y, e.type === 'siege' ? 80 : 8, { color: d.col, speed: [80, 360], life: 0.45, size: 7 });
    if (e.type === 'siege') { this.boom(e.x, e.y, 220, 0, true); this.drop(e.x - 40, e.y, 'ammo'); this.drop(e.x + 40, e.y, 'repair'); this.k.toast('Siege beetle down', { color: T.good }); this.k.shake(0.6); }
    else if (e.type === 'shellback') { if (rng() < 0.5) this.drop(e.x, e.y, 'ammo'); else if (rng() < 0.4) this.drop(e.x, e.y, 'repair'); }
    else if (e.type === 'spitter' && rng() < 0.2) this.drop(e.x, e.y, 'ammo');
    if (this.sndT <= 0) { this.k.sfxAt('tick', e.x, this.cam, { pitch: 0.6, vol: 0.06 }); this.sndT = 0.04; }
  }
  boom(x, y, rad, dmg, big) {
    if (dmg) this.world.near(x, y, rad, 'enemy', e => { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; e.kx += dx / d * 380; e.ky += dy / d * 380; this.hurt(e, dmg, 'splash', x, y); });
    this.rings.push({ x, y, rad, t: 0, life: big ? 0.5 : 0.3, col: PEACH });
    this.fx.burst(x, y, big ? 40 : 16, { color: PEACH, speed: [100, 480], life: 0.45, size: 8 });
    this.k.sfxAt('boom', x, this.cam, { vol: big ? 0.4 : 0.22 }); if (big) this.k.shake(0.3);
  }
  updateShells(dt) {
    const S = this.shells, map = this.map; let j = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      const wall = map.solidAt(s.x, s.y);
      if (s.life <= 0 || wall) { if (s.kind === 'he') this.boom(s.x, s.y, this.st.heRad, this.st.heSplash * (s.dmg / this.st.he)); else if (wall) this.fx.burst(s.x, s.y, 3, { color: T.muted, speed: [40, 160], life: 0.2, size: 5 }); continue; }
      let dead = false;
      this.world.near(s.x, s.y, s.r, 'enemy', e => {
        if (dead || !e.alive || s.hits.includes(e)) return;
        s.hits.push(e);
        if (s.kind === 'he') { this.hurt(e, s.dmg, 'he', s.x - s.vx * 0.02, s.y - s.vy * 0.02); this.boom(s.x, s.y, this.st.heRad, this.st.heSplash * (s.dmg / this.st.he)); dead = true; return; }
        this.hurt(e, s.dmg, s.kind, s.x - s.vx * 0.02, s.y - s.vy * 0.02);
        const push = s.kind === 'ap' ? 0.15 : 0.05; e.kx += s.vx * push * (1 - (e.type === 'siege' ? 0.9 : 0)); e.ky += s.vy * push * (1 - (e.type === 'siege' ? 0.9 : 0));
        if (s.pierce-- <= 0) dead = true;
      });
      if (!dead) S[j++] = s;
    }
    S.length = j;
  }
  bolt(x, y, a, sp) { this.bolts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 11, life: 3 }); }
  updateBolts(dt) {
    const B = this.bolts, t = this.tank; let j = 0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || this.map.solidAt(b.x, b.y) || this.over) continue;
      if (U.dist2(b.x, b.y, t.x, t.y) < (t.r + b.r) ** 2) { this.hurtTank(14, true); continue; }
      B[j++] = b;
    }
    B.length = j;
  }
  updateMines(dt) {
    let j = 0;
    for (const m of this.mines) {
      m.arm -= dt; let hit = false;
      if (m.arm <= 0) this.world.near(m.x, m.y, 60, 'enemy', () => { hit = true; });
      if (hit) this.boom(m.x, m.y, m.big ? 200 : 160, m.big ? 120 : 90, true); else this.mines[j++] = m;
    }
    this.mines.length = j;
  }
  contacts() {
    const t = this.tank, st = this.st, fast = t.boosting && Math.abs(t.v) > 280;
    this.world.near(t.x, t.y, t.r, 'enemy', e => {
      if (!e.alive) return;
      const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy) || 1, min = t.r + e.r;
      if (d < min) { e.x = t.x + dx / d * min; e.y = t.y + dy / d * min; }
      if (e.type === 'crawler') {
        if (!(st.plough && fast)) this.hurtTank(e.dmg, true);
        this.fx.burst(e.x, e.y, 10, { color: FOES.crawler.col, speed: [100, 360], life: 0.3 });
        if (fast) this.stats.rams++;
        this.kill(e); return;
      }
      if (fast && e.ramT <= this.time) {
        e.ramT = this.time + 0.5; this.stats.rams++;
        e.kx += dx / d * 700; e.ky += dy / d * 700;
        this.hurt(e, 35 * (st.plough ? 3 : 1), 'ram', t.x, t.y);
        this.k.shake(0.2); this.driver.rumble(0.6, 120);
        if (st.plough) return;
      }
      this.hurtTank(e.dmg);
    });
  }
  hurtTank(dmg, force) {
    const t = this.tank, k = this.k;
    if (this.over || (t.iframe > 0 && !force)) return;
    t.hp -= dmg * this.dmgMul(); t.iframe = 0.3; t.hurtT = 0.15;
    k.shake(0.2); this.driver.rumble(0.5, 120); this.gunner.rumble(0.5, 120);
    if (this.sndT <= 0) { k.sfxAt('hit', t.x, this.cam, { vol: 0.2 }); this.sndT = 0.05; }
    if (t.hp <= 0) this.lose();
  }
  pickups(dt) {
    const t = this.tank;
    if ((this.crateT -= dt) <= 0 && !this.over) {
      this.crateT = 13;
      if (this.world.count('pickup') < 3) for (let tries = 0; tries < 20; tries++) {
        const x = U.range(this.k.rng, TILE * 2, this.map.w - TILE * 2), y = U.range(this.k.rng, TILE * 2, this.map.h - TILE * 2);
        if (this.map.solidAt(x, y) || U.dist2(x, y, t.x, t.y) < 320 * 320 || this.gates.some(gt => U.dist2(x, y, gt.x, gt.y) < 240 * 240)) continue;
        if (this.map.isSolid(Math.floor(x / TILE) + 1, Math.floor(y / TILE)) && this.map.isSolid(Math.floor(x / TILE) - 1, Math.floor(y / TILE))) continue;
        this.drop(x, y, this.k.rng() < 0.7 ? 'ammo' : 'repair'); break;
      }
    }
    this.world.near(t.x, t.y, this.st.magnet, 'pickup', p => {
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < t.r + 24) { this.collect(p); return; }
      p.x += dx / d * 600 * dt; p.y += dy / d * 600 * dt;
    });
  }
  drop(x, y, kind) { this.world.add({ tag: 'pickup', kind, g: this, x, y, r: 24, draw: PICKUP_DRAW }); }
  collect(p) {
    const t = this.tank; this.world.remove(p); this.stats.crates++;
    if (p.kind === 'ammo') {
      const he = Math.min(6, t.cap.he - t.res.he), fl = Math.min(10, t.cap.flak - t.res.flak); t.res.he += he; t.res.flak += fl;
      this.floats.add('+' + he + ' HE  +' + fl + ' flak', t.x, t.y - 90, { color: PEACH }); Sfx.play('reload');
    } else { const h = Math.min(60, t.maxHp - t.hp); t.hp += h; this.floats.add('+' + Math.round(h) + ' hull', t.x, t.y - 90, { color: T.good }); Sfx.play('revive'); }
    this.driver.rumble(0.25, 80);
  }

  // ---- Between waves: swap seats -----------------------------------------------------------------------
  swapStep(dt) {
    this.swapT -= dt; const ps = this.k.players;
    for (const s of ps) if (!s.bot && s.pressed('y')) { this.swapWant[s.index] = !this.swapWant[s.index]; Sfx.play('tick'); }
    if (ps.every(s => s.bot || this.swapWant[s.index])) {     // a practice bot always agrees
      [this.driver, this.gunner] = [this.gunner, this.driver]; this.fitHull(); this.swapWant = {}; this.swapT = Math.min(this.swapT, 1.6);
      Sfx.play('ready'); this.k.toast('Player ' + (this.driver.index + 1) + ' drives. Player ' + (this.gunner.index + 1) + ' fires.', { color: T.good });
    }
  }
  cards() {
    const icon = id => (c, x, y, s, sel) => drawIcon(c, id, x, y, s * 1.5, sel ? T.text : T.muted), cand = [];
    for (const id in UPGRADES) {
      const u = UPGRADES[id], l = this.taken[id] || 0; if (l >= u.max || (u.needs && !u.needs(this))) continue;
      cand.push({ w: u.prio, prio: u.prio + (id === 'plate' && this.tank.hp < this.tank.maxHp * 0.5 ? 6 : 0), tag: u.role + (l ? ' · level ' + (l + 1) : ''), title: u.name, text: u.text, icon: icon(id), apply: () => { this.taken[id] = l + 1; u.apply(this); } });
    }
    const out = [];
    while (out.length < 3 && cand.length) { const p = U.weighted(this.k.rng, cand, o => o.w); out.push(p); cand.splice(cand.indexOf(p), 1); }
    while (out.length < 3) out.push({ prio: 1, tag: 'Both of you', title: 'Full repair', text: 'The hull is repaired completely.', icon: icon('heal'), apply: () => { this.tank.hp = this.tank.maxHp; } });
    return out;
  }

  // ---- Endings ------------------------------------------------------------------------------------------
  statRows(won) {
    const s = this.stats;
    return (won ? [] : [['Time', clock(this.time)]]).concat([['Waves cleared', (won ? WAVES : this.wave - 1) + ' of ' + WAVES], ['Bugs destroyed', s.kills], ['Shots fired', s.shots], ['Perfect reloads', s.perfect], ['Rams', s.rams], ['Crates picked up', s.crates]]);
  }
  win() {
    const k = this.k; this.over = true; k.slowmo(0.4, 1); Sfx.music.stop();
    k.toast('All ten waves cleared', { color: T.good, time: 3 });
    for (const s of k.players) s.rumble(0.8, 400);
    k.after(2.4, () => k.finish({ won: true, score: this.time, title: 'Arena held', note: 'Ten waves, one tank, two of you.', stats: this.statRows(true) }));
  }
  lose() {
    const k = this.k, t = this.tank; if (this.over) return; this.over = true; t.hp = 0;
    k.slowmo(0.35, 1); k.shake(1); Sfx.music.stop(); Sfx.play('boom', { vol: 0.5 });
    this.fx.burst(t.x, t.y, 90, { color: PEACH, speed: [150, 700], life: 0.9, size: 10 }); this.rings.push({ x: t.x, y: t.y, rad: 300, t: 0, life: 0.7, col: PEACH });
    for (const s of k.players) s.rumble(1, 600);
    k.after(1.8, () => k.finish({ won: false, title: 'Tank destroyed', note: 'Lost on wave ' + this.wave + ' of ' + WAVES + '.', stats: this.statRows(false) }));
  }

  // ---- Practice bot: drives or guns, whichever seat it has. Also drives Couch.simulate. ------------------
  bot(seat, ctl) {
    if (this.over) return;
    if (seat === this.driver) this.botDrive(ctl);
    if (seat === this.gunner) this.botGun(ctl);
  }
  botDrive(ctl) {
    const t = this.tank, map = this.map, foes = []; this.world.near(t.x, t.y, 650, 'enemy', e => foes.push(e));
    let gx = map.w / 2 - t.x, gy = map.h / 2 - t.y, gw = 0.25;
    const need = t.hp < t.maxHp * 0.6 || t.res.he + t.res.flak < 14;
    let pd = Infinity; this.world.each('pickup', p => { const d = U.dist2(t.x, t.y, p.x, p.y); if (d < pd && (need || d < 500 * 500)) { pd = d; gx = p.x - t.x; gy = p.y - t.y; gw = need ? 2 : 1; } });
    const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
    let best = -Infinity, bx = 0, by = 0, danger = 0;
    for (let i = 0; i < 16; i++) {
      const dx = Math.cos((i / 16) * TAU), dy = Math.sin((i / 16) * TAU); let score = (dx * gx + dy * gy) * gw;
      for (const [step, wall] of [[90, 40], [200, 8]]) {
        const x = t.x + dx * step, y = t.y + dy * step;
        if (map.solidAt(x, y) || map.solidAt(x + dy * 44, y - dx * 44) || map.solidAt(x - dy * 44, y + dx * 44)) score -= wall;
        for (const e of foes) {
          const d = Math.hypot(e.x - x, e.y - y) - e.r - t.r, w = e.type === 'crawler' ? (this.st.plough ? 0.3 : 2.5) : e.type === 'hornet' ? (e.st ? 3 : 0.5) : e.type === 'siege' ? 3 : 1;
          score -= w * 50 / Math.max(10, d + 60);
        }
        for (const b of this.bolts) { const d = Math.hypot(b.x + b.vx * 0.3 - x, b.y + b.vy * 0.3 - y); if (d < 140) score -= 40 / Math.max(10, d); }
      }
      if (score > best) { best = score; bx = dx; by = dy; }
    }
    for (const e of foes) { const d = U.dist(e.x, e.y, t.x, t.y); if ((e.type === 'crawler' && d < 260) || (e.type === 'hornet' && e.st && d < 400)) danger++; }
    ctl.x = bx; ctl.y = by; if (danger || (this.st.plough && foes.some(e => e.type === 'crawler' && U.dist(e.x, e.y, t.x, t.y) < 300))) ctl.set('rt', 1);
    if (this.st.mines && foes.some(e => e.type !== 'hornet' && U.dist(e.x, e.y, t.x, t.y) < 260) && Math.floor(this.time * 10) % 2) ctl.set('a');
  }
  botGun(ctl) {
    const t = this.tank, k = this.k; let best = null, bs = -Infinity;
    this.world.near(t.x, t.y, 1100, 'enemy', e => {
      const d = U.dist(e.x, e.y, t.x, t.y); let s = -d / 120;
      if (e.type === 'hornet' && e.st) s += 6; if (e.type === 'crawler' && d < 380) s += 5; if (e.type === 'spitter') s += 2;
      if (!this.map.los(t.x, t.y, e.x, e.y)) s -= 4;
      if (s > bs) { bs = s; best = e; }
    });
    const r = t.rel;
    if (r && !r.tried && r.p0 != null) {                     // a human-ish press: aims for the green, sometimes early or late
      if (r.aimAt == null) r.aimAt = (r.p0 + r.p1) / 2 + U.gauss(k.rng) * 0.07;
      if (r.t / r.dur >= r.aimAt) ctl.set('x');
    }
    if (!best) { if (!r && t.mag < t.magMax && Math.floor(this.time * 10) % 2) ctl.set('x'); return; }
    let want = 'ap';
    const front = FOES[best.type].armour && Math.abs(U.angleDiff(best.a, Math.atan2(t.y - best.y, t.x - best.x))) < FOES[best.type].armour;
    let crowd = 0; this.world.near(best.x, best.y, 160, 'enemy', () => crowd++);
    if ((best.type === 'hornet' || crowd >= 3) && t.res.flak > 0 && U.dist(best.x, best.y, t.x, t.y) < 440) want = 'flak';
    else if ((front || crowd >= 3 || best.type === 'siege') && t.res.he > 0) want = 'he';
    const sh = SHELLS.findIndex(q => q.id === want);
    if (sh !== t.shell && Math.floor(this.time * 10) % 2) ctl.set('rb');
    const sp = SHELLS[t.shell].speed, d = U.dist(best.x, best.y, t.x, t.y), lead = d / sp * 0.5;   // people lead about half as much as they should
    if (best !== this._bt) { this._bt = best; this._bj = U.gauss(k.rng) * 0.05; }
    const px = best.x + best.vx * lead - t.vx * lead, py = best.y + best.vy * lead - t.vy * lead, aim = Math.atan2(py - t.y, px - t.x) + this._bj;
    ctl.x = Math.cos(aim); ctl.y = Math.sin(aim);
    const off = Math.abs(U.angleDiff(t.ta, aim));
    if (off < (t.shell === 2 ? 0.2 : 0.07) && this.map.los(t.x, t.y, best.x, best.y)) ctl.set('rt', 1);
    if (off < 0.25 && d < 500 && (best.type === 'hornet' || best.type === 'crawler') && t.heat < 0.85 && !t.over) ctl.set('lt', 1);
  }
  dev(code) {
    if (code === 'F7' && this.fighting) { this.skip = true; this.world.each('enemy', e => this.kill(e)); this.left = 0; }
    if (code === 'F8') this.tank.hp = this.tank.maxHp;
  }

  // ---- Drawing -------------------------------------------------------------------------------------------
  draw() {
    const k = this.k, c = k.c, cam = this.cam, v = cam.view(), t = this.tank;
    cam.begin(c);
    this.map.draw(c, v);
    for (const gt of this.gates) {                           // where bugs come in; they glow just before
      const pulse = gt.warn > 0 ? 0.5 + 0.5 * Math.sin(this.time * 18) : 0;
      G.circle(gt.x, gt.y, 46, gt.warn > 0 ? `rgba(240,97,109,${0.15 + pulse * 0.25})` : 'rgba(255,255,255,0.03)', gt.warn > 0 ? T.bad : T.line2, 3);
    }
    for (const m of this.mines) { G.circle(m.x, m.y, m.big ? 18 : 14, T.s3, T.p[this.driver.index], 3); if (m.arm <= 0 && Math.floor(this.time * 3) % 2) G.circle(m.x, m.y, 5, T.bad); }
    this.world.draw(c, v);
    for (const s of this.shells) {
      if (s.kind === 'he') G.circle(s.x, s.y, 10, PEACH, T.bg, 3);
      else { const col = s.kind === 'flak' ? ICE : s.kind === 'mg' ? T.p[this.gunner.index] : T.text, f = s.kind === 'mg' ? 0.012 : 0.02; G.line(s.x - s.vx * f, s.y - s.vy * f, s.x, s.y, col, s.kind === 'ap' ? 7 : 4); }
    }
    this.drawTank(c, t);
    for (const b of this.bolts) { G.circle(b.x, b.y, b.r, 'rgba(240,97,109,0.35)', T.bad, 3); G.circle(b.x, b.y, 4, '#FFFFFF'); }
    for (const r of this.rings) { const f = r.t / r.life; c.globalAlpha = (1 - f) * 0.3; G.circle(r.x, r.y, r.rad * (0.5 + 0.5 * f), r.col); c.globalAlpha = 1 - f; G.circle(r.x, r.y, r.rad * (0.5 + 0.5 * f), null, r.col, 4); c.globalAlpha = 1; }
    this.fx.draw(c); this.floats.draw();
    cam.end(c);
    this.world.each('enemy', e => { if (e.type === 'siege') cam.indicator(e.x, e.y, T.bad); });
    this.world.each('pickup', p => cam.indicator(p.x, p.y, 'rgba(46,189,133,0.8)'));
    this.hud();
  }
  drawTank(c, t) {
    const dc = T.p[this.driver.index], gc = T.p[this.gunner.index], flash = t.hurtT > 0;
    if (!this.over) { c.globalAlpha = 0.18; G.line(t.x + Math.cos(t.ta) * 80, t.y + Math.sin(t.ta) * 80, t.x + Math.cos(t.ta) * 1000, t.y + Math.sin(t.ta) * 1000, gc, 2); c.globalAlpha = 1; }   // aiming line
    c.save(); c.translate(t.x, t.y); c.rotate(t.a);
    G.rrect(-52, -48, 104, 20, 8, T.s3, T.line2, 2); G.rrect(-52, 28, 104, 20, 8, T.s3, T.line2, 2);   // tracks
    const tr = (this.time * t.v * 0.15) % 16; c.strokeStyle = T.line2; c.lineWidth = 2;
    for (let x = -48 + ((tr + 16) % 16); x < 50; x += 16) { c.beginPath(); c.moveTo(x, -46); c.lineTo(x, -30); c.moveTo(x, 30); c.lineTo(x, 46); c.stroke(); }
    G.rrect(-44, -32, 88, 64, 12, flash ? '#FFFFFF' : 'rgba(17,21,28,0.9)', dc, 5);
    G.marker(this.driver.index, -22, 0, 9, { color: dc });
    c.restore();
    c.save(); c.translate(t.x, t.y); c.rotate(t.ta);
    const rc = -t.recoil * 12;
    if (this.st.twin) { G.rrect(rc + 10, -18, 66, 12, 5, gc); G.rrect(rc + 10, 6, 66, 12, 5, gc); } else G.rrect(rc + 10, -8, 70, 16, 6, gc);
    G.rrect(18, 12, 30, 7, 3, t.over ? T.bad : T.muted);   // machine gun
    G.circle(0, 0, 27, T.s2, gc, 5); G.marker(this.gunner.index, 0, 0, 8, { color: gc });
    c.restore();
    const r = t.rel;
    if (r && r.g0 != null) {                                  // the reload bar: press X in the green
      const w = 240, x = t.x - w / 2, y = t.y - 108;
      G.rrect(x - 6, y - 6, w + 12, 30, 10, 'rgba(7,9,13,0.88)');
      G.rrect(x, y, w, 18, 6, T.s3);
      G.rrect(x + w * r.g0, y, w * (r.g1 - r.g0), 18, 4, 'rgba(46,189,133,0.45)'); G.rrect(x + w * r.p0, y, w * (r.p1 - r.p0), 18, 4, T.good);
      const p = Math.min(1, r.t / r.dur); G.rrect(x + w * p - 4, y - 8, 8, 34, 4, r.jam ? T.bad : T.text);
    }
  }
  hud() {
    const t = this.tank, k = this.k, c = k.c;
    // hull, top left
    G.panel(40, 40, 520, 76); G.eyebrow('Hull', 64, 85);
    G.bar(150, 72, 260, 14, t.hp / t.maxHp, t.hp < t.maxHp * 0.3 ? T.bad : T.text);
    G.text(Math.ceil(t.hp) + ' / ' + t.maxHp, 536, 86, { size: FS.xs, mono: true, color: T.muted, align: 'right' });
    // wave, top centre
    const alive = this.world.count('enemy'), left = alive + Math.max(0, this.left), ww = 420, wx = (W - ww) / 2;
    G.panel(wx, 40, ww, 76); G.eyebrow(this.wave ? (this.wave === WAVES ? 'Final wave' : 'Wave ' + this.wave + ' of ' + WAVES) : 'Get ready', wx + 24, 85);
    G.text(left + ' left', wx + ww - 24, 90, { size: FS.sm, mono: true, align: 'right' });
    // time, top right
    G.panel(W - 240, 40, 200, 76); G.eyebrow('Time', W - 216, 85); G.text(clock(this.time), W - 64, 90, { size: FS.sm, mono: true, align: 'right' });
    // driver panel, bottom left
    const ph = 120, py = H - 40 - ph, d = this.driver, gn = this.gunner;
    G.panel(40, py, 560, ph);
    G.marker(d.index, 70, py + 36, 12); G.eyebrow('Player ' + (d.index + 1) + ' · Driver', 94, py + 43, { color: T.p[d.index] });
    G.text('Boost', 64, py + 86, { size: FS.xs, color: T.muted, base: 'middle' });
    G.bar(150, py + 80, 220, 12, t.boost, t.boosting ? T.p[d.index] : T.text);
    if (this.st.mines) {
      const ready = t.mineCd <= 0; G.glyph(d.type, 'a', 400, py + 86, 34, { names: d.device && d.device.names, lit: ready, color: T.p[d.index] });
      G.text(ready ? 'Mine ready' : 'Mine ' + Math.max(0, t.mineCd).toFixed(1) + 's', 444, py + 87, { size: FS.xs, color: ready ? T.text : T.faint, base: 'middle' });
    }
    // gunner panel, bottom right
    const gx = W - 40 - 640; G.panel(gx, py, 640, ph);
    G.marker(gn.index, gx + 30, py + 36, 12); G.eyebrow('Player ' + (gn.index + 1) + ' · Gunner', gx + 54, py + 43, { color: T.p[gn.index] });
    for (let i = 0; i < t.magMax; i++) G.rrect(gx + 330 + i * 18, py + 26, 10, 22, 3, i < t.mag && !t.rel ? T.text : T.s3);
    G.text(t.rel ? (t.rel.jam ? 'Jammed' : 'Reloading') : t.buff > 0 ? 'Perfect · +25%' : '', gx + 616, py + 43, { size: FS.xs, weight: 500, color: t.rel && t.rel.jam ? T.bad : t.buff > 0 && !t.rel ? T.good : T.muted, align: 'right' });
    SHELLS.forEach((sh, i) => {
      const x = gx + 24 + i * 140, y = py + 64, on = i === t.shell, n = i ? t.res[sh.id] : null;
      G.rrect(x, y, 128, 40, 20, on ? T.s3 : null, on ? sh.col : T.line, on ? 3 : 2);
      G.circle(x + 22, y + 20, 7, sh.col);
      G.text(sh.name, x + 38, y + 21, { size: FS.xs, weight: on ? 700 : 400, color: on ? T.text : T.muted, base: 'middle' });
      G.text(n == null ? '∞' : String(n), x + 112, y + 21, { size: FS.xs, mono: true, color: n === 0 ? T.bad : T.muted, align: 'right', base: 'middle' });
    });
    G.text('MG', gx + 452, py + 85, { size: FS.xs, color: T.muted, base: 'middle' });
    G.bar(gx + 500, py + 79, 116, 12, t.heat, t.over ? T.bad : t.heat > 0.7 ? T.p[gn.index] : T.muted);
    // wave banner
    const b = this.banner;
    if (b) {
      const a = Math.min(1, b.t / 0.4, (3 - b.t) / 0.25); c.globalAlpha = U.clamp(a, 0, 1);
      G.text(b.title, W / 2, 420, { size: FS.xl, weight: 700, align: 'center' });
      if (b.sub) G.text(b.sub, W / 2, 480, { size: FS.sm, color: T.muted, align: 'center' });
      c.globalAlpha = 1;
    }
    // seat swap window
    if (this.swapT > 0) {
      const ps = k.players, w = 760, x = (W - w) / 2, y = H - 260;
      G.panel(x, y, w, 96);
      G.eyebrow('Next wave in ' + Math.ceil(this.swapT), x + 28, y + 38);
      const solo = ps.some(s => s.bot);
      G.inline(x + 28, y + 70, [solo ? 'Press ' : 'Both press ', { btn: 'y' }, ' to swap seats'], Couch.Input.lastType, { size: FS.xs, color: T.muted });
      ps.forEach((s, i) => { if (s.bot) return; const on = this.swapWant[s.index]; G.marker(s.index, x + w - 80 + i * 40, y + 48, 12, { hollow: !on }); });
    }
  }
}

Couch.register({
  id: 'tank-for-two', players: 2, bots: true, best: 'low', scoreLabel: 'All ten waves in', formatScore: clock,
  line: 'One drives, one guns, same tank.',
  how: ['Player 1 drives. Player 2 aims and fires. You can swap seats between waves.',
    'Drive over crates for ammo and repairs. Hit armoured bugs from the side, or with HE.',
    'Clear ten waves. After each one, one of you picks an upgrade. You take turns.'],
  controls: [
    [['move', 'Drive'], ['rt', 'Boost'], ['a', 'Drop a mine (with the upgrade)'], ['y', 'Swap seats between waves'], ['start', 'Pause']],
    [['move', 'Aim the turret'], ['rt', 'Fire the main gun'], ['lt', 'Machine gun'], ['x', 'Reload, then again in the green'], ['rb', 'Change shell (LB back)']],
  ],
  assistText: ['', 'Driver: more hull. Gunner: aim help, wider green.', 'Driver: much more hull. Gunner: strong aim help.'],
  create: k => new TankForTwo(k),
});
})();
