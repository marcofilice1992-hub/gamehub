# Couch Co-op

Two-player couch co-op games for PC with controllers. Everything — the shared engine, the launcher and every game — ships as one file: `master.html`.

## Play

1. Open `master.html` in Chrome on the PC (the file, not a hosted copy: some embedded viewers block controllers).
2. Press F11 for fullscreen.
3. Each player presses A on their controller to take a seat. No second player? Press Y for a practice bot.
4. Click or press a key once so the browser allows sound.

Xbox, PlayStation and Switch controllers are recognised and show their own button pictures. Keyboard stand-in: W A S D + Space for player 1, arrows + Enter for player 2.

## Games

| Slot | Game | Status |
| --- | --- | --- |
| 10 | Tank for Two — one drives, one guns, ten waves | Playable |
| 11 | Swarm Night — survive the swarm, then kill the Mother | Playable |
| 01–09, 12–15 | The rest of the 15 specced games | Not built |

The launcher also has Test Range (a small complete game), Engine Lab (platforms, swarm and workshop demo rooms), a controller test and settings.

## Build

The shipped file is assembled from the parts in `src/`:

```sh
./build.sh        # writes master.html
```

| File | What it holds |
| --- | --- |
| `src/00-head.html` | Page shell |
| `src/10-core.js` | Tokens, saves, sound and music, input (two seats, practice bot), drawing helpers |
| `src/20-engine.js` | Camera, particles, loop, scenes, game plug-in API |
| `src/15-vendor-3d.js` | three.js and cannon-es, vendored for 3D games as `Couch.lib.THREE` and `Couch.lib.CANNON`. Built by `tools/vendor.sh`, never edited by hand |
| `src/25-kit.js` | World, tilemaps, platformer, rope, sprites, scripts, route finding, hex grids, lighting, interact and carry, choice cards, headless simulate |
| `src/30-games.js` | The 15-slot manifest and the Test Range |
| `src/35-lab.js` | Engine Lab |
| `src/36-swarm-night.js` | Swarm Night |
| `src/37-tank-for-two.js` | Tank for Two |
| `src/40-start.js` | Starts the engine |

A new game is one more file in `src/` that calls `Couch.register({ id, create(k) { … } })` with the id of its slot, added to the list in `build.sh`.

## 3D libraries

Games that need 3D use two MIT-licensed libraries that are inlined into `master.html`, so nothing loads over the network:
three.js 0.187.0 for drawing and cannon-es 0.20.0 for rigid-body physics. Together they add about 640 KB.
`tools/vendor-entry.mjs` lists the classes that are included. To change the list or a version, edit it, run
`./tools/vendor.sh` (needs Node and the npm registry), then `./build.sh`. A new physics version changes every seeded
result, so re-run the baseline after an upgrade.

## Developer keys

F3 frame timings · F4 collider outlines · F6 slow motion · F7 and F8 per-game cheats (Swarm Night: skip a minute, level up; Tank for Two: clear the wave, repair the hull).

## Tests

The scripts in `test/` drive `master.html` in headless Chrome with Playwright and fake controllers.

| Script | Checks |
| --- | --- |
| `run.py` | Seats, launcher, settings, controller test, Test Range, pause, disconnect, results |
| `run2.py` | Game kit unit checks, bot simulation, Engine Lab |
| `run3.py` | Swarm Night walkthrough |
| `run4.py` | Tank for Two walkthrough |
| `sim.py`, `simtank.py` | Headless bot balance runs: `python3 test/sim.py 1 2 3` (seeds) |

Balance runs can also be started from the browser console: `Couch.simulate('swarm-night', { seed: 1, step: 1 / 30 })`.

## Game Builder agent

A scheduled agent builds the remaining games one at a time and pitches new game ideas that could replace any slot.
It works only through pull requests that you merge after playing.

| Path | What it holds |
| --- | --- |
| `agents/RUNBOOK.md` | How each run works: build, polish, ideas, apply ideas, or stop |
| `agents/QUEUE.md` | Build order |
| `agents/BUILD_LOG.md`, `agents/IDEAS.md`, `agents/ENGINE_REQUESTS.md` | What each run did, every idea pitched, and engine gaps |
| `specs/` | One spec per slot |
| `tools/check.mjs` | The acceptance harness: `node tools/check.mjs --list`, `--baseline`, or `--slot <id>` |
| `ideas/` | Idea pitches, one file per ideas run |
| `retired/` | Games taken out of a slot, kept so they can come back |

To answer an ideas pull request, comment `take 1`, `take 1 and 3`, `take 2 for slot 7` or `none`.
Playtest notes go as comments on a game's pull request.
