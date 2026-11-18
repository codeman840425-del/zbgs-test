import copy
import json
import unittest

import native_facecontour_lip_package as lip


class NativeFaceContourLipTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = json.loads(lip.INPUTS.read_bytes())
        cls.files, cls.report = lip.build(cls.inputs)
        target = cls.report["targets"][0]
        cls.body = lip.model(target["body"])
        cls.skin = json.loads(lip.pinned(target["skinManifest"]))

    def test_four_looks_share_only_two_real_images(self):
        lip.check_stage(lip.PUBLIC, self.files)
        entries = json.loads(self.files["registry.json"])["entries"]
        self.assertEqual(len(entries), 2)
        images = {name for name in self.files if name.endswith(".png")}
        self.assertEqual(len(images), 2)
        for row in entries:
            data = self.files[row["bodyType"] + "/manifest.json"]
            self.assertEqual(lip.sha(data), row["manifestSha256"])
            manifest = json.loads(data)
            self.assertEqual(manifest["skinManifestSha256"], row["skinManifestSha256"])
            self.assertEqual(set(manifest["tones"]), {"original", lip.WARM})
            for tone in manifest["tones"].values():
                raw = tone["authored"]
                name = "images/" + raw["sha256"] + ".png"
                self.assertIn(name, images)
                self.assertEqual(raw["url"], "/assets/" + lip.PACKAGE + "/" + name)
                self.assertEqual(lip.sha(self.files[name]), raw["sha256"])

    def test_explicit_body_selection_prepares_only_requested_fit(self):
        request = json.loads((lip.SOURCE_DIR / "target-batch.json").read_bytes())
        both, _ = lip.build(request)
        self.assertEqual(both, self.files)
        request["targets"] = request["targets"][:1]
        subset, _ = lip.build(request)
        rows = json.loads(subset["registry.json"])["entries"]
        self.assertEqual([r["bodyType"] for r in rows], [request["targets"][0]["bodyType"]])
        self.assertEqual({p for p in subset if p.endswith(".png")}, {p for p in both if p.endswith(".png")})
        request["targets"][0]["bodyType"] = "native-male-7586-v1"
        request["targets"][0]["bodySha256"] = "7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81"
        with self.assertRaisesRegex(ValueError, "registered skin fit"):
            lip.build(request)

    def test_cross_tone_fallback_rejected(self):
        tones = dict(self.report["tones"])
        tones["original"], tones[lip.WARM] = tones[lip.WARM], tones["original"]
        with self.assertRaisesRegex(ValueError, "face source mismatch"):
            lip.exact_target(self.body, self.skin, tones, self.report["fit"])

    def test_wrong_oral_mapping_or_other_material_owner_rejected(self):
        m = copy.copy(self.body)
        m.doc = copy.deepcopy(m.doc)
        i, = [i for i, mat in enumerate(m.doc["materials"]) if mat["name"] == lip.MOUTH]
        primitive = m.primitives()[lip.MOUTH]
        old = primitive["indices"]
        primitive["indices"] = m.primitives()[lip.skin.FACE]["indices"]
        with self.assertRaisesRegex(ValueError, "protected oral fit differs"):
            lip.exact_target(m, self.skin, self.report["tones"], self.report["fit"])
        primitive["indices"] = old
        m.doc["materials"][i]["emissiveTexture"]["index"] = m.doc["materials"][3]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        with self.assertRaisesRegex(ValueError, "Unexpected skin texture consumer"):
            lip.exact_target(m, self.skin, self.report["tones"], self.report["fit"])

    def test_unrelated_or_wrongly_pinned_warm_file_rejected(self):
        descriptor = copy.deepcopy(self.skin)
        descriptor["face"]["authored"]["url"] = self.skin["body"]["authored"]["url"]
        with self.assertRaisesRegex(ValueError, "Input identity mismatch"):
            lip.exact_target(self.body, descriptor, self.report["tones"], self.report["fit"])
        inputs = copy.deepcopy(self.inputs)
        inputs["authorPair"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Input identity mismatch"):
            lip.build(inputs)

    def test_no_tampered_coverage_or_skin_registration(self):
        inputs = copy.deepcopy(self.inputs)
        inputs["skinRegistry"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "Input identity mismatch"):
            lip.build(inputs)


if __name__ == "__main__":
    unittest.main()
