#!/usr/bin/env bash
# Bakes a house's contact shadows: scripts/house3d-bake-export.mjs over a viewer build's
# model.json, then scripts/house3d_bake.py in Blender (Cycles ambient occlusion), into
# OUTDIR/bake.json and OUTDIR/bake-ao.png. A laptop step, never CI or run time: Blender is looked
# up as $BLENDER, else the macOS app, and Cycles reaches the GPU only outside the Bash sandbox.
# Usage: scripts/house3d-bake.sh MODEL_JSON OUTDIR [SIZE]   (SIZE the atlas's side, default 2048)
set -euo pipefail
if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "usage: $0 MODEL_JSON OUTDIR [SIZE]" >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)
blender=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
if [ ! -x "$blender" ] && ! command -v "$blender" >/dev/null 2>&1; then
  echo "house3d-bake: Blender not found at $blender; install it or set BLENDER" >&2
  exit 1
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
node "$here/house3d-bake-export.mjs" "$1" "$tmp/bake-input.json"
"$blender" -b --factory-startup --python-exit-code 1 --python "$here/house3d_bake.py" -- \
  "$tmp/bake-input.json" "$2" "${3:-2048}"
