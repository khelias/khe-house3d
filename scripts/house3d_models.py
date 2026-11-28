"""Foto's models from CC0 downloads, run in Blender by house3d-models.sh (ADR-001 point 3).

blender -b --factory-startup -P scripts/house3d_models.py -- SRC OUT

Each item takes one or more Poly Haven glTFs from SRC/<asset>/, keeps the parts it names,
thins and reduces them to the budget (house3d_model_kit.BUDGET), joins them into one mesh with at
most two materials, sets its foot's centre at the origin (x across, z along, y up once exported)
and writes OUT/<item>.glb without images, extras or names it did not set, with each material's
maps scaled beside it as PNG and their facts in OUT/<item>.json. The scale stays the source's:
the engine fits a model into the item it stands for at run time.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import house3d_model_kit as kit

# item -> parts: (asset, object name prefixes kept, material name in the item, keep share of
# islands, reduce ratio); a part's material maps come from its source material
ITEMS = {
    "garden-table": [
        ("outdoor_table_chair_set_01", ["outdoor_table_chair_set_01_table"], "table", 1, 0.8),
        ("outdoor_table_chair_set_01", ["outdoor_table_chair_set_01_chair"], "chair", 1, 0.45),
    ],
    "pot": [
        ("potted_plant_02", ["potted_plant_02_pot", "potted_plant_02_dirt"], "pot", 1, 0.3),
        ("potted_plant_02", ["potted_plant_02_leaves"], "leaves", 1, 0.3),
    ],
    "plant": [
        (
            "potted_plant_01",
            ["potted_plant_01_pot", "potted_plant_01_stem", "potted_plant_01_pebbles"],
            "pot",
            1,
            0.12,
        ),
        ("potted_plant_01", ["potted_plant_01_leaves"], "leaves", 0.45, 0.07),
    ],
    "plant-bloom": [
        ("ceramic_vase_02", ["ceramic_vase_02"], "vase", 1, 0.12),
        (
            "periwinkle_plant",
            ["periwinkle_plant_01", "periwinkle_plant_02", "periwinkle_plant_03"],
            "flowers",
            1,
            0.15,
        ),
    ],
    "fern": [
        ("fern_02", ["fern_02_b"], "fronds", 1, 0.8),
    ],
}
# the alpha map a cut-out part's colour takes, from the maps house3d-models.sh downloads
CUT = {
    "fern_02": "Alpha",
    "potted_plant_01": "leaves_alpha",
    "potted_plant_02": "leaves_alpha",
    "periwinkle_plant": "opacity",
}
# parts whose triangles are many but whose shape is plain (a pot's dirt and pebbles): reduced to
# this many triangles whatever the ratio
PLAIN = {"potted_plant_02_dirt": 300, "potted_plant_01_pebbles": 300}
# how a part's pieces are laid out in its item: the bloom's stems, each set on the vase's axis,
# turned a third of a turn from the last, leaning out and standing in its mouth
BUNCH = {("plant-bloom", "flowers"): {"lift": 0.24, "lean": 0.25, "scale": 1.1}}


def build(src, item, parts):
    kit.reset()
    kept = []
    for asset, prefixes, mat_name, share, ratio in parts:
        objs = kit.import_new(os.path.join(src, asset, f"{asset}_1k.gltf"))
        objs = [o for o in objs if any(o.name.startswith(p) for p in prefixes)]
        for o in objs:
            plain = next((n for p, n in PLAIN.items() if o.name.startswith(p)), None)
            if share < 1:
                kit.thin_islands(o, share, seed=item)
            if plain:
                kit.reduce_to(o, plain)
            else:
                kit.reduce(o, ratio)
        bunch = BUNCH.get((item, mat_name))
        if bunch:
            for k, o in enumerate(objs):
                kit.stand(
                    o, bunch["lift"], bunch["lean"], k * 2 * math.pi / len(objs), bunch["scale"]
                )
        maps = kit.material_maps(objs[0].data.materials[0])
        if maps["alpha"]:
            cut = os.path.join(src, asset, f"{CUT[asset]}.png")
            maps["colour"] = kit.with_alpha(maps["colour"], cut, f"{item}-{mat_name}")
        kept.append(kit.part(objs, mat_name, maps))
    return kit.assemble(item, kept)


def main():
    src, out = sys.argv[sys.argv.index("--") + 1 :][:2]
    for item, parts in ITEMS.items():
        kit.write(build(src, item, parts), item, out)


if __name__ == "__main__":
    main()
