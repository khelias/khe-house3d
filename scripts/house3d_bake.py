"""Bake a house's contact shadows in Blender Cycles; scripts/house3d-bake.sh runs it.

Usage:  blender -b --factory-startup --python-exit-code 1 --python house3d_bake.py --
            INPUT_JSON OUTDIR [SIZE]

INPUT_JSON is scripts/house3d-bake-export.mjs's output. The targets are joined into one object
with a per-face src (the target) and tri (its triangle) attribute, unwrapped (Smart UV Project,
then Pack Islands) and baked as ambient occlusion against themselves, the occluders and the
ground plane into one square atlas of SIZE pixels (default 2048). The engine draws its surfaces
from both sides and winds some inwards, while a bake looks out along the winding's normal, so
the atlas is baked a second time with every normal flipped and each pixel keeps the lighter of
the two: the side that faces into a solid is the darker. A thin surface seen from both sides
shares its texels, so its lighter side wins (an eave's underside stays light). OUTDIR gets
bake-ao.png, an
8-bit grey PNG, and bake.json, the format house3d/scene/bake.js reads: per target key its vertex
count and uv pairs in the export's non-indexed vertex order. Cycles uses the GPU where Blender
finds one (Metal on the laptop, outside the Bash sandbox), else the CPU.
"""

import json
import struct
import sys
import time
import zlib
from pathlib import Path

import bpy
import numpy as np

DISTANCE = 1.2  # metres: how far a surface darkens what is near it
SAMPLES = 128
MARGIN = 6  # pixels the bake bleeds past each island
ATLAS = "bake-ao.png"
FORMAT = 1  # bake.json's, as house3d/scene/bake.js reads it


def use_gpu(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == kind]
        if devices:
            for d in devices:
                d.use = True
            scene.cycles.device = "GPU"
            return kind
    scene.cycles.device = "CPU"
    return "CPU"


def add_mesh(scene, name, v):
    # three.js is y up with z towards the viewer, Blender z up
    verts = [(v[i], -v[i + 2], v[i + 1]) for i in range(0, len(v), 3)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [(i, i + 1, i + 2) for i in range(0, len(verts), 3)])
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def pixels(img, size):
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px[0::4]


def flip_normals():
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode="OBJECT")


def write_grey_png(path, grey, size):
    # Blender's rows run bottom up, a PNG's top down, as Image.save() writes them
    grey = (grey * 255 + 0.5).clip(0, 255).astype(np.uint8).reshape(size, size)[::-1]
    raw = b"".join(b"\0" + row.tobytes() for row in grey)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    head = struct.pack(">IIBBBBB", size, size, 8, 0, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw, 9))
    Path(path).write_bytes(png + chunk(b"IEND", b""))


def main(argv):
    src, out = argv[0], Path(argv[1])
    size = int(argv[2]) if len(argv) > 2 else 2048
    data = json.loads(Path(src).read_text(encoding="utf-8"))
    if data.get("format") != FORMAT or not data.get("targets"):
        raise SystemExit("house3d_bake: not a format 1 bake export with targets")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    device = use_gpu(scene)
    scene.cycles.samples = SAMPLES
    scene.world = bpy.data.worlds.new("world")
    scene.world.light_settings.distance = DISTANCE
    scene.render.bake.margin = MARGIN

    for i, o in enumerate(data["occluders"]):
        add_mesh(scene, f"occluder{i}", o["v"])
    x0, z0, x1, z1 = data["ground"]["rect"]
    y = data["ground"]["y"]
    add_mesh(scene, "ground", [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0])

    targets = []
    for i, t in enumerate(data["targets"]):
        ob = add_mesh(scene, f"target{i}", t["v"])
        n = len(ob.data.polygons)
        ob.data.attributes.new("src", "INT", "FACE").data.foreach_set("value", [i] * n)
        ob.data.attributes.new("tri", "INT", "FACE").data.foreach_set("value", list(range(n)))
        targets.append(ob)

    bpy.ops.object.select_all(action="DESELECT")
    for ob in targets:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.join()
    house = bpy.context.view_layer.objects.active
    # an 8-bit image in Blender's default sRGB, which the engine reads as data: the occlusion is
    # softened that way on purpose, as in the bake the operator chose the look from (2026-11-26)
    img = bpy.data.images.new("ao", size, size, alpha=False)
    mat = bpy.data.materials.new("ao")
    if mat.node_tree is None:
        mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    house.data.materials.clear()
    house.data.materials.append(mat)
    uv_layer = house.data.uv_layers.new(name="ao")
    house.data.uv_layers.active = uv_layer
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.002, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    start = time.time()
    bpy.ops.object.bake(type="AO")
    front = pixels(img, size)
    flip_normals()
    bpy.ops.object.bake(type="AO")
    flip_normals()
    print(f"house3d_bake: {len(targets)} targets baked in {time.time() - start:.1f} s on {device}")

    out.mkdir(parents=True, exist_ok=True)
    write_grey_png(out / ATLAS, np.maximum(front, pixels(img, size)), size)
    uvs = [[0.0] * (2 * t["count"]) for t in data["targets"]]
    layer = house.data.uv_layers["ao"].data
    srcs = house.data.attributes["src"].data
    tris = house.data.attributes["tri"].data
    for poly in house.data.polygons:
        uv, tri = uvs[srcs[poly.index].value], tris[poly.index].value
        for corner, li in enumerate(poly.loop_indices):
            u, v = layer[li].uv
            uv[2 * (3 * tri + corner)] = round(u, 5)
            # three.js reads the atlas unflipped, its rows top down
            uv[2 * (3 * tri + corner) + 1] = round(1 - v, 5)
    meshes = {t["key"]: {"count": t["count"], "uv": uvs[i]} for i, t in enumerate(data["targets"])}
    bake = {
        "format": FORMAT,
        "atlas": ATLAS,
        "size": size,
        "distance": DISTANCE,
        "samples": SAMPLES,
        "meshes": meshes,
    }
    (out / "bake.json").write_text(json.dumps(bake, separators=(",", ":")), encoding="utf-8")
    print(f"house3d_bake: wrote {out / 'bake.json'} and {out / ATLAS}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
