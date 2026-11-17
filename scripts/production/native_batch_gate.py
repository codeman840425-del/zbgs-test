"""Evaluate whether native parameter outputs may enter the shared batch lane.

This is deliberately a gate, not a geometry fixer.  A native export may reuse
unchanged assets only when the dependency report says so.  Any changed body,
face, hair, material, or export identity produces an explicit adapter task and
cannot inherit an old fit by matching a label or source template.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SHA = re.compile(r"^[0-9a-f]{64}$")
SCHEMA = "native-production-readiness-v1"

REQUIRED_LANES = (
    "authoring",
    "coldReadback",
    "export",
    "dependencyDelta",
    "bodyPackage",
    "coverage",
    "runtimeCatalog",
    "record",
    "restore",
)

CHECK_TO_ADAPTER = {
    "facialExpressions": "verify-face-expression-admission",
    "headAttachments": "rebuild-head-attachment-fit",
    "handAndMicrophone": "rebuild-hand-grip-fit",
    "garmentsAndCoverage": "rebuild-garment-and-coverage-fit",
    "feetAndFloor": "recompute-foot-floor-and-shoe-fit",
    "seatContact": "recompute-seat-contact-fit",
    "dynamicMotion": "recheck-hair-and-dynamic-simulation",
    "surfaceAndTexture": "rebuild-surface-palette-and-texture-admission",
    "runtimeRecordAndBudget": "rerun-runtime-record-and-budget-check",
}


class GateError(ValueError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise GateError(message)


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_bytes())
    require(isinstance(value, dict), f"Expected object: {path}")
    return value


def pin(path: Path, expected: str | None = None) -> dict[str, Any]:
    raw = path.read_bytes()
    actual = digest(raw)
    if expected is not None:
        require(actual == expected, f"SHA mismatch: {path}")
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": actual, "bytes": len(raw)}


def status_of(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("status", "missing"))
    return "missing"


def package_item(batch: dict[str, Any], item: dict[str, Any], root: Path,
                 runtime_by_body: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    item_id = item.get("id")
    package = item.get("package")
    spec_ref = item.get("spec")
    require(isinstance(item_id, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,60}", item_id),
            "Invalid batch item id")
    require(isinstance(package, str) and package, "Missing package")
    require(isinstance(spec_ref, str), "Missing import spec")
    spec_path = (root / spec_ref).resolve()
    require(spec_path.is_file() and spec_path.is_relative_to(root), f"Missing import spec: {spec_ref}")
    spec = read_json(spec_path)
    require(spec.get("schema") == "native-parameter-factory-staging-v1", "Unsupported package spec")
    folder = spec_path.parent
    provenance = read_json(folder / "provenance.json")
    profile = read_json(folder / "profile-candidate.json")
    recipe = read_json(folder / "recipe.json")
    require(provenance.get("schema") == "native-parameter-body-provenance-v1", "Missing provenance")
    require(profile.get("schema") == "native-factory-profile-input-v1", "Missing profile candidate")
    require(profile.get("recipeSha256") == digest((folder / "recipe.json").read_bytes()), "Recipe pin differs")
    require(provenance.get("recipeValues") == recipe.get("values"), "Recipe values differ from provenance")
    body = folder / spec["bodyFile"]
    require(body.is_file(), "Missing body package")
    require(digest(body.read_bytes()) == spec.get("bodySha256") == provenance.get("bodySha256"), "Body pin differs")

    follow_up = provenance.get("followUp", {})
    adapters: list[dict[str, Any]] = []
    reusable: list[str] = []
    for check_name in sorted(CHECK_TO_ADAPTER):
        state = status_of(follow_up.get(check_name))
        if state == "inputs-unchanged":
            reusable.append(check_name)
        else:
            reasons = follow_up.get(check_name, {}).get("reasons", []) if isinstance(follow_up.get(check_name), dict) else []
            adapters.append({"check": check_name, "task": CHECK_TO_ADAPTER[check_name], "status": state,
                             "reasons": list(reasons)})

    lanes = {lane: "unverified" for lane in REQUIRED_LANES}
    # These are package facts only. Runtime admission is deliberately separate.
    lanes.update(authoring="verified", coldReadback="verified", export="verified",
                 dependencyDelta="verified", bodyPackage="prepared", coverage="prepared")
    runtime_evidence = (runtime_by_body or {}).get(spec.get("bodyType"))
    if runtime_evidence:
        lanes.update(runtimeCatalog="verified", record="verified", restore="verified")
    if provenance.get("runtimeAccepted") is True:
        lanes["runtimeCatalog"] = "verified"
    if provenance.get("visualAccepted") is True:
        lanes["restore"] = "verified"

    blockers = [
        "runtime admission is not granted by an offline package",
        "visual acceptance is not granted by a source screenshot or CPU check",
    ]
    if adapters:
        blockers.append("changed dependencies require exact adapter checks before fit reuse")
    return {
        "id": item_id,
        "package": package,
        "bodyType": spec.get("bodyType"),
        "bodySha256": spec.get("bodySha256"),
        "recipeSha256": profile.get("recipeSha256"),
        "recipeValues": recipe.get("values"),
        "lanes": lanes,
        "reusableChecks": reusable,
        "adapterTasks": adapters,
        "runtimeEvidence": runtime_evidence,
        "blockers": blockers,
        "source": {
            "spec": pin(spec_path),
            "body": pin(body),
            "provenance": pin(folder / "provenance.json"),
            "profile": pin(folder / "profile-candidate.json"),
            "recipe": pin(folder / "recipe.json"),
        },
    }


def runtime_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Read a completed consumer QA report without treating it as visual approval."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Runtime report must be inside repository")
    report = read_json(path)
    require(report.get("status") == "technical-pass", "Runtime report is not a technical pass")
    result = {}
    for item in report.get("inputs", []):
        body = item.get("body", {})
        body_type = body.get("bodyType")
        body_sha = body.get("sha256")
        if isinstance(body_type, str) and SHA.fullmatch(str(body_sha or "")):
            result[body_type] = {"report": pin(path), "recordSha256": item.get("recordSha256"),
                                 "bodySha256": body_sha, "scope": report.get("scope")}
    return result


def evaluate(batch_path: Path, root: Path = ROOT,
             runtime_report: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    batch_path = batch_path.resolve()
    require(batch_path.is_file() and batch_path.is_relative_to(root), "Batch must be inside repository")
    batch = read_json(batch_path)
    require(batch.get("schema") == "native-factory-import-batch-v1", "Unsupported import batch")
    items = batch.get("items")
    require(isinstance(items, list) and items, "Batch is empty")
    runtime_by_body = runtime_index(runtime_report, root) if runtime_report else {}
    rows = [package_item(batch, item, root, runtime_by_body) for item in items]
    ids = [row["id"] for row in rows]
    require(len(ids) == len(set(ids)), "Duplicate batch item")
    return {
        "schema": SCHEMA,
        "batch": pin(batch_path),
        "items": rows,
        "acceptedForRuntime": [row["id"] for row in rows
                                if not row["adapterTasks"] and all(row["lanes"].get(lane) == "verified"
                                                                    for lane in REQUIRED_LANES)],
        "status": "adapter-work-required",
        "summary": {
            "items": len(rows),
            "reusableCheckCount": sum(len(row["reusableChecks"]) for row in rows),
            "adapterTaskCount": sum(len(row["adapterTasks"]) for row in rows),
            "runtimeReadyCount": sum(1 for row in rows
                                      if all(row["lanes"].get(lane) == "verified"
                                             for lane in ("runtimeCatalog", "record", "restore"))),
            "reason": "The gate separates repeatable production from per-body fit and runtime admission.",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime-report", type=Path)
    args = parser.parse_args()
    try:
        report = evaluate(args.batch, runtime_report=args.runtime_report)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(json.dumps(report, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
