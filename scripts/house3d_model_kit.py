"""Blender helpers shared by house3d_models.py and house3d_make_models.py (run inside Blender).

A model is one mesh object with at most two materials. Its .glb holds geometry and material
slots only, no images (khe.ee's CSP refuses the blob: URLs embedded images become); each
material's colour map (with its alpha) and normal map are written beside it as PNG for basisu,
and OUT/<item>.json records what the engine needs: triangles, each material's maps, whether it
is cut out and its colour map's mean linear colour, and the box.
"""

import json
import os
import random
import struct

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

BUDGET = {"triangles": 6000, "materials": 2}
COLOUR_SIZE, NORMAL_SIZE = 512, 256


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_new(path):
    """Imports a glTF into the scene and returns its new mesh objects, their transforms applied."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        apply_transform(o)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    return meshes


def apply_transform(o):
    o.data = o.data.copy()
    o.data.transform(o.matrix_world)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)


def triangles(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def thin_islands(o, share, seed):
    """Keeps about `share` of the object's loose parts (a plant's leaves), picked by a seeded draw."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    seen, islands = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        islands.append(island)
    rng = random.Random(seed)
    drop = [f for island in islands if rng.random() >= share for f in island]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.to_mesh(o.data)
    bm.free()


def reduce(o, ratio):
    if ratio >= 1:
        return
    m = o.modifiers.new("reduce", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = ratio
    m.use_collapse_triangulate = True
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier=m.name)


def reduce_to(o, n):
    t = triangles(o)
    if t > n:
        reduce(o, n / t)


def join(objs):
    if len(objs) == 1:
        return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs):
        bpy.ops.object.join()
    return objs[0]


def _bounds(o):
    """A mesh's lowest and highest vertex coordinates."""
    vs = o.data.vertices
    lo = Vector(min(v.co[k] for v in vs) for k in range(3))
    hi = Vector(max(v.co[k] for v in vs) for k in range(3))
    return lo, hi


def _foot(o):
    """The translation that sets a mesh's foot's centre at the origin."""
    lo, hi = _bounds(o)
    return Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))


def stand(o, up, lean, turn, scale):
    """Sets a piece's foot on the origin's axis, scaled, leaning by `lean` radians out towards
    `turn` and raised by `up`."""
    tilt = Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(lean, 4, "X")
    o.data.transform(Matrix.Translation((0, 0, up)) @ tilt @ Matrix.Scale(scale, 4) @ _foot(o))


def _image(node_input):
    """The image behind a material input, through a normal map node or a separate-colour node."""
    for link in node_input.links:
        n = link.from_node
        if n.type == "TEX_IMAGE":
            return n.image
        for i in n.inputs:
            img = _image(i)
            if img:
                return img
    return None


def with_alpha(colour, alpha_path, name):
    """A new image of a colour map with another image's first channel as its alpha."""
    alpha = bpy.data.images.load(alpha_path)
    w, h = colour.size
    if tuple(alpha.size) != (w, h):
        alpha.scale(w, h)
    px = np.array(colour.pixels[:], dtype=np.float32).reshape(-1, 4)
    px[:, 3] = np.array(alpha.pixels[:], dtype=np.float32).reshape(-1, 4)[:, 0]
    made = bpy.data.images.new(name, w, h, alpha=True)
    made.pixels = px.ravel().tolist()
    return made


def material_maps(mat):
    """The colour map (and whether its alpha cuts the material out) and the normal map of a
    Principled material."""
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    colour = _image(bsdf.inputs["Base Color"])
    alpha = bool(bsdf.inputs["Alpha"].links)
    normal = _image(bsdf.inputs["Normal"])
    return {"colour": colour, "normal": normal, "alpha": alpha}


# each named material's maps, for write()
MAPS = {}


def part(objs, name, maps):
    """Joins objects into one part in one material named `name`, with its maps (None for a plain
    material drawn in its surface's colour), which write() saves beside the model."""
    o = join(objs)
    MAPS[name] = maps
    o.data.materials.clear()
    o.data.materials.append(bpy.data.materials.new(name))
    return o


def assemble(item, parts):
    """Joins an item's parts and sets its foot's centre at the origin."""
    o = join(parts)
    o.data.transform(_foot(o))
    o.name = item
    o.data.name = item
    return o


def _linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _save_scaled(img, size, path, alpha):
    """Writes an image scaled down to size x size (a block average) as PNG, through a new image:
    Blender saves a loaded file in that file's own format whatever is asked."""
    w, h = img.size
    if w % size or h % size:
        raise SystemExit(f"{img.name}: {w}x{h} does not divide to {size}")
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    px = px.reshape(size, h // size, size, w // size, 4).mean(axis=(1, 3))
    if not alpha:
        px[..., 3] = 1
    made = bpy.data.images.new(os.path.basename(path), size, size, alpha=alpha)
    made.pixels = px.ravel().tolist()
    made.filepath_raw = path
    made.file_format = "PNG"
    made.save()
    return made


def _mean(img, alpha):
    """Mean linear colour of an image's pixels, over the opaque ones when it is cut out."""
    px = list(img.pixels)
    n, acc = 0, [0.0, 0.0, 0.0]
    for i in range(0, len(px), 4):
        if alpha and px[i + 3] < 0.5:
            continue
        for k in range(3):
            acc[k] += _linear(px[i + k])
        n += 1
    return [round(a / max(n, 1), 4) for a in acc]


def write(o, item, out):
    """Writes OUT/<item>.glb, its maps as PNG and OUT/<item>.json."""
    mats = [m for m in o.data.materials if m]
    tris = triangles(o)
    if tris > BUDGET["triangles"] or len(mats) > BUDGET["materials"]:
        raise SystemExit(
            f"{item}: {tris} triangles, {len(mats)} materials over the budget {BUDGET}"
        )
    facts = {"triangles": tris, "materials": {}}
    for m in mats:
        name = m.name.split(".")[0]
        maps = MAPS[name]
        m.name = name
        m.use_nodes = False
        if maps is None:
            # a plain material, drawn in its surface's colour
            facts["materials"][name] = {}
            continue
        colour = _save_scaled(
            maps["colour"], COLOUR_SIZE, os.path.join(out, f"{item}-{name}.png"), maps["alpha"]
        )
        entry = {
            "map": f"{item}-{name}.ktx2",
            "alpha": maps["alpha"],
            "mean": _mean(colour, maps["alpha"]),
        }
        if maps["normal"]:
            _save_scaled(
                maps["normal"], NORMAL_SIZE, os.path.join(out, f"{item}-{name}-normal.png"), False
            )
            entry["normal"] = f"{item}-{name}-normal.ktx2"
        facts["materials"][name] = entry
    lo, hi = _bounds(o)
    # Blender's x, y (along) and z (up) are the engine's x, z and y
    facts["box"] = [round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)]
    for other in list(bpy.context.scene.objects):
        if other != o:
            bpy.data.objects.remove(other)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out, f"{item}.glb"),
        export_format="GLB",
        export_image_format="NONE",
        export_extras=False,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_attributes=False,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_vertex_color="NONE",
    )
    quantize(os.path.join(out, f"{item}.glb"))
    with open(os.path.join(out, f"{item}.json"), "w") as f:
        json.dump(facts, f, indent=1)
        f.write("\n")
    print(item, json.dumps(facts))


# KHR_mesh_quantization, which three.js's GLTFLoader reads with no decoder: positions as
# normalised int16 under the node's uniform scale and translation, normals as normalised int8,
# texture coordinates in [0, 1] as normalised uint16
_TYPES = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def quantize(path):
    with open(path, "rb") as f:
        raw = f.read()
    jlen = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + jlen])
    blob = raw[20 + jlen + 8 :]

    def read(i):
        a = doc["accessors"][i]
        v = doc["bufferViews"][a["bufferView"]]
        n = a["count"] * _WIDTH[a["type"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(blob, _TYPES[a["componentType"]], n, off).reshape(a["count"], -1)

    out, views, accessors = bytearray(), [], []

    def put(arr, ctype, kind, normalized=False, minmax=False, target=34962):
        arr = np.ascontiguousarray(arr)
        if kind == "VEC3" and arr.dtype.itemsize < 4:
            # a vertex attribute's stride is a multiple of 4: pad to four components
            data = np.zeros((arr.shape[0], 4), arr.dtype)
            data[:, :3] = arr
        else:
            data = arr
        view = {"buffer": 0, "byteOffset": len(out), "byteLength": data.nbytes}
        if data is not arr:
            view["byteStride"] = 4 * arr.dtype.itemsize
        view["target"] = target
        data = data.tobytes()
        out.extend(data)
        out.extend(b"\0" * (-len(out) % 4))
        views.append(view)
        acc = {
            "bufferView": len(views) - 1,
            "componentType": ctype,
            "count": arr.shape[0],
            "type": kind,
        }
        if normalized:
            acc["normalized"] = True
        if minmax:
            acc["min"] = arr.min(0).tolist()
            acc["max"] = arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    prims = [p for m in doc["meshes"] for p in m["primitives"]]
    pos = np.concatenate([read(p["attributes"]["POSITION"]) for p in prims])
    lo, hi = pos.min(0), pos.max(0)
    centre, half = (lo + hi) / 2, float((hi - lo).max() / 2) or 1.0
    for p in prims:
        at = p["attributes"]
        q = np.round((read(at["POSITION"]) - centre) / half * 32767).astype(np.int16)
        new = {"POSITION": put(q, 5122, "VEC3", True, True)}
        if "NORMAL" in at:
            nrm = read(at["NORMAL"])
            new["NORMAL"] = put(np.round(nrm * 127).astype(np.int8), 5120, "VEC3", True)
        if "TEXCOORD_0" in at:
            uv = read(at["TEXCOORD_0"])
            if uv.min() >= 0 and uv.max() <= 1:
                new["TEXCOORD_0"] = put(np.round(uv * 65535).astype(np.uint16), 5123, "VEC2", True)
            else:
                new["TEXCOORD_0"] = put(uv.astype(np.float32), 5126, "VEC2")
        idx = read(p["indices"]).ravel()
        ctype = 5123 if idx.max() < 65536 else 5125
        p["indices"] = put(
            idx.astype(np.uint16 if ctype == 5123 else np.uint32).reshape(-1, 1),
            ctype,
            "SCALAR",
            target=34963,
        )
        p["attributes"] = new
    # the quantised positions are the one mesh's, under a transform that replaces its own
    meshes = [n for n in doc["nodes"] if "mesh" in n]
    if len(meshes) != 1 or {"translation", "rotation", "scale", "matrix"} & meshes[0].keys():
        raise SystemExit(f"{path}: quantize takes one mesh node without a transform")
    meshes[0]["translation"] = centre.tolist()
    meshes[0]["scale"] = [half, half, half]
    doc["accessors"], doc["bufferViews"] = accessors, views
    doc["buffers"] = [{"byteLength": len(out)}]
    doc.setdefault("extensionsUsed", []).append("KHR_mesh_quantization")
    doc.setdefault("extensionsRequired", []).append("KHR_mesh_quantization")
    j = json.dumps(doc, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    total = 12 + 8 + len(j) + 8 + len(out)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(j), 0x4E4F534A) + j)
        f.write(struct.pack("<II", len(out), 0x004E4942) + bytes(out))
