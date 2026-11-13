# Build queue

Owned by Marco. The Game Builder reads this file and builds the first row whose game is not yet built
(`node tools/check.mjs --list` shows what is built). It edits this file only on an `ideas/*` branch,
when applying ideas Marco has taken, and those edits count only once Marco merges that pull request.

`Job` is `build` for a slot's original game, or `replace <old-id>` when an approved idea takes over a slot.
A replacement of a game that is already built goes to the top of the queue.

| Order | Slot | Id | Job | Notes |
| --- | --- | --- | --- | --- |
| 1 | 2 | pit-crew | build | Adds the carry and use-station system (the kit's Interact and carry module) |
| 2 | 1 | parcel-panic | build | Reuses carry and stations, adds throwing and a level layout |
| 3 | 3 | last-orders | build | Reuses carry and stations, adds recipes and tickets |
| 4 | 5 | push-comes-to-shove | build | A session is one room; the bot needs a solver |
| 5 | 15 | floodline | build | Spec says 20 to 30 minutes, rule 6 says 3 to 15: First playable must be a short game (fewer rounds or a smaller map) |
| 6 | 13 | allotment | build | No way to fail: a session ends at the end of a season |
| 7 | 4 | tether | build | Physics pair; uses the kit's Rope and Platformer |
| 8 | 6 | polarity | build | Physics pair; shares Tether's setup |
| 9 | 7 | mission-control | build | Asymmetric pair |
| 10 | 9 | big-and-small | build | Asymmetric pair |
| 11 | 12 | deep-dive | build | Content-heavy; generation must always leave a route down |
| 12 | 8 | heist-night | build | Content-heavy, the largest build |
| 13 | 14 | slow-boat | build | Content-heavy; spec is open-ended, so a session must end at a delivery or voyage |

Built before this queue existed: Tank for Two (slot 10), Swarm Night (slot 11).
