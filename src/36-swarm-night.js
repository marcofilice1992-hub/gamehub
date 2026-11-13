/* ==========================================================================
   SWARM NIGHT · slot 11 · Run-based action
   Survive until the Mother arrives at 10:00, then kill her. You only move;
   weapons fire by themselves. Gems are shared and you take turns choosing
   upgrades. Pair upgrades work across the two of you. Stand by a downed
   partner to revive them.

   Developer keys while playing: F7 skips a minute, F8 levels up now.
   Balance runs from the console: Couch.simulate('swarm-night', { seed: 1, step: 1 / 30 })
   ========================================================================== */
(() => {
const { T, FS, G, U, Sfx, W, H } = Couch;
const BOSS_AT = 600, LEASH = 1250, TILE = 80, TAU = Math.PI * 2, ICE = '#BDEBFF';
const clock = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---- Bugs ---------------------------------------------------------------------------------------
// at: seconds before it starts turning up;  w: how often it turns up after that
const FOES = {
  mite:     { name: 'Mite',     r: 15, hp: 9,   sp: 155, dmg: 5,  xp: 1,  col: '#F0616D', at: 0,   w: 10 },
  grub:     { name: 'Grub',     r: 24, hp: 38,  sp: 90,  dmg: 7,  xp: 3,  col: '#D9507E', at: 40,  w: 5 },
  dart:     { name: 'Dart',     r: 15, hp: 12,  sp: 120, dmg: 6,  xp: 2,  col: '#F07FA8', at: 90,  w: 4 },
  spitter:  { name: 'Spitter',  r: 20, hp: 26,  sp: 105, dmg: 6,  xp: 3,  col: '#B48CF2', at: 200, w: 2, cap: 12 },
  splitter: { name: 'Splitter', r: 22, hp: 30,  sp: 110, dmg: 8,  xp: 2,  col: '#E0607E', at: 210, w: 3 },
  brute:    { name: 'Brute',    r: 38, hp: 140, sp: 78,  dmg: 13, xp: 10, col: '#C04A6A', at: 270, w: 1.6, heavy: 0.75 },
  bomber:   { name: 'Bomber',   r: 20, hp: 22,  sp: 135, dmg: 8,  xp: 3,  col: '#FF8A8A', at: 330, w: 2.2, cap: 16 },
  wisp:     { name: 'Wisp',     r: 22, hp: 48,  sp: 78,  dmg: 10, xp: 5,  col: '#C9A8FF', at: 390, w: 2, ghost: true },
};
const ORDER = Object.keys(FOES);

// ---- Weapons: stat(level) gives the numbers for that level -------------------------------------
const WEAPONS = {
  bolt: { name: 'Bolt', blurb: 'Fires at the nearest bug.',
    up: ['', 'One more bolt.', 'Half as much damage again.', 'One more bolt, and bolts pass through a bug.', 'Fires 30% faster.'],
    stat: L => ({ cd: L >= 5 ? 0.5 : 0.7, n: [1, 2, 2, 3, 3][L - 1], dmg: L >= 3 ? 21 : 14, pierce: L >= 4 ? 1 : 0 }) },
  shards: { name: 'Frost', blurb: 'A fan of ice. Chilled bugs move at half speed.',
    up: ['', 'Two more shards.', 'More damage, and the chill lasts longer.', 'Two more shards, and they pass through a bug.', 'Fires 30% faster.'],
    stat: L => ({ cd: L >= 5 ? 0.8 : 1.1, n: [3, 5, 5, 7, 7][L - 1], dmg: L >= 3 ? 9 : 6, chill: L >= 3 ? 2.6 : 1.8, pierce: L >= 4 ? 1 : 0 }) },
  orbit: { name: 'Blades', blurb: 'Blades circle you and cut what they touch.',
    up: ['', 'One more blade.', 'A wider circle and more damage.', 'One more blade.', 'Faster and sharper.'],
    stat: L => ({ n: [2, 3, 3, 4, 4][L - 1], rad: L >= 3 ? 175 : 135, dmg: [8, 8, 12, 12, 17][L - 1], spin: L >= 5 ? 4.4 : 3.2 }) },
  nova: { name: 'Nova', blurb: 'A ring of force that throws bugs back.',
    up: ['', 'A bigger ring.', 'More damage, and it fires faster.', 'A bigger ring.', 'Much more damage.'],
    stat: L => ({ cd: L >= 3 ? 2.1 : 2.6, rad: [230, 280, 280, 330, 330][L - 1], dmg: [16, 16, 24, 24, 36][L - 1] }) },
  arc: { name: 'Arc', blurb: 'Lightning that jumps from bug to bug.',
    up: ['', 'Jumps to one more bug.', 'More damage, and it fires faster.', 'Jumps to two more bugs.', 'Much more damage.'],
    stat: L => ({ cd: L >= 3 ? 1.25 : 1.55, chain: [3, 4, 4, 6, 6][L - 1], dmg: [13, 13, 19, 19, 28][L - 1] }) },
  mortar: { name: 'Mortar', blurb: 'Lobs a shell into the thick of them.',
    up: ['', 'A bigger blast.', 'Two shells at a time.', 'More damage.', 'Three shells at a time.'],
    stat: L => ({ cd: 2.3, n: [1, 1, 2, 2, 3][L - 1], rad: L >= 2 ? 170 : 140, dmg: L >= 4 ? 46 : 30 }) },
};
const PASSIVES = {
  might: { name: 'Might', max: 5, prio: 5, text: 'Your weapons do 15% more damage.', apply: p => { p.might *= 1.15; } },
  haste: { name: 'Haste', max: 5, prio: 5, text: 'Your weapons fire 8% faster.', apply: p => { p.haste *= 0.92; } },
  tough: { name: 'Tough', max: 5, prio: 3, text: '25 more health, and you heal 25 now.', apply: p => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  swift: { name: 'Swift', max: 4, prio: 3, text: 'You move 10% faster.', apply: p => { p.speed *= 1.1; } },
  reach: { name: 'Reach', max: 3, prio: 2, text: 'You pick up gems from 40% further away.', apply: p => { p.reach *= 1.4; } },
  area:  { name: 'Spread', max: 4, prio: 4, text: 'Your rings and blasts are 15% bigger.', apply: p => { p.area *= 1.15; } },
};
const TEAM = {
  regen: { name: 'Regrowth', max: 3, prio: 3, text: 'Both of you heal faster, all the time.' },
  medic: { name: 'Field medic', max: 1, prio: 2, text: 'Reviving each other takes 40% less time.' },
};
const PAIRS = {
  shatter: { name: 'Shatter', needs: g => g.ps.some(p => has(p, 'shards')), text: 'Bugs chilled by one of you take double damage from the other, and burst when they die.' },
  wire:    { name: 'Live wire', needs: g => g.ps.some(p => has(p, 'arc')), text: 'A live wire joins the two of you. Bugs that cross it burn.' },
  well:    { name: 'Gravity well', needs: g => g.ps.some(p => has(p, 'mortar')), text: 'Mortar shells pull bugs in before they burst.' },
  back:    { name: 'Back to back', needs: () => true, text: 'Stay close together and both your weapons fire 25% faster.' },
};
const has = (p, id) => p.weapons.some(w => w.id === id);
const newWeapon = id => ({ id, lvl: 1, cd: 0.4, a: 0 });

// ---- Music ---------------------------------------------------------------------------------------
const SONG = { bpm: 118, root: 55, tracks: [
  { wave: 'triangle', oct: 1, vol: 0.1, len: 1.8, notes: [0, null, null, 0, null, null, 0, null, -2, null, null, -2, null, null, 3, null] },
  { wave: 'noise', vol: 0.022, len: 0.03, freq: 9000, at: 0.2, notes: [1, null, 1, null, 1, null, 1, 1, 1, null, 1, null, 1, null, 1, 1] },
  { wave: 'square', oct: 3, vol: 0.02, len: 0.7, at: 0.45, notes: [0, null, 3, null, 7, null, 3, null, 0, null, 3, null, 10, null, 7, null] },
  { wave: 'sawtooth', oct: 2, vol: 0.024, len: 3.8, at: 0.75, notes: [0, null, null, null, null, null, null, null, -2, null, null, null, 3, null, null, null] },
] };
const BOSS_SONG = { bpm: 140, root: 49, tracks: [
  { wave: 'sawtooth', oct: 1, vol: 0.07, len: 0.9, notes: [0, 0, null, 0, null, 0, 1, null, 0, 0, null, 0, null, 3, 1, null] },
  { wave: 'noise', vol: 0.03, len: 0.04, freq: 6000, notes: [1, null, 1, 1, 1, null, 1, 1, 1, null, 1, 1, 1, null, 1, 1] },
  { wave: 'square', oct: 3, vol: 0.022, len: 1.4, notes: [12, null, null, 11, null, null, 12, null, 15, null, null, 13, null, null, 12, null] },
] };

// ---- Pictures --------------------------------------------------------------------------------------
function foeShape(c, id, r, stroke, fill) {
  const S = Couch.Shapes; c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = Math.max(2.5, r * 0.16);
  const done = (a = 0.3) => { c.globalAlpha = a; c.fillStyle = fill; c.fill(); c.globalAlpha = 1; c.strokeStyle = stroke; c.stroke(); };
  c.beginPath();
  if (id === 'mite') { S.arrow(c, 0, 0, 0, r * 1.15); done(); }
  else if (id === 'grub') { S.poly(c, 0, 0, r, 6, 0); done(); c.beginPath(); c.arc(r * 0.35, 0, r * 0.22, 0, TAU); c.fillStyle = stroke; c.fill(); }
  else if (id === 'dart') { c.moveTo(r * 1.45, 0); c.lineTo(-r, r * 0.55); c.lineTo(-r * 0.5, 0); c.lineTo(-r, -r * 0.55); c.closePath(); done(0.4); }
  else if (id === 'spitter') { S.poly(c, 0, 0, r * 1.05, 4, 0); done(); c.beginPath(); c.arc(r * 0.15, 0, r * 0.32, 0, TAU); c.fillStyle = stroke; c.fill(); }
  else if (id === 'splitter') { for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; c.beginPath(); c.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5, 0, TAU); done(); } }
  else if (id === 'brute') { if (c.roundRect) c.roundRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.25); else c.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7); done(0.35); c.beginPath(); c.moveTo(r * 0.85, -r * 0.55); c.lineTo(r * 0.85, r * 0.55); c.lineWidth *= 2.2; c.stroke(); }
  else if (id === 'bomber') { c.arc(0, 0, r * 0.82, 0, TAU); done(0.35); c.beginPath(); c.moveTo(-r * 0.82, 0); c.lineTo(-r * 1.3, -r * 0.4); c.moveTo(-r * 0.3, -r * 0.3); c.lineTo(r * 0.3, r * 0.3); c.moveTo(r * 0.3, -r * 0.3); c.lineTo(-r * 0.3, r * 0.3); c.stroke(); }
  else if (id === 'wisp') { c.arc(r * 0.2, 0, r * 0.75, 0, TAU); done(0.2); c.beginPath(); for (const o of [-0.45, 0, 0.45]) { c.moveTo(-r * 0.5, o * r); c.quadraticCurveTo(-r, o * r - r * 0.3, -r * 1.4, o * r); } c.stroke(); }
}
function bakeSprites(k) {
  const out = {};
  for (const id of ORDER) {
    const d = FOES[id], size = d.r * 3.2, make = col => k.Sprite.bake(size, size, c => foeShape(c, id, d.r, col, col)).spin(32);
    out[id] = { base: make(d.col), hit: make('#FFFFFF'), ice: make(ICE) };
  }
  const gem = (s, glow) => k.Sprite.bake(s * 2.6, s * 2.6, c => {
    if (glow) { c.globalAlpha = 0.25; Couch.Shapes.poly(c, 0, 0, s * 1.25, 4, 0); c.fillStyle = T.good; c.fill(); c.globalAlpha = 1; }
    Couch.Shapes.poly(c, 0, 0, s, 4, 0); c.fillStyle = T.good; c.fill(); c.strokeStyle = '#B9F5DC'; c.lineWidth = 2; c.stroke();
  });
  out.gem = [gem(7), gem(10), gem(13, true)];
  out.heart = k.Sprite.bake(56, 56, c => { G.circle(0, 0, 22, 'rgba(46,189,133,0.25)', T.good, 3); G.line(0, -11, 0, 11, T.text, 6); G.line(-11, 0, 11, 0, T.text, 6); });
  out.magnet = k.Sprite.bake(56, 56, c => { G.circle(0, 0, 22, 'rgba(46,189,133,0.25)', T.good, 3); drawIcon(c, 'reach', 0, 0, 26, T.text); });
  return out;
}
// Icons for cards and the HUD. s is the overall size.
function drawIcon(c, id, x, y, s, col) {
  const h = s / 2, S = Couch.Shapes;
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, s * 0.08); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  switch (id) {
    case 'bolt': c.moveTo(x - h * 0.7, y + h * 0.7); c.lineTo(x + h * 0.3, y - h * 0.3); c.stroke(); S.arrow(c, x + h * 0.45, y - h * 0.45, -Math.PI / 4, h * 0.45); c.fill(); break;
    case 'shards': for (const a of [-0.5, 0, 0.5]) { c.moveTo(x - h * 0.75, y); c.lineTo(x - h * 0.75 + Math.cos(a) * h * 1.5, y + Math.sin(a) * h * 1.5); } c.stroke(); break;
    case 'orbit': c.globalAlpha = 0.5; c.arc(x, y, h * 0.7, 0, TAU); c.stroke(); c.globalAlpha = 1; c.beginPath(); c.arc(x + h * 0.7, y, h * 0.2, 0, TAU); c.moveTo(x - h * 0.5, y); c.arc(x - h * 0.7, y, h * 0.2, 0, TAU); c.fill(); break;
    case 'nova': for (const [r, a] of [[0.25, 1], [0.55, 0.7], [0.85, 0.4]]) { c.globalAlpha = a; c.beginPath(); c.arc(x, y, h * r, 0, TAU); c.stroke(); } break;
    case 'arc': c.moveTo(x - h * 0.6, y - h * 0.85); c.lineTo(x + h * 0.15, y - h * 0.1); c.lineTo(x - h * 0.25, y + h * 0.1); c.lineTo(x + h * 0.6, y + h * 0.85); c.stroke(); break;
    case 'mortar': c.moveTo(x - h * 0.8, y + h * 0.6); c.quadraticCurveTo(x - h * 0.1, y - h * 1.2, x + h * 0.5, y + h * 0.15); c.stroke(); c.beginPath(); c.arc(x + h * 0.6, y + h * 0.45, h * 0.22, 0, TAU); c.fill(); break;
    case 'swift': for (const o of [-0.4, 0, 0.4]) { c.moveTo(x + h * o - h * 0.25, y - h * 0.55); c.lineTo(x + h * o + h * 0.2, y); c.lineTo(x + h * o - h * 0.25, y + h * 0.55); } c.stroke(); break;
    case 'tough': c.lineWidth *= 1.6; c.moveTo(x, y - h * 0.7); c.lineTo(x, y + h * 0.7); c.moveTo(x - h * 0.7, y); c.lineTo(x + h * 0.7, y); c.stroke(); break;
    case 'reach': c.lineWidth *= 1.5; c.moveTo(x - h * 0.55, y - h * 0.65); c.lineTo(x - h * 0.55, y); c.arc(x, y, h * 0.55, Math.PI, 0, true); c.lineTo(x + h * 0.55, y - h * 0.65); c.stroke(); break;
    case 'haste': c.arc(x, y, h * 0.72, 0, TAU); c.moveTo(x, y - h * 0.4); c.lineTo(x, y); c.lineTo(x + h * 0.3, y + h * 0.18); c.stroke(); break;
    case 'might': c.moveTo(x, y + h * 0.75); c.lineTo(x, y - h * 0.2); c.stroke(); S.arrow(c, x, y - h * 0.35, -Math.PI / 2, h * 0.5); c.fill(); break;
    case 'area': c.rect(x - h * 0.3, y - h * 0.3, h * 0.6, h * 0.6); for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(x + sx * h * 0.85, y + sy * h * 0.45); c.lineTo(x + sx * h * 0.85, y + sy * h * 0.85); c.lineTo(x + sx * h * 0.45, y + sy * h * 0.85); } c.stroke(); break;
    case 'regen': c.arc(x, y, h * 0.75, 0, TAU); c.moveTo(x, y - h * 0.35); c.lineTo(x, y + h * 0.35); c.moveTo(x - h * 0.35, y); c.lineTo(x + h * 0.35, y); c.stroke(); break;
    case 'medic': c.arc(x, y, h * 0.65, -Math.PI * 0.3, Math.PI * 1.25); c.stroke(); S.arrow(c, x + Math.cos(-Math.PI * 0.3) * h * 0.65, y + Math.sin(-Math.PI * 0.3) * h * 0.65, 0.3, h * 0.35); c.fill(); break;
    case 'heal': c.lineWidth *= 1.6; c.moveTo(x, y - h * 0.55); c.lineTo(x, y + h * 0.55); c.moveTo(x - h * 0.55, y); c.lineTo(x + h * 0.55, y); c.stroke(); break;
    default: {                                                 // pair upgrades: both players' marks, joined
      G.marker(0, x - h * 0.62, y + h * 0.35, h * 0.24); G.marker(1, x + h * 0.62, y + h * 0.35, h * 0.24);
      c.beginPath(); c.globalAlpha = 0.6; c.moveTo(x - h * 0.35, y + h * 0.35); c.lineTo(x + h * 0.35, y + h * 0.35); c.stroke(); c.globalAlpha = 1;
      const emblem = { shatter: 'shards', wire: 'arc', well: 'mortar', back: 'swift' }[id];
      c.restore(); drawIcon(c, emblem, x, y - h * 0.35, s * 0.5, col); return;
    }
  }
  c.restore();
}
function buildMap(k) {
  const C = 56, R = 36, rows = [], seed = k.seed % 9973, cx = C / 2, cy = R / 2;
  for (let y = 0; y < R; y++) {
    let s = '';
    for (let x = 0; x < C; x++) {
      const edge = x === 0 || y === 0 || x === C - 1 || y === R - 1;
      const n = U.noise2(x * 0.17, y * 0.17, seed) * 0.72 + U.noise2(x * 0.5, y * 0.5, seed + 7) * 0.28;
      const clear = Math.hypot((x - cx) / 1.5, y - cy) < 6.5;
      s += edge || (!clear && n > 0.67) ? '#' : '.';
    }
    rows.push(s);
  }
  const map = new k.Tilemap({ size: TILE, rows, solid: '#', cache: false, paint(c, ch, x, y, s, tx, ty, m) {
    if (ch === '#') {
      c.fillStyle = '#141922'; c.fillRect(x, y, s, s); c.fillStyle = T.line2;
      if (!m.isSolid(tx, ty - 1)) c.fillRect(x, y, s, 3); if (!m.isSolid(tx, ty + 1)) c.fillRect(x, y + s - 3, s, 3);
      if (!m.isSolid(tx - 1, ty)) c.fillRect(x, y, 3, s); if (!m.isSolid(tx + 1, ty)) c.fillRect(x + s - 3, y, 3, s);
    } else if (((tx * 7 + ty * 13) % 5) === 0) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + s / 2 - 2, y + s / 2 - 2, 4, 4); }
  } });
  const ff = new k.FlowField(map); ff.compute([{ x: cx * TILE, y: cy * TILE }]);          // seal off pockets nobody can reach
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (!map.isSolid(x, y) && ff.dist[y * C + x] === 65535) map.rows[y][x] = '#';
  return map;
}

// ---- Entity behaviour (called with this = the entity) ------------------------------------------
function FOE_UPDATE(dt) {
  const g = this.g;
  if (this.flash > 0) this.flash -= dt;
  if (this.chill > 0) this.chill -= dt;
  const tp = g.nearestLiving(this.x, this.y);
  let tdx = 0, tdy = 0, td = 1e9;
  if (tp) { tdx = tp.x - this.x; tdy = tp.y - this.y; td = Math.hypot(tdx, tdy) || 1; }
  if (td > 2800 && (this.far += dt) > 1) { this.far = 0; const pos = g.spawnPos(); if (pos) { this.x = pos.x; this.y = pos.y; return; } }
  this.stT -= dt;
  const slow = this.chill > 0 ? 0.5 : 1;
  let sx = 0, sy = 0, mode = 'chase';
  if (this.type === 'dart') {
    if (this.st === 0) { if (tp && td < 380 && this.stT <= 0 && g.map.los(this.x, this.y, tp.x, tp.y)) { this.st = 1; this.stT = 0.65; this.dx = tdx / td; this.dy = tdy / td; this.a = Math.atan2(this.dy, this.dx); } }
    else if (this.st === 1) { mode = 'hold'; if (this.stT <= 0) { this.st = 2; this.stT = 0.42; } }
    else { mode = 'dash'; sx = this.dx * 620 * slow; sy = this.dy * 620 * slow; if (this.stT <= 0) { this.st = 0; this.stT = 2.4; } }
  } else if (this.type === 'spitter') {
    if (tp && td < 470 && g.map.los(this.x, this.y, tp.x, tp.y)) {
      mode = 'hold'; if (td < 300) { sx = -tdx / td * this.sp * 0.6 * slow; sy = -tdy / td * this.sp * 0.6 * slow; }
      if (this.stT <= 0) { g.spit(this, tp); this.stT = 3.2; }
      this.a = Math.atan2(tdy, tdx);
    }
  } else if (this.type === 'bomber') {
    if (this.st === 0 && tp && td < 115) { this.st = 1; this.stT = 0.9; }
    if (this.st === 1 && this.stT <= 0) { g.bomberBlast(this); return; }
  }
  if (mode === 'chase' && tp) {
    const sp = this.sp * slow * (this.st === 1 ? 0.25 : 1);
    if (this.ghost || td < TILE * 1.4) { sx = tdx / td * sp; sy = tdy / td * sp; }
    else { const f = g.flow.dir(this.x, this.y); sx = f.x * sp; sy = f.y * sp; }
  }
  if (sx || sy) this.a = Math.atan2(sy, sx);
  const nx = this.x + (sx + this.kx) * dt, ny = this.y + (sy + this.ky) * dt, kd = Math.max(0, 1 - 6 * dt);
  this.kx *= kd; this.ky *= kd; this.x = nx; this.y = ny;
  if (this.ghost) { this.x = U.clamp(this.x, this.r, g.map.w - this.r); this.y = U.clamp(this.y, this.r, g.map.h - this.r); }
  else if (g.map.collideCircle(this) && mode === 'dash') { this.st = 0; this.stT = 2; }
}
function FOE_DRAW(c, e) {
  const s = e.g.spr[e.type], d = FOES[e.type];
  const blink = e.type === 'dart' && e.st === 1 && Math.floor(e.stT * 14) % 2 === 0;
  (e.flash > 0 || blink ? s.hit : e.chill > 0 ? s.ice : s.base).draw(c, e.x, e.y, e.a, e.r / d.r);
  if (e.elite) G.circle(e.x, e.y, e.r + 12, null, 'rgba(240,97,109,0.7)', 4);
  if (e.type === 'bomber' && e.st === 1) {
    c.globalAlpha = 0.5; G.circle(e.x, e.y, 150, null, T.bad, 2); c.globalAlpha = 0.18; G.circle(e.x, e.y, 150 * (1 - e.stT / 0.9), T.bad); c.globalAlpha = 1;
  }
}
function GEM_UPDATE(dt) {
  const t = this.target; if (!t) return;
  if (t.down) { this.target = null; this.sp = 0; return; }
  const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
  if (d < t.r + 8) { this.g.collect(this, t); return; }
  this.sp = Math.min(1700, (this.sp || 200) + 2800 * dt);
  this.x += (dx / d) * this.sp * dt; this.y += (dy / d) * this.sp * dt;
}
function GEM_DRAW(c, e) {
  const sp = e.g.spr;
  if (e.kind !== 'xp') { sp[e.kind].draw(c, e.x, e.y + Math.sin(e.g.t * 4) * 4); return; }
  (e.v >= 8 ? sp.gem[2] : e.v >= 3 ? sp.gem[1] : sp.gem[0]).draw(c, e.x, e.y);
}
function BOSS_UPDATE(dt) {
  const g = this.g, k = g.k;
  if (this.flash > 0) this.flash -= dt;
  if (this.chill > 0) this.chill -= dt;
  const kd = Math.max(0, 1 - 6 * dt); this.kx *= kd; this.ky *= kd;
  const rage = this.hp < this.max * 0.5;
  if (rage && !this.raged) { this.raged = true; k.toast('The Mother is angry', { color: T.bad }); k.shake(0.5); Sfx.play('open', { pitch: 0.8 }); }
  this.spin += dt * (rage ? 1.6 : 1);
  const tp = g.nearestLiving(this.x, this.y); if (!tp) return;
  const dx = tp.x - this.x, dy = tp.y - this.y, d = Math.hypot(dx, dy) || 1;
  this.burstT -= dt; this.summonT -= dt; this.chargeT -= dt;
  if (this.st === 'walk') {
    const sp = (rage ? 135 : 105) * (this.chill > 0 ? 0.75 : 1);
    this.x += (dx / d * sp + this.kx) * dt; this.y += (dy / d * sp + this.ky) * dt; this.a = Math.atan2(dy, dx);
    if (this.burstT <= 0) {
      g.ring(this.x, this.y, rage ? 20 : 14, 270, this.spin); this.burstT = rage ? 3.4 : 4.4;
      if (rage) k.after(0.45, () => { if (this.alive) g.ring(this.x, this.y, 20, 270, this.spin + 0.16); });
    }
    if (this.summonT <= 0) { for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; g.spawn('mite', this.x + Math.cos(a) * 170, this.y + Math.sin(a) * 170); } this.summonT = 9; }
    if (this.chargeT <= 0 && d < 1100) { this.st = 'aim'; this.stT = 0.9; this.cdx = dx / d; this.cdy = dy / d; k.sfxAt('open', this.x, g.cam, { pitch: 1.4 }); }
  } else if (this.st === 'aim') {
    this.stT -= dt; if (this.stT <= 0) { this.st = 'charge'; this.stT = 0.75; k.shake(0.25); }
  } else {
    this.stT -= dt; this.x += this.cdx * 1250 * dt; this.y += this.cdy * 1250 * dt;
    if (this.stT <= 0) { this.st = 'walk'; this.chargeT = rage ? 5 : 7; }
  }
  this.x = U.clamp(this.x, this.r + TILE, g.map.w - this.r - TILE); this.y = U.clamp(this.y, this.r + TILE, g.map.h - this.r - TILE);
}
function BOSS_DRAW(c, e) {
  const col = e.flash > 0 ? '#FFFFFF' : e.chill > 0 ? ICE : T.bad;
  c.save(); c.translate(e.x, e.y); c.rotate(e.spin * 0.4);
  Couch.Shapes.star(c, 0, 0, e.r * 1.3, 8, 0.62); c.globalAlpha = 0.28; c.fillStyle = col; c.fill(); c.globalAlpha = 1; c.strokeStyle = col; c.lineWidth = 7; c.lineJoin = 'round'; c.stroke();
  c.restore();
  G.circle(e.x, e.y, e.r * 0.45, T.bg, col, 5);
  G.circle(e.x + Math.cos(e.a) * e.r * 0.2, e.y + Math.sin(e.a) * e.r * 0.2, e.r * 0.16, col);
}

// =============================================================================================
class SwarmNight {
  constructor(k) {
    this.k = k;
    const map = this.map = buildMap(k);
    this.world = new k.World({ w: map.w, h: map.h, cell: 96, map });
    this.flow = new k.FlowField(map); this.ft = 0;
    this.cam = new k.Camera({ minZoom: 0.55, maxZoom: 0.95, margin: 320, bounds: { x: -80, y: -200, w: map.w + 160, h: map.h + 400 } });   // room past the edges so the HUD never covers you
    this.fx = new k.Particles(2400); this.dark = new k.Darkness({ ambient: 0.55, rgb: '4,6,10', res: 0.25 }); this.spr = bakeSprites(k);
    this.shots = []; this.ebul = []; this.rings = []; this.zaps = []; this.shells = []; this.wells = []; this.booms = []; this.bursts = []; this._buf = [];
    this.t = 0; this.xp = 0; this.level = 1; this.pending = 0; this.turn = 0; this.leveling = false;
    this.kills = 0; this.revives = 0; this.gems = 0; this.peak = 0; this.hurtLog = {}; this.typeCount = {}; this.pairs = {}; this.team = { regen: 0, medic: 0 };
    this.spawnT = 1; this.eventT = 60; this.eventN = 0; this.boss = null; this.over = false; this.sndT = 0; this.boomT = 0; this.gemT = 0; this.combo = 0; this.comboT = 0;
    const cx = map.w / 2, cy = map.h / 2; this.byIdx = {};
    this.ps = k.players.map((seat, n) => {
      const a = k.assist(seat.index), hp = 120 * [1, 1.4, 1.8][a];
      const p = { seat, i: seat.index, x: cx + (n ? 70 : -70), y: cy, r: 30, vx: 0, vy: 0, fx: n ? -1 : 1, fy: 0, hp, maxHp: hp,
        speed: 360, reach: 115, haste: 1, might: 1, area: 1, weapons: [newWeapon(n ? 'shards' : 'bolt')], passives: {},
        iframe: 0, hurtT: 0, down: false, revive: 0, reviveNeed: [3, 2.2, 1.5][a] };
      this.byIdx[p.i] = p; return p;
    });
    this.alive = this.ps.slice(); this.flow.compute(this.alive); this.cam.follow(this.ps, 0, true);
    if (!k.sim) Sfx.music.play(SONG);
    k.run(function* () { yield 0.6; k.toast('Survive until the Mother comes. Then kill her.'); yield 3.4; k.toast('You only move. Your weapons fire by themselves.'); });
  }

  // ---- The step ----------------------------------------------------------------------------------
  update(dt) {
    const k = this.k;
    if (!this.over) this.t += dt;
    this.alive = this.ps.filter(p => !p.down);
    this.movePlayers(dt);
    if (!this.over) this.director(dt);
    if ((this.ft -= dt) <= 0 && this.alive.length) { this.flow.compute(this.alive); this.ft = 0.25; }
    this.world.separate('enemy', 0.5); this.world.update(dt);
    if (!this.over) this.contacts();
    this.backOn = !!this.pairs.back && this.alive.length === 2 && U.dist(this.alive[0].x, this.alive[0].y, this.alive[1].x, this.alive[1].y) < 320;
    for (const p of this.alive) this.weapons(p, dt);
    this.updateShots(dt); this.updateEnemyShots(dt); this.updateShells(dt); this.updateWire(dt); this.flushBursts();
    for (const p of this.alive) this.world.near(p.x, p.y, p.reach, 'gem', g => { if (!g.target) g.target = p; });
    this.reviveStep(dt);
    for (const list of [this.rings, this.zaps, this.booms]) { let j = 0; for (const o of list) { o.t += dt; if (o.t < o.life) list[j++] = o; } list.length = j; }
    this.fx.update(dt);
    this.cam.follow(this.ps, dt);
    this.sndT -= dt; this.boomT -= dt; this.gemT -= dt; if ((this.comboT -= dt) <= 0) this.combo = 0;
    const n = this.world.count('enemy'); this.peak = Math.max(this.peak, n);
    if (!k.sim) Sfx.music.intensity = this.boss ? 1 : U.clamp(n / 300 + this.t / 900, 0, 1);
    k.watch.bugs = n;
    if (!this.over && !this.alive.length) this.lose();
  }

  movePlayers(dt) {
    for (const p of this.ps) {
      p.iframe -= dt; p.hurtT -= dt;
      if (p.down) { p.vx = p.vy = 0; continue; }
      const s = p.seat, mx = s.move.x, my = s.move.y;
      if (mx || my) { const m = Math.hypot(mx, my); p.fx = mx / m; p.fy = my / m; }
      p.vx = U.damp(p.vx, mx * p.speed, 14, dt); p.vy = U.damp(p.vy, my * p.speed, 14, dt);
      this.world.move(p, p.vx * dt, p.vy * dt);
      if (!this.over) p.hp = Math.min(p.maxHp, p.hp + (0.4 + this.team.regen * 0.8) * dt);   // everyone heals a little
    }
    if (this.ps.length === 2) {                                // you can drift apart, but only so far
      const [a, b] = this.ps, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > LEASH) {
        const ex = d - LEASH, nx = dx / d, ny = dy / d, sa = a.down ? 0 : b.down ? 1 : 0.5, sb = 1 - sa;
        a.x += nx * ex * sa; a.y += ny * ex * sa; b.x -= nx * ex * sb; b.y -= ny * ex * sb; this.world.collide(a); this.world.collide(b);
      }
      this.taut = d > LEASH - 80;
    }
  }

  contacts() {
    for (const p of this.alive) {
      if (p.iframe > 0) continue;
      let dmg = 0, src = null;
      this.world.near(p.x, p.y, p.r, null, e => { if (!e.foe) return; const v = e.tag === 'boss' && e.st === 'charge' ? e.dmg * 1.5 : e.dmg; if (v > dmg) { dmg = v; src = e.type || 'boss'; } });
      if (dmg) this.hurtPlayer(p, dmg, src);
    }
  }
  dmgMul() { return 1 + this.t / 600; }
  hpMul() { return 1 + this.t / 180 + (this.t / 240) ** 2; }
  hurtPlayer(p, dmg, src = 'shot') {
    if (this.over || p.down || p.iframe > 0) return;
    const k = this.k;
    this.hurtLog[src] = (this.hurtLog[src] || 0) + Math.round(dmg * this.dmgMul());   // what is hurting you, for balance runs
    p.hp -= dmg * this.dmgMul(); p.iframe = 0.7; p.hurtT = 0.2;
    k.shake(0.22); p.seat.rumble(0.55, 140);
    k.sfxAt('hit', p.x, this.cam, { vol: 0.2 });
    this.fx.burst(p.x, p.y, 10, { color: T.bad, speed: [100, 380], life: 0.35, size: 7 });
    if (p.hp <= 0) {
      p.hp = 0; p.down = true; p.revive = 0; Sfx.play('down'); p.seat.rumble(1, 400);
      if (this.alive.length > 1) k.toast('Player ' + (p.i + 1) + ' is down. Stand by them to revive.', { seat: p.i });
    }
  }
  reviveStep(dt) {
    for (const p of this.ps) {
      if (!p.down || this.over) continue;
      const mate = this.alive.find(q => q !== p && U.dist2(p.x, p.y, q.x, q.y) < 130 * 130);
      const need = p.reviveNeed * (this.team.medic ? 0.6 : 1);
      if (mate) p.revive += dt / need; else p.revive = Math.max(0, p.revive - dt * 0.4);
      if (p.revive < 1) continue;
      p.down = false; p.revive = 0; p.hp = p.maxHp * 0.5; p.iframe = 2; this.revives++;
      this.world.near(p.x, p.y, 280, null, e => { if (!e.foe || e.tag === 'boss') return; const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; e.kx = dx / d * 900; e.ky = dy / d * 900; });
      this.rings.push({ x: p.x, y: p.y, max: 280, t: 0, life: 0.4, col: T.p[p.i] });
      Sfx.play('revive'); p.seat.rumble(0.5, 160); if (mate) mate.seat.rumble(0.5, 160);
      this.k.toast('Player ' + (p.i + 1) + ' is back up', { seat: p.i });
    }
  }

  // ---- Bugs arrive ---------------------------------------------------------------------------------
  director(dt) {
    if (!this.boss && this.t >= BOSS_AT) this.summonBoss();
    if (!this.boss && this.t >= this.eventT) { this.event(); this.eventT += 60; }
    if ((this.spawnT -= dt) > 0) return;
    this.spawnT = 0.25;
    const target = this.boss ? 110 : Math.min(420, 14 + this.t * 0.42 + (this.t / 100) ** 2 * 5);
    const n = Math.min(14, Math.ceil((target - this.world.count('enemy')) / 4));
    if (n <= 0) return;
    const cnt = this.typeCount = {}; this.world.each('enemy', e => { cnt[e.type] = (cnt[e.type] || 0) + 1; });
    for (let i = 0; i < n; i++) this.spawn(this.boss ? (this.k.rng() < 0.7 ? 'mite' : 'grub') : this.pickType());
  }
  pickType() {
    const ok = id => FOES[id].at <= this.t && !(FOES[id].cap && (this.typeCount[id] || 0) >= FOES[id].cap);   // some bugs are capped, so a screen never fills with them
    let tot = 0; for (const id of ORDER) if (ok(id)) tot += FOES[id].w;
    let r = this.k.rng() * tot;
    for (const id of ORDER) { if (!ok(id)) continue; r -= FOES[id].w; if (r <= 0) return id; }
    return 'mite';
  }
  spawnPos(extra = 0) {
    const v = this.cam.view(), map = this.map, rng = this.k.rng, R = Math.hypot(v.w, v.h) / 2 + 80 + extra, lo = TILE * 1.5;
    for (let i = 0; i < 12; i++) {
      const a = rng() * TAU, d = R + rng() * 260, x = this.cam.x + Math.cos(a) * d, y = this.cam.y + Math.sin(a) * d;
      if (x < lo || y < lo || x > map.w - lo || y > map.h - lo || map.solidAt(x, y) || this.flow.distAt(x, y) === 65535) continue;
      return { x, y };
    }
    for (let i = 0; i < 30; i++) {
      const x = U.range(rng, lo, map.w - lo), y = U.range(rng, lo, map.h - lo);
      if (!map.solidAt(x, y) && this.ps.every(p => U.dist2(p.x, p.y, x, y) > 900 * 900)) return { x, y };
    }
    return null;
  }
  spawn(type, x, y, extra) {
    let pos = x == null ? this.spawnPos() : { x, y };
    if (!pos || (x != null && this.map.solidAt(x, y))) return null;
    const d = FOES[type], hp = d.hp * this.hpMul(), rng = this.k.rng;
    return this.world.add(Object.assign({ tag: 'enemy', foe: true, type, g: this, x: pos.x, y: pos.y, r: d.r, hp, max: hp, sp: d.sp * U.range(rng, 0.9, 1.1),
      dmg: d.dmg, xp: d.xp, heavy: d.heavy || 0, ghost: !!d.ghost, kx: 0, ky: 0, chill: 0, chillBy: -1, flash: 0, a: 0, st: 0, stT: U.range(rng, 0.4, 2), far: 0,
      update: FOE_UPDATE, draw: FOE_DRAW }, extra));
  }
  mid() { const a = this.alive.length ? this.alive : this.ps; let x = 0, y = 0; for (const p of a) { x += p.x; y += p.y; } return { x: x / a.length, y: y / a.length }; }
  event() {
    const k = this.k, kinds = ['ring', 'stampede', 'elite'], kind = kinds[this.eventN++ % 3], m = this.mid(), rng = k.rng;
    if (kind === 'ring') {
      const n = 22 + Math.floor(this.t / 14);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.spawn('mite', m.x + Math.cos(a) * 980, m.y + Math.sin(a) * 680); }
      k.toast('They are closing in');
    } else if (kind === 'stampede') {
      const type = this.t >= FOES.dart.at ? 'dart' : 'mite', side = Math.floor(rng() * 4), n = 14 + Math.floor(this.t / 20), v = this.cam.view();
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, x = side < 2 ? (side ? v.x + v.w + 120 : v.x - 120) : v.x + f * v.w, y = side < 2 ? v.y + f * v.h : (side === 3 ? v.y + v.h + 120 : v.y - 120);
        this.spawn(type, U.clamp(x, TILE * 1.5, this.map.w - TILE * 1.5), U.clamp(y, TILE * 1.5, this.map.h - TILE * 1.5));
      }
      k.toast('Incoming from the ' + ['left', 'right', 'top', 'bottom'][side]);
    } else {
      const e = this.spawn(this.t >= FOES.brute.at ? 'brute' : 'grub');
      if (e) { e.elite = true; e.r *= 1.6; e.hp = e.max = e.max * 9; e.xp = 40; e.heavy = 0.85; e.dmg *= 1.6; e.sp *= 0.9; }
      k.toast('Something big is coming');
    }
  }
  summonBoss() {
    const k = this.k, pos = this.spawnPos(300) || { x: TILE * 3, y: TILE * 3 }, hp = 18000;
    this.boss = this.world.add({ tag: 'boss', foe: true, g: this, x: pos.x, y: pos.y, r: 80, hp, max: hp, dmg: 16, heavy: 0.97, kx: 0, ky: 0, chill: 0, chillBy: -1,
      flash: 0, a: 0, st: 'walk', stT: 0, burstT: 3, summonT: 6, chargeT: 5, spin: 0, update: BOSS_UPDATE, draw: BOSS_DRAW });
    k.toast('The Mother is here', { color: T.bad, time: 3.2 }); Sfx.play('open'); k.shake(0.6);
    for (const p of this.ps) p.seat.rumble(0.8, 500);
    if (!k.sim) Sfx.music.play(BOSS_SONG);
  }
  nearestLiving(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.alive) { const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  spit(e, tp) {
    const dx = tp.x - e.x, dy = tp.y - e.y, d = Math.hypot(dx, dy) || 1;
    this.ebul.push({ x: e.x, y: e.y, vx: dx / d * 280, vy: dy / d * 280, r: 11, dmg: 7, life: 3.5 });
  }
  ring(x, y, n, sp, rot) {
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; this.ebul.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 13, dmg: 9, life: 5, ghost: true }); }
    this.k.sfxAt('dash', x, this.cam, { pitch: 0.6 });
  }
  bomberBlast(e) {
    this.world.remove(e);
    for (const p of this.alive) if (U.dist2(p.x, p.y, e.x, e.y) < (150 + p.r) ** 2) this.hurtPlayer(p, 24, 'blast');
    this.world.near(e.x, e.y, 150, null, q => { if (q.foe && q !== e && q.tag !== 'boss') this.hurt(q, 60, -1, 0, 0); });
    this.booms.push({ x: e.x, y: e.y, rad: 150, t: 0, life: 0.3, col: T.bad });
    this.fx.burst(e.x, e.y, 24, { color: T.bad, speed: [150, 520], life: 0.45 });
    this.k.sfxAt('hit', e.x, this.cam, { vol: 0.25 }); this.k.shake(0.15);
  }

  // ---- Your weapons ---------------------------------------------------------------------------------
  foesNear(x, y, r, n) {                                      // the n nearest bugs within r, nearest first
    const B = this._buf; B.length = 0;
    this.world.near(x, y, r, null, e => { if (e.foe) { e._d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y); B.push(e); } });
    if (B.length > n) B.sort((a, b) => a._d - b._d); else if (B.length > 1) B.sort((a, b) => a._d - b._d);
    return B.length > n ? B.slice(0, n) : B.slice();
  }
  weapons(p, dt) {
    const cdm = p.haste * (this.backOn ? 0.75 : 1);
    for (const w of p.weapons) {
      const st = WEAPONS[w.id].stat(w.lvl);
      if (w.id === 'orbit') { this.orbit(p, w, st, dt); continue; }
      if ((w.cd -= dt) > 0) continue;
      w.cd = this['fire_' + w.id](p, st) ? st.cd * cdm : 0.1;
    }
  }
  shot(p, a, o) { this.shots.push(Object.assign({ x: p.x, y: p.y, vx: Math.cos(a) * o.sp, vy: Math.sin(a) * o.sp, owner: p.i, hits: [] }, o)); }
  fire_bolt(p, st) {
    const ts = this.foesNear(p.x, p.y, 760, st.n); if (!ts.length) return false;
    for (let i = 0; i < st.n; i++) { const t = ts[i % ts.length], a = Math.atan2(t.y - p.y, t.x - p.x) + (i >= ts.length ? (i - ts.length + 1) * 0.15 : 0); this.shot(p, a, { sp: 1150, r: 10, dmg: st.dmg, pierce: st.pierce, life: 0.9, kind: 'bolt' }); }
    this.k.sfxAt('tick', p.x, this.cam, { pitch: 1.6, vol: 0.04 });
    return true;
  }
  fire_shards(p, st) {
    const t = this.foesNear(p.x, p.y, 700, 1)[0]; if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x), spread = Math.min(1.1, 0.16 * (st.n - 1));
    for (let i = 0; i < st.n; i++) this.shot(p, base - spread / 2 + (st.n > 1 ? (i / (st.n - 1)) * spread : 0), { sp: 900, r: 9, dmg: st.dmg, pierce: st.pierce, life: 0.62, kind: 'shard', chill: st.chill });
    this.k.sfxAt('tick', p.x, this.cam, { pitch: 2.2, vol: 0.04 });
    return true;
  }
  orbit(p, w, st, dt) {
    w.a += st.spin * dt; const key = p.i ? 'o1' : 'o0', rad = st.rad * p.area;
    for (let j = 0; j < st.n; j++) {
      const a = w.a + (j / st.n) * TAU, bx = p.x + Math.cos(a) * rad, by = p.y + Math.sin(a) * rad;
      this.world.near(bx, by, 20, null, e => {
        if (!e.foe || (e[key] || 0) > this.t) return;
        e[key] = this.t + 0.45; this.hurt(e, st.dmg, p.i, Math.cos(a) * 160, Math.sin(a) * 160);
      });
    }
  }
  fire_nova(p, st) {
    const rad = st.rad * p.area; if (!this.foesNear(p.x, p.y, rad * 0.85, 1).length) return false;
    this.world.near(p.x, p.y, rad, null, e => { if (!e.foe) return; const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; this.hurt(e, st.dmg, p.i, dx / d * 620, dy / d * 620); });
    this.rings.push({ x: p.x, y: p.y, max: rad, t: 0, life: 0.35, col: T.p[p.i] });
    this.k.sfxAt('dash', p.x, this.cam, { pitch: 0.8, vol: 0.12 });
    return true;
  }
  fire_arc(p, st) {
    let cur = this.foesNear(p.x, p.y, 620, 1)[0]; if (!cur) return false;
    const pts = [p.x, p.y], hit = [];
    for (let i = 0; i <= st.chain && cur; i++) {
      hit.push(cur); pts.push(cur.x, cur.y); this.hurt(cur, st.dmg, p.i, 0, 0);
      let next = null, bd = 240 * 240; const from = cur;
      this.world.near(from.x, from.y, 240, null, e => { if (!e.foe || !e.alive || hit.includes(e)) return; const d = U.dist2(from.x, from.y, e.x, e.y); if (d < bd) { bd = d; next = e; } });
      cur = next;
    }
    this.zaps.push({ pts, t: 0, life: 0.14, col: T.p[p.i] });
    this.k.sfxAt('tick', p.x, this.cam, { pitch: 3, vol: 0.05 });
    return true;
  }
  fire_mortar(p, st) {
    const cands = this.foesNear(p.x, p.y, 820, 60); if (!cands.length) return false;
    const rng = this.k.rng;
    for (let i = 0; i < st.n; i++) {
      let best = cands[Math.floor(rng() * cands.length)], bn = -1;
      for (let s = 0; s < 5; s++) { const c = cands[Math.floor(rng() * cands.length)]; let n = 0; this.world.near(c.x, c.y, 140, 'enemy', () => n++); if (n > bn) { bn = n; best = c; } }
      this.shells.push({ x0: p.x, y0: p.y, tx: best.x, ty: best.y, t: 0, fl: 0.75 + i * 0.12, owner: p.i, dmg: st.dmg, rad: st.rad * p.area, col: T.p[p.i] });
    }
    return true;
  }
  updateShots(dt) {
    const S = this.shots, map = this.map; let j = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) continue;
      if (map.solidAt(s.x, s.y)) { this.fx.burst(s.x, s.y, 3, { color: s.kind === 'shard' ? ICE : T.p[s.owner], speed: [40, 160], life: 0.2, size: 5 }); continue; }
      let dead = false;
      this.world.near(s.x, s.y, s.r, null, e => {
        if (dead || !e.foe || !e.alive || s.hits.includes(e)) return;
        s.hits.push(e);
        if (s.chill) { e.chill = s.chill; e.chillBy = s.owner; }
        this.hurt(e, s.dmg, s.owner, s.vx * 0.12, s.vy * 0.12);
        if (s.pierce-- <= 0) dead = true;
      });
      if (!dead) S[j++] = s;
    }
    S.length = j;
  }
  updateEnemyShots(dt) {
    const B = this.ebul; let j = 0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0 || (!b.ghost && this.map.solidAt(b.x, b.y)) || this.over) continue;
      let hit = false;
      for (const p of this.alive) if (U.dist2(p.x, p.y, b.x, b.y) < (p.r + b.r) ** 2) { if (p.iframe <= 0) this.hurtPlayer(p, b.dmg); hit = true; break; }
      if (!hit) B[j++] = b;
    }
    B.length = j;
  }
  updateShells(dt) {
    let j = 0;
    for (const s of this.shells) { s.t += dt; if (s.t < s.fl) { this.shells[j++] = s; continue; } if (this.pairs.well) this.wells.push({ x: s.tx, y: s.ty, t: 0, dur: 0.45, rad: s.rad * 2.1, s }); else this.boom(s); }
    this.shells.length = j; j = 0;
    for (const w of this.wells) {
      w.t += dt;
      this.world.near(w.x, w.y, w.rad, 'enemy', e => { const dx = w.x - e.x, dy = w.y - e.y, d = Math.hypot(dx, dy) || 1; if (d > 20) { e.kx = dx / d * 520; e.ky = dy / d * 520; } });
      if (w.t >= w.dur) this.boom(w.s); else this.wells[j++] = w;
    }
    this.wells.length = j;
  }
  boom(s) {
    this.world.near(s.tx, s.ty, s.rad, null, e => { if (!e.foe) return; const dx = e.x - s.tx, dy = e.y - s.ty, d = Math.hypot(dx, dy) || 1; this.hurt(e, s.dmg, s.owner, dx / d * 420, dy / d * 420); });
    this.booms.push({ x: s.tx, y: s.ty, rad: s.rad, t: 0, life: 0.3, col: s.col });
    this.fx.burst(s.tx, s.ty, 14, { color: s.col, speed: [100, 420], life: 0.4, size: 7 });
    if (this.boomT <= 0) { this.k.sfxAt('hit', s.tx, this.cam, { vol: 0.12, pitch: 1.3 }); this.boomT = 0.08; }
  }
  updateWire(dt) {
    this.wireOn = false;
    if (!this.pairs.wire || this.alive.length < 2) return;
    const [a, b] = this.alive, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; if (L2 > 1100 * 1100 || L2 < 1) return;
    this.wireOn = true; let flip = 0;
    this.world.near((a.x + b.x) / 2, (a.y + b.y) / 2, Math.sqrt(L2) / 2 + 30, null, e => {
      if (!e.foe) return;
      const t = U.clamp(((e.x - a.x) * dx + (e.y - a.y) * dy) / L2, 0, 1), px = a.x + dx * t, py = a.y + dy * t;
      if (U.dist2(px, py, e.x, e.y) < (e.r + 22) ** 2) this.hurt(e, 55 * dt, (flip++ % 2) ? b.i : a.i, 0, 0, true);
    });
  }
  flushBursts() {
    let guard = 0;
    while (this.bursts.length && guard++ < 80) {
      const b = this.bursts.pop();
      this.world.near(b.x, b.y, 100, 'enemy', e => this.hurt(e, 16, b.owner, 0, 0));
      this.fx.burst(b.x, b.y, 10, { color: ICE, speed: [120, 380], life: 0.3, size: 6 });
    }
    this.bursts.length = 0;
  }
  hurt(e, dmg, owner, kx, ky, quiet) {
    if (!e.alive) return;
    const p = owner >= 0 ? this.byIdx[owner] : null;
    if (p) dmg *= p.might;
    if (this.pairs.shatter && e.chill > 0 && e.chillBy >= 0 && owner >= 0 && e.chillBy !== owner) dmg *= 2;
    e.hp -= dmg; if (!quiet) e.flash = 0.07;
    if (kx || ky) { const f = 1 - (e.heavy || 0); e.kx += kx * f; e.ky += ky * f; }
    if (e.hp <= 0) this.kill(e, owner);
  }
  kill(e, owner) {
    if (!e.alive) return;
    this.world.remove(e);
    if (e.tag === 'boss') { this.bossDown(e); return; }
    this.kills++;
    const d = FOES[e.type];
    this.fx.burst(e.x, e.y, e.elite ? 30 : 4, { color: d.col, speed: [60, 260], life: 0.35, size: 6 });
    this.drop(e.x, e.y, e.xp);
    if (e.elite) this.dropPickup(e.x + 36, e.y, this.k.rng() < 0.5 ? 'heart' : 'magnet');
    if (e.type === 'splitter' && !e.child) for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; this.spawn('mite', e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, { child: true }); }
    if (this.pairs.shatter && e.chill > 0) this.bursts.push({ x: e.x, y: e.y, owner: owner >= 0 ? owner : e.chillBy });
    if (this.sndT <= 0) { this.k.sfxAt('tick', e.x, this.cam, { pitch: 0.55 + this.k.rng() * 0.3, vol: 0.05 }); this.sndT = 0.045; }
  }

  // ---- Gems, levels, upgrades -----------------------------------------------------------------------------
  drop(x, y, v) {
    if (this.gems > 320) { const g = this.world.nearest(x, y, 260, 'gem'); if (g && g.kind === 'xp') { g.v += v; return; } }
    this.gems++;
    this.world.add({ tag: 'gem', kind: 'xp', g: this, x, y, r: 10, v, target: null, sp: 0, update: GEM_UPDATE, draw: GEM_DRAW });
  }
  dropPickup(x, y, kind) { this.gems++; this.world.add({ tag: 'gem', kind, g: this, x, y, r: 18, v: 0, target: null, sp: 0, update: GEM_UPDATE, draw: GEM_DRAW }); }
  collect(g, p) {
    this.world.remove(g); this.gems--;
    const k = this.k;
    if (g.kind === 'xp') {
      this.gainXp(g.v); this.comboT = 0.6;
      if (this.gemT <= 0) { Sfx.play('pickup', { pitch: 1 + Math.min(this.combo, 14) * 0.045, vol: 0.07 }); this.gemT = 0.05; this.combo++; }
    } else if (g.kind === 'heart') {
      for (const q of this.alive) q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.4);
      Sfx.play('revive'); k.toast('Both of you healed', { color: T.good });
    } else {
      this.world.each('gem', q => { if (!q.target) q.target = this.nearestLiving(q.x, q.y); });
      Sfx.play('open', { pitch: 1.6 }); k.toast('Every gem is coming to you', { color: T.good });
    }
  }
  need() { return Math.floor(8 + this.level * 6 + Math.pow(this.level, 1.6)); }
  gainXp(v) {
    this.xp += v;
    while (this.xp >= this.need()) { this.xp -= this.need(); this.level++; this.pending++; }
    if (this.pending && !this.leveling && !this.over) this.levelUp();
  }
  levelUp() {
    this.leveling = true; const self = this, k = this.k;
    k.run(function* () {
      yield 0.12;
      while (self.pending > 0 && !self.over) {
        self.pending--;
        const p = self.ps[self.turn++ % self.ps.length], opts = self.cards(p), lvl = self.level - self.pending;
        Sfx.play('ready', { pitch: 1.2 });
        const i = yield k.choose({ title: 'Level ' + lvl + '. Pick an upgrade.', by: p.i, options: opts, pick: o => o.reduce((b, x, n) => (x.prio > o[b].prio ? n : b), 0) });
        opts[i].apply(); k.toast(opts[i].title, { seat: opts[i].both ? null : p.i, color: opts[i].both ? T.good : null });
      }
      self.leveling = false;
    });
  }
  cards(p) {
    const cand = [], icon = id => (c, x, y, s, sel) => drawIcon(c, id, x, y, s * 1.5, sel ? T.text : T.muted);
    for (const w of p.weapons) if (w.lvl < 5) { const d = WEAPONS[w.id]; cand.push({ w: 4, prio: 6 + w.lvl, tag: 'Weapon · level ' + (w.lvl + 1) + ' of 5', title: d.name + ' ' + (w.lvl + 1), text: d.up[w.lvl], icon: icon(w.id), apply: () => { w.lvl++; } }); }
    if (p.weapons.length < 4) for (const id in WEAPONS) if (!has(p, id)) { const d = WEAPONS[id]; cand.push({ w: p.weapons.length < 2 ? 5 : 2.5, prio: p.weapons.length < 3 ? 8 : 3, tag: 'New weapon', title: d.name, text: d.blurb, icon: icon(id), apply: () => p.weapons.push(newWeapon(id)) }); }
    for (const id in PASSIVES) {
      const d = PASSIVES[id], l = p.passives[id] || 0; if (l >= d.max) continue;
      cand.push({ w: 1.6, prio: id === 'tough' && p.hp < p.maxHp * 0.5 ? 11 : d.prio, tag: 'For you' + (l ? ' · level ' + (l + 1) : ''), title: d.name, text: d.text, icon: icon(id), apply: () => { p.passives[id] = l + 1; d.apply(p); } });
    }
    for (const id in TEAM) {
      const d = TEAM[id]; if (this.team[id] >= d.max) continue;
      cand.push({ w: 1, both: true, prio: d.prio, tag: 'Team · both of you', title: d.name, text: d.text, icon: icon(id), apply: () => { this.team[id]++; } });
    }
    if (this.ps.length > 1 && this.level >= 5) for (const id in PAIRS) {
      const d = PAIRS[id]; if (this.pairs[id] || !d.needs(this)) continue;
      cand.push({ w: 6, both: true, prio: 7, tag: 'Pair upgrade · both of you', title: d.name, text: d.text, icon: icon(id), apply: () => { this.pairs[id] = true; } });
    }
    const out = [], rng = this.k.rng;
    while (out.length < 3 && cand.length) { const pick = U.weighted(rng, cand, o => o.w); out.push(pick); cand.splice(cand.indexOf(pick), 1); }
    while (out.length < 3) out.push({ both: true, prio: 1, tag: 'Team · both of you', title: 'Patch up', text: 'Both of you heal 30% of your health.', icon: icon('heal'), apply: () => { for (const q of this.alive) q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.3); } });
    return out;
  }

  // ---- Endings -----------------------------------------------------------------------------------------------
  stats(won) {
    const pairs = Object.keys(this.pairs).map(id => PAIRS[id].name);
    return (won ? [] : [['Time', clock(this.t)]]).concat([['Level', this.level], ['Bugs cleared', this.kills.toLocaleString('en-AU')], ['Revives', this.revives], ['Most at once', this.peak]])
      .concat(pairs.length ? [['Pair upgrades', pairs.join(', ')]] : []);
  }
  lose() {
    this.over = true; const k = this.k;
    k.after(1.4, () => k.finish({ won: false, title: 'Overrun', stats: this.stats(),
      note: this.boss ? 'You reached the Mother. She had ' + Math.ceil((this.boss.hp / this.boss.max) * 100) + '% left.' : 'Made it to ' + clock(this.t) + '. The Mother comes at ' + clock(BOSS_AT) + '.' }));
  }
  bossDown(e) {
    const k = this.k; this.over = true;
    k.slowmo(0.3, 1.2); k.shake(1); Sfx.music.stop();
    for (const p of this.ps) p.seat.rumble(1, 600);
    this.fx.burst(e.x, e.y, 120, { color: T.bad, speed: [200, 900], life: 1, size: 10 });
    this.rings.push({ x: e.x, y: e.y, max: 900, t: 0, life: 0.8, col: T.text });
    let n = 0; this.world.each('enemy', q => { this.world.remove(q); if (n++ < 160) this.fx.burst(q.x, q.y, 3, { color: FOES[q.type].col, speed: [60, 240], life: 0.4 }); });
    this.ebul.length = 0;
    k.toast('The Mother is dead', { color: T.good, time: 3 });
    k.after(2.2, () => k.finish({ won: true, score: this.t, title: 'Night survived', note: 'The Mother is dead.', stats: this.stats(true) }));
  }

  // ---- Practice bot. Also drives Couch.simulate for balance runs. --------------------------------------------
  bot(seat, ctl) {                                           // scores 16 directions: danger, walls, goal, spacing
    const p = this.byIdx[seat.index]; if (!p || p.down || this.over) return;
    const mate = this.ps.find(q => q !== p), map = this.map, foes = [], B = this.boss;
    this.world.near(p.x, p.y, 460, null, e => { if (e.foe) foes.push(e); });
    let gx = 0, gy = 0, gw = 0;
    if (mate && mate.down) {
      gx = mate.x - p.x; gy = mate.y - p.y; const d = Math.hypot(gx, gy);
      if (d < 95) { ctl.x = ctl.y = 0; return; }             // stand still beside them until they are up
      gw = 7;
    }
    else {
      let gd = 640 * 640; this.world.near(p.x, p.y, 640, 'gem', g => { const d = U.dist2(p.x, p.y, g.x, g.y); if (d < gd) { gd = d; gx = g.x - p.x; gy = g.y - p.y; gw = g.kind === 'xp' ? 1.2 : 3; } });
      if (mate) { const dx = mate.x - p.x, dy = mate.y - p.y, d = Math.hypot(dx, dy); if (d > 520) { gx = dx; gy = dy; gw = Math.min(3, (d - 520) / 200 + 1); } }
      if (!gw) { gx = map.w / 2 - p.x; gy = map.h / 2 - p.y; gw = 0.3; }
    }
    const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
    let best = -Infinity, bx = 0, by = 0;
    for (let i = 0; i < 16; i++) {
      const dx = Math.cos((i / 16) * TAU), dy = Math.sin((i / 16) * TAU); let score = (dx * gx + dy * gy) * gw;
      for (const [step, wall] of [[70, 60], [160, 12]]) {
        const x = p.x + dx * step, y = p.y + dy * step;
        if (map.solidAt(x, y) || map.solidAt(x + dy * 26, y - dx * 26) || map.solidAt(x - dy * 26, y + dx * 26)) score -= wall;
        for (const e of foes) {
          const d = Math.hypot(e.x - x, e.y - y) - e.r - p.r, w = e.tag === 'boss' ? 5 : e.elite ? 3 : e.type === 'bomber' && e.st === 1 ? 6 : 1;
          score -= w * (60 / Math.max(8, d + 40) + (d < 40 ? 4 : 0));
        }
        for (const b of this.ebul) for (const f of [0.15, 0.4]) { const d = Math.hypot(b.x + b.vx * f - x, b.y + b.vy * f - y) - b.r - p.r; if (d < 120) score -= 50 / Math.max(10, d + 20) + (d < 20 ? 6 : 0); }
        if (B && (B.st === 'aim' || B.st === 'charge')) {
          const t = U.clamp((x - B.x) * B.cdx + (y - B.y) * B.cdy, 0, 1400), d = Math.hypot(B.x + B.cdx * t - x, B.y + B.cdy * t - y);
          if (d < B.r + 90) score -= 8;
        }
      }
      if (mate && !mate.down) { const mx = mate.x - p.x, my = mate.y - p.y, md = Math.hypot(mx, my); if (md < 150 && md > 0) score -= ((dx * mx + dy * my) / md) * 0.8; }
      if (score > best) { best = score; bx = dx; by = dy; }
    }
    ctl.x = bx; ctl.y = by;
  }
  dev(code) {
    if (code === 'F7' && !this.boss) { this.t = Math.min(BOSS_AT, this.t + 60); this.eventT = Math.max(this.eventT, Math.ceil(this.t / 60) * 60); this.k.toast('Skipped to ' + clock(this.t)); }
    if (code === 'F8') this.gainXp(this.need() - this.xp);
  }

  // ---- Drawing -------------------------------------------------------------------------------------------------
  draw() {
    const k = this.k, c = k.c, cam = this.cam, v = cam.view();
    cam.begin(c);
    this.map.draw(c, v);
    for (const s of this.shells) {                            // where each shell will land
      const f = s.t / s.fl; c.globalAlpha = 0.25 + f * 0.4; c.setLineDash([10, 10]); G.circle(s.tx, s.ty, s.rad * (0.4 + 0.6 * f), null, s.col, 3); c.setLineDash([]); c.globalAlpha = 1;
    }
    for (const w of this.wells) { c.globalAlpha = 0.35; G.circle(w.x, w.y, w.rad * (1 - w.t / w.dur), null, w.s.col, 4); c.globalAlpha = 1; }
    if (this.wireOn) {
      const [a, b] = this.alive; c.globalAlpha = 0.35; G.line(a.x, a.y, b.x, b.y, ICE, 14); c.globalAlpha = 1;
      c.beginPath(); c.moveTo(a.x, a.y); for (let i = 1; i < 12; i++) { const f = i / 12; c.lineTo(U.lerp(a.x, b.x, f) + (Math.random() - 0.5) * 18, U.lerp(a.y, b.y, f) + (Math.random() - 0.5) * 18); } c.lineTo(b.x, b.y);
      c.strokeStyle = '#FFFFFF'; c.lineWidth = 3; c.stroke();
    } else if (this.backOn) { c.globalAlpha = 0.4; c.setLineDash([6, 12]); G.line(this.alive[0].x, this.alive[0].y, this.alive[1].x, this.alive[1].y, T.text, 3); c.setLineDash([]); c.globalAlpha = 1; }
    else if (this.taut) { c.globalAlpha = 0.3; G.line(this.ps[0].x, this.ps[0].y, this.ps[1].x, this.ps[1].y, T.muted, 2); c.globalAlpha = 1; }
    this.world.draw(c, v);
    for (const s of this.shots) {
      const col = s.kind === 'shard' ? ICE : T.p[s.owner], f = s.kind === 'shard' ? 0.016 : 0.024;
      G.line(s.x - s.vx * f, s.y - s.vy * f, s.x, s.y, col, s.kind === 'shard' ? 5 : 6);
    }
    for (const p of this.ps) {
      if (p.down) {
        G.marker(p.i, p.x, p.y, p.r, { hollow: true, lw: 4 });
        G.ring(p.x, p.y, p.r + 24, 1, T.s3, 9); G.ring(p.x, p.y, p.r + 24, p.revive, T.p[p.i], 9);
        G.text('Down', p.x, p.y - p.r - 52, { size: FS.sm, weight: 700, color: T.bad, align: 'center' });
        continue;
      }
      for (const w of p.weapons) if (w.id === 'orbit') {
        const st = WEAPONS.orbit.stat(w.lvl), rad = st.rad * p.area;
        for (let j = 0; j < st.n; j++) { const a = w.a + (j / st.n) * TAU; c.save(); c.translate(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad); c.rotate(a + Math.PI / 2); G.rrect(-18, -6, 36, 12, 6, T.p[p.i]); c.restore(); }
      }
      if (p.iframe > 0 && Math.floor(p.iframe * 14) % 2) c.globalAlpha = 0.45;
      G.marker(p.i, p.x, p.y, p.r, { color: p.hurtT > 0 ? '#FFFFFF' : T.p[p.i] }); c.globalAlpha = 1;
      G.circle(p.x + p.fx * (p.r - 12), p.y + p.fy * (p.r - 12), 7, T.bg);
      if (p.hp < p.maxHp) G.bar(p.x - 40, p.y + p.r + 18, 80, 8, p.hp / p.maxHp, p.hp < p.maxHp * 0.35 ? T.bad : T.p[p.i]);
    }
    this.fx.draw(c);
    cam.end(c);

    // Night: light around each of you, and around the brightest things
    const d = this.dark, z = cam.zoom; d.begin();
    const m = this.mid(), ms = cam.toScreen(m.x, m.y); d.light(ms.x, ms.y, 1300 * z, 0.35);
    for (const p of this.ps) { const s = cam.toScreen(p.x, p.y); d.light(s.x, s.y, (p.down ? 380 : 640) * z); }
    if (this.boss && this.boss.alive) { const s = cam.toScreen(this.boss.x, this.boss.y); d.light(s.x, s.y, 360 * z, 0.6); }
    for (const b of this.booms) { const s = cam.toScreen(b.x, b.y); d.light(s.x, s.y, b.rad * 2 * z, 1 - b.t / b.life); }
    d.end(c);

    // On top of the dark: things you must always see
    cam.begin(c);
    for (const b of this.ebul) { G.circle(b.x, b.y, b.r, 'rgba(240,97,109,0.35)', T.bad, 3); G.circle(b.x, b.y, b.r * 0.4, '#FFFFFF'); }
    const B = this.boss;
    if (B && B.alive && B.st === 'aim') {
      const L = 1300, a = 0.25 + 0.35 * (Math.floor(B.stT * 12) % 2);
      c.globalAlpha = 0.12; G.line(B.x, B.y, B.x + B.cdx * L, B.y + B.cdy * L, T.bad, B.r * 2); c.globalAlpha = a;
      c.setLineDash([24, 16]); G.line(B.x, B.y, B.x + B.cdx * L, B.y + B.cdy * L, T.bad, 5); c.setLineDash([]); c.globalAlpha = 1;
    }
    for (const s of this.shells) { const f = s.t / s.fl, x = U.lerp(s.x0, s.tx, f), y = U.lerp(s.y0, s.ty, f) - Math.sin(Math.PI * f) * 240; G.circle(x, y, 10, s.col, T.bg, 3); }
    for (const r of this.rings) { const f = r.t / r.life; c.globalAlpha = 1 - f; G.circle(r.x, r.y, r.max * U.easeOut(f), null, r.col, 7); c.globalAlpha = 1; }
    for (const b of this.booms) { const f = b.t / b.life; c.globalAlpha = (1 - f) * 0.35; G.circle(b.x, b.y, b.rad * (0.6 + 0.4 * f), b.col); c.globalAlpha = 1 - f; G.circle(b.x, b.y, b.rad * (0.6 + 0.4 * f), null, b.col, 4); c.globalAlpha = 1; }
    for (const zp of this.zaps) {
      const P = zp.pts; c.globalAlpha = 1 - zp.t / zp.life;
      for (const [col, lw] of [[zp.col, 12], ['#FFFFFF', 3]]) { c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i] + (Math.random() - 0.5) * 10, P[i + 1] + (Math.random() - 0.5) * 10); c.strokeStyle = col; c.lineWidth = lw; c.globalAlpha *= lw > 6 ? 0.45 : 1; c.stroke(); c.globalAlpha = 1 - zp.t / zp.life; }
      c.globalAlpha = 1;
    }
    cam.end(c);
    this.hud();
  }

  hud() {
    const k = this.k, c = k.c;
    // shared gems bar along the top
    G.bar(40, 22, W - 80, 10, this.xp / this.need(), T.good);
    G.panel(40, 48, 220, 72);
    G.eyebrow('Level', 64, 92);
    G.text(String(this.level), 236, 98, { size: FS.md, weight: 500, mono: true, align: 'right' });
    const kills = this.kills.toLocaleString('en-AU'), kw = Math.max(240, G.measure(kills, { size: FS.md, mono: true }) + 150);
    G.panel(W - 40 - kw, 48, kw, 72);
    G.eyebrow('Cleared', W - 40 - kw + 24, 92);
    G.text(kills, W - 64, 98, { size: FS.md, weight: 500, mono: true, align: 'right' });
    const B = this.boss;
    if (B) {
      const w = 900, x = (W - w) / 2, f = Math.max(0, B.hp / B.max);
      G.panel(x, 48, w, 72);
      G.eyebrow('The Mother', x + 24, 92, { color: T.bad });
      G.bar(x + 210, 78, w - 340, 14, f, T.bad);
      G.text(Math.ceil(f * 100) + '%', x + w - 24, 92, { size: FS.sm, mono: true, align: 'right' });
    } else {
      const w = 320, x = (W - w) / 2;
      G.panel(x, 48, w, 72);
      G.eyebrow('Mother in', x + 24, 92);
      G.text(clock(BOSS_AT - this.t), x + w - 24, 98, { size: FS.md, weight: 500, mono: true, align: 'right', color: BOSS_AT - this.t < 30 ? T.bad : T.text });
    }
    // a panel per player, in their corner
    this.ps.forEach((p, n) => {
      const w = 520, h = 112, x = n ? W - 40 - w : 40, y = H - 40 - h, col = T.p[p.i];
      G.panel(x, y, w, h);
      G.marker(p.i, x + 36, y + 34, 12, { hollow: p.down });
      G.eyebrow('Player ' + (p.i + 1), x + 60, y + 41, { color: col });
      if (p.down) {
        G.text('Down', x + 220, y + 41, { size: FS.xs, weight: 700, color: T.bad });
        G.bar(x + 300, y + 30, w - 324, 12, p.revive, col);
      } else {
        G.bar(x + 220, y + 30, w - 390, 12, p.hp / p.maxHp, p.hp < p.maxHp * 0.35 ? T.bad : col);
        G.text(Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp), x + w - 24, y + 42, { size: FS.xs, mono: true, align: 'right', color: T.muted });
      }
      for (let s = 0; s < 4; s++) {
        const wp = p.weapons[s], sx = x + 24 + s * 64, sy = y + 60;
        G.rrect(sx, sy, 52, 40, 8, wp ? T.s2 : null, T.line, 2);
        if (!wp) continue;
        drawIcon(c, wp.id, sx + 26, sy + 17, 22, T.text);
        for (let l = 0; l < 5; l++) G.circle(sx + 12 + l * 7, sy + 33, 2.5, l < wp.lvl ? col : T.s3);
      }
      const bits = [];
      for (const id in p.passives) bits.push(PASSIVES[id].name + ' ' + p.passives[id]);
      if (bits.length) G.wrap(bits.join(' · '), x + 290, y + 78, w - 314, 26, { size: FS.xs, color: T.faint, base: 'middle' }, 2);
    });
    if (this.backOn) G.text('Back to back', W / 2, H - 100, { size: FS.xs, weight: 500, color: T.text, align: 'center', base: 'middle' });
    // arrows at the screen edge for the Mother and big bugs you cannot see yet
    if (B && B.alive) this.cam.indicator(B.x, B.y, T.bad);
    this.world.each('enemy', e => { if (e.elite) this.cam.indicator(e.x, e.y, 'rgba(240,97,109,0.7)'); });
  }
}

Couch.register({
  id: 'swarm-night', players: 2, bots: true, best: 'low', scoreLabel: 'Mother killed at', formatScore: clock,
  line: 'Survive the swarm with shared upgrades.',
  how: ['You only move. Your weapons fire by themselves.', 'Gems are shared. Each level, one of you picks an upgrade. You take turns.',
    'At 10:00 the Mother arrives. Kill her to win. Stand by a downed partner to revive them.'],
  controls: [['move', 'Move'], ['a', 'Pick an upgrade'], ['start', 'Pause']],
  assistText: ['', '40% more health, quicker revives', '80% more health, quickest revives'],
  create: k => new SwarmNight(k),
});
})();
