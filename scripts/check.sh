#!/usr/bin/env bash
# The repo's whole check: what the commit gate and CI run. Runs everything,
# then exits 1 if anything failed.
set -u
cd "$(dirname "$0")/.." || exit 1

rc=0
fail() { echo "check: FAILED: $1" >&2; rc=1; }

for f in scripts/*.sh; do
  bash -n "$f" || fail "bash -n $f"
done
bash scripts/house3d-test.sh || fail "house3d tests"

# The engine, the made-up test houses and the baselines are scanned with a real model when one
# is at hand (khe-meta beside the main checkout, also from a worktree, or HOUSE3D_MODEL), so the
# commit gate keeps a real house out of this public repo; CI has none and skips. The test houses
# carry a devices layer under a `devices` key by design (the HA card reads it), so that key is
# allowed in them only.
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
model=${HOUSE3D_MODEL:-${common:+$(dirname "$common")/../khe-meta/house/house-model.md}}
if [ -n "$model" ] && [ -f "$model" ]; then
  allow=()
  for f in tests/house3d/fixture-*.md; do
    allow+=(--allow-devices-key "$f")
  done
  python3 -I scripts/house3d_viewer.py --scan --count "${allow[@]}" \
    "$model" house3d tests/house3d/*.md tests/house3d/*.json || fail "privacy scan"
else
  echo "check: privacy scan skipped, no real model (CI)"
fi

RUFF=${RUFF:-.venv/bin/ruff}
$RUFF check scripts || fail "ruff check"
$RUFF format --check scripts || fail "ruff format"

[ "$rc" -eq 0 ] && echo "check: all passed"
exit "$rc"
