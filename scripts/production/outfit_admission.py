"""Read only repository-reviewed, exact whole-outfit admission receipts."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from native_batch_gate import budget_admission_index


ROOT = Path(__file__).resolve().parents[2]
INDEX = Path(__file__).with_name("outfit_admissions.json")
SCHEMA = "zbgs-whole-outfit-runtime-admission-v1"
INDEX_SCHEMA = "zbgs-reviewed-outfit-admissions-v1"
SHA = re.compile(r"^[a-f0-9]{64}$")
COMMIT = re.compile(r"^[a-f0-9]{40}$")
EXTERNAL_BUILD_INPUTS = (
    "assets-source/variant-matrix-v1/representative-matrix.json",
    "assets-source/variant-matrix-v1/representative-batch-request.json",
)
LANES = ("equipmentFit", "normalSpeedMotion", "recordAndRestore", "selectionGuards",
         "runtimeRecordAndBudget", "humanVisualReview", "provenanceAndRights")


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def evidence_pin(path, root=ROOT):
    path = Path(path).resolve()
    require(path.is_relative_to(root.resolve()) and path.is_file(), "Evidence must be a repository file")
    raw = path.read_bytes()
    return {"path": path.relative_to(root.resolve()).as_posix(), "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw)}


def pinned_file(descriptor, root=ROOT):
    require(isinstance(descriptor, dict) and set(descriptor) == {"path","sha256","bytes"} and
            isinstance(descriptor["path"], str) and bool(descriptor["path"]) and
            SHA.fullmatch(str(descriptor["sha256"])) and type(descriptor["bytes"]) is int and descriptor["bytes"] > 0,
            "Missing exact evidence file pin")
    relative = Path(descriptor["path"])
    require(not relative.is_absolute() and ".." not in relative.parts and ":" not in descriptor["path"],
            "Unsafe evidence path")
    path = (root / relative).resolve()
    require(evidence_pin(path, root) == descriptor, "Evidence file pin differs: " + descriptor["path"])
    return path


def normalized_equipment(items):
    require(isinstance(items, list) and bool(items), "Whole outfit requires exact equipment")
    result = {}
    for item in items:
        require(isinstance(item, dict) and set(item) == {"id","slot","sha256"} and
                all(isinstance(item[key], str) and item[key] for key in ("id","slot","sha256")) and
                SHA.fullmatch(item["sha256"]) and item["id"] not in result, "Invalid or duplicate outfit equipment")
        result[item["id"]] = item
    return [result[key] for key in sorted(result)]


def outfit_binding(row, outfit, fit_sha):
    """One exact selection independent of its numeric outfit index or character ID."""
    return {key:row[key] for key in ("styleId","variantVersion","bodyType","bodySha256","recipeSha256",
                                     "resourceManifest","resourceManifestSha256","fitManifest",
                                     "coverageManifest","coverageManifestSha256")} | {
        "fitManifestSha256":fit_sha,
        "role":outfit["role"], "equipment":normalized_equipment(outfit["equipment"]),
    }


def binding_key(binding):
    return json.dumps({**binding,"equipment":normalized_equipment(binding["equipment"])},
                      sort_keys=True,separators=(",",":"))


def runtime_pin(runtime):
    require(isinstance(runtime, dict) and set(runtime) == {"sourceCommit","sourceDigest","buildId"} and
            COMMIT.fullmatch(str(runtime["sourceCommit"])) and SHA.fullmatch(str(runtime["sourceDigest"])) and
            runtime["buildId"] == runtime["sourceDigest"][:12], "Invalid fixed runtime identity")
    return runtime


def record_outfit(record):
    recipe = record["appearanceRecipe"]
    return normalized_equipment([{key:item[key] for key in ("id","slot","sha256")}
                                 for item in recipe["equipment"]["resources"].values()])


def exact_entry(items, key, value):
    matches = [item for item in items if item.get(key) == value]
    require(len(matches) == 1, f"Expected one evidence item by {key}: {value}")
    return matches[0]


def verify_evidence_build(report, runtime):
    require(report["build"]["shortId"] == runtime["buildId"] and
            report["build"]["sourceDigest"] == runtime["sourceDigest"], "Evidence came from a different fixed build")


def verify_room_report(report, record, runtime):
    verify_evidence_build(report,runtime)
    sha = record["integrity"]["recordSha256"]
    require(report["status"] == "technical-pass-visual-candidate" and not report["errors"] and
            report["recordSha256"] == sha == report["restored"]["recordSha256"] and
            report["restored"]["applied"] is True and
            [task["kind"] for task in report["tasks"]] == ["walk","sit","stand","walk"] and
            all(task["state"] == "completed" for task in report["tasks"]),
            "Room used a different record or an incomplete action chain")
    if "schema" in report or "pins" in report or "actors" in report:
        verify_published_room(report, record, runtime)


def verify_published_room(report, record, runtime):
    from math import dist, isfinite
    require(report.get("schema") == "published-rule-workbench-room-v1", "Unknown published room evidence version")
    identity, sha = record["identity"], record["integrity"]["recordSha256"]
    require(report.get("identity") == identity and report.get("pins") == {
        "id":identity["id"], "recordSha":sha, "buildSha":runtime["sourceDigest"]},
        "Room did not pin the exact actor and running build")
    for key in ("restored","reopened"):
        restored = report.get(key) or {}
        require(restored.get("applied") is True and restored.get("identity") == identity and
                restored.get("recordSha256") == sha and restored.get("revision") == record["revision"],
                "Room did not restore the original signed record")
    equipment = record["appearanceRecipe"]["equipment"]
    fields = ("id","slot","url","sha256","compatibleAvatarSha256")
    selected = sorted(({key:item[key] for key in fields} for item in equipment["resources"].values()),
                      key=lambda item:item["slot"])
    actors = report["actors"]
    for stage in ("initial","restored","beforeClose","reopenedInitial","reopenedRestored"):
        actor = actors.get(stage,{})
        require(actor.get("base") == record["appearanceRecipe"]["base"] and actor.get("attached") is True and
                actor.get("manifestUrl") == equipment["manifestUrl"] and actor.get("equipment") == selected and
                actor.get("visible") == sorted(item["id"] for item in selected) and actor.get("root") and actor.get("head"),
                "Wrong actor, body or worn equipment at " + stage)
    for key in ("root","head"):
        require(actors["restored"][key] == actors["beforeClose"][key] and
                actors["beforeClose"][key] != actors["reopenedRestored"][key], "Room instance did not reopen independently")
    tasks = report["tasks"]
    ids = [task.get("requestId") for task in tasks]
    owner = tasks[0].get("ownerId")
    require(all(isinstance(i,str) and i for i in ids) and len(set(ids)) == 4 and owner and
            all(t.get("ownerId") == owner and t.get("admission") == "accepted" for t in tasks),
            "Missing or inconsistent room task identities")
    points = report.get("positions",[])
    require([p.get("requestId") for p in points] == ids, "Missing room movement observations")
    for i in (0,3):
        start,end = points[i]["start"],points[i]["end"]
        require(all(len(p)==3 and all(isinstance(v,(float,int)) and isfinite(v) for v in p) for p in (start,end)),
                "Invalid walk samples")
        require(dist(start[::2],end[::2]) > .05 and dist(end[::2],[tasks[i]["payload"][axis] for axis in ("x","z")]) <= .05,
                "Walk did not move to the requested destination")
    occupied,stand,exit_ = (report["leases"].get(key) or {} for key in ("occupied","afterStand","afterExit"))
    require(occupied.get("state") == "occupied" and occupied.get("requestId") == ids[1] and
            occupied.get("ownerId") == owner and occupied.get("token") and occupied.get("seatId") and
            tasks[1]["result"].get("seatToken") == occupied["token"] and exit_.get("state") == "released" and
            all(lease.get(k) == occupied[k] for lease in (stand,exit_) for k in ("token","ownerId","seatId","requestId")),
            "Seat occupancy or release does not belong to the completed sitting task")


def verify_runtime_readback(report, inventory, record, runtime):
    verify_evidence_build(report,runtime)
    require(inventory.get("schema") == "game-character-record-package-v1" and
            all(inventory["runtime"].get(key) == runtime[key] for key in runtime) and
            report["status"] == "technical-pass-visual-candidate" and not report["errors"] and
            not report["failedAssetResponses"],"Game package or restore report is invalid")
    base = record["appearanceRecipe"]["base"]
    pins = record_outfit(record)
    sha = record["integrity"]["recordSha256"]
    item = exact_entry(inventory["records"],"recordSha256",sha)
    require(item["bodyType"] == base["bodyType"] and item["avatarSha256"] == base["sha256"] and
            sorted(item["equipmentIds"]) == sorted(pin["id"] for pin in pins) and
            {base["sha256"], *(pin["sha256"] for pin in pins)} <= {asset["sha256"] for asset in inventory["files"]},
            "Game package does not pin the complete reviewed outfit")
    states = [exact_entry(report[stage],"id",record["identity"]["id"]) for stage in ("first","reopened")]
    require(all(state["sha"] == sha == state["expectedSha"] and state["body"] == base["bodyType"] and
                all(state[key] is True for key in ("look","props","materials","hairCenter")) for state in states) and
            states[0]["root"] != states[1]["root"], "Game did not reopen the exact record as a new instance")


def verify_guard_report(report, record, runtime):
    verify_evidence_build(report,runtime)
    identity = record["identity"]["id"]
    cases = [row for row in report["cases"] if row["actor"] == identity]
    require(report["status"] == "passed" and not report["pageErrors"] and
            all(row["activeUnchanged"] is True for row in cases) and
            any(row.get("result",{}).get("ok") is False for row in cases) and
            any(isinstance(row.get("resultRevision"),int) for row in cases),
            "Guard report lacks rejection and recovery for this outfit")
    ids = sorted(item["id"] for item in record_outfit(record))
    for stage in ("before","reopened"):
        state = exact_entry(report[stage]["active"],"id",identity)
        require(state["recipeSha256"] == record["integrity"]["recipeSha256"] and
                state["resourceIdentities"] == record["resourceIdentities"] and
                sorted(state["visibleEquipment"]) == ids, "Guard proof belongs to a different outfit or dependency set")


def verify_scope(approval, record):
    runtime_pin(approval.get("runtime"))
    require(approval.get("schema") == SCHEMA and approval.get("status") == "passed",
            "Whole outfit does not carry a passed review")
    binding = approval["binding"]
    for key in ("bodySha256","recipeSha256","resourceManifestSha256","fitManifestSha256","coverageManifestSha256"):
        require(SHA.fullmatch(str(binding.get(key,""))), "Missing whole-outfit binding pin: " + key)
    recipe = record["appearanceRecipe"]
    equipment = recipe["equipment"]
    require(recipe["base"] == {"bodyType":binding["bodyType"],"sha256":binding["bodySha256"]} and
            equipment["role"] == binding["role"], "Reviewed record body or outfit role differs")
    require(record_outfit(record) == normalized_equipment(binding["equipment"]),
            "Reviewed record equipment differs from the whole outfit")
    require(record.get("schema") == "character-record-v1" and
            record["integrity"]["recordSha256"] == approval.get("recordSha256") and
            SHA.fullmatch(str(approval.get("recordSha256",""))) and
            SHA.fullmatch(str(record["integrity"].get("recipeSha256",""))), "Reviewed record identity differs")
    # This planner creates a default appearance with one outfit edit. Wider
    # looks need their own executable inputs and review scope.
    geometry = recipe["geometry"]
    require(all(choice == "original" for choice in recipe["appearance"].values()) and
            not recipe.get("hairAssetSha256") and not recipe.get("surface") and not record.get("nativeHairCenter") and
            geometry.get("mouthWidth") == 0 and all(geometry.get(part) == "none" for part in
                                                  ("browSample","noseSample","eyeSample")) and
            all(item["selection"] == "none" for item in recipe.get("accessories",{}).values()) and
            all(entry["enabled"] is False for entry in record["liveAccessories"]["selections"].values()) and
            all(entry["selection"] is None for entry in record["equipmentMaterials"]["selections"]),
            "Reviewed record has custom appearance beyond the outfit-only production request")
    lanes = approval.get("lanes")
    require(isinstance(lanes,dict) and set(lanes) == set(LANES), "Whole outfit is missing required evidence lanes")
    for lane in LANES:
        result = lanes[lane]
        require(isinstance(result,dict) and set(result) == {"status","evidence"} and result["status"] == "passed" and
                isinstance(result["evidence"],list) and bool(result["evidence"]),
                "Whole outfit evidence has not passed: " + lane)


def load_reviewed_admissions():
    """The index is maintained beside this tool, never supplied by a request or --root."""
    index = json.loads(INDEX.read_bytes())
    require(index.get("schema") == INDEX_SCHEMA and isinstance(index.get("approvals"),list),
            "Invalid reviewed whole-outfit index")
    results = {}
    for descriptor in index["approvals"]:
        approval = json.loads(pinned_file(descriptor).read_bytes())
        record = json.loads(pinned_file(approval["record"]).read_bytes())
        verify_scope(approval, record)
        reviewed = json.loads(pinned_file(approval["reviewedRuntime"]).read_bytes())
        runtime = approval["runtime"]
        require(reviewed.get("schema") == "reviewed-game-character-runtime-v1" and
                all(reviewed.get(key) == runtime[key] for key in ("sourceCommit","sourceDigest")) and
                "record-consumer.html" in reviewed.get("files",{}), "Approved outfit has no matching reviewed runtime")
        fixed_info = approval["buildInfo"]
        info = json.loads(pinned_file(fixed_info).read_bytes())
        require(reviewed["files"].get("build-info.json") == {key:fixed_info[key] for key in ("sha256","bytes")} and
                info.get("sourceDigest") == runtime["sourceDigest"] and info.get("shortId") == runtime["buildId"],
                "Fixed build metadata differs from the reviewed runtime")
        proofs = {name:[pinned_file(ref) for ref in lane["evidence"]] for name,lane in approval["lanes"].items()}
        motion = proofs["normalSpeedMotion"]
        restore = proofs["recordAndRestore"]
        guards = proofs["selectionGuards"]
        budget_refs = proofs["runtimeRecordAndBudget"]
        require(len(motion) >= 2 and any(file.suffix.lower() == ".webm" for file in motion[1:]) and
                len(restore) >= 2 and len(budget_refs) == 1, "Missing motion footage, package readback or four-layer budget")
        verify_room_report(json.loads(motion[0].read_bytes()),record,runtime)
        verify_runtime_readback(json.loads(restore[0].read_bytes()),json.loads(restore[1].read_bytes()),record,runtime)
        verify_guard_report(json.loads(guards[0].read_bytes()),record,runtime)
        budget = budget_admission_index(budget_refs[0]).get(approval["binding"]["bodySha256"])
        require(budget and budget["bodyType"] == approval["binding"]["bodyType"] and
                budget["recordSha256"] == approval["recordSha256"],
                "Four-layer budget must cover the exact approved record")
        key = binding_key(approval["binding"])
        require(key not in results, "Duplicate reviewed whole outfit")
        results[key] = {"runtime":runtime,"approval":descriptor,"recordSha256":approval["recordSha256"],
                        "buildInfo":fixed_info}
    return results


def source_commit(root):
    def git(*args):
        try:
            return subprocess.check_output(["git","-C",str(root),*args],encoding="utf-8",
                                           stderr=subprocess.DEVNULL).strip()
        except (OSError,subprocess.CalledProcessError) as error:
            raise ValueError("Formal outfit planning requires an exact Git checkout") from error
    require(Path(git("rev-parse","--show-toplevel")).resolve() == root.resolve(),
            "Formal outfit planning requires an exact repository checkout")
    require(not git("status","--porcelain=v1","--untracked-files=all","--",
                    "prototype", *EXTERNAL_BUILD_INPUTS),
            "Fixed outfit runtime source or its compiled matrix inputs have local changes")
    return git("rev-parse","HEAD")


def verify_runtime_source(root, approval):
    build = json.loads(pinned_file(approval["buildInfo"]).read_bytes())
    inputs = build.get("inputs")
    require(isinstance(inputs,list) and inputs and all(isinstance(name,str) for name in inputs) and
            len(set(inputs)) == len(inputs), "Fixed build source inventory is missing or duplicated")
    digest = hashlib.sha256()
    project = (root / "prototype").resolve()
    for name in inputs:
        if name.startswith("../") and name[3:] in EXTERNAL_BUILD_INPUTS:
            source = (root / name[3:]).resolve()
            require(source.is_relative_to(root.resolve()), "Compiled style matrix escapes the checkout")
        else:
            relative = Path(name)
            require(not relative.is_absolute() and ":" not in name and ".." not in relative.parts,
                    "Invalid fixed runtime source path")
            source = (project / relative).resolve()
            require(source.is_relative_to(project), "Fixed runtime source path escapes the checkout")
        digest.update(name.encode("utf-8")+b"\0"+source.read_bytes()+b"\0")
    require(digest.hexdigest() == approval["runtime"]["sourceDigest"],
            "Fixed runtime source bytes differ from the reviewed whole outfit")
