"""Use the actual CC0 ponytail streams and the existing body fit to verify the colorway."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import hair_region_release as release
from production_paths import project_output


class HairRegionReleaseTests(unittest.TestCase):
    def setUp(self):
        base = project_output(release.ROOT / "output/m2-hair-region-release-v1", __file__)
        base.mkdir(parents=True, exist_ok=True)
        tmp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(tmp.cleanup)
        self.work = Path(tmp.name)
        self.recipe = json.loads(release.RECIPE.read_bytes())

    def test_original_geometry_fit_and_chains(self):
        result = release.make_plan(self.recipe)
        source_dir = release.ROOT / "prototype/public/assets/m2-long-hair-rootjoin-v2"
        published = release.ROOT / "prototype/public/assets" / self.recipe["assetDirectory"]
        self.assertEqual(result, {p.name: p.read_bytes() for p in published.iterdir()})
        for name, identity in [("manifest.json", ("id", "label", "version", "fit")),
                               ("fit.json", ("id", "version", "styleId"))]:
            source = json.loads((source_dir / name).read_bytes())
            new = json.loads(result[name])
            binding = new.pop("regionColorway")
            for field in identity:
                new.pop(field)
                source.pop(field)
            self.assertEqual(new, source)
            for field, file in (("palette", "palette.json"), ("regions", "regions.json")):
                self.assertEqual(binding[field]["sha256"], release.regions.digest(result[file]))
                self.assertEqual(binding[field]["bytes"], len(result[file]))
        self.assertEqual(json.loads(result["manifest.json"])["regionColorway"],
                         json.loads(result["fit.json"])["regionColorway"])
        self.assertEqual(len(result["mask.rg8"]), json.loads(result["regions.json"])["vertices"] * 2)
        self.assertFalse(any(name.endswith(".glb") for name in result))

    def test_repeat_and_edit_new_palette_without_overwriting_original(self):
        first = self.work / "first"
        second = self.work / "repeat"
        self.assertEqual(release.publish(release.RECIPE, first), "published")
        self.assertEqual(release.publish(release.RECIPE, first), "reused-identical")
        self.assertEqual(release.publish(release.RECIPE, second), "published")

        def contents(folder):
            return {p.name: p.read_bytes() for p in folder.iterdir()}

        original = contents(first)
        self.assertEqual(original, contents(second))
        change = self.work / "change.json"
        edited = copy.deepcopy(self.recipe)
        edited["tipLinearRgb"] = [0.57, 1.48, 1.72]
        change.write_bytes(release.regions.encode(edited))
        with self.assertRaisesRegex(ValueError, "Existing package differs"):
            release.publish(change, first)
        self.assertEqual(original, contents(first))
        attempt = self.work / "edited"
        release.publish(change, attempt)
        changed = contents(attempt)
        self.assertEqual({name for name in changed if changed[name] != original[name]},
                         {"palette.json", "fit.json", "manifest.json", "catalog.json"})
        self.assertEqual(json.loads(changed["palette.json"])["tipLinearRgb"], edited["tipLinearRgb"])

    def test_wrong_source_and_invalid_color_leave_no_output(self):
        for field, value, reason in [("sourceRegions", {**self.recipe["sourceRegions"], "sha256": "0" * 64},
                                     "region recipe SHA-256 mismatch"),
                                     ("rootLinearRgb", [True, -0.1, 0.3], "finite nonnegative")]:
            path = self.work / "damaged.json"
            path.write_bytes(release.regions.encode({**self.recipe, field: value}))
            dest = self.work / "bad"
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, reason):
                release.publish(path, dest)
            self.assertFalse(dest.exists())

    def test_other_source_checkout_keeps_output_in_main_project(self):
        checkout = self.work / "read-only-input"
        region = json.loads((release.ROOT / self.recipe["sourceRegions"]["path"]).read_bytes())
        rights = json.loads((release.ROOT / self.recipe["sourceProvenance"]["path"]).read_bytes())
        for ref in [self.recipe["sourceRegions"], self.recipe["sourceProvenance"], *rights["sourceRecords"],
                    *(region[key] for key in release.regions.PINS)]:
            destination = checkout / ref["path"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(release.ROOT / ref["path"], destination)
        out = self.work / "separate-output"
        self.assertEqual(release.publish(release.RECIPE, out, checkout), "published")
        self.assertEqual((out / "manifest.json").read_bytes(),
                         (release.ROOT / "prototype/public/assets/m2-hair-region-v1/manifest.json").read_bytes())

    def test_disk_root_and_path_reversal_rejected_before_reading_recipe(self):
        missing = self.work / "missing-recipe.json"
        for outside in (Path(release.ROOT.anchor), release.ROOT / ".." / "hair-release-test-never-written"):
            with self.subTest(outside=outside), self.assertRaisesRegex(ValueError, "inside the production tool"):
                release.publish(missing, outside)

    @unittest.skipUnless(os.name == "nt", "Windows directory junction")
    def test_existing_junction_with_missing_child_rejected_before_first_write(self):
        junction = self.work / "junction"
        subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(junction), release.ROOT.anchor],
                       capture_output=True, check=True)
        try:
            with self.assertRaisesRegex(ValueError, "inside the production tool"):
                release.publish(self.work / "missing-recipe.json", junction / "hair-release-test-never-written" / "build")
        finally:
            junction.rmdir()


if __name__ == "__main__":
    unittest.main()
