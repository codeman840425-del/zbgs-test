"""Exercise actual head/UV dependencies on the pinned target, then retry the intact assets."""
import json
import unittest

from flow import ROOT
from uniform_head_compat import (ASSET_URL, FIT, LOOK, PARENT_SHA, TARGET_SHA, BodyReadback,
                                 GLB, Validator, audit, head_fit, palette)


class UniformHeadComparison(unittest.TestCase):
    def setUp(self):
        self.reader = Validator()
        self.body = BodyReadback(self.reader.pin(self.reader.url(ASSET_URL + "/body.vrm"), TARGET_SHA))
        self.fit = json.loads(self.reader.pin(*FIT))
        self.bob = GLB(self.reader.pin(self.reader.url("/assets/m2-hairstyle-v1/female-bob.glb"), self.fit["sha256"]))
        manifest = self.reader.json("prototype/public/assets/appearance-color-v3/runtime-manifest.json")
        self.parts, = [r["parts"] for r in manifest["variants"] if r["avatarSha256"] == PARENT_SHA]

    def test_wrong_head_rejected_before_retry(self):
        bones = {b["bone"]: b for b in self.body.vrm["humanoid"]["humanBones"]}
        original = bones["head"]["node"]
        bones["head"]["node"] = bones["neck"]["node"]
        with self.assertRaisesRegex(ValueError, "Raw head anchor mismatch"):
            head_fit(self.body, self.bob, self.fit)
        bones["head"]["node"] = original
        self.assertEqual(head_fit(self.body, self.bob, self.fit)["originalHair"]["headWeightedVertices"], 225)

    def test_changed_uv_stream_rejected_before_retry(self):
        iris_name = self.parts["iris"]["materialName"]
        primitive, = [p for mesh in self.body.doc["meshes"] for p in mesh["primitives"]
                      if self.body.doc["materials"][p["material"]]["name"] == iris_name]
        accessor = self.body.doc["accessors"][primitive["attributes"]["TEXCOORD_0"]]
        view = self.body.doc["bufferViews"][accessor["bufferView"]]
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        original = self.body.glb.binary
        changed = bytearray(original)
        changed[offset] ^= 1
        self.body.glb.binary = bytes(changed)
        with self.assertRaisesRegex(ValueError, "Palette UV/image mapping mismatch: iris"):
            palette(self.body, LOOK, self.parts, self.reader)
        self.body.glb.binary = original
        self.body.stream.cache_clear()
        result = palette(self.body, LOOK, self.parts, self.reader)
        self.assertEqual(result["iris"]["uvSha256"], self.parts["iris"]["uvSha256"])

    def test_reproduce_published_evidence(self):
        expected = json.loads((ROOT / "evidence/m2-uniform-lite-head-intake-v1/report.json").read_bytes())
        self.assertEqual(json.loads(json.dumps(audit())), expected)


if __name__ == "__main__":
    unittest.main(verbosity=2)
