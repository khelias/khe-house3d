"""Foto's models that no CC0 download exists for, built from measurements in Blender and run by
house3d-models.sh (ADR-001 point 3); our own work, CC0 like the rest of the assets.

blender -b --factory-startup -P scripts/house3d_make_models.py -- SRC OUT

Blender's x is across, y along (the item's back at +y, which is the engine's -z) and z up. The
painted and plastic things have no maps: the engine draws them in their surface's colour. The
thuja's needles are cards cut from Poly Haven's fir_tree_01 twig map in SRC/fir_tree_01/.
"""

import itertools
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import house3d_model_kit as kit

# a 240 l two-wheeled bin to EN 840 (as sold by the large makers: 580 x 740 x 1070 mm), wheels
# 200 mm, the lid 40 mm thick with the handle bar along its back hinge
BIN = {
    "w": 0.58,
    "d": 0.74,
    "h": 1.07,
    "foot": (0.46, 0.56),
    "lid": 0.04,
    "wheel": 0.1,
    "tyre": 0.055,
}
# a steel post mailbox: a 380 x 200 box, 250 high to its rounded roof's foot, on a 70 mm post
# whose top is 1.05 m (the props layer's MAILBOX)
MAILBOX = {"w": 0.38, "d": 0.2, "h": 0.25, "post": 0.07, "top": 1.05}
# a garden lamp post: a base, a slim pole up to the lights layer's head at 2.15 m and the cap that
# shades it 0.14 m higher (props.js LAMP_HEAD and LAMP)
LAMP = {
    "base": (0.1, 0.12),
    "pole": (0.045, 0.035),
    "head": 2.15,
    "head_h": 0.14,
    "cap": (0.27, 0.03),
}
# site.js THUJA: (radius, height) up the column, and how many needle cards cover it
THUJA = [
    (0, 0),
    (0.26, 0),
    (0.3, 0.25),
    (0.29, 0.7),
    (0.23, 1.1),
    (0.13, 1.4),
    (0.04, 1.58),
    (0, 1.62),
]
THUJA_CARDS, THUJA_CARD = 1100, 0.2
# the four large twigs on fir_tree_01's twig map, as (u0, v0, u1, v1): a card shows one of them
TWIGS = [
    (0.19, 0.69, 0.43, 0.96),
    (0.65, 0.63, 0.94, 0.96),
    (0.3, 0.22, 0.64, 0.6),
    (0.63, 0.17, 0.95, 0.55),
]


def mesh(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def box(name, lo, hi, bevel=0.0, taper=None):
    """A box from lo to hi; `taper` (x, y) gives its bottom's size, centred under the top."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bx, by = (taper[0] / 2, taper[1] / 2) if taper else ((x1 - x0) / 2, (y1 - y0) / 2)
    v = [
        (cx - bx, cy - by, z0),
        (cx + bx, cy - by, z0),
        (cx + bx, cy + by, z0),
        (cx - bx, cy + by, z0),
        (x0, y0, z1),
        (x1, y0, z1),
        (x1, y1, z1),
        (x0, y1, z1),
    ]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = mesh(name, v, f)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 2, "ANGLE"
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_apply(modifier=m.name)
    return o


def cylinder(name, r, z0, z1, at=(0, 0), n=20, axis="z", r1=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=n, radius1=r, radius2=r if r1 is None else r1, depth=z1 - z0
    )
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if axis == "x":
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, "Y"))
        o.data.transform(Matrix.Translation(((z0 + z1) / 2, at[0], at[1])))
    else:
        o.data.transform(Matrix.Translation((at[0], at[1], (z0 + z1) / 2)))
    return o


def make_bin():
    b = BIN
    w, d, h, t, r = b["w"], b["d"], b["h"], b["lid"], b["wheel"]
    body = box(
        "body",
        (-w / 2 + 0.02, -d / 2 + 0.03, 0.03),
        (w / 2 - 0.02, d / 2 - 0.06, h - t),
        0.02,
        taper=b["foot"],
    )
    rim = box(
        "rim",
        (-w / 2 + 0.01, -d / 2 + 0.02, h - t - 0.05),
        (w / 2 - 0.01, d / 2 - 0.05, h - t),
        0.01,
    )
    lid = box("lid", (-w / 2, -d / 2, h - t), (w / 2, d / 2 - 0.02, h), 0.012)
    # the handle bar along the back, above the wheels, and its two arms into the body
    bar = cylinder(
        "bar", 0.016, -w / 2 + 0.06, w / 2 - 0.06, at=(d / 2 - 0.02, h - t - 0.03), n=10, axis="x"
    )
    arms = [
        box(
            f"arm{s}",
            (s * (w / 2 - 0.09) - 0.02, d / 2 - 0.08, h - t - 0.05),
            (s * (w / 2 - 0.09) + 0.02, d / 2 - 0.01, h - t - 0.01),
        )
        for s in (-1, 1)
    ]
    wheels = [
        cylinder(
            f"wheel{s}",
            r,
            s * (w / 2 - 0.02) - b["tyre"] / 2,
            s * (w / 2 - 0.02) + b["tyre"] / 2,
            at=(d / 2 - r, r),
            n=20,
            axis="x",
        )
        for s in (-1, 1)
    ]
    axle = cylinder("axle", 0.012, -w / 2 + 0.02, w / 2 - 0.02, at=(d / 2 - r, r), n=8, axis="x")
    # the front lifting lip under the lid and the feet the bin stands on at the front
    lip = box(
        "lip", (-0.12, -d / 2 - 0.005, h - t - 0.09), (0.12, -d / 2 + 0.05, h - t - 0.06), 0.008
    )
    feet = box("feet", (-w / 2 + 0.07, -d / 2 + 0.06, 0), (w / 2 - 0.07, -d / 2 + 0.12, 0.04))
    return [
        kit.part([body, rim, lip, feet], "body", None),
        kit.part([lid, bar, *arms, *wheels, axle], "trim", None),
    ]


def make_mailbox():
    m = MAILBOX
    w, d, h, p, top = m["w"], m["d"], m["h"], m["post"], m["top"]
    post = box("post", (-p / 2, -p / 2, 0), (p / 2, p / 2, top), 0.006)
    plate = box("plate", (-0.09, -0.09, top - 0.01), (0.09, 0.09, top), 0.004)
    body = box("body", (-w / 2, -d / 2, top), (w / 2, d / 2, top + h), 0.01)
    # the rounded roof: an arc across the box's depth, run along its width, with its two ends
    arc = [(d / 2 + 0.01) * math.cos(math.pi * k / 12) for k in range(13)]
    rise = [0.07 * math.sin(math.pi * k / 12) for k in range(13)]
    verts = [(x, y, top + h + z) for x in (-w / 2 - 0.01, w / 2 + 0.01) for y, z in zip(arc, rise)]
    faces = [(k, k + 1, 14 + k, 13 + k) for k in range(12)] + [
        tuple(range(12, -1, -1)),
        tuple(range(13, 26)),
    ]
    roof = mesh("roof", verts, faces)
    # the letter flap on the front, standing a little proud, and the lock under it
    flap = box(
        "flap", (-0.13, -d / 2 - 0.008, top + h - 0.07), (0.13, -d / 2, top + h - 0.03), 0.003
    )
    lock = box("lock", (-0.012, -d / 2 - 0.01, top + 0.07), (0.012, -d / 2, top + 0.094), 0.003)
    return [
        kit.part([body, roof, flap, lock], "box", None),
        kit.part([post, plate], "post", None),
    ]


def make_lamp():
    m = LAMP
    (br, bh), (pr0, pr1), head, hh, (cr, ch) = (
        m["base"],
        m["pole"],
        m["head"],
        m["head_h"],
        m["cap"],
    )
    base = cylinder("base", br, 0, bh, n=24, r1=br * 0.85)
    plinth = cylinder("plinth", br + 0.02, 0, 0.015, n=24)
    pole = cylinder("pole", pr0, bh, head, n=16, r1=pr1)
    collar = cylinder("collar", pr1 + 0.015, head - 0.03, head, n=16)
    cap = cylinder("cap", cr, head + hh, head + hh + ch, n=32, r1=cr * 0.82)
    finial = cylinder("finial", 0.02, head + hh + ch, head + hh + ch + 0.04, n=12, r1=0.006)
    return [kit.part([plinth, base, pole, collar, cap, finial], "metal", None)]


def _radius(z):
    for (r0, z0), (r1, z1) in itertools.pairwise(THUJA):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return 0.0


def make_thuja(src):
    # the core: the profile turned, a little inside it, so no daylight shows between the cards
    prof = [(r * 0.8, z) for r, z in THUJA if z > 0] + [(0, THUJA[-1][1])]
    n = 16
    verts, faces = [(0, 0, 0.0)], []
    for r, z in prof:
        for k in range(n):
            a = 2 * math.pi * k / n
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(len(prof) - 1):
        for k in range(n):
            a, b = 1 + i * n + k, 1 + i * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    faces += [(0, 1 + (k + 1) % n, 1 + k) for k in range(n)]
    core = mesh("core", verts, faces)
    # the needle cards: each a quad on the column's surface, facing out and up, turned at random
    rng = random.Random("thuja")
    cv, cf, cuv = [], [], []
    height = THUJA[-1][1]
    for i in range(THUJA_CARDS):
        z = height * (1 - math.sqrt(rng.random())) ** 0.7
        r = _radius(z)
        a = rng.random() * 2 * math.pi
        out = Vector((math.cos(a), math.sin(a), 0.35 + rng.random() * 0.5)).normalized()
        centre = Vector((r * math.cos(a), r * math.sin(a), z)) - out * 0.03
        s = THUJA_CARD * (0.7 + 0.6 * rng.random()) * (0.75 + 0.25 * min(1, r / 0.25))
        up = Vector((0, 0, 1))
        side = out.cross(up).normalized()
        along = side.cross(out).normalized()
        spin = rng.random() * 2 * math.pi
        u = side * math.cos(spin) + along * math.sin(spin)
        v = out.cross(u).normalized()
        base = len(cv)
        u0, v0, u1, v1 = TWIGS[rng.randrange(len(TWIGS))]
        for du, dv, uv in (
            (-1, -1, (u0, v0)),
            (1, -1, (u1, v0)),
            (1, 1, (u1, v1)),
            (-1, 1, (u0, v1)),
        ):
            cv.append(tuple(centre + u * du * s / 2 + v * dv * s / 2))
            cuv.append(uv)
        cf.append((base, base + 1, base + 2, base + 3))
    cards = mesh("cards", cv, cf)
    uv = cards.data.uv_layers.new(name="UVMap")
    for loop in cards.data.loops:
        uv.data[loop.index].uv = cuv[loop.vertex_index]
    # the needles' map: the fir twig colour with its alpha as the card's cut
    d = os.path.join(src, "fir_tree_01")
    diff = bpy.data.images.load(os.path.join(d, "twig_diff.png"))
    needles = kit.with_alpha(diff, os.path.join(d, "twig_alpha.png"), "thuja-needles")
    return [
        kit.part([core], "core", None),
        kit.part([cards], "needles", {"colour": needles, "normal": None, "alpha": True}),
    ]


def main():
    src, out = sys.argv[sys.argv.index("--") + 1 :][:2]
    for item, make in (
        ("bin", make_bin),
        ("mailbox", make_mailbox),
        ("lamp-post", make_lamp),
        ("thuja", lambda: make_thuja(src)),
    ):
        kit.reset()
        kit.write(kit.assemble(item, make()), item, out)


if __name__ == "__main__":
    main()
