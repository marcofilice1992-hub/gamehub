import pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome"); p = b.new_page(viewport=dict(width=1920, height=1080)); p.on("pageerror", lambda e: print("ERR", e))
    p.goto((ROOT / "master.html").as_uri()); p.wait_for_timeout(600)
    print(p.evaluate("""() => {
      const C = Couch, I = C.Input; I.addBot(I.seats[0]); I.addBot(I.seats[1]);
      const def = C.games.find(g => g.id === 'swarm-night'), k = C.makeKit(def, { seed: 4, players: I.joined() }), g = def.create(k);
      g.t = 560; for (let i = 0; i < 30 * 40; i++) { for (const s of k.players) { s.device.ctl.clear(); g.bot(s, s.device.ctl); C.Input.readBot(s.device); s._update(1/30); } k._tick(1/30); g.update(1/30); }
      const c = C.Engine.c, time = (fn, n = 20) => { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return ((performance.now() - t0) / n).toFixed(2); };
      const cam = g.cam, v = cam.view(), out = { bugs: g.world.count('enemy'), gems: g.gems, zoom: cam.zoom.toFixed(2) };
      c.setTransform(C.Engine.scale, 0, 0, C.Engine.scale, C.Engine.ox, C.Engine.oy);
      out.map = time(() => { cam.begin(c); g.map.draw(c, v); cam.end(c); });
      out.world = time(() => { cam.begin(c); g.world.draw(c, v); cam.end(c); });
      out.dark = time(() => { const d = g.dark; d.begin(); for (const p of g.ps) d.light(900, 500, 640 * cam.zoom); d.light(960, 540, 1300 * cam.zoom, 0.35); d.end(c); });
      out.hud = time(() => g.hud());
      out.full = time(() => g.draw());
      out.update = time(() => g.update(1/120), 120);
      return JSON.stringify(out);
    }"""))
    b.close()
