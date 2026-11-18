import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from qa_native_budget_gate import verify


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "evidence"


class QaNativeBudgetGateTests(unittest.TestCase):
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
