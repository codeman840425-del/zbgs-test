"""Offline source-to-package regression with the actual two native VRM exports."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import native_body_package as package


def snapshot(folder):
    return {p.relative_to(folder).as_posix():(package.sha(p.read_bytes()),p.stat().st_mtime_ns)
            for p in sorted(folder.rglob("*")) if p.is_file()}


class NativePackageTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(package.CONFIG.read_bytes())
        (package.ROOT/"output").mkdir(exist_ok=True)
        scratch = tempfile.TemporaryDirectory(dir=package.ROOT/"output")
        self.addCleanup(scratch.cleanup)
        self.output = Path(scratch.name)/"sources"

    def test_rebuilds_and_shared_import(self):
        first = package.build(self.config, self.output)
        self.assertTrue(first["passed"], first)
        before = snapshot(self.output)
        self.assertEqual(first, package.build(self.config,self.output))
        self.assertEqual(before,snapshot(self.output))
        batch = json.loads((self.output/"import-batch.json").read_bytes())
        report = package.importer.execute(batch,package.ROOT,self.output.parent/"runtime-inputs")
        self.assertTrue(report["passed"],report)
        self.assertEqual([r["bodySha256"] for r in report["items"]],[r["bodySha256"] for r in first["items"]])

    def test_wrong_source_identity_isolated_then_retried(self):
        wrong = copy.deepcopy(self.config)
        wrong["items"][0]["candidate"] = wrong["items"][1]["candidate"]
        result = package.build(wrong,self.output)
        self.assertEqual([r["state"] for r in result["items"]],["failed","ready"])
        a,b = [self.output/r["id"] for r in result["items"]]
        self.assertFalse(a.exists())
        self.assertFalse((self.output/"import-batch.json").exists())
        self.assertIn("Wrong delta",result["items"][0]["reason"])
        before = snapshot(b)
        self.assertTrue(package.build(self.config,self.output)["passed"])
        self.assertEqual(before,snapshot(b))
        (a/"body.vrm").write_bytes(b"existing-user-bytes")
        broken = snapshot(a)
        self.assertEqual([r["state"] for r in package.build(self.config,self.output)["items"]],["failed","ready"])
        self.assertEqual(broken,snapshot(a))

    def test_wrong_covered_png_is_rejected_even_with_correct_sha(self):
        wrong = copy.deepcopy(self.config)
        wrong["mask"] = wrong["template"]
        result = package.build(wrong,self.output)
        self.assertTrue(all(r["state"]=="failed" and "covered Body PNG differs" in r["reason"] for r in result["items"]))
        self.assertFalse(list(self.output.iterdir()))


if __name__ == "__main__":
    unittest.main()
