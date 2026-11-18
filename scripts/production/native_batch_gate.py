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
AGGREGATE_SCHEMA = "native-production-readiness-aggregate-v1"

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

# A report can only clear the task it explicitly covers.  The current shared
# adapter report predates the optional ``checks`` field, so its schema remains
# a compatibility alias for the expression check.  Unknown report schemas are
# rejected instead of being allowed to clear an unrelated task.
ADAPTER_SCHEMA_CHECKS = {
    "native-eye-blink-adapter-regression-v1": ("facialExpressions",),
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


def verify_package_inventory(spec: dict[str, Any], root: Path, body_sha: str) -> None:
    """Verify the staged package and coverage manifest before marking lanes verified."""
    files = spec.get("files")
    require(isinstance(files, dict), "Missing package file inventory")
    resolved: dict[str, Path] = {}
    for name, ref in files.items():
        require(isinstance(name, str) and isinstance(ref, list) and len(ref) == 2,
                "Invalid package file inventory")
        path = (root / str(ref[0])).resolve()
        require(path.is_file() and path.is_relative_to(root), f"Missing package file: {name}")
        require(SHA.fullmatch(str(ref[1])) and digest(path.read_bytes()) == ref[1],
                f"Package file pin differs: {name}")
        resolved[name] = path
    for required in ("body.vrm", "equipment.json", "manifest.json", "native-tops-body.png"):
        require(required in resolved, f"Package inventory missing {required}")

    manifest = read_json(resolved["manifest.json"])
    require(manifest.get("schema") == "native-body-texture-coverage-v1", "Unsupported coverage manifest")
    require(manifest.get("avatarSha256") == body_sha, "Coverage avatar pin differs")
    covered = manifest.get("covered")
    require(isinstance(covered, dict) and isinstance(covered.get("url"), str), "Missing coverage asset")
    covered_path = resolved.get(covered["url"])
    require(covered_path is not None and digest(covered_path.read_bytes()) == covered.get("sha256"),
            "Coverage asset pin differs")

    equipment = read_json(resolved["equipment.json"])
    require(equipment.get("schema") == "zbgs-equipment-v1", "Unsupported equipment manifest")
    equipment_rows = equipment.get("items")
    coverage_rows = manifest.get("equipment")
    require(isinstance(equipment_rows, list) and isinstance(coverage_rows, list), "Missing equipment rows")
    require({row.get("id") for row in equipment_rows} == {row.get("id") for row in coverage_rows},
            "Equipment and coverage rows differ")
    for row in coverage_rows:
        require(row.get("compatibleAvatarSha256") == body_sha and isinstance(row.get("id"), str),
                "Equipment avatar pin differs")
        matching = next((item for item in equipment_rows if item.get("id") == row["id"]), None)
        require(isinstance(matching, dict) and matching.get("compatibleAvatarSha256") == body_sha,
                "Equipment binding pin differs")
        url = matching.get("url")
        require(isinstance(url, str) and url in resolved and digest(resolved[url].read_bytes()) == matching.get("sha256"),
                "Equipment asset pin differs")


def package_item(batch: dict[str, Any], item: dict[str, Any], root: Path,
                 runtime_by_body: dict[str, dict[str, Any]] | None = None,
                 adapter_by_body: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
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
    verify_package_inventory(spec, root, spec["bodySha256"])

    provenance_pin = pin(folder / "provenance.json")

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
                             "reasons": list(reasons),
                             "evidence": {"report": provenance_pin, "role": "dependency-follow-up"}})
    adapter_evidence = (adapter_by_body or {}).get(spec.get("bodySha256"))
    resolved_checks: dict[str, dict[str, Any]] = {}
    if adapter_evidence:
        for check_name in adapter_evidence.get("checks", ()):
            if check_name in CHECK_TO_ADAPTER and any(row["check"] == check_name for row in adapters):
                resolved_checks[check_name] = {"status": "passed", "evidence": adapter_evidence}
        adapters = [row for row in adapters if row["check"] not in resolved_checks]

    lanes = {lane: "unverified" for lane in REQUIRED_LANES}
    # These are package facts only. Runtime admission is deliberately separate.
    lanes.update(authoring="verified", coldReadback="verified", export="verified",
                 dependencyDelta="verified", bodyPackage="verified", coverage="verified")
    runtime_evidence = (runtime_by_body or {}).get(spec.get("bodyType"))
    if runtime_evidence and runtime_evidence.get("bodySha256") != spec.get("bodySha256"):
        # A body label is not an identity. Keep a mismatched runtime report
        # diagnostic-only so an old body revision cannot clear these lanes.
        runtime_evidence = None
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
        pending_checks = ", ".join(task["check"] for task in adapters)
        blockers.append(f"pending adapter checks require exact evidence before fit reuse: {pending_checks}")
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
        "adapterEvidence": adapter_evidence,
        "resolvedChecks": resolved_checks,
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
            require(body_type not in result, f"Runtime report has duplicate body type: {body_type}")
            require(SHA.fullmatch(str(item.get("recordSha256") or "")),
                    f"Runtime report record identity is incomplete: {body_type}")
            result[body_type] = {"report": pin(path), "recordSha256": item.get("recordSha256"),
                                 "bodySha256": body_sha, "scope": report.get("scope")}
    return result


def adapter_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Read a shared adapter regression and index it by exact body SHA."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Adapter report must be inside repository")
    report = read_json(path)
    require(report.get("status") == "passed", "Adapter report is not a pass")
    checks = report.get("checks")
    if checks is None:
        checks = ADAPTER_SCHEMA_CHECKS.get(report.get("schema"), ())
    require(isinstance(checks, (list, tuple)) and checks and
            all(isinstance(check, str) and check in CHECK_TO_ADAPTER for check in checks),
            "Adapter report must declare supported checks")
    checks = tuple(dict.fromkeys(checks))
    result = {}
    for item in report.get("native", []):
        body_sha = item.get("sourceSha256")
        if isinstance(body_sha, str) and SHA.fullmatch(body_sha):
            result[body_sha] = {"report": pin(path), "bodyType": item.get("bodyType"),
                                "targetCount": item.get("targetCount"), "targetedMeshes": item.get("targetedMeshes"),
                                "protectedMeshes": item.get("protectedMeshes"), "scope": report.get("scope"),
                                "checks": list(checks)}
    return result


def candidate_adaptation_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach non-clearing source audits to a batch row.

    These reports describe reusable structure and the exact checks still needed.
    They are deliberately diagnostic evidence: only an adapter report with a
    passed status may clear a gate task.
    """
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Adaptation report must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-batch-adaptation-admission-v1",
            "Unsupported adaptation report")
    result = {}
    for item in report.get("candidates", []):
        body = item.get("body", {})
        body_sha = body.get("sha256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Adaptation report body identity is incomplete")
        result[body_sha] = {
            "report": pin(path),
            "bodySha256": body_sha,
            "candidateId": item.get("id"),
            "dynamicMotion": item.get("dynamicMotion"),
            "surfaceAndTexture": item.get("surfaceAndTexture"),
            "scope": "source-side structure and texture contract; no runtime or visual admission",
        }
    require(result, "Adaptation report has no candidates")
    return result


def runtime_head_audit_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach budget and head-fit audit evidence without clearing a task."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Runtime audit must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-batch-runtime-budget-head-attachment-audit-v1",
            "Unsupported runtime/head audit")
    result = {}
    for row in report.get("records", []):
        body_sha = row.get("bodySha256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Runtime audit body identity is incomplete")
        result[body_sha] = {
            "report": pin(path),
            "recordPath": row.get("path"),
            "bodySha256": body_sha,
            "budget": report.get("budget"),
            "headAttachments": report.get("headAttachments"),
            "scope": "runtime record/budget and head attachment audit; no visual or ordinary-PC pass",
        }
    require(result, "Runtime/head audit has no records")
    return result


def accessory_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Index a source-candidate accessory registration by exact body type."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Accessory report must be inside repository")
    report = read_json(path)
    require(report.get("status") == "source-candidate-registered", "Accessory report is not registered")
    result = {}
    for body_type in report.get("bodies", []):
        if isinstance(body_type, str):
            result[body_type] = {"report": pin(path), "bodyType": body_type, "scope": "registered-source-candidate"}
    return result


def glasses_admission_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Index an exact, human-reviewed glasses admission report.

    A source fit or a ``verified:false`` runtime candidate is deliberately not
    enough. The report must carry exact body/profile identities plus normal
    runtime, close/reopen, and visual-review passes. This lane clears only
    ``headAttachments`` for the matching body.
    """
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Glasses admission report must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-glasses-admission-v1", "Unsupported glasses admission report")
    require(report.get("status") == "passed" and report.get("visualReview") == "passed",
            "Glasses admission is not a visual pass")
    result: dict[str, dict[str, Any]] = {}
    for item in report.get("candidates", []):
        body_type = item.get("bodyType")
        body_sha = item.get("bodySha256")
        profile_sha = item.get("profileSha256")
        accessory_sha = item.get("accessorySha256")
        require(isinstance(body_type, str) and re.fullmatch(r"[a-z][a-z0-9-]{1,95}", body_type),
                "Glasses admission body type is invalid")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Glasses admission body identity is incomplete")
        require(isinstance(profile_sha, str) and SHA.fullmatch(profile_sha),
                "Glasses admission profile identity is incomplete")
        require(isinstance(accessory_sha, str) and SHA.fullmatch(accessory_sha),
                "Glasses admission accessory identity is incomplete")
        require(item.get("runtimeFit") == "passed" and item.get("closeReopen") == "passed",
                "Glasses admission runtime evidence is incomplete")
        require(body_sha not in result, "Duplicate glasses admission body")
        result[body_sha] = {
            "bodyType": body_type,
            "bodySha256": body_sha,
            "profileSha256": profile_sha,
            "accessorySha256": accessory_sha,
            "report": pin(path),
            "scope": report.get("scope", "exact body glasses runtime and visual admission"),
            "checks": ["headAttachments"],
        }
    require(result, "Glasses admission report has no candidates")
    return result


def budget_admission_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Index a four-layer resource-budget admission report."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root), "Budget admission report must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-budget-admission-v1", "Unsupported budget admission report")
    require(report.get("status") == "passed", "Budget admission is not a pass")
    result: dict[str, dict[str, Any]] = {}
    required_layers = ("transport", "decodeCanvas", "gpu", "ordinaryPC")
    for item in report.get("candidates", []):
        body_type = item.get("bodyType")
        body_sha = item.get("bodySha256")
        layers = item.get("layers")
        require(isinstance(body_type, str) and re.fullmatch(r"[a-z][a-z0-9-]{1,95}", body_type),
                "Budget admission body type is invalid")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Budget admission body identity is incomplete")
        require(isinstance(layers, dict) and all(layers.get(layer) == "passed" for layer in required_layers),
                "Budget admission requires all four resource layers")
        require(isinstance(item.get("budgetVersion"), str) and item["budgetVersion"],
                "Budget admission version is missing")
        require(isinstance(item.get("recordSha256"), str) and SHA.fullmatch(item["recordSha256"]),
                "Budget admission record identity is incomplete")
        require(body_sha not in result, "Duplicate budget admission body")
        result[body_sha] = {
            "bodyType": body_type,
            "bodySha256": body_sha,
            "budgetVersion": item["budgetVersion"],
            "recordSha256": item["recordSha256"],
            "layers": dict(layers),
            "report": pin(path),
            "scope": report.get("scope", "exact body four-layer resource budget admission"),
            "checks": ["runtimeRecordAndBudget"],
        }
    require(result, "Budget admission report has no candidates")
    return result


def dynamic_trace_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach exact-body dynamic traces while preserving their diagnostic status.

    A trace records useful runtime observations, but it does not by itself
    prove visual acceptance or grant fit reuse.  The gate keeps this evidence
    visible and leaves ``dynamicMotion`` pending until an explicit adapter
    admission report is supplied.
    """
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root),
            "Dynamic trace must be inside repository")
    summary = read_json(path)
    require(summary.get("schema") == "native-dynamic-runtime-trace-summary-v1",
            "Unsupported dynamic trace summary")
    require(summary.get("status") == "technical-pass-diagnostic-only",
            "Dynamic trace summary must remain diagnostic-only")
    summary_build = summary.get("build")
    require(isinstance(summary_build, str) and summary_build,
            "Dynamic trace summary build is missing")
    expected_chain = (
        "walk-dynamics-on", "sit-dynamics-on", "stand-dynamics-on", "walk-dynamics-off",
    )
    result: dict[str, dict[str, Any]] = {}
    for item in summary.get("bodies", []):
        report_rel = item.get("path")
        record_sha = item.get("recordSha256")
        require(isinstance(report_rel, str) and report_rel,
                "Dynamic trace report path is missing")
        require(isinstance(record_sha, str) and SHA.fullmatch(record_sha),
                "Dynamic trace record identity is incomplete")
        report_path = path.parent / report_rel
        require(report_path.is_file() and report_path.is_relative_to(root),
                f"Dynamic trace report is missing: {report_path}")
        report = read_json(report_path)
        require(report.get("schema") == "native-dynamic-runtime-trace-v1",
                "Unsupported dynamic trace report")
        require(report.get("status") == "technical-pass-diagnostic-only",
                "Dynamic trace report must remain diagnostic-only")
        require(report.get("admission") == {
                    "classification": "diagnostic-only",
                    "runtimeAdmission": False,
                }, "Dynamic trace admission classification is not diagnostic-only")
        require(report.get("recordSha256") == record_sha,
                "Dynamic trace summary/report record identity differs")
        body_sha = item.get("bodySha256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Dynamic trace body identity is incomplete")
        require(report.get("bodySha256") == body_sha,
                "Dynamic trace summary/report body identity differs")
        require(body_sha not in result, "Duplicate dynamic trace body")
        builds = report.get("builds")
        require(isinstance(builds, list) and builds and all(isinstance(build, str) and build for build in builds),
                "Dynamic trace build contract is incomplete")
        require(summary_build in builds and item.get("builds") == builds,
                "Dynamic trace summary/report build identity differs")
        samples = report.get("samples")
        require(isinstance(samples, list) and samples and item.get("samples") == len(samples),
                "Dynamic trace sample count is incomplete")
        require(all(sample.get("row", {}).get("build") in builds for sample in samples),
                "Dynamic trace sample build differs")
        action_chain = report.get("actionChain")
        require(isinstance(action_chain, list) and [row.get("label") for row in action_chain] == list(expected_chain),
                "Dynamic trace action chain is incomplete")
        for index, action in enumerate(action_chain):
            require(isinstance(action.get("samples"), int) and action["samples"] > 0,
                    "Dynamic trace action has no samples")
            expected_dynamics = [False] if index == 3 else [True]
            require(action.get("dynamics") == expected_dynamics,
                    "Dynamic trace dynamics switch state is inconsistent")
        switch_state = report.get("switchState")
        require(isinstance(switch_state, dict) and
                switch_state.get("onLabels") == list(expected_chain[:3]) and
                switch_state.get("offLabels") == [expected_chain[3]] and
                switch_state.get("onObserved") is True and
                switch_state.get("offObserved") is True,
                "Dynamic trace switch-state contract is incomplete")
        result[body_sha] = {
            "report": pin(path),
            "bodySha256": body_sha,
            "recordSha256": record_sha,
            "traceReport": pin(report_path),
            "builds": builds,
            "samples": len(samples),
            "actionChain": action_chain,
            "switchState": switch_state,
            "admission": report.get("admission"),
            "status": summary.get("status"),
            "scope": summary.get("scope"),
            "clears": [],
        }
    require(result, "Dynamic trace summary has no bodies")
    return result


def runtime_budget_trace_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach exact-record runtime budget measurements without granting admission.

    The browser trace proves loader lifecycle and sampled frame/update/render
    costs for the pinned build. It does not prove GPU bytes, ordinary-PC
    performance, visual acceptance, or a passed four-layer budget report.
    """
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root),
            "Runtime budget trace must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-runtime-budget-trace-v1",
            "Unsupported runtime budget trace")
    require(report.get("status") == "measured-development-only",
            "Runtime budget trace must remain development-only")
    require(not report.get("errors"), "Runtime budget trace contains page errors")
    input_records = (report.get("input") or {}).get("records")
    require(isinstance(input_records, list) and len(input_records) >= 2,
            "Runtime budget trace input identities are incomplete")
    by_id: dict[str, dict[str, Any]] = {}
    for item in input_records:
        item_id = item.get("id")
        body_sha = item.get("bodySha256")
        record_sha = item.get("recordSha256")
        require(isinstance(item_id, str) and item_id and item_id not in by_id,
                "Runtime budget trace input id is invalid or duplicated")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Runtime budget trace body identity is incomplete")
        require(isinstance(record_sha, str) and SHA.fullmatch(record_sha),
                "Runtime budget trace record identity is incomplete")
        by_id[item_id] = item
    result: dict[str, dict[str, Any]] = {}
    for case in report.get("cases", []):
        case_inputs = case.get("inputs")
        require(isinstance(case_inputs, list) and case_inputs,
                "Runtime budget trace case has no input identities")
        for item in case_inputs:
            item_id = item.get("id")
            require(item_id in by_id and item == by_id[item_id],
                    "Runtime budget trace case identity differs from input")
        loaded = case.get("loaded") or {}
        released = case.get("released") or {}
        baseline = case.get("baseline") or {}
        for key in ("textures", "geometries", "programs", "drawCalls", "triangles"):
            require(isinstance(loaded.get(key), (int, float)) and loaded[key] >= 0,
                    f"Runtime budget trace loaded {key} is missing")
            require(released.get(key) == baseline.get(key),
                    f"Runtime budget trace did not return {key} to baseline")
        summary = case.get("summary") or {}
        for metric in ("frame", "update", "render"):
            sample = summary.get(metric) or {}
            require(isinstance(sample.get("count"), int) and sample["count"] > 0,
                    f"Runtime budget trace {metric} has no samples")
        for item in case_inputs:
            body_sha = item["bodySha256"]
            case_entry = {
                "caseId": case.get("ids"),
                "build": case.get("build"),
                "loadMs": case.get("loadMs"),
                "loaded": loaded,
                "released": released,
                "baseline": baseline,
                "summary": summary,
            }
            if body_sha not in result:
                result[body_sha] = {
                    "report": pin(path),
                    "bodySha256": body_sha,
                    "recordSha256": item["recordSha256"],
                    "cases": [case_entry],
                    "scope": "development runtime lifecycle and sampled timing; no GPU/ordinary-PC or visual admission",
                    "admission": {"classification": "diagnostic-only", "runtimeAdmission": False},
                }
            else:
                require(result[body_sha]["recordSha256"] == item["recordSha256"],
                        "Runtime budget trace record identity differs across cases")
                result[body_sha]["cases"].append(case_entry)
    require(result, "Runtime budget trace has no bodies")
    return result


def budget_classification_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach four-layer budget classification without granting admission."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root),
            "Budget classification must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-batch-budget-classification-v1",
            "Unsupported budget classification")
    result: dict[str, dict[str, Any]] = {}
    for item in report.get("records", []):
        body_sha = item.get("bodySha256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Budget classification body identity is incomplete")
        require(body_sha not in result, "Duplicate budget classification body")
        gates = item.get("resourceGates") or {}
        static_failures = []
        if gates.get("body") == "failed":
            static_failures.append("body")
        for group in ("garments", "accessories"):
            for identifier, status in (gates.get(group) or {}).items():
                if status == "failed":
                    static_failures.append(f"{group}.{identifier}")
        unmeasured_layers = [layer for layer in ("gpu", "ordinaryPC")
                             if (item.get(layer) or {}).get("status") == "unmeasured"]
        if static_failures:
            decision = "reject-static-over-budget"
        elif unmeasured_layers:
            decision = "hold-unmeasured-resource-layer"
        else:
            decision = "candidate-pending-explicit-admission"
        result[body_sha] = {
            "report": pin(path),
            "bodySha256": body_sha,
            "transport": item.get("transport"),
            "decodeCanvas": item.get("decodeCanvas"),
            "gpu": item.get("gpu"),
            "ordinaryPC": item.get("ordinaryPC"),
            "resourceGates": item.get("resourceGates"),
            "decision": decision,
            "staticFailures": static_failures,
            "unmeasuredLayers": unmeasured_layers,
            "budgetAdmission": False,
            "scope": "four-layer static/runtime budget classification; no admission",
        }
    require(result, "Budget classification has no records")
    return result


def surface_admission_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach exact embedded-surface evidence while retaining runtime gates."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root),
            "Surface admission must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-surface-texture-admission-v1",
            "Unsupported surface admission")
    result: dict[str, dict[str, Any]] = {}
    for item in report.get("bodies", []):
        body_sha = item.get("bodySha256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Surface admission body identity is incomplete")
        static = item.get("static", {})
        require(static.get("status") == "passed" and static.get("bodyShaExact") is True,
                "Surface static identity is not admitted")
        require(body_sha not in result, "Duplicate surface admission body")
        result[body_sha] = {
            "report": pin(path),
            "bodyType": item.get("bodyType"),
            "bodySha256": body_sha,
            "static": static,
            "runtime": item.get("runtime"),
            "visual": item.get("visual"),
            "scope": report.get("scope"),
            "clears": [],
        }
    require(result, "Surface admission has no bodies")
    return result


def glasses_candidate_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach exact-body glasses playback candidates without clearing fit work."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root),
            "Glasses candidate report must be inside repository")
    report = read_json(path)
    require(report.get("schema") in ("native-glasses-candidate-runtime-v1", "native-glasses-candidate-chain-v1", "native-glasses-candidate-lifecycle-v1") and
            report.get("status") == "candidate-only",
            "Unsupported glasses candidate report")
    result: dict[str, dict[str, Any]] = {}
    for item in report.get("cases", []):
        body_sha = item.get("bodySHA256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Glasses candidate body identity is incomplete")
        require(body_sha not in result, "Duplicate glasses candidate body")
        if report.get("schema") in ("native-glasses-candidate-chain-v1", "native-glasses-candidate-lifecycle-v1"):
            snapshots = item.get("snapshots")
            require(isinstance(snapshots, list) and snapshots,
                    "Glasses candidate chain has no snapshots")
            names = {row.get("name") for row in snapshots if isinstance(row, dict)}
            require({"walking", "seated", "standing-again"} <= names,
                    "Glasses candidate chain is incomplete")
            close_reopen = item.get("closeReopen") is True
            require(close_reopen, "Glasses candidate chain lacks fresh-page reload")
            if report.get("schema") == "native-glasses-candidate-lifecycle-v1":
                lifecycle = item.get("lifecycle")
                require(isinstance(lifecycle, dict) and
                        all(lifecycle.get(key) is True for key in (
                            "walkingAttached", "seatedAttached", "standingAgainAttached",
                            "reloadedAttached", "canceledUnloadPreservesPrevious",
                            "committedUnloadRollbackPreservesPrevious",
                            "identityErrorRollbackPreservesPrevious")),
                        "Glasses candidate lifecycle is incomplete")
            stand_applied = bool(item.get("fit"))
            sit_applied = any(
                row.get("name") == "seated" and
                row.get("state", {}).get("accessories", {}).get("glasses", {}).get("loaded") is True
                for row in snapshots if isinstance(row, dict)
            )
            chain = {"walking": True, "seated": sit_applied,
                     "standingAgain": "standing-again" in names,
                     "closeReopen": close_reopen,
                     "build": item.get("build")}
        else:
            stand_applied = bool(item.get("stand", {}).get("result", {}).get("applied"))
            sit_applied = item.get("sit", {}).get("state", {}).get("accessories", {}) \
                .get("glasses", {}).get("loaded") is True
            chain = None
        result[body_sha] = {
            "report": pin(path),
            "body": item.get("body", item.get("bodyType")),
            "bodySha256": body_sha,
            "standApplied": stand_applied,
            "sitApplied": sit_applied,
            "chain": chain,
            "fitStatus": "fitted-candidate",
            "verified": False,
            "clears": [],
        }
    require(result, "Glasses candidate report has no cases")
    return result


def microphone_candidate_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach exact-body CPU microphone fits without granting browser admission."""
    path = path.resolve()
    require(path.is_file() and path.is_relative_to(root),
            "Microphone candidate report must be inside repository")
    report = read_json(path)
    require(report.get("schema") == "native-accessory-batch-result-v1",
            "Unsupported microphone candidate report")
    result: dict[str, dict[str, Any]] = {}
    for item in report.get("targets", []):
        body = item.get("body", {})
        body_sha = body.get("sha256")
        require(isinstance(body_sha, str) and SHA.fullmatch(body_sha),
                "Microphone candidate body identity is incomplete")
        require(item.get("status") == "cpu-candidate-only" and
                item.get("microphone", {}).get("status") == "cpu-candidate-only",
                "Microphone candidate is not explicitly CPU-only")
        require(body_sha not in result, "Duplicate microphone candidate body")
        result[body_sha] = {
            "report": pin(path),
            "bodySha256": body_sha,
            "bodyType": item.get("id"),
            "presentation": item.get("microphone", {}).get("presentation"),
            "gripEntry": item.get("microphone", {}).get("gripEntry"),
            "status": "cpu-candidate-only",
            "verified": False,
            "clears": [],
        }
    require(result, "Microphone candidate report has no targets")
    return result


def room_candidate_index(path: Path, root: Path = ROOT) -> dict[str, dict[str, Any]]:
    """Attach current-build room playback candidates without runtime admission."""
    path = path.resolve()
    require(path.exists() and path.is_relative_to(root),
            "Room candidate report must be inside repository")
    reports = [path] if path.is_file() else sorted(path.glob("*/report.json"))
    require(reports, "Room candidate directory has no reports")
    result: dict[str, dict[str, Any]] = {}
    for path in reports:
        report = read_json(path)
        require(report.get("status") == "technical-pass-visual-candidate",
                "Room report must remain a visual candidate")
        input_path = path.parent / "input-record.json"
        require(input_path.is_file(), "Room candidate input record is missing")
        record = read_json(input_path)
        base = record.get("appearanceRecipe", {}).get("base", {})
        body_type = base.get("bodyType")
        body_sha = base.get("sha256")
        require(isinstance(body_type, str) and body_type and SHA.fullmatch(str(body_sha or "")),
                "Room candidate body identity is incomplete")
        require(report.get("recordSha256") == record.get("integrity", {}).get("recordSha256"),
                "Room candidate record identity differs from input")
        require(not report.get("errors") and len(report.get("tasks", [])) >= 4,
                "Room candidate playback is incomplete")
        require(body_sha not in result, "Duplicate room candidate body")
        result[body_sha] = {
            "report": pin(path),
            "inputRecord": pin(input_path),
            "bodyType": body_type,
            "bodySha256": body_sha,
            "recordSha256": report.get("recordSha256"),
            "build": report.get("build"),
            "tasks": len(report.get("tasks", [])),
            "status": report.get("status"),
            "clears": [],
        }
    return result


def evaluate(batch_path: Path, root: Path = ROOT,
             runtime_report: Path | None = None,
             adapter_report: Path | None = None,
             microphone_report: Path | None = None,
             adaptation_report: Path | None = None,
             runtime_head_audit: Path | None = None,
             glasses_report: Path | None = None,
             budget_report: Path | None = None,
             dynamic_trace: Path | None = None,
             runtime_budget_trace: Path | None = None,
             budget_classification: Path | None = None,
             surface_admission: Path | None = None,
             glasses_candidate: Path | None = None,
             microphone_candidate: Path | None = None,
             room_candidate: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    batch_path = batch_path.resolve()
    require(batch_path.is_file() and batch_path.is_relative_to(root), "Batch must be inside repository")
    batch = read_json(batch_path)
    require(batch.get("schema") == "native-factory-import-batch-v1", "Unsupported import batch")
    items = batch.get("items")
    require(isinstance(items, list) and items, "Batch is empty")
    runtime_by_body = runtime_index(runtime_report, root) if runtime_report else {}
    adapter_by_body = adapter_index(adapter_report, root) if adapter_report else {}
    microphone_by_body = accessory_index(microphone_report, root) if microphone_report else {}
    adaptation_by_body = candidate_adaptation_index(adaptation_report, root) if adaptation_report else {}
    audit_by_body = runtime_head_audit_index(runtime_head_audit, root) if runtime_head_audit else {}
    glasses_by_body = glasses_admission_index(glasses_report, root) if glasses_report else {}
    budget_by_body = budget_admission_index(budget_report, root) if budget_report else {}
    dynamic_by_body = dynamic_trace_index(dynamic_trace, root) if dynamic_trace else {}
    runtime_budget_by_body = runtime_budget_trace_index(runtime_budget_trace, root) if runtime_budget_trace else {}
    budget_classification_by_body = budget_classification_index(budget_classification, root) if budget_classification else {}
    surface_by_body = surface_admission_index(surface_admission, root) if surface_admission else {}
    glasses_candidate_by_body = glasses_candidate_index(glasses_candidate, root) if glasses_candidate else {}
    microphone_candidate_by_body = microphone_candidate_index(microphone_candidate, root) if microphone_candidate else {}
    room_by_body = room_candidate_index(room_candidate, root) if room_candidate else {}
    combined_adapter = dict(adapter_by_body)
    for evidence_map in (glasses_by_body, budget_by_body):
        for body_sha, evidence in evidence_map.items():
            if body_sha not in combined_adapter:
                combined_adapter[body_sha] = evidence
                continue
            merged = dict(combined_adapter[body_sha])
            merged["checks"] = list(dict.fromkeys([*merged.get("checks", []), *evidence.get("checks", [])]))
            merged["additionalReports"] = [
                *merged.get("additionalReports", []), evidence["report"],
            ]
            combined_adapter[body_sha] = merged
    rows = [package_item(batch, item, root, runtime_by_body, combined_adapter) for item in items]
    for row in rows:
        body_sha = row.get("bodySha256")
        if body_sha in adaptation_by_body:
            row["candidateAdaptationEvidence"] = adaptation_by_body[body_sha]
        if body_sha in audit_by_body:
            row["runtimeHeadAuditEvidence"] = audit_by_body[body_sha]
        if body_sha in glasses_by_body:
            row["glassesAdmissionEvidence"] = glasses_by_body[body_sha]
        if body_sha in budget_by_body:
            row["budgetAdmissionEvidence"] = budget_by_body[body_sha]
        if body_sha in dynamic_by_body:
            row["dynamicRuntimeTrace"] = dynamic_by_body[body_sha]
        if body_sha in runtime_budget_by_body:
            row["runtimeBudgetTrace"] = runtime_budget_by_body[body_sha]
        if body_sha in budget_classification_by_body:
            row["budgetClassification"] = budget_classification_by_body[body_sha]
        if body_sha in surface_by_body:
            evidence = surface_by_body[body_sha]
            require(evidence.get("bodyType") == row["bodyType"],
                    f"Surface evidence body type differs: {row['bodyType']}")
            row["surfaceAdmissionEvidence"] = evidence
        if body_sha in glasses_candidate_by_body:
            evidence = glasses_candidate_by_body[body_sha]
            require(evidence.get("body") == row["bodyType"],
                    f"Glasses candidate body type differs: {row['bodyType']}")
            row["glassesCandidateEvidence"] = evidence
        if body_sha in microphone_candidate_by_body:
            evidence = microphone_candidate_by_body[body_sha]
            require(evidence.get("bodyType") == row["bodyType"],
                    f"Microphone candidate body type differs: {row['bodyType']}")
            row["microphoneCandidateEvidence"] = evidence
        if body_sha in room_by_body:
            evidence = room_by_body[body_sha]
            require(evidence.get("bodyType") == row["bodyType"],
                    f"Room candidate body type differs: {row['bodyType']}")
            row["roomCandidateEvidence"] = evidence
    for row in rows:
        if row["bodyType"] in microphone_by_body:
            row["accessoryEvidence"] = {"microphone": microphone_by_body[row["bodyType"]]}
            if any(task["check"] == "handAndMicrophone" for task in row["adapterTasks"]):
                row["resolvedChecks"]["handAndMicrophone"] = {
                    "status": "passed",
                    "evidence": microphone_by_body[row["bodyType"]],
                }
            row["adapterTasks"] = [task for task in row["adapterTasks"] if task["check"] != "handAndMicrophone"]
            row["blockers"] = [blocker for blocker in row["blockers"]
                                if not blocker.startswith("pending adapter checks require exact evidence")]
            if row["adapterTasks"]:
                pending_checks = ", ".join(task["check"] for task in row["adapterTasks"])
                row["blockers"].append(f"pending adapter checks require exact evidence before fit reuse: {pending_checks}")
    ids = [row["id"] for row in rows]
    require(len(ids) == len(set(ids)), "Duplicate batch item")
    accepted = []
    accepted_body_types = set()
    for row in rows:
        if row["adapterTasks"] or not all(row["lanes"].get(lane) == "verified" for lane in REQUIRED_LANES):
            continue
        body_type = row["bodyType"]
        require(body_type not in accepted_body_types, f"Readiness report has duplicate accepted body type: {body_type}")
        accepted_body_types.add(body_type)
        accepted.append(row["id"])
    if not accepted:
        aggregate = "blocked"
    elif len(accepted) == len(rows):
        aggregate = "ready"
    else:
        aggregate = "partial"
    return {
        "schema": SCHEMA,
        "batch": pin(batch_path),
        "items": rows,
        "acceptedForRuntime": accepted,
        # Kept for older readers of production-readiness-v1.
        "status": "adapter-work-required",
        "aggregateOutcome": {
            "schema": AGGREGATE_SCHEMA,
            "scope": "batch-runtime-admission",
            "status": aggregate,
            "itemCount": len(rows),
            "acceptedCount": len(accepted),
            "unacceptedCount": len(rows) - len(accepted),
        },
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
    from production_paths import project_output

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime-report", type=Path)
    parser.add_argument("--adapter-report", type=Path)
    parser.add_argument("--microphone-report", type=Path)
    parser.add_argument("--adaptation-report", type=Path)
    parser.add_argument("--runtime-head-audit", type=Path)
    parser.add_argument("--glasses-report", type=Path)
    parser.add_argument("--budget-report", type=Path)
    parser.add_argument("--dynamic-trace", type=Path)
    parser.add_argument("--runtime-budget-trace", type=Path)
    parser.add_argument("--budget-classification", type=Path)
    parser.add_argument("--surface-admission", type=Path)
    parser.add_argument("--glasses-candidate", type=Path)
    parser.add_argument("--microphone-candidate", type=Path)
    parser.add_argument("--room-candidate", type=Path)
    args = parser.parse_args()
    try:
        output = project_output(args.output, __file__)
        report = evaluate(args.batch, runtime_report=args.runtime_report, adapter_report=args.adapter_report,
                          microphone_report=args.microphone_report, adaptation_report=args.adaptation_report,
                          runtime_head_audit=args.runtime_head_audit, glasses_report=args.glasses_report,
                          budget_report=args.budget_report, dynamic_trace=args.dynamic_trace,
                          runtime_budget_trace=args.runtime_budget_trace,
                          budget_classification=args.budget_classification,
                          surface_admission=args.surface_admission,
                          glasses_candidate=args.glasses_candidate,
                          microphone_candidate=args.microphone_candidate,
                          room_candidate=args.room_candidate)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(json.dumps(report, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
