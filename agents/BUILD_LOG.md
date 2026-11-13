# Build log

One entry per run, newest at the bottom. A build or polish entry starts with a heading that holds the slot id,
then the plan, then the result. Check 10 of `tools/check.mjs` reads the last entry for the slot and needs every
line below, each followed by text.

```
## <YYYY-MM-DD> · <slot-id> · build | polish | replaces <old-id>
- Scope: (the First playable checklist)
- Kit: (modules used)
- Two-player action: ...
- Hard part: ...
- Assists: (what Light and Strong change, per seat)
- Rule 1: (one shared screen) ...
- Rule 2: (no hidden information) ...
- Rule 3: (win and lose together) ...
- Rule 4: (revive, never eliminate) ...
- Rule 5: (an action neither can do alone) ...
- Rule 6: (3 to 15 minute sessions, instant restart) ...
- Rule 7: (per-player assists) ...
- Result: (checks passed or failed, bot wins, PR number)
```

## 2026-11-13 · baseline · setup
- Master: `master.html` as committed on 13 Nov 2026 (4,047 lines, identical to the Couch Co-op artifact and to what `build.sh` makes from `src/`). Built: Tank for Two (slot 10), Swarm Night (slot 11), plus Test Range and Engine Lab.
- Bot wins over seeds 1 to 10 at 30 steps a second: Swarm Night 4 of 10 at assist 0 and 4 of 10 at assist 2; Tank for Two 8 of 10 and 9 of 10; Test Range 6 of 10 and 10 of 10.
- Winning runs: Swarm Night 11.7 to 12.2 min, Tank for Two 9.1 to 10.9 min.
- Engine Lab never ends by design (a demo); the harness treats it as a utility.
- Harness proven on a re-added Tank for Two (new build), a swap of Tank for Two into a renamed slot (replacement), and a tampered branch (caught a changed neighbour, a missing retired copy and a network call).

## 2026-11-14 · tenpin-grudge · replaces slow-boat
- Scope: one lane; swing and hook controls; rigid-body pins; ten-pin scoring on two scorecards; a roll-off for ties, a draw after three; per-seat assists; a bot for each seat. Built in chat at Marco's request, ahead of the queue.
- Kit: Particles for confetti, the kit's timers, `Couch.lib.THREE` for the picture and `Couch.lib.CANNON` for the physics. No Camera, World or Tilemap: the lane is 3D.
- Two-player action: none inside a ball. It is a match: you alternate frames on one lane and watch each other bowl.
- Hard part: pin action that feels right and repeats exactly. Physics runs on its own 1/240 s step whatever `dt` is. The ball is a sphere to the boards and an upright drum to the pins, so it ploughs through instead of climbing them. Pin bounce, friction and inertia were tuned until only a pocket hit strikes often: about 56% for a ball hooking into the pocket, 32% for a straight pocket ball, 13% dead centre.
- Assists: per seat. Light: the guide line runs to the pins, release drift is halved, 25% more hook. Strong: a live path preview while the ball rolls, drift quartered, power never under 70%, gutter bumpers up.
- Rule 1: (one shared screen) one lane and one camera; both scorecards are always on screen.
- Rule 2: (no hidden information) scores, each player's best possible score, the aim line and the standing pins are shown to both.
- Rule 3: (win and lose together) WAIVED by Marco for this slot. It is a versus game with one winner; the slot is in `noFailSlots`, so check 6 is skipped.
- Rule 4: (revive, never eliminate) nobody is knocked out. Both bowl all ten frames, and a tie is settled by a roll-off.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3. Each ball is bowled by one player.
- Rule 6: (3 to 15 minute sessions, instant restart) bots finish a match in about 6 minutes; two people should take 8 to 12. Play again from the results screen.
- Rule 7: (per-player assists) each seat's own assist level applies to its own balls, which also works as a handicap.
- Result: checks 1 to 5 and 7 to 10 pass against `engine/vendor-3d`; check 6 is skipped (versus). Bots average 146 at assist 0 and 190 at assist 2 over 10 seeds; median match 5.6 min. Scoring cases, roll-off, 1,000 random balls and 14 rematches checked by hand. Not checked: feel on real controllers, and frame rate on a real graphics card. PR #2, stacked on PR #1.

## 2026-11-14 · tenpin-grudge · polish
- Scope: graphics only, at Marco's request ("make graphics better"). No change to physics, scoring, controls or the bot.
- Kit: as before, plus `MeshPhysicalMaterial` and `PMREMGenerator`, added to the vendored three.js in PR #1.
- Two-player action: unchanged. A versus match on one lane.
- Hard part: a glossy lane without a reflection add-on. Pins and ball are drawn a second time, mirrored under the lane, and seen through a lane that is slightly see-through, more so on the oil. A generated environment map gives the ball, pins and lane their highlights.
- Assists: unchanged. Strong assist's bumpers now show as rails in the bowler's colour.
- Rule 1: (one shared screen) unchanged; neighbouring lanes 12, 13, 15 and 16 are scenery only.
- Rule 2: (no hidden information) unchanged.
- Rule 3: (win and lose together) WAIVED by Marco for this slot, as before.
- Rule 4: (revive, never eliminate) unchanged.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3, as before.
- Rule 6: (3 to 15 minute sessions, instant restart) unchanged.
- Rule 7: (per-player assists) unchanged.

## 2026-11-14 · tenpin-grudge · polish
- Scope: the hall, at Marco's request ("the alley is lacking"). No change to physics, scoring, controls or the bot.
- Kit: as before; nothing new in the vendored block.
- Two-player action: unchanged. A versus match on one lane.
- Hard part: making the hall feel alive without touching the simulation. Other bowlers on lanes 11 to 17 are a scripted animation in the view only, with their pin noise played quietly and panned to their lane.
- Assists: unchanged.
- Rule 1: (one shared screen) unchanged; the screen over lane 14 repeats the bowler, frame and score already on the scorecard.
- Rule 2: (no hidden information) unchanged.
- Rule 3: (win and lose together) WAIVED by Marco for this slot, as before.
- Rule 4: (revive, never eliminate) unchanged.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3, as before.
- Rule 6: (3 to 15 minute sessions, instant restart) unchanged.
- Rule 7: (per-player assists) unchanged.

## 2026-11-14 · tenpin-grudge · polish
- Scope: refine the hall's lighting, at Marco's request ("refine environment"). No change to physics, scoring, controls or the bot.
- Kit: as before, plus additive blending from the vendored three.js (added in PR #1).
- Two-player action: unchanged. A versus match on one lane.
- Hard part: coloured light without washing out the lane. The neon spills pink and violet onto the outer lanes from four short-range lights; a short-range light over the pin decks lights the neighbours' pins without streaking down lane 14; reflections now pick up the neon.
- Assists: unchanged.
- Rule 1: (one shared screen) unchanged.
- Rule 2: (no hidden information) unchanged.
- Rule 3: (win and lose together) WAIVED by Marco for this slot, as before.
- Rule 4: (revive, never eliminate) unchanged.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3, as before.
- Rule 6: (3 to 15 minute sessions, instant restart) unchanged.
- Rule 7: (per-player assists) unchanged.

## 2026-11-14 · tenpin-grudge · polish
- Scope: rework the lane boards over the pins, at Marco's request. No change to physics, scoring, controls or the bot.
- Kit: as before.
- Two-player action: unchanged. A versus match on one lane.
- Hard part: seven boards in one design that still read from the couch. Each is a separate screen: lane badge, bowler, score and a ten-frame strip. Lane 14 follows the match in the bowler's colour; the neighbours' boards follow their own made-up games, which advance as their animated balls land. The kickbacks are lowered so the screens are not cut off.
- Assists: unchanged.
- Rule 1: (one shared screen) unchanged; the lane 14 board repeats what the scorecard already shows.
- Rule 2: (no hidden information) unchanged.
- Rule 3: (win and lose together) WAIVED by Marco for this slot, as before.
- Rule 4: (revive, never eliminate) unchanged.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3, as before.
- Rule 6: (3 to 15 minute sessions, instant restart) unchanged.
- Rule 7: (per-player assists) unchanged.

## 2026-11-14 · tenpin-grudge · polish
- Scope: gameplay, at Marco's request ("work on gameplay elements"), taken from the spec's Later list: a choice of three balls, an oil pattern per match, heckles for the waiting player, and a replay after every strike.
- Kit: as before.
- Two-player action: still a versus match. The waiting player can now heckle with X: a jeer, a speech bubble and a short buzz in the bowler's controller, three per turn at most. It never touches the ball.
- Hard part: keeping the new choices fair and repeatable. Ball weight sets the ball's mass, speed range and hook; the oil pattern (short 10 m, house 12 m, long 14 m) moves where the hook bites, drawn from `k.rng` so a seed repeats. The bot reads both when it plans, and averages 131 to 149 across all nine combinations. Replays are recorded only outside `Couch.simulate`, so they do not change balance runs.
- Assists: unchanged; the guide line and path preview follow the chosen ball and the oil.
- Rule 1: (one shared screen) unchanged; replays play on the shared screen and either player can skip with A.
- Rule 2: (no hidden information) the ball and the oil are shown on the bowler's panel; the oil is also announced before the match.
- Rule 3: (win and lose together) WAIVED by Marco for this slot, as before.
- Rule 4: (revive, never eliminate) unchanged.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3, as before.
- Rule 6: (3 to 15 minute sessions, instant restart) bots still finish in about 6 minutes; replays add up to 8 seconds per strike with two people.
- Rule 7: (per-player assists) unchanged.

## 2026-11-14 · tenpin-grudge · polish
- Scope: a full feel pass against Marco's design brief: fix physics reliability, then controls, feedback and pacing, then presentation, then finish the two-player handover. Weaknesses found, by impact: (1) hook steered after release with its own meter, aim at 40 taps, swings started by a stick held over from the last turn; (2) the pin count could be taken while a pin was still tipping, so it depended on frame rate; (3) the same throw gave 4 to 10 pins, from rack jitter and physics state left over from the last shot; (4) no first-play guidance, no clear state, pending bonuses hidden, misses unexplained; (5) long holds and replays of up to 8 seconds on every strike.
- Kit: as before. Every tuning value now lives in one `TUNE` block at the top of the file.
- Two-player action: versus on one lane. Handovers now buzz the next bowler's controller, and their swing cannot start until they have let go of the stick or key.
- Hard part: making similar inputs give similar results. Each pin's full physics state is reset when racked and pins re-enter the solver in a fixed order; the count is taken at a fixed physics step once every standing pin is still for 0.35 s (3.2 s at most). The same throw now gives the same count at 30, 60, 144 and 240 Hz. The ball slows on the lane (0.15 m/s² on oil, 0.55 dry). A pocket hit strikes 8 or 9 times in 12; a hooked ball has a wider pocket than a straight one.
- Assists: Light shows a straight guide to the pins and halves drift; Strong previews the full path with your hook, raises bumpers, quarters drift and sets a 70% power floor. No assist touches a released ball.
- Rule 1: (one shared screen) unchanged.
- Rule 2: (no hidden information) hook, ball, oil and state are on the bowler's panel; each first ball says where it met the head pin and what to change.
- Rule 3: (win and lose together) WAIVED by Marco for this slot, as before.
- Rule 4: (revive, never eliminate) unchanged.
- Rule 5: (an action neither can do alone) WAIVED by Marco with rule 3, as before.
- Rule 6: (3 to 15 minute sessions, instant restart) bots finish in about 6 minutes; results can be skipped with A; strike replays are 3 seconds and off with reduced motion.
- Rule 7: (per-player assists) unchanged.
