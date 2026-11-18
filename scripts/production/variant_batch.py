"""Plan deterministic game-character records from a fixed style matrix.

Production requests use an exact body-specific matrix row and a separately
reviewed receipt for the complete configured outfit and fixed runtime. Diagnostic
requests use the same outfit resolution and remain technical candidates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import time
from tempfile import TemporaryDirectory
from pathlib import Path

from variant_matrix import validate_matrix_files, _resolve_reference
from outfit_admission import binding_key, load_reviewed_admissions, outfit_binding, source_commit, verify_runtime_source


SCHEMA = "zbgs-style-variant-batch-request-v1"
OUT_SCHEMA = "zbgs-style-variant-batch-plan-v1"
ID = re.compile(r"^[a-z][a-z0-9-]{1,95}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
QUERY_SCRIPT = "scripts/production/variant_batch_query.mjs"
FIXED_MATRIX = "assets-source/variant-matrix-v1/representative-matrix.json"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def pin(root: Path, reference: str) -> dict:
    path = _resolve_reference(root, reference)
    raw = path.read_bytes()
    return {"path": path.relative_to(root).as_posix(),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw)}


def matrix_rows(matrix: dict) -> dict[tuple[str, str, str], dict]:
    return {(style["styleId"], variant["bodyType"], variant["variantVersion"]): {
        "styleId": style["styleId"],
        "label": style.get("label", style["styleId"]),
        **variant,
    } for style in matrix["styles"] for variant in style["variants"]}


def variant_key(item):
    return tuple(item.get(key) for key in ("styleId", "bodyType", "variantVersion"))


def batch_items(request):
    items = request.get("items")
    check(isinstance(items, list) and items, "Batch request items must be non-empty")
    if "sharedLook" not in request:
        return items
    shared = request["sharedLook"]
    check(isinstance(shared, dict) and set(shared) == {"styleId", "variantVersion", "outfitRole"} and
          all(isinstance(v, str) and ID.fullmatch(v) for v in shared.values()), "Invalid sharedLook")
    expanded = []
    for item in items:
        if not isinstance(item, dict) or set(item) != {"bodyType", "identity"}:
            # Keep per-item errors isolated, including attempted overrides of the shared style.
            expanded.append({"itemError": "Shared looks require only bodyType and identity per item"})
            continue
        identity = item["identity"]
        expanded.append({**item, "stableId": identity.get("id") if isinstance(identity, dict) else None,
                         "styleId":shared["styleId"], "variantVersion":shared["variantVersion"],
                         "outfit":{"role":shared["outfitRole"]}})
    return expanded


def resource_member(row, root):
    reference, _, member = row["resourceManifest"].partition("#")
    check(bool(member), "Variant must identify its exact equipment member in resourceManifest")
    data = _resolve_reference(root, reference).read_bytes()
    check(hashlib.sha256(data).hexdigest() == row["resourceManifestSha256"], "Variant equipment manifest pin differs")
    items = json.loads(data).get("items", [])
    matches = [entry for entry in items if entry.get("id") == member]
    check(len(matches) == 1, "Variant equipment must be unique in its pinned manifest")
    entry, = matches
    check(entry.get("compatibleAvatarSha256") == row["bodySha256"] and SHA.fullmatch(str(entry.get("sha256", ""))),
          "Variant equipment body identity or hash differs")
    return {"id": member, "slot": entry["slot"], "sha256": entry["sha256"]}


def outfit_pins(pins):
    check(isinstance(pins, list) and bool(pins), "Outfit must list all exact equipment")
    checked = []
    for pin in pins:
        check(isinstance(pin, dict) and set(pin) == {"id", "slot", "sha256"} and
              isinstance(pin["id"], str) and bool(pin["id"]) and
              isinstance(pin["slot"], str) and bool(pin["slot"]) and SHA.fullmatch(str(pin["sha256"])),
              "Outfit equipment requires exact id, slot and sha256")
        checked.append((pin["id"], pin["slot"], pin["sha256"]))
    check(len({pin[0] for pin in checked}) == len(checked), "Duplicate outfit equipment ID")
    return sorted(checked)


def production_request(item, row, query, member):
    identity = item.get("identity")
    check(isinstance(identity, dict) and set(identity) == {"id", "name", "gender"} and
          identity["id"] == item["stableId"], "Specify identity.id, name and gender; identity.id must equal stableId")
    for key, limit in (("name", 160), ("gender", 40)):
        text = identity[key]
        check(isinstance(text, str) and bool(text.strip()) and len(text.encode("utf-16-le")) // 2 <= limit,
              f"Specify an explicit identity.{key}")
    chosen = item.get("outfit")
    check(isinstance(chosen, dict) and set(chosen) in ({"role"}, {"role", "equipment"}) and
          isinstance(chosen["role"], str) and bool(chosen["role"]), "Specify the configured outfit role")
    requested_pins = outfit_pins(chosen["equipment"]) if "equipment" in chosen else None
    check(bool(query) and query.get("ok") is True, (query or {}).get("error", "No verified runtime query for this body"))
    body = query["body"]
    check(body["bodyType"] == row["bodyType"] and body["sha256"] == row["bodySha256"],
          "Runtime query body differs from the matrix")
    matches = [outfit for outfit in query["outfits"] if outfit["role"] == chosen["role"] and
               (requested_pins is None or outfit_pins(outfit["equipment"]) == requested_pins)]
    check(len(matches) == 1, "No unique configured outfit for the requested role and equipment pins")
    pins = outfit_pins(matches[0]["equipment"])
    check(bool(member) and outfit_pins([member])[0] in pins, "Configured outfit does not contain the exact matrix equipment")
    index = matches[0]["index"]
    check(type(index) is int and index >= 0, "Runtime query returned an invalid outfit index")
    return {"schema": "character-production-request-v1", "operation": "create", "bodyType": row["bodyType"],
            "identity": dict(identity), "edits": [{"domain": "outfit", "selection": {
                "bodySha256":body["sha256"], "role":chosen["role"],
                "equipment":[dict(id=id_, slot=slot, sha256=sha) for id_, slot, sha in pins],
            }}]}


def eligible_variant(row, diagnostic):
    return row.get("status") in {"candidate", "runtime-admitted"} and (
        diagnostic or row.get("budgetStatus") != "reject-static-over-budget")


def plan(matrix: dict, request: dict, *, queries=None, members=None, diagnostic=False,
         fit_shas=None, admissions=None, runtime_commit=None) -> dict:
    check(request.get("schema") == SCHEMA, "Invalid style variant batch request schema")
    batch_id = request.get("batchId")
    check(isinstance(batch_id, str) and ID.fullmatch(batch_id), "Invalid batchId")
    items = batch_items(request)
    rows = matrix_rows(matrix)
    seen: set[str] = set()
    planned = []
    for item in items:
        result = {"status": "rejected"}
        try:
            check(isinstance(item, dict), "item must be an object")
            check("itemError" not in item, str(item.get("itemError")))
            stable_id = item.get("stableId")
            style_id = item.get("styleId")
            body_type = item.get("bodyType")
            version = item.get("variantVersion")
            check(isinstance(stable_id, str) and ID.fullmatch(stable_id), "Invalid stableId")
            check(stable_id not in seen, f"Duplicate stableId: {stable_id}")
            seen.add(stable_id)
            check(isinstance(style_id, str) and ID.fullmatch(style_id), "Invalid styleId")
            check(isinstance(body_type, str) and ID.fullmatch(body_type), "Invalid bodyType")
            check(isinstance(version, str) and ID.fullmatch(version), "Invalid variantVersion")
            row = rows.get((style_id, body_type, version))
            check(row is not None, f"No exact variant for {style_id}/{body_type}/{version}")
            if not eligible_variant(row, diagnostic):
                details = []
                if row.get("status") == "rejected":
                    details.append("variant explicitly rejected")
                if row.get("budgetStatus") == "reject-static-over-budget":
                    details.append("static budget over limit")
                blockers = row.get("admissionBlockers")
                if isinstance(blockers, list) and blockers:
                    details.append("blockers: " + ", ".join(str(item) for item in blockers))
                suffix = f" ({'; '.join(details)})" if details else ""
                raise ValueError(f"runtime admission pending for {style_id}/{body_type}{suffix}")
            if row.get("status") == "runtime-admitted":
                check(isinstance(row.get("admissionEvidence"), str) and row["admissionEvidence"],
                      "runtime-admitted variant has no admission evidence")
                check(SHA.fullmatch(str(row.get("recipeSha256") or "")),
                      "runtime-admitted variant has no parameter recipe identity")
            if not diagnostic:
                check(admissions, "Whole-outfit runtime admission evidence is required from the reviewed index")
                check(SHA.fullmatch(str(row.get("recipeSha256") or "")),
                      "Whole-outfit runtime admission requires an exact parameter recipe identity")
                if row["status"] == "candidate":
                    check(isinstance(row.get("recipeSource"), str) and bool(row["recipeSource"]),
                          "Whole-outfit candidate requires its pinned parameter recipe source")
            for key in ("bodySha256", "resourceManifestSha256", "coverageManifestSha256"):
                check(SHA.fullmatch(str(row.get(key) or "")), f"Invalid {key}")
            member = (members or {}).get(variant_key(item))
            check(not isinstance(member, str), member)
            executable = production_request(item, row, (queries or {}).get(body_type), member)
            outfit = executable["edits"][0]["selection"]
            approval = None
            if not diagnostic:
                fit_sha = (fit_shas or {}).get(variant_key(item))
                approval = (admissions or {}).get(binding_key(outfit_binding(row, outfit, fit_sha)))
                check(approval, "Whole-outfit runtime admission evidence is required for this exact body, version and equipment")
                check(approval["runtime"]["sourceCommit"] == runtime_commit,
                      "Whole-outfit admission requires its reviewed runtime source commit")
            result.update({
                "status": "candidate" if diagnostic else "accepted",
                "stableId": stable_id,
                "request": executable,
                "selection": {
                    "styleId": style_id,
                    "variantVersion": version,
                    "bodySha256": row["bodySha256"],
                    "recipeSha256": row.get("recipeSha256"),
                    "resourceManifest": row["resourceManifest"],
                    "resourceManifestSha256": row["resourceManifestSha256"],
                    "fitManifest": row["fitManifest"],
                    "coverageManifest": row["coverageManifest"],
                    "coverageManifestSha256": row["coverageManifestSha256"],
                    "admissionEvidence": row.get("admissionEvidence"),
                    "outfit": outfit,
                    **({"wholeOutfitAdmission":approval} if approval else {}),
                },
            })
        except (TypeError, ValueError, KeyError) as error:
            result["reason"] = str(error)
            if isinstance(item, dict) and isinstance(item.get("stableId"), str):
                result["stableId"] = item["stableId"]
        planned.append(result)
    accepted = sum(row["status"] == "accepted" for row in planned)
    candidates = sum(row["status"] == "candidate" for row in planned)
    return {
        "schema": OUT_SCHEMA,
        "batchId": batch_id,
        "mode": "technical-candidate" if diagnostic else "runtime-admitted" if accepted else "readiness-gated",
        "items": planned,
        "acceptedCount": accepted,
        **({"candidateCount": candidates} if diagnostic else {}),
        "rejectedCount": len(planned) - accepted - candidates,
    }


def resolve_runtime(matrix, request, root, diagnostic, has_admissions):
    rows = matrix_rows(matrix)
    queries, members, fit_shas = {}, {}, {}
    for item in batch_items(request):
        if not isinstance(item, dict) or not all(isinstance(value, str) for value in variant_key(item)):
            continue
        key = variant_key(item)
        row = rows.get(key)
        if not row or not eligible_variant(row, diagnostic):
            continue
        if not diagnostic and (not has_admissions or not SHA.fullmatch(str(row.get("recipeSha256") or ""))):
            continue
        try:
            members[key] = resource_member(row, root)
            if not diagnostic:
                fit_shas[key] = pin(root, row["fitManifest"])["sha256"]
        except (KeyError, OSError, TypeError, ValueError) as error:
            members[key] = str(error)
            continue
        body = row["bodyType"]
        if body in queries:
            continue
        result = subprocess.run(["node", QUERY_SCRIPT, body], cwd=root, text=True, encoding="utf-8",
                                capture_output=True, check=False)
        if result.returncode:
            queries[body] = {"ok":False, "error":result.stderr.strip() or "Runtime query failed"}
        else:
            queries[body] = json.loads(result.stdout)
    return queries, members, fit_shas


def publish_plan(package: Path, output: Path):
    # Windows may briefly lock a just-written directory for indexing. Retry
    # only the atomic rename, without recreating requests or replacing output.
    for delay in (0.025, 0.05, 0.1, 0.2, None):
        check(not output.exists(), "Output already exists")
        try:
            package.rename(output)
            return
        except PermissionError as error:
            if delay is None or getattr(error, 'winerror', None) not in (5, 32, 33):
                raise
            time.sleep(delay)


def run(matrix_path: Path, request_path: Path, output: Path, root: Path, diagnostic=False) -> dict:
    matrix = read_json(matrix_path)
    errors = validate_matrix_files(matrix, root)
    check(not errors, "; ".join(errors))
    check(not output.exists(), "Output already exists")
    request = read_json(request_path)
    admissions = {} if diagnostic else load_reviewed_admissions()
    if admissions:
        check(matrix_path == (root / FIXED_MATRIX).resolve(), "Formal outfit planning requires the compiled fixed matrix")
    runtime_commit = source_commit(root) if admissions else None
    reviewed_builds = {approval["runtime"]["sourceDigest"]: approval for approval in admissions.values()
                       if approval["runtime"]["sourceCommit"] == runtime_commit}
    for approval in reviewed_builds.values():
        verify_runtime_source(root, approval)
    queries, members, fit_shas = resolve_runtime(matrix, request, root, diagnostic, bool(admissions))
    if runtime_commit:
        check(source_commit(root) == runtime_commit, "Fixed outfit runtime source changed while planning")
    result = plan(matrix, request, queries=queries, members=members, diagnostic=diagnostic,
                  fit_shas=fit_shas, admissions=admissions, runtime_commit=runtime_commit)
    result["source"] = {
        "matrix": pin(root, matrix_path.relative_to(root).as_posix()),
        "request": pin(root, request_path.relative_to(root).as_posix()),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent, prefix=".variant-batch-") as temp:
        package = Path(temp) / "batch"
        requests = package / ("diagnostic-requests" if diagnostic else "requests")
        requests.mkdir(parents=True)
        jobs = []
        for row in result["items"]:
            if row["status"] not in ("accepted", "candidate"):
                continue
            path = requests / f"{row['stableId']}.request.json"
            job = row.pop("request")
            jobs.append(job)
            data = (json.dumps(job, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            path.write_bytes(data)
            row["requestPin"] = {"path":path.relative_to(package).as_posix(),
                                 "sha256":hashlib.sha256(data).hexdigest(), "bytes":len(data)}
        result["creationBatches"] = []
        for start in range(0, len(jobs), 4):
            group = jobs[start:start + 4]
            path = requests / f"create-{start // 4 + 1:03d}.batch.json"
            payload = {"schema":"character-production-batch-create-v1", "requests":group}
            data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            path.write_bytes(data)
            result["creationBatches"].append({
                "ids":[job["identity"]["id"] for job in group],
                "path":path.relative_to(package).as_posix(),
                "sha256":hashlib.sha256(data).hexdigest(), "bytes":len(data),
            })
        (package / "plan.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        publish_plan(package, output)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("matrix", type=Path)
    parser.add_argument("request", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--diagnostic", action="store_true", help="Emit explicitly mapped test requests without granting runtime admission")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.matrix.resolve(), args.request.resolve(), args.output.resolve(), args.root.resolve(),
                             diagnostic=args.diagnostic), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
