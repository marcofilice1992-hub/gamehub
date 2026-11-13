import pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "test" / "shots"
G = "Couch.Engine.scenes[0].inner"
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome"); p = b.new_page(viewport=dict(width=1920, height=1080)); p.on("pageerror", lambda e: print("ERR", e))
    p.goto((ROOT / "master.html").as_uri()); p.wait_for_timeout(600)
    p.evaluate("""() => { const C = Couch, I = C.Input; I.addBot(I.seats[0]); I.addBot(I.seats[1]);
      const def = C.games.find(g => g.id === 'tank-for-two'); C.Engine.go(() => new C.scenes.GameHost(def)); }""")
    p.wait_for_timeout(800)
    for _ in range(400):
        if p.evaluate(f"{G} && {G}.wave >= 10"): break
        p.keyboard.press("F7"); p.wait_for_timeout(120)
    p.evaluate(f"{G}.tank.hp = {G}.tank.maxHp = 5000"); p.evaluate("Couch.Engine.timeScale = 2")
    for i in range(6):
        p.wait_for_timeout(2500); st = p.evaluate(f"(() => {{ const g = {G}; if (!g) return 'done'; const c = {{}}; g.world.each('enemy', e => c[e.type] = (c[e.type]||0)+1); return JSON.stringify(c) }})()")
        print(i, st); p.screenshot(path=str(OUT / f"75-wave10-{i}.png"))
    b.close()
