# khe-house3d

Workspace-wide rules (push, review, docs, estate ADRs) are in [khe-workspace
`AGENTS.md`](https://github.com/khelias/khe-workspace/blob/main/AGENTS.md).

The 3D house engine: a three.js scene drawn from a parametric house model, the
model format and its validator, the standalone viewer build with its privacy
scan, the device and tree placement page, two made-up test houses and the
made-up house the khe.ee/ha demo shows. Why the engine is its own and how it
is built: [ADR-001](docs/decisions/001-own-3d-engine.md).
Why it has a repo of its own and how its consumers, khe-home-assistant and
khe-makett, carry a copy: [estate ADR-052](https://github.com/khelias/khe-architecture/blob/main/decisions/052-the-3d-house-engine-has-a-repo-of-its-own.md).

## Commands

- Setup once after cloning: `python3 -m venv .venv && .venv/bin/pip install
  ruff==0.17.0` (the version `ci.yml` pins).
- `bash scripts/check.sh` is the whole check: `bash -n` on every
  `scripts/*.sh`, `scripts/house3d-test.sh` (the model, build, scan,
  placement and copy tests, the engine tests in Node, a syntax check of every
  module and script module), the privacy scan when a real model is at hand (skipped in CI) and
  ruff lint and format over `scripts/`. CI runs it with `RUFF=ruff`, the workspace
  commit gate before each commit.
- `python3 -I scripts/house3d_model.py --check FILE` validates a model.
- `python3 -I scripts/house3d_viewer.py MODEL OUTDIR [--bake DIR]` builds the
  standalone viewer from a model's shareable layers, with DIR's baked contact
  shadows beside it, and scans the result;
  `--scan [--count] MODEL PATH...` scans files for a model's private data.
- `scripts/house3d-place.py serve MODEL` serves `house3d/place.html` for
  moving devices, trees and future items and writes the changes back;
  `scripts/house3d-surroundings.py` writes a surroundings layer from ETAK;
  `scripts/house3d-vendor.sh <version>` vendors a three.js release.
- `bash scripts/house3d-bake.sh MODEL_JSON OUTDIR [SIZE]` bakes a house's
  contact shadows from a viewer build's `model.json` into `bake.json` and
  `bake-ao.png` ([ADR-001](docs/decisions/001-own-3d-engine.md) point 7). A
  laptop step: Blender (`$BLENDER`, else the macOS app) is not in CI, and
  Cycles reaches the GPU only outside the Bash sandbox, so run it with the
  sandbox off. `node scripts/house3d-bake-export.mjs --check MODEL_JSON
  BAKE_JSON` exits 1 when a bake no longer fits the model or the engine (a
  consumer's check runs it).
- `bash scripts/house3d-copy.sh <commit>`, run from a consumer's root, writes
  that consumer's pinned copy; `--check` checks it. The script travels in the
  copy.
- `UPDATE_SNAPSHOT=1` (engine-core) and `UPDATE_BASELINE=1` (engine-geometry,
  engine-look) rewrite the simple-style snapshot and the geometry and look
  baselines instead of comparing.

## Layout

```
house3d/           the engine: core house3d.js, scene/ (kit, sun, the marker
                   overlay, bake.js that applies a baked bake.json, and one
                   module per layer), the standalone viewer.html, the
                   placement page place.html, vendored three.js
scripts/           house3d_model.py (the model format: its docstring is the
                   format's reference; read, validate, merge layers),
                   house3d_viewer.py (viewer build and privacy scan),
                   house3d-bake.sh with house3d-bake-export.mjs (the meshes
                   to bake, through the engine tests' harness) and
                   house3d_bake.py (the Blender bake), house3d-place.py,
                   house3d-surroundings.py, house3d-vendor.sh,
                   house3d-copy.sh (a consumer's copy), house3d-test.sh,
                   check.sh
tests/house3d/     made-up houses: the test houses (fixture-model.md, the
                   one-storey house with the devices the HA card's tests read;
                   fixture-twostorey.md, hip, gable and flat roofs, an upper
                   storey, a plinth and chimneys) and fixture-demo.md, the
                   gable house the khe.ee/ha demo shows; the engine tests
                   (engine-*.test.mjs by area over engine-harness.mjs), the
                   simple-style snapshot, the geometry and look baselines,
                   model, build, placement and copy tests (Python unittest)
docs/decisions/    this repo's decisions
```

## Rules

1. **Only made-up houses.** A real house's model stays in private
   documentation (ours in khe-meta `house/house-model.md`); nothing that
   identifies a house, its devices or its family goes in here. `check.sh`
   scans the engine, the test houses and the baselines with the real model
   whenever one is at hand.
2. **A house's look is its model's**, over the engine's neutral default
   ([ADR-001](docs/decisions/001-own-3d-engine.md) point 6, which also says
   where a real house's finishes may come from). The engine carries no
   house's colours.
3. **Modules under `house3d/scene/` import nothing**: they get three.js and
   the rest through `ctx`, because a module loaded by a static import would
   come without the card's `?v=` and could stay stale in HA's cache. Their
   module scope holds constants only. The engine tests enforce it.
4. **Each consumer carries a pinned copy.** `scripts/house3d-copy.sh
   <commit>` copies the paths a consumer's `house3d-engine.json` lists under
   `include`, itself among them, at the same paths, and checks them against
   that file's hashes; the consumers are khe-home-assistant and khe-makett,
   and each one's `include` says what it takes. A change here reaches the
   HA card and the khe.ee/ha demo only when that copy is bumped, with the
   card's version, so keep those paths, the harness's exports and the
   script's usage stable or change the repos together. The
   demo house (`fixture-demo.md`) is what khe.ee/ha shows, on the test
   house's device, car and future ids, which the card's tests read: a demo
   that needs a new device adds it to both houses here and takes a new copy
   there ([estate ADR-052](https://github.com/khelias/khe-architecture/blob/main/decisions/052-the-3d-house-engine-has-a-repo-of-its-own.md)
   point 2).

## CI and automated writers

`.github/workflows/ci.yml` runs `check.sh` on a GitHub-hosted runner. Nothing
deploys from this repo.

Renovate ([estate
ADR-007](https://github.com/khelias/khe-architecture/blob/main/decisions/007-automated-writers.md))
automerges GitHub Actions minor and patch updates, digests and pins
(`renovate.json`) once a release is three days old. The way back is to revert
its commit on `main` and push. three.js is vendored, so Renovate does not see
it: update it with `house3d-vendor.sh`.
