import unittest

from variant_batch import SCHEMA, OUT_SCHEMA, plan


def matrix(status="runtime-admitted"):
    row = {
        "bodyType": "female-base-v1",
        "bodySha256": "a" * 64,
        "resourceManifest": "/assets/body/resource.json",
        "resourceManifestSha256": "b" * 64,
        "fitManifest": "/assets/body/fit.json",
        "coverageManifest": "/assets/body/coverage.json",
        "coverageManifestSha256": "c" * 64,
        "status": status,
    }
    if status == "runtime-admitted":
        row["admissionEvidence"] = "/evidence/admission.json"
        row["recipeSha256"] = "d" * 64
    return {"schema": "zbgs-style-variant-matrix-v1", "styles": [{
        "styleId": "uniform-top-v1", "label": "制服", "variants": [row]
    }]}


class VariantBatchTests(unittest.TestCase):
    def request(self, stable="host-a"):
        return {"schema": SCHEMA, "batchId": "batch-v1", "items": [{
            "stableId": stable, "styleId": "uniform-top-v1", "bodyType": "female-base-v1"
        }]}

    def test_admitted_row_emits_game_request(self):
        result = plan(matrix(), self.request("host-a"))
        self.assertEqual(result["schema"], OUT_SCHEMA)
        self.assertEqual(result["mode"], "runtime-admitted")
        self.assertEqual(result["acceptedCount"], 1)
        request = result["items"][0]["request"]
        self.assertEqual(request["schema"], "character-production-request-v1")
        self.assertEqual(request["appearance"]["styleId"], "uniform-top-v1")

    def test_candidate_is_rejected_without_fallback(self):
        result = plan(matrix("candidate"), self.request("host-b"))
        self.assertEqual(result["mode"], "readiness-gated")
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("runtime admission pending", result["items"][0]["reason"])

    def test_duplicate_stable_ids_are_isolated(self):
        request = self.request("host-c")
        request["items"].append(dict(request["items"][0]))
        result = plan(matrix(), request)
        self.assertEqual(result["acceptedCount"], 1)
        self.assertIn("Duplicate stableId", result["items"][1]["reason"])


if __name__ == "__main__":
    unittest.main()
