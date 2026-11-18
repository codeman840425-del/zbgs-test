"""Produce two VRoid Studio exports in a fresh output directory using the original Bridge.

With the isolated 2.16 instance at a clean main menu:
    python author.py --output PATH [--exit-owned-editor]
"""
import argparse
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/production/native_authoring"))
import runner

SOURCE = ROOT / "assets-source/native-parameter-batch-v2/contour-roundness-a/candidate.vroid"
PIN = "3f53e5e33311c3736d50915402f235e0543fc7b11c64862b6d68e95222ce37a1"
EXPORT = json.loads((SOURCE.parents[1] / "batch.json").read_bytes())["export"]
SKIN = ("FaceSkin", "BodySkin", "Eyelid", "NoseLighting")
EYE_MOUTH = {"EyeWhite", "EyeHighlight", "Iris", "Mouth", "MouthLine"}
TARGET = dict(zip("rgba", [188 / 255, 139 / 255, 111 / 255, 1]))
TOP_ID = "0651673b88702f454523c48963fd21a01d976554.transferablegroup"
require = runner.require


def inventory(call, label):
    groups = call("vroid_list_groups", label=label + "-groups")
    ids = {g["type"].split(".")[-1]: g["id"] for g in groups}
    require(len(ids) == len(groups) and (set(SKIN) | EYE_MOUTH) <= ids.keys(), "Group inventory differs")
    reads = [{"tool": "vroid_get_params", "args": {"group": group}} for group in ids.values()]
    batch = call("vroid_batch", {"operations": reads}, label + "-parameters")
    require(batch["executed"] == len(reads) == len(batch["results"]), "Incomplete parameter read")
    rows = {}
    for index, (name, reply) in enumerate(zip(ids, batch["results"])):
        require(reply["ok"] and reply["index"] == index and isinstance(reply["result"], list), name)
        rows[name] = sorted(reply["result"], key=lambda r: (r["key"], r["kind"]))
    return groups, ids, rows


def channels(rows):
    found = {}
    for name in SKIN:
        found[name] = {}
        for channel in ("MainColor", "ShadowColor", "HighlightColor"):
            row, = [r for r in rows[name] if r["key"].endswith("_" + channel) and r["kind"] == "color"]
            found[name][channel] = row
    return found


def difference(before, after, partial=False):
    observed = {}
    require(set(before) == set(after), "Parameter group names changed")
    for group, rows in before.items():
        require(len(rows) == len(after[group]), "Parameter count changed in " + group)
        for a, b in zip(rows, after[group]):
            if a == b:
                continue
            require(group in SKIN and a["kind"] == "color" and a["key"].endswith("_MainColor")
                    and a == dict(b, value=a["value"]) and runner.matches(TARGET, b["value"]),
                    "Unexpected parameter change: " + group + "/" + a["key"])
            observed[group] = b["key"]
    if not partial:
        require(set(observed) == set(SKIN), "Incomplete target colors")
    return observed


def produce(output, exit_owned_editor):
    output.mkdir(parents=True, exist_ok=True)
    generated = output / "generated"
    generated.mkdir()
    calls = output / "calls"
    calls.mkdir(exist_ok=True)
    counter = 0

    def call(tool, arguments=None, label=None):
        nonlocal counter
        counter += 1
        return runner.live_transport(tool, arguments or {}, calls, f"{counter:03d}-{label or tool}")

    def clean(path):
        require(runner.get_entry(call("vroid_status")) == path, "Unexpected editor document/dirty state")

    def open_clean(path):
        call("vroid_open", {"path": str(path)})
        clean(path)

    def save_reopen(path):
        require(not path.exists(), "Destination exists")
        call("vroid_save", {"path": str(path)})
        clean(path)
        require(path.is_file(), "Save missing")
        call("vroid_main_menu")
        open_clean(path)

    input_bytes = runner.read_pinned(ROOT, {"path": SOURCE.relative_to(ROOT).as_posix(), "sha256": PIN})
    work, covered, donor_work, donor = [generated / (name + ".vroid")
                                        for name in ("source-copy", "covered", "donor-copy", "donor")]
    work.write_bytes(input_bytes)
    initial = call("vroid_status")
    require(runner.is_home(initial) and initial["plugin"] == "VRoidMcpBridge 0.15.0"
            and initial["unity"] == "6000.0.62f1", "Requires clean main menu of isolated Studio 2.16")
    report = {"schema": "native-facecontour-skin-tone-authoring-v1", "source": SOURCE.relative_to(ROOT).as_posix(),
              "sourceSha256": PIN, "host": {k: initial[k] for k in ("plugin", "unity")},
              "targetHex": "#bc8b6f", "targetRGBA": TARGET, "products": {}}
    exporting = None

    def export(path):
        nonlocal exporting
        exporting = path
        target = path.with_suffix(".vrm")
        require(not target.exists(), "VRM destination exists")
        runner.export_options(call, False)
        result = call("vroid_export_vrm", dict(EXPORT, path=str(target)))
        require(result.get("warnings") == [] and result["version"] == "1.0" and result["leftExportScreen"]
                and Path(result["path"]).resolve() == target and all(result["settings"][v] == EXPORT[k]
                    for k, v in runner.EXPORT_SETTINGS.items()), "VRM export options/readback differ")
        data = target.read_bytes()
        require(struct.unpack_from("<4sII", data) == (b"glTF", 2, len(data))
                and len(data) == result["bytes"], "Invalid VRM container")
        clean(path)
        exporting = None
        return {p.suffix[1:]: {"path": "generated/" + p.name, "sha256": runner.sha(p.read_bytes()),
                                "bytes": p.stat().st_size} for p in (path, target)}

    try:
        open_clean(work)
        groups, ids, before = inventory(call, "baseline")
        baseline = channels(before)
        baseline_main = baseline["FaceSkin"]["MainColor"]["value"]
        require(all(runner.matches(baseline_main, baseline[g]["MainColor"]["value"]) for g in SKIN)
                and not runner.matches(TARGET, baseline_main), "Source skin calibration differs")
        def paint(group):
            call("vroid_set_color", dict(group=ids[group], key=baseline[group]["MainColor"]["key"], **TARGET))
        paint("FaceSkin")
        first_groups, _, first = inventory(call, "one-write")
        require(first_groups == groups, "Group change during first write")
        linked = difference(before, first, partial=True)
        require("FaceSkin" in linked, "First write did not change FaceSkin")
        observed = linked.copy()
        manual = ["FaceSkin"]
        for group in SKIN[1:]:
            if group not in observed:
                paint(group)
                manual.append(group)
                current_groups, _, current = inventory(call, "after-" + group)
                require(current_groups == groups, "Unexpected group change")
                observed = difference(before, current, partial=True)
                require(group in observed, "Target write did not take effect")
        save_reopen(covered)
        cold_groups, _, cold = inventory(call, "covered-cold")
        require(cold_groups == groups, "Cold-open group changes")
        difference(before, cold)
        receipt = {"baseline": baseline, "afterFaceSkinWrite": channels(first), "changedByFirstWrite": linked,
                   "explicitlyWrittenGroups": manual, "coldReadback": channels(cold),
                   "verifiedParameterCountsByGroup": {g: len(p) for g, p in cold.items()},
                   "protectedGroups": sorted(EYE_MOUTH), "allOtherReturnedParamsUnchanged": True}
        runner.write(output / "calibration.json", receipt)
        report["products"]["covered"] = export(covered)
        runner.write(output / "covered-export.json", report["products"]["covered"])
        call("vroid_main_menu")
        donor_work.write_bytes(covered.read_bytes())
        open_clean(donor_work)
        donor_groups, donor_ids, start = inventory(call, "donor-start")
        require(donor_groups == cold_groups and start == cold and donor_ids["Tops"] == TOP_ID, "Wrong donor source/Tops")
        call("vroid_remove_item", {"group": TOP_ID})
        save_reopen(donor)
        removed_groups, _, removed = inventory(call, "donor-cold")
        expect = [g for g in groups if g["id"] != TOP_ID]
        require(sorted(removed_groups, key=lambda g: g["id"]) == sorted(expect, key=lambda g: g["id"])
                and removed == {k: v for k, v in cold.items() if k != "Tops"}, "Unexpected donor cold-open differences")
        report["removedTop"] = next(g for g in groups if g["id"] == TOP_ID)
        report["products"]["donor"] = export(donor)
    except Exception as exc:
        report["failure"] = str(exc)
        raise
    finally:
        try:
            runner.restore(call, None, None, {work, covered, donor_work, donor}, generated / "failure-state.vroid", exporting)
            require(runner.sha(SOURCE.read_bytes()) == PIN, "Original source changed")
            report["restoredMainMenu"] = True
            if exit_owned_editor:
                report["exitRequest"] = call("vroid_exit", {"discard": False})
        finally:
            runner.write(output / "authoring.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--exit-owned-editor", action="store_true")
    args = parser.parse_args()
    produce(args.output.resolve(), args.exit_owned_editor)
