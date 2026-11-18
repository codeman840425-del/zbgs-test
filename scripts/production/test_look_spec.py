import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from look_spec import SCHEMA, plan, validate, write_plan
from production_paths import project_output
from variant_matrix import SCHEMA as MATRIX_SCHEMA


ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "assets-source/variant-matrix-v1/representative-matrix.json"
STRUCTURED_SPEC_PATH = ROOT / "evidence/m2-look-intake-v2/native-roundness-a-structured.json"


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


def structured_spec(**changes):
    return spec(sourceMode="structured-asset", sourceAsset={
        "assetId": "male-blazer-v1",
        "bodySha256": "c" * 64,
        "recipeSha256": "a" * 64,
        "manifestSha256": "b" * 64,
    }, **changes)


def variant(**changes):
    value = {
        "bodyType": "male",
        "bodySha256": "c" * 64,
        "recipeSha256": "a" * 64,
        "resourceManifest": "/assets/m1b/equipment.json#uniform-top",
        "resourceManifestSha256": "b" * 64,
        "fitManifest": "/assets/m1b/equipment.json#uniform-top.fitId",
        "coverageManifest": "/assets/m1b/coverage.json",
        "coverageManifestSha256": "d" * 64,
        "variantVersion": "v1",
        "status": "candidate",
    }
    value.update(changes)
    return value


def style_matrix(**styles):
    return {
        "schema": MATRIX_SCHEMA,
        "styles": [{"styleId": style, "variants": [row]} for style, row in styles.items()],
    }


def with_shorts():
    value = structured_spec()
    value["equipment"].append({"role": "bottom", "styleId": "lower-shorts-v1", "variantVersion": "v2"})
    return value


class LookSpecTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "nt", "Windows filenames")
    def test_output_refuses_device_stream_and_ambiguous_names(self):
        for name in ("nul", "NUL.txt", "com1.log", "plan.json:alternate", "plan.", "plan "):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Unsupported Windows output path"):
                project_output(ROOT / "output" / name, __file__)

    def test_normalizes_concept_reference(self):
        result = validate(spec())
        self.assertEqual(result["lookId"], "male-blazer-reference-v1")
        self.assertEqual(result["equipment"][0]["role"], "top")
        self.assertEqual(result["attachments"][0]["slot"], "neck")

    def test_structured_asset_requires_pins(self):
        value = spec(sourceMode="structured-asset")
        with self.assertRaisesRegex(ValueError, "sourceAsset"):
            validate(value)
        self.assertEqual(validate(structured_spec())["sourceMode"], "structured-asset")
        for key in ("bodySha256", "recipeSha256", "manifestSha256"):
            with self.subTest(key=key):
                value = structured_spec()
                value["sourceAsset"][key] = int("1" * 64)
                with self.assertRaisesRegex(ValueError, f"sourceAsset.{key}"):
                    validate(value)

    def test_duplicate_slots_are_rejected(self):
        value = spec(attachments=[
            {"slot": "neck", "styleId": "staff-card-v1", "variantVersion": "v1"},
            {"slot": "neck", "styleId": "tie-v1", "variantVersion": "v1"},
        ])
        with self.assertRaisesRegex(ValueError, "Duplicate attachment slot"):
            validate(value)

    def test_missing_exact_matrix_row_is_rejected(self):
        matrix = style_matrix(**{"uniform-top-v1": variant(bodyType="female")})
        result = plan(matrix, spec())
        self.assertEqual(result["status"], "rejected")
        self.assertIn("missing-exact-variant:uniform-top-v1/male/v1", result["blockers"])

    def test_candidate_row_stays_candidate(self):
        matrix = style_matrix(**{"uniform-top-v1": variant(admissionBlockers=["headAttachments"])})
        result = plan(matrix, spec())
        self.assertEqual(result["status"], "candidate")
        self.assertIn("variant-not-admitted:uniform-top-v1/male/v1", result["blockers"])
        self.assertEqual(result["resolvedEquipment"][0]["admissionBlockers"], ["headAttachments"])

    def test_admitted_equipment_leaves_full_look_unverified(self):
        matrix = style_matrix(**{
            "uniform-top-v1": variant(status="runtime-admitted", admissionEvidence="verified-equipment.json"),
        })
        for value in (spec(), structured_spec()):
            with self.subTest(mode=value["sourceMode"]):
                result = plan(matrix, value)
                self.assertEqual(result["status"], "candidate")
                self.assertEqual(result["resolvedEquipment"][0]["status"], "runtime-admitted")
                self.assertCountEqual(result["blockers"], [
                    "appearance-unverified:face/male-face-default-v1/v1",
                    "appearance-unverified:hair/male-wavy-v1/v1",
                    "attachment-unverified:neck/staff-card-v1/v1",
                    "color-unverified:hair/brown",
                    "color-unverified:iris/brown",
                    "color-unverified:lip/natural",
                    "color-unverified:skin/skin-original",
                ] + (["concept-reference-pending-production"] if value["sourceMode"] == "concept-reference" else []))

    def test_matrix_validator_rejects_unsubstantiated_admission(self):
        matrix = style_matrix(**{"uniform-top-v1": variant(status="runtime-admitted")})
        with self.assertRaisesRegex(ValueError, "requires admissionEvidence"):
            plan(matrix, structured_spec())

    def test_rejected_equipment_rejects_the_full_look(self):
        matrix = style_matrix(**{"uniform-top-v1": variant(status="rejected")})
        result = plan(matrix, spec())
        self.assertEqual(result["status"], "rejected")
        self.assertIn("variant-rejected:uniform-top-v1/male/v1", result["blockers"])

    def test_any_mismatched_equipment_pin_rejects_the_full_look(self):
        for row_key, reason in (
            ("bodySha256", "body"),
            ("recipeSha256", "recipe"),
            ("resourceManifestSha256", "resource-manifest"),
        ):
            with self.subTest(pin=row_key):
                shorts = variant(variantVersion="v2", resourceManifest="/assets/m1b/equipment.json#shorts")
                shorts[row_key] = "d" * 64
                matrix = style_matrix(**{"uniform-top-v1": variant(), "lower-shorts-v1": shorts})
                result = plan(matrix, with_shorts())
                self.assertEqual(result["status"], "rejected")
                self.assertEqual([row["role"] for row in result["resolvedEquipment"]], ["top"])
                self.assertIn(f"{reason}-identity-mismatch:lower-shorts-v1/male/v2", result["blockers"])

    def test_structured_source_requires_a_matrix_recipe(self):
        matrix = style_matrix(**{"uniform-top-v1": variant()})
        del matrix["styles"][0]["variants"][0]["recipeSha256"]
        result = plan(matrix, structured_spec())
        self.assertEqual(result["status"], "rejected")
        self.assertIn("recipe-identity-mismatch:uniform-top-v1/male/v1", result["blockers"])

    def test_multiple_resource_manifests_need_separate_pins(self):
        matrix = style_matrix(**{
            "uniform-top-v1": variant(),
            "lower-shorts-v1": variant(variantVersion="v2", resourceManifest="/assets/shorts/equipment.json#shorts"),
        })
        result = plan(matrix, with_shorts())
        self.assertEqual(result["status"], "rejected")
        self.assertIn("multiple-resource-manifests:structured-asset-v1", result["blockers"])

    def test_shared_resource_manifest_can_pin_multiple_fragments(self):
        matrix = style_matrix(**{
            "uniform-top-v1": variant(),
            "lower-shorts-v1": variant(variantVersion="v2", resourceManifest="assets/m1b/equipment.json#shorts"),
        })
        result = plan(matrix, with_shorts())
        self.assertEqual(result["status"], "candidate")
        self.assertEqual([row["role"] for row in result["resolvedEquipment"]], ["top", "bottom"])

    def test_stored_concept_and_structured_inputs_remain_candidates(self):
        concept_path = ROOT / "evidence/m2-look-intake-v1/male-blazer-look.json"
        with tempfile.TemporaryDirectory(dir=ROOT / "experiments") as directory:
            concept = write_plan(MATRIX_PATH, concept_path, Path(directory) / "concept.json")
            structured = write_plan(MATRIX_PATH, STRUCTURED_SPEC_PATH, Path(directory) / "structured.json")
        self.assertEqual(concept["status"], "candidate")
        self.assertIn("concept-reference-pending-production", concept["blockers"])
        self.assertEqual(structured["status"], "candidate")
        self.assertEqual(structured["resolvedEquipment"][0]["admissionBlockers"], [
            "dynamicMotion", "headAttachments", "runtimeRecordAndBudget", "surfaceAndTexture",
        ])

    def test_cli_refuses_drive_root_and_junction_before_reading_inputs(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "experiments") as directory:
            scratch = Path(directory)
            alias = scratch / "outside"
            if os.name == "nt":
                subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/j", str(alias), str(ROOT.parent)],
                               check=True, capture_output=True)
            else:
                alias.symlink_to(ROOT.parent, target_is_directory=True)
            name = scratch.name + "-look-plan.json"
            try:
                for target in [ROOT.parent / name, ROOT / ".." / name, alias / name]:
                    with self.subTest(target=target):
                        self.assertFalse(target.exists())
                        command = [sys.executable, "-B", str(ROOT / "scripts/production/look_spec.py"),
                                   "missing-matrix", "missing-spec", "--root", str(ROOT.parent), "--output", str(target)]
                        result = subprocess.run(command, cwd=scratch, capture_output=True, text=True)
                        self.assertEqual(result.returncode, 1)
                        self.assertIn("inside the production tool main checkout", result.stdout)
                        self.assertFalse(target.exists())
            finally:
                if os.name == "nt":
                    alias.rmdir()
                else:
                    alias.unlink()

    def test_file_validation_rejects_a_forged_matrix_manifest_pin(self):
        matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
        value = json.loads(STRUCTURED_SPEC_PATH.read_text(encoding="utf-8"))
        row = next(row for row in matrix["styles"][0]["variants"] if row["bodyType"] == value["bodyType"])
        row["resourceManifestSha256"] = value["sourceAsset"]["manifestSha256"] = "d" * 64
        with self.assertRaisesRegex(ValueError, "resourceManifest SHA does not match"):
            plan(matrix, value, root=ROOT)



if __name__ == "__main__":
    unittest.main()
