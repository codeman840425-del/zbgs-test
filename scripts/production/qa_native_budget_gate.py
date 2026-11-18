"""Cross-check native batch budget and KTX sidecar evidence without admission.

This is intentionally read-only.  It verifies that the production gate, the
source-side KTX report, the deterministic sidecar receipt, and the historical
budget wrapper describe the same two bodies and still leave runtime admission
empty.  It does not encode assets, start a browser, or write evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]


def load(path: Path) -> dict:
    value = json.loads(path.read_bytes())
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(condition: bool, label: str, issues: list[str], passed: list[str]) -> None:
    (passed if condition else issues).append(label)


def verify(gate_path: Path, sidecar_path: Path, deterministic_path: Path,
           wrapper_path: Path) -> dict:
    issues: list[str] = []
    passed: list[str] = []
    gate = load(gate_path)
    sidecar = load(sidecar_path)
    deterministic = load(deterministic_path)
    wrapper = load(wrapper_path)

    check(gate.get("schema") == "native-production-readiness-v1",
          "production gate schema", issues, passed)
    check(gate.get("status") == "adapter-work-required",
          "production gate remains adapter-work-required", issues, passed)
    check(gate.get("acceptedForRuntime") == [],
          "production gate acceptedForRuntime is empty", issues, passed)
    items = gate.get("items", [])
    check(isinstance(items, list) and len(items) == 2,
          "production gate contains two items", issues, passed)

    expected_ids = {
        "contour-roundness-a": "825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547",
        "contour-cheek-b": "9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb",
    }
    actual_ids = {row.get("id"): row.get("bodySha256") for row in items}
    check(actual_ids == expected_ids,
          "gate body identities match the pinned FaceContour pair", issues, passed)
    for row in items:
        budget = row.get("runtimeHeadAuditEvidence", {}).get("budget", {})
        check(budget.get("status") == "over-budget",
              f"{row.get('id')} static budget remains over-budget", issues, passed)
        check(budget.get("ordinaryPCPerformance") == "unmeasured",
              f"{row.get('id')} ordinary-PC performance remains unmeasured", issues, passed)

    check(sidecar.get("schema") == "m2-ktx-native-facecontour-sidecar-v1",
          "FaceContour sidecar schema", issues, passed)
    check(sidecar.get("runtimeVerified") is False,
          "FaceContour sidecar runtimeVerified is false", issues, passed)
    samples = sidecar.get("samples", [])
    check(isinstance(samples, list) and len(samples) == 2,
          "FaceContour sidecar contains two samples", issues, passed)
    sample_ids = {row.get("bodyType"): row.get("sourceModelSha256") for row in samples}
    check(sample_ids == {f"native-{key}-v1": value for key, value in expected_ids.items()},
          "sidecar source model identities match the gate", issues, passed)
    encoded_hashes = {row.get("encoded", {}).get("sha256") for row in samples}
    check(len(encoded_hashes) == 1 and None not in encoded_hashes,
          "both sidecar encodings have one explicit byte identity", issues, passed)
    check(all(row.get("encoded", {}).get("validationExitCode") == 0 for row in samples),
          "both sidecar encodings validated successfully", issues, passed)
    check(all(row.get("runtimeRule", "").startswith("Body map candidate only") for row in samples),
          "sidecar rows retain body-map-only runtime rule", issues, passed)

    check(deterministic.get("schema") == "m2-ktx-native-facecontour-sidecar-determinism-v1",
          "determinism receipt schema", issues, passed)
    check(deterministic.get("equal") is True and deterministic.get("runs") == 2,
          "determinism receipt has two equal runs", issues, passed)
    check(deterministic.get("firstHashes") == deterministic.get("secondHashes"),
          "determinism receipt first and second hashes match", issues, passed)

    check(wrapper.get("schema") == "native-batch-ktx-sidecar-budget-v1",
          "historical KTX budget wrapper schema", issues, passed)
    check(wrapper.get("decision") == "reject-direct-ktx-reuse",
          "historical KTX wrapper rejects direct reuse", issues, passed)
    check(wrapper.get("pilotRuntimeVerified") is False,
          "historical KTX wrapper pilotRuntimeVerified is false", issues, passed)
    wrapper_rows = {row.get("id"): row for row in wrapper.get("candidates", [])}
    for candidate_id, body_sha in expected_ids.items():
        row = wrapper_rows.get(candidate_id)
        check(isinstance(row, dict) and row.get("bodySha256") == body_sha,
              f"historical wrapper identity for {candidate_id}", issues, passed)
        if isinstance(row, dict):
            check(row.get("staticBudget", {}).get("status") == "rejected",
                  f"historical wrapper budget for {candidate_id} remains rejected", issues, passed)
            check(all(value is False for value in row.get("pilotReuse", {}).values()),
                  f"historical wrapper forbids pilot reuse for {candidate_id}", issues, passed)

    # Recheck the source hashes recorded by the sidecar.  This catches a
    # stale report without touching the package or changing admission state.
    for row in samples:
        source = ROOT / row["sourceModel"]
        check(source.exists() and sha(source) == row.get("sourceModelSha256"),
              f"source model hash for {row.get('bodyType')}", issues, passed)
        png = ROOT / row["sourcePng"]
        check(png.exists() and sha(png) == row.get("sourcePngSha256"),
              f"sidecar PNG hash for {row.get('bodyType')}", issues, passed)

    return {
        "schema": "native-budget-gate-qa-v1",
        "status": "pass" if not issues else "fail",
        "readOnly": True,
        "runtimeAdmissionChanged": False,
        "acceptedForRuntime": gate.get("acceptedForRuntime"),
        "passed": passed,
        "issues": issues,
        "inputs": {
            "productionGate": str(gate_path.relative_to(ROOT)),
            "sidecarReport": str(sidecar_path.relative_to(ROOT)),
            "determinismReceipt": str(deterministic_path.relative_to(ROOT)),
            "historicalBudgetWrapper": str(wrapper_path.relative_to(ROOT)),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate", type=Path,
                        default=ROOT / "evidence/m2-native-production-gate-v5/report.json")
    parser.add_argument("--sidecar", type=Path,
                        default=ROOT / "evidence/m2-ktx-native-facecontour-sidecar-v1/report.json")
    parser.add_argument("--determinism", type=Path,
                        default=ROOT / "evidence/m2-ktx-native-facecontour-sidecar-v1/determinism-check.json")
    parser.add_argument("--wrapper", type=Path,
                        default=ROOT / "evidence/m2-native-batch-adaptation-v1/native-batch-ktx-budget.json")
    args = parser.parse_args(argv)
    try:
        result = verify(*[path.resolve() for path in (args.gate, args.sidecar, args.determinism, args.wrapper)])
    except (OSError, ValueError, KeyError, TypeError) as error:
        result = {"schema": "native-budget-gate-qa-v1", "status": "invalid",
                  "readOnly": True, "runtimeAdmissionChanged": False,
                  "acceptedForRuntime": [], "passed": [], "issues": [str(error)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
