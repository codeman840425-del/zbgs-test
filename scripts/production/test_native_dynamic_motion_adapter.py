import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from native_dynamic_motion_adapter import DynamicMotionError, build_report, runtime_identity


ROOT = Path(__file__).resolve().parents[2]
ADAPTATION = ROOT / "evidence/m2-native-batch-adaptation-v1/adaptation-admissions.json"


class NativeDynamicMotionAdapterTests(unittest.TestCase):
    def test_report_separates_structural_reuse_from_runtime_admission(self):
        report = build_report(ADAPTATION)
        self.assertEqual(report["schema"], "native-dynamic-motion-adapter-v1")
        self.assertEqual(report["status"], "blocked")
        self.assertFalse(report["runtimeAdmissionGranted"])
        self.assertEqual(len(report["candidates"]), 2)
        for candidate in report["candidates"]:
            self.assertEqual(candidate["reuse"]["vrmSpringBoneStructure"], "reusable")
            self.assertEqual(candidate["reuse"]["hairAndHeadAttachmentFit"], "requires-exact-body-evidence")
            self.assertEqual(candidate["runtimeAdmission"], "blocked")
            self.assertEqual(len(candidate["sourceIdentity"]["body"]["sha256"]), 64)

    def test_stale_source_body_is_rejected(self):
        source = json.loads(ADAPTATION.read_text(encoding="utf8"))
        source["candidates"][0]["body"]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory(dir=ROOT / "output") as temp:
            path = Path(temp) / "stale.json"
            path.write_text(json.dumps(source), encoding="utf8")
            with self.assertRaises(DynamicMotionError):
                build_report(path)

    def test_visual_candidate_status_cannot_be_runtime_identity(self):
        # The current room reports are technical visual candidates and carry a
        # record hash different from the readiness gate's record.  They remain
        # useful observations but are intentionally not consumed by this
        # structural-only adapter.
        report = build_report(ADAPTATION)
        self.assertIsNone(report["candidates"][0]["runtimeEvidence"])
        room = ROOT / "evidence/m2-native-admission-cycle-v1/room-roundness-a/report.json"
        body_sha = report["candidates"][0]["bodySha256"]
        self.assertIsNone(runtime_identity(room, body_sha, None))
        self.assertFalse(report["runtimeAdmissionGranted"])

    def test_mismatched_admitted_runtime_identity_is_rejected(self):
        room = ROOT / "evidence/m2-native-admission-cycle-v1/room-roundness-a/report.json"
        source = json.loads(room.read_text(encoding="utf8"))
        source["status"] = "technical-pass"
        source["body"] = {"sha256": "0" * 64}
        with tempfile.TemporaryDirectory(dir=ROOT / "output") as temp:
            path = Path(temp) / "wrong-runtime.json"
            path.write_text(json.dumps(source), encoding="utf8")
            body_sha = json.loads(ADAPTATION.read_text(encoding="utf8"))["candidates"][0]["body"]["sha256"]
            self.assertIsNone(runtime_identity(path, body_sha, None))


if __name__ == "__main__":
    unittest.main()
