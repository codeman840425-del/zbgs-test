"""Join native editing, mesh subtraction and Body skin evidence for one pinned upper garment."""
import argparse
import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import native_garment_removal_surfaces as meshes
import native_removal_lineage as lineage
import native_removal_skin as skin
from native_dependency_delta import Export, read_pinned
from native_import import exact_directory
from native_top_group_replay import checked_batch, load_request, private_path


EXPLICIT = "native-top-removal-fit-v1"
DISCOVER = "native-top-removal-fit-v2"


def runtime_lineage(proof):
    return {key: proof[key] for key in ("sourceSha256", "coveredPngSha256", "groupId", "referenceSha256",
                                        "originalEditableSha256", "members", "coldGroupReadback")}


def locate_inputs(spec, source_root):
    """Resolve a portable recipe's read-only file pins against the archived assets directory."""
    root = Path(source_root).resolve(strict=True)
    result = copy.deepcopy(spec)
    author = result["lineage"]
    for name in (*lineage.CORE, "calls", "originalCalls", "replayRequest"):
        if name not in author:
            continue
        value = author[name]
        for pin in value if isinstance(value, list) else [value]:
            path = Path(pin["path"])
            located = (root / path).resolve()
            if path.anchor or not located.is_relative_to(root):
                raise ValueError("Expected an archive-relative input: " + name)
            pin["path"] = str(located)
    return result


def derive(spec):
    mode = spec.get("schema")
    if mode not in (EXPLICIT, DISCOVER):
        raise ValueError("Unknown native top removal fit recipe")
    if mode == DISCOVER and set(spec) != {"schema", "lineage"}:
        raise ValueError("Automatic selection takes only the verified native lineage")
    author = spec["lineage"]
    verified = lineage.verify(author)
    if not all(verified[key] for key in ("singleRemovalVerified", "coldReopenVerified", "originalCallChainVerified")):
        raise ValueError("The original export and the same-document removal require actual native call receipts")
    if author["format"] == lineage.REPLAY and not verified["coldGroupReadback"]:
        raise ValueError("New native removal requires a cold-open group readback")
    src, removed = (Path(author[key]["path"]) for key in ("originalVrm", "removedVrm"))
    src_sha, removed_sha = verified["sourceSha256"], verified["referenceSha256"]
    _, raw = read_pinned(src, src_sha)
    _, raw_removed = read_pinned(removed, removed_sha)
    if mode == DISCOVER:
        from native_removal_skin_differential import verify_surviving_skin

        retained = verify_surviving_skin(raw, raw_removed, None)
        diff = {key: retained[key] for key in ("matchingSurfaces", "matchingTriangles", "removed")}
    else:
        diff = meshes.compare(meshes.surfaces(raw), meshes.surfaces(raw_removed), spec["members"])
    garment = diff["removed"]
    if mode == EXPLICIT and [row["selector"] for row in garment] != spec["members"]:
        raise ValueError("Garment members must follow the exact source draw order")
    if len({(r["selector"]["node"], r["selector"]["mesh"], r["selector"]["skin"]) for r in garment}) != 1:
        raise ValueError("Expected one skinned owner for the removed garment")
    donor, body = skin.build_donor(src, removed, source_sha256=src_sha, removed_sha256=removed_sha)
    owner = body["source"]
    if any(r["selector"]["node"] != owner["node"] or "_Tops_" not in r["materialName"] for r in garment):
        raise ValueError("Removed group does not match upper garment surfaces on the body")
    _, mask, _ = skin.skin_surface(Export(raw).glb, skin.BODY)
    if skin.sha(mask) != owner["pngSha256"]:
        raise ValueError("Covered PNG differs from the verified source skin")
    report = {"schema": "native-top-removal-fit-receipt-v1", "status": "native-top-and-skin-verified",
              **{k: verified[k] for k in ("sourceSha256", "referenceSha256", "originalEditableSha256",
                                          "groupId", "coldGroupReadback", "limitations")},
              "members": [r["selector"] for r in garment], "surfaces": diff, "coveredPngSha256": owner["pngSha256"],
              "donor": body["donor"], "coverage": body["coverage"], "preserved": body["preserved"],
              "weightedJoints": body["surface"]["weightedJoints"], "runtimeAdmission": False}
    if mode == DISCOVER:
        report["retainedSkin"] = retained["surfaces"]
    return donor, mask, report


def replay_recipe(request_path, request_sha, run_directory, selection, original_calls):
    """Tie a native replay to the previously selected upper garment before deriving its skin."""
    request_path = Path(request_path).resolve()
    batch = checked_batch(request_path.parent.parent)
    req = load_request(request_path, request_sha, batch)
    run = private_path(run_directory, batch)
    def pin(path):
        return {"path": str(path), "sha256": skin.sha(path.read_bytes())}
    files = {"originalEditable": request_path.parent / req["editable"]["path"],
             "originalVrm": request_path.parent / req["baseline"]["path"],
             "originalProvenance": request_path.parent / "provenance.json",
             "originalColdReadback": request_path.parent / "native-readback.json",
             "untouchedCopy": run / "untouched-source-copy.vroid", "removedEditable": run / "tops-removed.vroid",
             "removedVrm": run / "tops-removed.vrm", "removalReceipt": run / "result.json", "replayRequest": request_path}
    author = {key: pin(private_path(path, batch)) for key, path in files.items()}
    author.update(format=lineage.REPLAY, originalCalls=original_calls,
                  calls=[pin(private_path(path, batch)) for path in sorted((run / "calls").glob("*.response.json"))])
    if selection is None:
        return {"schema": DISCOVER, "lineage": author}
    groups = selection["primitiveGroups"]
    if (selection["sourceSha256"] != req["baseline"]["sha256"] or len(groups) != 1 or groups[0]["slot"] != "top"):
        raise ValueError("Garment selection does not target the pinned source top")
    members = [{"node": selection["sourceNode"], "mesh": selection["sourceMesh"], "skin": selection["sourceSkin"],
                "primitive": row["primitive"], "material": row["material"]} for row in groups[0]["members"]]
    _, native = read_pinned(request_path.parent / req["baseline"]["path"], req["baseline"]["sha256"])
    drawn = meshes.surfaces(native)
    for member, described in zip(members, groups[0]["members"], strict=True):
        actual = drawn.get((selection["sourceNodeName"], described["materialName"]))
        if actual is None or actual["selector"] != member:
            raise ValueError("Selected material or mesh owner differs from the original garment")
    return {"schema": EXPLICIT, "lineage": author, "members": members}


def write_private(spec, out, *, include_recipe=False):
    dest = checked_batch(out)
    donor, mask, report = derive(spec)
    files = {"complete-skin-donor.vrm": donor, "masked-body-original.png": mask,
             "receipt.json": (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode()}
    if include_recipe:
        files["fit-recipe.json"] = (json.dumps(spec, ensure_ascii=False, indent=2) + "\n").encode()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        exact_directory(dest, files)
    else:
        with TemporaryDirectory(dir=dest.parent, prefix=".verify-top-") as tmp:
            stage = Path(tmp) / "verified"
            stage.mkdir()
            for name, data in files.items():
                (stage / name).write_bytes(data)
            try:
                stage.rename(dest)
            except FileExistsError:
                exact_directory(dest, files)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe", nargs="?", type=Path, help="Fit recipe, or an explicit garment selection for a replay")
    parser.add_argument("--discover-top", action="store_true", help="Derive source members from the verified native replay")
    parser.add_argument("--output", type=Path, required=True, help="Private directory below project output/")
    parser.add_argument("--source-root", type=Path, help="Resolve archive-relative input pins before use")
    parser.add_argument("--replay-run", type=Path, help="Completed native_top_group_replay run directory")
    parser.add_argument("--request", type=Path)
    parser.add_argument("--request-sha256")
    parser.add_argument("--original-calls", type=Path, help="JSON index of the original export's ordered SHA-pinned calls")
    options = parser.parse_args()
    checked_batch(options.output)
    replay_options = (options.replay_run, options.request, options.request_sha256, options.original_calls)
    if any(replay_options) and not all(replay_options):
        parser.error("Replay mode requires --replay-run, --request, --request-sha256 and --original-calls")
    if options.discover_top and not options.replay_run:
        parser.error("--discover-top requires a completed native replay")
    if bool(options.recipe) == options.discover_top:
        parser.error("Pass either an input recipe or --discover-top")
    spec = json.loads(options.recipe.read_bytes()) if options.recipe else None
    if options.source_root:
        if options.replay_run:
            parser.error("Replay pins already specify their source locations")
        spec = locate_inputs(spec, options.source_root)
    if options.replay_run:
        index = options.original_calls.resolve()
        spec = replay_recipe(options.request, options.request_sha256, options.replay_run, spec,
                             {"path": str(index), "sha256": skin.sha(index.read_bytes())})
    result = write_private(spec, options.output, include_recipe=bool(options.replay_run or options.source_root))
    print(json.dumps({"status": result["status"], "donor": result["donor"], "members": result["members"]}))
