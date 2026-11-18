"""Exercise private preparation and guarded replay with synthetic artifacts."""

from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

import native_top_group_replay as replay


SESSION = "2026-11-18T12:23:45.1234567Z"
HOST = {"plugin": "VRoidMcpBridge 0.15.0", "unity": "6000.0.62f1"}
TARGET = {"id": "synthetic-top.transferablegroup", "type": replay.TOPS, "resource": "test/tops"}
BOTTOM = {"id": "synthetic-bottom.transferablegroup",
          "type": "TransferableGroupType.N00.Level1.Bottoms", "resource": "test/bottoms"}
EXPORT = {**dict.fromkeys(replay.runner.EXPORT_SETTINGS, 0), "delete_transparent": False,
          "title": "Replay test", "author": "Fixture", "model_version": "v1", "version": "1", "leave": True}
SETTINGS = {**{field: EXPORT[k] for k, field in replay.runner.EXPORT_SETTINGS.items()},
            "hairCrossSection": False, "combineHair": True, "atlasResolution": 0}


def status(path=None, *, session=SESSION, dirty=False):
    return {**HOST, "startedUtc": session, "currentFile": str(path) if path else None,
            "modelType": "N00" if path else None, "modelOpen": path is not None,
            "dirty": dirty, "ready": path is not None, "isEditing": path is not None}


def vrm_fixture():
    meta = {"name": EXPORT["title"], "authors": [EXPORT["author"]], "version": EXPORT["model_version"],
            "avatarPermission": "onlyAuthor", "allowRedistribution": False, "modification": "prohibited"}
    raw = json.dumps({"extensions": {"VRMC_vrm": {"meta": meta}}}).encode("utf-8")
    raw += b" " * (-len(raw) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, 20 + len(raw), len(raw), 0x4E4F534A) + raw


class SimulatedBridge:
    def __init__(self, source_vrm, fault=None):
        self.source_vrm = source_vrm
        self.fault = fault
        self.calls = []
        self.groups = [TARGET, BOTTOM]
        self.current = source_vrm.with_name("protected.vroid") if fault == "busy" else None
        self.dirty = False

    def __call__(self, tool, args, directory, step):
        self.calls.append(tool)
        if tool == "vroid_status":
            session = SESSION if self.fault != "other-session" else "different"
            return status(self.current, session=session, dirty=self.dirty)
        if tool == "vroid_open":
            self.current = Path(args["path"])
            self.current.read_bytes()
        elif tool == "vroid_list_groups":
            return deepcopy(self.groups)
        elif tool == "vroid_remove_item":
            if args != {"group": TARGET["id"]}:
                raise AssertionError("Unexpected removal request")
            self.dirty = True
            self.groups = [] if self.fault == "extra-removal" else [BOTTOM]
            return {"ok": True, "removed": [TARGET["id"]]}
        elif tool == "vroid_save":
            self.current = Path(args["path"])
            self.current.write_bytes(b"Synthetic saved source")
            self.dirty = False
        elif tool == "vroid_main_menu":
            self.current = None
        elif tool == "vroid_export_vrm_options":
            return {"exportScreenOpen": True, "settings": SETTINGS}
        elif tool == "vroid_export_vrm":
            path = Path(args["path"])
            shutil.copyfile(self.source_vrm, path)
            options = {**SETTINGS, "meshErasure": True} if self.fault == "settings-drift" else SETTINGS
            return {"ok": True, "warnings": [], "version": "1.0", "leftExportScreen": True,
                    "path": str(path), "bytes": path.stat().st_size, "settings": options}
        return {"ok": True}


class NativeTopGroupReplayTests(unittest.TestCase):
    def setUp(self):
        replay.checked_batch(replay.OUTPUT_PARENT / "test-location")
        replay.OUTPUT_PARENT.mkdir(exist_ok=True)
        area = tempfile.TemporaryDirectory(prefix="top-group-test-", dir=replay.OUTPUT_PARENT)
        self.addCleanup(area.cleanup)
        self.root = Path(area.name)
        self.batch = self.root / "another-role"
        self.vroid = self.root / "test.vroid"
        self.vroid.write_bytes(b"Synthetic editable bytes")
        self.vrm = self.root / "test.vrm"
        self.vrm.write_bytes(vrm_fixture())
        self.cold = self.root / "cold.json"
        replay.runner.write(self.cold, {"status": status(self.vroid), "groups": [TARGET, BOTTOM]})
        self.provenance = self.root / "production.json"
        source = replay.artifact(self.vroid)
        body = replay.artifact(self.vrm)
        replay.runner.write(self.provenance, {
            "completed": True, "app": "VRoid Studio 2.16.0", "bridge": "mcjo79/vroid-mcp 0.15.0",
            "sourcePath": str(self.vroid), "sourceSha256": source["sha256"], "sourceBytes": source["bytes"],
            "modelPath": str(self.vrm), "sha256": body["sha256"], "modelBytes": body["bytes"],
            "exportSettings": EXPORT,
            "exportReply": {"ok": True, "warnings": [], "version": "1.0", "leftExportScreen": True,
                            "path": str(self.vrm), "bytes": body["bytes"], "settings": SETTINGS},
        })
        self.request = replay.prepare(self.batch, self.vroid, self.vrm, self.cold, self.provenance)
        self.sha = replay.artifact(self.request)["sha256"]
        self.req = replay.load_request(self.request, self.sha, self.batch)

    def run_replay(self, fake, out=None):
        return replay.run(self.req, self.request, self.sha, out or self.batch / "run-new",
                          SESSION, fake, batch_output=self.batch)

    def test_preparation_is_path_independent(self):
        next_batch = self.root / "next-role"
        path = replay.prepare(next_batch, self.vroid, self.vrm, self.cold, self.provenance)
        self.assertEqual(path.read_bytes(), self.request.read_bytes())
        self.assertEqual(replay.load_request(path, self.sha, next_batch), self.req)
        self.assertFalse((next_batch / "runs").exists())

    def test_prepare_retry_reuses_identical_and_preserves_conflict(self):
        original = self.request.read_bytes()
        self.assertEqual(self.request, replay.prepare(self.batch, self.vroid, self.vrm, self.cold, self.provenance))
        copied = self.request.parent / self.vroid.name
        copied.write_bytes(b"changed private copy")
        with self.assertRaisesRegex(ValueError, "Existing package differs"):
            replay.prepare(self.batch, self.vroid, self.vrm, self.cold, self.provenance)
        self.assertEqual(copied.read_bytes(), b"changed private copy")
        self.assertEqual(self.request.read_bytes(), original)

    def test_one_removal_and_export_leave_proof_pending(self):
        fake = SimulatedBridge(self.vrm)
        report = self.run_replay(fake)
        self.assertEqual(report["state"], "exported-pending-geometry-and-mask-readback")
        self.assertTrue(report["mainMenuRestored"])
        self.assertFalse(report["ownershipProven"])
        self.assertFalse(report["donorApproved"])
        self.assertEqual(fake.calls.count("vroid_remove_item"), 1)
        self.assertEqual(fake.calls.count("vroid_export_vrm"), 1)

    def test_other_session_refuses_to_touch_any_model(self):
        fake = SimulatedBridge(self.vrm, "other-session")
        report = self.run_replay(fake)
        self.assertEqual(report["state"], "failed")
        self.assertIn("session or version", report["failure"])
        self.assertEqual(fake.calls, ["vroid_status"])

    def test_an_open_document_refuses_mutations(self):
        fake = SimulatedBridge(self.vrm, "busy")
        report = self.run_replay(fake)
        self.assertIn("main menu", report["failure"])
        self.assertEqual(fake.calls, ["vroid_status"])

    def test_extra_removal_recovers_without_export(self):
        fake = SimulatedBridge(self.vrm, "extra-removal")
        report = self.run_replay(fake)
        self.assertEqual(report["state"], "failed")
        self.assertIn("immediate group change", report["failure"])
        self.assertTrue(report["mainMenuRestored"])
        self.assertNotIn("vroid_export_vrm", fake.calls)

    def test_changed_export_settings_refuse_receipt(self):
        report = self.run_replay(SimulatedBridge(self.vrm, "settings-drift"))
        self.assertEqual(report["state"], "failed")
        self.assertIn("Export settings differ", report["failure"])
        self.assertTrue(report["mainMenuRestored"])

    def test_wrong_original_source_refuses_preparation_without_writes(self):
        self.vroid.write_bytes(b"Different editable source")
        next_batch = self.root / "bad-input"
        with self.assertRaisesRegex(ValueError, "differs from production evidence"):
            replay.prepare(next_batch, self.vroid, self.vrm, self.cold, self.provenance)
        self.assertFalse(next_batch.exists())

    def test_changed_original_export_settings_refuse_preparation(self):
        evidence = json.loads(self.provenance.read_bytes())
        evidence["exportReply"]["settings"]["meshErasure"] = True
        self.provenance.unlink()
        replay.runner.write(self.provenance, evidence)
        next_batch = self.root / "bad-export"
        with self.assertRaisesRegex(ValueError, "Original export request and applied settings differ"):
            replay.prepare(next_batch, self.vroid, self.vrm, self.cold, self.provenance)
        self.assertFalse(next_batch.exists())

    def test_wrong_prepared_source_refuses_run_before_writing(self):
        (self.request.parent / self.req["editable"]["path"]).write_bytes(b"Changed after preparation")
        fake = SimulatedBridge(self.vrm)
        with self.assertRaisesRegex(ValueError, "Source identity mismatch"):
            self.run_replay(fake)
        self.assertFalse((self.batch / "run-new").exists())
        self.assertEqual(fake.calls, [])

    def test_outside_batch_refuses_run_before_writing(self):
        fake = SimulatedBridge(self.vrm)
        target = self.batch / ".." / "outside-batch"
        with self.assertRaisesRegex(ValueError, "Path outside private output"):
            self.run_replay(fake, target)
        self.assertFalse(target.exists())
        self.assertEqual(fake.calls, [])

    def test_project_root_and_output_root_are_not_batches(self):
        for target in (replay.runner.ROOT, replay.OUTPUT_PARENT, replay.runner.ROOT / "scripts"):
            with self.subTest(target=target), self.assertRaisesRegex(ValueError, "Batch root"):
                replay.prepare(target, self.vroid, self.vrm, self.cold, self.provenance)

    def test_link_outside_batch_refuses_run_before_writing(self):
        out = self.root / "another-batch"
        out.mkdir()
        link = self.batch / "redirect"
        if os.name == "nt":
            subprocess.run([
                "powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                "$ErrorActionPreference = 'Stop'; New-Item -ItemType Junction "
                "-Path $env:VROID_TEST_LINK -Target $env:VROID_TEST_LINK_TARGET | Out-Null",
            ], env={**os.environ, "VROID_TEST_LINK": str(link), "VROID_TEST_LINK_TARGET": str(out)},
               capture_output=True, check=True)
        else:
            link.symlink_to(out, target_is_directory=True)
        fake = SimulatedBridge(self.vrm)
        with self.assertRaisesRegex(ValueError, "Path outside private output"):
            self.run_replay(fake, link / "run-escape")
        self.assertFalse((out / "run-escape").exists())
        self.assertEqual(fake.calls, [])


if __name__ == "__main__":
    unittest.main()
