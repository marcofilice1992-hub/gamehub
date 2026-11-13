# 14. Tenpin Grudge

- Slot: 14
- Id: `tenpin-grudge`
- Group: Cosy and long-form
- Pace: Calm
- Size: M
- Source: chat with Marco, 13 and 14 Nov 2026. Replaces Slow Boat. Versus by Marco's choice: design rules 3 and 5 are waived for this slot.

Head-to-head ten-pin bowling on one shared 3D lane. A match is 10 frames each, about 8 to 12 minutes with two people.

- **Loop:** Take turns, one frame each. Stand, aim, swing, then steer the hook while the ball rolls. The higher score wins; a tie goes to a one-ball roll-off, and after three tied roll-offs it is a draw.
- **Why it needs two:** It is a match. Every ball is watched, and the scorecard always shows the lead, each player's best possible score, and what the trailing player needs.
- **Controls:** Left stick to step left and right, bumpers to turn the aim line 0.1° a tap, pull the right stick back and push it forward to bowl (power is the swing height, a sideways push is drift), left stick to hook during the roll, B to cancel a swing. On a keyboard, hold and let go of the A key to swing.
- **First playable:** One lane, rigid-body pins, standard scoring on two scorecards, roll-off, per-seat assists that double as a handicap, a bot for each seat.
- **Later:** Venues and oil patterns, ball weights, instant replay, lane reflections, a 5-frame quick match, best of three, party rules, bot skill levels, a co-op doubles mode against a house score.
- **Hard part:** Pin action that feels right and repeats exactly for a seed. It draws with three.js and simulates with cannon-es from `Couch.lib`; the physics runs on its own fixed step of 1/240 s, and the hook is a scripted force.
