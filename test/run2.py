"""Checks the game kit: unit checks in the page, bot simulation, and a walk through the Engine Lab."""
import pathlib, json
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / "master.html").as_uri()
OUT = ROOT / "test" / "shots"; OUT.mkdir(parents=True, exist_ok=True)
FAKE = """
window.__pads = [null, null, null, null];
window.__mk = (i, id) => ({ index: i, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), vibrationActuator: { playEffect: () => Promise.resolve() } });
navigator.getGamepads = () => window.__pads;
window.__btn = (i, b, on, v) => { const p = window.__pads[i]; if (p) p.buttons[b] = { pressed: !!on, value: on ? (v == null ? 1 : v) : 0 }; };
window.__axes = (i, a) => { const p = window.__pads[i]; if (p) p.axes = a; };
"""
BTN = dict(a=0, b=1, x=2, y=3, lb=4, rb=5, lt=6, rt=7, select=8, start=9, up=12, down=13, left=14, right=15)
UNIT = r"""
(() => {
  const C = Couch, out = [], ok = (name, cond, extra) => out.push((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  // Tilemap + rays
  const map = new C.Tilemap({ size: 10, solid: '#', rows: ['#######', '#.....#', '#.##..#', '#.....#', '#######'] });
  ok('tilemap solid', map.solidAt(25, 25) && !map.solidAt(15, 15));
  const r1 = map.ray(15, 25, 65, 25); ok('ray hits wall', r1.hit && Math.abs(r1.x - 20) < 0.01, JSON.stringify([r1.x, r1.dist]));
  ok('ray clear', !map.ray(15, 15, 55, 15).hit && map.los(15, 15, 55, 15));
  ok('ray diagonal blocked', map.ray(15, 15, 45, 35).hit);
  // A*
  const p = C.Path.astar(map, 1, 1, 5, 3); ok('astar finds route', p && p[0].tx === 1 && p[p.length - 1].tx === 5 && p[p.length - 1].ty === 3, 'len ' + (p && p.length));
  ok('astar avoids walls', p.every(n => !map.isSolid(n.tx, n.ty)));
  ok('astar no route', C.Path.astar(new C.Tilemap({ size: 10, rows: ['#####', '#.#.#', '#####'] }), 1, 1, 3, 1) === null);
  const p4 = C.Path.astar(map, 1, 1, 5, 3, { diagonal: false }); ok('astar 4-way length', p4.length === 7, 'len ' + p4.length);
  // Flow field
  const ff = new C.FlowField(map); ff.compute([{ x: 55, y: 35 }]);
  const d = ff.dir(15, 15); ok('flow points somewhere', Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-6 && (d.x > 0 || d.y > 0), JSON.stringify([d.x.toFixed(2), d.y.toFixed(2)]));
  ok('flow distance', ff.distAt(15, 15) === 6 && ff.distAt(55, 35) === 0, String(ff.distAt(15, 15)));
  // follow the field from the far corner and check we arrive
  let x = 15, y = 15, steps = 0; while (ff.distAt(x, y) > 0 && steps++ < 400) { const v = ff.dir(x, y); x += v.x; y += v.y; const e = { x, y, r: 2 }; map.collideCircle(e); x = e.x; y = e.y; }
  ok('flow walker arrives', ff.distAt(x, y) === 0, 'steps ' + steps);
  // Hex
  let hexok = true; for (const h of C.Hex.disc(4)) { const px = C.Hex.toPixel(h.q, h.r, 30), b = C.Hex.fromPixel(px.x + 3, px.y - 4, 30); if (b.q !== h.q || b.r !== h.r) hexok = false; }
  ok('hex pixel round trip', hexok); ok('hex disc size', C.Hex.disc(3).length === 37); ok('hex distance', C.Hex.distance({ q: 0, r: 0 }, { q: 2, r: -3 }) === 3);
  ok('hex neighbours', C.Hex.neighbors(0, 0).every(n => C.Hex.distance({ q: 0, r: 0 }, n) === 1));
  // moveBox + platformer: falls and lands on the floor
  const lvl = new C.Tilemap({ size: 64, rows: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'] }), pl = new C.Platformer({ x: 160, y: 240 });
  for (let i = 0; i < 240; i++) pl.update(1 / 120, lvl, { move: 0, jump: false, jumpPressed: false });
  ok('platformer lands', pl.ground && Math.abs(pl.y - (384 - 30)) < 0.01, 'y ' + pl.y.toFixed(2));
  pl.update(1 / 120, lvl, { move: 0, jump: true, jumpPressed: true }); let top = pl.y; for (let i = 0; i < 200; i++) { pl.update(1 / 120, lvl, { move: 0, jump: true, jumpPressed: false }); top = Math.min(top, pl.y); }
  ok('platformer jumps and returns', pl.ground && 354 - top > 170 && 354 - top < 200, 'height ' + (354 - top).toFixed(0));
  pl.update(1 / 120, lvl, { move: 0, jump: true, jumpPressed: true }); let top2 = pl.y; for (let i = 0; i < 200; i++) { pl.update(1 / 120, lvl, { move: 0, jump: false, jumpPressed: false }); top2 = Math.min(top2, pl.y); }
  ok('short hop when released early', 354 - top2 < (354 - top) * 0.6, 'height ' + (354 - top2).toFixed(0));
  for (let i = 0; i < 300; i++) pl.update(1 / 120, lvl, { move: 1, jump: false, jumpPressed: false });
  ok('platformer stops at map edge', pl.x <= 320 - 22 + 0.01, 'x ' + pl.x.toFixed(2));
  // Rope keeps two bodies within its length
  const rope = new C.Rope({ length: 100 }), a = { x: 0, y: 0, vx: 0, vy: 0 }, b = { x: 300, y: 0, vx: 50, vy: 0 };
  rope.constrain(a, b, 0.5); ok('rope pulls together', Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 100) < 0.01 && b.vx <= a.vx + 1e-6);
  // World
  const w = new C.World({ w: 1000, h: 1000, walls: [{ x: 400, y: 0, w: 50, h: 1000 }] });
  for (let i = 0; i < 500; i++) w.add({ tag: i % 2 ? 'a' : 'b', x: (i * 37) % 1000, y: (i * 91) % 1000, r: 10 }); w.regrid();
  let n = 0, brute = 0; w.near(500, 500, 120, 'a', () => n++); for (const e of w.list) if (e.tag === 'a' && Math.hypot(e.x - 500, e.y - 500) <= 130) brute++;
  ok('world.near matches brute force', n === brute && n > 0, n + ' = ' + brute);
  const e = { x: 420, y: 500, r: 20 }; w.collide(e); ok('world pushes out of walls', e.x <= 380 || e.x >= 470, 'x ' + e.x);
  ok('world ray hits wall', w.ray(100, 500, 900, 500).hit && Math.abs(w.ray(100, 500, 900, 500).x - 400) < 0.01);
  w.remove(w.list[0]); w.update(1 / 120); ok('world removes', w.list.length === 499 && w.count('a') + w.count('b') === 499);
  // Routines, events, FSM
  const R = new C.Routines(), log = []; let flag = false; const h = C.makeHandle();
  R.run(function* () { log.push('a'); yield 0.5; log.push('b'); yield () => flag; log.push('c'); const v = yield h; log.push('d' + v); });
  R.update(0.3); R.update(0.3); const s1 = log.join(''); flag = true; R.update(0.1); const s2 = log.join(''); h.resolve(7); R.update(0.1);
  ok('routines wait, until, handle', s1 === 'ab' && s2 === 'abc' && log.join('') === 'abcd7', log.join(''));
  const ev = new C.Events(); let got = 0; const off = ev.on('x', v => got += v); ev.emit('x', 2); off(); ev.emit('x', 5); ok('events on/off', got === 2);
  const fl = []; const fsm = new C.FSM({ a: { enter() { fl.push('a+'); }, exit() { fl.push('a-'); } }, b: { enter(f, arg) { fl.push('b+' + arg); } } }, 'a'); fsm.go('b', 9); ok('fsm enter/exit', fl.join('') === 'a+a-b+9');
  // utilities
  const rng = C.mulberry32(5); let lo = 1, hi = 0; for (let i = 0; i < 2000; i++) { const v = C.U.noise2(i * 0.13, i * 0.07, 3); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  ok('noise in range', lo >= 0 && hi <= 1 && hi - lo > 0.5, lo.toFixed(2) + '..' + hi.toFixed(2));
  ok('shuffle keeps items', C.U.shuffle(rng, [1, 2, 3, 4, 5]).sort().join('') === '12345');
  const wc = { a: 0, b: 0 }; for (let i = 0; i < 4000; i++) wc[C.U.weighted(rng, ['a', 'b'], k => (k === 'a' ? 3 : 1))]++; ok('weighted pick', wc.a / wc.b > 2.5 && wc.a / wc.b < 3.6, (wc.a / wc.b).toFixed(2));
  // Simulate: bots play the Test Range with no screen
  const t0 = performance.now(), runs = []; for (let seed = 1; seed <= 20; seed++) { const r = C.simulate('test-range', { seed, seconds: 240 }); runs.push(r); }
  const ms = performance.now() - t0, wins = runs.filter(r => r.result && r.result.won).length, secs = runs.reduce((a, r) => a + r.time, 0);
  ok('simulate finishes every run', runs.every(r => r.result), wins + ' / 20 won');
  ok('simulate is repeatable', C.simulate('test-range', { seed: 4 }).time === runs[3].time);
  out.push('sim   ' + secs.toFixed(0) + ' game-seconds in ' + ms.toFixed(0) + ' ms  (' + (secs * 1000 / ms).toFixed(0) + 'x real time), wins ' + wins + '/20, mean clear ' + (runs.filter(r => r.result.won).reduce((a, r) => a + r.time, 0) / Math.max(1, wins)).toFixed(1) + 's');
  return out;
})()
"""
errors = []


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport=dict(width=1920, height=1080))
        page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        page.add_init_script(FAKE); page.goto(SRC); page.wait_for_timeout(800)
        for line in page.evaluate(UNIT):
            print(line)
            if line.startswith("FAIL"): errors.append(line)

        def shot(name): page.screenshot(path=str(OUT / f"{name}.png")); print("shot", name)
        def tap(i, b, ms=60):
            page.evaluate(f"__btn({i},{BTN[b]},true)"); page.wait_for_timeout(ms); page.evaluate(f"__btn({i},{BTN[b]},false)"); page.wait_for_timeout(90)
        def top(): return page.evaluate("Couch.Engine.scenes[Couch.Engine.scenes.length-1].constructor.name")
        def expect(name):
            page.wait_for_timeout(500); got = top(); print(("ok   " if got == name else "FAIL ") + f"scene {got}")
            if got != name: errors.append(f"scene {got}, wanted {name}")

        page.evaluate("__pads[0]=__mk(0,'Xbox 360 Controller (XInput STANDARD GAMEPAD)')"); page.wait_for_timeout(120)
        tap(0, "a"); tap(0, "y"); page.wait_for_timeout(250); shot("30-join-bot")
        print("seats", page.evaluate("Couch.Input.seats.map(s=>s.device&&s.device.label)"))
        tap(0, "a"); expect("LauncherScene"); page.evaluate("(() => { const s = Couch.Engine.scenes[0]; s.row = 3; s.u = 1; })()"); page.wait_for_timeout(120); shot("31-launcher")
        tap(0, "a"); expect("BriefScene"); page.wait_for_timeout(200); shot("32-brief-bot")
        page.evaluate("__btn(0,0,true)"); page.wait_for_timeout(800); page.evaluate("__btn(0,0,false)"); expect("GameHost")
        page.keyboard.press("F3")

        # Room 1: run and jump about for a while
        page.evaluate("""window.__drv = setInterval(() => { const t = performance.now() / 1000; __axes(0, [Math.sin(t * 0.9) > 0 ? 1 : -1, 0, 0, 0]); __btn(0, 0, Math.floor(t * 2.2) % 2 === 0); __btn(0, 7, Math.sin(t * 0.5) > 0.8, 1); }, 16)""")
        page.wait_for_timeout(2600); shot("33-platforms"); page.wait_for_timeout(5000)
        print("platforms", page.evaluate("(()=>{const r=Couch.Engine.scenes[0].inner.rooms[0]; return {stars:r.stars.length, got:r.got, ps:r.ps.map(p=>[Math.round(p.x),Math.round(p.y),p.ground]), rope:Math.round(r.rope.length), inMap:r.ps.every(p=>!r.map.solidAt(p.x,p.y))}})()"))
        page.evaluate("clearInterval(window.__drv); __axes(0,[0,0,0,0]); for(let b=0;b<17;b++)__btn(0,b,false)"); page.wait_for_timeout(100)

        # Room 2: swarm, add bugs, measure
        tap(0, "rb"); page.wait_for_timeout(300)
        page.evaluate("""window.__drv = setInterval(() => { const t = performance.now() / 1000; __axes(0, [Math.cos(t * 0.7), Math.sin(t * 0.9), 0, 0]); __btn(0, 0, Math.floor(t * 1.2) % 2 === 0); }, 16)""")
        page.wait_for_timeout(2500); shot("34-swarm-300")
        for _ in range(4): tap(0, "x")
        page.wait_for_timeout(3000); shot("35-swarm-1100")
        print("swarm step cost", page.evaluate("(()=>{const r=Couch.Engine.scenes[0].inner.rooms[1]; const t0=performance.now(); for(let i=0;i<240;i++) r.update(1/120); const u=(performance.now()-t0)/240; return 'n='+r.n+' update '+u.toFixed(2)+' ms/step'})()"))
        print("swarm 1100", page.evaluate("JSON.stringify({n:Couch.Engine.scenes[0].inner.rooms[1].n, fps:+Couch.Engine.perf.fps.toFixed(1), upd:+Couch.Engine.perf.upd.toFixed(2), drw:+Couch.Engine.perf.drw.toFixed(2)})"))
        tap(0, "y"); page.wait_for_timeout(400); shot("36-swarm-lit")
        for _ in range(10): tap(0, "x", 40)
        page.wait_for_timeout(3000)
        print("swarm 3000", page.evaluate("JSON.stringify({n:Couch.Engine.scenes[0].inner.rooms[1].n, fps:+Couch.Engine.perf.fps.toFixed(1), upd:+Couch.Engine.perf.upd.toFixed(2), drw:+Couch.Engine.perf.drw.toFixed(2)})"))
        print("swarm step cost", page.evaluate("(()=>{const r=Couch.Engine.scenes[0].inner.rooms[1]; const t0=performance.now(); for(let i=0;i<240;i++) r.update(1/120); const u=(performance.now()-t0)/240; return 'n='+r.n+' update '+u.toFixed(2)+' ms/step'})()"))
        print("bugs inside walls", page.evaluate("(()=>{const r=Couch.Engine.scenes[0].inner.rooms[1]; let bad=0; r.world.each('bug', e=>{ if(r.map.solidAt(e.x,e.y)) bad++ }); return bad})()"))
        page.evaluate("clearInterval(window.__drv); __axes(0,[0,0,0,0]); for(let b=0;b<17;b++)__btn(0,b,false)"); page.wait_for_timeout(100)

        # Room 3: drive player 1 with the room's own bot logic so both seats work the line
        tap(0, "rb"); page.wait_for_timeout(300); page.keyboard.press("F3")
        page.evaluate("""window.__drv = setInterval(() => {
          const E = Couch.Engine; if (E.scenes.length > 1) { if (!window.__z) { window.__z = true; __axes(0,[0,0,0,0]); for (let b = 0; b < 17; b++) __btn(0, b, false); } return; } window.__z = false;
          const room = E.scenes[0].inner.rooms[2], seat = Couch.Input.seats[0];
          const ctl = { x: 0, y: 0, b: new Float32Array(16), set(n, v = true) { this.b[Couch.BTN[n]] = v === true ? 1 : v ? +v : 0; } };
          room.bot(seat, ctl); __axes(0, [ctl.x, ctl.y, 0, 0]); for (let b = 0; b < 16; b++) __btn(0, b, ctl.b[b] > 0.5);
        }, 16)""")
        page.wait_for_timeout(1800); shot("37-workshop")
        ok = False
        for _ in range(90):
            page.wait_for_timeout(500)
            if top() == "ChoiceScene": ok = True; break
        print(("ok   " if ok else "FAIL ") + "choice cards appeared, delivered", page.evaluate("Couch.Engine.scenes[0].inner.rooms[2].delivered"))
        if not ok: errors.append("no choice scene")
        page.wait_for_timeout(500); tap(0, "right"); page.wait_for_timeout(200); shot("38-choice")
        tap(0, "a"); expect("GameHost"); page.wait_for_timeout(300); shot("39-workshop-perk")
        print("mods", page.evaluate("JSON.stringify(Couch.Engine.scenes[0].inner.rooms[2].mods)"))
        for _ in range(60):
            page.wait_for_timeout(500)
            if top() == "ChoiceScene": break
        page.wait_for_timeout(1500)   # second pick belongs to the bot: it should choose by itself
        print(("ok   " if top() == "GameHost" else "FAIL ") + "bot chose its own perk", page.evaluate("JSON.stringify(Couch.Engine.scenes[0].inner.rooms[2].perks)"))
        page.evaluate("clearInterval(window.__drv); __axes(0,[0,0,0,0]); for(let b=0;b<17;b++)__btn(0,b,false)"); page.wait_for_timeout(200)
        tap(0, "start"); expect("PauseScene"); tap(0, "down"); tap(0, "down"); tap(0, "down"); tap(0, "a"); expect("LauncherScene")
        browser.close()
    for e in sorted(set(errors)): print(e)
    print("ERRORS" if errors else "NO ERRORS")


run()
