"""Audit whether the pinned male candidate may enter editable batch production."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "assets-source/native-vroid-male-unmasked-base-v1/generated/manifest.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "evidence/m2-male-production-readiness-v1/report.json")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_bytes())
    meta = manifest["sourceMeta"]
    avatar = manifest["avatar"]
    avatar_path = ROOT / avatar["path"]
    assert sha(avatar_path) == avatar["sha256"]
    reasons = []
    if meta.get("modification") != "allowed":
        reasons.append(f"sourceMeta.modification={meta.get('modification')!r}; editable derivative is not authorized")
    if meta.get("allowRedistribution") is not True:
        reasons.append("sourceMeta.allowRedistribution is not true; shared batch output cannot be distributed")
    if manifest.get("runtimeAccepted") is not True:
        reasons.append("pinned male source is explicitly runtimeAccepted=false")
    report = {
        "schema": "native-male-production-readiness-v1",
        "status": "blocked" if reasons else "eligible-for-next-admission-stage",
        "source": {"manifest": str(MANIFEST.relative_to(ROOT)).replace('\\', '/'), "sha256": sha(MANIFEST),
                   "avatar": avatar, "editableSourceExists": manifest.get("singleMergedEditableSourceExists") is True},
        "license": {"modification": meta.get("modification"), "allowRedistribution": meta.get("allowRedistribution"),
                    "commercialUsage": meta.get("commercialUsage"), "creditNotation": meta.get("creditNotation")},
        "reusableFor": ["read-only runtime comparison", "skeleton/interface audit", "non-distributed motion smoke"],
        "notReusableFor": ["batch face/body edits", "new clothing derivatives", "redistributed game package"],
        "reasons": reasons,
        "nextInput": "licensed editable male base with modification and redistribution permission, or an authorized native export",
    }
    out = args.output if args.output.is_absolute() else ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        old = json.loads(out.read_bytes())
        if old != report:
            raise SystemExit(f"Refusing to overwrite changed report: {out}")
    else:
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"status": report["status"], "reasons": len(reasons), "output": out.as_posix()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
