"""Regression checks for native skin authoring and exact target matching."""

import copy
import io
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

import native_skin_tone_package as skin


def encoded(array):
    stream = io.BytesIO()
    Image.fromarray(array).save(stream, format="PNG")
    return stream.getvalue()


class SkinContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.target = skin.native.reader.GLB(skin.ROOT / "prototype/public/assets/native-contour-cheek-b-v1/body.vrm")
        cls.covered = skin.native.reader.GLB(
            skin.ROOT / "assets-source/native-parameter-batch-v2/contour-cheek-b/candidate.vrm")

    def test_real_coverage_and_indexed_uv(self):
        baseline = skin.skin_surface(self.target, skin.BODY)
        mask = skin.skin_surface(self.covered, skin.BODY)
        self.assertEqual(baseline[2], mask[2])
        self.assertEqual(skin.compare_coverage(baseline[1], mask[1]), 608383)
        self.assertEqual(skin.skin_surface(self.target, skin.FACE)[1:], skin.skin_surface(self.covered, skin.FACE)[1:])

    def test_other_material_and_expression_cannot_consume_skin(self):
        g = copy.copy(self.target)
        g.doc = copy.deepcopy(g.doc)
        material = g.doc["materials"][0]
        material["emissiveTexture"]["index"] = g.doc["materials"][3]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        with self.assertRaisesRegex(ValueError, "Unexpected skin texture consumer"):
            skin.skin_surface(g, skin.FACE)
        g.doc = copy.deepcopy(self.target.doc)
        expr = next(iter(g.doc["extensions"]["VRMC_vrm"]["expressions"]["preset"].values()))
        expr["materialColorBinds"] = [{"material": 3}]
        with self.assertRaisesRegex(ValueError, "Expression changes"):
            skin.skin_surface(g, skin.FACE)

    def test_rgba_difference_requires_visible_change_and_preserves_mask(self):
        original = np.array([[[10, 12, 14, 255], [20, 22, 24, 0]]], dtype=np.uint8)
        edit = original.copy()
        edit[0, 1, 0] += 1
        with self.assertRaisesRegex(ValueError, "no visible skin edit"):
            skin.compare_surfaces(encoded(original), encoded(edit), "face")
        edit[0, 0, 0] += 1
        report = skin.compare_surfaces(encoded(original), encoded(edit), "face")
        self.assertEqual((report["changedVisiblePixels"], report["changedPixels"]), (1, 2))
        edit[0, 1, 3] = 1
        with self.assertRaisesRegex(ValueError, "alpha changed"):
            skin.compare_surfaces(encoded(original), encoded(edit), "face")

    def test_changed_geometry_is_rejected(self):
        g = copy.copy(self.target)
        data = bytearray(g.bin)
        a = g.doc["accessors"][0]
        data[g.doc["bufferViews"][a["bufferView"]].get("byteOffset", 0) + a.get("byteOffset", 0)] ^= 1
        g.bin = bytes(data)
        with self.assertRaisesRegex(ValueError, "changed geometry"):
            skin.compare_exports(self.target, g)

    def test_donor_must_match_the_exact_covered_contour(self):
        historical_full = skin.native.reader.GLB(skin.ROOT /
            "assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vrm")
        historical_covered = skin.native.reader.GLB(skin.ROOT /
            "assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm")
        result = skin.donor_geometry(historical_full, historical_full, historical_covered)
        self.assertEqual(result["indexedPositionNormalAndMorphFieldsExactToCovered"], 938)
        with self.assertRaisesRegex(ValueError, "contour geometry/morph differs"):
            skin.donor_geometry(historical_full, historical_full, self.covered)

    def test_no_overwrite_on_immutable_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "package"
            skin.stage_new(dest, {"a/test": b"original"})
            skin.stage_new(dest, {"a/test": b"original"})
            with self.assertRaisesRegex(ValueError, "identity differs"):
                skin.stage_new(dest, {"a/test": b"replacement"})
            self.assertEqual((dest / "a/test").read_bytes(), b"original")

    def test_published_package_rebuilds_from_native_exports(self):
        recipe = json.loads(skin.SPEC.read_bytes())
        files, result = skin.build(recipe)
        skin.check_stage(skin.PUBLIC, files)
        self.assertEqual(len(result["targets"]), 2)
        self.assertEqual(result["coveredExport"]["changedImages"], [5, 10, 11, 21])
        self.assertEqual(result["fullExport"]["changedImages"], [5, 10, 11, 20])
        recipe["mainColor"] = "#ffffff"
        with self.assertRaisesRegex(ValueError, "differs from editor receipt"):
            skin.build(recipe)


if __name__ == "__main__":
    unittest.main()
