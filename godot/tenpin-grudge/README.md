# Tenpin Grudge (Godot)

Two-player couch bowling, ported from the browser version in `src/38-tenpin-grudge.js` to Godot 4.7 with Jolt physics.
It is a standalone game: `master.html` and the other 14 games are untouched.

## Play it

**Windows:** run `TenpinGrudge.exe`. It starts full screen; change that in the pause menu.

**From source:** install Godot 4.7.2, open this folder (`godot/tenpin-grudge`) in the editor and press F5,
or run `godot --path godot/tenpin-grudge`.

### Seats

| | |
|---|---|
| Join | A on a controller, Space (left keyboard), Enter (right keyboard) |
| Practice bot | Y fills the empty seat with the bot, or takes it out |
| Assist | X cycles your seat: off, guide line, full path with bumpers |
| Leave | B |
| Bowl | Start (Menu, Options, +), Esc or P once both seats are filled |

### Bowling

| Controller | Left keyboard | Right keyboard | |
|---|---|---|---|
| Left stick / D-pad | A D | ← → | Step sideways |
| LB / RB | 1 / 2 | [ / ] | Aim (tap for a tenth of a degree, hold to sweep) |
| LT / RT | Shift / F | , / . | Hook |
| Right stick down, then up | hold Space, let go | hold Enter, let go | Swing, then bowl |
| B | Q | Backspace | Cancel the swing |
| Y | R | / | Change ball |
| X | E | ; | Heckle, while the other player bowls |
| A | Space | Enter | Skip a result or replay |
| Start | Esc | P | Pause |

## Graphics

Pause menu → Graphics: **Auto** (default), Low, Medium, High, Ultra. Changes apply at once. F3 shows frame rate, frame time,
the tier and draw calls.

| Tier | Resolution and AA | Effects |
|---|---|---|
| Low | FSR 1 at 67%, FXAA | Glow only; hard shadows; neighbours stand still |
| Medium | FSR 2 at 77% (temporal AA) | + reflections on the oil (SSR), ambient occlusion, soft shadows |
| High | FSR 2 at 100% as AA | + bounce light (SSIL), haze with light beams, depth of field on the close cameras |
| Ultra | FSR 2 at 100% | + SDFGI global illumination, finer haze, better AO and shadows |

Auto starts at High and steps down a tier if the game runs under 50 fps for three seconds. It never steps back up by itself.
An RTX 3060 Ti should hold High at 1080p; try Ultra, and use F3 to check.

## How it is put together

| File | What it does |
|---|---|
| `scripts/tune.gd` | Every value that sets the feel, and the lane's measurements. Tune here. |
| `scripts/score.gd` | Ten-pin scoring: frames, bonuses, the tenth frame, best and worst case, splits |
| `scripts/lane.gd` | Jolt physics for lane 14: pins, ball, hook and lane friction, the settle and count |
| `scripts/match.gd` | The match: turns, swing, release, count, card, roll-offs, heckles, coaching, the practice bot |
| `scripts/hall.gd` | The 3D hall, pins and ball drawn from the physics, lane screens, neighbours, cameras, graphics tiers |
| `scripts/fx.gd` | GPU particles: impact dust and chips, strike confetti |
| `shaders/` | Lane boards and oil, pins, ball, kickback art |
| `scripts/hud.gd`, `scripts/gx.gd` | Scorecard, panels, meters and callouts, drawn on a 1920×1080 frame |
| `scripts/pads.gd` | Two seats: controllers, two keyboard halves, the bot; rumble |
| `scripts/store.gd` | Settings and the head-to-head record, saved to the user folder |
| `scripts/sfx.gd` | Every sound, synthesised at start-up (no audio files) |
| `main.gd` | Seats, pause menu, results |

Physics runs at 240 ticks a second. Hook and friction are applied every tick, so a shot plays the same at any frame rate.
Pins and ball are drawn blended between the last two ticks, so they move evenly on a 60, 144 or 165 Hz screen.
Every rack gets a fresh physics world, so the same shot on the same rack always counts the same pins.

## Checks

```
godot --headless --path godot/tenpin-grudge res://tests/run.tscn --fixed-fps 240
```

These cover scoring, pinfall (pocket carry, hook against straight, repeatability, gutters, bumpers) and eight full
bot-against-bot matches. `tests/calib.tscn` reruns the pin calibration.

`godot --path godot/tenpin-grudge -- --demo` plays a bot match with nothing saved.
`-- --shots=DIR --seed=N` plays a quick bot match and saves a screenshot of each stage.

## Balance, as measured

- An exact pocket hit (6.5 cm right of the head pin) strikes every time, straight or hooked. Hits off the pocket leave pins.
  Same shot on the same rack, same count, every time.
- Practice bot, 8 matches: averages 136 at assist 0 and 200 at assist 2 (the browser version: 138 and 178).
- Pin friction, bounce and spin damping are in `tune.gd`; `tests/calib.tscn` measures them.

## Export

Install the 4.7.2 export templates, then:

```
godot --headless --path godot/tenpin-grudge --export-release "Windows Desktop" build/TenpinGrudge.exe
```
