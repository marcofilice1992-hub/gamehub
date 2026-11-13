/* ==========================================================================
   TENPIN GRUDGE · slot 14 · Cosy and long-form
   Head-to-head ten-pin bowling on one 3D lane. You take turns, one frame
   each: step sideways, turn the aim line, pull the right stick back and push
   it forward to bowl, then steer the hook while the ball rolls. The higher
   score after ten frames wins; a tie goes to a one-ball roll-off.
   Versus by Marco's choice: design rules 3 and 5 are waived for this slot.
   Draws with three.js and simulates with cannon-es, both from Couch.lib. The lane is glossy: pins and
   ball are drawn again upside down beneath it and seen through it as a reflection.

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
// A bowling hall built in code: the lane is glossy, so pins and ball are drawn a second time upside down beneath it
// and seen through it as a reflection. Neighbouring lanes, a lit masking unit and ceiling lights fill the frame.
const PITCH = 2 * (LW + GW) + 0.3;
function rand(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; }
function smooth(pts, per) {                                    // Catmull-Rom through [r, y] points, `per` steps between each pair
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < per; s++) { const t = s / per, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  out.push(pts[pts.length - 1]); return out;
}
class View {
  constructor() {
    const cv = this.cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no WebGL');
    const r = this.r = new THREE.WebGLRenderer({ canvas: cv, context: gl }); r.setPixelRatio(1);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const sc = this.scene = new THREE.Scene(), bg = new THREE.Color('#0A0914'); sc.background = bg; sc.fog = new THREE.Fog(bg, 26, 50);
    this.cam = new THREE.PerspectiveCamera(27, 16 / 9, 0.05, 80); this.pos = new THREE.Vector3(0, 1.7, 4.6); this.look = new THREE.Vector3(0, 0.1, -6);
    this.last = 0; this.size = 0; this.axis = new THREE.Vector3(); this.turn = new THREE.Quaternion(); this.sweepK = 0;
    const len = DECK + 1.5, mid = (DECK - 1.5) / 2, far = LW + GW, add = (m, x, y, d) => { m.position.set(x, y, -d); sc.add(m); return m; };
    const mat = (color, roughness, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...o });

    // Image-based light: a dark room with bright ceiling strips, so the ball, pins and lane catch believable highlights
    const pm = new THREE.PMREMGenerator(r), room = new THREE.Scene(), dispose = [];
    const rm = (geo, m, x, y, z, rx) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; room.add(o); dispose.push(geo, m); };
    rm(new THREE.BoxGeometry(24, 7, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.014, 0.02), side: THREE.BackSide }), 0, 3, -10);
    for (let i = 0; i < 9; i++) rm(new THREE.PlaneGeometry(10, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.2, 5.6), side: THREE.DoubleSide }), 0, 6.3, -28 + i * 5, Math.PI / 2);
    rm(new THREE.PlaneGeometry(12, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.55), side: THREE.DoubleSide }), 0, 2, 11);   // warm glow from the bar behind you
    rm(new THREE.PlaneGeometry(12, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.0, 1.3), side: THREE.DoubleSide }), 0, 1.2, -31);
    for (const s of [-1, 1]) for (const [y, c3] of [[1, [4, 0.9, 3.4]], [2.7, [2.2, 1.7, 4]]]) rm(new THREE.BoxGeometry(0.15, 0.12, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c3) }), s * 11.5, y, -10);   // the neon tubes on the side walls
    rm(new THREE.PlaneGeometry(9, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.7, 2.6), side: THREE.DoubleSide }), 0, 2.1, -31.4);   // the sign
    this.env = pm.fromScene(room, 0.03).texture; sc.environment = this.env; sc.environmentIntensity = 0.55; pm.dispose(); for (const o of dispose) o.dispose();

    // Lights: a key light from the ceiling, a hard light hidden in the masking unit over the pin deck, a little fill
    sc.add(new THREE.HemisphereLight(0xc9c4ff, 0x1a1020, 0.45));
    const sun = new THREE.DirectionalLight(0xfff1df, 1.5); sun.position.set(1.4, 9, 3); sun.target.position.set(0, 0, -10); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 15, bottom: -15, near: 2, far: 24 }); sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(1024, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.01; sun.shadow.radius = 3; sc.add(sun, sun.target);
    const deck = new THREE.SpotLight(0xfff6ea, 3.5, 6, 0.8, 0.7, 2); deck.position.set(0, 0.95, -(DECK + 0.1)); deck.target.position.set(0, 0, -(HEAD + 0.25));
    deck.castShadow = true; deck.shadow.mapSize.set(1024, 1024); deck.shadow.bias = -0.0004; deck.shadow.normalBias = 0.01; deck.shadow.radius = 3; deck.shadow.camera.near = 0.2; sc.add(deck, deck.target);
    const front = new THREE.SpotLight(0xffe8cc, 4, 9, 0.5, 0.8, 2); front.position.set(0, 3, 0.5); front.target.position.set(0, 0, -3); sc.add(front, front.target);   // keeps the approach and the ball in hand lit
    const decks = new THREE.SpotLight(0xfff1e4, 6, 4.4, 1.35, 0.5, 2); decks.position.set(0, 1.3, -(DECK + 0.4)); decks.target.position.set(0, 0, -(HEAD + 0.2)); sc.add(decks, decks.target);   // the neighbours' pin decks
    for (const s of [-1, 1]) for (const [d, col] of [[4, '#8B6CFF'], [13, '#FF4FD8']]) { const pl = new THREE.PointLight(col, 7, 7.5, 2); pl.position.set(s * (3.5 * PITCH - 0.7), 1.7, -d); sc.add(pl); }   // neon spill from the walls
    const sp = new THREE.PointLight('#FF4FD8', 3.5, 5, 2); sp.position.set(0, 2.1, -(DECK - 0.3)); sc.add(sp);   // and from the sign over the masking units

    // The lane: maple and pine boards with their grain, the inlaid dots, arrows and range finders, pin spots
    const TW = 512, TH = 4096, [tex, c] = canvas(TW, TH), R = rand(7), py = d => (1 - (d + 1.5) / len) * TH, px = x => (x / LW * 0.5 + 0.5) * TW, bw = TW / 39;
    for (let i = 0; i < 39; i++) {
      const n = R(), x0 = i * bw, pine = [[0, 4.9], [HEAD - 0.5, len]];
      const g = c.createLinearGradient(0, 0, 0, TH);
      g.addColorStop(0, `hsl(${33 + n * 4} ${48 + n * 8}% ${70 + n * 6}%)`); g.addColorStop(py(HEAD - 0.5) / TH, `hsl(${33 + n * 4} ${48 + n * 8}% ${70 + n * 6}%)`);
      g.addColorStop(py(HEAD - 1.5) / TH, `hsl(${30 + n * 5} ${50 + n * 10}% ${66 + n * 7}%)`); g.addColorStop(py(6.5) / TH, `hsl(${30 + n * 5} ${50 + n * 10}% ${66 + n * 7}%)`);
      g.addColorStop(py(4.5) / TH, `hsl(${34 + n * 4} ${46 + n * 8}% ${71 + n * 6}%)`); g.addColorStop(1, `hsl(${30 + n * 4} ${40 + n * 8}% ${58 + n * 6}%)`);
      c.fillStyle = g; c.fillRect(x0, 0, bw + 1, TH); void pine;
      for (let k = 0; k < 6; k++) {                            // grain: long wobbling streaks
        let gx = x0 + R() * bw; c.beginPath(); c.moveTo(gx, 0);
        for (let y = 0; y <= TH; y += 96) { gx = U.clamp(gx + (R() - 0.5) * 1.6, x0 + 0.5, x0 + bw - 0.5); c.lineTo(gx, y); }
        c.strokeStyle = `rgba(${R() < 0.5 ? '90,50,20' : '255,240,210'},${0.06 + R() * 0.1})`; c.lineWidth = 0.6 + R() * 1.6; c.stroke();
      }
      c.fillStyle = 'rgba(60,32,12,0.35)'; c.fillRect(x0, 0, 1, TH);
    }
    c.fillStyle = 'rgba(30,18,8,0.18)'; c.fillRect(0, py(0), TW, TH - py(0));                      // the approach is a shade darker
    c.fillStyle = '#20160E'; c.fillRect(0, py(0) - 3, TW, 6);                                       // foul line
    const inlay = '#3A2414';
    c.fillStyle = inlay;
    for (let i = -3; i <= 3; i++) {
      const ax = px(i * 5 * LW / 19.5), ay = py(4.57 + (3 - Math.abs(i)) * 0.3);
      c.beginPath(); c.moveTo(ax, ay - 30); c.lineTo(ax + 6, ay + 16); c.lineTo(ax - 6, ay + 16); c.closePath(); c.fill();   // arrows, the middle one furthest down
      for (const d of [2.13, -0.35, -1.2]) { c.beginPath(); c.arc(ax, py(d), 3.2, 0, 7); c.fill(); }                  // dots on the lane and the approach
    }
    for (const s of [-1, 1]) { const ax = px(s * 10 * LW / 19.5); c.fillRect(ax - 2, py(12.2), 4, py(10.4) - py(12.2)); }   // range finders
    c.fillStyle = 'rgba(40,22,10,0.55)'; for (const s of SPOTS) { c.beginPath(); c.ellipse(px(s.x), py(s.d), 6.5, 3, 0, 0, 7); c.fill(); }
    const map = new THREE.CanvasTexture(tex); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 16;
    // Oil: glossy and more reflective for 12 m, then dry boards. Green carries roughness; the alpha map sets how much reflection shows.
    const [rt, rc] = canvas(4, 512), [at, ac] = canvas(4, 512), ry = d => (1 - (d + 1.5) / len) * 512;
    for (let y = 0; y < 512; y++) {
      const d = (1 - y / 512) * len - 1.5, oil = d < 0 ? 0 : d < 12 ? 1 : d < 13.5 ? 1 - (d - 12) / 1.5 : 0, deckd = d > HEAD - 0.5 ? 1 : 0;
      const rough = d < 0 ? 0.5 : 0.52 - 0.4 * oil + 0.06 * deckd, alpha = d < 0 ? 0.97 : 0.95 - 0.1 * oil;
      rc.fillStyle = `rgb(0,${Math.round(rough * 255)},0)`; rc.fillRect(0, y, 4, 1); ac.fillStyle = `rgb(0,${Math.round(alpha * 255)},0)`; ac.fillRect(0, y, 4, 1);
    }
    void ry;
    const laneMat = mat(new THREE.Color(1.12, 1.12, 1.12), 1, { map, roughnessMap: new THREE.CanvasTexture(rt), alphaMap: new THREE.CanvasTexture(at), transparent: true, envMapIntensity: 1.4 });
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(LW * 2, len), laneMat); lane.rotation.x = -Math.PI / 2; lane.receiveShadow = true; lane.renderOrder = 1; add(lane, 0, 0, mid);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(PITCH * 7, 80), new THREE.MeshBasicMaterial({ color: 0x020304 })); under.rotation.x = -Math.PI / 2; add(under, 0, -0.8, 10);

    // Gutters (shallow half-pipes), capping, kickbacks with artwork; three neighbouring lanes each side, with racked pins
    const NL = 3, HALL = (NL + 0.5) * PITCH, MAG = '#FF4FD8', VIO = '#8B6CFF';
    const R2 = 0.168, half = Math.asin(GW / 2 / R2), gutGeo = new THREE.CylinderGeometry(R2, R2, len, 20, 1, true, -half, half * 2); gutGeo.rotateX(Math.PI / 2);
    const gutMat = mat('#2A303B', 0.32, { metalness: 0.55, side: THREE.DoubleSide }), capMat = mat('#1C222C', 0.28, { metalness: 0.2 }), sideLane = mat(new THREE.Color(0.62, 0.62, 0.66), 0.32, { map, envMapIntensity: 0.8 });
    // kickback art: a dark violet panel with neon slashes
    const [kt, kc] = canvas(1024, 300), kg = kc.createLinearGradient(0, 0, 0, 300); kg.addColorStop(0, '#1A1530'); kg.addColorStop(1, '#0A0912'); kc.fillStyle = kg; kc.fillRect(0, 0, 1024, 300);
    kc.lineCap = 'round';
    for (const [x, col, w] of [[180, MAG, 14], [250, VIO, 8], [560, VIO, 14], [620, MAG, 6], [880, MAG, 10]]) { kc.shadowColor = col; kc.shadowBlur = 30; kc.strokeStyle = col; kc.lineWidth = w; kc.beginPath(); kc.moveTo(x, 330); kc.lineTo(x + 160, -30); kc.stroke(); }
    kc.shadowBlur = 0; kc.fillStyle = 'rgba(255,255,255,0.06)'; for (let y = 0; y < 300; y += 6) kc.fillRect(0, y, 1024, 1);
    const ktex = new THREE.CanvasTexture(kt); ktex.colorSpace = THREE.SRGBColorSpace;
    const kMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.5, emissive: 0xffffff, emissiveMap: ktex, emissiveIntensity: 0.7 }), kBox = mat('#12101C', 0.6);
    const [gv, gvc] = canvas(4, 128), [gh, ghc] = canvas(128, 4), [gr, grc] = canvas(128, 128);
    for (const [cx3, w3, h3, vert] of [[gvc, 4, 128, 1], [ghc, 128, 4, 0]]) { const lg = vert ? cx3.createLinearGradient(0, 0, 0, h3) : cx3.createLinearGradient(0, 0, w3, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); cx3.fillStyle = lg; cx3.fillRect(0, 0, w3, h3); }
    const rg = grc.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); grc.fillStyle = rg; grc.fillRect(0, 0, 128, 128);
    const [gvt, ght, grt] = [gv, gh, gr].map(cv2 => new THREE.CanvasTexture(cv2));
    const glow = (col, k, tex) => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.leds = []; this.ledGlow = glow('#ffffff', 0.5, ght);
    for (let n = -NL; n <= NL; n++) {
      const cx = n * PITCH;
      for (const s of [-1, 1]) { const g2 = add(new THREE.Mesh(gutGeo, gutMat), cx + s * (LW + GW / 2), R2 - 0.048, mid); g2.receiveShadow = true; }
      if (n) { const l2 = new THREE.Mesh(new THREE.PlaneGeometry(LW * 2, len), sideLane); l2.rotation.x = -Math.PI / 2; l2.receiveShadow = true; add(l2, cx, 0, mid); }
      if (n < NL) {                                                                                 // capping between this lane and the next
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, DECK + 1.5), capMat); cap.receiveShadow = true; add(cap, cx + PITCH / 2, 0.03, mid);
        if (n === -1 || n === 0) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, DECK + 1.5), new THREE.MeshBasicMaterial({ color: T.p[0] })); add(led, cx + PITCH / 2 + (n ? 0.14 : -0.14), 0.062, mid); this.leds.push(led); const lg2 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, DECK + 1.5).rotateX(-Math.PI / 2), this.ledGlow); lg2.renderOrder = 3; add(lg2, cx + PITCH / 2 + (n ? 0.12 : -0.12), 0.064, mid); }
      }
      for (const s of [-1, 1]) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 3.4), kBox); k.receiveShadow = true; add(k, cx + s * (far + 0.03), 0.34, DECK - 0.5);
        const art = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.68), kMat); art.rotation.y = -s * Math.PI / 2; art.receiveShadow = true; add(art, cx + s * (far - 0.001), 0.34, DECK - 0.5);
      }
    }
    // side walls: dark panels, pilasters and two neon tubes running the length of the hall
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(DECK + 14, 4.6), mat('#0D0C17', 0.8)); wall.rotation.y = -s * Math.PI / 2; add(wall, s * HALL, 2.2, (DECK - 14) / 2 + 0.3);
      for (const [y, col] of [[0.95, MAG], [2.7, VIO]]) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, DECK + 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6) })), s * (HALL - 0.24), y, (DECK - 14) / 2 + 0.3);
      for (const [y, col] of [[0.95, MAG], [2.7, VIO]]) { const h2 = new THREE.Mesh(new THREE.PlaneGeometry(DECK + 14, 0.9), glow(col, 0.32, gvt)); h2.rotation.y = -s * Math.PI / 2; h2.renderOrder = 3; add(h2, s * (HALL - 0.27), y, (DECK - 14) / 2 + 0.3); }
      for (let d = -6; d < DECK; d += 4) add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.6, 0.5), mat('#15132A', 0.6)), s * (HALL - 0.1), 2.2, d);
    }
    const approach = new THREE.Mesh(new THREE.BoxGeometry(HALL * 2, 0.1, 12), mat('#221A24', 0.8)); add(approach, 0, -0.05, -7.5);   // the floor behind the foul lines
    // pit: a black fabric curtain with soft folds
    add(new THREE.Mesh(new THREE.BoxGeometry(HALL * 2, 0.02, 1.4), mat('#050608', 0.9)), 0, -0.34, DECK + 0.7);
    const [ct, cc2] = canvas(1024, 64); for (let x = 0; x < 1024; x++) { const v = 10 + 9 * Math.sin(x / 1024 * Math.PI * 2 * 70) ** 2; cc2.fillStyle = `rgb(${v},${v},${v + 4})`; cc2.fillRect(x, 0, 1, 64); }
    const ctex = new THREE.CanvasTexture(ct); ctex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.Mesh(new THREE.PlaneGeometry(HALL * 2, 1.8), mat(0xffffff, 1, { map: ctex })), 0, 0.4, PIT + 0.08);
    // masking units: one screen per lane, all in the same layout. Lane 14 follows the match; the others follow their own bowlers.
    const lanes = 2 * NL + 1;
    add(new THREE.Mesh(new THREE.BoxGeometry(PITCH * lanes, 0.98, 0.12), mat('#08070F', 0.7)), 0, 1.13, DECK + 0.2);       // the fascia the screens sit in
    this.boards = new Map();
    for (let n = -NL; n <= NL; n++) {
      const [cv3, c3] = canvas(n ? 512 : 1024, n ? 256 : 512), tex3 = new THREE.CanvasTexture(cv3); tex3.colorSpace = THREE.SRGBColorSpace; tex3.anisotropy = 8;
      add(new THREE.Mesh(new THREE.PlaneGeometry(PITCH - 0.1, (PITCH - 0.1) / 2), new THREE.MeshBasicMaterial({ map: tex3 })), n * PITCH, 1.13, DECK + 0.135);
      this.boards.set(n, { c: c3, w: cv3.width, tex: tex3, key: '' });
    }
    this.dkey = '';
    // above the masking units: the hall's neon sign
    const SW = 4096, [st2, sc2] = canvas(SW, 300);
    sc2.fillStyle = '#08070F'; sc2.fillRect(0, 0, SW, 300); sc2.textAlign = 'center'; sc2.textBaseline = 'middle';
    const neon = (draw, col, w) => { for (const [b, a, lw] of [[60, 0.9, w * 2.4], [22, 1, w * 1.3], [0, 1, w * 0.55]]) { sc2.shadowColor = col; sc2.shadowBlur = b; sc2.globalAlpha = a; sc2.strokeStyle = lw < w ? '#FFF4FD' : col; sc2.lineWidth = lw; draw(); } sc2.shadowBlur = 0; sc2.globalAlpha = 1; };
    sc2.font = 'italic 800 150px Geist, "Segoe UI", sans-serif';
    neon(() => sc2.strokeText('TENPIN GRUDGE', SW / 2, 150), MAG, 7);
    for (const s of [-1, 1]) {
      const cx2 = SW / 2 + s * 900;
      neon(() => { sc2.beginPath(); sc2.ellipse(cx2, 205, 34, 58, 0, 0, 7); sc2.moveTo(cx2 + 18, 100); sc2.ellipse(cx2, 100, 18, 40, 0, 0, 7); sc2.stroke(); }, VIO, 6);
      neon(() => { sc2.beginPath(); sc2.arc(cx2 + s * 120, 180, 60, 0, 7); sc2.stroke(); }, VIO, 6);
      neon(() => { sc2.beginPath(); sc2.moveTo(cx2 + s * 300, 150); sc2.lineTo(cx2 + s * 1100, 150); sc2.stroke(); }, MAG, 4);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(PITCH * 4.2, 1.5), glow(MAG, 0.22, grt)); halo.renderOrder = 3; add(halo, 0, 1.6 + PITCH * lanes * 150 / SW, DECK + 0.19);
    this.dglowMat = glow('#ffffff', 0.15, grt); const dglow = new THREE.Mesh(new THREE.PlaneGeometry(PITCH * 1.9, 1.6), this.dglowMat); dglow.renderOrder = 3; add(dglow, 0, 1.13, DECK + 0.125);   // the lane 14 screen glows in the bowler's colour
    const stex = new THREE.CanvasTexture(st2); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = 8;
    add(new THREE.Mesh(new THREE.PlaneGeometry(PITCH * lanes, PITCH * lanes * 300 / SW), new THREE.MeshBasicMaterial({ map: stex })), 0, 1.6 + PITCH * lanes * 150 / SW, DECK + 0.2);
    add(new THREE.Mesh(new THREE.BoxGeometry(HALL * 2, 3, 0.1), mat('#08070F', 1)), 0, 3.1, DECK + 0.26);
    this.strip = add(new THREE.Mesh(new THREE.BoxGeometry(far * 2 + 0.3, 0.05, 0.13), new THREE.MeshBasicMaterial({ color: T.text })), 0, 0.66, DECK + 0.2);
    // ceiling: strips of light running across the hall, fading into the dark
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(HALL * 2 - 0.4, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.65, 1.8) }), 12), o3 = new THREE.Object3D();
    for (let i = 0; i < 12; i++) { o3.position.set(0, 4.2, -3 - i * 2.4); o3.updateMatrix(); lights.setMatrixAt(i, o3.matrix); } sc.add(lights);
    add(new THREE.Mesh(new THREE.PlaneGeometry(HALL * 2, 40).rotateX(Math.PI / 2), mat('#06050C', 1)), 0, 4.26, 12);
    this.bumpers = [-1, 1].map(s => add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, DECK), this.strip.material), s * (LW + 0.002), 0.03, DECK / 2));
    // pinsetter sweep bar
    this.sweep = add(new THREE.Mesh(new THREE.BoxGeometry(far * 2, 0.05, 0.02), mat('#A3ACBB', 0.45, { metalness: 0.1 })), 0, 1.2, HEAD - 0.4); this.sweep.castShadow = true;
    this.NL = NL;

    // Pins: a smooth lathe profile, glossy white with two red neck stripes
    const prof = smooth([[0.026, 0], [0.031, 0.012], [0.046, 0.06], [0.0585, 0.105], [0.0605, 0.127], [0.057, 0.16], [0.045, 0.2], [0.032, 0.236], [0.0255, 0.262], [0.0238, 0.282],
      [0.0255, 0.3], [0.031, 0.322], [0.0325, 0.338], [0.03, 0.358], [0.021, 0.373], [0.0001, 0.381]], 6);
    prof.unshift([0.0001, 0]);
    const pg = new THREE.LatheGeometry(prof.map(([rr, y]) => new THREE.Vector2(Math.max(0.0001, rr), y)), 40); pg.translate(0, -COG, 0);
    const [pt, pc] = canvas(64, 1024); pc.fillStyle = '#F7F4EE'; pc.fillRect(0, 0, 64, 1024);
    prof.forEach(([, y], i) => { if ((y > 0.249 && y < 0.262) || (y > 0.271 && y < 0.284)) { pc.fillStyle = '#C81E2C'; pc.fillRect(0, 1024 - (i / (prof.length - 1)) * 1024 - 6, 64, 12); } });
    const ptex = new THREE.CanvasTexture(pt); ptex.colorSpace = THREE.SRGBColorSpace;
    const pm2 = new THREE.MeshPhysicalMaterial({ map: ptex, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 });
    this.pins = SPOTS.map(() => { const m = new THREE.Mesh(pg, pm2); m.castShadow = true; m.receiveShadow = true; sc.add(m); return m; });
    // the other bowlers in the hall: every so often someone rolls a ball on a neighbouring lane
    const R5 = rand(97), cols = ['#9B5CFF', '#20C997', '#E64980', '#4DD4FF', '#F8F0E3', '#5C7CFA', '#FF8787'];
    this.racks = new THREE.InstancedMesh(pg, pm2, 60); this.racks.receiveShadow = true; this.racks.castShadow = true; sc.add(this.racks); this.o3 = o3; this.R = R5;
    this.nb = [-3, -2, -1, 1, 2, 3].map((n, li) => ({ n, li, state: 'idle', t: 3 + R5() * 10, pins: SPOTS.map(() => ({ k: 0, down: false })) }));
    const nbg = new THREE.SphereGeometry(BR, 32, 20); this.pool = [0, 1].map(() => { const m = new THREE.Mesh(nbg, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })); m.castShadow = true; m.visible = false; sc.add(m); return m; });
    this.cols = cols; this.rackAll();
    const who = ['Kai', 'Mel', 'Juno', 'Raff', 'Tess', 'Otto'];
    this.nb.forEach((L, i) => { L.who = who[i]; L.rolls = []; this.play(L, 2 + Math.floor(R5() * 5)); this.neighbourBoard(L); });

    // The ball: a swirled pearl in the bowler's colour with their mark and three finger holes
    this.skins = [0, 1].map(i => {
      const [bt, b] = canvas(1024, 512), R3 = rand(11 + i * 5), base = new THREE.Color(T.p[i]);
      b.fillStyle = T.p[i]; b.fillRect(0, 0, 1024, 512);
      for (let k = 0; k < 26; k++) {
        const light = R3() < 0.5, f = 1 + Math.floor(R3() * 3), ph = R3() * 7, y0 = R3() * 512, amp = 30 + R3() * 120;
        b.beginPath(); for (let x = -20; x <= 1044; x += 16) b.lineTo(x, y0 + Math.sin(x / 1024 * 2 * Math.PI * f + ph) * amp);
        const cc = base.clone().lerp(new THREE.Color(light ? '#FFFFFF' : '#1A2030'), light ? 0.2 + R3() * 0.35 : 0.12 + R3() * 0.2);
        b.strokeStyle = '#' + cc.getHexString(); b.globalAlpha = 0.5; b.lineWidth = 10 + R3() * 50; b.stroke();
      }
      b.globalAlpha = 1; b.filter = 'blur(9px)'; b.drawImage(bt, 0, 0); b.filter = 'none';
      for (let k = 0; k < 40; k++) { b.beginPath(); const y0 = R3() * 512, f = 1 + Math.floor(R3() * 4), ph = R3() * 7; for (let x = 0; x <= 1024; x += 16) b.lineTo(x, y0 + Math.sin(x / 1024 * 2 * Math.PI * f + ph) * 60); b.strokeStyle = 'rgba(255,255,255,0.10)'; b.lineWidth = 1 + R3() * 2; b.stroke(); }
      const hole = (x, y, rr) => { const g3 = b.createRadialGradient(x, y, 0, x, y, rr * 1.25); g3.addColorStop(0, '#000'); g3.addColorStop(0.72, '#05070B'); g3.addColorStop(0.8, 'rgba(255,255,255,0.35)'); g3.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = g3; b.beginPath(); b.arc(x, y, rr * 1.25, 0, 7); b.fill(); };
      hole(256, 300, 20); hole(240, 205, 15); hole(274, 205, 15);
      b.fillStyle = '#F4F6FA'; b.beginPath();
      if (i === 0) b.arc(768, 256, 42, 0, 7); else { b.moveTo(768, 200); b.lineTo(818, 256); b.lineTo(768, 312); b.lineTo(718, 256); b.closePath(); }
      b.fill(); b.strokeStyle = 'rgba(244,246,250,0.6)'; b.lineWidth = 4; b.beginPath(); b.arc(768, 256, 70, 0, 7); b.stroke();
      const m = new THREE.CanvasTexture(bt); m.colorSpace = THREE.SRGBColorSpace; m.anisotropy = 8;
      return new THREE.MeshPhysicalMaterial({ map: m, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 });
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 48, 32), this.skins[0]); this.ball.castShadow = true; sc.add(this.ball);

    // The reflection: the same pins and ball, mirrored under the lane and seen through it
    this.mir = new THREE.Group(); this.mir.scale.y = -1; sc.add(this.mir);
    this.mpins = this.pins.map(() => { const m = new THREE.Mesh(pg, pm2); this.mir.add(m); return m; });
    this.mball = new THREE.Mesh(this.ball.geometry, this.skins[0]); this.mir.add(this.mball);

    // the guide: a ribbon on the boards
    this.N = 140; const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 6), 3));
    const ix = []; for (let i = 0; i < this.N - 1; i++) ix.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); gg.setIndex(ix);
    this.guide = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: T.text, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.guide.frustumCulled = false; this.guide.renderOrder = 2; sc.add(this.guide);
  }
  rackAll() { for (const L of this.nb) this.rack(L, true); }
  rack(L, stand) {                                             // write one neighbouring lane's ten pins into the instanced mesh
    const o = this.o3, cx = L.n * PITCH;
    L.pins.forEach((p, i) => {
      const s2 = SPOTS[i];
      if (stand) { p.k = 0; p.down = false; }
      const e = p.k * p.k * (3 - 2 * p.k);
      o.position.set(cx + s2.x + (p.dx || 0) * e, COG - (COG - 0.06) * e, -(s2.d + (p.dd || 0) * e));
      if (p.ax) o.quaternion.setFromAxisAngle(this.axis.set(p.ax, 0, p.az).normalize(), e * 1.48); else o.quaternion.set(0, 0, 0, 1);
      o.scale.setScalar(p.gone ? 0 : 1); o.updateMatrix(); this.racks.setMatrixAt(L.li * 10 + i, o.matrix);
    });
    this.racks.instanceMatrix.needsUpdate = true;
  }
  play(L, n, first) {                                          // a neighbour's frames, made up: the first ball from the animation if there was one
    const R = this.R;
    for (let i = 0; i < n; i++) {
      if (frames(L.rolls)[9].done) L.rolls = [];
      const a = first != null && i === 0 ? first : R() < 0.35 ? 10 : 6 + Math.floor(R() * 4); L.rolls.push(a);
      const fr = frames(L.rolls), f = fr.findIndex(q => !q.done);
      if (f >= 0 && a < 10) L.rolls.push(R() < 0.5 ? 10 - a : Math.floor(R() * (10 - a)));
      if (f === 9) while (!frames(L.rolls)[9].done) L.rolls.push(Math.min(standing(L.rolls), 6 + Math.floor(R() * 5)));
    }
  }
  neighbours(dt) {
    const R = this.R;
    for (const L of this.nb) {
      L.t -= dt;
      if (L.state === 'idle' && L.t <= 0) {
        const ball = this.pool.find(b => !b.visible); if (!ball) { L.t = 2; continue; }
        ball.material.color.set(this.cols[Math.floor(R() * this.cols.length)]); ball.visible = true;
        Object.assign(L, { state: 'roll', ball, x: 0.12 + (R() - 0.5) * 0.35, vx: 0.15 + R() * 0.15, d: 0.2, v: 6.8 + R() * 2.2, t: 0 });
      } else if (L.state === 'roll' || L.state === 'fall') {
        L.d += L.v * dt; if (L.d > 12 && L.state === 'roll') L.vx -= 0.5 * dt; L.x += L.vx * dt;
        const b = L.ball; b.visible = L.d < DECK + 0.4; b.position.set(L.n * PITCH + L.x, BR, -L.d); b.rotateX(-L.v * dt / BR);
        if (L.state === 'roll' && L.d >= HEAD - 0.12) {             // impact: a strike now and then, otherwise most of the rack
          L.state = 'fall'; L.t = 0; const strike = R() < 0.4 || Math.abs(L.x - 0.07) < 0.05, keep = strike ? 0 : 1 + Math.floor(R() * 4), order = SPOTS.map((_, i) => i).sort(() => R() - 0.5);
          L.pins.forEach((p, i) => { const s2 = SPOTS[i], fx = s2.x - L.x, fd = s2.d - HEAD + 0.25, m = Math.hypot(fx, fd) || 1;
            Object.assign(p, { down: !order.slice(0, keep).includes(i), delay: (s2.d - HEAD) * 0.4 + R() * 0.08, dx: (fx / m) * 0.3 + (R() - 0.5) * 0.15, dd: (fd / m) * 0.35, ax: fd / m + (R() - 0.5) * 0.6, az: -fx / m + (R() - 0.5) * 0.6, k: 0 }); });
          this.play(L, 1, 10 - keep); this.neighbourBoard(L);
          const pan = U.clamp(L.n / 3, -1, 1) * 0.85;
          for (let j = 0; j < 4; j++) Sfx.play('tg-pin', { vol: 0.025 + R() * 0.03, pan, delay: j * 0.05 + R() * 0.05, pitch: 0.8 + R() * 0.3 });
        }
        if (L.state === 'fall') {
          L.t += dt; for (const p of L.pins) if (p.down) p.k = U.clamp((L.t - p.delay) / 0.45, 0, 1);
          if (L.t > 3.2) { L.state = 'sweep'; L.t = 0.8; for (const p of L.pins) p.gone = p.down; b.visible = false; }
          this.rack(L, false);
        }
      } else if (L.state === 'sweep' && L.t <= 0) { for (const p of L.pins) { p.gone = false; delete p.ax; } this.rack(L, true); L.state = 'idle'; L.t = 6 + R() * 16; }
    }
  }
  // One lane screen. o: { lane, name, sub, rolls, score, accent, mark (0 circle, 1 diamond, or none), live (frame index to outline), main }
  board(n, o) {
    const B = this.boards.get(n), key = JSON.stringify(o); if (key === B.key) return; B.key = key;
    const c = B.c, k = B.w / 512; c.setTransform(k, 0, 0, k, 0, 0);
    const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    c.fillStyle = '#05040A'; c.fillRect(0, 0, 512, 256);
    const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#1A1834'); g.addColorStop(1, '#0B0A17');
    rr(5, 5, 502, 246, 16); c.fillStyle = g; c.fill();
    c.save(); if (o.main) { c.shadowColor = o.accent; c.shadowBlur = 14; } c.strokeStyle = o.accent; c.globalAlpha = o.main ? 1 : 0.55; c.lineWidth = o.main ? 4 : 2.5; rr(5, 5, 502, 246, 16); c.stroke(); c.restore();
    // lane badge, then what is happening
    rr(20, 18, 72, 40, 10); c.fillStyle = o.accent; c.fill();
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = '800 28px Geist, "Segoe UI", sans-serif'; c.fillStyle = '#0B0A14'; c.fillText(String(o.lane), 56, 39);
    c.textAlign = 'right'; c.font = '600 18px Geist, "Segoe UI", sans-serif'; c.fillStyle = 'rgba(228,231,237,0.62)'; c.fillText(o.sub.toUpperCase(), 490, 39);
    // bowler and score
    let nx = 22;
    if (o.mark === 0 || o.mark === 1) { c.fillStyle = o.accent; c.beginPath(); if (o.mark === 0) c.arc(38, 108, 13, 0, 7); else { c.moveTo(38, 92); c.lineTo(54, 108); c.lineTo(38, 124); c.lineTo(22, 108); c.closePath(); } c.fill(); nx = 64; }
    c.textAlign = 'left'; c.font = '800 44px Geist, "Segoe UI", sans-serif'; c.fillStyle = o.main ? o.accent : '#ECEAF6'; c.fillText(o.name.toUpperCase(), nx, 110);
    if (o.score != null) { c.textAlign = 'right'; c.font = '700 58px "JetBrains Mono", Consolas, monospace'; c.fillStyle = '#F4F6FA'; c.fillText(String(o.score), 490, 110); }
    // ten frames: marks on top, running total underneath
    const fr = frames(o.rolls), bw = (468 - 9 * 4) / 10;
    fr.forEach((q, f) => {
      const x = 22 + f * (bw + 4), y = 160, on = f === o.live;
      rr(x, y, bw, 76, 6); c.fillStyle = on ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'; c.fill();
      c.strokeStyle = on ? o.accent : 'rgba(255,255,255,0.16)'; c.lineWidth = on ? 3 : 1.5; c.stroke();
      c.textAlign = 'center'; c.fillStyle = '#E4E7ED'; c.font = '600 20px "JetBrains Mono", Consolas, monospace'; c.fillText(marks(q, f).join(f === 9 ? '' : ' '), x + bw / 2, y + 22);
      if (q.total != null) { c.font = '700 22px "JetBrains Mono", Consolas, monospace'; c.fillStyle = '#F4F6FA'; c.fillText(String(q.total), x + bw / 2, y + 56); }
    });
    B.tex.needsUpdate = true;
  }
  display(g) {                                                 // the screen over lane 14: who is bowling, which frame, their score
    const t = g.turn, over = g.state === 'over', who = over && g.won >= 0 ? g.P[g.won] : g.cur, c = who.c;
    const sub = over ? 'Final' : g.state === 'intro' ? 'First to bowl' : t && t.ro ? 'Roll-off ' + t.ro : t ? `Frame ${t.f + 1} · Ball ${t.b + 1}` : '';
    this.board(0, { lane: 14, name: over ? (g.won < 0 ? 'A draw' : NAME[c] + ' wins') : NAME[c], sub, rolls: who.rolls, score: shown(who.rolls), accent: over && g.won < 0 ? '#E4E7ED' : T.p[c], mark: over && g.won < 0 ? null : c, live: over || !t || t.ro || who !== g.cur ? -1 : t.f, main: true });
  }
  neighbourBoard(L) { const fr = frames(L.rolls), f = fr.findIndex(q => !q.done); this.board(L.n, { lane: 14 + L.n, name: L.who, sub: f < 0 ? 'Final' : 'Frame ' + (f + 1), rolls: L.rolls, score: shown(L.rolls), accent: L.n % 2 ? '#B49CFF' : '#FF7AE0', live: f, main: false }); }
  render(g) {
    const now = performance.now(), dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016); this.last = now;
    const want = U.clamp(Math.round(W * (Couch.Engine.scale || 1)), 960, 1920);
    if (want !== this.size) { this.size = want; this.r.setSize(want, Math.round(want * 9 / 16), false); }
    this.neighbours(Math.min(dt, 0.05)); this.display(g);
    const ph = g.ph, st = g.state, c = g.cur ? g.cur.c : 0, onLane = p => Math.abs(p.x) < LW - 0.02 && -p.z < DECK && -p.z > -1.4 && p.y > -0.05;
    const sink = (p, from) => 0.048 * U.clamp((Math.abs(p.x) - from) / 0.06, 0, 1);
    ph.pins.forEach((b, i) => {
      const m = this.pins[i], mm = this.mpins[i]; m.visible = b.on || b.loose;
      if (m.visible) { m.position.copy(b.position); m.position.y -= sink(b.position, LW + 0.02); m.quaternion.copy(b.quaternion); }
      mm.visible = m.visible && onLane(b.position); if (mm.visible) { mm.position.copy(m.position); mm.quaternion.copy(m.quaternion); }
    });
    const ball = this.ball; ball.material = this.mball.material = this.skins[c]; this.strip.material.color.set(T.p[c]); for (const l of this.leds) l.material.color.set(T.p[c]); this.ledGlow.color.set(T.p[c]).multiplyScalar(0.45); this.dglowMat.color.set(T.p[c]).multiplyScalar(0.15);
    for (const m of this.bumpers) m.visible = g.assist(g.cur) === 2 && st !== 'over';
    if (st === 'stance' || st === 'swing' || st === 'intro') {
      const h = st === 'swing' ? Math.min(1, g.sw.t / 0.8) : 0, e = h * h * (3 - 2 * h);
      ball.visible = st !== 'intro'; ball.position.set(g.x0, BR + 0.02 + e * 0.5, -START + e * 0.55); ball.quaternion.setFromAxisAngle(this.axis.set(1, 0, 0), -e * 2.2 - 0.6);
    } else {
      const b = ph.ball; ball.visible = b.on || b.loose;
      if (ball.visible) {
        ball.position.copy(b.position); ball.position.y -= sink(b.position, LW - 0.03);
        const v = b.velocity, sp = Math.hypot(v.x, v.z); if (sp > 0.05) { this.axis.set(-v.z / sp, -g.spin * 0.5, v.x / sp).normalize(); ball.quaternion.premultiply(this.turn.setFromAxisAngle(this.axis, -sp * dt * g.k.scale / BR)); }
      }
    }
    this.mball.visible = ball.visible && onLane(ball.position) && ball.position.y < 0.4; if (this.mball.visible) { this.mball.position.copy(ball.position); this.mball.quaternion.copy(ball.quaternion); }
    // the sweep bar comes down as the pins are cleared, and lifts as the next ball begins
    const want2 = st === 'show' ? (g.t > g.hold - 0.55 ? 1 : 0) : st === 'stance' && g.t < 0.35 && g.n > 1 ? 1 : 0;
    this.sweepK += (want2 - this.sweepK) * (1 - Math.exp(-9 * dt)); this.sweep.visible = this.sweepK > 0.01; this.sweep.position.y = 1.2 - this.sweepK * 1.0;
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
  dispose() { try { this.env.dispose(); this.r.dispose(); this.r.forceContextLoss(); } catch (e) {} }
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
    if (this.view) {
      this.view.render(this); c.drawImage(this.view.cv, 0, 0, W, H);
      const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 1.05); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    } else this.flat(W / 2 - 330, 230, 660, 800, true);
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
