/* ==========================================================================
   GAMES
   The manifest lists all 15 slots. A slot becomes playable when a game
   registers under the same id with a create() function. Add each new game
   as its own block below the Test Range.
   ========================================================================== */
(() => {
const R = Couch.register;
[
  ['parcel-panic', 'Parcel Panic', 'Sort and load parcels across a split depot.', 'Frantic', 'M'],
  ['pit-crew', 'Pit Crew', 'Service race cars before the queue backs up.', 'Frantic', 'S'],
  ['last-orders', 'Last Orders', 'Run a cocktail bar with analog pouring.', 'Frantic', 'M'],
  ['tether', 'Tether', 'A platformer with the two of you roped together.', 'Medium', 'M'],
  ['push-comes-to-shove', 'Push Comes to Shove', 'Crate puzzles that need two pushers.', 'Calm', 'S'],
  ['polarity', 'Polarity', 'You are magnets that pull and push each other.', 'Medium', 'M'],
  ['mission-control', 'Mission Control', 'One flies the lander. One runs the power.', 'Medium', 'M'],
  ['heist-night', 'Heist Night', 'One sneaks in. One hacks doors and cameras.', 'Medium', 'L'],
  ['big-and-small', 'Big & Small', 'A strong slow one and a quick light one.', 'Medium', 'M'],
  ['tank-for-two', 'Tank for Two', 'One drives, one guns, same tank.', 'Frantic', 'S'],
  ['swarm-night', 'Swarm Night', 'Survive the swarm with shared upgrades.', 'Frantic', 'S'],
  ['deep-dive', 'Deep Dive', 'Dig down on one shared air hose.', 'Medium', 'M'],
  ['allotment', 'Allotment', 'A shared garden with no way to fail.', 'Calm', 'M'],
  ['slow-boat', 'Slow Boat', 'Sail and trade between islands.', 'Calm', 'L'],
  ['floodline', 'Floodline', 'A board game against a rising river.', 'Calm', 'M'],
].forEach(([id, title, line, pace, size], i) => R({ id, n: i + 1, title, line, pace, size, players: 2 }));
})();

/* --------------------------------------------------------------------------
   TEST RANGE · the engine demo, and the template for a real game.
   Collect every pellet. Both stand on a plate to open the vault. Drones knock
   you down; your partner revives you. Uses: seats, camera, spatial grid,
   particles, floaters, shake, hit-stop, rumble, sound, assists, saves, results.
   -------------------------------------------------------------------------- */
(() => {
const { T, FS, G, U, Sfx, W, H } = Couch;
const WORLD = { w: 2600, h: 1460 }, VAULT = { x: 1300, y: 730, r: 240 };
const PLATES = [{ x: 480, y: 730, r: 96 }, { x: 2120, y: 730, r: 96 }];

class TestRange {
  constructor(k) {
    this.k = k; const rng = k.rng, solo = k.players.length === 1;
    this.cam = new k.Camera({ minZoom: 0.5, maxZoom: 1, margin: 320, bounds: { x: -60, y: -60, w: WORLD.w + 120, h: WORLD.h + 120 } });
    this.fx = new k.Particles(1200); this.floats = new k.Floaters(); this.timers = new k.Timers();
    this.grid = new k.SpatialGrid(WORLD.w, WORLD.h, 150);
    this.pellets = 0; this.total = 0; this.open = false; this.openT = 0; this.over = 0;
    this.stats = { revives: 0, dashes: 0, knocks: 0 };
    const add = (x, y, gold) => { this.grid.insert({ x, y, r: gold ? 20 : 14, gold }); this.total++; };
    while (this.total < 60) {
      const x = U.range(rng, 90, WORLD.w - 90), y = U.range(rng, 90, WORLD.h - 90);
      if (U.dist(x, y, VAULT.x, VAULT.y) > VAULT.r + 70 && PLATES.every(p => U.dist(x, y, p.x, p.y) > p.r + 30)) add(x, y, false);
    }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; add(VAULT.x + Math.cos(a) * 130, VAULT.y + Math.sin(a) * 130, true); }
    this.players = k.players.map((seat, n) => ({
      seat, i: seat.index, x: VAULT.x + (solo ? 0 : n ? 140 : -140), y: VAULT.y + 440, vx: 0, vy: 0, r: 42,
      fx: 0, fy: -1, dash: 0, dashCd: 0, down: false, revive: 0, self: 0, safe: 0, shield: k.assist(seat.index), charge: 0, rumT: 0, ping: 0,
    }));
    this.drones = [];
    for (let i = 0; i < 6; i++) {
      const a = U.range(rng, 0, Math.PI * 2), top = i % 2 === 0;
      this.drones.push({ x: U.range(rng, 300, WORLD.w - 300), y: top ? U.range(rng, 120, 300) : U.range(rng, WORLD.h - 300, WORLD.h - 120), vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 40, spin: a });
    }
    this.cam.follow(this.players, 0, true);
  }

  update(dt) {
    const k = this.k, ps = this.players;
    this.timers.update(dt); this.fx.update(dt); this.floats.update(dt);
    if (this.open) this.openT = Math.min(1, this.openT + dt * 2);

    for (const p of ps) {
      const s = p.seat; p.dashCd -= dt; p.safe -= dt; p.ping -= dt;
      if (p.down) {
        // Revive: partner stands close. Alone, you get back up after a wait.
        const mate = ps.find(q => q !== p && !q.down && U.dist(p.x, p.y, q.x, q.y) < 130);
        const need = [2.0, 1.4, 0.9][k.assist(p.i)];
        if (mate) p.revive += dt / need; else p.revive = Math.max(0, p.revive - dt * 0.5);
        if (ps.length === 1) p.revive += dt / 3.5;
        if (p.revive >= 1) {
          p.down = false; p.revive = 0; p.safe = 1.5; this.stats.revives++;
          Sfx.play('revive'); this.fx.burst(p.x, p.y, 26, { color: T.p[p.i], speed: [120, 420], life: 0.6 });
          this.floats.add('Back up', p.x, p.y - p.r - 36, { color: T.p[p.i], size: FS.md }); s.rumble(0.5, 160);
        }
        p.vx = p.vy = 0; continue;
      }
      // Move
      const mx = s.move.x, my = s.move.y, sp = 500;
      if (mx || my) { const m = Math.hypot(mx, my); p.fx = mx / m; p.fy = my / m; }
      p.vx = U.damp(p.vx, mx * sp, 14, dt); p.vy = U.damp(p.vy, my * sp, 14, dt);
      // Dash
      if (s.pressed('a') && p.dashCd <= 0) {
        p.dash = 0.16; p.dashCd = 0.9; this.stats.dashes++;
        Sfx.play('dash'); s.rumble(0.35, 90, 0.7);
        this.fx.burst(p.x, p.y, 14, { color: T.p[p.i], angle: Math.atan2(-p.fy, -p.fx), spread: 1.2, speed: [200, 600], life: 0.35, size: 9 });
      }
      let vx = p.vx, vy = p.vy;
      if (p.dash > 0) { p.dash -= dt; vx += p.fx * 1500; vy += p.fy * 1500; }
      p.x += vx * dt; p.y += vy * dt;
      // Ping, and the analog trigger
      if (s.pressed('x')) { p.ping = 0.6; Sfx.play('select', { pitch: p.i ? 1.2 : 1 }); this.floats.add('Here', p.x, p.y - p.r - 36, { color: T.p[p.i], size: FS.md }); }
      p.charge = s.value('rt'); p.rumT -= dt;
      if (p.charge > 0.1 && p.rumT <= 0) { s.rumble(0, 110, p.charge * 0.6); p.rumT = 0.1; }
      // Walls: the world edge, and the vault while it is shut
      p.x = U.clamp(p.x, p.r, WORLD.w - p.r); p.y = U.clamp(p.y, p.r, WORLD.h - p.r);
      if (!this.open) {
        const d = U.dist(p.x, p.y, VAULT.x, VAULT.y), min = VAULT.r + p.r;
        if (d < min && d > 0) { p.x = VAULT.x + ((p.x - VAULT.x) / d) * min; p.y = VAULT.y + ((p.y - VAULT.y) / d) * min; }
      }
      // Pellets near this player, found through the grid
      const got = [];
      this.grid.query(p.x, p.y, p.r + 20, o => { if (U.dist2(p.x, p.y, o.x, o.y) < (p.r + o.r + 6) ** 2) got.push(o); });
      for (const o of got) {
        this.grid.remove(o); this.pellets++;
        Sfx.play('pickup', { pitch: o.gold ? 1.5 : 1 + (this.pellets % 8) * 0.04 });
        this.fx.burst(o.x, o.y, o.gold ? 12 : 5, { color: o.gold ? T.good : T.text, speed: [60, 260], life: 0.4, size: 6 });
      }
    }

    // Plates: every player on a plate of their own opens the vault for good
    if (!this.open) {
      for (const pl of PLATES) pl.on = ps.some(p => !p.down && U.dist(p.x, p.y, pl.x, pl.y) < pl.r);
      const need = Math.min(ps.length, PLATES.length);
      if (PLATES.filter(pl => pl.on).length >= need) {
        this.open = true; Sfx.play('open'); k.shake(0.5); k.hitstop(0.06);
        for (const p of ps) p.seat.rumble(0.7, 260);
        this.fx.burst(VAULT.x, VAULT.y, 60, { color: T.good, speed: [200, 700], life: 0.8 });
        this.floats.add('Vault open', VAULT.x, VAULT.y - VAULT.r - 30, { color: T.good, size: FS.md, life: 1.6 });
      }
    }

    // Drones bounce around and knock players down
    for (const d of this.drones) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.spin += dt * 2;
      if (d.x < d.r || d.x > WORLD.w - d.r) { d.vx *= -1; d.x = U.clamp(d.x, d.r, WORLD.w - d.r); }
      if (d.y < d.r || d.y > WORLD.h - d.r) { d.vy *= -1; d.y = U.clamp(d.y, d.r, WORLD.h - d.r); }
      const dv = U.dist(d.x, d.y, VAULT.x, VAULT.y), keep = VAULT.r + d.r + 40;   // the vault stays a safe room
      if (dv < keep) { const nx = (d.x - VAULT.x) / dv, ny = (d.y - VAULT.y) / dv, dot = d.vx * nx + d.vy * ny; if (dot < 0) { d.vx -= 2 * dot * nx; d.vy -= 2 * dot * ny; } d.x = VAULT.x + nx * keep; d.y = VAULT.y + ny * keep; }
      for (const p of ps) {
        if (p.down || p.safe > 0 || p.dash > 0 || this.over) continue;
        if (U.dist2(p.x, p.y, d.x, d.y) < (p.r + d.r) ** 2) {
          k.shake(0.45); k.hitstop(0.05); Sfx.play('hit'); p.seat.rumble(0.9, 220);
          this.fx.burst(p.x, p.y, 20, { color: T.bad, speed: [150, 520], life: 0.5 });
          if (p.shield > 0) { p.shield--; p.safe = 1.2; this.floats.add('Shield', p.x, p.y - p.r - 36, { color: T.muted, size: FS.md }); }
          else { p.down = true; p.revive = 0; this.stats.knocks++; Sfx.play('down'); }
        }
      }
    }

    this.cam.follow(ps, dt);

    // Win and lose
    if (!this.over) {
      if (this.pellets >= this.total) { this.over = 1; this.end(true); }
      else if (ps.length > 1 && ps.every(p => p.down)) { this.over = 1; this.timers.after(1.1, () => this.end(false)); }
    }
  }

  // The practice bot. The same function drives Couch.simulate('test-range') for balance runs.
  bot(seat, ctl) {
    const ps = this.players, p = ps.find(q => q.seat === seat); if (!p || p.down) return;
    const mate = ps.find(q => q !== p && q.down); let tx, ty;
    if (mate) { tx = mate.x; ty = mate.y; }
    else if (!this.open) { const pl = PLATES[ps.indexOf(p) % PLATES.length]; tx = pl.x; ty = pl.y; }
    else { let best = Infinity; for (const cell of this.grid.cells) for (const o of cell) { const d = U.dist2(p.x, p.y, o.x, o.y); if (d < best) { best = d; tx = o.x; ty = o.y; } } }
    if (tx == null) return;
    const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy); if (m > 20) { ctl.x = dx / m; ctl.y = dy / m; }
    if (p.dashCd <= 0 && this.drones.some(d => U.dist2(d.x, d.y, p.x, p.y) < 170 * 170)) ctl.set('a');
  }

  end(won) {
    const k = this.k, s = this.stats;
    k.finish({ won, score: k.time, title: won ? 'Range cleared' : 'Both down',
      note: won ? 'Every pellet collected.' : 'Nobody was left standing to revive the other.',
      stats: [['Pellets', this.pellets + ' / ' + this.total], ['Knock-downs', s.knocks], ['Revives', s.revives], ['Dashes', s.dashes]].concat(won ? [] : [['Time', U.time(k.time)]]) });
  }

  draw() {
    const k = this.k, c = k.c, cam = this.cam, ps = this.players;
    cam.begin(c);
    // floor: faint dots, then the edge
    const v = cam.view(), step = 100;
    c.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = Math.max(0, Math.floor(v.x / step) * step); x <= Math.min(WORLD.w, v.x + v.w); x += step)
      for (let y = Math.max(0, Math.floor(v.y / step) * step); y <= Math.min(WORLD.h, v.y + v.h); y += step) c.fillRect(x - 2, y - 2, 4, 4);
    G.rrect(0, 0, WORLD.w, WORLD.h, 24, null, T.line2, 4);
    // plates
    for (const pl of PLATES) {
      const on = pl.on || this.open;
      G.circle(pl.x, pl.y, pl.r, on ? 'rgba(46,189,133,0.14)' : T.s1, on ? T.good : T.line2, 4);
      G.circle(pl.x, pl.y, pl.r - 22, null, on ? T.good : T.line2, 2);
      if (!this.open) G.text('Plate', pl.x, pl.y + pl.r + 52, { size: FS.sm, color: T.faint, align: 'center' });
    }
    // vault
    c.save(); c.setLineDash(this.open ? [10, 26] : [28, 14]); c.globalAlpha = this.open ? 0.35 : 1;
    G.circle(VAULT.x, VAULT.y, VAULT.r, this.open ? null : T.s1, this.open ? T.good : T.muted, 5); c.restore();
    if (!this.open) G.text('Vault', VAULT.x, VAULT.y - VAULT.r - 28, { size: FS.sm, color: T.faint, align: 'center' });
    // pellets (only the cells in view)
    this.grid.query(v.x + v.w / 2, v.y + v.h / 2, Math.max(v.w, v.h) / 2, o => {
      if (o.gold) { G.circle(o.x, o.y, o.r, T.good); G.circle(o.x, o.y, o.r + 7, null, 'rgba(46,189,133,0.35)', 2); }
      else G.circle(o.x, o.y, o.r, '#C9CFDA');
    });
    // drones: red triangles
    for (const d of this.drones) {
      c.save(); c.translate(d.x, d.y); c.rotate(d.spin); c.beginPath();
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d.r * 1.25, Math.sin(a) * d.r * 1.25); }
      c.closePath(); c.fillStyle = 'rgba(240,97,109,0.18)'; c.fill(); c.strokeStyle = T.bad; c.lineWidth = 4; c.stroke(); c.restore();
    }
    this.fx.draw(c);
    // players
    for (const p of ps) {
      const col = T.p[p.i];
      if (p.ping > 0) G.circle(p.x, p.y, p.r + (1 - p.ping / 0.6) * 220, null, col, 4 * (p.ping / 0.6));
      if (p.charge > 0.02) G.circle(p.x, p.y, p.r + 14 + p.charge * 60, null, col, 2);
      if (p.down) {
        G.marker(p.i, p.x, p.y, p.r, { hollow: true, lw: 4 });
        G.ring(p.x, p.y, p.r + 22, 1, T.s3, 8); G.ring(p.x, p.y, p.r + 22, p.revive, col, 8);
        G.text('Down', p.x, p.y - p.r - 48, { size: FS.sm, weight: 700, color: T.bad, align: 'center' });
      } else {
        c.globalAlpha = p.safe > 0 && Math.floor(p.safe * 12) % 2 ? 0.45 : 1;
        G.marker(p.i, p.x, p.y, p.r); c.globalAlpha = 1;
        G.circle(p.x + p.fx * (p.r - 14), p.y + p.fy * (p.r - 14), 8, T.bg);
        if (p.dashCd > 0) G.ring(p.x, p.y, p.r + 12, 1 - p.dashCd / 0.9, col, 4);
        for (let i = 0; i < p.shield; i++) G.circle(p.x - 10 + i * 20, p.y - p.r - 22, 6, null, T.muted, 2);
      }
      G.text('P' + (p.i + 1), p.x, p.y + p.r + 50, { size: FS.sm, weight: 700, color: col, align: 'center' });
    }
    this.floats.draw();
    cam.end(c);

    // HUD
    G.rrect(40, 40, 330, 96, 14, 'rgba(17,21,28,0.86)', T.line);
    G.eyebrow('Pellets', 64, 86);
    G.text(String(this.pellets).padStart(2, '0') + ' / ' + this.total, 346, 90, { size: FS.md, weight: 500, mono: true, align: 'right' });
    G.bar(64, 110, 282, 8, this.pellets / this.total, T.text);
    G.rrect(W / 2 - 110, 40, 220, 72, 14, 'rgba(17,21,28,0.86)', T.line);
    G.text(U.time(k.time), W / 2, 78, { size: FS.md, weight: 500, mono: true, align: 'center', base: 'middle' });
    const need = ps.length > 1 ? 'Both stand on a plate to open the vault' : 'Stand on a plate to open the vault';
    const msg = this.open ? 'Vault open' : need, mw = G.measure(msg, { size: FS.xs }) + 76;
    G.rrect(W - 40 - mw, 40, mw, 56, 28, 'rgba(17,21,28,0.86)', T.line);
    if (this.open) G.tick(W - 40 - mw + 32, 68, 9, T.good); else G.circle(W - 40 - mw + 32, 68, 7, null, T.muted, 2);
    G.text(msg, W - 64, 69, { size: FS.xs, color: this.open ? T.good : T.muted, align: 'right', base: 'middle' });
  }
}

Couch.register({
  id: 'test-range', title: 'Test Range', line: 'The engine demo. Collect every pellet together.',
  players: 1, bots: true, best: 'low', scoreLabel: 'Time',
  how: ['Collect all 70 pellets.', 'Each stand on a plate to open the vault.', 'Drones knock you down. Stand by your partner to get them up.'],
  controls: [['move', 'Move'], ['a', 'Dash through drones'], ['x', 'Ping'], ['rt', 'Analog trigger test']],
  assistText: ['', 'One shield, faster revive', 'Two shields, fastest revive'],
  create: k => new TestRange(k),
});
})();

