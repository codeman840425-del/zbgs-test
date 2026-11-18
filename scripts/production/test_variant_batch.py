import unittest

from variant_batch import SCHEMA, OUT_SCHEMA, plan


MEMBER = {"id": "female-uniform-item", "slot": "top", "sha256": "e" * 64}
MATCH = ("uniform-top-v1", "female-base-v1", "v1")


def matrix(status="runtime-admitted"):
    row = {
        "bodyType": "female-base-v1",
        "variantVersion": "v1",
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
            "stableId": stable, "styleId": "uniform-top-v1", "bodyType": "female-base-v1", "variantVersion": "v1",
            "identity": {"id": stable, "name": "Test Host", "gender": "male"},
            "outfit": {"role": "configured", "equipment": [dict(MEMBER)]},
        }]}

    def query(self):
        return {"female-base-v1": {
            "ok": True,
            "body": {"bodyType": "female-base-v1", "sha256": "a" * 64},
            "outfits": [{"role": "configured", "index": 7, "equipment": [dict(MEMBER)]}],
        }}

    def plan(self, data, request, **options):
        options.setdefault("queries", self.query())
        options.setdefault("members", {MATCH: MEMBER})
        return plan(data, request, **options)

    def test_admitted_row_emits_game_request(self):
        result = self.plan(matrix(), self.request("host-a"))
        self.assertEqual(result["schema"], OUT_SCHEMA)
        self.assertEqual(result["mode"], "runtime-admitted")
        self.assertEqual(result["acceptedCount"], 1)
        request = result["items"][0]["request"]
        self.assertEqual(request, {
            "schema": "character-production-request-v1", "operation": "create", "bodyType": "female-base-v1",
            "identity": {"id": "host-a", "name": "Test Host", "gender": "male"},
            "edits": [{"domain": "outfit", "index": 7}],
        })
        self.assertEqual(result["items"][0]["selection"]["styleId"], "uniform-top-v1")

    def test_candidate_is_rejected_without_fallback(self):
        result = self.plan(matrix("candidate"), self.request("host-b"))
        self.assertEqual(result["mode"], "readiness-gated")
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("runtime admission pending", result["items"][0]["reason"])

    def test_duplicate_stable_ids_are_isolated(self):
        request = self.request("host-c")
        request["items"].append(dict(request["items"][0]))
        result = self.plan(matrix(), request)
        self.assertEqual(result["acceptedCount"], 1)
        self.assertIn("Duplicate stableId", result["items"][1]["reason"])

    def test_version_selects_exact_matrix_row(self):
        request = self.request("host-d")
        request["items"][0]["variantVersion"] = "v2"
        result = self.plan(matrix(), request)
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("No exact variant", result["items"][0]["reason"])

    def test_diagnostic_mode_can_write_candidate_but_cannot_admit(self):
        result = self.plan(matrix("candidate"), self.request(), diagnostic=True)
        self.assertEqual((result["acceptedCount"], result["candidateCount"], result["rejectedCount"]), (0, 1, 0))
        self.assertEqual(result["mode"], "technical-candidate")
        self.assertIsNone(result["items"][0]["selection"]["admissionEvidence"])
        self.assertEqual(result["items"][0]["request"]["edits"], [{"domain": "outfit", "index": 7}])
        result = self.plan(matrix("rejected"), self.request(), diagnostic=True)
        self.assertEqual((result["acceptedCount"], result["candidateCount"], result["rejectedCount"]), (0, 0, 1))

    def test_admitted_status_without_identity_or_query_cannot_emit(self):
        request = self.request()
        del request["items"][0]["identity"]["gender"]
        self.assertIn("identity.id, name and gender", self.plan(matrix(),request)["items"][0]["reason"])
        result = self.plan(matrix(), self.request(), queries={})
        self.assertIn("No verified runtime query", result["items"][0]["reason"])

    def test_outfit_body_and_member_pin_must_be_exact(self):
        query = self.query()
        query["female-base-v1"]["body"]["sha256"] = "w" * 64
        self.assertIn("body differs", self.plan(matrix(),self.request(),queries=query)["items"][0]["reason"])
        wrong_member = {MATCH: {**MEMBER, "sha256": "f" * 64}}
        self.assertIn("exact matrix equipment", self.plan(matrix(),self.request(),members=wrong_member)["items"][0]["reason"])
        request = self.request()
        request["items"][0]["outfit"]["equipment"][0]["sha256"] = "f" * 64
        self.assertIn("No unique configured outfit", self.plan(matrix(),request)["items"][0]["reason"])

    def test_outfit_ambiguity_is_rejected(self):
        query = self.query()
        outfits = query["female-base-v1"]["outfits"]
        outfits.append({**outfits[0], "index": 9})
        self.assertIn("No unique configured outfit", self.plan(matrix(),self.request(),queries=query)["items"][0]["reason"])

    def test_admitted_top_does_not_grant_admission_to_candidate_socks(self):
        data = matrix()
        candidate = matrix("candidate")["styles"][0]["variants"][0]
        data["styles"].append({"styleId": "plain-crew-socks-v1", "variants": [candidate]})
        socks = {"id": "candidate-socks", "slot": "socks", "sha256": "a" * 64}
        request, query = self.request(), self.query()
        request["items"][0]["outfit"]["equipment"].append(socks)
        query["female-base-v1"]["outfits"][0]["equipment"].append(socks)
        result = self.plan(data, request, queries=query)
        self.assertEqual(result["acceptedCount"], 0)
        self.assertIn("Whole-outfit runtime admission evidence", result["items"][0]["reason"])
        self.assertNotIn("request", result["items"][0])
        diagnostic = self.plan(data, request, queries=query, diagnostic=True)
        self.assertEqual((diagnostic["acceptedCount"],diagnostic["candidateCount"]), (0,1))


if __name__ == "__main__":
    unittest.main()
