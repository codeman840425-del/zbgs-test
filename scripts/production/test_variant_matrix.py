import json
import tempfile
import unittest
from pathlib import Path

from variant_matrix import runtime_variants, validate_matrix, validate_matrix_files


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

    def test_file_closure_checks_manifest_hashes_and_fragments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "prototype/public/assets/m1").mkdir(parents=True)
            (root / "prototype/public/assets/body").mkdir(parents=True)
            resource = root / "prototype/public/assets/m1/equipment.json"
            coverage = root / "prototype/public/assets/body/coverage.json"
            resource.write_text('{"style":"dress"}\n', encoding='utf-8')
            coverage.write_text('{"alpha":true}\n', encoding='utf-8')
            row = variant(body="female-v1", status="candidate")
            row.update({
                "resourceManifest": "/assets/m1/equipment.json#dress",
                "resourceManifestSha256": __import__('hashlib').sha256(resource.read_bytes()).hexdigest(),
                "fitManifest": "/assets/m1/equipment.json#dress.fit",
                "coverageManifest": "/assets/body/coverage.json",
                "coverageManifestSha256": __import__('hashlib').sha256(coverage.read_bytes()).hexdigest(),
            })
            data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [row]}]}
            self.assertEqual(validate_matrix_files(data, root), [])
            resource.write_text('{"style":"changed"}\n', encoding='utf-8')
            self.assertTrue(any('resourceManifest SHA' in error for error in validate_matrix_files(data, root)))

    def test_file_closure_rejects_missing_fit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = {"schema": "zbgs-style-variant-matrix-v1", "styles": [{"styleId": "dress", "variants": [variant()]}]}
            errors = validate_matrix_files(data, root)
            self.assertTrue(any('resourceManifest' in error for error in errors))
            self.assertTrue(any('fitManifest' in error for error in errors))


if __name__ == "__main__":
    unittest.main()
