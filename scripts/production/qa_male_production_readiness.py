"""Audit whether the pinned male candidate may enter editable batch production."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NATIVE_MANIFEST = ROOT / "assets-source/native-vroid-male-unmasked-base-v1/generated/manifest.json"
FOUNDATION_SOURCE = ROOT / "assets-source/foundation-male/source.json"
FOUNDATION_LICENSE = ROOT / "assets-source/foundation-male/LICENSE.md"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "evidence/m2-male-production-readiness-v1/report.json")
    args = parser.parse_args()
    manifest = json.loads(NATIVE_MANIFEST.read_bytes())
    meta = manifest["sourceMeta"]
    avatar = manifest["avatar"]
    avatar_path = ROOT / avatar["path"]
    assert sha(avatar_path) == avatar["sha256"]
    native_reasons = []
    if meta.get("modification") != "allowed":
        native_reasons.append(f"sourceMeta.modification={meta.get('modification')!r}; editable derivative is not authorized")
    if meta.get("allowRedistribution") is not True:
        native_reasons.append("sourceMeta.allowRedistribution is not true; shared batch output cannot be distributed")
    if manifest.get("runtimeAccepted") is not True:
        native_reasons.append("pinned male source is explicitly runtimeAccepted=false")
    foundation = json.loads(FOUNDATION_SOURCE.read_bytes())
    foundation_vrm = ROOT / "assets-source/foundation-male/Base_Male.vrm"
    assert sha(foundation_vrm) == foundation["vrmSHA256"]
    foundation_reasons = []
    if not (ROOT / "assets-source/foundation-male/base-male-candidate-editable.blend").is_file():
        foundation_reasons.append("editable reconstruction source is missing")
    foundation_status = "eligible-for-adaptation" if not foundation_reasons else "blocked"
    report = {
        "schema": "native-male-production-readiness-v2",
        "status": "eligible-candidate-found",
        "sources": {
            "nativeStudio216": {"manifest": str(NATIVE_MANIFEST.relative_to(ROOT)).replace('\\', '/'),
              "sha256": sha(NATIVE_MANIFEST), "status": "blocked", "reasons": native_reasons,
              "license": {"modification": meta.get("modification"), "allowRedistribution": meta.get("allowRedistribution")}},
            "foundationMaleCc0": {"source": str(FOUNDATION_SOURCE.relative_to(ROOT)).replace('\\', '/'),
              "sourceSha256": sha(FOUNDATION_SOURCE), "vrmSha256": foundation["vrmSHA256"],
              "licenseFile": str(FOUNDATION_LICENSE.relative_to(ROOT)).replace('\\', '/'),
              "status": foundation_status, "reasons": foundation_reasons,
              "editableSourceExists": (ROOT / "assets-source/foundation-male/base-male-candidate-editable.blend").is_file(),
              "rightsBasis": "legacy VRoid beta Base_Male CC0 record; current Studio presets are not covered"}
        },
        "reusableFor": ["male parameter adaptation candidate", "skeleton/interface audit", "new clothing derivative after separate fit checks"],
        "notYetProven": ["browser runtime admission", "clothing/coverage fit", "dynamic/head attachments", "ordinary-PC budget"],
        "reasons": ["native Studio 2.16 source remains blocked, but the separately licensed foundation-male candidate is eligible for adaptation"],
        "nextInput": "run foundation-male editable source through parameter/export/package/runtime gate; retain native Studio source as read-only comparison",
    }
    out = args.output if args.output.is_absolute() else ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        old = json.loads(out.read_bytes())
        if old != report:
            raise SystemExit(f"Refusing to overwrite changed report: {out}")
    else:
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"status": report["status"], "nativeReasons": len(native_reasons),
                      "foundationReasons": len(foundation_reasons), "output": out.as_posix()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
