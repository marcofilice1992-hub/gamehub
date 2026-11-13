"""Swarm Night walkthrough: one fake controller plus the practice bot."""
import pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "test" / "shots"; OUT.mkdir(exist_ok=True)
FAKE = """
window.__pads = [null, null, null, null];
window.__mk = (i, id) => ({ index: i, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), vibrationActuator: { playEffect: () => Promise.resolve() } });
navigator.getGamepads = () => window.__pads;
window.__btn = (i, b, on, v) => { const p = window.__pads[i]; if (p) p.buttons[b] = { pressed: !!on, value: on ? (v == null ? 1 : v) : 0 }; };
window.__axes = (i, a) => { const p = window.__pads[i]; if (p) p.axes = a; };
"""
BTN = dict(a=0, b=1, x=2, y=3, start=9, up=12, down=13, left=14, right=15)
errors = []
G = "Couch.Engine.scenes[0].inner"
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
    def drive(on):
        if on: page.evaluate("""window.__drv = setInterval(() => { const E = Couch.Engine; if (E.scenes.length > 1 || !E.scenes[0].inner) { __axes(0,[0,0,0,0]); return; }
            const ctl = { x: 0, y: 0, b: new Float32Array(16), set() {}, clear() {} }; E.scenes[0].inner.bot(Couch.Input.seats[0], ctl); __axes(0, [ctl.x, ctl.y, 0, 0]); }, 16)""")
        else: page.evaluate("clearInterval(window.__drv); __axes(0,[0,0,0,0])")
    page.evaluate("__pads[0]=__mk(0,'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')"); page.wait_for_timeout(120)
    tap(0, "a"); tap(0, "y"); tap(0, "a"); expect("LauncherScene"); page.wait_for_timeout(200); shot("40-launcher")
    page.evaluate("(() => { const s = Couch.Engine.scenes[0]; s.col = 3; s.row = 1; })()")
    print("focus", page.evaluate("Couch.Engine.scenes[0].current().id"))
    tap(0, "a"); expect("BriefScene"); page.wait_for_timeout(200); shot("41-brief")
    page.evaluate("__btn(0,0,true)"); page.wait_for_timeout(800); page.evaluate("__btn(0,0,false)"); expect("GameHost")
    drive(True); page.wait_for_timeout(3000); shot("42-start"); page.keyboard.press("F3")
    page.keyboard.press("F8"); page.wait_for_timeout(500); expect("ChoiceScene"); page.wait_for_timeout(400); shot("43-choice")
    tap(0, "right"); tap(0, "a"); expect("GameHost")
    print("p1 weapons", page.evaluate(f"JSON.stringify({G}.ps[0].weapons.map(w=>w.id+w.lvl))"))
    page.keyboard.press("F8"); page.wait_for_timeout(1600); print(("ok   " if top() == "GameHost" else "FAIL ") + "bot picked its own card:", page.evaluate(f"JSON.stringify({G}.ps[1].weapons.map(w=>w.id+w.lvl).concat(Object.keys({G}.ps[1].passives)))"))
    for _ in range(5): page.keyboard.press("F7"); page.wait_for_timeout(150)
    for _ in range(8):                                        # pile up some upgrades so the screen looks like a real run
        page.keyboard.press("F8"); page.wait_for_timeout(300)
        if top() == "ChoiceScene": tap(0, "a")
        page.wait_for_timeout(900)
    page.wait_for_timeout(5000); shot("44-five-min")
    print("mid", page.evaluate(f"JSON.stringify({{t: Math.round({G}.t), bugs: {G}.world.count('enemy'), fps: +Couch.Engine.perf.fps.toFixed(0), upd: +Couch.Engine.perf.upd.toFixed(2), drw: +Couch.Engine.perf.drw.toFixed(2), hp: {G}.ps.map(p=>Math.round(p.hp))}})"))
    page.evaluate(f"(() => {{ const g = {G}, p = g.ps[1]; p.iframe = 0; g.hurtPlayer(p, 999); }})()"); page.wait_for_timeout(1500); shot("45-down")
    for _ in range(80):
        page.wait_for_timeout(250)
        if page.evaluate(f"!{G}.ps[1].down"): break
    print(("ok   " if page.evaluate(f"!{G}.ps[1].down") else "FAIL ") + "partner revived, revives =", page.evaluate(f"{G}.revives"))
    page.evaluate(f"(() => {{ for (const p of {G}.ps) {{ p.maxHp = p.hp = 4000; }} }})()")   # keep them alive so the boss can be looked at
    for _ in range(6): page.keyboard.press("F7"); page.wait_for_timeout(150)
    page.wait_for_timeout(4000); shot("46-boss")
    for _ in range(60):
        page.wait_for_timeout(200)
        if page.evaluate(f"{G}.boss && {G}.boss.st === 'aim'"): break
    page.wait_for_timeout(250); shot("47-boss-aim")
    print("boss", page.evaluate(f"JSON.stringify({{t: Math.round({G}.t), hp: Math.round({G}.boss.hp), bugs: {G}.world.count('enemy'), fps: +Couch.Engine.perf.fps.toFixed(0), drw: +Couch.Engine.perf.drw.toFixed(2)}})"))
    tap(0, "start"); expect("PauseScene"); shot("48-pause"); tap(0, "start"); expect("GameHost")
    page.evaluate(f"{G}.boss.hp = 50"); page.wait_for_timeout(1500); shot("49-boss-dead")
    for _ in range(40):
        page.wait_for_timeout(250)
        if top() == "ResultsScene": break
    expect("ResultsScene"); drive(False); page.wait_for_timeout(600); shot("50-results-won")
    print("save", page.evaluate("JSON.stringify(Couch.Save.data.games['swarm-night'])"))
    tap(0, "a"); expect("GameHost"); page.wait_for_timeout(500)
    page.evaluate(f"(() => {{ const g = {G}; for (const p of g.ps) {{ p.iframe = 0; g.hurtPlayer(p, 999); }} }})()"); page.wait_for_timeout(2600)
    expect("ResultsScene"); page.wait_for_timeout(500); shot("51-results-lost")
    br.close()
for e in sorted(set(errors)): print(e)
print("ERRORS" if errors else "NO ERRORS")
