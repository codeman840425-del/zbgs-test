"""Hermetic lineage tests with synthetic group, license and Bridge call receipts."""

import json
from pathlib import Path
import struct
import tempfile
import unittest

import native_removal_lineage as lineage
import native_top_group_replay as replay
from test_native_top_group_replay import BOTTOM, EXPORT, SESSION, SETTINGS, TARGET, SimulatedBridge, status


def vrm(meta, marker):
    raw = json.dumps({"extensions": {"VRMC_vrm": {"meta": meta}}, "extras": {"fixture": marker}}).encode("utf-8")
    raw += b" " * (-len(raw) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, 20 + len(raw), len(raw), 0x4E4F534A) + raw


def file_pin(path):
    return {"path": str(path), "sha256": replay.artifact(path)["sha256"]}


def call_record(tool, args, payload):
    return {
        "request": {"method": "tools/call", "params": {"name": tool, "arguments": args}},
        "responses": [
            {"id": 1, "jsonrpc": "2.0", "result": {}},
            {"id": 2, "jsonrpc": "2.0", "result": {"content": [{"type": "text", "text": json.dumps(payload)}]}},
        ],
        "ok": True, "exitCode": 0, "failures": [],
    }


def export_receipt(path, name, content):
    return {"ok": True, "path": path, "version": "1.0", "warnings": [], "leftExportScreen": True, "bytes": len(content),
            "settings": {**SETTINGS, "vrm1Meta": {"name": name, "version": EXPORT["model_version"], "authors": EXPORT["author"]}}}


class NativeRemovalLineageTests(unittest.TestCase):
    def setUp(self):
        replay.checked_batch(replay.OUTPUT_PARENT / "test-lineage")
        replay.OUTPUT_PARENT.mkdir(exist_ok=True)
        temp = tempfile.TemporaryDirectory(prefix="lineage-test-", dir=replay.OUTPUT_PARENT)
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.editable_label = "Z:/archive/original/source.vroid"
        self.model_label = "Z:/archive/original/source.vrm"
        self.meta = {"name": EXPORT["title"], "version": EXPORT["model_version"], "authors": [EXPORT["author"]],
                     "thumbnailImage": 1, "avatarPermission": "onlyAuthor",
                     "allowRedistribution": False, "modification": "prohibited"}
        self.editable = self.put("actual-original.vroid", b"original editable")
        self.model = self.put("actual-original.vrm", vrm(self.meta, "original"))
        cold_status = status(self.editable_label)
        self.cold = self.put("native-readback.json", {"status": cold_status, "groups": [TARGET, BOTTOM]})
        original_export = export_receipt(self.model_label, self.meta["name"], self.model.read_bytes())
        self.provenance = self.put("provenance.json", {
            "id": "synthetic-role", "completed": True, "app": "VRoid Studio 2.16.0", "bridge": "mcjo79/vroid-mcp 0.15.0",
            "sourcePath": self.editable_label, "sourceSha256": file_pin(self.editable)["sha256"],
            "sourceBytes": self.editable.stat().st_size, "modelPath": self.model_label,
            "sha256": file_pin(self.model)["sha256"], "modelBytes": self.model.stat().st_size,
            "exportSettings": EXPORT, "exportReply": original_export, "exportedRightsMetadata": self.meta,
        })
        self.original_calls = self.chain("original-calls", [
            (lineage.OPEN, {"path": self.editable_label}, {"ok": True, "path": self.editable_label}),
            (lineage.STATUS, {}, cold_status),
            (lineage.GROUPS, {}, [TARGET, BOTTOM]),
            (lineage.EXPORT, {**EXPORT, "path": self.model_label}, original_export),
        ])

    def put(self, name, data):
        path = self.root / name
        path.parent.mkdir(exist_ok=True, parents=True)
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def chain(self, folder, calls):
        return [file_pin(self.put(f"{folder}/{i:02d}-{tool}.json", call_record(tool, args, payload)))
                for i, (tool, args, payload) in enumerate(calls, 1)]

    def spec(self, mode, unchanged, removed, reference, receipt, calls):
        return {
            "format": mode, "originalEditable": file_pin(self.editable), "originalVrm": file_pin(self.model),
            "originalProvenance": file_pin(self.provenance), "originalColdReadback": file_pin(self.cold),
            "untouchedCopy": file_pin(unchanged), "removedEditable": file_pin(removed), "removedVrm": file_pin(reference),
            "removalReceipt": file_pin(receipt), "originalCalls": self.original_calls, "calls": calls,
        }

    def fusion(self):
        unchanged = self.put("actual-untouched.vroid", self.editable.read_bytes())
        removed = self.put("actual-removed.vroid", b"only removed top")
        name = self.meta["name"] + " coverage reference"
        reference = self.put("actual-removed.vrm", vrm({**self.meta, "name": name, "thumbnailImage": 0}, "removed"))
        work = "Z:/at-removal/untouched-source-copy.vroid"
        candidate = "Z:/at-removal/tops-removed.vroid"
        target_vrm = "Z:/at-removal/tops-removed.vrm"
        exported = export_receipt(target_vrm, name, reference.read_bytes())
        removal = {"ok": True, "removed": [TARGET["id"]]}
        receipt = self.put("old-receipt.json", {
            "role": "synthetic-role", "originalSha256": file_pin(self.editable)["sha256"],
            "copySha256": file_pin(unchanged)["sha256"], "singleChange": TARGET, "removeReply": removal,
            "before": [TARGET, BOTTOM], "after": [BOTTOM], "source": candidate, "sourceSha256": file_pin(removed)["sha256"],
            "vrm": target_vrm, "vrmSha256": file_pin(reference)["sha256"], "export": exported,
        })
        calls = self.chain("legacy-calls", [
            (lineage.STATUS, {}, status()),
            (lineage.OPEN, {"path": work}, {"ok": True, "path": work}),
            (lineage.STATUS, {}, status(work)),
            (lineage.GROUPS, {}, [TARGET, BOTTOM]),
            (lineage.REMOVE, {"group": TARGET["id"]}, removal),
            (lineage.GROUPS, {}, [BOTTOM]),
            (lineage.SAVE, {"path": candidate}, {"ok": True, "path": candidate}),
            (lineage.STATUS, {}, status(candidate)),
            (lineage.MENU, {}, {"ok": True}),
            (lineage.OPEN, {"path": candidate}, {"ok": True, "path": candidate}),
            (lineage.STATUS, {}, status(candidate)),
            (lineage.EXPORT, {**EXPORT, "title": name, "path": target_vrm}, exported),
            (lineage.MENU, {}, {"ok": True}),
        ])
        return self.spec(lineage.FUSION, unchanged, removed, reference, receipt, calls)

    def replayed(self):
        batch = self.root / "replay"
        request = replay.prepare(batch, self.editable, self.model, self.cold, self.provenance)
        digest = file_pin(request)["sha256"]
        req = replay.load_request(request, digest, batch)
        run = batch / "run-candidate"
        ref_blob = vrm({**self.meta, "thumbnailImage": 0}, "removed")
        bridge = SimulatedBridge(self.put("simulated-export.vrm", ref_blob))

        def transport(tool, args, directory, step):
            payload = bridge(tool, args, directory, step)
            if tool in (lineage.OPEN, lineage.SAVE):
                payload = {"ok": True, "path": args["path"]}
            if tool == lineage.EXPORT:
                payload = export_receipt(args["path"], self.meta["name"], ref_blob)
            replay.runner.write(directory / f"{step}.response.json", call_record(tool, args, payload))
            return payload

        receipt = replay.run(req, request, digest, run, SESSION, transport, batch_output=batch)
        self.assertEqual(receipt["state"], "exported-pending-geometry-and-mask-readback")
        spec = self.spec(lineage.REPLAY, run / "untouched-source-copy.vroid", run / "tops-removed.vroid",
                         run / "tops-removed.vrm", run / "result.json",
                         [file_pin(p) for p in sorted((run / "calls").glob("*.response.json"))])
        spec["replayRequest"] = file_pin(request)
        return spec

    def test_fusion_uses_fixed_assets_regardless_of_relocated_paths(self):
        spec = self.fusion()
        proof = lineage.verify(spec)
        self.assertEqual(proof["status"], "verified-with-limitations")
        self.assertEqual(proof["groupId"], TARGET["id"])
        self.assertEqual(proof["sourceSha256"], spec["originalVrm"]["sha256"])
        self.assertEqual(proof["referenceSha256"], spec["removedVrm"]["sha256"])
        self.assertTrue(proof["singleRemovalVerified"])
        self.assertTrue(proof["coldReopenVerified"])
        self.assertFalse(proof["coldGroupReadback"])
        self.assertEqual(proof["limitations"], ["cold-group-readback-not-recorded"])

    def test_fusion_does_not_infer_reopen_or_single_call_from_receipt(self):
        spec = self.fusion()
        del spec["calls"]
        proof = lineage.verify(spec)
        self.assertEqual(proof["status"], "incomplete")
        self.assertFalse(proof["singleRemovalVerified"])
        self.assertFalse(proof["coldReopenVerified"])
        self.assertTrue(proof["receiptGroupDeltaVerified"])

    def test_fusion_can_use_a_recorded_cold_group_list(self):
        spec = self.fusion()
        observation = self.put("supplemental-cold-groups.json", call_record(lineage.GROUPS, {}, [BOTTOM]))
        spec["calls"].insert(11, file_pin(observation))
        self.assertTrue(lineage.verify(spec)["coldGroupReadback"])
        observation.write_text(json.dumps(call_record(lineage.GROUPS, {}, [TARGET, BOTTOM])), encoding="utf-8")
        spec["calls"][11] = file_pin(observation)
        with self.assertRaisesRegex(ValueError, "cold-reopen groups differ"):
            lineage.verify(spec)

    def test_accepts_fixed_call_index_and_checks_every_call_digest(self):
        spec = self.fusion()
        index = self.put("call-index.json", {"calls": [
            {**p, "path": Path(p["path"]).relative_to(self.root).as_posix()} for p in spec["calls"]]})
        call = Path(spec["calls"][0]["path"])
        spec["calls"] = file_pin(index)
        self.assertTrue(lineage.verify(spec)["coldReopenVerified"])
        call.write_bytes(call.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "Pinned bytes differ: calls"):
            lineage.verify(spec)

    def test_refuses_a_second_removed_group_even_with_fixed_call_hash(self):
        spec = self.fusion()
        p = Path(spec["calls"][4]["path"])
        record = json.loads(p.read_bytes())
        record["responses"][1]["result"]["content"][0]["text"] = json.dumps(
            {"ok": True, "removed": [TARGET["id"], BOTTOM["id"]]})
        spec["calls"][4] = file_pin(self.put(p.relative_to(self.root), record))
        with self.assertRaisesRegex(ValueError, "Native removal request/reply differs"):
            lineage.verify(spec)

    def test_refuses_call_chain_cross_session(self):
        spec = self.fusion()
        p = Path(spec["calls"][10]["path"])
        record = json.loads(p.read_bytes())
        block = record["responses"][1]["result"]["content"][0]
        block["text"] = json.dumps({**json.loads(block["text"]), "startedUtc": "other-session"})
        spec["calls"][10] = file_pin(self.put(p.relative_to(self.root), record))
        with self.assertRaisesRegex(ValueError, "changed host or session"):
            lineage.verify(spec)

    def test_refuses_another_native_source_even_if_pinned(self):
        spec = self.fusion()
        spec["originalEditable"] = spec["removedEditable"]
        with self.assertRaisesRegex(ValueError, "Edit/source copy or distinct reference hashes differ"):
            lineage.verify(spec)

    def test_refuses_changed_reference_permission_even_if_pinned(self):
        spec = self.fusion()
        name = self.meta["name"] + " coverage reference"
        spec["removedVrm"] = file_pin(self.put("altered.vrm", vrm({**self.meta, "name": name,
                                                                "allowRedistribution": True}, "altered")))
        with self.assertRaisesRegex(ValueError, "metadata or rights differ"):
            lineage.verify(spec)

    def test_refuses_changed_export_setting_even_if_pinned(self):
        spec = self.fusion()
        p = Path(spec["removalReceipt"]["path"])
        receipt = json.loads(p.read_bytes())
        receipt["export"]["settings"]["materialMode"] = 1
        spec["removalReceipt"] = file_pin(self.put(p.relative_to(self.root), receipt))
        with self.assertRaisesRegex(ValueError, "applied export settings differ"):
            lineage.verify(spec)

    def test_e121_replay_binds_request_result_and_cold_groups(self):
        spec = self.replayed()
        result = lineage.verify(spec)
        self.assertEqual(result["status"], "verified")
        self.assertTrue(result["singleRemovalVerified"])
        self.assertTrue(result["coldGroupReadback"])
        self.assertEqual(result["limitations"], [])

    def test_e121_replay_requires_the_actual_cold_group_list(self):
        spec = self.replayed()
        cold = [i for i, pin in enumerate(spec["calls"]) if lineage.GROUPS in pin["path"]][-1]
        del spec["calls"][cold]
        with self.assertRaisesRegex(ValueError, "call chain order differs"):
            lineage.verify(spec)


if __name__ == "__main__":
    unittest.main()
