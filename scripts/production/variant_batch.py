"""Plan deterministic game-character records from an admitted style matrix.

Production requests use an exact body-specific matrix row with runtime
admission evidence and an explicitly pinned configured outfit. Diagnostic
requests use the same outfit resolution and remain technical candidates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

from variant_matrix import validate_matrix_files, _resolve_reference


SCHEMA = "zbgs-style-variant-batch-request-v1"
OUT_SCHEMA = "zbgs-style-variant-batch-plan-v1"
ID = re.compile(r"^[a-z][a-z0-9-]{1,95}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
QUERY_SCRIPT = "scripts/production/variant_batch_query.mjs"


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


def production_request(item, row, query, member, diagnostic):
    identity = item.get("identity")
    check(isinstance(identity, dict) and set(identity) == {"id", "name", "gender"} and
          identity["id"] == item["stableId"], "Specify identity.id, name and gender; identity.id must equal stableId")
    for key, limit in (("name", 160), ("gender", 40)):
        text = identity[key]
        check(isinstance(text, str) and bool(text.strip()) and len(text.encode("utf-16-le")) // 2 <= limit,
              f"Specify an explicit identity.{key}")
    chosen = item.get("outfit")
    check(isinstance(chosen, dict) and set(chosen) == {"role", "equipment"} and
          isinstance(chosen["role"], str) and bool(chosen["role"]), "Specify outfit role and exact equipment")
    pins = outfit_pins(chosen["equipment"])
    check(bool(query) and query.get("ok") is True, (query or {}).get("error", "No verified runtime query for this body"))
    body = query["body"]
    check(body["bodyType"] == row["bodyType"] and body["sha256"] == row["bodySha256"],
          "Runtime query body differs from the matrix")
    matches = [outfit for outfit in query["outfits"] if outfit["role"] == chosen["role"] and
               outfit_pins(outfit["equipment"]) == pins]
    check(len(matches) == 1, "No unique configured outfit for the requested role and equipment pins")
    check(bool(member) and outfit_pins([member])[0] in pins, "Configured outfit does not contain the exact matrix equipment")
    # The current matrix admission belongs to one garment. A configured and
    # loadable set still needs its own complete runtime admission evidence.
    check(diagnostic or len(pins) == 1, "Whole-outfit runtime admission evidence is required; matrix admission covers one equipment member")
    index = matches[0]["index"]
    check(type(index) is int and index >= 0, "Runtime query returned an invalid outfit index")
    return {"schema": "character-production-request-v1", "operation": "create", "bodyType": row["bodyType"],
            "identity": dict(identity), "edits": [{"domain": "outfit", "index": index}]}


def plan(matrix: dict, request: dict, *, queries=None, members=None, diagnostic=False) -> dict:
    check(request.get("schema") == SCHEMA, "Invalid style variant batch request schema")
    batch_id = request.get("batchId")
    check(isinstance(batch_id, str) and ID.fullmatch(batch_id), "Invalid batchId")
    items = request.get("items")
    check(isinstance(items, list) and items, "Batch request items must be non-empty")
    rows = matrix_rows(matrix)
    seen: set[str] = set()
    planned = []
    for item in items:
        result = {"status": "rejected"}
        try:
            check(isinstance(item, dict), "item must be an object")
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
            if row.get("status") != "runtime-admitted" and not (diagnostic and row.get("status") == "candidate"):
                details = []
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
            for key in ("bodySha256", "resourceManifestSha256", "coverageManifestSha256"):
                check(SHA.fullmatch(str(row.get(key) or "")), f"Invalid {key}")
            member = (members or {}).get(variant_key(item))
            check(not isinstance(member, str), member)
            executable = production_request(item, row, (queries or {}).get(body_type), member, diagnostic)
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
                    "outfit": item["outfit"],
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


def resolve_runtime(matrix, request, root, diagnostic):
    rows = matrix_rows(matrix)
    queries, members = {}, {}
    for item in request.get("items", []):
        if not isinstance(item, dict) or not all(isinstance(value, str) for value in variant_key(item)):
            continue
        key = variant_key(item)
        row = rows.get(key)
        if not row or row["status"] not in ({"runtime-admitted", "candidate"} if diagnostic else {"runtime-admitted"}):
            continue
        try:
            members[key] = resource_member(row, root)
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
    return queries, members


def run(matrix_path: Path, request_path: Path, output: Path, root: Path, diagnostic=False) -> dict:
    matrix = read_json(matrix_path)
    errors = validate_matrix_files(matrix, root)
    check(not errors, "; ".join(errors))
    check(not output.exists(), "Output already exists")
    request = read_json(request_path)
    queries, members = resolve_runtime(matrix, request, root, diagnostic)
    result = plan(matrix, request, queries=queries, members=members, diagnostic=diagnostic)
    output.mkdir(parents=True)
    requests = output / ("diagnostic-requests" if diagnostic else "requests")
    requests.mkdir()
    for row in result["items"]:
        if row["status"] not in ("accepted", "candidate"):
            continue
        path = requests / f"{row['stableId']}.request.json"
        path.write_text(json.dumps(row["request"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        row["requestPin"] = {"path": path.relative_to(output).as_posix(),
                              "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                              "bytes": path.stat().st_size}
        del row["request"]
    result["source"] = {
        "matrix": pin(root, matrix_path.relative_to(root).as_posix()),
        "request": pin(root, request_path.relative_to(root).as_posix()),
    }
    (output / "plan.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
