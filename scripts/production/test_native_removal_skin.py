"""Real no-top exports and failure boundaries for the in-memory Body PNG donor."""

import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

from native_removal_skin import BODY, Export, build_donor, coverage, geometry, sha


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm"
REMOVED = ROOT / "assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vrm"
SOURCE_SHA = "78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3"
REMOVED_SHA = "188d6e2b423d5baeae11e5dffbed88b8508edaed08eda6d8177cf07ee330bcec"
ROUND = ROOT.parent / "gamemake-test/native-studio-round"
YUN = ROUND / "characters/studio-01-yun-lan/studio-01-yun-lan.vrm"
YUN_REMOVED = ROUND / "references/studio-01-yun-lan/tops-removed.vrm"


def png(pixels):
    stream = io.BytesIO()
    Image.fromarray(pixels).save(stream, format="PNG")
    return stream.getvalue()


class RemovalSkinTests(unittest.TestCase):
    def test_historical_donor_rebuilt_byte_for_byte(self):
        data, report = build_donor(SOURCE, REMOVED, source_sha256=SOURCE_SHA, removed_sha256=REMOVED_SHA)
        previous = ROOT / "assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm"
        self.assertEqual(data, previous.read_bytes())
        self.assertEqual(report["coverage"]["alphaIncreasedPixels"], 608383)
        self.assertEqual(report["coverage"]["residualNonOpaquePixels"], 0)
        self.assertFalse(report["nativeGroupAttributionVerified"])

    @unittest.skipUnless(YUN.is_file() and YUN_REMOVED.is_file(), "Private studio source pair unavailable")
    def test_yun_lan_reordered_skin_preserves_original_layout(self):
        data, report = build_donor(YUN, YUN_REMOVED,
                                   source_sha256="7aa4242c8575d68b84fd23b32a7b525519ef4c7ec5d569807016dd9b21824154",
                                   removed_sha256="9571d94682c633a5a04145678b04657da6aac61407ea57b362cae59382baf3ce")
        self.assertEqual(sha(data), "bedc5970d9a248aa5870f3bfa6f3413736637db571846622ec4cf154c80a31a1")
        self.assertEqual(report["source"]["skinJoints"], 97)
        self.assertEqual(report["removed"]["skinJoints"], 89)
        self.assertEqual(report["surface"]["weightedJoints"], 56)
        self.assertEqual(report["coverage"]["restoredAtMaskCutoffPixels"], 996279)
        self.assertEqual(report["coverage"]["residualNonOpaquePixels"], 0)
        json.dumps(report, allow_nan=False)

    def test_wrong_identity(self):
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            build_donor(SOURCE, REMOVED, source_sha256=SOURCE_SHA, removed_sha256=SOURCE_SHA)

    def test_pixels_require_same_rgb_size_and_full_actual_recovery(self):
        covered = np.zeros((2, 2, 4), dtype="uint8")
        restored = covered.copy()
        restored[..., 3] = 255
        original = png(covered)
        self.assertEqual(coverage(original, png(restored))["restoredAtMaskCutoffPixels"], 4)
        with self.assertRaisesRegex(ValueError, "dimensions"):
            coverage(original, png(restored[:1]))
        with self.assertRaisesRegex(ValueError, "no visible mask recovery"):
            coverage(png(restored), png(restored))
        restored[0, 0, 3] = 254
        restored[1, 0, 3] = 127
        with self.assertRaisesRegex(ValueError, "2 nonopaque texels .1 below cutoff"):
            coverage(original, png(restored))
        restored[0, 0, 0] = 2
        with self.assertRaisesRegex(ValueError, "RGB differs"):
            coverage(original, png(restored))

    def test_removal_with_alias_or_remapped_weighted_joint_rejected(self):
        old = SOURCE.read_bytes()
        raw = REMOVED.read_bytes()
        for change, error in (("alias", "consumer"), ("bone", "weightedInverseBinds|fields|frames")):
            with self.subTest(change=change):
                e = Export(raw)
                doc = e.doc
                mat = doc["materials"][e.names["materials"].index(BODY)]
                texture = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
                ii = doc["textures"][texture]["source"]
                view = e.view(doc["images"][ii]["bufferView"])
                offset = view.get("byteOffset", 0)
                same_png = e.glb.bin[offset:offset + view["byteLength"]]
                if change == "alias":
                    doc["materials"][0]["emissiveTexture"] = {"index": texture}
                else:
                    head, = [node for node in doc["nodes"] if node["name"] == "J_Bip_C_Head"]
                    head["name"] += "_different"
                modified = geometry.encode(doc, e.glb.bin, ii, same_png)
                with patch.object(Path, "read_bytes", side_effect=[old, modified]):
                    with self.assertRaisesRegex(ValueError, error):
                        build_donor(SOURCE, REMOVED, source_sha256=SOURCE_SHA, removed_sha256=sha(modified))


if __name__ == "__main__":
    unittest.main()
