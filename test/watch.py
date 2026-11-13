import pathlib, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "test" / "watch"; OUT.mkdir(exist_ok=True)
for f in OUT.glob("*.png"): f.unlink()
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 8
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome"); p = b.new_page(viewport=dict(width=1920, height=1080)); p.on("pageerror", lambda e: print("ERR", e))
    p.goto((ROOT / "master.html").as_uri()); p.wait_for_timeout(600)
    p.evaluate(f"""() => {{ const C = Couch, I = C.Input; I.addBot(I.seats[0]); I.addBot(I.seats[1]); C.Save.data.settings.perf = true;
      const def = C.games.find(g => g.id === 'swarm-night'); const orig = C.makeKit; C.makeKit = (d, o = {{}}) => orig(d, Object.assign({{ seed: {seed} }}, o));
      C.Engine.go(() => new C.scenes.GameHost(def)); C.Engine.timeScale = 3; }}""")
    for i in range(16):
        p.wait_for_timeout(4000)
        st = p.evaluate("(() => { const h = Couch.Engine.scenes[0]; if (!h.inner) return h.constructor.name; const g = h.inner; return Math.round(g.t) + 's hp ' + g.ps.map(q => Math.round(q.hp)).join('/') + ' foes ' + g.world.count('enemy') })()")
        print(i, st); p.screenshot(path=str(OUT / f"w{i:02d}.png"))
        if "Results" in st: break
    b.close()
