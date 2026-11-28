"""Tests for scripts/house3d-place.py's apply, on a temporary copy of the synthetic fixture.

Run from the repo root: python3 -I -m unittest discover -s tests/house3d -v
"""
import contextlib, importlib.util, io, json, shutil, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests/house3d/fixture-model.md"

_spec = importlib.util.spec_from_file_location("house3d_place", ROOT / "scripts/house3d-place.py")
hp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hp)


class ApplyCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.model = Path(self.tmp.name) / "model.md"
        shutil.copyfile(FIXTURE, self.model)

    def tearDown(self):
        self.tmp.cleanup()

    def apply(self, changes):
        f = Path(self.tmp.name) / "changes.json"
        f.write_text(json.dumps(changes), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            hp.apply(str(self.model), str(f))
        return out.getvalue()

    def changed_lines(self):
        old = FIXTURE.read_text(encoding="utf-8").split("\n")
        new = self.model.read_text(encoding="utf-8").split("\n")
        self.assertEqual(len(old), len(new))
        return [(a, b) for a, b in zip(old, new) if a != b]



class ApplyFuture(ApplyCase):
    def test_a_moved_item_rewrites_its_line_only_and_stays_valid(self):
        out = self.apply({"future": {"tub": {"pos": [22.913, 12.317]}, "greenhouse": {"pos": [20.013, 24.513], "rot": 90}}})
        self.assertIn("future item tub: moved", out)
        self.assertIn("rot 0 -> 90", out)
        lines = self.changed_lines()
        self.assertEqual(len(lines), 2)
        items = [json.loads(b.strip().rstrip(",")) for _, b in lines]
        tub = next(it for it in items if it["id"] == "tub")
        self.assertEqual(tub["pos"], [22.913, 12.317])
        self.assertEqual(tub["facts"], [])
        self.assertTrue(lines[-1][1].rstrip().endswith("}"), "the last item keeps no trailing comma")
        self.assertEqual(hp.house3d_model.validate(hp.house3d_model.read_layers(self.model)), [])

    def test_moving_pv_off_its_roof_is_refused_before_writing(self):
        before = self.model.read_text(encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as e:
            self.apply({"future": {"pv": {"pos": [34.013, 1.013]}}})
        self.assertIn("future item pv: its rectangle is not inside roof wingN's outline", str(e.exception))
        self.assertEqual(self.model.read_text(encoding="utf-8"), before)

    def test_unknown_item_and_bad_rot_are_refused(self):
        with self.assertRaises(SystemExit) as e:
            self.apply({"future": {"sauna": {"pos": [1.5, 2.5]}}})
        self.assertIn("sauna", str(e.exception))
        with self.assertRaises(SystemExit) as e:
            self.apply({"future": {"tub": {"pos": [1.5, 2.5], "rot": 45}}})
        self.assertIn("rot 45", str(e.exception))


class ApplyProps(ApplyCase):
    def props(self):
        site = hp.house3d_model.read_layers(self.model)["geometry"]["site"]
        return {p["id"]: p for p in site.get("props", [])}

    def test_yard_things_are_added_moved_turned_and_removed_by_id(self):
        out = self.apply({"props": {
            "bin_mixed": {"kind": "bin", "at": [31.5, -5.0], "rot": 90},
            "pot_1": None,
            "bin_2": {"kind": "bin", "at": [33.4, -5.4]},
        }})
        self.assertIn("yard thing bin_mixed: moved", out)
        self.assertIn("rot 180 -> 90", out)
        self.assertIn("yard thing pot_1: removed", out)
        self.assertIn("yard thing bin_2: added", out)
        props = self.props()
        self.assertEqual(props["bin_mixed"]["at"], [31.5, -5.0])
        self.assertEqual(props["bin_mixed"]["rot"], 90)
        self.assertNotIn("pot_1", props)
        self.assertEqual(props["bin_2"], {"id": "bin_2", "kind": "bin", "at": [33.4, -5.4]})
        self.assertEqual(props["lamp_drive"]["rot"], 90, "the others as they were")
        self.assertEqual(hp.house3d_model.validate(hp.house3d_model.read_layers(self.model)), [])

    def test_a_model_without_props_gets_its_list(self):
        text = self.model.read_text(encoding="utf-8")
        start = text.index('  "props": [')
        end = text.index("  ],\n", start) + len("  ],\n")
        self.model.write_text(text[:start] + text[end:], encoding="utf-8")
        self.assertEqual(self.props(), {})
        self.apply({"props": {"lamp_1": {"kind": "lamp_post", "at": [20, 20]}}})
        self.assertEqual(list(self.props()), ["lamp_1"])
        self.assertEqual(hp.house3d_model.validate(hp.house3d_model.read_layers(self.model)), [])

    def test_unknown_yard_things_and_bad_ones_are_refused_before_writing(self):
        before = self.model.read_text(encoding="utf-8")
        for changes, problem in [
            ({"gnome": None}, "yard thing gnome: not in the geometry block's props list"),
            ({"x": {"kind": "gnome", "at": [1, 1]}}, "kind 'gnome' is not one of"),
            ({"x": {"kind": "bin", "at": [1]}}, "at is not two numbers"),
            ({"x": {"kind": "bin", "at": [1, 1], "rot": 45}}, "rot 45"),
            ({"x": {"kind": "bin", "at": [1, -40]}}, "at is outside the lot"),
        ]:
            with self.subTest(problem), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as e:
                self.apply({"props": changes})
            self.assertIn(problem, str(e.exception))
            self.assertEqual(self.model.read_text(encoding="utf-8"), before)

    def test_a_props_key_not_one_per_line_is_refused(self):
        text = self.model.read_text(encoding="utf-8")
        start = text.index('  "props": [')
        end = text.index("  ],\n", start) + len("  ],\n")
        self.model.write_text(text[:start] + '  "props": [],\n' + text[end:], encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as e:
            self.apply({"props": {"lamp_1": {"kind": "lamp_post", "at": [20, 20]}}})
        self.assertIn("the props list must open with a line", str(e.exception))


if __name__ == "__main__":
    unittest.main()
