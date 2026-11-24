"""scripts/house3d-copy.sh on a scratch consumer, with a local source in place of GitHub."""

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "house3d-copy.sh"
SHA = "0123456789abcdef0123456789abcdef01234567"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class CopyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.src = self.tmp / "src"
        for rel, text in {
            "house3d/a.js": "a\n",
            "house3d/scene/b.js": "b\n",
            "scripts/tool.py": "print(1)\n",
            "scripts/other.py": "not copied\n",
        }.items():
            (self.src / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.src / rel).write_text(text)
        shutil.copy2(SCRIPT, self.src / "scripts" / "house3d-copy.sh")
        self.dst = self.tmp / "consumer"
        (self.dst / "house3d").mkdir(parents=True)
        (self.dst / "house3d" / "card.js").write_text("card\n")
        (self.dst / "house3d" / "stale.js").write_text("stale\n")
        self.manifest = {
            "repo": "khelias/khe-house3d",
            "commit": "",
            "include": ["house3d/", "scripts/tool.py", "scripts/house3d-copy.sh"],
            "own": ["house3d/card.js"],
            "files": {},
        }
        (self.dst / "house3d-engine.json").write_text(json.dumps(self.manifest))
        self.vendored = self.dst / "scripts" / "house3d-copy.sh"
        self.git("init", "-q")

    def git(self, *args):
        subprocess.run(["git", "-C", str(self.dst), *args], check=True, capture_output=True)

    def run_copy(self, *args, script=SCRIPT):
        env = {**os.environ, "HOUSE3D_COPY_SOURCE": str(self.src)}
        return subprocess.run(
            ["bash", str(script), *args], cwd=self.dst, env=env, capture_output=True, text=True
        )

    def write(self):
        r = self.run_copy(SHA)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("not checked against", r.stdout)
        self.git("add", "-A")
        return json.loads((self.dst / "house3d-engine.json").read_text())

    def test_write_keeps_include_and_own_and_drops_stale(self):
        m = self.write()
        self.assertEqual(m["include"], self.manifest["include"])
        self.assertEqual(m["own"], ["house3d/card.js"])
        self.assertEqual(m["commit"], SHA)
        self.assertEqual(
            sorted(m["files"]),
            ["house3d/a.js", "house3d/scene/b.js", "scripts/house3d-copy.sh", "scripts/tool.py"],
        )
        self.assertFalse((self.dst / "house3d" / "stale.js").exists())
        self.assertTrue((self.dst / "house3d" / "card.js").exists())
        self.assertFalse((self.dst / "scripts" / "other.py").exists())
        self.assertEqual(m["files"]["scripts/house3d-copy.sh"], sha(SCRIPT))

    def assert_check_fails(self, expected):
        r = self.run_copy("--check", script=self.vendored)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn(expected, r.stderr)

    def test_check_passes_and_fails(self):
        self.write()
        self.assertEqual(self.run_copy("--check", script=self.vendored).returncode, 0)

        (self.dst / "house3d" / "a.js").write_text("edited\n")
        self.assert_check_fails("house3d/a.js: changed")
        (self.dst / "house3d" / "a.js").write_text("a\n")

        (self.dst / "house3d" / "scene" / "b.js").unlink()
        self.assert_check_fails("house3d/scene/b.js: missing")
        (self.dst / "house3d" / "scene" / "b.js").write_text("b\n")

        (self.dst / "house3d" / "extra.js").write_text("x\n")
        self.git("add", "house3d/extra.js")
        self.assert_check_fails("house3d/extra.js: not in the engine copy")

    def test_own_file_in_the_source_is_not_copied(self):
        (self.src / "house3d" / "card.js").write_text("engine's card\n")
        m = self.write()
        self.assertNotIn("house3d/card.js", m["files"])
        self.assertEqual((self.dst / "house3d" / "card.js").read_text(), "card\n")

    def test_a_bump_that_changes_the_script_finishes(self):
        self.write()
        vendored = self.vendored
        newer = self.src / "scripts" / "house3d-copy.sh"
        newer.write_text(newer.read_text() + "# a newer version\n" * 200)
        r = self.run_copy(SHA, script=vendored)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"files from khelias/khe-house3d@{SHA[:12]}", r.stdout)
        self.assertEqual(sha(vendored), sha(newer))
        m = json.loads((self.dst / "house3d-engine.json").read_text())
        self.assertEqual(m["files"]["scripts/house3d-copy.sh"], sha(newer))

    def test_symlink_in_source_is_refused(self):
        (self.src / "house3d" / "link.js").symlink_to("/etc/hosts")
        before = (self.dst / "house3d-engine.json").read_text()
        r = self.run_copy(SHA)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("symlinks", r.stderr)
        self.assertEqual((self.dst / "house3d-engine.json").read_text(), before)
        self.assertTrue((self.dst / "house3d" / "stale.js").exists())

    def test_a_folder_missing_in_the_source_changes_nothing(self):
        shutil.rmtree(self.src / "house3d")
        r = self.run_copy(SHA)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("has no house3d/", r.stderr)
        self.assertTrue((self.dst / "house3d" / "stale.js").exists())

    def test_bad_commit_bad_manifest_and_no_manifest(self):
        self.assertEqual(self.run_copy("main").returncode, 2)
        self.assertNotEqual(self.run_copy("--check").returncode, 0)
        for include in (["house3d/"], ["../x/", "scripts/house3d-copy.sh"]):
            (self.dst / "house3d-engine.json").write_text(json.dumps({**self.manifest, "include": include}))
            r = self.run_copy(SHA)
            self.assertNotEqual(r.returncode, 0)
            self.assertNotIn("Traceback", r.stderr)
        (self.dst / "house3d-engine.json").unlink()
        self.assertEqual(self.run_copy(SHA).returncode, 2)


if __name__ == "__main__":
    unittest.main()
