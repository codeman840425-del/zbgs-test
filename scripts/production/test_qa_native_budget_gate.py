import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from budget_classification_report import classify
from qa_native_budget_gate import _classification_decision, verify


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "evidence"


class QaNativeBudgetGateTests(unittest.TestCase):
    def measured(self, *records, status="over-budget"):
        path = ROOT / "scripts/production/asset-budgets-v1.json"
        return classify({"schema": "zbgs-character-record-budget-result-v1",
                         "status": status, "records": list(records)}, path, {}, path)

    def record(self, identifier="test-character", record_sha="b" * 64, *, failure=None):
        excess = [{"metric": "rgba8MipBytes", "actual": 101, "limit": 100}]
        return {
            "id": identifier, "revision": 1, "recordSha256": record_sha,
            "bodyType": "sample", "avatarSha256": "a" * 64,
            "status": "over-budget" if failure else "within-static-limits",
            "models": [
                {"id": "body", "class": "body", "assetExcesses": []},
                {"id": "bob", "class": "hair", "assetExcesses": excess if failure == "hair.bob" else []},
            ],
            "selectedCost": {
                "totals": {"fileBytes": 25, "rgba8MipBytes": 101, "textureObjects": 2},
                "aggregateExcesses": excess if failure == "aggregate.selectedCost" else [],
            },
            "startupAndSelectedCost": {
                "aggregateExcesses": excess if failure == "aggregate.startupAndSelectedCost" else [],
            },
            "closureSourceBytes": 50,
        }

    def test_classification_retains_hair_and_both_aggregate_failures(self):
        for failure in ("hair.bob", "aggregate.selectedCost", "aggregate.startupAndSelectedCost"):
            with self.subTest(failure=failure):
                report = self.measured(self.record(failure=failure))
                self.assertEqual(report["status"], "blocked")
                decision = _classification_decision(report["records"][0])
                self.assertEqual(decision["staticFailures"], [failure])
                self.assertEqual(decision["decision"], "reject-static-over-budget")
                self.assertEqual(decision["recordSha256"], "b" * 64)
                self.assertEqual(decision["unmeasuredLayers"], ["gpu", "ordinaryPC"])
                self.assertFalse(decision["budgetAdmission"])

    def test_classification_keeps_both_signed_records_on_same_body(self):
        report = self.measured(self.record("over", failure="hair.bob"), self.record("within", "c" * 64))
        decisions = [_classification_decision(record) for record in report["records"]]
        self.assertEqual([row["recordId"] for row in decisions], ["over", "within"])
        self.assertEqual([row["recordSha256"] for row in decisions], ["b" * 64, "c" * 64])
        self.assertEqual([row["decision"] for row in decisions],
                         ["reject-static-over-budget", "hold-unmeasured-resource-layer"])

    def test_unavailable_and_empty_input_cannot_classify_as_candidate(self):
        for status in ("unsupported", "invalid", "unmeasured"):
            with self.subTest(status=status), self.assertRaisesRegex(ValueError, "Expected a measured record budget"):
                self.measured(status=status)
        with self.assertRaisesRegex(ValueError, "no measured records"):
            self.measured(status="within-static-limits")
        with self.assertRaisesRegex(ValueError, "differs from measured record"):
            self.measured(self.record())
        decision = _classification_decision({"staticBudgetStatus": "unsupported"})
        self.assertEqual(decision["decision"], "hold-unavailable-static-budget")
        self.assertFalse(decision["budgetAdmission"])

    def paths(self):
        return (
            EVIDENCE / "m2-native-production-gate-v5/report.json",
            EVIDENCE / "m2-ktx-native-facecontour-sidecar-v1/report.json",
            EVIDENCE / "m2-ktx-native-facecontour-sidecar-v1/determinism-check.json",
            EVIDENCE / "m2-native-batch-adaptation-v1/native-batch-ktx-budget.json",
            EVIDENCE / "m2-native-batch-runtime-seam-v1/budget-classification-v1.json",
        )

    def test_exact_body_and_sidecar_binding_yields_explicit_rejection(self):
        report = verify(*self.paths())
        self.assertEqual(report["status"], "pass")
        self.assertEqual(len(report["budgetDecisions"]), 2)
        for decision in report["budgetDecisions"]:
            self.assertEqual(decision["decision"], "reject-static-over-budget")
            self.assertIn("ordinaryPC", decision["unmeasuredLayers"])
            self.assertFalse(decision["budgetAdmission"])

    def test_changed_classification_body_sha_breaks_sidecar_binding(self):
        paths = self.paths()
        with tempfile.TemporaryDirectory(dir=ROOT / "output") as directory:
            changed = Path(directory) / "classification.json"
            payload = json.loads(paths[-1].read_bytes())
            payload["records"][0]["bodySha256"] = "0" * 64
            changed.write_text(json.dumps(payload), encoding="utf-8")
            report = verify(*paths[:4], changed)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("classification identity" in issue for issue in report["issues"]))

    def test_unmeasured_ordinary_pc_is_not_a_pass(self):
        paths = self.paths()
        with tempfile.TemporaryDirectory(dir=ROOT / "output") as directory:
            changed = Path(directory) / "classification.json"
            payload = json.loads(paths[-1].read_bytes())
            payload["records"][0]["resourceGates"] = {
                "body": "passed-static", "garments": {}, "accessories": {}
            }
            payload["records"][0]["gpu"]["status"] = "measured"
            changed.write_text(json.dumps(payload), encoding="utf-8")
            report = verify(*paths[:4], changed)
        self.assertEqual(report["status"], "fail")
        self.assertTrue(any("static over-budget decision" in issue for issue in report["issues"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
