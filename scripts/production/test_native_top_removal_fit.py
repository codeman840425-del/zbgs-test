import unittest
from pathlib import Path
from unittest.mock import patch

import native_top_removal_fit as fit


class TestRemovalFit(unittest.TestCase):
    def test_portable_source_mapping_preserves_recipe(self):
        root = Path(__file__).resolve().parent
        example = {"lineage": {"originalVrm": {"path": "inputs/a.vrm", "sha256": "a" * 64},
                               "calls": [{"path": "calls/first.json", "sha256": "b" * 64}]}}
        mapped = fit.locate_inputs(example, root)
        self.assertEqual(Path(mapped["lineage"]["originalVrm"]["path"]), root / "inputs/a.vrm")
        self.assertEqual(Path(mapped["lineage"]["calls"][0]["path"]), root / "calls/first.json")
        self.assertEqual(example["lineage"]["originalVrm"]["path"], "inputs/a.vrm")

    def test_portable_recipe_rejects_path_above_archive(self):
        root = Path(__file__).resolve().parent
        for path in ("../different-archive", str(root / "absolute")):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "archive-relative"):
                fit.locate_inputs({"lineage": {"originalVrm": {"path": path}}}, root)

    def test_receipt_without_cold_open_never_reaches_geometry(self):
        recipe = {"schema": "native-top-removal-fit-v1", "lineage": {}}
        with patch.object(fit.lineage, "verify", return_value={"singleRemovalVerified": True,
                          "coldReopenVerified": False, "originalCallChainVerified": True}):
            with self.assertRaisesRegex(ValueError, "actual native call"):
                fit.derive(recipe)

    def test_recent_export_requires_cold_group_list(self):
        recipe = {"schema": "native-top-removal-fit-v1", "lineage": {"format": fit.lineage.REPLAY}}
        with patch.object(fit.lineage, "verify", return_value={"singleRemovalVerified": True,
                          "coldReopenVerified": True, "originalCallChainVerified": True, "coldGroupReadback": False}):
            with self.assertRaisesRegex(ValueError, "group readback"):
                fit.derive(recipe)

    def test_missing_original_export_receipts_never_reaches_geometry(self):
        recipe = {"schema": "native-top-removal-fit-v1", "lineage": {}}
        with patch.object(fit.lineage, "verify", return_value={"singleRemovalVerified": True,
                          "coldReopenVerified": True, "originalCallChainVerified": False}):
            with self.assertRaisesRegex(ValueError, "actual native call"):
                fit.derive(recipe)

    def test_auto_members_cannot_be_supplied_or_skip_original_calls(self):
        with self.assertRaisesRegex(ValueError, "takes only"):
            fit.derive({"schema": fit.DISCOVER, "lineage": {}, "members": []})
        recipe = {"schema": fit.DISCOVER, "lineage": {}}
        with patch.object(fit.lineage, "verify", return_value={"singleRemovalVerified": True,
                          "coldReopenVerified": True, "originalCallChainVerified": False}):
            with self.assertRaisesRegex(ValueError, "actual native call"):
                fit.derive(recipe)


if __name__ == "__main__":
    unittest.main()
