# khe-house3d

A 3D view of a house drawn from its measured plan: walls, openings, roofs,
rooms, furniture and the lot, kept as a small parametric model in Markdown and
drawn in the browser with [three.js](https://threejs.org/). It has three styles:
a neon wireframe, a lit one with the sun where it stands at that hour, and a
photographic one with a textured lawn and sky and leafy trees. The roofs lift
off to show the rooms.

The house's own look, its colours, cladding and trims, is part of its model;
without one the view draws a plain architectural model.

This repo holds the engine, the model format and its validator, the
standalone viewer build, two made-up test houses and the made-up house the
[khe.ee/ha](https://khe.ee/ha/) demo shows. The Home Assistant card
that shows our own house with its devices lives in
[khe-home-assistant](https://github.com/khelias/khe-home-assistant), which
carries a pinned copy of this engine.

## Run it

You need Python 3 and Node.js.

```bash
bash scripts/check.sh
python3 -I scripts/house3d_viewer.py tests/house3d/fixture-twostorey.md /tmp/house
python3 -m http.server 8000 --directory /tmp/house
```

The first runs every test. The second builds the viewer for a test house,
which the third serves at <http://localhost:8000>.

## Licence

[MIT](LICENSE). three.js, vendored under `house3d/vendor/`, is under its own
MIT licence.
