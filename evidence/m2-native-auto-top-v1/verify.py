"""Compare automatic native top discovery with the original, signed 50f24f49772f pair."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OLD = HERE.with_name("m2-native-top-removal-intake-v1")
if __name__ == "__main__":
    sys.dont_write_bytecode = True
sys.path.insert(0, str(OLD))
import replay_inputs as archive
import native_top_removal_fit as fit


def read(path):
    return json.loads(path.read_bytes())


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def check(ok, reason):
    if not ok:
        raise ValueError(reason)


def signed_records(path, receipt):
    raw = path.read_bytes()
    check(sha(raw) == receipt["recordFileSha256"], "Signed pair file hash differs")
    code = """
        import {readFileSync} from 'node:fs';
        import {validateCharacterRecord} from './prototype/src/character-record.js';
        const rows = JSON.parse(readFileSync(0, 'utf8'));
        // This step verifies record integrity; the Python check reads the actual seven runtime files.
        for (const row of rows) await validateCharacterRecord(row, {validationCallback: () => ({status: 'pending'})});
    """
    env = os.environ.copy()
    # This read-only verifier must not inherit a file destination from Node.
    env.pop("NODE_V8_COVERAGE", None)
    env.pop("NODE_COMPILE_CACHE", None)
    env["NODE_DISABLE_COMPILE_CACHE"] = "1"
    subprocess.run(["node", "--input-type=module", "-e", code], input=raw, cwd=ROOT, env=env, check=True)
    rows = json.loads(raw)
    check(len(rows) == 2, "Expected exactly two signed records")
    return {r["identity"]["id"]: r for r in rows}


def verify_body(spec, prior, expected, record, assets):
    # The archived selectors are expected results only. Neither call takes any selectors.
    first_body, first_mask, prior_run = fit.derive(spec)
    donor, mask, proof = fit.derive(spec)
    check((donor, mask, proof) == (first_body, first_mask, prior_run), "Repeated discovery differs")
    old = prior["nativeSurfaceCheck"]
    for key in ("members", "surfaces", "coverage", "preserved", "weightedJoints", "donor"):
        check(proof[key] == old[key], f"Discovery differs from historic fit field {key}")
    folder = assets / expected["bodyType"]
    files = {p.name: sha(p.read_bytes()) for p in folder.iterdir()}
    check(len(files) == 7 and files == expected["runtimeFileSha256"], "Runtime resources differ")
    manifest = read(folder / "manifest.json")
    runtime = fit.runtime_lineage(proof)
    check(runtime == manifest["sourceMaskLineage"] == prior["registeredCoverage"], "Wrong registered lineage")
    body_pin = files["body.vrm"]
    check(donor == (folder / "body.vrm").read_bytes() and body_pin == proof["donor"]["sha256"],
          "Derived body differs from published body")
    check(mask == (folder / manifest["covered"]["url"]).read_bytes()
          and sha(mask) == runtime["coveredPngSha256"] == manifest["covered"]["sha256"], "Published mask differs")
    base = record["appearanceRecipe"]["base"]
    check(base == {"bodyType": expected["bodyType"], "sha256": body_pin}
          and body_pin == manifest["avatarSha256"] == expected["bodySha256"], "Signed body differs")
    check(record["integrity"]["recordSha256"] == expected["recordSha256"]
          and record["integrity"]["recipeSha256"] == expected["recipeSha256"]
          and record["revision"] == expected["revision"], "Wrong signed character or revision")
    gear = {i["id"]: i for i in read(folder / "equipment.json")["items"]}
    selected = record["appearanceRecipe"]["equipment"]["resources"]
    check(len(selected) == len(gear) == 3, "Expected three equipped resources")
    for item in selected.values():
        check(gear[item["id"]]["sha256"] == item["sha256"] == files[item["url"]]
              and item["compatibleAvatarSha256"] == body_pin, "Signed equipment differs")
    retained = proof["retainedSkin"]
    check(len(retained) == proof["surfaces"]["matchingSurfaces"], "Incomplete retained skin report")
    retained_digest = sha(json.dumps(retained, sort_keys=True, separators=(",", ":")).encode())
    return {"id": prior["id"], "recordSha256": expected["recordSha256"], "revision": record["revision"],
            "originalCalls": len(spec["lineage"]["originalCalls"]), "removalCalls": len(spec["lineage"]["calls"]),
            "runtimeLineage": runtime, "donor": proof["donor"], "coverage": proof["coverage"],
            "matchingSurfaces": proof["surfaces"]["matchingSurfaces"], "matchingTriangles": proof["surfaces"]["matchingTriangles"],
            "removedTriangles": [s["triangles"] for s in proof["surfaces"]["removed"]], "weightedJoints": proof["weightedJoints"],
            "retainedSkinSurfaces": len(retained), "retainedSkinReportSha256": retained_digest,
            "runtimeFileSha256": files}


def refusal(spec, expected_reason):
    try:
        fit.derive(spec)
    except ValueError as error:
        check(str(error) == expected_reason, f"Unexpected rejection: {error}")
        return str(error)
    raise ValueError("Invalid native operation was accepted")


def run(args):
    receipt = read(OLD / "paired-fixed-game-current.json")
    check(read(args.dist / "build-info.json")["sourceDigest"] == receipt["runtimeDigest"], "Wrong fixed game")
    signed = signed_records(args.records, receipt)
    prior = {r["id"]: r for r in read(OLD / "paired-package-check.json")}
    yun = fit.locate_inputs(read(OLD / "yun-recipe.json"), args.archive)
    _, bo = archive.bo_inputs(args.archive.resolve(strict=True), read(OLD / "replay-pins.json")["bo"])
    specs = [{"schema": fit.DISCOVER, "lineage": old["lineage"]} for old in (yun, bo)]
    rows = []
    for spec, role in zip(specs, (archive.YUN, archive.BO), strict=True):
        expected, = [r for r in receipt["records"] if r["bodyType"] == f"native-{role}-v1"]
        rows.append(verify_body(spec, prior[role], expected, signed[expected["id"]], args.dist / "assets"))
    swapped = copy.deepcopy(specs[0])
    swapped["lineage"]["removedVrm"] = specs[1]["lineage"]["removedVrm"]
    incomplete = copy.deepcopy(specs[1])
    calls = incomplete["lineage"]["calls"]
    save, = [pin for pin in calls if Path(pin["path"]).name.endswith("-vroid_save.response.json")]
    calls.remove(save)
    cases = {"yunWithBoRemovedVrm": refusal(swapped, "Reference VRM metadata or rights differ"),
             "boWithoutActualSaveCall": refusal(incomplete, "Removal call chain order differs")}
    check(signed_records(args.records, receipt) == signed, "Signed pair changed after the failures")
    return {"buildSourceDigest": receipt["runtimeDigest"], "signedFileSha256BeforeAndAfter": receipt["recordFileSha256"],
            "schema": fit.DISCOVER, "discoveryRunsPerRole": 2, "rows": rows, "refusals": cases,
            "runtimeAdmission": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--dist", type=Path, required=True)
    parser.add_argument("--records", type=Path, required=True)
    print(json.dumps(run(parser.parse_args()), ensure_ascii=False, indent=2, sort_keys=True))
