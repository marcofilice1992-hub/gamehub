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
| LT / RT | Shift / F | , / . | Hook (set before the shot) |
| Left stick left/right while swinging | A / D while swinging | ← / → while swinging | Spin: turn the wrist for more (or less) hook |
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
| `scripts/bowler.gd` | The bowlers: rigged characters dressed for the alley; clips underneath, the bowling posed over them |
| `scripts/outfit.gd` | The bowlers' loose shirts and trousers, built from the body mesh |
| `scripts/decor.gd` | The hall around the lanes: approach, carpeted concourse and seating, ball returns, wall panels and posters, pit curtain, dust |
| `shaders/` | Lane boards and oil, pins, ball, kickback art, the bowlers' clothes and hair |
| `characters/` | The bowlers' bodies, hair and animation clips (Quaternius, CC0: see below) |
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
bot-against-bot matches.

`godot --path godot/tenpin-grudge -- --demo` plays a bot match with nothing saved.
`-- --shots=DIR --seed=N` plays a quick bot match and saves a screenshot of each stage.

## The bowlers

The bodies and hair are Quaternius's **Universal Base Characters** (male and female, CC0), and the clips are from his
**Universal Animation Library** 1 and 2 (CC0): <https://quaternius.com>. `characters/LICENSE-Quaternius.txt` has the licence.

- Clothes are real, loose meshes (`scripts/outfit.gd`), built from each body when the game starts: a boxy, untucked
  bowling shirt that hangs straight down from the chest, with short flared sleeves, panels, piping, collar, buttons and
  cuffs; and straight-leg trousers, loose from the knee down, with a crease and a break over the shoes. They keep the
  body's skin weights so they move with it, except that the shirt hangs from the hips rather than the thighs and the
  trouser cuffs follow the shins rather than the feet. Folds are bumped in by `shaders/cloth.gdshader`. Under the clothes
  the skin is pulled in 3 cm so it can't poke through. Shoes are still painted on.
- Clips play for the idles and reactions: waiting, folded arms when the other player strikes, a nod and thumbs up for a
  spare, hands round the mouth for a heckle, a dance for the match winner and a head shake for the loser. The neighbours
  wait on their phones, with a drink, or chatting.
- No clip bowls, so the hold, approach, slide, release and follow-through are posed in code (the `p_*` functions) and laid
  over the clip bone by bone. A mask picks which bones the pose owns: all of them while bowling, the upper body when
  holding the ball (the legs keep the idle's weight shifts), none for a plain clip.
- `characters/clips.res` holds only the 20 clips used. To rebuild it from the two library files:
  `godot --headless --path godot/tenpin-grudge res://tools/make_clips.tscn -- --src=FOLDER`.
- `tools/pose_sheet.tscn` renders every pose and clip on both bodies to one image, for checking by eye.

## Physics, as measured

`tests/carry.tscn` rolls balls into a full rack at set entry angles and offsets from the head pin; `tests/sweep.tscn` scores
settings against the USBC's free-fall pinsetter results (Sept 2021 string-pinsetter report).

| Entry angle | Strikes over 0-12 cm from the head pin | USBC free-fall |
|---|---|---|
| 0° | 35% | 36% |
| 2° | 46% | 41% |
| 4° | 56% | 53% |
| 6° | 58% | 59% |

- Strikes peak at 6.5-8 cm right of the head pin (the USBC's 2.5-3.0 in), at 85-100% from 2° up. Light hits leave the 10 pin; high hits the 4 and 7.
- A hook ball holds its line through the pins (its roll keeps driving it); a straight ball is pushed off it.
- Pins sit up to 4 mm off their spots, as with a real pinsetter, so the same shot does not always carry. A given rack and shot always count the same.
- Practice bot, 8 matches: averages 132 at assist 0 and 204 at assist 2 (the browser version: 138 and 178).

## Export

Install the 4.7.2 export templates, then:

```
godot --headless --path godot/tenpin-grudge --export-release "Windows Desktop" build/TenpinGrudge.exe
```
