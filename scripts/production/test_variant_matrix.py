import unittest

from variant_matrix import runtime_variants, validate_matrix


def variant(body="female-v1", status="runtime-admitted"):
    row = {
        "bodyType": body,
        "resourceManifest": f"assets/{body}/dress.json",
        "fitManifest": f"fits/{body}/dress.json",
        "coverageManifest": f"coverage/{body}/dress.json",
        "bodySha256": "a" * 64,
        "resourceManifestSha256": "b" * 64,
        "coverageManifestSha256": "c" * 64,
        "status": status,
    }
    if status == "runtime-admitted":
        row["admissionEvidence"] = f"evidence/{body}/dress.json"
    return row


class VariantMatrixTests(unittest.TestCase):
    def test_exact_body_resolution_never_falls_back(self):
        data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant()]}]}
        self.assertEqual(len(runtime_variants(data, "female-v1")), 1)
        self.assertEqual(runtime_variants(data, "female-v2"), [])

    def test_candidate_is_not_runtime_admitted(self):
        data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant(status="candidate")]}]}
        self.assertEqual(runtime_variants(data, "female-v1"), [])

    def test_missing_fit_is_rejected(self):
        row = variant()
        del row["fitManifest"]
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_admitted_requires_evidence(self):
        row = variant()
        del row["admissionEvidence"]
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}))

    def test_duplicate_body_variant_is_rejected(self):
        self.assertTrue(validate_matrix({"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant(), variant("female-v1", "candidate")]}]}))


if __name__ == "__main__":
    unittest.main()
