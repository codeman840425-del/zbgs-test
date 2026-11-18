"""Run the repeatable native batch admission and record-planning cycle.

The cycle starts from an already prepared native import batch.  It does not
author or export a model.  It evaluates the shared production gate, then
passes that exact gate report to the record planner.  The planner emits
requests only for bodies in ``acceptedForRuntime``; rejected bodies remain
diagnostic rows with their reasons.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import native_batch_gate
import native_record_batch

ROOT = native_batch_gate.ROOT
SCHEMA = "native-admission-cycle-v1"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def confined(path: Path) -> Path:
    path = path.resolve()
    if not path.is_relative_to(ROOT) or path == ROOT:
        raise ValueError(f"Path must be inside the project: {path}")
    return path


def write_new(path: Path, value: Any) -> dict[str, Any]:
    path = confined(path)
    if path.exists():
        raise FileExistsError(f"Refuse to overwrite existing evidence: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    with path.open("xb") as stream:
        stream.write(raw)
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": digest(raw), "bytes": len(raw)}


def cycle(batch: Path, gate_output: Path, records_output: Path, **reports: Path | None) -> dict[str, Any]:
    batch = confined(batch)
    gate_output = confined(gate_output)
    records_output = confined(records_output)
    if gate_output.exists() or records_output.exists():
        raise FileExistsError("Refuse to overwrite an existing admission cycle")

    gate = native_batch_gate.evaluate(
        batch,
        runtime_report=reports.get("runtime_report"),
        adapter_report=reports.get("adapter_report"),
        microphone_report=reports.get("microphone_report"),
        adaptation_report=reports.get("adaptation_report"),
        runtime_head_audit=reports.get("runtime_head_audit"),
    )
    gate_ref = write_new(gate_output, gate)

    try:
        record_batch = native_record_batch.run(
            ROOT / "prototype/src/native-production-catalog.json",
            records_output,
            readiness_report=gate_output,
        )
    except Exception:
        raise

    return {
        "schema": SCHEMA,
        "status": "ready" if gate["acceptedForRuntime"] else "blocked",
        "gate": gate_ref,
        "acceptedForRuntime": gate["acceptedForRuntime"],
        "recordBatch": {
            "path": records_output.relative_to(ROOT).as_posix(),
            "batchRequest": record_batch,
        },
        "scope": "Prepared native batch admission and deterministic record planning; no visual or target-PC acceptance",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--gate-output", type=Path, required=True)
    parser.add_argument("--records-output", type=Path, required=True)
    for name in ("runtime-report", "adapter-report", "microphone-report", "adaptation-report", "runtime-head-audit"):
        parser.add_argument(f"--{name}", dest=name.replace("-", "_"), type=Path)
    parser.add_argument("--summary", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = cycle(
            args.batch,
            args.gate_output,
            args.records_output,
            runtime_report=args.runtime_report,
            adapter_report=args.adapter_report,
            microphone_report=args.microphone_report,
            adaptation_report=args.adaptation_report,
            runtime_head_audit=args.runtime_head_audit,
        )
        summary_ref = write_new(args.summary, result)
        print(json.dumps({"status": result["status"], "acceptedForRuntime": result["acceptedForRuntime"], "summary": summary_ref}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
