"""Batch native parameter authoring on byte-identical private copies of one template."""
import argparse
import hashlib
import importlib.util
import json
import math
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
module = importlib.util.spec_from_file_location("native_bridge_client", ROOT / "assets-source/vroid-bridge-study-v1/call.py")
bridge = importlib.util.module_from_spec(module)
module.loader.exec_module(bridge)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(data, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write("\n")


def embedded(record):
    require(record["ok"], "Bridge rejected request")
    response, = [r for r in record["responses"] if r.get("id") == 2]
    # The author prepends a plain-language cache notice after a Studio restart.
    candidates = [block["text"].lstrip() for block in response["result"]["content"]
                  if block["type"] == "text" and block["text"].lstrip().startswith(("{", "["))]
    require(len(candidates) == 1, "Expected exactly one structured Bridge payload")
    result = json.loads(candidates[0])
    require(not bridge.payload_failures(result), "Nested Bridge failure")
    return result


def live_transport(tool, args, directory, step):
    request = directory / (step + ".request.json")
    write(request, {"method":"tools/call", "params":{"name":tool, "arguments":args}})
    try:
        record = bridge.run_call(request, directory / (step + ".response.json"))
        if tool == "vroid_screenshot":
            require(record["ok"] and len(record["images"]) == 1, "Missing native capture")
            capture = Path(record["images"][0])
            return {"path":"calls/" + capture.name,"sha256":sha(capture.read_bytes())}
        return embedded(record)
    except SystemExit as exc:
        raise RuntimeError(str(exc)) from exc


EXPORT_SETTINGS = {
    "delete_transparent":"meshErasure", "hair_smoothness":"hairSmoothness", "hair":"hair",
    "face":"face", "body":"body", "outfit":"outfit", "material_mode":"materialMode",
    "texture_mode":"textureMode", "hair_bones":"hairBones",
}


def read_pinned(root, artifact):
    require(isinstance(artifact["path"], str) and not Path(artifact["path"]).is_absolute(), "Expected repository-relative source")
    path = (root / artifact["path"]).resolve()
    require(path.is_relative_to(root.resolve()), "Input outside repository")
    data = path.read_bytes()
    require(sha(data) == artifact["sha256"], "Input SHA mismatch: " + artifact["path"])
    return data


def valid_value(kind, value):
    def number(n):
        return type(n) in (float, int) and math.isfinite(n)
    if kind == "color":
        return isinstance(value, dict) and set(value) == set("rgba") and all(number(v) and 0 <= v <= 1 for v in value.values())
    return kind == "bone" and number(value)


def checked_recipe(batch, root):
    require(batch["schema"] == "native-authoring-batch-v1", "Invalid recipe schema")
    template = batch["template"]
    require(template["path"].lower().endswith(".vroid") and template["version"], "Expected versioned .vroid template")
    source = read_pinned(root, template)
    definitions = {}
    for definition in batch["parameters"]:
        key, kind = definition["key"], definition["kind"]
        require(key not in definitions and definition["groupType"], "Duplicate or unscoped parameter")
        observed = []
        for record in definition["observations"]:
            response = json.loads(read_pinned(root, record))
            require(response["request"]["params"]["name"] == "vroid_get_params", "Invalid parameter evidence")
            data = embedded(response)
            value, = [v["value"] for v in data if v["key"] == key and v["kind"] == kind]
            require(valid_value(kind, value), "Invalid observed value")
            observed.append(value)
        require(observed and definition["baseline"] == observed[0], "Missing observed template value")
        definitions[key] = (definition, observed)
    require(definitions and batch["items"], "Empty batch or parameter definitions")
    ids = set()
    for item in batch["items"]:
        identity = item["id"]
        require(isinstance(identity, str) and re.fullmatch("[a-z][a-z0-9-]{0,78}", identity)
                and identity not in ids and not re.fullmatch("con|aux|nul|prn|com[1-9]|lpt[1-9]|calls", identity), "Invalid or duplicate recipe ID")
        ids.add(identity)
        require(set(item["values"]) == set(definitions), "Incomplete final parameter set")
        for key, value in item["values"].items():
            definition, observed = definitions[key]
            require(valid_value(definition["kind"], value) and value in observed, "Value outside observed discrete choices: " + key)
    export = batch["export"]
    require(set(export) == set(EXPORT_SETTINGS) | {"version","leave","title","model_version","author"}
            and export["version"] == "1" and export["leave"] is True, "Incomplete VRM1 export settings")
    return source


def is_home(status):
    return status.get("modelOpen") is False and status.get("dirty") is False and status.get("currentFile") is None


def current_file(status):
    require(status.get("ready") and status.get("modelOpen") and status.get("currentFile"), "Editor state unknown")
    return Path(status["currentFile"]).resolve()


def get_entry(status):
    if is_home(status):
        return None
    path = current_file(status)
    require(status.get("dirty") is False and path.is_file(), "Unsaved or missing entry document")
    return path


def inventory(call, parameters):
    groups = call("vroid_list_groups")
    rows = {}
    protected = {}
    for group_type in dict.fromkeys(p["groupType"] for p in parameters):
        matches = [g["id"] for g in groups if g["type"] == group_type]
        require(len(matches) == 1, "Fresh group missing or ambiguous: " + group_type)
        group = matches[0]
        group_rows = call("vroid_get_params", {"group":group})
        selected = {p["key"] for p in parameters if p["groupType"] == group_type}
        protected[group_type] = sorted((r for r in group_rows if r["key"] not in selected),
                                       key=lambda r:(r["key"],r["kind"]))
        for p in (p for p in parameters if p["groupType"] == group_type):
            matching = [r for r in group_rows if r["key"] == p["key"] and r["kind"] == p["kind"]]
            require(len(matching) == 1, "Fresh parameter missing or ambiguous: " + p["key"])
            rows[p["key"]] = (group, matching[0]["value"])
    return rows, protected


def matches(expected, actual):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and set(expected) == set(actual) and all(matches(v, actual[k]) for k,v in expected.items())
    return type(actual) in (int, float) and math.isclose(expected, actual, abs_tol=1e-7, rel_tol=0)


def export_options(call, leave):
    screen = call("vroid_export_vrm_options", {"leave":leave})
    require(screen.get("exportScreenOpen") is True and isinstance(screen.get("settings"), dict)
            and all(field in screen["settings"] for field in EXPORT_SETTINGS.values()), "Missing native export-screen settings")
    return screen


def restore(call, entry, entry_sha, owned, failure_path, export_candidate):
    status = call("vroid_status")
    if (export_candidate is not None and status.get("currentFile") and Path(status["currentFile"]).resolve() == export_candidate
            and status.get("modelOpen") is True and status.get("ready") is False and status.get("dirty") is False
            and status.get("isEditing") is False and status.get("canSave") is True):
        export_options(call, True)
        status = call("vroid_status")
        require(get_entry(status) == export_candidate and status.get("isEditing") is True, "Export screen did not return to the owned editor")
    if not is_home(status):
        path = current_file(status)
        if path == entry:
            require(status.get("dirty") is False and sha(entry.read_bytes()) == entry_sha, "Entry changed during production")
            return
        require(path in owned, "Unrecognized active document; recovery needs manual inspection")
        if status.get("dirty") is True:
            require(not failure_path.exists(), "Recovery snapshot already exists")
            call("vroid_save", {"path":str(failure_path)})
            saved = call("vroid_status")
            require(current_file(saved) == failure_path and saved["dirty"] is False and failure_path.is_file(), "Cannot confirm recovery snapshot")
        else:
            require(status.get("dirty") is False, "Unknown dirty state")
        call("vroid_main_menu")
    if entry:
        require(sha(entry.read_bytes()) == entry_sha, "Entry file changed; refusing ambiguous restore")
        call("vroid_open", {"path":str(entry)})
    require(get_entry(call("vroid_status")) == entry, "Entry restoration failed")


def author(call, batch, item, directory, template):
    work = directory / "template-copy.vroid"
    candidate = directory / "candidate.vroid"
    exported = directory / "candidate.vrm"
    with work.open("xb") as stream:
        stream.write(template)
    call("vroid_open", {"path":str(work)})
    require(get_entry(call("vroid_status")) == work, "Wrong active template copy")
    before, protected = inventory(call, batch["parameters"])
    for p in batch["parameters"]:
        key = p["key"]
        group, initial = before[key]
        require(matches(p["baseline"], initial), "Unexpected template baseline: " + key)
        value = item["values"][key]
        if not matches(value, initial):
            args = {"group":group, "key":key}
            args.update(value if p["kind"] == "color" else {"value":value})
            call("vroid_set_" + p["kind"], args)
    immediate, non_target = inventory(call, batch["parameters"])
    require(non_target == protected, "Non-target group parameters changed during edit")
    require(all(matches(v, immediate[k][1]) for k,v in item["values"].items()), "Immediate parameter readback differs")
    require(current_file(call("vroid_status")) == work, "Active working document changed")
    call("vroid_save", {"path":str(candidate)})
    require(get_entry(call("vroid_status")) == candidate and candidate.is_file(), "Cannot confirm saved candidate")
    call("vroid_main_menu")
    call("vroid_open", {"path":str(candidate)})
    require(get_entry(call("vroid_status")) == candidate, "Wrong cold-open document")
    after, non_target = inventory(call, batch["parameters"])
    require(non_target == protected, "Non-target group parameters changed after cold-open")
    for key, value in item["values"].items():
        require(matches(value, after[key][1]), "Cold-open parameter differs: " + key)
    screenshot = call("vroid_screenshot", {"width":960,"height":1280})
    export = batch["export"]
    write(directory / "export-intent.json", {"document":candidate.name,"sha256":sha(candidate.read_bytes())})
    prepared = export_options(call, False)
    write(directory / "export-preparation.json", prepared)
    result = call("vroid_export_vrm", dict(export, path=str(exported)))
    require(result.get("warnings") == [] and result.get("version") == "1.0" and result.get("leftExportScreen") is True
            and Path(result["path"]).resolve() == exported, "Unexpected native export reply")
    for key, returned_key in EXPORT_SETTINGS.items():
        require(result["settings"].get(returned_key) == export[key], "Export setting differs: " + key)
    raw = exported.read_bytes()
    require(len(raw) >= 20 and struct.unpack_from("<4sII", raw) == (b"glTF", 2, len(raw))
            and len(raw) == result["bytes"], "Invalid exported container")
    return {"values":item["values"], "coldReadback":{k:v[1] for k,v in after.items()},
            "protectedParameters":{k:len(v) for k,v in protected.items()}, "nativeScreenshot":screenshot,
            "editable":{"path":candidate.name,"sha256":sha(candidate.read_bytes())},
            "exported":{"path":exported.name,"sha256":sha(raw),"bytes":len(raw)}}


def run(batch, output, transport=live_transport, root=ROOT):
    template = checked_recipe(batch, root)
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    write(output / "batch.json", batch)
    calls = output / "calls"
    calls.mkdir()
    sequence = 0
    def call(tool, args=None):
        nonlocal sequence
        sequence += 1
        return transport(tool, args or {}, calls, f"{sequence:04d}-{tool}")
    report = {"schema":"native-authoring-result-v1","items":[],"entryRestored":False}
    try:
        initial = call("vroid_status")
        report["declaredStudio"] = batch["host"]["studio"]
        report["checkedHost"] = {k:initial.get(k) for k in ("plugin","unity")}
        for key in ("plugin","unity"):
            require(initial.get(key) == batch["host"][key], "Wrong native host: " + key)
        entry = get_entry(initial)
        entry_sha = sha(entry.read_bytes()) if entry else None
        write(output / "recovery-entry.json", {"path":str(entry) if entry else None,"sha256":entry_sha,"menu":entry is None})
        for item in batch["items"]:
            directory = output / item["id"]
            directory.mkdir()
            row = {"id":item["id"],"state":"failed"}
            report["items"].append(row)
            try:
                require(get_entry(call("vroid_status")) == entry, "Entry changed before item")
                if entry:
                    call("vroid_main_menu")
                product = author(call, batch, item, directory, template)
                row.update(product, state="exported")
            except Exception as exc:
                row["reason"] = str(exc)
            finally:
                try:
                    candidate = directory/"candidate.vroid"
                    restore(call, entry, entry_sha, {directory/"template-copy.vroid", candidate}, directory/"failure-state.vroid",
                            candidate if (directory/"export-intent.json").is_file() else None)
                    require(read_pinned(root, batch["template"]) == template, "Source changed during production")
                except Exception as exc:
                    row.update(state="failed", recoveryError=str(exc))
                    write(directory / "result.json", row)
                    raise
            write(directory / "result.json", row)
        report["entryRestored"] = True
    except Exception as exc:
        report["error"] = str(exc)
    report["passed"] = report["entryRestored"] and all(r["state"] == "exported" for r in report["items"])
    write(output / "result.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execute-native", action="store_true")
    args = parser.parse_args()
    if not args.execute_native:
        parser.error("Native editor access requires --execute-native")
    try:
        result = run(json.loads(args.batch.read_bytes()), args.output)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0 if result["passed"] else 1)
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(1, str(exc) + "\n")
