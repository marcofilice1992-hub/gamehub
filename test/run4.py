"""Tank for Two walkthrough: one fake controller plus the practice bot, both seats."""
import pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "test" / "shots"; OUT.mkdir(exist_ok=True)
FAKE = open(ROOT / "test" / "run3.py").read().split('FAKE = """')[1].split('"""')[0]
BTN = dict(a=0, b=1, x=2, y=3, lb=4, rb=5, lt=6, rt=7, start=9, up=12, down=13, left=14, right=15)
errors = []; G = "Couch.Engine.scenes[0].inner"
with sync_playwright() as pw:
    br = pw.chromium.launch(channel="chrome"); page = br.new_page(viewport=dict(width=1920, height=1080))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
    page.add_init_script(FAKE); page.goto((ROOT / "master.html").as_uri()); page.wait_for_timeout(800)
    def shot(n): page.screenshot(path=str(OUT / f"{n}.png")); print("shot", n)
    def tap(i, b, ms=60): page.evaluate(f"__btn({i},{BTN[b]},true)"); page.wait_for_timeout(ms); page.evaluate(f"__btn({i},{BTN[b]},false)"); page.wait_for_timeout(90)
    def top(): return page.evaluate("Couch.Engine.scenes[Couch.Engine.scenes.length-1].constructor.name")
    def expect(n):
        page.wait_for_timeout(450); got = top(); print(("ok   " if got == n else "FAIL ") + "scene " + got)
        if got != n: errors.append(f"scene {got}, wanted {n}")
    def drive(on):                                            # the human seat plays with the game's own bot logic
        if on: page.evaluate("""window.__drv = setInterval(() => { const E = Couch.Engine; if (E.scenes.length > 1 || !E.scenes[0].inner) { if (!window.__z) { window.__z = 1; __axes(0,[0,0,0,0]); for (let b=0;b<17;b++) __btn(0,b,false); } return; } window.__z = 0;
            const ctl = { x: 0, y: 0, ax: 0, ay: 0, b: new Float32Array(16), set(n, v = true) { this.b[Couch.BTN[n]] = v === true ? 1 : v ? +v : 0; } };
            E.scenes[0].inner.bot(Couch.Input.seats[0], ctl); __axes(0, [ctl.x, ctl.y, 0, 0]); for (let b = 0; b < 16; b++) if (b !== 3 && b !== 9) __btn(0, b, ctl.b[b] > 0.05, ctl.b[b]); }, 16)""")
        else: page.evaluate("clearInterval(window.__drv); __axes(0,[0,0,0,0]); for(let b=0;b<17;b++) __btn(0,b,false)")
    def to_wave(n):
        for _ in range(700):
            if top() == "ChoiceScene": tap(0, "a")
            if page.evaluate(f"{G} && {G}.wave >= {n} && {G}.swapT <= 0"): return
            page.keyboard.press("F7"); page.wait_for_timeout(250)
    page.evaluate("__pads[0]=__mk(0,'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')"); page.wait_for_timeout(120)
    tap(0, "a"); tap(0, "y"); tap(0, "a"); expect("LauncherScene")
    print("focus", page.evaluate("Couch.Engine.scenes[0].current().id")); shot("60-launcher")
    tap(0, "a"); expect("BriefScene"); page.wait_for_timeout(200); shot("61-brief")
    page.evaluate("__btn(0,0,true)"); page.wait_for_timeout(800); page.evaluate("__btn(0,0,false)"); expect("GameHost")
    page.keyboard.press("F3"); drive(True); page.wait_for_timeout(1500); shot("62-wave1-banner")
    page.wait_for_timeout(9000); shot("63-wave1-fight")
    print("roles", page.evaluate(f"[{G}.driver.index, {G}.gunner.index]"), "tank", page.evaluate(f"JSON.stringify({{hp: Math.round({G}.tank.hp), mag: {G}.tank.mag, kills: {G}.stats.kills, shots: {G}.stats.shots}})"))
    drive(False); page.keyboard.press("F7")
    for _ in range(40):
        page.wait_for_timeout(250)
        if top() == "ChoiceScene": break
    expect("ChoiceScene"); page.wait_for_timeout(300); shot("64-choice"); tap(0, "a"); expect("GameHost")
    page.wait_for_timeout(300); shot("65-swap-window"); tap(0, "y"); page.wait_for_timeout(400)
    roles = page.evaluate(f"[{G}.driver.index, {G}.gunner.index]"); print(("ok   " if roles == [1, 0] else "FAIL ") + "seats swapped", roles)
    if roles != [1, 0]: errors.append("swap failed")
    drive(True); page.wait_for_timeout(6000)
    page.evaluate(f"(() => {{ const t = {G}.tank; t.mag = 1; t.rel = null; }})()"); page.wait_for_timeout(700); shot("66-gunner-reload")
    to_wave(5); page.wait_for_timeout(9000); shot("67-wave5-siege")
    print("wave5", page.evaluate(f"JSON.stringify({{wave: {G}.wave, bugs: {G}.world.count('enemy'), siege: {G}.world.tags.get('enemy').some(e => e.alive && e.type === 'siege'), hp: Math.round({G}.tank.hp), fps: +Couch.Engine.perf.fps.toFixed(0), upd: +Couch.Engine.perf.upd.toFixed(2), drw: +Couch.Engine.perf.drw.toFixed(2)}})"))
    tap(0, "start"); expect("PauseScene"); shot("68-pause"); tap(0, "start"); expect("GameHost")
    page.evaluate(f"(() => {{ const g = {G}; g.tank.iframe = 0; g.hurtTank(9999, true); }})()"); page.wait_for_timeout(3000)
    expect("ResultsScene"); drive(False); page.wait_for_timeout(500); shot("69-results-lost")
    tap(0, "a"); expect("GameHost"); page.wait_for_timeout(500); to_wave(10)
    page.evaluate(f"{G}.tank.hp = {G}.tank.maxHp = 99999"); page.keyboard.press("F7")
    for _ in range(120):
        page.wait_for_timeout(300)
        if top() == "ResultsScene": break
        if page.evaluate(f"!!{G} && {G}.wave >= 10"): page.keyboard.press("F7")
    if top() != "ResultsScene": print("state", page.evaluate(f"JSON.stringify({{wave: {G}.wave, fighting: {G}.fighting, skip: {G}.skip, bugs: {G}.world.count('enemy'), over: {G}.over, left: {G}.left, swapT: {G}.swapT, routines: {G}.k.routines.list.length, time: Math.round({G}.time)}})"))
    expect("ResultsScene"); page.wait_for_timeout(500); shot("70-results-won")
    print("save", page.evaluate("JSON.stringify(Couch.Save.data.games['tank-for-two'])"))
    br.close()
for e in sorted(set(errors)): print(e)
print("ERRORS" if errors else "NO ERRORS")
