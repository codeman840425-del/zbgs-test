"""Read-only admission identity audit for the advisor's bounded Rokoko pilot.

This does not evaluate physical contacts or naturalness. No third-party SDK is
required. Preserve the advisor's source folder; write only a new result file.
"""
import argparse
import hashlib
import json
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


parser = argparse.ArgumentParser()
parser.add_argument("--pilot", type=Path, required=True)
parser.add_argument("--baseline", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
if args.output.exists():
    raise SystemExit("Refuse to overwrite existing evidence")
base = args.pilot
candidate = base / "candidate-rokoko-v1"
manifest = read(base / "game-baseline-manifest.json")
changed, mismatches = [], []
for item in manifest["files"]:
    rel = item["path"]
    if any(sha(folder / rel) != item["sha256"] for folder in (
        args.baseline, base / "game-baseline-038341558517"
    )):
        mismatches.append(rel)
    if sha(candidate / rel) != item["sha256"]:
        changed.append(rel)
known = {item["path"] for item in manifest["files"]}
added = sorted(p.relative_to(candidate).as_posix() for p in candidate.rglob("*")
               if p.is_file() and p.relative_to(candidate).as_posix() not in known)
original_html = (args.baseline / "index.html").read_text(encoding="utf-8-sig")
candidate_html = (candidate / "index.html").read_text(encoding="utf-8-sig")
expected_html = original_html.replace(
    "  </body>", '  <script type="module" src="/capture-harness.js"></script></body>'
)
motions = candidate / "assets/motion/m1c"
entry = next(e for e in read(motions / "dance-imports.json")["entries"]
             if e["id"] == "rokoko-5359146-30s-v1")
raw_sha = sha(base / "vendor-output/5359146-frames0000-0719-1080p-end30.fbx")
variants = []
for variant in entry["variants"]:
    file = motions / variant["file"]
    data = read(file)
    body = "female" if "female" in variant["file"] else "male"
    rig_file = base / f"reference/assets-source/video-target-adaptation-v1/{body}-normalized-rig.json"
    rig = read(rig_file)
    checks = {
        "assetHash": sha(file) == variant["sha256"],
        "bytes": file.stat().st_size == variant["bytes"],
        "avatarIdentity": variant["avatarSha256"] == data["avatarSha256"] == rig["avatarSha256"],
        "rigIdentity": data["normalizedRigSha256"] == sha(rig_file),
        "footwearIdentity": data["footwearSha256"] == rig["footwear"]["sha256"],
        "sourceIdentity": data["sourceClipSha256"] == raw_sha,
    }
    variants.append({"body": body, "file": variant["file"], "sha256": sha(file), "checks": checks})
expected_added = sorted("assets/motion/m1c/" + v["file"] for v in variants)
expected_changes = ["assets/motion/m1c/dance-imports.json", "index.html"]
report = {
    "scope": "Artifact identity and reviewed capture entrypoint only; not visual/physical acceptance",
    "runtimeBuild": manifest["candidate"],
    "baselineFiles": len(known), "baselineMismatch": mismatches,
    "changedExistingFiles": sorted(changed), "addedFiles": added,
    "entrypointHarnessOnly": candidate_html == expected_html,
    "entryManifestSha256": sha(motions / "dance-imports.json"),
    "entrypointSha256": sha(candidate / "index.html"),
    "captureHarnessSha256": sha(base / "capture-harness.js"),
    "adapterSha256": sha(base / "retarget-rokoko.mjs"),
    "rawFbxSha256": raw_sha, "variants": variants,
    "auditScriptSha256": sha(Path(__file__)),
}
report["identityChecksPass"] = (
    not mismatches and sorted(changed) == expected_changes and added == expected_added
    and candidate_html == expected_html and len(variants) == 2
    and {v["body"] for v in variants} == {"female", "male"}
    and all(all(v["checks"].values()) for v in variants)
)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"output": str(args.output), "identityChecksPass": report["identityChecksPass"]}))
raise SystemExit(0 if report["identityChecksPass"] else 1)
