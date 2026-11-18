"""Replay one pinned native Tops removal in an operator-owned VRoid session."""

import argparse
import json
import os
from pathlib import Path
import re
import struct
from tempfile import TemporaryDirectory

from native_authoring import runner
from native_import import exact_directory
from production_paths import main_checkout, resolve_output_path


OUTPUT_PARENT = main_checkout(__file__) / "output"
OUTPUT = OUTPUT_PARENT / "native-group-13"
SCHEMA = "native-top-group-replay-v1"
TOPS = "TransferableGroupType.N00.Level1.Tops"
STATUS = "vroid_status"
CHANGES = {"vroid_open", "vroid_remove_item", "vroid_save", "vroid_main_menu",
           "vroid_export_vrm_options", "vroid_export_vrm"}
ADDITIONAL_EXPORT_SETTINGS = {"hair_cross_section": "hairCrossSection",
                              "combine_hair": "combineHair", "atlas_resolution": "atlasResolution"}
EXPORT_METADATA = {"version", "leave", "title", "model_version", "author"}


def checked_batch(path):
    parent = OUTPUT_PARENT.resolve()
    root = resolve_output_path(path)
    runner.require(parent == OUTPUT_PARENT and root != parent and root.is_relative_to(parent),
                   "Batch root must be inside the project's private output directory")
    return root


def private_path(path, batch_output=OUTPUT):
    root = checked_batch(batch_output)
    resolved = resolve_output_path(path)
    runner.require(resolved != root and resolved.is_relative_to(root), "Path outside private output")
    return resolved


def pin_bytes(name, data):
    return {"path": name, "sha256": runner.sha(data), "bytes": len(data)}


def artifact(path):
    return pin_bytes(path.name, path.read_bytes())


def vrm_meta(raw):
    magic, version, size, length, kind = struct.unpack_from("<4sIIII", raw)
    runner.require((magic, version, size, kind) == (b"glTF", 2, len(raw), 0x4E4F534A)
                   and 0 < length <= len(raw) - 20, "Invalid export GLB")
    return json.loads(raw[20:20 + length])["extensions"]["VRMC_vrm"]["meta"]


def groups_by_id(groups):
    rows = {g["id"]: g for g in groups}
    runner.require(len(rows) == len(groups), "Duplicate native group ID")
    return rows


def evidence_fields(editable, baseline, vrm, cold, source):
    status = cold["status"]
    runner.require(source.get("completed") is True and source["app"] == "VRoid Studio 2.16.0"
                   and source["bridge"] == "mcjo79/vroid-mcp 0.15.0", "Unsupported native production evidence")
    runner.require((editable["sha256"], editable["bytes"]) == (source["sourceSha256"], source["sourceBytes"])
                   and (baseline["sha256"], baseline["bytes"]) == (source["sha256"], source["modelBytes"]),
                   "Source or baseline VRM differs from production evidence")
    runner.require(status.get("currentFile") and Path(status["currentFile"]) == Path(source["sourcePath"])
                   and status.get("ready") is True and status.get("dirty") is False
                   and status.get("modelOpen") is True and status.get("isEditing") is True
                   and status.get("modelType") == "N00", "Cold readback is not the exact clean production source")
    bridge = {k: status[k] for k in ("plugin", "unity")}
    runner.require(bridge == {"plugin": "VRoidMcpBridge 0.15.0", "unity": "6000.0.62f1"},
                   "Unsupported native host")
    groups = groups_by_id(cold["groups"])
    tops = [g for g in groups.values() if g["type"] == TOPS]
    runner.require(len(tops) == 1, "Cold readback must contain one exact native N00 Tops group")
    reply = source["exportReply"]
    runner.require(reply.get("ok") is True and reply.get("warnings") == []
                   and reply.get("version") == "1.0" and reply.get("leftExportScreen") is True
                   and reply.get("bytes") == baseline["bytes"] and Path(reply["path"]) == Path(source["modelPath"]),
                   "Original export receipt differs from the baseline VRM")
    settings = reply["settings"]
    args = source["exportSettings"]
    setting_names = {**runner.EXPORT_SETTINGS, **ADDITIONAL_EXPORT_SETTINGS}
    runner.require(set(args) <= set(setting_names) | EXPORT_METADATA | {"path"}
                   and ("path" not in args or Path(args["path"]) == Path(source["modelPath"])),
                   "Unsupported original export request")
    runner.require(all(settings[field] == args[key] for key, field in setting_names.items() if key in args),
                   "Original export request and applied settings differ")
    export = {key: value for key, value in args.items() if key not in ADDITIONAL_EXPORT_SETTINGS and key != "path"}
    export.update({key: settings[field] for key, field in runner.EXPORT_SETTINGS.items()})
    runner.require(all(vrm[k] == value for k, value in (
        ("name", export["title"]), ("version", export["model_version"]), ("authors", [export["author"]]))),
        "Original export metadata differs from baseline VRM")
    return {"bridge": bridge, "beforeGroups": cold["groups"], "removeGroup": tops[0], "export": export,
            "preservedSettings": {k: settings[k] for k in ADDITIONAL_EXPORT_SETTINGS.values()}, "rights": rights(vrm)}


def validate_request(req):
    runner.require(req["schema"] == SCHEMA, "Invalid native replay request schema")
    groups = groups_by_id(req["beforeGroups"])
    runner.require([g for g in groups.values() if g["type"] == TOPS] == [req["removeGroup"]],
                   "Request needs one exact native N00 Tops group")
    settings = req["export"]
    runner.require(set(settings) == set(runner.EXPORT_SETTINGS) | EXPORT_METADATA
                   and settings["version"] == "1" and settings["leave"] is True
                   and settings["delete_transparent"] is False and settings["material_mode"] == 0
                   and settings["texture_mode"] == 0, "Invalid replay export settings")
    runner.require(set(req["preservedSettings"]) == set(ADDITIONAL_EXPORT_SETTINGS.values()),
                   "Incomplete original secondary export settings")


def dependency(path, pin, suffix, batch_output):
    filename = Path(pin["path"])
    runner.require(filename.name == pin["path"] and filename.suffix.lower() == suffix, "Invalid source filename")
    actual = private_path(path.parent / filename, batch_output)
    raw = actual.read_bytes()
    runner.require(pin_bytes(actual.name, raw) == pin, "Source identity mismatch: " + filename.name)
    return raw


def load_request(path, request_sha, batch_output=OUTPUT):
    path = private_path(path, batch_output)
    raw = path.read_bytes()
    runner.require(runner.sha(raw) == request_sha, "Request SHA mismatch")
    req = json.loads(raw)
    validate_request(req)
    dependency(path, req["editable"], ".vroid", batch_output)
    baseline = dependency(path, req["baseline"], ".vrm", batch_output)
    evidence = {name: dependency(path, pin, ".json", batch_output) for name, pin in req["sourceReadbacks"].items()}
    fields = evidence_fields(req["editable"], req["baseline"], vrm_meta(baseline),
                             json.loads(evidence["native-readback.json"]), json.loads(evidence["provenance.json"]))
    runner.require(all(req[key] == value for key, value in fields.items()), "Pinned production readback differs")
    return req


def rights(meta):
    return {key: value for key, value in meta.items() if key != "thumbnailImage"}


def prepare(batch_output, editable, baseline, cold_readback, provenance, recipe=None):
    root = checked_batch(batch_output)
    directory = private_path(root / "prepared", root)
    runner.require(editable.suffix.lower() == ".vroid" and baseline.suffix.lower() == ".vrm",
                   "Expected an original .vroid and .vrm")
    source = {editable.name: editable.read_bytes(), baseline.name: baseline.read_bytes()}
    evidence = {"native-readback.json": cold_readback.read_bytes()}
    if recipe is not None:
        evidence["recipe.json"] = recipe.read_bytes()
    evidence["provenance.json"] = provenance.read_bytes()
    request = {
        "schema": SCHEMA,
        "editable": pin_bytes(editable.name, source[editable.name]),
        "baseline": pin_bytes(baseline.name, source[baseline.name]),
        "sourceReadbacks": {name: pin_bytes(name, data) for name, data in evidence.items()},
    }
    request.update(evidence_fields(request["editable"], request["baseline"], vrm_meta(source[baseline.name]),
                                   json.loads(evidence["native-readback.json"]), json.loads(evidence["provenance.json"])))
    validate_request(request)
    files = {**source, **evidence, "request.json": (json.dumps(request, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()}
    for name in files:
        private_path(directory / name, root)
    if directory.exists():
        exact_directory(directory, files)
        return directory / "request.json"
    root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=root, prefix=".prepare-") as tmp:
        stage = Path(tmp) / "prepared"
        stage.mkdir()
        for name, data in files.items():
            (stage / name).write_bytes(data)
        try:
            stage.rename(directory)
        except FileExistsError:
            exact_directory(directory, files)
    return directory / "request.json"


def run(req, request_path, request_sha, out, started_utc, transport=runner.live_transport, *, batch_output=OUTPUT):
    out = private_path(out, batch_output)
    request_path = private_path(request_path, batch_output)
    runner.require(isinstance(started_utc, str)
                   and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z", started_utc),
                   "Supply the operator-approved session startedUtc")
    runner.require(load_request(request_path, request_sha, batch_output) == req,
                   "Supplied request differs from the pinned request")
    out.mkdir(exist_ok=False)
    directory = out / "calls"
    directory.mkdir()
    cache = out / "mcp-cache"
    cache.mkdir()
    cache_env = {
        "VROID_PRESET_CACHE": str(cache / "presets"),
        "VROID_FRAMING_CONFIG": str(cache / "framing.json"),
        "VROID_FRAMING_OVERRIDES": str(cache / "framing-overrides.json"),
        "TEMP": str(cache),
        "TMP": str(cache),
    }
    sequence = 0

    def send(tool, args):
        nonlocal sequence
        sequence += 1
        previous = {key: os.environ.get(key) for key in cache_env}
        os.environ.update(cache_env)
        try:
            return transport(tool, args, directory, f"{sequence:04d}-{tool}")
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def status():
        observed = send(STATUS, {})
        runner.require(observed.get("startedUtc") == started_utc
                       and all(observed.get(key) == v for key, v in req["bridge"].items()),
                       "VRoid Bridge session or version differs from the operator's target")
        return observed

    work = out / "untouched-source-copy.vroid"
    candidate = out / "tops-removed.vroid"
    exported = out / "tops-removed.vrm"
    failure_path = out / "failure-state.vroid"

    def call(tool, args=None):
        if tool == STATUS:
            return status()
        if tool in CHANGES:
            observed = status()
            if tool == "vroid_open":
                runner.require(runner.is_home(observed), "Open requires the isolated session at its main menu")
            else:
                current = observed.get("currentFile")
                runner.require(current and Path(current).resolve() in {work, candidate, failure_path},
                               "Refusing to change a document outside this replay")
        return send(tool, args or {})

    report = {"schema": SCHEMA, "requestSha256": request_sha, "state": "failed",
              "mainMenuRestored": False, "ownershipProven": False, "donorApproved": False}
    entered = export_started = False
    try:
        runner.require(runner.is_home(status()), "The isolated VRoid session must start at its main menu")
        entered = True
        source = request_path.parent / req["editable"]["path"]
        data = source.read_bytes()
        runner.require(runner.sha(data) == req["editable"]["sha256"], "Source changed before copy")
        with work.open("xb") as stream:
            stream.write(data)
        runner.require(artifact(work)["sha256"] == req["editable"]["sha256"], "Working copy SHA differs")
        call("vroid_open", {"path": str(work)})
        runner.require(runner.get_entry(status()) == work, "Wrong open document")
        before = groups_by_id(call("vroid_list_groups"))
        runner.require(before == groups_by_id(req["beforeGroups"]), "Live source groups differ from the pinned readback")
        target = req["removeGroup"]["id"]
        removed = call("vroid_remove_item", {"group": target})
        runner.require(removed.get("ok") is True and removed.get("removed") == [target], "Unexpected group removal reply")
        remaining = {key: row for key, row in before.items() if key != target}
        runner.require(groups_by_id(call("vroid_list_groups")) == remaining, "Unexpected immediate group change")
        call("vroid_save", {"path": str(candidate)})
        runner.require(runner.get_entry(status()) == candidate, "Wrong saved document")
        saved = artifact(candidate)
        call("vroid_main_menu")
        call("vroid_open", {"path": str(candidate)})
        runner.require(runner.get_entry(status()) == candidate and artifact(candidate) == saved, "Cold-open document differs")
        runner.require(groups_by_id(call("vroid_list_groups")) == remaining, "Unexpected cold-open group change")
        export_started = True
        prepared = runner.export_options(call, False)
        export = req["export"]
        other = {k: req["preservedSettings"][v] for k, v in ADDITIONAL_EXPORT_SETTINGS.items()}
        result = call("vroid_export_vrm", {**export, **other, "path": str(exported)})
        runner.require(result.get("ok") is True and result.get("warnings") == []
                       and result.get("version") == "1.0" and result.get("leftExportScreen") is True
                       and Path(result["path"]).resolve() == exported, "Unexpected native export reply")
        expected_settings = {value: export[key] for key, value in runner.EXPORT_SETTINGS.items()}
        expected_settings.update(req["preservedSettings"])
        runner.require(all(result["settings"].get(k) == v for k, v in expected_settings.items()),
                       "Export settings differ from the original")
        output = artifact(exported)
        runner.require(output["bytes"] == result["bytes"] and rights(vrm_meta(exported.read_bytes())) == req["rights"],
                       "Exported bytes or VRM terms differ from the authorized input contract")
        runner.require(artifact(work)["sha256"] == req["editable"]["sha256"], "Untouched copy changed")
        runner.require(load_request(request_path, request_sha, batch_output) == req, "Prepared inputs changed")
        report.update(state="exported-pending-geometry-and-mask-readback", beforeGroups=len(before),
                      afterGroups=len(remaining), removal=removed, editable=saved, exported=output,
                      preparedSettings=prepared["settings"], exportSettings=result["settings"])
    except Exception as exc:
        report["failure"] = str(exc)
    finally:
        try:
            if entered:
                runner.restore(call, None, None, {work, candidate}, failure_path,
                               candidate if export_started else None)
                report["mainMenuRestored"] = True
        except Exception as exc:
            report.update(state="failed", recoveryFailure=str(exc))
        runner.write(out / "result.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--prepare", action="store_true")
    mode.add_argument("--execute-native", action="store_true")
    parser.add_argument("--batch-output", type=Path, default=OUTPUT)
    parser.add_argument("--editable", type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--cold-readback", type=Path)
    parser.add_argument("--provenance", type=Path)
    parser.add_argument("--recipe", type=Path)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--request-sha256")
    parser.add_argument("--bridge-port", type=int)
    parser.add_argument("--started-utc")
    parser.add_argument("--run-id")
    args = parser.parse_args()
    try:
        root = checked_batch(args.batch_output)
        if args.prepare:
            runner.require(all((args.editable, args.baseline, args.cold_readback, args.provenance)),
                           "Preparation requires --editable, --baseline, --cold-readback and --provenance")
            path = prepare(root, args.editable, args.baseline, args.cold_readback, args.provenance, args.recipe)
            request_sha = artifact(path)["sha256"]
        else:
            runner.require(args.request and args.request_sha256, "Supply --request and --request-sha256")
            path, request_sha = args.request, args.request_sha256
        req = load_request(path, request_sha, root)
        if not args.execute_native:
            print(json.dumps({"state": "prepared-not-executed", "request": str(path), "requestSha256": request_sha,
                              "groupCount": len(req["beforeGroups"]), "editorCalled": False}))
            return 0
        runner.require(0 < (args.bridge_port or 0) <= 65535, "Supply the operator-approved local Bridge port")
        runner.require(args.run_id and re.fullmatch(r"run-[a-z0-9-]{1,60}", args.run_id), "Use a fresh run-* ID")
        out = private_path(root / args.run_id, root)
        os.environ["VROID_BRIDGE_URL"] = f"http://127.0.0.1:{args.bridge_port}"
        report = run(req, path, request_sha, out, args.started_utc, batch_output=root)
        print(json.dumps({"state": report["state"], "receipt": str(out / "result.json")}))
        return int(report["state"] == "failed")
    except (ValueError, OSError, KeyError, struct.error) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
