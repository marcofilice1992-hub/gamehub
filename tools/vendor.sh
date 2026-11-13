#!/bin/sh
# Builds src/15-vendor-3d.js: three.js (rendering) and cannon-es (physics) as one closed scope on Couch.lib.
# Run it only to change a version or the class list in tools/vendor-entry.mjs, then run ./build.sh.
# A new physics version changes every seeded result, so treat an upgrade as a new baseline.
# Needs Node and network access to the npm registry. master.html itself never touches the network.
set -e
THREE=0.187.0
CANNON=0.20.0
ESBUILD=0.25.12
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$ROOT/tools/vendor-entry.mjs" "$TMP/entry.mjs"
cd "$TMP"
npm init -y >/dev/null
npm i --no-audit --no-fund --ignore-scripts "three@$THREE" "cannon-es@$CANNON" >/dev/null
npm i --no-audit --no-fund "esbuild@$ESBUILD" >/dev/null
OUT="$ROOT/src/15-vendor-3d.js"
{
  echo "/* =========================================================================="
  echo "   VENDORED 3D LIBRARIES · built by tools/vendor.sh · do not edit by hand"
  echo "   three.js $THREE (MIT, https://github.com/mrdoob/three.js) for drawing in 3D."
  echo "   cannon-es $CANNON (MIT, https://github.com/pmndrs/cannon-es) for rigid-body physics."
  echo "   Games reach them as Couch.lib.THREE and Couch.lib.CANNON. Only the classes listed"
  echo "   in tools/vendor-entry.mjs are included. Licence notices are kept below."
  echo "   ========================================================================== */"
  ./node_modules/.bin/esbuild entry.mjs --bundle --format=iife --minify --legal-comments=inline --log-level=error \
    --define:__THREE_VERSION__="\"$THREE\"" --define:__CANNON_VERSION__="\"$CANNON\""
  cat <<'MIT'
/* three.js: Copyright (c) 2010-2026 three.js authors. cannon-es: Copyright (c) 2015 cannon.js authors.
   Both are under the MIT License:

   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
   to permit persons to whom the Software is furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all copies or substantial portions
   of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
   THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
   CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
   DEALINGS IN THE SOFTWARE. */
MIT
} > "$OUT"
if grep -q '</script' "$OUT"; then echo "vendor: the bundle contains </script and would break master.html" >&2; exit 1; fi
wc -c "$OUT" | awk '{printf "src/15-vendor-3d.js %.0f KB\n", $1/1024}'
