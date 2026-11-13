import pathlib, json, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome"); p = b.new_page(); p.on("pageerror", lambda e: print("ERR", e))
    p.goto((ROOT / "master.html").as_uri()); p.wait_for_timeout(500)
    print(p.evaluate("""() => {
      const C = Couch, def = C.games.find(g => g.id === 'swarm-night'), seats = [];
      for (let i = 0; i < 2; i++) { const s = new C.Seat(i), d = C.Input.makeBot(i); s.device = d; d.seat = s; seats.push(s); }
      C.Sfx.mute = true; const k = C.makeKit(def, { sim: true, seed: 1, players: seats, assists: [0,0] }), g = def.create(k), step = 1/30, out = [];
      const src = {}; const orig = g.hurtPlayer.bind(g); g.hurtPlayer = (p, dmg) => { if (p.iframe <= 0 && !p.down) { const key = dmg.toFixed(0); src[key] = (src[key]||0) + 1; } orig(p, dmg); };
      for (let i = 0; i < 30 * 70 && !k.result; i++) {
        for (const s of seats) { s.device.ctl.clear(); g.bot(s, s.device.ctl); }
        for (const s of seats) { const d = s.device; d.pb.set(d.b); C.Input.readBot(d); s._update(step); }
        k.time += step; k._tick(step); g.update(step);
        if (i % 60 === 0) out.push(g.t.toFixed(0) + 's ' + g.ps.map(p => `[${p.x|0},${p.y|0} hp${p.hp|0} mv${p.seat.move.x.toFixed(1)},${p.seat.move.y.toFixed(1)}${p.down?' DOWN':''}]`).join(' ') + ' foes ' + g.world.count('enemy') + ' near ' + g.ps.map(p=>{let n=0; g.world.near(p.x,p.y,200,'enemy',()=>n++); return n}).join('/'));
      }
      out.push(JSON.stringify(src)); return out.join('\\n');
    }"""))
    b.close()
