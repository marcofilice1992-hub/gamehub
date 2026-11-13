import sys, pathlib, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
seeds = [int(a) for a in sys.argv[1:]] or [1, 2, 3, 4]
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome"); p = b.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e))); p.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
    p.goto((ROOT / "master.html").as_uri()); p.wait_for_timeout(500)
    for s in seeds:
        r = p.evaluate("""seed => { const t0 = performance.now(); const r = Couch.simulate('tank-for-two', { seed, step: 1/30, seconds: 1500 }); const g = r.inner, t = g.tank;
          return { seed, won: r.result ? r.result.won : null, t: Math.round(g.time), wave: g.wave, hp: Math.round(t.hp), max: t.maxHp, kills: g.stats.kills, shots: g.stats.shots,
            perfect: g.stats.perfect, rams: g.stats.rams, crates: g.stats.crates, res: t.res, up: g.taken, ms: Math.round(performance.now() - t0) } }""", s)
        print(json.dumps(r))
    for e in errs[:10]: print("ERR", e)
    b.close()
