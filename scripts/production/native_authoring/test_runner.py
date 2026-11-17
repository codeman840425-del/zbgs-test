"""Offline editor-state regressions; this module never constructs a live transport."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import runner


class Editor:
    def __init__(self, recipe, entry=None, fault=None):
        self.recipe = recipe
        self.path = entry
        self.dirty = False
        self.saved = {}
        self.values = {}
        self.fault = fault
        self.opens = []
        self.serial = 0
        self.observed_sets = []
        self.transport_calls = []
        self.export_screen = False
        self.export_options_calls = []

    def __call__(self, tool, args, directory, step):
        self.transport_calls.append(tool)
        if tool == "vroid_status":
            return dict(self.recipe["host"], ready=bool(self.path) and not self.export_screen, modelOpen=bool(self.path),
                        isEditing=bool(self.path) and not self.export_screen, canSave=bool(self.path),
                        dirty=self.dirty, currentFile=str(self.path) if self.path else None)
        if tool == "vroid_open":
            self.path = Path(args["path"])
            self.opens.append(self.path)
            self.serial += 1
            baseline = {p["key"]:p["baseline"] for p in self.recipe["parameters"]}
            self.values = self.saved.get(self.path, baseline).copy()
            if self.fault == "cold" and self.path.name == "candidate.vroid":
                self.values = baseline.copy()
                self.fault = None
            self.dirty = False
        elif tool == "vroid_list_groups":
            return [dict(type=p, id=p+str(self.serial)) for p in {x["groupType"] for x in self.recipe["parameters"]}]
        elif tool == "vroid_get_params":
            return [dict(key="protected",kind="bone",value=self.values.get("protected",0.15))] + [dict(key=p["key"], kind=p["kind"], value=self.values[p["key"]])
                    for p in self.recipe["parameters"] if args["group"] == p["groupType"]+str(self.serial)]
        elif tool in ("vroid_set_bone","vroid_set_color"):
            key = args["key"]
            p, = [p for p in self.recipe["parameters"] if p["key"] == key]
            assert args["group"] == p["groupType"]+str(self.serial)
            self.values[key] = args["value"] if p["kind"] == "bone" else {k:args[k] for k in "rgba"}
            self.dirty = True
            self.observed_sets.append((tool,key))
            if self.fault == "paired":
                self.values["protected"] = .22
                self.fault = None
            if self.fault in ("set","foreign"):
                if self.fault == "foreign":
                    self.path = self.path.parent.parent / "unknown.vroid"
                self.fault = None
                raise RuntimeError("native parameter command failed")
        elif tool == "vroid_save":
            self.path = Path(args["path"])
            self.saved[self.path] = self.values.copy()
            with self.path.open("xb") as f:
                f.write(json.dumps(self.values).encode())
            self.dirty = False
        elif tool == "vroid_main_menu":
            assert not self.dirty
            self.path = None
        elif tool == "vroid_screenshot":
            return {"path":"mock-preview","sha256":"mock"}
        elif tool == "vroid_export_vrm_options":
            self.export_options_calls.append(args["leave"])
            self.export_screen = not args["leave"]
            receipt = runner.ROOT/"evidence/m2-native-authoring-recovery-v1/export-options.json"
            return runner.embedded(json.loads(receipt.read_bytes()))
        elif tool == "vroid_export_vrm":
            assert self.export_screen
            if self.fault in ("delayed-export","dirty-export","foreign-export"):
                if self.fault == "dirty-export":
                    self.dirty = True
                if self.fault == "foreign-export":
                    self.path = self.path.parent/"foreign.vroid"
                self.fault = None
                raise RuntimeError("Export failed")
            self.export_screen = False
            raw = runner.struct.pack("<4sII", b"glTF", 2, 20) + bytes(8)
            with Path(args["path"]).open("xb") as f:
                f.write(raw)
            return dict(path=args["path"], bytes=len(raw), version="1.0", leftExportScreen=True,
                        settings={r:args[k] for k,r in runner.EXPORT_SETTINGS.items()}, warnings=[])
        else:
            raise AssertionError(tool)
        return {"ok":True}


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.recipe = json.loads((runner.HERE/"facecontour-pair.json").read_bytes())
        self.source = runner.ROOT / self.recipe["template"]["path"]
        self.original = self.source.read_bytes()

    def execute(self, editor):
        result = runner.run(self.recipe,self.path/"batch",editor)
        self.assertEqual(self.original,self.source.read_bytes())
        self.assertNotIn(self.source,editor.opens)
        return result

    def test_reopens_same_template_and_restores_home(self):
        editor = Editor(self.recipe)
        result = self.execute(editor)
        self.assertTrue(result["passed"],result)
        self.assertIsNone(editor.path)
        self.assertEqual(len(editor.observed_sets),2)
        self.assertNotEqual(*[r["editable"]["sha256"] for r in result["items"]])
        for row in result["items"]:
            self.assertEqual(row["coldReadback"],row["values"])
            self.assertEqual((self.path/"batch"/row["id"]/"template-copy.vroid").read_bytes(),self.original)
        with self.assertRaises(FileExistsError):
            self.execute(editor)

    def test_one_failure_keeps_evidence_and_restores_saved_entry(self):
        entry = self.path/"unrelated.vroid"
        entry.write_bytes(b"previous editor source")
        editor = Editor(self.recipe,entry,"set")
        report = self.execute(editor)
        self.assertEqual([r["state"] for r in report["items"]],["failed","exported"])
        self.assertTrue(report["entryRestored"])
        self.assertEqual(editor.path,entry)
        self.assertEqual(entry.read_bytes(),b"previous editor source")
        self.assertTrue((self.path/"batch"/report["items"][0]["id"]/"failure-state.vroid").is_file())

    def test_cold_mismatch_rejects_export(self):
        editor = Editor(self.recipe,fault="cold")
        report = self.execute(editor)
        self.assertIn("Cold-open",report["items"][0]["reason"])
        self.assertEqual(editor.transport_calls.count("vroid_export_vrm"),1)

    def test_export_screen_open_then_owned_recovery(self):
        editor = Editor(self.recipe,fault="delayed-export")
        report = self.execute(editor)
        self.assertEqual(editor.export_options_calls,[False,True,False])
        self.assertTrue(report["entryRestored"])
        self.assertEqual([r["state"] for r in report["items"]],["failed","exported"])
        self.assertEqual(editor.transport_calls.count("vroid_export_vrm"),2)
        self.assertTrue((self.path/"batch"/self.recipe["items"][0]["id"]/"export-preparation.json").is_file())

    def test_dirty_or_foreign_export_screen_is_left_untouched(self):
        for fault in ("dirty-export","foreign-export"):
            with self.subTest(fault=fault):
                editor = Editor(self.recipe,fault=fault)
                report = runner.run(self.recipe,self.path/fault,editor)
                self.assertFalse(report["entryRestored"])
                self.assertEqual(editor.export_options_calls,[False])
                self.assertEqual(len(report["items"]),1)

    def test_undeclared_paired_parameter_change_is_rejected(self):
        report = self.execute(Editor(self.recipe,fault="paired"))
        self.assertIn("Non-target", report["items"][0]["reason"])
        self.assertEqual(report["items"][1]["state"],"exported")

    def test_unknown_dirty_document_stops_batch(self):
        editor = Editor(self.recipe,fault="foreign")
        report = self.execute(editor)
        self.assertFalse(report["entryRestored"])
        self.assertEqual(len(report["items"]),1)
        self.assertIn("Unrecognized active",report["error"])
        self.assertTrue(editor.dirty)

    def test_dirty_entry_is_read_only(self):
        editor = Editor(self.recipe,self.source)
        editor.dirty = True
        report = self.execute(editor)
        self.assertFalse(report["passed"])
        self.assertEqual(editor.transport_calls,["vroid_status"])

    def test_wrong_sha_or_unobserved_value_preflight(self):
        for modification in ("sha","value"):
            with self.subTest(modification=modification):
                batch = copy.deepcopy(self.recipe)
                if modification == "sha":
                    batch["template"]["sha256"] = "0"*64
                else:
                    batch["items"][0]["values"][batch["parameters"][0]["key"]] = .65
                editor = Editor(batch)
                with self.assertRaises(ValueError):
                    runner.run(batch,self.path/modification,editor)
                self.assertEqual(editor.transport_calls,[])

    def test_nested_response_failure(self):
        record = dict(ok=True,responses=[dict(id=2,result=dict(content=[dict(type="text",text='{"ok":true,"data":{"ok":false}}')]))])
        with self.assertRaisesRegex(ValueError, "Nested Bridge"):
            runner.embedded(record)

    def test_real_cache_scan_notice_preceding_status(self):
        path = runner.ROOT/"assets-source/native-parameter-batch-v1/calls/0004-vroid_status.response.json"
        record = json.loads(path.read_bytes())
        blocks = next(r["result"]["content"] for r in record["responses"] if r["id"] == 2)
        self.assertEqual(len(blocks), 2)
        status = runner.embedded(record)
        self.assertTrue(status["modelOpen"])
        self.assertTrue(status["currentFile"].endswith("template-copy.vroid"))
        blocks.append(blocks[1])
        with self.assertRaisesRegex(ValueError, "exactly one structured"):
            runner.embedded(record)
        del blocks[1:]
        with self.assertRaisesRegex(ValueError, "exactly one structured"):
            runner.embedded(record)

    def test_color_transport_uses_discovered_group_and_rgba(self):
        base = runner.ROOT/"assets-source/native-vroid-iris-study-v1"
        template = json.loads((base/"manifest.json").read_bytes())["sourceEditable"]
        self.recipe["template"] = dict(template,version="native-male-216-v1")
        key = "Level3Iris_LeftOverlayColor"
        observations, values = [], []
        for name in ("07-iris-before.json","14-iris-reopened.json"):
            path = base/"records"/name
            raw = path.read_bytes()
            observations.append(dict(path=path.relative_to(runner.ROOT).as_posix(),sha256=runner.sha(raw)))
            data = runner.embedded(json.loads(raw))
            values.append(next(r["value"] for r in data if r["key"] == key))
        self.recipe["parameters"] = [dict(kind="color",key=key,groupType="TransferableGroupType.N00.Level3.Iris",baseline=values[0],observations=observations)]
        self.recipe["items"] = [dict(id="paired-color-transport",values={key:values[1]})]
        editor = Editor(self.recipe)
        report = self.execute(editor)
        self.assertTrue(report["passed"],report)
        self.assertEqual(editor.observed_sets,[("vroid_set_color",key)])


if __name__ == "__main__":
    unittest.main()
