"""Run the production CLIs with a separate tool checkout inside the real project."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import native_palette_compatibility as palette
from production_paths import project_output

ROOT = Path(__file__).resolve().parents[2]
ENTRIES = {
    "budget_classification_report": ["--budget", "missing", "--ktx", "missing"],
    "native_batch_gate": ["--batch", "missing"],
    "native_palette_compatibility": ["--batch", "missing", "--stage"],
    "native_release_manifest": ["--sidecar", "missing", "--packages", "missing"],
    "qa_male_production_readiness": [],
}


def link_directory(link, target):
    link.parent.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/j", str(link), str(target)],
                       check=True, capture_output=True)
    else:
        link.symlink_to(target, target_is_directory=True)


class DiagnosticOutputPaths(unittest.TestCase):
    def setUp(self):
        scratch = project_output(ROOT / "experiments", __file__)
        fixture = Path(self.enterContext(tempfile.TemporaryDirectory(dir=scratch)))
        self.tool = fixture / "operator"
        subprocess.run(["git", "init", "-q", str(self.tool)], check=True)
        self.outside = fixture / "input-checkout"
        self.outside.mkdir()
        self.bin = self.tool / "scripts/production"
        self.bin.mkdir(parents=True)
        for name in [*ENTRIES, "production_paths"]:
            shutil.copyfile(Path(__file__).with_name(name + ".py"), self.bin / (name + ".py"))
        for dep in ["assets-source/native-vroid-iris-study-v1/readback.py", "scripts/m2-male-face-v1/glb.py"]:
            (self.tool / dep).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / dep, self.tool / dep)

    def invoke(self, name, *args):
        return subprocess.run([sys.executable, "-B", str(self.bin / (name + ".py")), *args],
                              cwd=self.tool, capture_output=True, text=True)

    def test_report_destinations_fail_before_missing_inputs_or_staging(self):
        redirect = self.tool / "redirect"
        link_directory(redirect, self.outside)
        for name, args in ENTRIES.items():
            for target in (self.outside / "report.json", "../input-checkout/report.json", redirect / "report.json"):
                with self.subTest(name=name, target=target):
                    run = self.invoke(name, *args, "--output", str(target))
                    self.assertNotEqual(run.returncode, 0)
                    self.assertIn("inside the production tool main checkout", run.stderr + run.stdout)
        self.assertEqual(list(self.outside.iterdir()), [])
        self.assertFalse((self.tool / "output").exists())

    def test_read_only_imports_do_not_require_the_write_helper(self):
        (self.bin / "production_paths.py").unlink()
        code = "import importlib,sys; sys.path.insert(0,sys.argv[1]); [importlib.import_module(n) for n in sys.argv[2:]]"
        subprocess.run([sys.executable, "-I", "-B", "-c", code, str(self.bin), *ENTRIES],
                       cwd=self.tool, check=True)

    def test_palette_stage_rejects_redirected_destination_leaf_and_lock(self):
        staging = self.tool / "assets-source/native-facecontour-iris-palette-v1"
        link_directory(staging, self.outside)
        run = self.invoke("native_palette_compatibility", "--stage", "--batch", "missing")
        self.assertIn("inside the production tool main checkout", run.stderr)
        self.assertNotEqual(run.returncode, 0)

        destination = self.tool / "fresh-stage"
        link_directory(destination / "native-test", self.outside)
        lock_dir = self.tool / "output/locks"
        with patch.object(palette, "__file__", self.bin / "native_palette_compatibility.py"), \
                patch.object(palette, "LOCK_DIR", lock_dir):
            with self.assertRaisesRegex(ValueError, "inside the production tool main checkout"):
                palette.stage(destination, {"native-test/manifest.json": b"fixture"})
            self.assertFalse(lock_dir.exists())
            link_directory(lock_dir, self.outside)
            with self.assertRaisesRegex(ValueError, "inside the production tool main checkout"):
                palette.stage(self.tool / "unwritten", {"registry.json": b"fixture"})
            self.assertFalse((self.tool / "unwritten").exists())
        self.assertEqual(list(self.outside.iterdir()), [])

    def test_both_tool_worktrees_contend_for_one_palette_destination_lock(self):
        git = ["git", "-C", str(self.tool)]
        subprocess.run([*git, "add", "scripts", "assets-source"], check=True, capture_output=True)
        subprocess.run([*git, "-c", "user.name=Fixture", "-c", "user.email=fixture@invalid.test",
                        "commit", "-qm", "test fixture"], check=True, capture_output=True)
        linked = self.tool / "experiments/linked"
        subprocess.run([*git, "worktree", "add", "--detach", str(linked), "HEAD"], check=True, capture_output=True)
        destination = self.tool / "palette"
        command = ("import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);"
                   "import native_palette_compatibility as p;"
                   "p.stage(Path(sys.argv[2]),{p.REGISTRY:p.json_bytes({'schema':p.REGISTRY_SCHEMA,'entries':[]})})")

        def stage(checkout):
            return subprocess.run([sys.executable, "-B", "-c", command, str(checkout / "scripts/production"),
                                   str(destination)], cwd=checkout, capture_output=True, text=True)

        first = stage(self.tool)
        self.assertEqual(first.returncode, 0, first.stderr)
        lock_path, = (self.tool / "output/native-palette-locks").glob("*.lock")
        with lock_path.open("a+b") as lock:
            if os.name == "nt":
                import msvcrt
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertNotEqual(stage(linked).returncode, 0)
        repeated = stage(linked)
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertFalse((linked / "output/native-palette-locks").exists())
        self.assertEqual(list(lock_path.parent.glob("*.lock")), [lock_path])


if __name__ == "__main__":
    unittest.main()
