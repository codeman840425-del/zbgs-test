"""Prepare private body-package inputs from an original native VRoid authoring archive."""

import argparse
import json
from pathlib import Path
import re
import struct
from tempfile import TemporaryDirectory

import native_removal_lineage as lineage
import native_top_group_replay as replay
from native_dependency_delta import compare_exports
from native_import import exact_directory
from production_paths import project_output


SCHEMA = "native-archive-package-input-v1"
RESULT = "native-archived-authoring-result-v1"
CREATE = "vroid_create"
APPLY = "vroid_apply_preset"
GET = "vroid_get_params"
SET = "vroid_set_bone"
OBSERVATION_ONLY = {"vroid_screenshot", "vroid_camera", "vroid_measure"}
ROOT = replay.runner.ROOT
require = replay.runner.require


def payload(document):
    return (json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def package_pin(path, data):
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": replay.runner.sha(data)}


def checked_calls(spec, source):
    names = source["evidenceCalls"]
    require(len(names) == len(set(names)), "Duplicate authoring evidence filename")
    expected = []
    for name in names:
        match = re.fullmatch(r"[0-9]{8}-[0-9]{6}-[0-9a-f]{6}-(vroid_[a-z_]+)\.response\.json", name)
        require(match, "Unknown authoring call recording identity")
        if match[1] not in OBSERVATION_ONLY:
            expected.append((name, match[1]))
    pins = spec["calls"]
    require(isinstance(pins, list) and [Path(pin["path"]).name for pin in pins] == [name for name, _ in expected],
            "Pinned authoring calls do not cover the declared archive sequence")
    calls = lineage.call_chain(spec, "calls")
    require([c.name for c in calls] == [tool for _, tool in expected], "Raw authoring call types differ")
    return calls, {name: pin for (name, _), pin in zip(expected, pins, strict=True)}


def param_read(groups, reading, declared, edit):
    group = edit["reply"]["group"]
    candidates = [row for row in groups.payload if row["type"] == "TransferableGroupType.N00.Level1." + edit["category"]]
    require(len(candidates) == 1 and candidates[0]["id"] == group and reading.args == {"group": group},
            "Archived parameter group differs")
    matches = [row for row in reading.payload if row["key"] == edit["key"] and row["kind"] == "bone"]
    require(len(matches) == 1 and replay.runner.valid_value("bone", declared)
            and replay.runner.matches(declared, matches[0]["value"]), "Archived parameter value differs: " + edit["key"])
    return candidates[0]


def verify_trace(spec, source, cold, recipe, original):
    ident, label, gender = (source[k] for k in ("id", "name", "gender"))
    require(isinstance(ident, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,60}", ident)
            and not re.fullmatch(r"con|aux|nul|prn|com[1-9]|lpt[1-9]|archive", ident), "Invalid archive role ID")
    require(isinstance(label, str) and label and gender in ("female", "male")
            and all(recipe[k] == source[k] for k in ("id", "name", "gender", "presets"))
            and source["edits"] == cold["edits"]
            and [{k: v for k, v in edit.items() if k != "reopenedValue"} for edit in cold["edits"]] == recipe["edits"],
            "Original source recipe and cold record differ")
    presets, edits = recipe["presets"], cold["edits"]
    require(presets and edits and len({e["key"] for e in edits}) == len(edits), "Empty or duplicate original choices")
    calls, pins = checked_calls(spec, source)
    labels = list(pins)
    phases = [(i, call) for i, call in enumerate(calls) if call.name != lineage.STATUS]
    expected = [CREATE, *([APPLY] * len(presets)), *([lineage.GROUPS, GET, SET] * len(edits)),
                lineage.SAVE, lineage.MENU, lineage.OPEN, *([lineage.GROUPS, GET] * len(edits)),
                lineage.GROUPS, lineage.EXPORT]
    require([c.name for _, c in phases] == expected, "Unexpected original operation order")
    host = {**original["bridge"], "startedUtc": cold["status"]["startedUtc"]}
    require(host["startedUtc"] and all(all(c.payload.get(k) == v for k, v in host.items())
                                      for c in calls if c.name == lineage.STATUS), "Original archive changed native session")
    created_at, created = phases[0]
    lineage.status_between(calls, 0, created_at, host, None)
    require(created.args == {"gender": gender} and created.payload.get("ok") is True
            and created.payload.get("gender") == gender, "Original native creation differs")
    for (_, call), preset in zip(phases[1:1 + len(presets)], presets, strict=True):
        require(call.args == {"id": preset["id"]} and call.payload.get("ok") is True
                and all(call.payload[k] == preset[k] for k in ("id", "resource"))
                and preset["resource"].startswith(f"pixiv/{preset['category']}/N00/{preset['number']:03d}/"),
                "Original native preset differs")
    warm = 1 + len(presets)
    saved = warm + 3 * len(edits)
    (save_at, save_call), (menu_at, menu), (open_at, opened) = phases[saved:saved + 3]
    document = lineage.label_path(source["sourcePath"])
    for call in (save_call, opened):
        lineage.successful_document_call(call, document)
    require(menu.payload.get("ok") is True, "Original document did not return to menu")
    lineage.status_between(calls, save_at + 1, menu_at, host, document)
    lineage.status_between(calls, menu_at + 1, open_at, host, None)
    first_cold = saved + 3
    lineage.status_between(calls, open_at + 1, phases[first_cold][0], host, document)
    require(any(c.name == lineage.STATUS and c.payload == cold["status"] for c in calls[open_at + 1:phases[first_cold][0]]),
            "Original native cold state differs from the provenance readback")
    definitions, values = [], {}
    for i, edit in enumerate(edits):
        (_, warm_groups), (_, warm_reading), (_, changed) = phases[warm + 3 * i:warm + 3 * i + 3]
        (_, cold_groups), (cold_index, cold_reading) = phases[first_cold + 2 * i:first_cold + 2 * i + 2]
        group = param_read(warm_groups, warm_reading, edit["before"], edit)
        require(group == param_read(cold_groups, cold_reading, edit["reopenedValue"], edit)
                and replay.runner.valid_value("bone", edit["value"])
                and replay.runner.matches(edit["value"], edit["reopenedValue"]), "Original cold parameter differs")
        args = {"group": group["id"], "key": edit["key"], "value": edit["value"]}
        require(changed.args == args and changed.payload == edit["reply"] and changed.payload.get("ok") is True
                and all(changed.payload.get(k) == v for k, v in args.items()), "Original native edit differs")
        values[edit["key"]] = edit["reopenedValue"]
        definitions.append({"key": edit["key"], "kind": "bone", "groupType": group["type"],
                            "baseline": edit["reopenedValue"], "observation": labels[cold_index]})
    (_, last_groups), (export_index, exported) = phases[-2:]
    require(lineage.group_rows(last_groups.payload) == lineage.group_rows(original["beforeGroups"]),
            "Original native groups differ from the final cold readback")
    lineage.status_between(calls, open_at + 1, export_index, host, document)
    require(exported.args == {**source["exportSettings"], "path": source["modelPath"]}
            and exported.payload == source["exportReply"], "Original native export call differs")
    return definitions, values, pins


def publish(directory, files, batch):
    if directory.exists():
        exact_directory(directory, files)
        return
    directory.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=directory.parent, prefix=".native-archive-") as temp:
        staged = Path(temp) / "files"
        staged.mkdir()
        for name, raw in files.items():
            path = staged / name
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("xb") as stream:
                stream.write(raw)
        replay.runner.checked_recipe(batch, staged)
        try:
            staged.rename(directory)
        except FileExistsError:
            exact_directory(directory, files)


def stage(spec, output, fit=None):
    directory = replay.checked_batch(project_output(output, __file__))
    require(spec.get("schema") == SCHEMA, "Unknown native authoring archive spec")
    file_keys = ("originalEditable", "originalVrm", "originalProvenance", "originalColdReadback", "originalRecipe")
    raw = {name: lineage.pinned(spec[name], name) for name in file_keys}
    template = replay.pin_bytes("source.vroid", raw["originalEditable"])
    baseline = replay.pin_bytes("source.vrm", raw["originalVrm"])
    source, cold, recipe = (json.loads(raw[name]) for name in file_keys[2:])
    meta = replay.vrm_meta(raw["originalVrm"])
    original = replay.evidence_fields(template, baseline, meta, cold, source)
    require(source["exportedRightsMetadata"] == meta, "Original native export terms differ")
    definitions, values, calls = verify_trace(spec, source, cold, recipe, original)
    ident, label = source["id"], source["name"]
    reference = spec.get("baselineVrm", spec["originalVrm"])
    require(lineage.pinned(reference, "baselineVrm") == raw["originalVrm"], "Baseline must have the exact original VRM bytes")
    delta = compare_exports(Path(reference["path"]), baseline["sha256"],
                            Path(spec["originalVrm"]["path"]), baseline["sha256"])
    require(delta["status"] == "compared", "The original archive cannot be measured: " + str(delta.get("reason")))
    fit_pin = None
    if fit is not None:
        from native_top_removal_fit import derive

        fit_path = replay.checked_batch(project_output(fit["path"], __file__))
        fit_raw = lineage.pinned({**fit, "path": fit_path}, "topRemovalRecipe")
        _, _, proof = derive(json.loads(fit_raw))
        require(proof["sourceSha256"] == baseline["sha256"] and proof["originalEditableSha256"] == template["sha256"]
                and proof["groupId"] == original["removeGroup"]["id"], "Removal fit does not belong to this original archive")
        fit_pin = package_pin(fit_path, fit_raw)
    files = {
        "archive/source.vroid": raw["originalEditable"], "archive/source.vrm": raw["originalVrm"],
        "archive/provenance.json": raw["originalProvenance"], "archive/native-readback.json": raw["originalColdReadback"],
        "archive/recipe.json": raw["originalRecipe"],
        f"{ident}/candidate.vroid": raw["originalEditable"], f"{ident}/candidate.vrm": raw["originalVrm"],
        f"{ident}.delta.json": payload(delta),
    }
    files.update({f"archive/calls/{name}": lineage.pinned(pin, name) for name, pin in calls.items()})

    def pin(name):
        return package_pin(directory / name, files[name])

    parameters = []
    for definition in definitions:
        item = dict(definition)
        observation = item.pop("observation")
        parameters.append({**item, "observations": [pin("archive/calls/" + observation)]})
    batch = {"schema": "native-authoring-batch-v1", "host": {"studio": "2.16.0", **original["bridge"]},
             "template": {**pin("archive/source.vroid"), "version": ident + "-original-archive-v1"},
             "parameters": parameters, "export": original["export"], "items": [{"id": ident, "label": label, "values": values}]}
    lineage_pins = {name: pin(name) for name in sorted(files) if name.startswith("archive/")}
    report = {"schema": RESULT, "passed": True, "origin": "verified-original-vroid-mcp-authoring-archive",
              "nativeRunnerExecuted": False, "newNativeExecutions": 0, "archive": lineage_pins,
              "items": [{"id": ident, "state": "exported", "values": values, "coldReadback": values,
                         "editable": replay.pin_bytes("candidate.vroid", raw["originalEditable"]),
                         "exported": replay.pin_bytes("candidate.vrm", raw["originalVrm"])}]}
    files.update({"batch.json": payload(batch), "result.json": payload(report)})
    # checked_recipe expects repository-relative paths. Validate an equivalent private
    # view of the staged source files before publishing the production-relative batch.
    staged_batch = {**batch, "template": {**batch["template"], "path": "archive/source.vroid"},
                    "parameters": [{**row, "observations": [{**pin, "path": Path(pin["path"]).relative_to(
                        directory.relative_to(ROOT)).as_posix()} for pin in row["observations"]]} for row in parameters]}
    publish(directory, files, staged_batch)
    replay.runner.checked_recipe(batch, ROOT)
    summary = {"status": "archive-verified-awaiting-removal-fit", "id": ident, "values": values,
               "authoringBatch": pin("batch.json"), "authoringResult": pin("result.json"),
               "baseline": pin("archive/source.vrm"), "candidate": pin(f"{ident}/candidate.vrm"),
               "delta": pin(f"{ident}.delta.json"), "nativeRunnerExecuted": False}
    if fit_pin is not None:
        config = {"schema": "native-body-package-recipe-v1", "template": pin("archive/source.vroid"),
                  **{k: summary[k] for k in ("baseline", "authoringBatch", "authoringResult")},
                  "items": [{"id": ident, "label": label, **{k: summary[k] for k in ("candidate", "delta")},
                             "topRemovalRecipe": fit_pin}]}
        config_raw = payload(config)
        config_path = replay.checked_batch(project_output(directory.with_name(directory.name + "-package.json"), __file__))
        try:
            with config_path.open("xb") as stream:
                stream.write(config_raw)
        except FileExistsError:
            require(config_path.read_bytes() == config_raw, "Existing package config differs")
        summary.update(status="archive-and-removal-fit-verified", config=package_pin(config_path, config_raw))
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path, help="Pinned original authoring files and ordered Bridge call receipts")
    parser.add_argument("--output", type=Path, required=True, help="Private archive staging directory below output/")
    parser.add_argument("--fit", type=Path, help="Verified same-body native top-removal recipe below output/")
    parser.add_argument("--fit-sha256", help="Fixed SHA-256 of the provided top-removal recipe")
    args = parser.parse_args()
    try:
        require(bool(args.fit) == bool(args.fit_sha256), "Pass --fit and --fit-sha256 together")
        verified = stage(json.loads(args.spec.read_bytes()), args.output,
                         {"path": args.fit, "sha256": args.fit_sha256} if args.fit else None)
    except (OSError, ValueError, KeyError, IndexError, TypeError, struct.error) as exc:
        parser.error(str(exc))
    print(json.dumps(verified, ensure_ascii=False, indent=2))
