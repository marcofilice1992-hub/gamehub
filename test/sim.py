"""Balance runs for Swarm Night: bots play with no screen."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
seeds = [int(a) for a in sys.argv[1:]] or [1, 2, 3, 4]
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome"); p = b.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e))); p.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
    p.goto((ROOT / "master.html").as_uri()); p.wait_for_timeout(500)
    for s in seeds:
        r = p.evaluate("""seed => { const t0 = performance.now(); const r = Couch.simulate('swarm-night', { seed, step: 1/30, seconds: 1100 }); const g = r.inner;
          return { seed, won: r.result ? r.result.won : null, t: Math.round(g.t), lvl: g.level, kills: g.kills, peak: g.peak, revives: g.revives,
            boss: g.boss ? Math.round(100 * g.boss.hp / g.boss.max) : null, bossT: g.boss ? Math.round(g.t - 600) : null,
            pairs: Object.keys(g.pairs).join(','), hurt: g.hurtLog, w: g.ps.map(p => p.weapons.map(w => w.id + w.lvl).join(' ')), hp: g.ps.map(p => Math.round(p.hp)),
            ms: Math.round(performance.now() - t0) } }""", s)
        print(json.dumps(r))
    for e in errs[:10]: print("ERR", e)
    b.close()
