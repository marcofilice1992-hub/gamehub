/* ==========================================================================
   TENPIN GRUDGE · slot 14 · Cosy and long-form
   Head-to-head ten-pin bowling on one 3D lane. You take turns, one frame
   each: step sideways, turn the aim line, pull the right stick back and push
   it forward to bowl, then steer the hook while the ball rolls. The higher
   score after ten frames wins; a tie goes to a one-ball roll-off.
   Versus by Marco's choice: design rules 3 and 5 are waived for this slot.
   Draws with three.js and simulates with cannon-es, both from Couch.lib.

   Developer keys while playing: F7 leaves a split for the current bowler, F8 strikes the current ball.
   Balance runs from the console: Couch.simulate('tenpin-grudge', { seed: 1, step: 1 / 30 })
   ========================================================================== */
(() => {
const { T, FS, G, U, Sfx, W, H } = Couch, { THREE, CANNON } = Couch.lib;
// Everything is in metres. x runs across the lane (right is +), d runs down it from the foul line. World z is -d.
const LW = 0.527, GW = 0.235, HEAD = 18.29, DECK = HEAD + 0.9, PIT = DECK + 1.2, SP = 0.3048, ROW = SP * Math.sqrt(3) / 2;
const BR = 0.109, BM = 6.35, PM = 1.5, COG = 0.147, START = 0.3, STEP = 1 / 240, HOOK = 1.6, DRIFT = 1.5, AIM = 40;
const NAME = ['Blue', 'Amber'], RAD = Math.PI / 180, ONE = new CANNON.Vec3(1, 1, 1);
const SPOTS = []; for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) SPOTS.push({ x: (i - r / 2) * SP, d: HEAD + r * ROW });
const grip = d => (d < 12 ? 0.15 : d < 13 ? 0.15 + 0.85 * (d - 12) : 1);          // oil for 12 m, dry boards after 13
const speedOf = pw => 6.5 + ((pw - 0.55) / 0.45) * 3;                              // 55% to 100% power is 6.5 to 9.5 m/s

// ---- Sounds this game adds ---------------------------------------------------------------------
Object.assign(Sfx.bank, {
  'tg-release': (S, o) => { S.tone(110, 0.16, { to: 60, type: 'sine', vol: 0.22, ...o }); S.noise(0.1, { freq: 300, vol: 0.12, ...o }); },
  'tg-roll': (S, o) => S.noise(0.16, { freq: 170, q: 1.4, vol: 0.07, ...o }),
  'tg-pin': (S, o) => { S.noise(0.06, { freq: 2300, q: 2.2, vol: 0.2, ...o }); S.tone(900, 0.05, { to: 520, type: 'square', vol: 0.05, ...o }); },
  'tg-gutter': (S, o) => { S.noise(0.3, { freq: 240, q: 0.9, vol: 0.2, ...o }); S.tone(160, 0.3, { to: 80, type: 'sawtooth', vol: 0.08, ...o }); },
  'tg-strike': (S, o) => [523, 659, 784, 1047, 1319].forEach((f, i) => S.tone(f, 0.16, { delay: i * 0.07, vol: 0.2, ...o })),
  'tg-spare': (S, o) => [523, 784, 1047].forEach((f, i) => S.tone(f, 0.14, { delay: i * 0.08, vol: 0.16, ...o })),
  'tg-sweep': (S, o) => S.noise(0.5, { freq: 420, q: 0.6, vol: 0.08, ...o }),
});

// ---- Scorecard: pure functions over a list of pin counts ---------------------------------------
function frames(rolls) {
  const out = []; let i = 0, sum = 0, live = true;
  for (let f = 0; f < 10; f++) {
    const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2]; let balls, sc = null, done;
    if (f < 9) {
      if (a === 10) { balls = [10]; done = true; if (b != null && c != null) sc = 10 + b + c; i += 1; }
      else { balls = [a, b].filter(v => v != null); done = b != null; if (done) { if (a + b === 10) { if (c != null) sc = 10 + c; } else sc = a + b; } i += 2; }
    } else {
      balls = [a, b, c].filter(v => v != null);
      done = balls.length === 3 || (balls.length === 2 && a !== 10 && a + b < 10);
      if (done) sc = a + b + (c || 0);
    }
    if (sc != null && live) sum += sc; else live = false;
    out.push({ balls, done, total: live ? sum : null });
  }
  return out;
}
const standing = rolls => {                                   // pins on the deck before this player's next ball
  const fr = frames(rolls), f = fr.findIndex(q => !q.done); if (f < 0) return 0;
  const [a, b] = fr[f].balls;
  if (a == null) return 10;
  if (f < 9 || b == null) return a === 10 ? 10 : 10 - a;
  return a === 10 ? (b === 10 ? 10 : 10 - b) : 10;
};
const fill = (rolls, best) => { const r = rolls.slice(); for (let n = 0; n < 24 && !frames(r)[9].done; n++) r.push(best ? standing(r) : 0); return r; };
const shown = rolls => { let t = 0; for (const f of frames(rolls)) if (f.total != null) t = f.total; return t; };
const final = rolls => frames(rolls)[9].total || 0;
const sym = v => (v === 0 ? '-' : String(v));
function marks(fr, f) {
  const [a, b, c] = fr.balls, out = [];
  if (a == null) return out;
  out.push(a === 10 ? 'X' : sym(a));
  if (b == null) return out;
  if (f < 9) { out.push(a + b === 10 ? '/' : sym(b)); return out; }
  out.push(a === 10 ? (b === 10 ? 'X' : sym(b)) : a + b === 10 ? '/' : sym(b));
  if (c != null) out.push(a === 10 && b !== 10 && b + c === 10 ? '/' : c === 10 ? 'X' : sym(c));
  return out;
}
function tally(rolls) {                                        // strikes, spares and open frames in a finished or part game
  const s = { strikes: 0, spares: 0, open: 0 }, fr = frames(rolls);
  fr.forEach((q, f) => {
    const [a, b, c] = q.balls; if (a == null) return;
    if (f < 9) { if (a === 10) s.strikes++; else if (b != null) { if (a + b === 10) s.spares++; else s.open++; } return; }
    if (a === 10) { s.strikes++; if (b === 10) { s.strikes++; if (c === 10) s.strikes++; } else if (b != null && c != null && b + c === 10) s.spares++; }
    else if (b != null) { if (a + b === 10) { s.spares++; if (c === 10) s.strikes++; } else s.open++; }
  });
  return s;
}
function isSplit(up) {                                         // head pin down, and the standing pins form two or more separate groups
  if (up.includes(0) || up.length < 2) return false;
  const seen = new Set([up[0]]), todo = [up[0]];
  while (todo.length) { const a = SPOTS[todo.pop()]; for (const j of up) if (!seen.has(j) && U.dist(a.x, a.d, SPOTS[j].x, SPOTS[j].d) < SP * 1.05) { seen.add(j); todo.push(j); } }
  return seen.size < up.length;
}
// Where a ball will go, ignoring pins: the same hook formula the physics uses. spin is a number or a function of time.
function trace(x, d, vx, vd, spin, open) {
  const pts = [{ x, d }], dt = 1 / 60;
  for (let n = 0, t = 0; n < 2000 && d < HEAD - BR && (open || Math.abs(x) <= LW); n++, t += dt) {
    vx += (typeof spin === 'function' ? spin(t) : spin) * grip(d) * HOOK * dt; x += vx * dt; d += vd * dt;
    if (n % 3 === 2) pts.push({ x, d });
  }
  pts.push({ x, d }); return pts;
}

// ---- Physics: cannon-es on its own fixed step ----------------------------------------------------
class Phys {
  constructor(rng) {
    const C = CANNON, w = this.w = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
    this.rng = rng; w.allowSleep = true; w.solver.iterations = 10; w.defaultContactMaterial.friction = 0.2; w.defaultContactMaterial.restitution = 0.3;
    const mL = new C.Material('lane'), mB = new C.Material('ball'), mP = new C.Material('pin'), mW = new C.Material('wall');
    const cm = (a, b, friction, restitution) => w.addContactMaterial(new C.ContactMaterial(a, b, { friction, restitution }));
    cm(mB, mL, 0, 0.05); cm(mP, mL, 0.45, 0.3); cm(mB, mP, 0.2, 0.3); cm(mP, mP, 0.2, 0.4);       // tuned so only a pocket hit strikes often cm(mP, mW, 0.2, 0.35); cm(mB, mW, 0.05, 0.1);
    const flags = { collisionFilterGroup: 1, collisionFilterMask: 6 };
    const floor = new C.Body({ mass: 0, material: mL, shape: new C.Plane(), ...flags }); floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); w.addBody(floor);   // the boards, top at y = 0
    for (const s of [-1, 1]) { const k = new C.Body({ mass: 0, material: mW, shape: new C.Box(new C.Vec3(0.05, 0.6, 2.4)), ...flags }); k.position.set(s * (LW + GW + 0.05), 0.6, -(DECK - 1.2)); w.addBody(k); }   // kickbacks
    // One pin: a convex belly (narrow base, upright sides at ball height, narrow neck) and a sphere for the head. Origin at the centre of gravity.
    const ring = [[0.03, 0], [0.06, 0.088], [0.06, 0.142], [0.024, 0.27]], N = 8, R = ring.length, verts = [], faces = [];
    ring.forEach(([r, y]) => { for (let j = 0; j < N; j++) verts.push(new C.Vec3(r * Math.cos(j / N * 2 * Math.PI), y - COG, r * Math.sin(j / N * 2 * Math.PI))); });
    for (let q = 0; q < R - 1; q++) for (let j = 0; j < N; j++) faces.push([q * N + j, (q + 1) * N + j, (q + 1) * N + (j + 1) % N, q * N + (j + 1) % N]);
    faces.push([...Array(N).keys()], [...Array(N).keys()].map(j => (R - 1) * N + N - 1 - j));
    for (const f of faces) {                                    // make every face wind anticlockwise seen from outside
      const A = verts[f[0]], B = verts[f[1]], D = verts[f[2]], n = B.vsub(A).cross(D.vsub(A)), mid = new C.Vec3(); f.forEach(i => mid.vadd(verts[i], mid));
      if (n.dot(mid.vsub(new C.Vec3(0, (0.135 - COG) * f.length, 0))) < 0) f.reverse();
    }
    this.belly = () => new C.ConvexPolyhedron({ vertices: verts.map(v => v.clone()), faces: faces.map(f => f.slice()) });
    this.clacks = []; this.t = 0; this.acc = 0; this.live = false; this.hit = false; this.gutter = false; this.spin = 0; this.bumpers = false;
    // The ball is a sphere to the boards and walls, and an upright drum of the same radius to the pins, so it ploughs through them instead of climbing.
    this.ball = new C.Body({ mass: BM, material: mB, linearDamping: 0, fixedRotation: true, collisionFilterGroup: 4, collisionFilterMask: 3, allowSleep: false });
    const round = new C.Sphere(BR), drum = new C.Cylinder(BR, BR, 0.26, 14); round.collisionFilterGroup = 8; round.collisionFilterMask = 1; drum.collisionFilterGroup = 4; drum.collisionFilterMask = 2;
    this.ball.addShape(round); this.ball.addShape(drum, new C.Vec3(0, 0.03, 0)); this.ball.updateMassProperties();
    this.ball.addEventListener('collide', e => {
      if (e.body.pin == null) return;
      if (!this.hit) { this.hit = true; this.hitT = this.t; this.hitX = this.ball.position.x; }
      this.clacks.push(Math.abs(e.contact.getImpactVelocityAlongNormal()));
    });
    this.pins = SPOTS.map((_, i) => {
      const b = new C.Body({ mass: PM, material: mP, linearDamping: 0.05, angularDamping: 0.35, collisionFilterGroup: 2, collisionFilterMask: 7, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.3 });
      b.addShape(this.belly()); b.addShape(new C.Sphere(0.033), new C.Vec3(0, 0.335 - COG, 0));       // belly and head
      for (const sh of b.shapes) { sh.collisionFilterGroup = 2; sh.collisionFilterMask = 7; }
      b.inertia.set(0.02, 0.0016, 0.02); b.invInertia.set(50, 625, 50); b.updateInertiaWorld(true);          // a real pin's, not its bounding box's
      b.pin = i; b.on = false; b.loose = false;
      b.addEventListener('collide', e => { if (e.body.pin != null && e.body.pin > i) this.clacks.push(Math.abs(e.contact.getImpactVelocityAlongNormal())); });
      return b;
    });
    this.up = [];
  }
  stand(b, x, d) { b.position.set(x, COG + 0.0005, -d); b.quaternion.set(0, 0, 0, 1); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.loose = false; if (!b.on) { this.w.addBody(b); b.on = true; } b.sleep(); }
  rack(which) {                                                // stand these pins on their spots, a couple of millimetres off true
    this.drop();
    this.up = which ? which.slice() : SPOTS.map((_, i) => i);
    this.pins.forEach((b, i) => {
      if (this.up.includes(i)) this.stand(b, SPOTS[i].x + (this.rng() - 0.5) * 0.004, SPOTS[i].d + (this.rng() - 0.5) * 0.004);
      else this.take(b);
    });
  }
  take(b, loose) { if (b.on) { this.w.removeBody(b); b.on = false; } b.loose = !!loose; }
  bowl(x, ang, v, bumpers) {
    const b = this.ball, a = ang * RAD;
    b.position.set(x, BR, -START); b.quaternion.set(0, 0, 0, 1); b.velocity.set(v * Math.sin(a), 0, -v * Math.cos(a));
    b.angularVelocity.set(0, 0, 0); b.collisionFilterMask = 3; b.loose = false;
    if (!b.on) { this.w.addBody(b); b.on = true; }
    this.live = true; this.hit = false; this.gutter = false; this.spin = 0; this.bumpers = bumpers; this.slow = 0; this.t = 0; this.acc = 0; this.goneT = 0; this.hitX = 0; this.quiet = 0; this.clacks.length = 0;
  }
  drop(loose) { this.take(this.ball, loose); if (this.live) { this.live = false; this.goneT = this.t; } }
  fall(b) {                                                  // off the end of the deck: out of the simulation, falling into the pit for the camera
    b.velocity.y -= 9.82 * STEP; b.position.vadd(b.velocity.scale(STEP), b.position); b.quaternion.integrate(b.angularVelocity, STEP, ONE, b.quaternion); b.quaternion.normalize();
    if (b.position.y < -0.7) b.loose = false;
  }
  advance(dt) { this.acc += dt; while (this.acc >= STEP - 1e-9) { this.acc -= STEP; this.sub(); } }
  sub() {
    const b = this.ball, p = b.position;
    if (this.live) {
      const d = -p.z, edge = LW - 0.012;
      if (!(p.x === p.x)) this.drop(); else if (d > DECK + 0.03) this.drop(true);
      else {
        if (this.bumpers && !this.gutter && d < DECK && Math.abs(p.x) > edge) { const s = Math.sign(p.x); p.x = s * edge; if (b.velocity.x * s > 0) b.velocity.x *= -0.7; }
        if (!this.gutter && d < DECK && Math.abs(p.x) > LW) { this.gutter = true; b.collisionFilterMask = 1; }
        if (this.gutter) { if (d < DECK) b.velocity.x = (Math.sign(p.x) * (LW + GW / 2) - p.x) * 12; }
        else if (d < HEAD) b.velocity.x += this.spin * grip(d) * HOOK * STEP;
        if (p.y > BR) p.y = BR; if (b.velocity.y > 0) b.velocity.y = 0;                              // a bowling ball ploughs through; it does not climb the pins
        this.slow = b.velocity.lengthSquared() < 0.04 ? this.slow + STEP : 0;
        if (this.slow > 1) this.drop();
      }
    }
    if (b.loose) this.fall(b);
    let quiet = true;
    for (const q of this.pins) { if (q.on && -q.position.z > DECK + 0.02) this.take(q, true); if (q.loose) this.fall(q); else if (q.on && (q.velocity.lengthSquared() > 0.02 || q.angularVelocity.lengthSquared() > 1.2)) quiet = false; }
    this.quiet = quiet ? this.quiet + STEP : 0;
    this.w.step(STEP); this.t += STEP;
  }
  settled() {
    if (!this.hit) return !this.live && this.t - this.goneT > 0.4;
    const since = this.t - this.hitT;
    return since > 3.6 || (since > 1.2 && !this.live && this.quiet > 0.3);
  }
  down(b) { const p = b.position, q = b.quaternion; return !b.on || !(p.x === p.x) || 1 - 2 * (q.x * q.x + q.z * q.z) < 0.94 || p.y < COG - 0.03 || Math.abs(p.x) > LW + 0.02 || -p.z > DECK + 0.05; }
  read() { const fell = this.up.filter(i => this.down(this.pins[i])); this.up = this.up.filter(i => !fell.includes(i)); return fell; }
  tidy() {                                                     // the sweep: dead wood goes, standing pins stay exactly where they stand
    this.drop();
    this.pins.forEach((b, i) => { if (this.up.includes(i)) this.stand(b, b.position.x, -b.position.z); else this.take(b); });
  }
}

// ---- The 3D picture. Never touched by update(), so Couch.simulate runs without it -----------------
class View {
  constructor() {
    const cv = this.cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no WebGL');
    const r = this.r = new THREE.WebGLRenderer({ canvas: cv, context: gl }); r.setPixelRatio(1); r.shadowMap.enabled = true;
    const sc = this.scene = new THREE.Scene(); sc.background = new THREE.Color(T.bg); sc.fog = new THREE.Fog(T.bg, 26, 52);
    this.cam = new THREE.PerspectiveCamera(27, 16 / 9, 0.1, 80); this.pos = new THREE.Vector3(0, 1.7, 4.6); this.look = new THREE.Vector3(0, 0.1, -6); this.last = 0; this.size = 0; this.axis = new THREE.Vector3(); this.turn = new THREE.Quaternion();
    sc.add(new THREE.HemisphereLight(0xdfe6ff, 0x1b1e26, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(1.8, 8, -9); sun.target.position.set(0, 0, -10.2); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 12.5, bottom: -12.5, near: 1, far: 20 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.mapSize.set(1024, 4096); sun.shadow.bias = -0.0004;
    sc.add(sun, sun.target);
    const std = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
    const box = (w, h, l, x, y, d, mat, shadow) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, -d); m.receiveShadow = !!shadow; sc.add(m); return m; };
    // the lane, painted in code: boards, foul line, dots, the seven arrows, pin spots
    const len = DECK + 1.5, tex = document.createElement('canvas'); tex.width = 256; tex.height = 4096;
    const c = tex.getContext('2d'), py = d => (1 - (d + 1.5) / len) * tex.height, px = x => (x / LW * 0.5 + 0.5) * tex.width;
    for (let i = 0; i < 39; i++) { const v = Math.sin(i * 12.9898) * 43758.5453, n = v - Math.floor(v); c.fillStyle = `hsl(${34 + n * 5} ${46 + n * 8}% ${62 + n * 9}%)`; c.fillRect(i * tex.width / 39, 0, tex.width / 39 + 1, tex.height); }
    c.fillStyle = 'rgba(60,34,10,0.22)'; for (let i = 1; i < 39; i++) c.fillRect(i * tex.width / 39 - 0.5, 0, 1, tex.height);
    c.fillStyle = 'rgba(40,24,10,0.16)'; c.fillRect(0, py(0), tex.width, tex.height);                 // the approach is a shade darker
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(0, py(12), tex.width, py(0) - py(12));          // the oil, as a faint sheen
    c.fillStyle = '#1A1D24'; c.fillRect(0, py(0) - 3, tex.width, 6);
    for (let i = -3; i <= 3; i++) {
      const ax = px(i * 5 * LW / 19.5), ay = py(4.57 + (3 - Math.abs(i)) * 0.3);
      c.beginPath(); c.moveTo(ax, ay - 26); c.lineTo(ax + 6, ay + 14); c.lineTo(ax - 6, ay + 14); c.closePath(); c.fill();
      c.beginPath(); c.arc(ax, py(2.1), 3, 0, 7); c.fill(); c.beginPath(); c.arc(ax, py(-0.4), 3.5, 0, 7); c.fill();
    }
    c.fillStyle = 'rgba(20,22,28,0.5)'; for (const s of SPOTS) { c.beginPath(); c.ellipse(px(s.x), py(s.d), 7, 3.2, 0, 0, 7); c.fill(); }
    const map = new THREE.CanvasTexture(tex); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(LW * 2, len), new THREE.MeshStandardMaterial({ map, roughness: 0.34 }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0, -(DECK - 1.5) / 2); lane.receiveShadow = true; sc.add(lane);
    const dark = std('#12151B'), rail = std('#262D3A', 0.6), wall = std('#1A1F29'), far = LW + GW;
    box(40, 0.1, 60, 0, -0.16, 12, std('#0E1116'));                                                   // the hall floor
    for (const s of [-1, 1]) {
      box(GW, 0.02, len, s * (LW + GW / 2), -0.055, (DECK - 1.5) / 2, dark, true);                    // gutter
      box(0.3, 0.14, DECK + 0.4, s * (far + 0.15), 0.01, (DECK - 0.4) / 2, rail, true);               // division rail
      box(0.1, 1.0, 3.6, s * (far + 0.05), 0.5, DECK - 0.6, wall, true);                              // kickback
      box(2.4, 0.02, DECK + 1.5, s * (far + 1.5), -0.02, (DECK - 1.5) / 2, std('#1E1A16', 0.5), true); // the neighbouring lanes, in the dark
    }
    box(far * 2, 0.02, 1.3, 0, -0.34, DECK + 0.6, std('#07090D'));                                    // pit
    box(far * 2 + 0.2, 1.6, 0.1, 0, 0.5, PIT + 0.1, std('#0A0C10'));
    box(far * 2 + 0.6, 0.95, 0.12, 0, 1.12, DECK + 0.2, std('#202632', 0.5));                         // masking unit above the pins
    this.strip = box(far * 2 + 0.6, 0.05, 0.13, 0, 0.67, DECK + 0.2, new THREE.MeshBasicMaterial({ color: T.text }));
    this.rails = [-1, 1].map(s => box(0.02, 0.06, DECK, s * (LW + 0.002), 0.03, DECK / 2, this.strip.material));   // bumpers, shown for a seat on Strong assist
    // pins: one lathe shape with two neck stripes, origin at the centre of gravity
    const prof = [[0, 0], [0.026, 0], [0.031, 0.012], [0.046, 0.06], [0.0585, 0.105], [0.0605, 0.125], [0.057, 0.16], [0.045, 0.2], [0.032, 0.236], [0.0262, 0.25], [0.0258, 0.252], [0.0242, 0.262], [0.024, 0.264],
      [0.0236, 0.274], [0.0236, 0.276], [0.0245, 0.288], [0.0247, 0.29], [0.029, 0.31], [0.0325, 0.335], [0.031, 0.355], [0.022, 0.372], [0, 0.381]];
    const pg = new THREE.LatheGeometry(prof.map(([r2, y]) => new THREE.Vector2(r2, y)), 22), pos = pg.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), red = (y > 0.251 && y < 0.263) || (y > 0.275 && y < 0.289); col[i * 3] = red ? 0.78 : 0.96; col[i * 3 + 1] = red ? 0.1 : 0.95; col[i * 3 + 2] = red ? 0.13 : 0.92; }
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3)); pg.translate(0, -COG, 0); pg.computeVertexNormals();
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28 });
    this.pins = SPOTS.map(() => { const m = new THREE.Mesh(pg, pm); m.castShadow = true; sc.add(m); return m; });
    // the ball carries its bowler's colour and shape, which also makes the spin visible
    this.skins = [0, 1].map(i => {
      const t = document.createElement('canvas'); t.width = 512; t.height = 256; const b = t.getContext('2d');
      b.fillStyle = T.p[i]; b.fillRect(0, 0, 512, 256); b.fillStyle = 'rgba(255,255,255,0.22)'; b.fillRect(0, 112, 512, 32); b.fillStyle = '#F4F6FA';
      for (const x of [128, 384]) { b.beginPath(); if (i === 0) b.ellipse(x, 128, 30, 44, 0, 0, 7); else { b.moveTo(x, 70); b.lineTo(x + 40, 128); b.lineTo(x, 186); b.lineTo(x - 40, 128); b.closePath(); } b.fill(); }
      const m = new THREE.CanvasTexture(t); m.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: m, roughness: 0.18 });
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 36, 24), this.skins[0]); this.ball.castShadow = true; sc.add(this.ball);
    // the guide: a ribbon on the boards
    this.N = 140; const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 6), 3));
    const ix = []; for (let i = 0; i < this.N - 1; i++) ix.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); gg.setIndex(ix);
    this.guide = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: T.text, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })); this.guide.frustumCulled = false; sc.add(this.guide);
  }
  render(g) {
    const now = performance.now(), dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016); this.last = now;
    const want = U.clamp(Math.round(W * (Couch.Engine.scale || 1)), 960, 1920);
    if (want !== this.size) { this.size = want; this.r.setSize(want, Math.round(want * 9 / 16), false); }
    const ph = g.ph, st = g.state, c = g.cur ? g.cur.c : 0;
    const sink = p => 0.045 * U.clamp((Math.abs(p.x) - LW - 0.02) / 0.06, 0, 1);
    ph.pins.forEach((b, i) => { const m = this.pins[i]; m.visible = b.on || b.loose; if (m.visible) { m.position.copy(b.position); m.position.y -= sink(b.position); m.quaternion.copy(b.quaternion); } });
    const ball = this.ball; ball.material = this.skins[c]; this.strip.material.color.set(T.p[c]); for (const m of this.rails) m.visible = g.assist(g.cur) === 2 && st !== 'over';
    if (st === 'stance' || st === 'swing' || st === 'intro') {
      const h = st === 'swing' ? Math.min(1, g.sw.t / 0.8) : 0, e = h * h * (3 - 2 * h);
      ball.visible = st !== 'intro'; ball.position.set(g.x0, BR + 0.02 + e * 0.5, -START + e * 0.55); ball.quaternion.set(0, 0, 0, 1);
    } else { const b = ph.ball; ball.visible = b.on || b.loose; if (ball.visible) {
      ball.position.copy(b.position); ball.position.y -= 0.045 * U.clamp((Math.abs(b.position.x) - LW + 0.03) / 0.06, 0, 1);
      const v = b.velocity, sp = Math.hypot(v.x, v.z); if (sp > 0.05) { this.axis.set(v.z / sp, -g.spin * 0.5, -v.x / sp).normalize(); ball.quaternion.premultiply(this.turn.setFromAxisAngle(this.axis, sp * dt * g.k.scale / BR)); }
    } }
    // guide ribbon
    const pts = g.guide(), gp = this.guide.geometry.attributes.position, n = Math.min(this.N, pts.length);
    this.guide.visible = n > 1; this.guide.material.color.set(T.p[c]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)], tx = q.x - o.x, td = q.d - o.d, m = Math.hypot(tx, td) || 1, nx = td / m * 0.014, nd = -tx / m * 0.014;
      gp.setXYZ(i * 2, p.x - nx, 0.004, -(p.d - nd)); gp.setXYZ(i * 2 + 1, p.x + nx, 0.004, -(p.d + nd));
    }
    gp.needsUpdate = true; this.guide.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    // camera: Stance, Chase, Deck
    let px = g.x0 * 0.6, py = 1.7, pz = 4.6, lx = g.x0 * 0.25, ly = 0.1, lz = -6, rate = 3;
    if (st === 'roll' || st === 'show') {
      const b = ph.ball.position;
      if (ph.hit || st === 'show' || !ph.live) { px = 0.5; py = 0.66; pz = -(HEAD - 2.7); lx = 0; ly = 0.2; lz = -(HEAD + 0.45); rate = 4; }
      else { px = b.x * 0.7; py = 0.85; pz = Math.max(b.z + 2.6, -(HEAD - 4)); lx = b.x * 0.4; ly = 0.15; lz = Math.min(b.z - 7, -(HEAD - 0.5)); rate = 6; }
    }
    const k = 1 - Math.exp(-rate * dt);
    this.pos.x += (px - this.pos.x) * k; this.pos.y += (py - this.pos.y) * k; this.pos.z += (pz - this.pos.z) * k;
    this.look.x += (lx - this.look.x) * k; this.look.y += (ly - this.look.y) * k; this.look.z += (lz - this.look.z) * k;
    this.cam.position.copy(this.pos); this.cam.lookAt(this.look); this.r.render(this.scene, this.cam);
  }
  dispose() { try { this.r.dispose(); this.r.forceContextLoss(); } catch (e) {} }
}

// ---- The match ------------------------------------------------------------------------------------
class Grudge {
  constructor(k) {
    this.k = k; const sv = k.save, two = k.players.length > 1;
    this.P = [0, 1].map(n => { const seat = k.players[two ? n : 0]; return { n, seat, c: two ? seat.index : n, rolls: [], x0: 0, aim: 0, streak: 0, splits: 0, fast: 0, botN: -1 }; });
    const first = sv.lastLoser === 0 || sv.lastLoser === 1 ? this.P.findIndex(p => p.c !== sv.lastLoser) : k.rng() < 0.5 ? 0 : 1;
    this.order = [first, 1 - first]; this.ro = []; this.ph = new Phys(k.rng); this.fx = new k.Particles(300);
    this.state = 'intro'; this.t = 0; this.n = 0; this.cur = this.P[first]; this.x0 = 0; this.aim = 0; this.sw = { t: 0, idle: 0 }; this.spin = 0; this.meter = 0;
    this.call = null; this.banner = null; this.rollT = 0; this.rep = 0; this.leave = 0; this.view = null;
    if (!k.sim) { try { this.view = new View(); } catch (e) { this.view = null; } }
    this.ph.rack();
  }
  assist(p) { return this.k.assist(p.seat.index); }
  // Whose ball is next. null means the match is over.
  plan() {
    for (let f = 0; f < 10; f++) for (const n of this.order) { const fr = frames(this.P[n].rolls)[f]; if (!fr.done) return { n, f, b: fr.balls.length }; }
    if (final(this.P[0].rolls) !== final(this.P[1].rolls)) return null;
    let r = this.ro[this.ro.length - 1];
    if (!r || (r[0] != null && r[1] != null)) { if (r && (r[0] !== r[1] || this.ro.length >= 3)) return null; r = [null, null]; this.ro.push(r); }
    return { n: r[this.order[0]] == null ? this.order[0] : this.order[1], ro: this.ro.length };
  }
  begin() {                                                    // set up the next ball, or end the match
    const turn = this.plan(); if (!turn) return this.end();
    const p = this.P[turn.n], changed = p !== this.cur || this.n === 0; this.turn = turn; this.cur = p; this.n++;
    const need = turn.ro ? 10 : standing(p.rolls);
    if (need === 10 || changed) this.ph.rack(); else this.ph.tidy();
    this.fresh = need === 10; this.x0 = p.x0; this.aim = p.aim; this.spin = 0; this.sw.t = 0; this.state = 'stance'; this.t = 0;
    if (changed) { this.banner = { t: 1.6, c: p.c, text: NAME[p.c] + ' to bowl', sub: turn.ro ? 'Roll-off, ball ' + turn.ro : 'Frame ' + (turn.f + 1) }; Sfx.play('ready', { pitch: p.c ? 0.9 : 1.1 }); }
  }
  guide() {                                                    // the aim line, as far as this seat's assist shows it
    const p = this.cur, a = this.assist(p), ph = this.ph;
    if (this.state === 'stance' || this.state === 'swing') {
      const ang = this.aim / 10 * RAD, pts = trace(this.x0, START, Math.sin(ang) * 8, Math.cos(ang) * 8, 0);
      return a === 0 ? pts.filter(q => q.d <= 4.7) : pts;
    }
    if (this.state === 'roll' && a === 2 && ph.live && !ph.hit && !ph.gutter) { const b = ph.ball; return trace(b.position.x, -b.position.z, b.velocity.x, -b.velocity.z, this.spin); }
    return [];
  }
  update(dt) {
    const k = this.k, ph = this.ph, p = this.cur, s = p.seat; this.t += dt; this.fx.update(dt);
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.call && (this.call.t -= dt) <= 0) this.call = null;
    if (this.state === 'intro') { if (this.t > 2 || this.P.some(q => q.seat.pressed('a'))) this.begin(); return; }
    if (this.state === 'over') { if (this.t > 1.6) this.finish(); return; }
    if (this.state === 'stance') {
      const key = s.type === 'kb' || s.type === 'touch';
      this.x0 = U.clamp(this.x0 + s.move.x * 0.45 * dt, -0.45, 0.45); this.rep -= dt;
      for (const [btn, dir] of [['lb', -1], ['rb', 1]]) if (s.pressed(btn) || (s.held(btn) > 0.35 && this.rep <= 0)) { this.aim = U.clamp(this.aim + dir, -AIM, AIM); this.rep = 1 / 15; Sfx.play('tick'); }
      if (key ? s.pressed('a') : s.aim.y > 0.6) { this.state = 'swing'; this.sw.t = 0; this.sw.idle = 0; }
      return;
    }
    if (this.state === 'swing') {
      const key = s.type === 'kb' || s.type === 'touch', sw = this.sw; sw.t += dt;
      if (this.t - (sw.rum || 0) > 0.12) { sw.rum = this.t; s.rumble(0.1 + 0.25 * Math.min(1, sw.t / 0.8), 100, 0); }
      if (s.pressed('b')) { this.state = 'stance'; Sfx.play('back'); return; }
      if (!key) { sw.idle = Math.abs(s.aim.y) < 0.25 ? sw.idle + dt : 0; if (sw.idle > 0.6) { this.state = 'stance'; return; } }
      if (key ? !s.down('a') : s.aim.y < -0.5) this.release(key ? Math.sin(sw.t * 3.1) * 0.4 : s.aim.x);
      return;
    }
    if (this.state === 'roll') {
      const was = ph.hit, gut = ph.gutter, mx = s.move.x;
      if (ph.live && !ph.hit && !ph.gutter && this.meter > 0 && Math.abs(mx) > 0.15) { this.spin = U.clamp(this.spin + mx * 1.25 * dt, -1, 1); this.meter -= Math.abs(mx) * dt; if (this.t - this.rollT > 0.09) s.rumble(0.12 + 0.3 * grip(-ph.ball.position.z), 90, 0.2); }
      ph.spin = this.spin; ph.advance(dt);
      if (ph.live && !ph.gutter && this.t - this.rollT > 0.11) { this.rollT = this.t; const b = ph.ball; Sfx.play('tg-roll', { pitch: 0.7 + b.velocity.length() / 14, pan: U.clamp(b.position.x / LW, -1, 1) * 0.6 }); }
      if (ph.gutter && !gut) { Sfx.play('tg-gutter'); s.rumble(0.5, 90); k.after(0.16, () => s.rumble(0.5, 90)); }
      if (ph.hit && !was) { if (this.fresh && Math.abs(Math.abs(ph.hitX) - 0.07) < 0.045) k.slowmo(0.35, 0.5); }
      for (let i = 0, n = Math.min(6, ph.clacks.length); i < n; i++) { const v = ph.clacks[i]; if (v > 0.4) Sfx.play('tg-pin', { vol: U.clamp(v / 22, 0.03, 0.3), pitch: 0.85 + (i % 3) * 0.12 }); }
      if (ph.clacks.length) { const v = Math.max(...ph.clacks); if (v > 2) for (const q of this.P) q.seat.rumble(U.clamp(v / 9, 0.2, 0.8), 110); ph.clacks.length = 0; }
      if (ph.settled()) this.score(ph.read().length);
      return;
    }
    if (this.state === 'show' && this.t > this.hold) { Sfx.play('tg-sweep'); this.begin(); }
  }
  release(drift) {
    const p = this.cur, a = this.assist(p), sw = this.sw, floor = a === 2 ? 0.7 : 0.55;
    let pw = 0.55 + 0.45 * Math.min(1, sw.t / 0.8); if (sw.t > 1.2) pw -= 0.2 * (sw.t - 1.2); pw = U.clamp(pw, floor, 1);
    const v = speedOf(pw), ang = this.aim / 10 + U.clamp(drift, -1, 1) * DRIFT * [1, 0.5, 0.25][a];
    p.x0 = this.x0; p.aim = this.aim; p.fast = Math.max(p.fast, v * 3.6); this.power = pw; this.kmh = v * 3.6;
    this.ph.bowl(this.x0, ang, v, a === 2); this.meter = a ? 1 : 0.8; this.spin = 0; this.state = 'roll'; this.t = 0; this.rollT = 0;
    Sfx.play('tg-release'); p.seat.rumble(0.4 + 0.4 * (pw - 0.55) / 0.45, 120);
  }
  score(count) {                                               // a ball has settled: mark the card and say what happened
    const k = this.k, p = this.cur, ph = this.ph, turn = this.turn, left = ph.up.length; let text, sub = '', big = false;
    if (turn.ro) this.ro[this.ro.length - 1][p.n] = count; else p.rolls.push(count);
    const strike = this.fresh && count === 10, spare = !this.fresh && left === 0;
    if (strike) { p.streak++; text = p.streak === 3 ? 'Turkey' : 'Strike'; big = true; }
    else {
      p.streak = 0;
      if (spare) { text = 'Spare'; if (p.split) { p.splits++; sub = 'Split converted'; } }
      else if (count === 0 && ph.gutter) text = 'Gutter';
      else text = count + ' down';
    }
    if (!this.fresh) p.split = false;
    else if ((p.split = !strike && !turn.ro && isSplit(ph.up))) { text = 'Split'; sub = ph.up.map(i => i + 1).join('-'); }
    this.call = { t: big ? 2.2 : 1.6, max: big ? 2.2 : 1.6, text, sub, c: p.c }; this.hold = big ? 2.3 : 1.7; this.state = 'show'; this.t = 0;
    if (strike) { Sfx.play('tg-strike'); k.hitstop(0.06); k.shake(0.5); for (const q of this.P) q.seat.rumble(0.9, 260); this.fx.burst(W / 2, 330, 90, { color: T.p[p.c], speed: [240, 900], life: 1.1, size: 9 }); this.fx.burst(W / 2, 330, 40, { color: T.text, speed: [200, 700], life: 0.9, size: 6 }); }
    else if (spare) { Sfx.play('tg-spare'); this.fx.burst(W / 2, 330, 40, { color: T.p[p.c], speed: [200, 600], life: 0.8, size: 7 }); }
  }
  end() {
    const [a, b] = this.P.map(q => final(q.rolls)), r = this.ro[this.ro.length - 1];
    this.won = a !== b ? (a > b ? 0 : 1) : r && r[0] !== r[1] ? (r[0] > r[1] ? 0 : 1) : -1;
    this.state = 'over'; this.t = 0; this.cur = this.P[this.won < 0 ? 0 : this.won];
  }
  finish() {
    const k = this.k, P = this.P, sv = k.save, w = this.won, sc = P.map(q => final(q.rolls)), tl = P.map(q => tally(q.rolls));
    const by = c => P.findIndex(q => q.c === c), pair = f => [0, 1].map(c => f(by(c))).join(' and ');
    if (!sv.wins) { sv.wins = [0, 0]; sv.draws = 0; }
    if (w < 0) { sv.draws++; sv.lastLoser = null; } else { sv.wins[P[w].c]++; sv.lastLoser = P[1 - w].c; }
    k.finish({ won: true, score: Math.max(sc[0], sc[1]), title: w < 0 ? 'A draw' : NAME[P[w].c] + ' wins',
      note: `Blue ${sc[by(0)]}, Amber ${sc[by(1)]}` + (this.ro.length ? (w < 0 ? ', still level after three roll-offs.' : ', settled by a roll-off.') : '.') + ' Each line below reads Blue and Amber.',
      stats: [['Strikes', pair(i => tl[i].strikes)], ['Spares', pair(i => tl[i].spares)], ['Open frames', pair(i => tl[i].open)], ['Splits converted', pair(i => P[i].splits)], ['Fastest ball, km/h', pair(i => Math.round(P[i].fast))]] });
  }
  // The practice bot bowls for whichever seat it holds. The same function drives Couch.simulate for balance runs.
  bot(seat, ctl) {
    const p = this.cur, rng = this.k.rng; if (!p || p.seat !== seat) return;
    if (this.state === 'intro') return;
    if (this.state === 'stance') {
      if (p.botN !== this.n) {                                 // plan this ball once
        p.botN = this.n; const up = this.ph.up, hold = U.clamp(0.53 + U.gauss(rng) * 0.05, 0.3, 0.8), v = speedOf(0.55 + 0.45 * hold / 0.8);
        let xt, spin = 0;
        if (this.fresh) { xt = 0.068; spin = -0.6; }
        else { const lead = up.reduce((m, i) => (SPOTS[i].d < SPOTS[m].d ? i : m), up[0]), cx = up.reduce((t, i) => t + SPOTS[i].x, 0) / up.length; xt = SPOTS[lead].x + U.clamp(cx - SPOTS[lead].x, -0.045, 0.045); }
        const ramp = t => Math.max(spin, -1.25 * t), pref = this.fresh ? 0.2 : xt * 0.5; let best = null;
        for (let a = -AIM; a <= AIM; a++) {
          const pts = trace(0, START, Math.sin(a / 10 * RAD) * v, Math.cos(a / 10 * RAD) * v, ramp, true), x0 = xt - pts[pts.length - 1].x;
          if (Math.abs(x0) <= 0.42 && (!best || Math.abs(x0 - pref) < Math.abs(best.x0 - pref))) best = { a, x0 };
        }
        best = best || { a: 0, x0: U.clamp(xt, -0.42, 0.42) };
        p.plan = { x0: U.clamp(best.x0 + U.gauss(rng) * 0.018, -0.45, 0.45), aim: best.a, hold, spin, drift: U.clamp(U.gauss(rng) * 0.2, -1, 1), wait: U.range(rng, 2.5, 4), flip: 0 };
      }
      const b = p.plan, dx = b.x0 - this.x0, da = b.aim - this.aim;
      if (Math.abs(dx) > 0.003) ctl.x = U.clamp(dx * 8, -1, 1);
      if (da) { if ((b.flip ^= 1)) ctl.set(da > 0 ? 'rb' : 'lb'); }
      else if (this.t > b.wait && Math.abs(dx) <= 0.003) ctl.ay = 1;
    } else if (this.state === 'swing') { if (this.sw.t < p.plan.hold) ctl.ay = 1; else { ctl.ay = -1; ctl.ax = p.plan.drift; } }
    else if (this.state === 'roll' && p.plan && p.plan.spin) { const left = Math.abs(p.plan.spin) - Math.abs(this.spin); if (left > 0.004) ctl.x = Math.sign(p.plan.spin) * U.clamp(left / 0.045, 0.16, 1); }
  }
  dev(code) {
    if (this.state !== 'stance') return;
    if (code === 'F8') { this.ph.up = []; this.ph.hit = false; this.ph.gutter = false; this.score(this.fresh ? 10 : standing(this.cur.rolls)); return; }
    if (!this.fresh || this.turn.ro || (this.turn.f === 9 && this.turn.b)) return;
    const up = [[6, 9], [2, 5, 9]][this.leave++ % 2]; this.cur.rolls.push(10 - up.length); this.cur.split = true; this.ph.rack(up); this.fresh = false; this.n++;
  }
  exit() { if (this.view) this.view.dispose(); this.view = null; }

  // ---- Drawing ------------------------------------------------------------------------------------
  draw() {
    const k = this.k, c = k.c;
    if (this.view) { this.view.render(this); c.drawImage(this.view.cv, 0, 0, W, H); } else this.flat(W / 2 - 330, 230, 660, 800, true);
    if (Couch.Engine.debug && this.view) this.flat(W - 400, 240, 340, 420, false);
    this.fx.draw(c); this.card();
    const p = this.cur, s = p.seat, col = T.p[p.c], st = this.state;
    if (st === 'intro') {
      const sv = k.save, w = sv.wins || [0, 0];
      G.panel(W / 2 - 430, 420, 860, 230); G.text('Tenpin Grudge', W / 2, 500, { size: FS.lg, weight: 700, align: 'center' });
      G.marker(p.c, W / 2 - 150, 556, 12); G.text(NAME[p.c] + ' bowls first', W / 2 - 124, 566, { size: FS.sm, color: col, weight: 700 });
      G.text(`Matches so far: Blue ${w[0]}, Amber ${w[1]}, drawn ${sv.draws || 0}`, W / 2, 618, { size: FS.xs, color: T.muted, align: 'center' });
    }
    if (st === 'stance' || st === 'swing') {
      const x = 60, y = H - 178, cm = Math.round(Math.abs(this.x0) * 100), deg = (Math.abs(this.aim) / 10).toFixed(1), key = s.type === 'kb' || s.type === 'touch';
      G.panel(x, y, 600, 150); G.marker(p.c, x + 36, y + 42, 11); G.eyebrow(NAME[p.c] + (this.turn.ro ? ' · roll-off' : ` · frame ${this.turn.f + 1} · ball ${this.turn.b + 1}`), x + 60, y + 50, { color: col });
      G.text(cm ? `Standing ${cm} cm ${this.x0 < 0 ? 'left' : 'right'}` : 'Standing in the centre', x + 30, y + 94, { size: FS.xs, weight: 500 });
      G.text(this.aim ? `Aiming ${deg}° ${this.aim < 0 ? 'left' : 'right'}` : 'Aiming straight', x + 30, y + 128, { size: FS.xs, weight: 500 });
      SPOTS.forEach((q, i) => { const on = this.ph.up.includes(i), px = x + 492 + q.x / SP * 30, py = y + 114 - (q.d - HEAD) / ROW * 26; G.circle(px, py, 10, on ? '#F4F2EC' : null, on ? null : T.line2, 2); });   // the pins still standing
      const hx = W - 60 - 660, hy = H - 178, opt = key ? { names: s.device && s.device.names } : {};
      G.panel(hx, hy, 660, 150);
      const rows = st === 'swing' ? [[[key ? 'a' : 'aim', key ? 'Let go to bowl' : 'Push forward to bowl, straight']], [['b', 'Cancel the swing']]]
        : [[['move', 'Step sideways'], [key ? 'a' : 'aim', key ? 'Hold to swing' : 'Pull back to swing']], [['lb', 'Aim left'], ['rb', 'Aim right']]];
      rows.forEach((r, i) => G.hints(hx + 30, hy + 48 + i * 58, r, s.type, opt));
    }
    if (st === 'swing') {                                      // swing height, with the floor and the top marked, and the drift needle
      const sw = this.sw, a = this.assist(p), floor = a === 2 ? 0.7 : 0.55, x = W - 230, y = 380, h = 330;
      let pw = 0.55 + 0.45 * Math.min(1, sw.t / 0.8); if (sw.t > 1.2) pw -= 0.2 * (sw.t - 1.2); pw = U.clamp(pw, floor, 1);
      G.panel(x - 34, y - 62, 196, h + 150); G.eyebrow('Power', x - 10, y - 26);
      G.rrect(x, y, 34, h, 8, T.s3); const fh = h * (pw - 0.5) / 0.5; G.rrect(x, y + h - fh, 34, fh, 8, sw.t > 1.2 ? T.bad : col);
      G.line(x - 8, y + h - h * (floor - 0.5) / 0.5, x + 42, y + h - h * (floor - 0.5) / 0.5, T.muted, 2); G.line(x - 8, y, x + 42, y, T.text, 3);
      G.text(Math.round(pw * 100) + '%', x + 56, y + h - fh + 8, { size: FS.sm, weight: 700, mono: true });
      const dr = s.type === 'kb' || s.type === 'touch' ? Math.sin(sw.t * 3.1) * 0.4 : s.aim.x;
      G.eyebrow('Drift', x - 10, y + h + 40); G.rrect(x - 10, y + h + 54, 150, 10, 5, T.s3); G.line(x + 65, y + h + 48, x + 65, y + h + 70, T.muted, 2);
      G.circle(x + 65 + U.clamp(dr, -1, 1) * 70, y + h + 59, 9, Math.abs(dr) < 0.12 ? T.good : T.bad);
    }
    if (st === 'roll') {
      const x = 60, y = H - 132, max = this.assist(p) ? 1 : 0.8;
      G.panel(x, y, 780, 100); G.eyebrow('Spin remaining', x + 28, y + 40); G.bar(x + 28, y + 58, 240, 12, this.meter / max, col);
      G.eyebrow(this.spin < -0.02 ? 'Hooking left' : this.spin > 0.02 ? 'Hooking right' : 'No spin', x + 310, y + 40);
      G.rrect(x + 310, y + 58, 220, 12, 6, T.s3); const sx = this.spin * 110; if (Math.abs(sx) > 1) G.rrect(x + 420 + Math.min(0, sx), y + 58, Math.abs(sx), 12, 6, col); G.line(x + 420, y + 50, x + 420, y + 78, T.muted, 2);
      G.text(Math.round(this.kmh) + ' km/h', x + 752, y + 70, { size: FS.sm, weight: 700, mono: true, align: 'right' });
    }
    const b = this.banner;
    if (b && st !== 'intro') {
      const a = U.clamp(Math.min(b.t / 0.3, (1.6 - b.t) / 0.2), 0, 1), w = 560; c.globalAlpha = a;
      G.rrect(W / 2 - w / 2, 236, w, 104, 52, 'rgba(7,9,13,0.9)', T.p[b.c], 3); G.marker(b.c, W / 2 - w / 2 + 56, 288, 15);
      G.text(b.text, W / 2 - w / 2 + 92, 284, { size: FS.md, weight: 700 }); G.text(b.sub, W / 2 - w / 2 + 92, 320, { size: FS.xs, color: T.muted }); c.globalAlpha = 1;
    }
    const q = this.call;
    if (q) {
      const a = U.clamp(Math.min((q.max - q.t) / 0.12, q.t / 0.35), 0, 1); c.globalAlpha = a;
      const big = q.text === 'Strike' || q.text === 'Turkey', size = big ? FS.xl : FS.lg, w = G.measure(q.text, { size, weight: 700 }) + 120;
      G.rrect(W / 2 - w / 2, 250, w, big ? 150 : 110, 28, 'rgba(7,9,13,0.82)', T.p[q.c], 3);
      G.text(q.text, W / 2, big ? 358 : 326, { size, weight: 700, color: T.p[q.c], align: 'center' });
      if (q.sub) G.text(q.sub, W / 2, big ? 444 : 404, { size: FS.sm, weight: 500, align: 'center' }); c.globalAlpha = 1;
    }
    if (st === 'over') {
      const w = this.won; G.panel(W / 2 - 380, 430, 760, 150);
      G.text(w < 0 ? 'A draw' : NAME[this.P[w].c] + ' wins', W / 2, 530, { size: FS.xl, weight: 700, align: 'center', color: w < 0 ? T.text : T.p[this.P[w].c] });
    }
  }
  card() {                                                     // both scorecards, the lead and what the trailing player needs
    const x = 60, y = 22, rh = 72, nw = 190, fw = 128, tw = 1800 - nw - fw * 9 - 180, P = this.P, done = this.state === 'over';
    G.panel(x, y, 1800, rh * 2 + 12);
    [0, 1].forEach(c => {
      const p = P.find(q => q.c === c), fr = frames(p.rolls), ry = y + 6 + c * rh, on = p === this.cur && !done, col = T.p[c];
      if (on) G.rrect(x + 6, ry + 2, 1788, rh - 4, 10, T.pSoft[c]);
      G.marker(c, x + 34, ry + rh / 2, 11); G.text(NAME[c], x + 58, ry + rh / 2 + 9, { size: FS.sm, weight: 700, color: on ? T.text : T.muted });
      let fx = x + nw;
      fr.forEach((q, f) => {
        const w = f === 9 ? 180 : fw, live = on && this.turn && !this.turn.ro && this.turn.f === f;
        G.rrect(fx + 3, ry + 5, w - 6, rh - 10, 8, live ? 'rgba(255,255,255,0.07)' : null, live ? col : T.line2, live ? 3 : 2);
        G.text(marks(q, f).join('  '), fx + w - 16, ry + 31, { size: FS.xs, weight: 500, mono: true, align: 'right' });
        if (q.total != null) G.text(String(q.total), fx + 16, ry + 60, { size: FS.xs, weight: 700, mono: true });
        fx += w;
      });
      G.text(String(shown(p.rolls)), x + 1800 - tw + 96, ry + rh / 2 + 13, { size: FS.md, weight: 700, mono: true, align: 'right', color: on ? col : T.text });
      G.text('max ' + final(fill(p.rolls, true)), x + 1800 - 22, ry + rh / 2 + 9, { size: FS.xs, mono: true, align: 'right', color: T.faint });
    });
    // the line under the card
    const a = P.find(q => q.c === 0), b = P.find(q => q.c === 1), sa = shown(a.rolls), sb = shown(b.rolls); let msg;
    const r = this.ro[this.ro.length - 1];
    if (r) msg = `Roll-off ${this.ro.length} of 3: Blue ${r[a.n] == null ? 'to bowl' : r[a.n]}, Amber ${r[b.n] == null ? 'to bowl' : r[b.n]}`;
    else {
      const lead = P[this.order[0]], chase = P[this.order[1]];
      if (frames(lead.rolls)[9].done && !frames(chase.rolls)[9].done) {
        const need = final(lead.rolls) + 1 - final(fill(chase.rolls, false)), can = final(fill(chase.rolls, true)) > final(lead.rolls);
        msg = need <= 0 ? `${NAME[chase.c]} is in front` : can ? `${NAME[chase.c]} needs ${need} more to win` : `${NAME[chase.c]} cannot catch ${NAME[lead.c]}`;
      } else msg = sa === sb ? 'Level' : `${NAME[sa > sb ? 0 : 1]} leads by ${Math.abs(sa - sb)}`;
    }
    const mw = G.measure(msg, { size: FS.xs, weight: 500 }) + 56;
    G.rrect(W / 2 - mw / 2, y + rh * 2 + 22, mw, 44, 22, 'rgba(7,9,13,0.86)', T.line2); G.text(msg, W / 2, y + rh * 2 + 52, { size: FS.xs, weight: 500, align: 'center' });
  }
  flat(x, y, w, h, full) {                                     // a top-down view of the colliders: the F4 inset, and the whole picture if there is no WebGL
    const c = this.k.c, ph = this.ph, d0 = full ? HEAD - 5.4 : HEAD - 1.6, d1 = PIT, sc = Math.min(h / (d1 - d0), w / ((LW + GW) * 2.2)), cx = x + w / 2, Y = d => y + h - (d - d0) * sc;
    G.rrect(x, y, w, h, 14, 'rgba(7,9,13,0.92)', T.line2);
    c.fillStyle = '#B9966A'; c.fillRect(cx - LW * sc, Y(DECK), LW * 2 * sc, (DECK - d0) * sc);
    c.fillStyle = T.s1; for (const s of [-1, 1]) c.fillRect(cx + s * (LW + GW / 2) * sc - GW * sc / 2, Y(DECK), GW * sc, (DECK - d0) * sc);
    ph.pins.forEach((b, i) => { if (!b.on) return; const p = b.position, dn = ph.down(b); G.circle(cx + p.x * sc, Y(-p.z), 0.06 * sc, dn ? T.s3 : '#F4F2EC', dn ? T.muted : T.bad, 2); });
    const pts = this.guide(); for (let i = 1; i < pts.length; i++) if (pts[i].d > d0) G.line(cx + pts[i - 1].x * sc, Y(Math.max(d0, pts[i - 1].d)), cx + pts[i].x * sc, Y(pts[i].d), T.p[this.cur.c], 3);
    const bb = ph.ball; if (bb.on && -bb.position.z > d0) G.circle(cx + bb.position.x * sc, Y(-bb.position.z), BR * sc, T.p[this.cur.c]);
    else if (this.state === 'stance' || this.state === 'swing') G.marker(this.cur.c, cx + this.x0 * sc, y + h - 16, 9);
  }
}

Couch.register({
  id: 'tenpin-grudge', players: 2, bots: true, best: 'high', scoreLabel: 'Winning score',
  line: 'Ten-pin bowling, head to head, in 3D.',
  how: ['Take turns, one frame each. The higher score after ten frames wins.',
    'Pull the right stick back, then push it forward to bowl. A straight push is an accurate ball.',
    'Steer the hook with the left stick while the ball rolls. It bites on the last third of the lane.'],
  controls: [['move', 'Step sideways, then hook the rolling ball'], ['lb', 'Aim left'], ['rb', 'Aim right'], ['aim', 'Pull back and push forward to bowl'], ['b', 'Cancel the swing'], ['start', 'Pause']],
  assistText: ['', 'Longer guide line, steadier release, more hook', 'Live path preview, bumpers up, steadiest release'],
  create: k => new Grudge(k),
});
})();
