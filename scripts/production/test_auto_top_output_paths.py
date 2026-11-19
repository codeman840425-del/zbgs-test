"""Regression checks for the private automatic top intake entrypoints."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import uuid

from production_paths import project_output


ROOT = Path(__file__).resolve().parents[2]
INTAKE = ROOT / "evidence/m2-native-top-removal-intake-v1"
VERIFY = ROOT / "evidence/m2-native-auto-top-v1/verify.py"
FIT = ROOT / "scripts/production/native_top_removal_fit.py"


class AutoTopOutputPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = project_output(ROOT / "output", __file__)
        cls.output.mkdir(exist_ok=True)

    @unittest.skipUnless(sys.platform == "win32", "Windows drive and directory junction regression")
    def test_all_writing_clis_reject_drive_paths_before_reading_missing_inputs(self):
        scratch_root = Path(ROOT.anchor)
        marker = "gamemake-auto-top-denied-" + uuid.uuid4().hex
        not_created = scratch_root / marker
        self.assertFalse(not_created.exists())
        missing = self.output / (marker + "-missing")
        commands = [
            (INTAKE / "replay_inputs.py", ["--archive", str(missing)], "inside the production tool main checkout"),
            (INTAKE / "replay_game.py", ["--inputs", str(missing), "--base", "0" * 40], "inside the production tool main checkout"),
            (FIT, [str(missing)], "inside the project's private output directory"),
        ]
        with TemporaryDirectory(dir=self.output, prefix="auto-top-boundary-") as temp:
            directory = Path(temp)
            self.assertTrue(directory.resolve().is_relative_to(self.output))
            junction = directory / "link-to-drive"
            subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(junction), str(scratch_root)],
                           check=True, capture_output=True)
            try:
                self.assertTrue(junction.is_junction())
                self.assertEqual(junction.resolve(), scratch_root)
                candidates = (scratch_root, not_created, Path(marker), junction / marker,
                              self.output / ".." / ".." / marker)
                for script, args, reason in commands:
                    for destination in candidates:
                        with self.subTest(script=script.name, destination=str(destination)):
                            process = subprocess.run([sys.executable, "-B", str(script), *args, "--output", str(destination)],
                                                     cwd=scratch_root, capture_output=True, text=True, encoding="utf-8")
                            self.assertNotEqual(process.returncode, 0)
                            self.assertIn(reason, process.stderr)
                            self.assertFalse(not_created.exists())
            finally:
                junction.rmdir()

    def test_private_build_keeps_inherited_node_outputs_in_checked_scratch(self):
        build = runpy.run_path(str(INTAKE / "replay_game.py"))["build"]
        with TemporaryDirectory(dir=self.output, prefix="auto-top-build-env-") as temp:
            directory = Path(temp)
            self.assertTrue(directory.resolve().is_relative_to(self.output))
            deps = directory / "prototype"
            vite = deps / "node_modules/vite/bin/vite.js"
            vite.parent.mkdir(parents=True)
            vite.touch()
            original_cache, original_coverage = directory / "old-cache", directory / "old-coverage"
            output = directory / "build"

            def assert_freeze_environment(args, destination, env):
                self.assertEqual(destination, output)
                self.assertTrue((output / "tmp").is_dir())
                for child_env in (env, os.environ):
                    self.assertEqual(child_env["NODE_COMPILE_CACHE"], str(output / "tmp/node-cache"))
                    self.assertFalse(child_env["NODE_V8_COVERAGE"])
                    self.assertEqual(child_env["TMP"], str(output / "tmp"))
                raise RuntimeError("freeze preflight reached")

            args = argparse.Namespace(output=output, inputs=directory, female=None, male=None,
                                      reference_dist=None, dependency_prototype=deps)
            inherited = {"NODE_COMPILE_CACHE": str(original_cache), "NODE_V8_COVERAGE": str(original_coverage)}
            with patch.dict(os.environ, inherited), patch.dict(build.__globals__, {"freeze": assert_freeze_environment}):
                with self.assertRaisesRegex(RuntimeError, "freeze preflight reached"):
                    build(args)
                self.assertEqual({name: os.environ[name] for name in inherited}, inherited)
            self.assertFalse(original_coverage.exists())
            self.assertFalse(original_cache.exists())

    def test_readonly_verifier_does_not_inherit_node_write_locations(self):
        verify = runpy.run_path(str(VERIFY))["signed_records"]
        with TemporaryDirectory(dir=self.output, prefix="auto-top-verify-env-") as temp:
            directory = Path(temp)
            self.assertTrue(directory.resolve().is_relative_to(self.output))
            records = directory / "records.json"
            data = json.dumps([{"identity": {"id": "one"}}, {"identity": {"id": "two"}}]).encode()
            records.write_bytes(data)
            receipt = {"recordFileSha256": hashlib.sha256(data).hexdigest()}
            inherited = {name: str(directory / name) for name in ("NODE_COMPILE_CACHE", "NODE_V8_COVERAGE")}
            with patch.dict(os.environ, inherited), patch.object(subprocess, "run") as invoked:
                self.assertEqual(list(verify(records, receipt)), ["one", "two"])
                env = invoked.call_args.kwargs["env"]
                self.assertEqual(env["NODE_DISABLE_COMPILE_CACHE"], "1")
                self.assertTrue(set(inherited).isdisjoint(env))
                self.assertEqual({name: os.environ[name] for name in inherited}, inherited)


if __name__ == "__main__":
    unittest.main()
