"""Plan deterministic game-character records from an admitted style matrix.

This is the batch seam between an art-production agent and the game record
consumer. It does not create new meshes or infer a fit. Every requested
combination must resolve to one exact body-specific matrix row that has
runtime admission evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from variant_matrix import validate_matrix_files, _resolve_reference


SCHEMA = "zbgs-style-variant-batch-request-v1"
OUT_SCHEMA = "zbgs-style-variant-batch-plan-v1"
ID = re.compile(r"^[a-z][a-z0-9-]{1,95}$")
SHA = re.compile(r"^[a-f0-9]{64}$")


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


def plan(matrix: dict, request: dict) -> dict:
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
            if row.get("status") != "runtime-admitted":
                details = []
                if row.get("budgetStatus") == "reject-static-over-budget":
                    details.append("static budget over limit")
                blockers = row.get("admissionBlockers")
                if isinstance(blockers, list) and blockers:
                    details.append("blockers: " + ", ".join(str(item) for item in blockers))
                suffix = f" ({'; '.join(details)})" if details else ""
                raise ValueError(f"runtime admission pending for {style_id}/{body_type}{suffix}")
            check(isinstance(row.get("admissionEvidence"), str) and row["admissionEvidence"],
                  "runtime-admitted variant has no admission evidence")
            check(SHA.fullmatch(str(row.get("recipeSha256") or "")),
                  "runtime-admitted variant has no parameter recipe identity")
            for key in ("bodySha256", "resourceManifestSha256", "coverageManifestSha256"):
                check(SHA.fullmatch(str(row.get(key) or "")), f"Invalid {key}")
            result.update({
                "status": "accepted",
                "stableId": stable_id,
                "request": {
                    "schema": "character-production-request-v1",
                    "operation": "create",
                    "identity": {"id": stable_id, "name": stable_id},
                    "bodyType": body_type,
                    "appearance": {
                        "styleId": style_id,
                        "variantVersion": version,
                        "bodySha256": row["bodySha256"],
                        "recipeSha256": row["recipeSha256"],
                        "resourceManifest": row["resourceManifest"],
                        "fitManifest": row["fitManifest"],
                        "coverageManifest": row["coverageManifest"],
                    },
                    "admissionEvidence": row["admissionEvidence"],
                },
            })
        except (TypeError, ValueError, KeyError) as error:
            result["reason"] = str(error)
            if isinstance(item, dict) and isinstance(item.get("stableId"), str):
                result["stableId"] = item["stableId"]
        planned.append(result)
    accepted = sum(row["status"] == "accepted" for row in planned)
    return {
        "schema": OUT_SCHEMA,
        "batchId": batch_id,
        "mode": "runtime-admitted" if accepted else "readiness-gated",
        "items": planned,
        "acceptedCount": accepted,
        "rejectedCount": len(planned) - accepted,
    }


def run(matrix_path: Path, request_path: Path, output: Path, root: Path) -> dict:
    matrix = read_json(matrix_path)
    errors = validate_matrix_files(matrix, root)
    check(not errors, "; ".join(errors))
    result = plan(matrix, read_json(request_path))
    check(not output.exists(), "Output already exists")
    output.mkdir(parents=True)
    requests = output / "requests"
    requests.mkdir()
    for row in result["items"]:
        if row["status"] != "accepted":
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
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.matrix.resolve(), args.request.resolve(), args.output.resolve(), args.root.resolve()), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
