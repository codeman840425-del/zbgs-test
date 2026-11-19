import json
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np

from hair_region_source import ROOT, digest, main, make_plan


SOURCE = ROOT / "assets-source/hair-region-pilot-v1"


class HairRegionSourceTests(unittest.TestCase):
    def test_real_indexed_mask_rebuild_and_protection(self):
        files = make_plan((SOURCE / "recipe.json").read_bytes())
        manifest = json.loads(files["manifest.json"])
        report = json.loads(files["readback.json"])
        self.assertEqual(files["mask.rg8"], (SOURCE / "generated/mask.rg8").read_bytes())
        self.assertEqual(files["manifest.json"], (SOURCE / "generated/manifest.json").read_bytes())
        self.assertEqual((manifest["vertices"], manifest["triangles"], digest(files["mask.rg8"])),
                         (609, 1162, manifest["mask"]["sha256"]))
        self.assertFalse(manifest["runtimeAccepted"])
        mask = np.frombuffer(files["mask.rg8"], np.uint8).reshape(-1, 2)
        self.assertFalse(mask[:224 + 3 * 16].any())
        self.assertFalse(np.any(np.all(mask > 0, axis=1)))
        self.assertEqual(mask[-1].tolist(), [0, 255])
        self.assertEqual((report["protectedCapVertices"], report["protectedCapOrWeldFaces"]), (224, 410))
        self.assertEqual({role: len(rows) for role, rows in report["protectedSourceMaterialMaps"].items()},
                         {"eyebrow": 1, "eye": 6, "skin": 2, "mouth": 1})
        for channel, witness in enumerate(report["actualUvTriangleWitnesses"]):
            self.assertEqual(witness["sourceRgba"][3], 255)
            self.assertGreater(np.min(mask[witness["vertices"], channel]), 190)
            self.assertTrue(witness["overlappingProtectedOriginalHairTriangles"])
            self.assertNotEqual(witness["sourceTexelLinearRgb"], witness["illustrativeTintedTexelLinearRgb"])

    def test_mismatched_body_fit_or_mesh_pin_is_refused(self):
        for key in ("body", "styleFit", "asset"):
            with self.subTest(key=key):
                recipe = json.loads((SOURCE / "recipe.json").read_bytes())
                recipe[key]["sha256"] = "0" * 64
                with self.assertRaisesRegex(ValueError, key + " SHA-256 mismatch"):
                    make_plan(json.dumps(recipe).encode())

    def test_bands_cannot_extend_to_the_welded_root_or_overlap(self):
        for band, start in (("root", .04), ("tip", .40)):
            with self.subTest(band=band):
                recipe = json.loads((SOURCE / "recipe.json").read_bytes())
                recipe["bands"][band]["start"] = start
                with self.assertRaisesRegex(ValueError, "overlap or reach the protected root rings"):
                    make_plan(json.dumps(recipe).encode())

    def test_outside_output_is_rejected_before_recipe_is_read(self):
        outside = ROOT.parent
        with patch("sys.argv", ["hair_region_source.py", str(Path("missing-source.json")), "--output", str(outside)]):
            with self.assertRaisesRegex(ValueError, "inside"):
                main()


if __name__ == "__main__":
    unittest.main()
