"""Rebuild both private native body packages from the fixed original archive."""

import argparse
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
if __name__ == "__main__":
    sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "scripts/production"))

import native_archive_package_inputs as archive_inputs
import native_body_package as packages
import native_removal_lineage as lineage
from native_authoring import runner
from native_import import confined, digest
from native_top_group_replay import checked_batch
from native_top_removal_fit import DISCOVER, EXPLICIT, locate_inputs
from production_paths import project_output


YUN = "studio-01-yun-lan"
BO = "studio-02-bo-chen"


def read(path):
    return json.loads(path.read_bytes())


def store(path, value):
    with path.open("xb") as stream:
        stream.write(archive_inputs.payload(value))
    return pin(path)


def pin(path, raw=None):
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": digest(path.read_bytes() if raw is None else raw)}


def locate(root, ref):
    return {**ref, "path": str(confined(root, ref["path"]))}


def yun_receiver(archive, receiver_pin, fit, destination):
    receiver = confined(archive, "registration/operator")
    old = json.loads(lineage.pinned(locate(archive, receiver_pin), "Yun receiver config"))
    item, = old["items"]
    if old["schema"] != "native-body-package-recipe-v1" or item["id"] != YUN:
        raise ValueError("Wrong fixed Yun receiver recipe")
    files = {}

    def capture(ref):
        name = ref["path"]
        raw = lineage.pinned(locate(receiver, ref), "Yun " + name)
        files[name] = raw
        return pin(destination / name, raw)

    final = {key: capture(old[key]) for key in ("template", "baseline", "authoringBatch", "authoringResult")}
    final_item = {**item, **{key: capture(item[key]) for key in ("candidate", "delta")}}
    authored = json.loads(files[old["authoringBatch"]["path"]])
    result = json.loads(files[old["authoringResult"]["path"]])
    row, = [row for row in result["items"] if row["id"] == YUN]
    result_dir = confined(receiver, old["authoringResult"]["path"]).parent
    row_dir = confined(result_dir, YUN)
    exported = confined(row_dir, row["exported"]["path"])
    editable = confined(row_dir, row["editable"]["path"])
    if (result["schema"] != "native-authoring-result-v1" or not result["passed"] or row["state"] != "exported"
            or exported != confined(receiver, item["candidate"]["path"])
            or row["exported"]["sha256"] != final_item["candidate"]["sha256"]
            or row["exported"]["bytes"] != len(files[item["candidate"]["path"]])):
        raise ValueError("Yun runner result does not identify the archived candidate")
    capture({**row["editable"], "path": editable.relative_to(receiver).as_posix()})
    runner.checked_recipe(authored, receiver)
    for parameter in authored["parameters"]:
        for observation in parameter["observations"]:
            capture(observation)
    if (final["template"]["sha256"] != authored["template"]["sha256"]
            or final["template"]["sha256"] != fit["lineage"]["originalEditable"]["sha256"]
            or final["baseline"]["sha256"] != fit["lineage"]["originalVrm"]["sha256"]
            or final_item["candidate"]["sha256"] != final["baseline"]["sha256"]):
        raise ValueError("Yun archive and portable removal recipe disagree")
    return files, {"schema": old["schema"], **final, "items": [final_item]}


def bo_inputs(archive, pins, *, discover_top=False):
    if pins["id"] != BO:
        raise ValueError("Wrong fixed Bo Chen archive")
    author = pins["authoring"]
    originals = {key: author[key] for key in ("originalEditable", "originalVrm", "originalProvenance", "originalColdReadback")}
    author_calls = {ref["path"]: ref for ref in author["calls"]}
    fit = {"schema": DISCOVER} if discover_top else {"schema": EXPLICIT, "members": pins["members"]}
    fit["lineage"] = {"format": lineage.FUSION, **originals, **pins["removal"],
                      "originalCalls": [author_calls[name] for name in pins["originalCalls"]]}
    spec = {"schema": archive_inputs.SCHEMA}
    for key, value in author.items():
        spec[key] = ([locate(archive, ref) for ref in value] if key == "calls" else locate(archive, value))
        for ref in spec[key] if key == "calls" else [spec[key]]:
            lineage.pinned(ref, "Bo " + key)
    return spec, locate_inputs(fit, archive)


def checked_package(config, output, expected):
    result = packages.build(read(ROOT / config["path"]), output)
    if not result["passed"]:
        raise ValueError(result)
    item, = result["items"]
    folder = output / item["id"]
    spec = read(folder / "import-spec.json")
    resources = {name: {"sha256": digest((folder / name).read_bytes()), "bytes": (folder / name).stat().st_size}
                 for name in spec["files"]}
    if len(resources) != 7 or resources != expected:
        raise ValueError("Seven fixed package resources differ for " + item["id"])
    return {**item, "config": config, "resources": resources,
            "importBatch": pin(output / "import-batch.json")}


def rebuild(archive_path, output_path, *, discover_top=False):
    output = checked_batch(project_output(output_path, __file__))
    archive = archive_path.resolve(strict=True)
    if not archive.is_dir() or output.is_relative_to(archive) or archive.is_relative_to(output):
        raise ValueError("Use a read-only archive separate from the private output")
    if output.exists():
        raise FileExistsError("Choose a fresh output directory: " + str(output))
    pins = read(HERE / "replay-pins.json")
    expected = {record["bodyType"]: record["resources"] for record in read(HERE / "paired-fixed-game.json")["records"]}
    yun_recipe = read(HERE / "yun-recipe.json")
    if discover_top:
        yun_recipe = {"schema": DISCOVER, "lineage": yun_recipe["lineage"]}
    yun_fit = locate_inputs(yun_recipe, archive)
    files, yun_config = yun_receiver(archive, pins["yunReceiverConfig"], yun_fit, output / "yun-receiver")
    bo_archive, bo_fit = bo_inputs(archive, pins["bo"], discover_top=discover_top)
    for fit in (yun_fit, bo_fit):
        verified = lineage.verify(fit["lineage"])
        if not all(verified[key] for key in ("singleRemovalVerified", "coldReopenVerified", "originalCallChainVerified")):
            raise ValueError("The archive does not establish the native removal and original export")
    output.mkdir(parents=True, exist_ok=False)
    for name, raw in files.items():
        dest = confined(output / "yun-receiver", name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("xb") as stream:
            stream.write(raw)
    yun_config["items"][0]["topRemovalRecipe"] = store(output / "yun-fit.json", yun_fit)
    yun = store(output / "yun-config.json", yun_config)
    bo_fit_path = output / "bo-chen-fit.json"
    bo_fit_pin = store(bo_fit_path, bo_fit)
    bo = archive_inputs.stage(bo_archive, output / "bo-chen-archive",
                              fit={**bo_fit_pin, "path": bo_fit_path})["config"]
    # The package builder launches Node to check the real footwear floor.
    private_env = dict(TEMP=str(output), TMP=str(output), TMPDIR=str(output),
                       NODE_DISABLE_COMPILE_CACHE="1", NODE_V8_COVERAGE="")
    previous_env = {name: os.environ.get(name) for name in private_env}
    os.environ.update(private_env)
    try:
        report = {"status": "rebuilt-fixed-resource-bytes", "items": [
            checked_package(config, output / name, expected[f"native-{role}-v1"])
            for config, name, role in ((yun, "yun-package", YUN), (bo, "bo-chen-package", BO))
        ]}
    finally:
        for name, value in previous_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
    store(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="Authorized original Studio archive")
    parser.add_argument("--output", type=Path, required=True, help="Fresh directory below project output/")
    parser.add_argument("--discover-top", action="store_true", help="Read the original native operations without primitive selectors")
    args = parser.parse_args()
    try:
        print(json.dumps(rebuild(args.archive, args.output, discover_top=args.discover_top), indent=2, ensure_ascii=False))
    except (OSError, ValueError, KeyError) as exc:
        parser.error(str(exc))
