"""Offline checks for archive staging using synthetic Studio call receipts."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import native_archive_package_inputs as archive
import native_removal_lineage as lineage
import native_top_group_replay as replay
from test_native_removal_lineage import call_record, export_receipt, file_pin, vrm
from test_native_top_group_replay import BOTTOM, EXPORT, TARGET, status


class ArchivePackageInputsTests(unittest.TestCase):
    def setUp(self):
        output = archive.ROOT / "output"
        replay.checked_batch(output / "archive-test-location")
        output.mkdir(exist_ok=True)
        area = tempfile.TemporaryDirectory(prefix="native-author-archive-test-", dir=output)
        self.addCleanup(area.cleanup)
        self.temp = Path(area.name)
        self.out = self.temp / "prepared"
        self.ident = "archive-fixture"
        source = "Z:/producer/archive-fixture/original.vroid"
        model = "Z:/producer/archive-fixture/original.vrm"
        meta = {"name": EXPORT["title"], "version": EXPORT["model_version"], "authors": [EXPORT["author"]],
                "thumbnailImage": 0, "allowRedistribution": False, "modification": "prohibited"}
        self.editable = self.put("original.vroid", b"Original native edit")
        blob = vrm(meta, "archive source")
        self.model = self.put("original.vrm", blob)
        self.reference = self.put("received.vrm", blob)
        self.export = export_receipt(model, EXPORT["title"], blob)
        self.group = {"id": "synthetic-face", "type": "TransferableGroupType.N00.Level1.FaceShape", "resource": "fixture"}
        preset = {"id": "synthetic-face-set", "resource": "pixiv/VRoid/FaceSet/N00/010/fixture",
                  "category": "VRoid/FaceSet", "number": 10}
        self.key = "Level2FaceContour_Example"
        self.edit = {"group": self.group["id"], "key": self.key, "value": 0.4}
        edit_reply = {"ok": True, **self.edit}
        recipe = {"id": self.ident, "name": EXPORT["title"], "gender": "female", "presets": [preset],
                  "edits": [{"category": "FaceShape", "key": self.key, "before": 0.2, "value": 0.4, "reply": edit_reply}]}
        final = {**recipe["edits"][0], "reopenedValue": 0.4}
        clean_status = status(source)
        groups = [TARGET, BOTTOM, self.group]
        self.observed = self.put("native-readback.json", {"status": clean_status, "groups": groups, "edits": [final]})
        warm_read = {"key": self.key, "kind": "bone", "value": 0.2}
        cold_read = {**warm_read, "value": 0.4}
        doc_reply = {"ok": True, "path": source}
        calls = [
            (lineage.STATUS, {}, status()),
            (archive.CREATE, {"gender": "female"}, {"ok": True, "gender": "female"}),
            (archive.APPLY, {"id": preset["id"]}, {"ok": True, "id": preset["id"], "resource": preset["resource"]}),
            (lineage.GROUPS, {}, groups),
            (archive.GET, {"group": self.group["id"]}, [warm_read]),
            (archive.SET, self.edit, edit_reply),
            (lineage.SAVE, {"path": source}, doc_reply),
            (lineage.STATUS, {}, clean_status),
            (lineage.MENU, {}, {"ok": True}),
            (lineage.STATUS, {}, status()),
            (lineage.OPEN, {"path": source}, doc_reply),
            (lineage.STATUS, {}, clean_status),
            (lineage.GROUPS, {}, groups),
            (archive.GET, {"group": self.group["id"]}, [cold_read]),
            (lineage.GROUPS, {}, groups),
            (lineage.EXPORT, {**EXPORT, "path": model}, self.export),
        ]
        self.calls = [self.put(f"calls/20261118-140001-{i:06x}-{tool}.response.json", call_record(tool, args, reply))
                      for i, (tool, args, reply) in enumerate(calls)]
        provenance = {**recipe, "edits": [final], "completed": True, "app": "VRoid Studio 2.16.0",
                      "bridge": "mcjo79/vroid-mcp 0.15.0", "sourcePath": source, "modelPath": model,
                      "sourceSha256": file_pin(self.editable)["sha256"], "sourceBytes": self.editable.stat().st_size,
                      "sha256": file_pin(self.model)["sha256"], "modelBytes": self.model.stat().st_size,
                      "exportSettings": EXPORT, "exportReply": self.export, "exportedRightsMetadata": meta,
                      "evidenceCalls": [p.name for p in self.calls]}
        self.spec = {"schema": archive.SCHEMA, "originalEditable": file_pin(self.editable), "originalVrm": file_pin(self.model),
                     "baselineVrm": file_pin(self.reference), "originalColdReadback": file_pin(self.observed),
                     "originalProvenance": file_pin(self.put("provenance.json", provenance)),
                     "originalRecipe": file_pin(self.put("recipe.json", recipe)), "calls": [file_pin(p) for p in self.calls]}
        self.delta = {"schema": "native-dependency-delta-v1", "status": "compared"}

    def put(self, name, data):
        path = self.temp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data if isinstance(data, bytes) else archive.payload(data))
        return path

    def replace_reply(self, index, value):
        path = self.calls[index]
        response = json.loads(path.read_bytes())
        response["responses"][1]["result"]["content"][0]["text"] = json.dumps(value)
        self.put(path.relative_to(self.temp), response)
        self.spec["calls"][index] = file_pin(path)

    def test_valid_archive_stages_repeatable_compatibility_records_while_waiting_for_fit(self):
        with patch.object(archive, "compare_exports", return_value=self.delta) as compare:
            summary = archive.stage(self.spec, self.out)
            self.assertEqual(archive.stage(self.spec, self.out), summary)
        self.assertEqual(summary["status"], "archive-verified-awaiting-removal-fit")
        self.assertNotIn("config", summary)
        self.assertFalse(self.out.with_name("prepared-package.json").exists())
        result = json.loads((self.out / "result.json").read_bytes())
        batch = json.loads((self.out / "batch.json").read_bytes())
        self.assertEqual(result["schema"], archive.RESULT)
        self.assertFalse(result["nativeRunnerExecuted"])
        self.assertNotIn("entryRestored", result)
        self.assertEqual(result["items"][0]["coldReadback"], {self.key: 0.4})
        self.assertEqual(replay.runner.checked_recipe(batch, archive.ROOT), self.editable.read_bytes())
        self.assertEqual((self.out / self.ident / "candidate.vrm").read_bytes(), self.model.read_bytes())
        self.assertEqual(compare.call_args.args[0], self.reference)
        self.assertEqual(compare.call_args.args[2], self.model)

    def test_actual_set_reply_must_match_archived_edit(self):
        self.replace_reply(5, {"ok": True, **self.edit, "value": 0.5})
        with self.assertRaisesRegex(ValueError, "Original native edit differs"):
            archive.stage(self.spec, self.out)
        self.assertFalse(self.out.exists())

    def test_actual_cold_values_are_required(self):
        self.replace_reply(13, [{"key": self.key, "kind": "bone", "value": 0.3}])
        with self.assertRaisesRegex(ValueError, "Archived parameter value differs"):
            archive.stage(self.spec, self.out)
        self.assertFalse(self.out.exists())

    def test_actual_export_reply_is_required(self):
        self.replace_reply(15, {**self.export, "bytes": 123})
        with self.assertRaisesRegex(ValueError, "Original native export call differs"):
            archive.stage(self.spec, self.out)
        self.assertFalse(self.out.exists())

    def test_cross_body_baseline_is_rejected_before_staging(self):
        self.spec["baselineVrm"] = file_pin(self.put("wrong.vrm", b"Another actual source"))
        with self.assertRaisesRegex(ValueError, "Baseline must have the exact original VRM bytes"):
            archive.stage(self.spec, self.out)
        self.assertFalse(self.out.exists())

    def test_config_is_only_emitted_after_same_body_fit(self):
        fit = file_pin(self.put("fit.json", {"schema": "native-top-removal-fit-v1"}))
        proof = {"sourceSha256": self.spec["originalVrm"]["sha256"],
                 "originalEditableSha256": self.spec["originalEditable"]["sha256"], "groupId": TARGET["id"]}
        with patch.object(archive, "compare_exports", return_value=self.delta), patch(
            "native_top_removal_fit.derive", return_value=(b"donor", b"mask", {**proof, "sourceSha256": "0" * 64})
        ):
            with self.assertRaisesRegex(ValueError, "Removal fit does not belong"):
                archive.stage(self.spec, self.out, fit)
        self.assertFalse(self.out.exists())
        with patch.object(archive, "compare_exports", return_value=self.delta), patch(
            "native_top_removal_fit.derive", return_value=(b"donor", b"mask", proof)
        ):
            result = archive.stage(self.spec, self.out, fit)
        self.assertEqual(result["status"], "archive-and-removal-fit-verified")
        config = json.loads((archive.ROOT / result["config"]["path"]).read_bytes())
        self.assertEqual(config["schema"], "native-body-package-recipe-v1")
        self.assertEqual(config["items"][0]["topRemovalRecipe"]["sha256"], fit["sha256"])
        self.assertEqual(config["items"][0]["candidate"]["sha256"], self.spec["originalVrm"]["sha256"])


if __name__ == "__main__":
    unittest.main()
