import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import native_surface_readback as readback


class NativeSurfaceReadbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contracts = {}
        for package, body in readback.STATIC["PACKAGES"].items():
            source = f"evidence/m2-native-hair-record-v1/{package}.json"
            record = readback.read(readback.ROOT / source)
            case = {"sourceRecord": source, "recordSha256": record["integrity"]["recordSha256"],
                    "bodySha256": record["appearanceRecipe"]["base"]["sha256"],
                    "restoredSha256": record["integrity"]["recordSha256"]}
            # The readback uses the same fixed dist layout at capture time.
            dist = readback.ROOT / "prototype/public"
            cls.contracts[body] = readback.source_contract(package, body, dist, case)

    def sample(self, mode="dressed"):
        body_type, source = next(iter(self.contracts.items()))
        record, materials, ids, pin, manifest, alpha = source
        digest = manifest["avatarSha256"]
        active = ids if mode == "dressed" else {"shoes": ids["shoes"]}
        coverage = {"descriptor": {"sha256": pin},
                    "texture": {"avatarSha256": digest, "maskedPngSha256": manifest["covered"]["sha256"],
                                "covered": mode == "dressed", "activeIds": list(active.values()),
                                "disposed": False, "pendingUpdates": 0, "cleanupErrors": []},
                    "visibleEquipment": [{"role": k, "id": v} for k, v in active.items()],
                    "alphaPixels": {**alpha[mode], "textureUuid": "body-map"}}
        state = {"schema": "native-surface-runtime-materials-v1", "bodyType": body_type, "bodySha256": digest,
                 "build": "test", "bodyMode": mode, "actorUuid": "a", "materials": [], "textures": [], "coverage": coverage,
                 "renderer": {"contextLost": False, "calls": 1, "triangles": 100}}
        for role, src in materials.items():
            if role in readback.GEAR and role not in active:
                continue
            maps = {}
            for channel in readback.CHANNELS:
                name = role + "-" + channel
                maps[channel] = name
                w, h = src[channel]
                state["textures"].append({"uuid": name, "width": w, "height": h, "colorSpace": "srgb"})
            state["materials"].append({"role": role, "uuid": role, "outline": False, "name": src["name"],
                                       "type": "MToonMaterial", "visible": True, "draws": [{"drawCount": 3}], "maps": maps,
                                       "transparent": src["alphaMode"] == "BLEND", "side": 2 if src["doubleSided"] else 0,
                                       "opacity": src["opacity"], "depthTest": True, "colorWrite": True,
                                       "depthWrite": src["alphaMode"] != "BLEND" or src["blendDepthWrite"],
                                       "alphaTest": src["cutoff"] if src["alphaMode"] == "MASK" else 0})
        state["textureEstimate"] = {"textureObjectCount": len(state["textures"]), "uniqueAssignedWebGLTextureCount": 1,
                                    "decodedImageRgba8Bytes": 100, "allocationRgba8WithMipmapsBytes": 100}
        return state, (mode, body_type, digest, "test", materials, ids, pin, manifest, alpha[mode])

    def test_real_sources_have_distinct_records_and_exact_mask(self):
        self.assertEqual({c[0]["revision"] for c in self.contracts.values()}, {1, 2})
        for _, _, _, _, _, samples in self.contracts.values():
            self.assertEqual(samples["base"]["belowCutoff"], 0)
            self.assertEqual(samples["dressed"]["belowCutoff"], 585716)

    def test_both_coverage_modes_match(self):
        for mode in ["dressed", "base"]:
            state, args = self.sample(mode)
            self.assertTrue(readback.check_state(state, *args)["alphaVerified"])

    def test_base_retaining_garment_and_covered_alpha_rejected(self):
        state, args = self.sample("base")
        original_ids = state["coverage"]["texture"]["activeIds"]
        state["coverage"]["texture"]["activeIds"] = ["stray-top"]
        with self.assertRaisesRegex(ValueError, "active equipment"):
            readback.check_state(state, *args)
        state["coverage"]["texture"]["activeIds"] = original_ids
        state["coverage"]["alphaPixels"]["alphaSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "alpha channel"):
            readback.check_state(state, *args)

    def test_wrong_shade_resolution_rejected(self):
        state, args = self.sample()
        shade = next(t for t in state["textures"] if t["uuid"] == "mouth-shadeMultiplyTexture")
        shade["height"] //= 2
        with self.assertRaisesRegex(ValueError, "mouth shadeMultiplyTexture"):
            readback.check_state(state, *args)

    def test_shader_discrepancy_and_unavailable_alpha_retained(self):
        state, args = self.sample()
        mouth = next(m for m in state["materials"] if m["role"] == "mouth")
        mouth["side"] = 2
        state["coverage"]["alphaPixels"] = {"error": "Canvas unavailable"}
        result = readback.check_state(state, *args)
        self.assertFalse(result["alphaVerified"])
        self.assertEqual(result["alphaReadbackError"], "Canvas unavailable")
        self.assertEqual(result["shaderDifferences"], [{"role": "mouth", "field": "side", "source": 0, "observed": 2}])

    def test_previous_record_hash_rejected(self):
        pkg, body = next(iter(readback.STATIC["PACKAGES"].items()))
        record = self.contracts[body][0]
        case = {"sourceRecord": f"evidence/m2-native-hair-record-v1/{pkg}.json",
                "bodySha256": record["appearanceRecipe"]["base"]["sha256"],
                "recordSha256": record["integrity"]["recordSha256"], "restoredSha256": "0" * 64}
        with self.assertRaisesRegex(ValueError, "restore identity"):
            readback.source_contract(pkg, body, readback.ROOT / "prototype/public", case)


if __name__ == "__main__":
    unittest.main()
