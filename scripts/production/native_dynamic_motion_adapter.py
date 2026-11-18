"""Classify native VRM dynamic-motion reuse without granting runtime admission.

The source adaptation audit proves structure only.  This adapter binds that
result to the exact body bytes and to any supplied runtime record.  A runtime
record is usable only when its body and record identities match and it carries
an admitted technical status.  Visual candidates and stale records remain
diagnostic evidence and cannot clear the native production gate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SHA = set("0123456789abcdef")
SCHEMA = "native-dynamic-motion-adapter-v1"


class DynamicMotionError(ValueError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise DynamicMotionError(message)


def read_json(path: Path) -> dict[str, Any]:
    require(path.is_file() and path.is_relative_to(ROOT), f"Evidence must be inside repository: {path}")
    value = json.loads(path.read_bytes())
    require(isinstance(value, dict), f"Expected JSON object: {path}")
    return value


def pin(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": digest(raw), "bytes": len(raw)}


def sha(value: Any, label: str) -> str:
    require(isinstance(value, str) and len(value) == 64 and set(value) <= SHA,
            f"Invalid {label} SHA256")
    return value


def runtime_identity(path: Path, body_sha: str, record_sha: str | None) -> dict[str, Any] | None:
    """Return an admitted runtime identity, or None for candidate/stale data."""
    report = read_json(path)
    status = report.get("status")
    # Technical-pass-visual-candidate is intentionally excluded.  It contains
    # useful playback observations but has no runtime admission authority.
    if status != "technical-pass":
        return None
    report_body = report.get("body", {}).get("sha256")
    report_record = report.get("recordSha256")
    if report_body != body_sha or (record_sha is not None and report_record != record_sha):
        return None
    sha(report_body, "runtime body")
    sha(report_record, "runtime record")
    return {"report": pin(path), "bodySha256": report_body, "recordSha256": report_record}


def build_report(adaptation_path: Path, runtime_paths: dict[str, Path] | None = None) -> dict[str, Any]:
    source = read_json(adaptation_path)
    require(source.get("schema") == "native-batch-adaptation-admission-v1",
            "Unsupported source adaptation report")
    baseline = source.get("baseline", {})
    baseline_sha = sha(baseline.get("sha256"), "baseline body")
    baseline_path = ROOT / str(baseline.get("path", ""))
    require(baseline_path.is_file(), "Missing baseline body")
    require(digest(baseline_path.read_bytes()) == baseline_sha, "Baseline body SHA differs")

    rows = []
    for candidate in source.get("candidates", []):
        body = candidate.get("body", {})
        body_sha = sha(body.get("sha256"), "candidate body")
        body_path = ROOT / str(body.get("path", ""))
        require(body_path.is_file(), f"Missing candidate body: {body_path}")
        require(digest(body_path.read_bytes()) == body_sha, "Candidate body SHA differs")
        dynamic = candidate.get("dynamicMotion", {})
        exact = dynamic.get("exactAgainstBaseline", {})
        required_structure = ("nodes", "skins", "humanoid", "expressions", "springBone")
        require(all(exact.get(key) is True for key in required_structure),
                f"Dynamic structure is not exact for {candidate.get('id')}")
        spring_identity = digest(json.dumps({
            "extension": dynamic.get("springExtension"),
            "springCount": dynamic.get("springCount"),
            "colliderCount": dynamic.get("colliderCount"),
            "baselineBodySha256": baseline_sha,
        }, sort_keys=True, separators=(",", ":")).encode())
        runtime = None
        runtime_path = (runtime_paths or {}).get(body_sha)
        if runtime_path:
            runtime = runtime_identity(runtime_path, body_sha, None)
        rows.append({
            "id": candidate.get("id"),
            "bodySha256": body_sha,
            "sourceIdentity": {
                "body": pin(body_path),
                "baselineBody": pin(baseline_path),
                "springExtension": dynamic.get("springExtension"),
                "springStructureSha256": spring_identity,
            },
            "reuse": {
                "vrmHumanoidAndSkinStructure": "reusable",
                "vrmSpringBoneStructure": "reusable",
                "normalizedMotionSkeleton": "reusable",
                "hairAndHeadAttachmentFit": "requires-exact-body-evidence",
            },
            "requiredEvidence": [
                "per-body hair/head attachment fit and source/fit SHA",
                "normal-speed dynamic playback with the exact record identity",
                "close/reopen restore with the exact body and record SHA",
                "human visual contact review",
            ],
            "runtimeEvidence": runtime,
            "runtimeAdmission": "admitted" if runtime else "blocked",
        })
    require(rows, "Source adaptation report has no candidates")
    return {
        "schema": SCHEMA,
        # This adapter only classifies reusable structure.  The production
        # gate remains the sole authority for runtime admission.
        "status": "blocked",
        "checks": ["dynamicMotion"],
        "runtimeAdmissionGranted": False,
        "sourceAdaptation": pin(adaptation_path),
        "baseline": {"path": baseline_path.relative_to(ROOT).as_posix(), "sha256": baseline_sha},
        "candidates": rows,
        "limits": [
            "Structural VRM and spring reuse does not prove hair contact or natural motion.",
            "This report never grants native production runtime admission.",
            "A visual-candidate or stale/mismatched runtime report is diagnostic only.",
        ],
    }


def main() -> int:
    from production_paths import project_output

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adaptation-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    destination = project_output(args.output, __file__)
    report = build_report(args.adaptation_report.resolve())
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\n")
    print(json.dumps({"status": report["status"], "candidates": len(report["candidates"]),
                      "output": args.output.as_posix()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
