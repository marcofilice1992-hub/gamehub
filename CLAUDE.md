# Couch Co-op

`master.html` is the whole thing: a shared engine and 15 two-player games, played in Chrome on the PC with two
controllers. It is built by `./build.sh` from the parts in `src/` (one file per game); never edit it by hand.

Any agent working here follows `agents/RUNBOOK.md`. The short version: one job per run; never edit the engine or
another game's block; never merge or push to `main`; every game passes `node tools/check.mjs` before it ships.
