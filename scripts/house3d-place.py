#!/usr/bin/env python3
"""Place the house 3D model's devices, trees, yard things and future items on a 2D plan, and write the
result back.

Usage:  house3d-place.py serve MODEL [PORT]         serve the placement page on 127.0.0.1
        house3d-place.py apply MODEL CHANGES.json   write the page's changes into MODEL

serve answers house3d/place.html with the geometry, rooms and
private layers of MODEL (khe-meta house/house-model.md), family room names applied. The
model is served from memory, so the private layer never lands next to the page. Default
port 8731.

apply takes the JSON the page's "Kopeeri muudatused" button copies,
{"devices": {entity: {pos, look?, room}}, "trees": {id: {pos, height, crown}},
"future": {id: {pos, rot?}}, "props": {id: {kind, at, rot} | null}}, each group only when it
has changes, from a file or from stdin with '-' (pbpaste | ... apply MODEL -). It rewrites those
devices' lines in the private block, those trees' lines in the geometry block's "trees" list and
those future items' lines in the private block's "items" list (positions and rot only; size and
numbers stay hand edits), one item per line as before; a yard thing it writes by id into the
geometry block's "props" list, adding one that is new, removing one given null and opening the
list in site when the model has none. It writes the file once. Any other shape, an unknown
entity, tree, item or removed yard thing, a changed device height, a tree size that is not a
positive number or a model that no longer validates (a pv item moved off its roof, a yard thing
outside the lot) stops it before writing.
"""

import functools
import http.server
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import house3d_model

SRC = Path(__file__).resolve().parent.parent / "house3d"
PRIVATE = "```json house3d:private"
GEOMETRY = "```json house3d:geometry"
SHAPE = (
    'changes must be {"devices": {entity: {pos: [x, y, z], look?, room?}}, '
    '"trees": {id: {pos: [x, z], height, crown}}, "future": {id: {pos: [x, z], rot?}}, '
    '"props": {id: {kind, at: [x, z], rot?} | null}}, '
    "each group only when it has changes, as the page copies them"
)


def checked(layers):
    problems = house3d_model.validate(layers)
    if problems:
        sys.exit("model problems:\n" + "\n".join(problems))
    return layers


def serve(model_path, port=8731):
    layers = checked(house3d_model.read_layers(model_path))
    model = house3d_model.with_room_names(
        house3d_model.merge(layers, ("geometry", "rooms", "private"))
    )
    body = json.dumps(model, ensure_ascii=False).encode("utf-8")

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] != "/model.json":
                return super().do_GET()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    with http.server.ThreadingHTTPServer(
        ("127.0.0.1", port), functools.partial(Handler, directory=str(SRC))
    ) as httpd:
        print(f"http://127.0.0.1:{port}/place.html  (Ctrl+C stops)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


def parse_changes(raw):
    """The page's changes, type-checked before anything compares them."""
    try:
        changes = json.loads(raw)
    except ValueError as e:
        sys.exit(f"changes are not JSON ({e}); {SHAPE}")
    if not (
        isinstance(changes, dict)
        and changes
        and set(changes) <= {"devices", "trees", "future", "props"}
        and all(isinstance(g, dict) for g in changes.values())
    ):
        sys.exit(SHAPE)
    for entity, c in changes.get("devices", {}).items():
        if not (isinstance(c, dict) and house3d_model._point(c.get("pos"), 3)):
            sys.exit(f"device {entity}: pos is not [x, y, z]; {SHAPE}")
    for tid, c in changes.get("trees", {}).items():
        if not isinstance(c, dict):
            sys.exit(f"tree {tid}: not an object; {SHAPE}")
        if not house3d_model._point(c.get("pos")):
            sys.exit(f"tree {tid}: pos {c.get('pos')!r} is not two numbers [x, z]")
        for k in ("height", "crown"):
            if not (house3d_model._num(c.get(k)) and c[k] > 0):
                sys.exit(f"tree {tid}: {k} {c.get(k)!r} is not a positive number")
    for fid, c in changes.get("future", {}).items():
        if not (isinstance(c, dict) and house3d_model._point(c.get("pos"))):
            sys.exit(f"future item {fid}: pos is not two numbers [x, z]; {SHAPE}")
        if "rot" in c and c["rot"] not in house3d_model.QUARTER_TURNS:
            sys.exit(f"future item {fid}: rot {c['rot']!r} is not one of 0, 90, 180, 270")
    for pid, c in changes.get("props", {}).items():
        if c is None:
            continue
        if not (isinstance(c, dict) and house3d_model._point(c.get("at"))):
            sys.exit(f"yard thing {pid}: at is not two numbers [x, z]; {SHAPE}")
        if c.get("kind") not in house3d_model.PROP_KINDS:
            sys.exit(
                f"yard thing {pid}: kind {c.get('kind')!r} is not one of {', '.join(house3d_model.PROP_KINDS)}"
            )
        if c.get("rot", 0) not in house3d_model.QUARTER_TURNS:
            sys.exit(f"yard thing {pid}: rot {c['rot']!r} is not one of 0, 90, 180, 270")
    return changes


def block(lines, fence, path):
    """The line numbers inside a fenced block."""
    start = next((i for i, line in enumerate(lines) if line.rstrip() == fence), None)
    if start is None:
        sys.exit(f"{path}: no {fence} block")
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("```")), len(lines))
    return range(start + 1, end)


def line_of(indent, item, comma):
    """One item of a one-item-per-line list as apply writes it."""
    return (
        indent
        + json.dumps(item, ensure_ascii=False, separators=(",", ":"))
        + ("," if comma else "")
    )


def indent_of(line):
    return line[: len(line) - len(line.lstrip())]


def rewrite(lines, i, item):
    """Write item over line i, keeping its indent and trailing comma."""
    line = lines[i].rstrip()
    lines[i] = line_of(indent_of(line), item, line.endswith(","))


def turned(old, new):
    """The report's note of a quarter turn, empty when it did not turn."""
    return (
        f", rot {old.get('rot', 0)} -> {new.get('rot', 0)}"
        if old.get("rot", 0) != new.get("rot", 0)
        else ""
    )


def apply_devices(lines, changes, path, report):
    seen = set()
    for i in block(lines, PRIVATE, path):
        text = lines[i].strip()
        if not text.startswith('{"entity"'):
            continue
        try:
            device = json.loads(text.rstrip(","))
        except ValueError:
            sys.exit(
                f"{path}:{i + 1}: not a whole device; the private block keeps one device per line"
            )
        new = changes.get(device["entity"])
        if new is None:
            continue
        if new["pos"][1] != device["pos"][1]:
            sys.exit(
                f"{device['entity']}: height {device['pos'][1]} would become {new['pos'][1]}; the page keeps heights"
            )
        old = dict(device)
        device.update({k: new[k] for k in ("pos", "look", "room") if k in new})
        rewrite(lines, i, device)
        seen.add(device["entity"])
        moved = (
            (device["pos"][0] - old["pos"][0]) ** 2 + (device["pos"][2] - old["pos"][2]) ** 2
        ) ** 0.5
        room = f", room {old['room']} -> {device['room']}" if old["room"] != device["room"] else ""
        report.append(f"{device['entity']}: moved {moved:.2f} m{room}")
    unknown = sorted(set(changes) - seen)
    if unknown:
        sys.exit("not in the private block, one device per line: " + ", ".join(unknown))
    return len(seen)


def list_items(lines, fence, anchor, what, path, with_start=False):
    """(line index, item) for each line of a one-item-per-line JSON list that opens with the
    line `anchor` alone in the block `fence` and closes with a ] line; with_start, (the anchor's
    line index, that list)."""
    rows = block(lines, fence, path)
    start = next((i for i in rows if lines[i].strip() == anchor), None)
    if start is None:
        sys.exit(
            f"{path}: no line {anchor} alone in the {fence} block; apply needs one {what} per line"
        )
    out = []
    for i in range(start + 1, rows.stop):
        text = lines[i].strip()
        if text in ("]", "],"):
            return (start, out) if with_start else out
        try:
            item = json.loads(text.rstrip(","))
        except ValueError:
            item = None
        if not (isinstance(item, dict) and isinstance(item.get("id"), str)):
            sys.exit(f"{path}:{i + 1}: not a whole {what}; the list keeps one {what} per line")
        out.append((i, item))
    sys.exit(f"{path}: the {anchor} list in the {fence} block has no closing ] line")


def apply_trees(lines, changes, path, report):
    seen = set()
    for i, tree in list_items(lines, GEOMETRY, '"trees": [', "tree", path):
        new = changes.get(tree["id"])
        if new is None:
            continue
        old = dict(tree)
        tree.update({k: new[k] for k in ("pos", "height", "crown")})
        rewrite(lines, i, tree)
        seen.add(tree["id"])
        moved = math.dist(old["pos"], tree["pos"])
        sizes = "".join(
            f", {k} {old[k]} -> {tree[k]}" for k in ("height", "crown") if old[k] != tree[k]
        )
        report.append(f"tree {tree['id']}: moved {moved:.2f} m{sizes}")
    unknown = sorted(set(changes) - seen)
    if unknown:
        sys.exit("not in the geometry block's trees list: " + ", ".join(unknown))
    return len(seen)


def apply_future(lines, changes, path, report):
    seen = set()
    for i, item in list_items(lines, PRIVATE, '"items": [', "future item", path):
        new = changes.get(item["id"])
        if new is None:
            continue
        old = dict(item)
        item["pos"] = new["pos"]
        if "rot" in new:
            item["rot"] = new["rot"]
        rewrite(lines, i, item)
        seen.add(item["id"])
        report.append(
            f"future item {item['id']}: moved {math.dist(old['pos'], item['pos']):.2f} m{turned(old, item)}"
        )
    unknown = sorted(set(changes) - seen)
    if unknown:
        sys.exit("not in the private block's future items list: " + ", ".join(unknown))
    return len(seen)


def prop_line(pid, c):
    """A yard thing as the list writes it: rot only when it turns."""
    return {
        "id": pid,
        "kind": c["kind"],
        "at": c["at"],
        **({"rot": c["rot"]} if c.get("rot") else {}),
    }


def apply_props(lines, changes, path, report):
    """Write the yard things by id into the geometry block's props list, opening one in site;
    the lines of the things left as they were stay as they were."""
    anchor = '"props": ['
    rows = block(lines, GEOMETRY, path)
    # a props key written any other way would stay beside a new list and hide it
    if any(lines[i].strip().startswith('"props":') and lines[i].strip() != anchor for i in rows):
        sys.exit(
            f"{path}: the props list must open with a line {anchor} alone, one yard thing per line"
        )
    if not any(lines[i].strip() == anchor for i in rows):
        site = next((i for i in rows if lines[i].strip() == '"site": {'), None)
        if site is None:
            sys.exit(f'{path}: no line "site": {{ alone in the {GEOMETRY} block for the props list')
        after = lines[site + 1].strip()
        indent = (
            indent_of(lines[site + 1])
            if not after.startswith("}")
            else indent_of(lines[site]) + " "
        )
        lines[site + 1 : site + 1] = [
            indent + anchor,
            indent + ("]" if after.startswith("}") else "],"),
        ]
    start, items = list_items(lines, GEOMETRY, anchor, "yard thing", path, with_start=True)
    indent = indent_of(lines[start]) + " "
    # each line of the new list without its comma: the old line for an untouched thing
    kept = []
    for i, item in items:
        new = changes.get(item["id"], item)
        if new is item:
            kept.append(lines[i].rstrip().rstrip(","))
        elif new is None:
            report.append(f"yard thing {item['id']}: removed")
        else:
            moved = math.dist(item["at"], new["at"])
            report.append(f"yard thing {item['id']}: moved {moved:.2f} m{turned(item, new)}")
            kept.append(line_of(indent, prop_line(item["id"], new), False))
    known = {item["id"] for _, item in items}
    for pid, new in changes.items():
        if pid in known:
            continue
        if new is None:
            sys.exit(f"yard thing {pid}: not in the geometry block's props list, so not removed")
        kept.append(line_of(indent, prop_line(pid, new), False))
        report.append(f"yard thing {pid}: added")
    lines[start + 1 : start + 1 + len(items)] = [
        line + ("," if k < len(kept) - 1 else "") for k, line in enumerate(kept)
    ]
    return len(changes)


def apply(model_path, changes_path):
    raw = (
        sys.stdin.read() if changes_path == "-" else Path(changes_path).read_text(encoding="utf-8")
    )
    changes = parse_changes(raw)
    path = Path(model_path)
    text = path.read_text(encoding="utf-8")
    # the old values feed the report, so they have to be valid too
    checked(house3d_model.parse_layers(text))
    lines, report = text.split("\n"), []
    devices = apply_devices(lines, changes["devices"], path, report) if "devices" in changes else 0
    trees = apply_trees(lines, changes["trees"], path, report) if "trees" in changes else 0
    future = apply_future(lines, changes["future"], path, report) if "future" in changes else 0
    props = apply_props(lines, changes["props"], path, report) if "props" in changes else 0
    text = "\n".join(lines)
    checked(house3d_model.parse_layers(text))
    path.write_text(text, encoding="utf-8")
    print(
        "\n".join(
            report
            + [
                f"{devices} device(s), {trees} tree(s), {props} yard thing(s) and {future} future item(s) written to {path}"
            ]
        )
    )
    return 0


def main(argv):
    if len(argv) in (2, 3) and argv[0] == "serve":
        return serve(argv[1], *(int(p) for p in argv[2:]))
    if len(argv) == 3 and argv[0] == "apply":
        return apply(argv[1], argv[2])
    print(__doc__.split("\n\n")[1], file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
