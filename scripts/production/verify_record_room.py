"""Verify published single-actor room evidence against independent signed records and a fixed checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import NamedTemporaryFile

sys.dont_write_bytecode = True
from outfit_admission import (ROOT, evidence_pin, require, runtime_pin, source_commit, verify_room_report,
                             verify_runtime_source)
from production_paths import project_output


def file_pin(path, raw):
    return {"path": path.resolve().as_posix(), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def verify(pairs, fixed_root, commit, digest):
    fixed_root = fixed_root.resolve(strict=True)
    runtime = runtime_pin({"sourceCommit": commit, "sourceDigest": digest, "buildId": digest[:12]})
    require(source_commit(fixed_root) == commit, "Different fixed source commit")
    info = fixed_root / "prototype/dist/build-info.json"
    build_pin = evidence_pin(info, fixed_root)
    build = json.loads(info.read_bytes())
    require(build.get("sourceDigest") == digest and build.get("shortId") == runtime["buildId"],
            "Different fixed build metadata")
    verify_runtime_source(fixed_root, {"runtime": runtime, "buildInfo": build_pin}, evidence_root=fixed_root)

    rows, ids = [], set()
    for index, (original, report_path) in enumerate(pairs, 1):
        try:
            record_raw, report_raw = original.read_bytes(), report_path.read_bytes()
            record, report = json.loads(record_raw), json.loads(report_raw)
            ident = record["identity"]["id"]
            require(ident not in ids, f"Duplicate record ID: {ident}")
            ids.add(ident)
            require(report.get("schema") == "published-rule-workbench-room-v1", "Expected published room evidence")
            verify_room_report(report, record, runtime)
            require(report["build"].get("inputs") == build["inputs"] and report["build"].get("development") is False,
                    "Room did not run the fixed production input inventory")
            # Use the same JS canonicalizer and published-body checks as the live collector.
            check = subprocess.run(["node", "-e", """
                const {checkInput} = require('./scripts/qa-formal-room-record.cjs');
                (async () => {
                  let raw = ''; process.stdin.setEncoding('utf8');
                  for await (const chunk of process.stdin) raw += chunk;
                  await checkInput(JSON.parse(raw), {id:process.argv[1], recordSha:process.argv[2]});
                })().catch(error => { console.error(error.message); process.exitCode = 1; });
            """, "--", ident, report["pins"]["recordSha"]], cwd=ROOT, input=record_raw, capture_output=True,
                env={**os.environ, "NODE_DISABLE_COMPILE_CACHE": "1"})
            require(check.returncode == 0, "Invalid signed record: " + check.stderr.decode(errors="replace").strip())
            capture = report_path.parent / "input-record.json"
            capture_raw = capture.read_bytes()
            require(json.loads(capture_raw) == record, "Room capture input differs from the supplied signed record")
            video = report_path.parent / "room-produced-1x.webm"
            video_raw = video.read_bytes()
            require(video_raw.startswith(b"\x1a\x45\xdf\xa3"), "Missing room WebM recording")
            rows.append({"id": ident, "recordSha256": record["integrity"]["recordSha256"],
                         "base": record["appearanceRecipe"]["base"], "equipment": report["actors"]["restored"]["equipment"],
                         "requestIds": [task["requestId"] for task in report["tasks"]],
                         "original": file_pin(original, record_raw), "capturedInput": file_pin(capture, capture_raw),
                         "report": file_pin(report_path, report_raw), "video": file_pin(video, video_raw)})
        except (OSError, KeyError, ValueError, TypeError, IndexError) as error:
            raise ValueError(f"Pair {index} ({original}, {report_path}): {error}") from error
    return {"schema": "published-rule-room-verification-v1", "lane": "normalSpeedMotion", "status": "passed",
            "runtime": runtime, "fixedRoot": fixed_root.as_posix(), "buildInfo": build_pin, "records": rows}


def publish(path, raw):
    target = project_output(path, __file__)
    if target.is_file():
        require(target.read_bytes() == raw, "Existing receipt differs")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=target.parent, delete=False) as stage:
        staged = Path(stage.name)
    try:
        staged.write_bytes(raw)
        try:
            os.link(staged, target)
        except FileExistsError:
            require(target.read_bytes() == raw, "Existing receipt differs")
    finally:
        staged.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pair", nargs=2, type=Path, action="append", required=True, metavar=("ORIGINAL", "REPORT"))
    parser.add_argument("--fixed-root", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--digest", required=True)
    parser.add_argument("--out", type=Path, help="Optional immutable receipt inside the production checkout")
    args = parser.parse_args()
    os.environ["GIT_OPTIONAL_LOCKS"] = "0"
    try:
        out = project_output(args.out, __file__) if args.out is not None else None
        result = verify(args.pair, args.fixed_root, args.commit, args.digest)
        raw = (json.dumps(result, indent=2, ensure_ascii=True) + "\n").encode()
        if out is not None:
            publish(out, raw)
        sys.stdout.buffer.write(raw)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"{parser.prog}: {error}\n")


if __name__ == "__main__":
    main()
