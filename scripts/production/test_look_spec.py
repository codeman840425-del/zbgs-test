import unittest

from look_spec import SCHEMA, plan, validate


def spec(**changes):
    value = {
        "schema": SCHEMA,
        "lookId": "male-blazer-reference-v1",
        "sourceMode": "concept-reference",
        "bodyType": "male",
        "bodyVariantVersion": "v1",
        "conceptReference": {"referenceId": "concept-male-blazer", "label": "男性西装参考"},
        "appearance": {
            "face": {"styleId": "male-face-default-v1", "variantVersion": "v1"},
            "hair": {"styleId": "male-wavy-v1", "variantVersion": "v1"},
            "colors": {"skin": "skin-original", "hair": "brown", "iris": "brown", "lip": "natural"},
        },
        "equipment": [{"role": "top", "styleId": "uniform-top-v1", "variantVersion": "v1"}],
        "attachments": [{"slot": "neck", "styleId": "staff-card-v1", "variantVersion": "v1"}],
    }
    value.update(changes)
    return value


class LookSpecTests(unittest.TestCase):
    def test_normalizes_concept_reference(self):
        result = validate(spec())
        self.assertEqual(result["lookId"], "male-blazer-reference-v1")
        self.assertEqual(result["equipment"][0]["role"], "top")
        self.assertEqual(result["attachments"][0]["slot"], "neck")

    def test_structured_asset_requires_pins(self):
        value = spec(sourceMode="structured-asset")
        with self.assertRaisesRegex(ValueError, "sourceAsset"):
            validate(value)
        value["sourceAsset"] = {
            "assetId": "male-blazer-v1",
            "recipeSha256": "a" * 64,
            "manifestSha256": "b" * 64,
        }
        self.assertEqual(validate(value)["sourceMode"], "structured-asset")

    def test_duplicate_slots_are_rejected(self):
        value = spec(attachments=[
            {"slot": "neck", "styleId": "staff-card-v1", "variantVersion": "v1"},
            {"slot": "neck", "styleId": "tie-v1", "variantVersion": "v1"},
        ])
        with self.assertRaisesRegex(ValueError, "Duplicate attachment slot"):
            validate(value)

    def test_missing_exact_matrix_row_is_rejected(self):
        result = plan({"styles": []}, spec())
        self.assertEqual(result["status"], "rejected")
        self.assertTrue(result["blockers"][0].startswith("missing-exact-variant:"))

    def test_candidate_row_stays_candidate(self):
        matrix = {"styles": [{"styleId": "uniform-top-v1", "variants": [{
            "bodyType": "male", "variantVersion": "v1", "status": "candidate",
            "admissionBlockers": ["headAttachments"],
        }]}]}
        result = plan(matrix, spec())
        self.assertEqual(result["status"], "candidate")
        self.assertIn("variant-not-admitted:uniform-top-v1/male/v1", result["blockers"])

    def test_admitted_row_can_be_runtime_ready(self):
        matrix = {"styles": [{"styleId": "uniform-top-v1", "variants": [{
            "bodyType": "male", "variantVersion": "v1", "status": "runtime-admitted",
        }]}]}
        result = plan(matrix, spec())
        self.assertEqual(result["status"], "runtime-ready")


if __name__ == "__main__":
    unittest.main()
