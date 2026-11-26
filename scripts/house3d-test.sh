#!/usr/bin/env bash
# The engine's tests: the model, build, scan, placement and copy tests (Python unittest), the engine
# tests in Node (the engine-*.test.mjs files by area over engine-harness.mjs), and a syntax check
# of every engine, test and script module (vendored three.js excepted).
# Runs from any directory; exits 1 when anything fails, after running everything.
set -u
cd "$(dirname "$0")/.." || exit 1

for tool in node python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "house3d-test: $tool is not installed" >&2
    exit 1
  fi
done

rc=0
fail() { echo "house3d-test: FAILED: $1" >&2; rc=1; }

python3 -I -m unittest discover -s tests/house3d || fail "python tests"
node --test tests/house3d/engine-*.test.mjs || fail "engine tests"

while IFS= read -r f; do
  node --input-type=module --check < "$f" || fail "syntax: $f"
done < <(find house3d tests/house3d scripts -path house3d/vendor -prune -o -type f \( -name '*.js' -o -name '*.mjs' \) -print | sort)

[ "$rc" -eq 0 ] && echo "house3d-test: all passed"
exit "$rc"
