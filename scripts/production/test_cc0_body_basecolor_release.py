"""Check the narrow Body texture change against the actual pinned VRM0."""

from copy import deepcopy
import io
import json
import unittest

from PIL import Image

import cc0_body_basecolor_release as release
from native_import import digest, embedded_glb
from native_mesh_budget import encode
from native_release_textures import splice


class CC0BodyBaseColorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = json.loads(release.SPEC.read_bytes())
        _, cls.raw = release.pinned(cls.spec["source"])
        cls.doc, cls.binary = embedded_glb(cls.raw)
        cls.selection = cls.spec["selection"]

    def test_pinned_rebuild_reduces_only_body_color_and_preserves_alpha(self):
        candidate, details = release.derive(self.raw, self.selection)
        self.assertEqual(digest(candidate), self.spec["target"]["sha256"])
        self.assertEqual(details["derivedPng"]["sha256"], self.spec["target"]["pngSha256"])
        self.assertEqual(details["preserved"]["unmodifiedBufferViews"], len(self.doc["bufferViews"]) - 1)
        self.assertEqual(details["preserved"]["accessors"], len(self.doc["accessors"]))
        self.assertEqual(details["originalPng"]["decodedAlpha"], [255, 255])
        self.assertEqual(details["derivedPng"]["decodedAlpha"], [255, 255])
        self.assertEqual(details["selection"]["bodyPrimitives"], self.selection["bodyPrimitives"])
        self.assertLess(len(candidate), len(self.raw))

    def test_rejects_another_material_consuming_the_same_texture(self):
        doc = deepcopy(self.doc)
        doc["extensions"]["VRM"]["materialProperties"][0]["textureProperties"]["_MainTex"] = self.selection["texture"]
        with self.assertRaisesRegex(ValueError, "Unexpected Body color texture consumer"):
            release.texture_selection(doc, self.selection)

    def test_rejects_another_texture_alias_to_the_same_image(self):
        doc = deepcopy(self.doc)
        doc["textures"][0]["source"] = self.selection["image"]
        with self.assertRaisesRegex(ValueError, "Unexpected Body color image alias"):
            release.texture_selection(doc, self.selection)

    def test_rejects_a_changed_material_alpha_cutoff(self):
        doc = deepcopy(self.doc)
        doc["materials"][self.selection["material"]]["alphaCutoff"] = .25
        with self.assertRaisesRegex(ValueError, "Body alpha test contract differs"):
            release.texture_selection(doc, self.selection)

    def test_rejects_nonopaque_images_even_with_their_own_pin(self):
        image = Image.new("RGBA", (2048, 2048), color=(128, 64, 32, 255))
        image.putpixel((256, 256), (128, 64, 32, 254))
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        png = stream.getvalue()
        source = encode(*splice(self.doc, self.binary, {self.selection["bufferView"]: png}))
        pin = {**self.selection, "sourcePngSha256": digest(png)}
        with self.assertRaisesRegex(ValueError, "not entirely opaque"):
            release.derive(source, pin)

    def test_exclusive_image_policy_keeps_the_aligned_sample_bytes(self):
        candidate, _ = release.derive(self.raw, self.selection, image_alignment=release.EXCLUSIVE_IMAGE)
        self.assertEqual(digest(candidate), self.spec["target"]["sha256"])


class ExclusiveImageModeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec_path = release.ROOT / "evidence/m2-cc0-body-release-fit-v1/production-replay-input.json"
        cls.recipe = json.loads(spec_path.read_bytes())
        _, cls.raw = release.pinned(cls.recipe["source"])
        cls.doc, cls.binary = embedded_glb(cls.raw)
        cls.selection = cls.recipe["selection"]

    def derive(self, doc):
        return release.derive(encode(doc, self.binary), self.selection, image_alignment=release.EXCLUSIVE_IMAGE)

    def test_original_vrm_needs_explicit_unaligned_mode(self):
        with self.assertRaisesRegex(ValueError, "Invalid or overlapping replacement bufferView 15"):
            release.derive(self.raw, self.selection)
        after, readback = release.derive(self.raw, self.selection, image_alignment=release.EXCLUSIVE_IMAGE)
        self.assertEqual(digest(after), self.recipe["target"]["sha256"])
        self.assertEqual(readback["derivedPng"]["sha256"], self.recipe["target"]["pngSha256"])
        self.assertEqual(readback["derivedPng"]["decodedAlpha"], [255, 255])
        preserved = readback["preserved"]
        self.assertEqual(preserved["otherImagePayloads"], 24)
        self.assertEqual(preserved["unmodifiedBufferViews"], 163)
        self.assertEqual(preserved["alignment"]["sourceImageOffsetMod4"], 3)
        self.assertEqual(preserved["alignment"]["accessorAbsoluteOffsetsChecked"], 139)
        self.assertEqual(preserved["alignment"]["shiftedAccessorsChecked"], 139)

    def test_rejects_view_shared_by_an_accessor(self):
        doc = deepcopy(self.doc)
        doc["accessors"][0]["bufferView"] = self.selection["bufferView"]
        with self.assertRaisesRegex(ValueError, "exclusive embedded PNG bufferView"):
            self.derive(doc)

    def test_rejects_overlapping_views(self):
        doc = deepcopy(self.doc)
        view = doc["bufferViews"][self.selection["bufferView"]]
        doc["bufferViews"][0]["byteOffset"] = view["byteOffset"] + 4
        with self.assertRaisesRegex(ValueError, "overlaps another view"):
            self.derive(doc)

    def test_rejects_view_beyond_embedded_buffer(self):
        doc = deepcopy(self.doc)
        doc["bufferViews"][self.selection["bufferView"]]["byteLength"] = len(self.binary)
        with self.assertRaisesRegex(ValueError, "outside embedded buffer"):
            self.derive(doc)

    def test_rejects_unknown_extension_with_binary_reference(self):
        doc = deepcopy(self.doc)
        doc["extensions"]["EXAMPLE_view"] = {"bufferView": self.selection["bufferView"]}
        with self.assertRaisesRegex(ValueError, "Expected source VRM0 extensions"):
            self.derive(doc)


if __name__ == "__main__":
    unittest.main()
