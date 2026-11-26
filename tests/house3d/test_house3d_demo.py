"""Tests of the demo house, tests/house3d/fixture-demo.md: the house the khe.ee/ha demo shows.

Run from the repo root: python3 -I -m unittest discover -s tests/house3d -v
"""
import copy, importlib.util, re, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "tests/house3d/fixture-demo.md"
FIXTURE = ROOT / "tests/house3d/fixture-model.md"

_spec = importlib.util.spec_from_file_location("house3d_model", ROOT / "scripts/house3d_model.py")
hm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hm)
_vspec = importlib.util.spec_from_file_location("house3d_viewer", ROOT / "scripts/house3d_viewer.py")
hv = importlib.util.module_from_spec(_vspec)
_vspec.loader.exec_module(hv)

OUTDOORS = "oues"
ODD = re.compile(r"^-?\d+\.\d\d[13579]$")


def demo():
    return hm.read_layers(DEMO)


def coordinates(L):
    """Every device, car, future item and surroundings number that places something, with where
    it comes from."""
    p = L["private"]
    for d in p["devices"]:
        yield from ((d["entity"], v) for v in d["pos"] + d.get("look", []))
    car = p["car"]
    yield from (("car path", v) for pt in car["path"] for v in pt)
    prof = car["profile"]
    yield from (("car side", v) for pt in prof["side"] + prof["glass"] for v in pt)
    yield from (("car wheels", v) for v in [prof["wheels"]["r"], prof["wheels"]["track"], *prof["wheels"]["x"]])
    yield from (("car lights", v) for pair in prof["lights"]["front"] + prof["lights"]["rear"] for pt in pair for v in pt)
    yield from ((it["id"], v) for it in p["future"]["items"] for v in it["pos"])
    s = L["surroundings"]["surroundings"]
    yield from (("surroundings", v) for b in s["buildings"] + s["roads"] for pt in b["outline"] for v in pt)


class DemoHouse(unittest.TestCase):
    def test_it_validates_with_every_layer(self):
        L = demo()
        self.assertEqual(hm.validate(L), [])
        self.assertEqual(set(L), set(hm.LAYERS))

    def test_the_viewer_names_it(self):
        self.assertEqual(hv.DEMO, DEMO)

    def test_every_placing_number_has_an_odd_third_decimal(self):
        for path in (DEMO, FIXTURE):
            for where, v in coordinates(hm.read_layers(path)):
                with self.subTest(f"{path.name} {where}"):
                    self.assertRegex(repr(v), ODD)

    def test_the_test_house_devices_car_and_future_ids(self):
        mine, theirs = demo()["private"], hm.read_layers(FIXTURE)["private"]
        types = lambda p: {d["entity"]: d["type"] for d in p["devices"]}
        self.assertEqual(types(mine), types(theirs))
        self.assertEqual(
            {d["entity"]: d.get("role") for d in mine["devices"]},
            {d["entity"]: d.get("role") for d in theirs["devices"]},
        )
        self.assertEqual(mine["car"]["entity"], theirs["car"]["entity"])
        ids = lambda p: {it["id"]: it["kind"] for it in p["future"]["items"]}
        self.assertEqual(ids(mine), ids(theirs))
        self.assertEqual({c["entity"] for c in mine["devices"] if c["type"] == "camera"}, {"camera.test_drive", "camera.test_garden"})

    def test_every_device_stands_in_a_room_of_the_house(self):
        L = demo()
        rooms = {r["id"]: r for r in L["rooms"]["rooms"]}
        self.assertEqual(set(rooms), {f"r{i}" for i in range(1, 11)} | {"carport"})
        for d in L["private"]["devices"]:
            with self.subTest(d["entity"]):
                if d["room"] == OUTDOORS:
                    continue
                self.assertIn(d["room"], rooms)
                x, _, z = d["pos"]
                self.assertTrue(any(q[0] <= x <= q[2] and q[1] <= z <= q[3] for q in rooms[d["room"]]["rects"]), d["pos"])

    def test_the_car_clears_the_drive_gate(self):
        L = demo()
        car = L["private"]["car"]
        gate = next(g for g in L["geometry"]["site"]["gates"] if g["name"] == "drive")
        start, end = car["path"][0], car["path"][-1]
        self.assertLess(start[1], gate["a"][1])
        self.assertGreater(end[1], gate["a"][1])
        self.assertTrue(min(gate["a"][0], gate["b"][0]) < start[0] < max(gate["a"][0], gate["b"][0]))
        # starting just outside the gate, inside its leaf's swing, is refused
        near = copy.deepcopy(L)
        near["private"]["car"]["path"][0] = [start[0], gate["a"][1] - 1.013]
        self.assertTrue(any("before the drive gate's line" in p for p in hm.validate(near)))

    def test_the_pv_lies_on_the_south_face(self):
        L = demo()
        pv = next(it for it in L["private"]["future"]["items"] if it["kind"] == "pv")
        roof = L["geometry"]["roofs"][pv["roof"]]
        self.assertEqual(roof["kind"], "gable")
        # +z is south here (axes, x_axis_bearing_deg 90): the face that falls to +z
        self.assertEqual(hm.pv_face(roof, hm.future_corners(pv)), "z")
        self.assertTrue(all(z > (roof["rects"][0][1] + roof["rects"][0][3]) / 2 for _, z in hm.future_corners(pv)))
        self.assertEqual(L["geometry"]["georef"]["x_axis_bearing_deg"], 90)
        self.assertGreaterEqual(hm.panel_fit(*hm.pv_size(pv, roof)), pv["panels"])

    def test_the_showcase_names_a_demo_house(self):
        self.assertEqual(demo()["showcase"]["showcase"]["title"], "Näidismaja")


if __name__ == "__main__":
    unittest.main()
