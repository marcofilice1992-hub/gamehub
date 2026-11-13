/* --------------------------------------------------------------------------
   ENGINE LAB · three rooms that exercise the game kit. Copy from here.
     Platforms   Tilemap, Platformer, Rope
     Swarm       World, FlowField, Sprite, Darkness, music, sound panning
     Workshop    Interact (prompts, hold, carry, throw), A* route finding,
                 FSM, Events, Routines and the choice cards
   -------------------------------------------------------------------------- */
(() => {
const { T, FS, G, U, Sfx, W, H } = Couch;
const pulse = (k, hz = 6) => Math.floor(k.time * hz) % 2 === 0;       // lets a bot "tap" a button

// ===== Room 1: Platforms =====================================================
class Platforms {
  constructor(k) {
    this.k = k; this.name = 'Platforms';
    this.map = new k.Tilemap({ size: 64, solid: '#', rows: [
      '##############################',
      '#............................#',
      '#.............*..............#',
      '#...........#####............#',
      '#.....*................*.....#',
      '#....####............####....#',
      '#............................#',
      '#..........*......*..........#',
      '#........####....####........#',
      '#............................#',
      '#...*....................*...#',
      '#..####................####..#',
      '#............*...............#',
      '#..........######............#',
      '#..S.S.......................#',
      '##############################'] });
    this.stars = this.map.find('*').map(s => ({ x: s.x, y: s.y, got: false }));
    const spawn = this.map.find('S');
    this.ps = k.players.map((seat, n) => Object.assign(new k.Platformer({ x: spawn[n % spawn.length].x, y: spawn[n % spawn.length].y, jump: 1150 }), { seat, i: seat.index, anchor: false }));
    this.rope = this.ps.length > 1 ? new k.Rope({ length: 440 }) : null;
    this.fx = new k.Particles(300); this.got = 0;
    this.hints = [['move', 'Run'], ['a', 'Jump'], ['lt', 'Anchor'], ['rt', 'Reel in']];
  }
  update(dt) {
    const k = this.k, map = this.map;
    for (const p of this.ps) {
      const s = p.seat; p.anchor = s.value('lt') > 0.5 && p.ground;
      p.update(dt, map, { move: p.anchor ? 0 : s.move.x, jump: s.down('a'), jumpPressed: s.pressed('a') && !p.anchor });
      if (p.jumped) { Sfx.play('tick', { pitch: 0.7 }); this.fx.burst(p.x, p.y + p.h / 2, 6, { color: T.muted, angle: Math.PI / 2, spread: 2, speed: [40, 200], life: 0.3, size: 6 }); }
      if (p.landed) this.fx.burst(p.x, p.y + p.h / 2, 5, { color: T.muted, angle: -Math.PI / 2, spread: 2.6, speed: [40, 160], life: 0.25, size: 5 });
    }
    if (this.rope) {
      const [a, b] = this.ps, reel = a.seat.value('rt') > 0.3 || b.seat.value('rt') > 0.3;
      this.rope.length = U.approach(this.rope.length, reel ? 150 : 440, (reel ? 320 : 500) * dt);
      const share = a.anchor && !b.anchor ? 0 : b.anchor && !a.anchor ? 1 : 0.5;   // an anchored player does not budge
      this.rope.constrain(a, b, share, map); this.rope.update(dt, a, b, map);
    }
    for (const st of this.stars) {
      if (st.got || !this.ps.some(p => U.dist(p.x, p.y, st.x, st.y) < 52)) continue;
      st.got = true; this.got++; Sfx.play('pickup', { pitch: 1 + this.got * 0.08 });
      this.fx.burst(st.x, st.y, 16, { color: T.good, speed: [80, 360], life: 0.5 });
      if (this.got === this.stars.length) { k.toast('All ' + this.got + ' stars'); Sfx.play('win'); }
    }
    this.fx.update(dt);
  }
  bot(seat, ctl) {                                           // follows the other player, jumps when they are higher
    const me = this.ps.find(p => p.seat === seat), lead = this.ps.find(p => p !== me); if (!lead) return;
    const dx = lead.x - me.x; if (Math.abs(dx) > 110) ctl.x = Math.sign(dx);
    ctl.set('a', lead.y < me.y - 70 && pulse(this.k, 3));
  }
  draw() {
    const k = this.k, c = k.c;
    c.save(); c.translate(0, 28);
    this.map.draw(c);
    for (const st of this.stars) if (!st.got) { k.Shapes.star(c, st.x, st.y, 20); c.fillStyle = T.good; c.fill(); }
    if (this.rope) this.rope.draw(c, this.rope.stretch > 1 ? T.text : T.muted, 5);
    for (const p of this.ps) {
      G.rrect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 12, T.p[p.i]);
      G.marker(p.i, p.x, p.y + 6, 9, { color: T.bg });
      G.circle(p.x + p.face * 9, p.y - 14, 5, T.bg);
      if (p.anchor) G.rrect(p.x - p.w / 2 - 8, p.y + p.h / 2 - 6, p.w + 16, 6, 3, T.text);
    }
    this.fx.draw(c);
    c.restore();
    this.stat = this.got + ' / ' + this.stars.length + ' stars';
  }
}

// ===== Room 2: Swarm ===========================================================
const SONG = { bpm: 112, root: 55, tracks: [
  { wave: 'triangle', oct: 1, vol: 0.11, len: 1.6, notes: [0, null, null, 0, null, null, 0, null, 3, null, null, 3, null, null, 5, null] },
  { wave: 'noise', vol: 0.03, len: 0.03, freq: 8000, at: 0.15, notes: [1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, null, 1, 1] },
  { wave: 'square', oct: 3, vol: 0.028, len: 0.8, at: 0.4, notes: [0, null, 7, null, 3, null, 7, null, 0, null, 7, null, 5, null, 10, null] },
  { wave: 'sawtooth', oct: 2, vol: 0.03, len: 3.5, at: 0.75, notes: [0, null, null, null, null, null, null, null, 3, null, null, null, 5, null, null, null] },
] };
class Swarm {
  constructor(k) {
    this.k = k; this.name = 'Swarm';
    const rows = [];
    for (let y = 0; y < 18; y++) { let s = ''; for (let x = 0; x < 32; x++) s += x === 0 || y === 0 || x === 31 || y === 17 || ((x % 7 === 4 || x % 7 === 5) && y % 5 === 3) ? '#' : '.'; rows.push(s); }
    const map = this.map = new k.Tilemap({ size: 80, rows, solid: '#' });
    const world = this.world = new k.World({ w: map.w, h: map.h, cell: 96, map });
    const flow = this.flow = new k.FlowField(map);
    this.cam = new k.Camera({ minZoom: 0.62, maxZoom: 1, margin: 360, bounds: { x: 0, y: 0, w: map.w, h: map.h } });
    this.fx = new k.Particles(1500); this.dark = new k.Darkness({ ambient: 0.9 }); this.lights = true; this.ft = 0; this.n = 0; this.shown = 0;   // lights: true = the room is dark
    // One drawing, turned to 32 angles once, then stamped for every bug. This is what keeps thousands of them cheap.
    const spr = k.Sprite.bake(40, 40, c => { k.Shapes.arrow(c, 0, 0, 0, 16); c.fillStyle = 'rgba(240,97,109,0.28)'; c.fill(); c.strokeStyle = T.bad; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke(); }).spin(32);
    this.drawBug = (c, e) => spr.draw(c, e.x, e.y, e.a);
    this.bugUpdate = function (dt) {
      const d = flow.dir(this.x, this.y);
      this.x += (d.x * this.sp + this.kx) * dt; this.y += (d.y * this.sp + this.ky) * dt;
      const kd = Math.max(0, 1 - 5 * dt); this.kx *= kd; this.ky *= kd;
      map.collideCircle(this); if (d.x || d.y) this.a = Math.atan2(d.y, d.x);
    };
    const drawPlayer = (c, p) => {
      if (p.pulse > 0) G.circle(p.x, p.y, 300 * (1 - p.pulse / 0.35), null, T.p[p.i], 6 * (p.pulse / 0.35));
      G.marker(p.i, p.x, p.y, p.r); G.circle(p.x + p.fx * (p.r - 12), p.y + p.fy * (p.r - 12), 7, T.bg);
      if (p.cd > 0) G.ring(p.x, p.y, p.r + 12, 1 - p.cd / 0.7, T.p[p.i], 4);
    };
    this.ps = k.players.map((seat, n) => world.add({ tag: 'player', layer: 1, seat, i: seat.index, x: map.w / 2 + (k.players.length > 1 ? (n ? 80 : -80) : 0), y: map.h / 2, r: 34, vx: 0, vy: 0, fx: 1, fy: 0, cd: 0, pulse: 0, draw: drawPlayer }));
    flow.compute(this.ps); this.spawn(300);
  }
  spawn(count) {
    const k = this.k, map = this.map; let made = 0, tries = 0;
    while (made < count && tries++ < count * 20) {
      const x = U.range(k.rng, 100, map.w - 100), y = U.range(k.rng, 100, map.h - 100);
      if (map.solidAt(x, y) || this.ps.some(p => U.dist(p.x, p.y, x, y) < 520)) continue;
      this.world.add({ tag: 'bug', x, y, r: 14, sp: U.range(k.rng, 140, 215), a: 0, kx: 0, ky: 0, update: this.bugUpdate, draw: this.drawBug }); made++;
    }
    this.n += made;
  }
  enter() { Sfx.music.play(SONG); }
  update(dt) {
    const k = this.k, world = this.world;
    for (const p of this.ps) {
      const s = p.seat; p.cd -= dt; p.pulse -= dt;
      if (s.move.x || s.move.y) { const m = Math.hypot(s.move.x, s.move.y); p.fx = s.move.x / m; p.fy = s.move.y / m; }
      p.vx = U.damp(p.vx, s.move.x * 480, 14, dt); p.vy = U.damp(p.vy, s.move.y * 480, 14, dt);
      world.move(p, p.vx * dt, p.vy * dt);
      if (s.pressed('a') && p.cd <= 0) {                     // pulse: everything close gets thrown back
        p.cd = 0.7; p.pulse = 0.35; let hit = 0;
        world.near(p.x, p.y, 300, 'bug', e => { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; e.kx = (dx / d) * 950; e.ky = (dy / d) * 950; hit++; });
        k.sfxAt('dash', p.x, this.cam); if (hit) { k.shake(0.3); s.rumble(0.5, 110); }
        this.fx.burst(p.x, p.y, 28, { color: T.p[p.i], speed: [300, 800], life: 0.35, size: 7 });
      }
      if (s.pressed('x')) { if (this.n < 3000) { this.spawn(200); k.toast(this.n + ' bugs'); } else k.toast('That is plenty'); }
      if (s.pressed('y')) { this.lights = !this.lights; k.toast(this.lights ? 'Lights off' : 'Lights on'); }
    }
    if ((this.ft -= dt) <= 0) { this.flow.compute(this.ps); this.ft = 0.2; }   // one search serves every bug
    world.separate('bug', 0.6); world.update(dt);              // separate first, so each bug's own wall check has the last word
    for (const p of this.ps) world.near(p.x, p.y, p.r, 'bug', e => { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, m = p.r + e.r; if (d < m) { e.x = p.x + (dx / d) * m; e.y = p.y + (dy / d) * m; } });
    this.cam.follow(this.ps, dt); this.fx.update(dt);
    k.watch.bugs = this.n; k.watch.drawn = this.shown; Sfx.music.intensity = U.clamp(this.n / 1200, 0, 1);
  }
  bot(seat, ctl) {                                           // stays near the other player, pulses when crowded
    const me = this.ps.find(p => p.seat === seat), lead = this.ps.find(p => p !== me);
    if (lead) { const dx = lead.x - me.x, dy = lead.y - me.y, d = Math.hypot(dx, dy); if (d > 240) { ctl.x = dx / d; ctl.y = dy / d; } }
    let n = 0; this.world.near(me.x, me.y, 220, 'bug', () => n++); ctl.set('a', n > 8 && me.cd <= 0);
  }
  draw() {
    const k = this.k, c = k.c, cam = this.cam, v = cam.view();
    cam.begin(c); this.map.draw(c, v); this.shown = this.world.draw(c, v); this.fx.draw(c); cam.end(c);
    if (this.lights) {
      const d = this.dark; d.begin();
      for (const p of this.ps) {
        const s = cam.toScreen(p.x, p.y);
        d.light(s.x, s.y, 300 * cam.zoom); d.cone(s.x, s.y, Math.atan2(p.fy, p.fx), 1.1, 950 * cam.zoom, 0.95);
        if (p.pulse > 0) d.light(s.x, s.y, 720 * cam.zoom, p.pulse / 0.35);
      }
      d.end(c);
    }
    this.hints = [['move', 'Move'], ['a', 'Pulse'], ['x', '200 more'], ['y', 'Lights']];
    this.stat = this.n + ' bugs';
  }
}

// ===== Room 3: Workshop ==========================================================
class Workshop {
  constructor(k) {
    this.k = k; this.name = 'Workshop'; const self = this;
    const world = this.world = new k.World({ walls: [{ x: 0, y: 0, w: W, h: 140 }, { x: 880, y: 360, w: 160, h: 400 }] });
    this.grid = k.Path.grid(W, H, 60, world.walls, 38);      // walls, widened by a body's radius
    this.act = new k.Interact(); this.items = []; this.fx = new k.Particles(400);
    this.packer = { x: 1500, y: 420, r: 110 }; this.chute = { x: 1500, y: 820, r: 110 };
    this.delivered = 0; this.mods = { speed: 1, throw: 1, pack: 1 }; this.perks = []; this.turn = 0;
    this.ps = k.players.map((seat, n) => ({ seat, i: seat.index, x: 320, y: 460 + n * 200, r: 34, vx: 0, vy: 0, fx: 1, fy: 0, carry: null }));
    this.station = this.act.add({ x: this.packer.x, y: this.packer.y, r: 150, btn: 'x', hold: 1.1, label: 'Hold to pack', lift: 170,
      can: a => !!a.carry && !a.carry.packed,
      use: a => { a.carry.packed = true; Sfx.play('ready'); a.seat.rumble(0.5, 120); this.fx.burst(a.carry.x, a.carry.y, 14, { color: T.good, speed: [80, 320], life: 0.4 }); } });
    for (let i = 0; i < 4; i++) this.crate();
    k.on('delivered', () => { this.delivered++; if (this.delivered % 3 === 0) this.perk(); });
    // The courier: a state machine that plans a route with A*, walks it, then plans again.
    const cour = this.cour = { x: 1720, y: 240, r: 20, path: null, at: 0 };
    cour.fsm = new k.FSM({
      think: { update(dt, f) { if (f.time < 0.4) return; const lead = self.ps[0], s = self.grid.size; cour.path = k.Path.astar(self.grid, Math.floor(cour.x / s), Math.floor(cour.y / s), Math.floor(lead.x / s), Math.floor(lead.y / s)); cour.at = 1; f.go(cour.path && cour.path.length > 2 ? 'walk' : 'think'); } },
      walk: { update(dt, f) {
        const n = cour.path[cour.at]; if (!n || f.time > 1.2 || cour.path.length - cour.at < 3) { f.go('think'); return; }
        const dx = n.x - cour.x, dy = n.y - cour.y, d = Math.hypot(dx, dy);
        if (d < 8) cour.at++; else { cour.x += (dx / d) * 260 * dt; cour.y += (dy / d) * 260 * dt; }
      } },
    }, 'think');
    this.hints = [['a', 'Pick up or drop'], ['b', 'Throw'], ['x', 'Pack']];
  }
  crate() {
    const k = this.k, it = { x: U.range(k.rng, 140, 760), y: U.range(k.rng, 240, 980), r: 26, vx: 0, vy: 0, packed: false, held: null };
    it.act = this.act.add({ x: it.x, y: it.y, r: 86, label: 'Pick up', lift: 70, can: a => !a.carry && !it.held,
      use: a => { this.act.hold(a, it); a.picked = true; Sfx.play('tick'); } });
    this.items.push(it);
  }
  perk() {                                                   // a script: wait, ask, apply
    const k = this.k, self = this, who = k.players[this.turn++ % k.players.length].index;
    const icon = draw => (c, x, y, s, sel) => { c.strokeStyle = sel ? T.text : T.muted; c.fillStyle = sel ? T.text : T.muted; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'; draw(c, x, y, s); c.lineCap = 'butt'; c.lineJoin = 'miter'; };
    const opts = [
      { title: 'Quick feet', tag: 'Movement', text: 'Both of you move a quarter faster.', apply: () => { self.mods.speed *= 1.25; },
        icon: icon((c, x, y, s) => { for (const o of [-22, 0, 22]) { c.beginPath(); c.moveTo(x + o - 14, y - s * 0.5); c.lineTo(x + o + 14, y); c.lineTo(x + o - 14, y + s * 0.5); c.stroke(); } }) },
      { title: 'Strong arm', tag: 'Throwing', text: 'Thrown crates travel much further.', apply: () => { self.mods.throw *= 1.4; },
        icon: icon((c, x, y, s) => { c.beginPath(); c.arc(x, y + s * 0.5, s, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); k.Shapes.arrow(c, x + s * 0.88, y + s * 0.06, 0.9, 16); c.fill(); }) },
      { title: 'Fast hands', tag: 'Packing', text: 'The packer takes a third less time.', apply: () => { self.mods.pack *= 0.66; },
        icon: icon((c, x, y, s) => { c.beginPath(); c.arc(x, y, s * 0.72, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x, y - s * 0.4); c.lineTo(x, y); c.lineTo(x + s * 0.3, y + s * 0.16); c.stroke(); }) },
    ];
    k.run(function* () {
      yield 0.5;
      const i = yield k.choose({ title: self.delivered + ' delivered. Pick a perk.', by: who, options: opts });
      opts[i].apply(); self.perks.push(opts[i].title); k.toast(opts[i].title, { seat: who });
    });
  }
  update(dt) {
    const k = this.k, world = this.world, act = this.act;
    this.station.hold = 1.1 * this.mods.pack;
    for (const p of this.ps) {
      const s = p.seat, sp = 430 * this.mods.speed; p.picked = false;
      if (s.move.x || s.move.y) { const m = Math.hypot(s.move.x, s.move.y); p.fx = s.move.x / m; p.fy = s.move.y / m; }
      p.vx = U.damp(p.vx, s.move.x * sp, 16, dt); p.vy = U.damp(p.vy, s.move.y * sp, 16, dt);
      world.move(p, p.vx * dt, p.vy * dt);
    }
    act.update(dt, this.ps);
    for (const p of this.ps) {
      const s = p.seat; if (!p.carry || p.picked) continue;
      if (s.pressed('a')) { act.release(p, p.fx * 70, p.fy * 70); Sfx.play('tick', { pitch: 0.8 }); }
      else if (s.pressed('b')) { act.release(p, p.fx * 1150 * this.mods.throw, p.fy * 1150 * this.mods.throw); Sfx.play('dash'); s.rumble(0.3, 80); }
    }
    act.updateItems(dt, this.items, world);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.act.x = it.x; it.act.y = it.y;
      if (it.packed && !it.held && U.dist(it.x, it.y, this.chute.x, this.chute.y) < this.chute.r - 12) {
        this.items.splice(i, 1); act.remove(it.act); Sfx.play('revive');
        this.fx.burst(it.x, it.y, 24, { color: T.good, speed: [100, 420], life: 0.5 });
        k.emit('delivered'); this.crate();
      }
    }
    this.cour.fsm.update(dt); this.fx.update(dt);
  }
  bot(seat, ctl) {                                           // fetch, pack, deliver; walks round the counter with A*
    const k = this.k, me = this.ps.find(p => p.seat === seat), s = this.grid.size; let goal = null, near = 30;
    if (!me.carry) {
      let bd = Infinity; for (const it of this.items) { if (it.held) continue; const d = U.dist2(me.x, me.y, it.x, it.y); if (d < bd) { bd = d; goal = it; } }
      if (goal && me.focus === goal.act) ctl.set('a', pulse(k));
    } else if (!me.carry.packed) { goal = this.packer; near = 110; if (U.dist(me.x, me.y, goal.x, goal.y) < 130) ctl.set('x', true); }
    else { goal = this.chute; near = 50; if (U.dist(me.x, me.y, goal.x, goal.y) < 60) ctl.set('a', pulse(k)); }
    if (!goal) return;
    let tx = goal.x, ty = goal.y;
    const path = k.Path.astar(this.grid, Math.floor(me.x / s), Math.floor(me.y / s), Math.floor(goal.x / s), Math.floor(goal.y / s));
    if (path && path.length > 2) { tx = path[1].x; ty = path[1].y; near = 0; }
    const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy); if (d > near) { ctl.x = dx / d; ctl.y = dy / d; }
  }
  draw() {
    const k = this.k, c = k.c, pk = this.packer, ch = this.chute, cr = this.cour;
    c.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 60; x < W; x += 120) for (let y = 200; y < H; y += 120) c.fillRect(x - 2, y - 2, 4, 4);
    const w = this.world.walls[1]; G.rrect(w.x, w.y, w.w, w.h, 14, T.s2, T.line2); G.eyebrow('Counter', w.x + w.w / 2, w.y + w.h / 2, { align: 'center', color: T.faint, base: 'middle' });
    G.circle(pk.x, pk.y, pk.r, T.s1, T.line2, 4); G.circle(pk.x, pk.y, pk.r - 24, null, T.line2, 2); G.eyebrow('Packer', pk.x, pk.y + 8, { align: 'center' });
    c.save(); c.setLineDash([18, 12]); G.circle(ch.x, ch.y, ch.r, 'rgba(46,189,133,0.08)', T.good, 4); c.restore(); G.eyebrow('Chute', ch.x, ch.y + 8, { align: 'center', color: T.good });
    if (cr.path) { c.save(); c.setLineDash([4, 14]); c.beginPath(); c.moveTo(cr.x, cr.y); for (let i = cr.at; i < cr.path.length; i++) c.lineTo(cr.path[i].x, cr.path[i].y); c.strokeStyle = T.faint; c.lineWidth = 3; c.stroke(); c.restore(); }
    k.Shapes.poly(c, cr.x, cr.y, cr.r, 6, k.time); c.fillStyle = T.s3; c.fill(); c.strokeStyle = T.muted; c.lineWidth = 3; c.stroke();
    G.text('Courier', cr.x, cr.y + 52, { size: FS.xs, color: T.faint, align: 'center' });
    for (const it of this.items) {
      G.rrect(it.x - 24, it.y - 24, 48, 48, 8, it.packed ? 'rgba(46,189,133,0.2)' : T.s3, it.packed ? T.good : T.muted, 3);
      if (it.packed) G.tick(it.x, it.y, 9, T.good); else { G.line(it.x - 24, it.y, it.x + 24, it.y, T.muted, 2); }
    }
    for (const p of this.ps) {
      G.marker(p.i, p.x, p.y, p.r); G.circle(p.x + p.fx * (p.r - 12), p.y + p.fy * (p.r - 12), 7, T.bg);
      G.text('P' + (p.i + 1), p.x, p.y + p.r + 40, { size: FS.xs, weight: 700, color: T.p[p.i], align: 'center' });
    }
    this.fx.draw(c);
    this.act.draw(null, this.ps);
    if (this.perks.length) G.text('Perks: ' + this.perks.join(', '), W - 60, 1042, { size: FS.xs, color: T.muted, align: 'right', base: 'middle' });
    this.stat = this.delivered + ' delivered';
  }
}

// ===== The lab itself: three rooms, LB and RB to move between them =================
class Lab {
  constructor(k) { this.k = k; this.rooms = [new Platforms(k), new Swarm(k), new Workshop(k)]; this.i = 0; }
  go(d) { this.i = (this.i + d + this.rooms.length) % this.rooms.length; Sfx.music.stop(); const r = this.rooms[this.i]; if (r.enter) r.enter(); Sfx.play('select'); }
  update(dt) {
    for (const s of this.k.players) { if (s.bot) continue; const d = (s.pressed('rb') ? 1 : 0) - (s.pressed('lb') ? 1 : 0); if (d) { this.go(d); break; } }
    this.rooms[this.i].update(dt);
  }
  bot(seat, ctl) { const r = this.rooms[this.i]; if (r.bot) r.bot(seat, ctl); }
  draw() {
    const r = this.rooms[this.i], human = this.k.players.find(s => !s.bot) || this.k.players[0], names = human.device.names;
    r.draw();
    let x = 40;
    const tw = this.rooms.reduce((a, q) => a + G.measure(q.name, { size: FS.xs, weight: 500 }) + 56, 0) + 8;
    G.panel(x, 40, tw, 64, 32); x += 8;
    this.rooms.forEach((q, n) => {
      const w = G.measure(q.name, { size: FS.xs, weight: 500 }) + 48, on = n === this.i;
      if (on) G.rrect(x, 48, w, 48, 24, T.s3, T.text, 2);
      G.text(q.name, x + w / 2, 73, { size: FS.xs, weight: 500, color: on ? T.text : T.muted, align: 'center', base: 'middle' }); x += w + 8;
    });
    const hx = 40 + tw + 24 + G.glyph(human.type, 'lb', 40 + tw + 24, 72, 36, { names }) + 8;
    G.hints(hx, 72, [['rb', 'Change room']], human.type, { names });
    if (r.stat) { const w = G.measure(r.stat, { size: FS.sm, mono: true }) + 56; G.panel(W - 40 - w, 40, w, 64, 32); G.text(r.stat, W - 40 - w / 2, 73, { size: FS.sm, mono: true, align: 'center', base: 'middle' }); }
    if (r.hints) G.hints(60, 1042, r.hints, human.type, { names });
  }
}

Couch.register({
  id: 'engine-lab', title: 'Engine Lab', line: 'Three rooms that show what the engine can do.',
  players: 1, bots: true,
  how: ['Platforms: jump, anchor and reel on a rope.', 'Swarm: hundreds of chasers, lights and layered music.', 'Workshop: carry, pack and throw crates, then pick a perk.'],
  controls: [['lb', 'Previous room'], ['rb', 'Next room'], ['a', 'Jump, pulse or pick up'], ['start', 'Pause, then quit']],
  create: k => new Lab(k),
});
})();
