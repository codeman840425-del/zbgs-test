"""Build an explicit release-sidecar manifest for native body packages.

The manifest binds each derived KTX2 texture to its exact VRM and fallback
PNG. It is a packaging record only. Runtime replacement and admission remain
separate checks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(sidecar_path: Path, package_root: Path) -> dict[str, Any]:
    sidecar = json.loads(sidecar_path.read_text(encoding="utf8"))
    if sidecar.get("schema") != "m2-ktx-native-facecontour-sidecar-v1":
        raise ValueError("unsupported sidecar manifest")
    entries = []
    for sample in sidecar.get("samples", []):
        body = ROOT / sample["sourceModel"]
        encoded = ROOT / sample["encoded"]["path"]
        fallback = ROOT / sample["sourcePng"]
        if sha(body) != sample["sourceModelSha256"]:
            raise ValueError(f"source VRM changed: {body}")
        if sha(encoded) != sample["encoded"]["sha256"]:
            raise ValueError(f"sidecar changed: {encoded}")
        if sha(fallback) != sample["sourcePngSha256"]:
            raise ValueError(f"fallback changed: {fallback}")
        profiles = list(package_root.glob("*/profile-candidate.json"))
        package = next((candidate for candidate in profiles
                        if json.loads(candidate.read_text(encoding="utf8")).get("suggestedBodyType") == sample["bodyType"]), None)
        if package is None:
            raise ValueError(f"missing package profile: {sample['bodyType']}")
        profile = json.loads(package.read_text(encoding="utf8"))
        if profile.get("profile", {}).get("sha256") != sample["sourceModelSha256"]:
            raise ValueError(f"package/body identity differs: {sample['bodyType']}")
        entries.append({
            "id": sample["id"],
            "bodyType": sample["bodyType"],
            "sourceModel": sample["sourceModel"],
            "sourceModelSha256": sample["sourceModelSha256"],
            "target": {
                "materialIndex": sample["materialIndex"],
                "materialName": sample["materialName"],
                "imageIndex": sample["imageIndex"],
                "width": sample["width"],
                "height": sample["height"],
                "materialContract": sample["materialContract"],
            },
            "derivedTexture": sample["encoded"]["path"],
            "derivedTextureSha256": sample["encoded"]["sha256"],
            "fallbackPng": sample["sourcePng"],
            "fallbackPngSha256": sample["sourcePngSha256"],
            "configuration": sidecar["configuration"],
            "runtimePolicy": "fallback-png-until-loader-and-target-device-admission",
            "admission": "candidate-only",
        })
    if not entries:
        raise ValueError("sidecar manifest has no samples")
    return {
        "schema": "native-release-sidecar-manifest-v1",
        "sourceSidecarManifest": sidecar_path.relative_to(ROOT).as_posix(),
        "sourceSidecarManifestSha256": sha(sidecar_path),
        "entries": entries,
        "runtimeAdmission": False,
    }


def main() -> int:
    from production_paths import project_output

    parser = argparse.ArgumentParser()
    parser.add_argument("--sidecar", type=Path, required=True)
    parser.add_argument("--packages", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = project_output(args.output, __file__)
    result = build(args.sidecar.resolve(), args.packages.resolve())
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"schema": result["schema"], "entries": len(result["entries"]), "runtimeAdmission": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
