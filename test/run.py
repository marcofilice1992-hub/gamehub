"""Drives master.html in headless Chrome with two fake controllers and walks every screen."""
import sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / "master.html").as_uri()
OUT = ROOT / "test" / "shots"; OUT.mkdir(parents=True, exist_ok=True)

FAKE = """
window.__pads = [null, null, null, null]; window.__rumble = 0;
window.__mk = (i, id) => ({ index: i, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  vibrationActuator: { playEffect: () => { window.__rumble++; return Promise.resolve(); } } });
navigator.getGamepads = () => window.__pads;
window.__btn = (i, b, on, v) => { const p = window.__pads[i]; if (p) p.buttons[b] = { pressed: !!on, value: on ? (v == null ? 1 : v) : 0 }; };
window.__axes = (i, a) => { const p = window.__pads[i]; if (p) p.axes = a; };
"""
BTN = dict(a=0, b=1, x=2, y=3, lb=4, rb=5, lt=6, rt=7, select=8, start=9, up=12, down=13, left=14, right=15)
errors = []


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport=dict(width=1920, height=1080))
        page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        page.add_init_script(FAKE)
        page.goto(SRC); page.wait_for_timeout(900)

        def shot(name): page.screenshot(path=str(OUT / f"{name}.png")); print("shot", name)
        def tap(i, b, ms=60):
            page.evaluate(f"__btn({i},{BTN[b]},true)"); page.wait_for_timeout(ms)
            page.evaluate(f"__btn({i},{BTN[b]},false)"); page.wait_for_timeout(90)
        def top(): return page.evaluate("Couch.Engine.scenes[Couch.Engine.scenes.length-1].constructor.name")
        def expect(name):
            page.wait_for_timeout(500); got = top()
            print(("ok  " if got == name else "FAIL") + f" scene {got} (want {name})")
            if got != name: errors.append(f"scene {got}, wanted {name}")

        shot("01-join-empty")
        page.evaluate("__pads[0]=__mk(0,'Xbox 360 Controller (XInput STANDARD GAMEPAD)'); __pads[1]=__mk(1,'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')")
        page.wait_for_timeout(120); tap(0, "a"); shot("02-join-one"); tap(1, "a"); page.wait_for_timeout(300); shot("03-join-both")
        print("seats", page.evaluate("Couch.Input.seats.map(s=>s.device&&s.device.label)"))
        tap(0, "a"); expect("LauncherScene"); shot("04-launcher")
        tap(0, "up"); tap(0, "up"); tap(0, "right"); page.wait_for_timeout(150); shot("05-launcher-card")
        tap(0, "a"); expect("LauncherScene")                      # unbuilt: refuses
        tap(1, "down"); tap(1, "down"); tap(1, "down")
        tap(1, "right"); tap(1, "right"); tap(1, "a"); expect("SettingsScene"); tap(0, "down"); tap(0, "right"); shot("06-settings")
        tap(0, "b"); expect("LauncherScene")
        tap(0, "left"); tap(0, "a"); expect("PadTestScene")
        page.evaluate("__axes(0,[0.8,-0.5,-0.3,0.9]); __btn(0,0,true); __btn(0,6,true,0.62); __btn(0,12,true); __btn(1,2,true); __btn(1,7,true,1); __btn(1,5,true); __axes(1,[-1,0,0,0])")
        page.wait_for_timeout(250); shot("07-padtest")
        page.evaluate("for(const i of [0,1]){__axes(i,[0,0,0,0]); for(let b=0;b<17;b++)__btn(i,b,false)}")
        page.evaluate("__btn(0,9,true)"); page.wait_for_timeout(900); page.evaluate("__btn(0,9,false)"); expect("LauncherScene")
        tap(0, "left"); tap(0, "left"); tap(0, "a"); expect("BriefScene")
        tap(1, "right"); page.wait_for_timeout(100); page.evaluate("__btn(0,0,true)"); page.wait_for_timeout(330); shot("08-brief")
        page.evaluate("__btn(1,0,true)"); page.wait_for_timeout(900); page.evaluate("__btn(0,0,false);__btn(1,0,false)")
        expect("GameHost"); page.wait_for_timeout(400); shot("09-game-start")

        # Bots: each walks to a plate, then to the nearest pellet, dashing when a drone is close.
        page.evaluate("""
        window.__bot = setInterval(() => {
          const E = Couch.Engine, host = E.scenes[0]; if (!host || !host.inner || !host.inner.players || E.scenes.length > 1) return;
          const g = host.inner, plates = [{x:480,y:730},{x:2120,y:730}];
          g.players.forEach((p, n) => {
            let tx, ty;
            if (!g.open) { tx = plates[n].x; ty = plates[n].y; }
            else { let best = 1e18; for (const cell of g.grid.cells) for (const o of cell) { const d = (o.x-p.x)**2 + (o.y-p.y)**2; if (d < best) { best = d; tx = o.x; ty = o.y; } } }
            const mate = g.players.find(q => q !== p && q.down); if (mate) { tx = mate.x; ty = mate.y; }
            if (tx == null) { __axes(n, [0,0,0,0]); return; }
            const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy) || 1, near = m < 20;
            __axes(n, near ? [0,0,0,0] : [dx/m, dy/m, 0, 0]);
            const danger = g.drones.some(d => Math.hypot(d.x-p.x, d.y-p.y) < 150);
            __btn(n, 0, danger && p.dashCd <= 0);
          });
        }, 16);
        """)
        page.wait_for_timeout(3500); shot("10-game-mid")
        page.evaluate("__btn(1,7,true,0.7)"); tap(0, "x"); page.wait_for_timeout(120); shot("11-game-ping"); page.evaluate("__btn(1,7,false)")
        tap(1, "start"); expect("PauseScene"); shot("12-pause"); tap(1, "start"); expect("GameHost")
        # knock one player down, check revive by the partner bot
        page.evaluate("(()=>{const g=Couch.Engine.scenes[0].inner; g.players[1].down=true; g.players[1].revive=0;})()")
        page.wait_for_timeout(700); shot("13-game-down")
        # drop a controller mid-game
        page.evaluate("window.__keep=__pads[1]; __pads[1]=null"); expect("DisconnectScene"); shot("14-disconnect")
        page.evaluate("__pads[1]=window.__keep"); expect("PauseScene"); tap(0, "a"); expect("GameHost")
        ok = False
        for _ in range(140):
            page.wait_for_timeout(1000)
            if top() == "ResultsScene": ok = True; break
        st = page.evaluate("(()=>{const h=Couch.Engine.scenes[0]; return h.r ? {won:h.r.won, score:h.r.score, stats:h.r.stats} : (h.inner ? {pellets:h.inner.pellets, total:h.inner.total, t:h.kit.time} : null)})()")
        print("result", st)
        page.evaluate("clearInterval(window.__bot); for(const i of [0,1]){__axes(i,[0,0,0,0]); for(let b=0;b<17;b++)__btn(i,b,false)}")
        if not ok: errors.append("game did not reach results")
        page.wait_for_timeout(700); shot("15-results")
        print("perf", page.evaluate("JSON.stringify(Couch.Engine.perf, (k,v)=>typeof v==='number'?+v.toFixed(3):v)"), "rumbles", page.evaluate("__rumble"))
        print("save", page.evaluate("localStorage.getItem('couch-coop-v1')"))
        # lose path
        tap(0, "a"); expect("GameHost")
        page.evaluate("(()=>{const g=Couch.Engine.scenes[0].inner; for(const p of g.players){p.down=true;p.revive=0;p.x=p.i?2800:200;}})()")
        page.wait_for_timeout(2200); expect("ResultsScene"); shot("16-results-lost")
        tap(0, "down"); tap(0, "a"); expect("LauncherScene"); shot("17-launcher-after")
        tap(0, "b"); expect("JoinScene")
        page.close()

        # keyboard only, and a phone-sized window
        page = browser.new_page(viewport=dict(width=390, height=844), has_touch=True)
        page.on("pageerror", lambda e: errors.append(f"[pageerror phone] {e}"))
        page.goto(SRC); page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "20-phone-join.png"))
        page.touchscreen.tap(195, 420); page.wait_for_timeout(300); page.touchscreen.tap(195, 420); page.wait_for_timeout(700)
        print("phone scene", page.evaluate("Couch.Engine.scenes[0].constructor.name"), page.evaluate("Couch.Input.seats.map(s=>s.device&&s.device.label)"))
        page.screenshot(path=str(OUT / "21-phone-launcher.png")); page.close()

        page = browser.new_page(viewport=dict(width=1366, height=768))
        page.on("pageerror", lambda e: errors.append(f"[pageerror kb] {e}"))
        page.goto(SRC); page.wait_for_timeout(600)
        page.keyboard.press("Space"); page.wait_for_timeout(200); page.keyboard.press("Enter"); page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "22-kb-join.png"))
        page.keyboard.press("Space"); page.wait_for_timeout(700); page.keyboard.press("Space"); page.wait_for_timeout(700)
        print("kb scene", page.evaluate("Couch.Engine.scenes[0].constructor.name"))
        page.screenshot(path=str(OUT / "23-kb-brief.png"))
        browser.close()
    for e in sorted(set(errors)): print(e)
    print("ERRORS" if errors else "NO ERRORS")


run()
