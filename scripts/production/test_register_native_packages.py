"""Isolated registrar contract tests using the two actual native packages and Node validators."""
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from unittest.mock import patch

import register_native_packages as registrar

REPO = registrar.ROOT
SOURCE = Path("assets-source/native-parameter-game-packages-v1")


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        self.catalog = self.root/"prototype/src/native-production-catalog.json"
        self.public = self.root/"prototype/public/assets"
        self.batch = self.root/SOURCE/"import-batch.json"
        shutil.copytree(REPO/SOURCE,self.root/SOURCE)
        self.items = json.loads(self.batch.read_bytes())["items"]
        for row in self.items:
            source = self.root/Path(row["spec"]).parent
            lineage = json.loads((source/"provenance.json").read_bytes())
            for ref in (lineage["native"],lineage["inputs"]["authoringBatch"],lineage["inputs"]["authoringResult"]):
                self.copy(ref["path"])
        for file in ("scripts/production/native_import_bindings.mjs","scripts/verify-catalog-bindings.mjs",
                     "prototype/package.json","prototype/src/native-production-catalog.js","prototype/src/foundation-profiles.js"):
            self.copy(file)
        self.catalog.write_text('{"schema":"native-production-catalog-v1","entries":[]}',encoding="utf8")
        self.coverage = self.catalog.with_name("native-body-texture-coverage-admissions.json")
        self.coverage.write_bytes(b"[]\n")
        self.original = self.catalog.read_bytes()
        self.public.mkdir(exist_ok=True,parents=True)
        for owner,key,new in [(registrar,"ROOT",self.root),(registrar,"CATALOG",self.catalog),(registrar.importer,"ROOT",self.root)]:
            override = patch.object(owner,key,new)
            override.start()
            self.addCleanup(override.stop)

    def copy(self, rel):
        src = REPO/rel
        target = self.root/rel
        if target.exists():
            return
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(src,target)
        if src.suffix == ".js":
            for child in re.findall(r"from\s*['\"](\.[^'\"]+)['\"]",src.read_text(encoding="utf8")):
                self.copy((src.parent/child).resolve().relative_to(REPO))

    def register(self, name="report.json"):
        return registrar.register(self.batch,"female",self.root/name)

    def assert_unpublished(self):
        self.assertEqual(self.catalog.read_bytes(),self.original)
        self.assertEqual(self.coverage.read_bytes(),b"[]\n")
        self.assertFalse((self.root/"report.json").exists())
        self.assertTrue(all(not (self.public/r["package"]).exists() for r in self.items))

    def test_success_and_repeat_exact_files(self):
        data = json.loads(self.batch.read_bytes())
        path = self.root/self.items[0]["spec"]
        alt = path.with_name("named-input.json")
        path.rename(alt)
        data["items"][0]["spec"] = alt.relative_to(self.root).as_posix()
        self.batch.write_text(json.dumps(data),encoding="utf8")
        report = self.register()
        self.assertEqual(report["bodyTypes"],[r["package"] for r in self.items])
        self.assertEqual(report["coverageAdmissions"], json.loads(self.coverage.read_bytes()))
        self.assertEqual(len(report["coverageAdmissions"]),2)
        coverage_mtime = self.coverage.stat().st_mtime_ns
        snapshot = {p:(p.stat().st_mtime_ns,p.stat().st_size) for r in self.items for p in (self.public/r["package"]).rglob("*") if p.is_file()}
        t = self.catalog.stat().st_mtime_ns
        self.register("second.json")
        self.assertEqual(t,self.catalog.stat().st_mtime_ns)
        self.assertEqual(coverage_mtime,self.coverage.stat().st_mtime_ns)
        self.assertEqual(snapshot,{p:(p.stat().st_mtime_ns,p.stat().st_size) for p in snapshot})

    def test_wrong_export_recipe_equipment_and_floor(self):
        folder = self.root/Path(self.items[0]["spec"]).parent
        other = self.root/Path(self.items[1]["spec"]).parent
        path = folder/"profile-candidate.json"
        original = path.read_bytes()
        recipe = (folder/"recipe.json").read_bytes()
        second = json.loads((other/"profile-candidate.json").read_bytes())
        for field in ("sourceExportSha256","recipeSha256","ids","sourceFloorY"):
            with self.subTest(field=field):
                value = json.loads(original)
                if field == "ids":
                    value["profile"]["ids"] = second["profile"]["ids"]
                elif field == "sourceFloorY":
                    value["profile"][field] += .05
                else:
                    value[field] = second[field]
                if field == "recipeSha256":
                    shutil.copyfile(other/"recipe.json",folder/"recipe.json")
                path.write_text(json.dumps(value),encoding="utf8")
                with self.assertRaises(ValueError):
                    self.register()
                self.assert_unpublished()
                (folder/"recipe.json").write_bytes(recipe)
        path.write_bytes(original)
        lineage = json.loads((folder/"provenance.json").read_bytes())
        (self.root/lineage["native"]["path"]).write_bytes(b"changed actual native export")
        with self.assertRaisesRegex(ValueError,"Source provenance SHA"):
            self.register()
        self.assert_unpublished()

    def test_late_conflict_and_missing_receipt_parent(self):
        with self.assertRaises(FileNotFoundError):
            self.register("missing/report.json")
        self.assert_unpublished()
        last = self.public/self.items[-1]["package"]
        last.mkdir()
        (last/"user-content").write_bytes(b"keep")
        with self.assertRaises(ValueError):
            self.register()
        self.assertEqual(self.catalog.read_bytes(),self.original)
        self.assertFalse((self.public/self.items[0]["package"]).exists())
        self.assertEqual((last/"user-content").read_bytes(),b"keep")

    def test_commit_io_failure_rolls_back_own_packages_and_receipt(self):
        replace = os.replace
        def fail_catalog(src,dst):
            if Path(dst) == self.catalog:
                raise OSError("injected catalog write failure")
            return replace(src,dst)
        with patch.object(registrar.os,"replace",fail_catalog), self.assertRaisesRegex(OSError,"injected"):
            self.register()
        self.assert_unpublished()

    def test_wrong_pixel_lineage_preserves_both_catalogs(self):
        folder = self.root/Path(self.items[-1]["spec"]).parent
        path = folder/"provenance.json"
        value = json.loads(path.read_bytes())
        value["changedCoverageAlphaPixels"] -= 1
        path.write_text(json.dumps(value),encoding="utf8")
        with self.assertRaisesRegex(ValueError,"alpha readback"):
            self.register()
        self.assert_unpublished()


if __name__ == "__main__":
    unittest.main()
