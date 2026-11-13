#!/bin/sh
# Joins the source parts into the one file that ships.
cd "$(dirname "$0")"
{
  cat src/00-head.html
  for f in src/10-core.js src/20-engine.js src/25-kit.js src/15-vendor-3d.js src/30-games.js src/35-lab.js src/36-swarm-night.js src/37-tank-for-two.js src/38-tenpin-grudge.js src/40-start.js; do
    echo "<script>"; cat "$f"; echo "</script>"
  done
  echo "</body>"; echo "</html>"
} > master.html
wc -c master.html | awk '{printf "master.html %.0f KB\n", $1/1024}'
