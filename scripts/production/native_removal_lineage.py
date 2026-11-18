"""Verify the archived author-side lineage of one native Tops group removal."""

from dataclasses import dataclass
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import struct

import native_top_group_replay as replay


FUSION = "fusion-donor-v1"
REPLAY = replay.SCHEMA
CORE = ("originalEditable", "originalVrm", "originalProvenance", "originalColdReadback",
        "untouchedCopy", "removedEditable", "removedVrm", "removalReceipt")
STATUS = "vroid_status"
OPEN = "vroid_open"
GROUPS = "vroid_list_groups"
REMOVE = "vroid_remove_item"
SAVE = "vroid_save"
MENU = "vroid_main_menu"
OPTIONS = "vroid_export_vrm_options"
EXPORT = "vroid_export_vrm"
require = replay.runner.require


def pinned(pin, label, base=None):
    require(isinstance(pin, dict) and isinstance(pin.get("sha256"), str)
            and re.fullmatch("[0-9a-f]{64}", pin["sha256"]) and pin.get("path"), f"Missing fixed SHA/path: {label}")
    path = Path(pin["path"])
    if base is not None and not path.is_absolute():
        path = base / path
    data = path.read_bytes()
    require(replay.runner.sha(data) == pin["sha256"], f"Pinned bytes differ: {label}")
    if "bytes" in pin:
        require(pin["bytes"] == len(data), f"Pinned length differs: {label}")
    return data


def label_path(value):
    # This is a label from the historical session, never a locator for current input bytes.
    require(isinstance(value, str) and value, "Missing historical document label")
    path = PureWindowsPath(value)
    return path if path.drive or "\\" in value else PurePosixPath(value)


def claim_matches(pin, identity):
    return all(pin[k] == identity[k] for k in ("sha256", "bytes"))


@dataclass(frozen=True)
class Call:
    name: str
    args: dict
    payload: object


def call_chain(spec, name):
    pins = spec.get(name, [])
    base = None
    if isinstance(pins, dict):
        base = Path(pins["path"]).parent
        pins = json.loads(pinned(pins, name))["calls"]
    require(isinstance(pins, list), f"Expected an ordered pin array: {name}")
    calls = []
    for index, pin in enumerate(pins, 1):
        record = json.loads(pinned(pin, f"{name}[{index}]", base))
        request = record["request"]
        require(request["method"] == "tools/call" and record["ok"] is True
                and record["exitCode"] == 0 and record["failures"] == [], f"Failed or invalid native call: {name}[{index}]")
        wire = "\n".join(json.dumps(r) for r in record["responses"]).encode("utf-8")
        _, failures = replay.runner.bridge.inspect_responses(wire, request)
        require(not failures, f"Invalid JSON-RPC reply: {name}[{index}]")
        payload = replay.runner.embedded(record)
        call = request["params"]
        require(isinstance(call["arguments"], dict), f"Invalid native call arguments: {name}[{index}]")
        calls.append(Call(call["name"], call["arguments"], payload))
    return calls


def group_rows(groups):
    return replay.groups_by_id(groups)


def status_matches(payload, host, doc, dirty=False):
    if any(payload.get(key) != val for key, val in host.items()):
        return False
    if doc is None:
        return replay.runner.is_home(payload)
    return (payload.get("currentFile") and label_path(payload["currentFile"]) == doc
            and payload.get("ready") is True and payload.get("dirty") is dirty
            and payload.get("modelOpen") is True and payload.get("isEditing") is True
            and payload.get("modelType") == "N00")


def status_between(calls, start, end, host, doc):
    observed = [c.payload for c in calls[start:end] if c.name == STATUS]
    require(observed and status_matches(observed[-1], host, doc),
            "Missing clean native status in the expected phase")


def successful_document_call(call, doc):
    require(label_path(call.args["path"]) == doc and call.payload.get("ok") is True
            and label_path(call.payload["path"]) == doc, f"Native request/reply labels differ: {call.name}")


def verify_original_calls(calls, source, cold, fields):
    phases = [(i, c) for i, c in enumerate(calls) if c.name != STATUS]
    require([c.name for _, c in phases] == [OPEN, GROUPS, EXPORT], "Original call chain order differs")
    (opened_at, opened), (groups_at, groups), (_, exported) = phases
    doc = label_path(source["sourcePath"])
    successful_document_call(opened, doc)
    host = {**fields["bridge"], "startedUtc": cold["status"]["startedUtc"]}
    require(host["startedUtc"] and all(all(c.payload.get(key) == val for key, val in host.items())
                                      for c in calls if c.name == STATUS), "Original native call chain changed host or session")
    status_between(calls, opened_at + 1, groups_at, host, doc)
    require(group_rows(groups.payload) == group_rows(fields["beforeGroups"]), "Original live groups differ")
    expected_args = {**source["exportSettings"], "path": source["modelPath"]}
    require(exported.args == expected_args and exported.payload == source["exportReply"], "Original live export differs")


def verify_removal_calls(calls, mode, fields, before, after, removal, export, export_args,
                         removed_doc=None, reference_doc=None):
    phases = [(i, c) for i, c in enumerate(calls) if c.name != STATUS]
    names = [c.name for _, c in phases]
    expected_core = [OPEN, GROUPS, REMOVE, GROUPS, SAVE, MENU, OPEN]
    has_cold_groups = mode == REPLAY or names[len(expected_core):len(expected_core) + 1] == [GROUPS]
    if has_cold_groups:
        expected_core.append(GROUPS)
    if mode == REPLAY:
        expected_core.append(OPTIONS)
    expected_core += [EXPORT, MENU]
    require(names == expected_core, "Removal call chain order differs")
    (opened_at, opened), (before_at, live_before), (_, live_remove), (_, live_after), (saved_at, saved), (
        menu_at, menu), (reopened_at, reopened) = phases[:7]
    tail = phases[7:]
    (_, exported), (closed_at, closed) = tail[-2:]
    work = label_path(opened.args["path"])
    candidate = label_path(saved.args["path"])
    vrm = label_path(exported.args["path"])
    require(work.name == "untouched-source-copy.vroid" and work != candidate and vrm != candidate,
            "Unexpected native working copy labels")
    if removed_doc is not None:
        require(candidate == removed_doc and vrm == reference_doc, "Archived output labels differ from receipt")
    if mode == REPLAY:
        require(candidate.name == "tops-removed.vroid" and vrm.name == "tops-removed.vrm"
                and work.parent == candidate.parent == vrm.parent, "Replay output labels differ")
    for call, doc in ((opened, work), (saved, candidate), (reopened, candidate), (exported, vrm)):
        successful_document_call(call, doc)
    require(menu.payload.get("ok") is True and closed.payload.get("ok") is True, "Native main-menu operation failed")
    statuses = [c.payload for c in calls if c.name == STATUS]
    require(statuses and statuses[0].get("startedUtc"), "Missing recorded native session")
    host = {**fields["bridge"], "startedUtc": statuses[0]["startedUtc"]}
    require(all(all(s.get(k) == v for k, v in host.items()) for s in statuses), "Native call chain changed host or session")
    status_between(calls, 0, opened_at, host, None)
    status_between(calls, opened_at + 1, before_at, host, work)
    status_between(calls, saved_at + 1, menu_at, host, candidate)
    first_after_reopen = tail[0][0]
    status_between(calls, reopened_at + 1, first_after_reopen, host, candidate)
    if mode == REPLAY:
        status_between(calls, closed_at + 1, len(calls), host, None)
    require(group_rows(live_before.payload) == before and group_rows(live_after.payload) == after,
            "Native before/after groups differ")
    require(live_remove.args == {"group": fields["removeGroup"]["id"]} and live_remove.payload == removal,
            "Native removal request/reply differs")
    if has_cold_groups:
        _, cold_groups = tail[0]
        require(group_rows(cold_groups.payload) == after, "Native cold-reopen groups differ")
    options = None
    if mode == REPLAY:
        _, options = tail[1]
        require(options.args == {"leave": False} and options.payload.get("exportScreenOpen") is True,
                "No recorded native export preparation")
    require(exported.args == {**export_args, "path": export["path"]} and exported.payload == export,
            "Native reference export request/reply differs")
    return {"coldGroupReadback": has_cold_groups, "options": options.payload if options else None}


def export_check(export, meta, wanted, identity):
    require(export.get("ok") is True and export.get("warnings") == [] and export.get("version") == "1.0"
            and export.get("leftExportScreen") is True and export.get("bytes") == identity["bytes"],
            "Reference VRM export receipt differs")
    settings = export["settings"]
    require(all(settings.get(k) == v for k, v in wanted.items()), "Reference VRM applied export settings differ")
    require(settings.get("vrm1Meta") == {"name": meta["name"], "version": meta["version"],
                                        "authors": ", ".join(meta["authors"])}, "Reference VRM export metadata differs")


def verify(spec):
    """Read fixed input pins and return verification flags. Inconsistency raises ValueError.

    Each path/SHA pin is supplied by the caller. Call arrays are in execution order;
    a pinned JSON object with a 'calls' array is also accepted. In an external index,
    relative call paths are anchored beside the index.
    """
    try:
        return _verify(spec)
    except (OSError, KeyError, IndexError, TypeError, AttributeError, struct.error) as exc:
        raise ValueError(f"Invalid native removal lineage input: {exc}") from exc


def _verify(spec):
    mode = spec["format"]
    require(mode in (FUSION, REPLAY), "Unsupported native removal receipt format")
    blobs = {k: pinned(spec[k], k) for k in CORE}
    identities = {k: {"sha256": spec[k]["sha256"], "bytes": len(raw)} for k, raw in blobs.items()}
    original, reference = identities["originalVrm"], identities["removedVrm"]
    editable, copy, removed = (identities[k] for k in ("originalEditable", "untouchedCopy", "removedEditable"))
    require(editable == copy and removed != editable and reference != original, "Edit/source copy or distinct reference hashes differ")
    base_meta = replay.vrm_meta(blobs["originalVrm"])
    ref_meta = replay.vrm_meta(blobs["removedVrm"])
    source = json.loads(blobs["originalProvenance"])
    cold = json.loads(blobs["originalColdReadback"])
    fields = replay.evidence_fields(editable, original, base_meta, cold, source)
    if "exportedRightsMetadata" in source:
        require(source["exportedRightsMetadata"] == base_meta, "Original recorded VRM metadata differs")
    target = fields["removeGroup"]
    group_id = target["id"]
    before = group_rows(fields["beforeGroups"])
    after = {key: value for key, value in before.items() if key != group_id}
    settings = {name: fields["export"][key] for key, name in replay.runner.EXPORT_SETTINGS.items()}
    settings.update(fields["preservedSettings"])
    title = base_meta["name"] + " coverage reference" if mode == FUSION else base_meta["name"]
    require(replay.rights(ref_meta) == {**fields["rights"], "name": title}, "Reference VRM metadata or rights differ")
    receipt = json.loads(blobs["removalReceipt"])
    originals = call_chain(spec, "originalCalls")
    if originals:
        verify_original_calls(originals, source, cold, fields)
    calls = call_chain(spec, "calls")
    removal = receipt["removeReply"] if mode == FUSION else receipt["removal"]
    require(removal.get("ok") is True and removal["removed"] == [group_id], "Receipt does not remove exactly the fixed group")
    if mode == FUSION:
        require(receipt["role"] == source["id"] and receipt["singleChange"] == target
                and receipt["originalSha256"] == receipt["copySha256"] == editable["sha256"]
                and receipt["sourceSha256"] == removed["sha256"] and receipt["vrmSha256"] == reference["sha256"],
                "Fusion receipt source, group or reference identity differs")
        require(group_rows(receipt["before"]) == before and group_rows(receipt["after"]) == after,
                "Fusion receipt group inventories differ")
        exported = receipt["export"]
        require(label_path(exported["path"]) == label_path(receipt["vrm"]), "Fusion receipt export labels differ")
        export_check(exported, ref_meta, settings, reference)
        result = (verify_removal_calls(calls, mode, fields, before, after, removal, exported,
                                      {**source["exportSettings"], "title": title},
                                      label_path(receipt["source"]), label_path(receipt["vrm"])) if calls else None)
    else:
        request = json.loads(pinned(spec["replayRequest"], "replayRequest"))
        replay.validate_request(request)
        require(receipt["schema"] == REPLAY and receipt["state"] == "exported-pending-geometry-and-mask-readback"
                and receipt["mainMenuRestored"] is True and receipt["requestSha256"] == spec["replayRequest"]["sha256"]
                and claim_matches(receipt["editable"], removed) and claim_matches(receipt["exported"], reference)
                and receipt["editable"]["path"] == "tops-removed.vroid" and receipt["exported"]["path"] == "tops-removed.vrm"
                and receipt["beforeGroups"] == len(before) and receipt["afterGroups"] == len(after),
                "Replay result does not bind the request and both reference artifact hashes")
        require(claim_matches(request["editable"], editable) and claim_matches(request["baseline"], original)
                and claim_matches(request["sourceReadbacks"]["native-readback.json"], identities["originalColdReadback"])
                and claim_matches(request["sourceReadbacks"]["provenance.json"], identities["originalProvenance"])
                and all(request[k] == v for k, v in fields.items()), "Replay request original inputs differ")
        exports = [c.payload for c in calls if c.name == EXPORT]
        require(len(exports) == 1, "Replay requires one pinned export call")
        export_check(exports[0], ref_meta, settings, reference)
        expected = {**fields["export"], **{key: settings[name] for key, name in replay.ADDITIONAL_EXPORT_SETTINGS.items()}}
        result = verify_removal_calls(calls, mode, fields, before, after, removal, exports[0], expected)
        require(receipt["exportSettings"] == exports[0]["settings"]
                and receipt["preparedSettings"] == result["options"]["settings"], "Replay reported export settings differ")
    limitations = []
    if not originals:
        limitations.append("original-call-chain-not-supplied")
    if result is None:
        limitations.append("removal-call-chain-not-supplied")
    cold_groups = result is not None and result["coldGroupReadback"]
    if not cold_groups:
        limitations.append("cold-group-readback-not-recorded")
    return {"schema": "native-removal-lineage-v1", "format": mode,
            "status": "incomplete" if result is None else "verified-with-limitations" if limitations else "verified",
            "groupId": group_id, "sourceSha256": original["sha256"], "referenceSha256": reference["sha256"],
            "originalEditableSha256": editable["sha256"], "referenceEditableSha256": removed["sha256"],
            "receiptGroupDeltaVerified": True, "singleRemovalVerified": result is not None,
            "coldReopenVerified": result is not None, "coldGroupReadback": cold_groups,
            "originalCallChainVerified": bool(originals), "limitations": limitations}
