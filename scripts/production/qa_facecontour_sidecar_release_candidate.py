"""Audit the FaceContour KTX2 sidecars without changing runtime admission.

This is an independent release-candidate audit. It verifies exact source and
derived-file identities, the body texture material contract, fallback assets,
and the existing v18 budget decision. It intentionally does not rewrite VRM
files or mutate the admission gate.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PILOT_MANIFEST_PATH = ROOT / "assets-source/m2-ktx-pilot-v1/native-facecontour-sidecar-v1/manifest.json"
RELEASE_MANIFEST_PATH = ROOT / "evidence/m2-native-release-sidecar-v1/manifest.json"
GATE_PATH = ROOT / "evidence/m2-native-admission-cycle-v18/gate.json"
REPORT_PATH = ROOT / "evidence/m2-native-release-sidecar-budget-review-v1/report.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def png_dimensions(path: Path) -> tuple[int, int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG with an IHDR chunk: {path}")
    width, height, bit_depth, color_type = struct.unpack(">IIBB", data[16:26])
    return width, height, color_type


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def main() -> int:
    pilot = read_json(PILOT_MANIFEST_PATH)
    release = read_json(RELEASE_MANIFEST_PATH)
    gate = read_json(GATE_PATH)

    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    check(
        "source-sidecar-manifest-identity",
        sha256(PILOT_MANIFEST_PATH) == release["sourceSidecarManifestSha256"],
        {"path": rel(PILOT_MANIFEST_PATH), "sha256": sha256(PILOT_MANIFEST_PATH)},
    )
    check(
        "release-manifest-candidate-only",
        release["runtimeAdmission"] is False
        and all(entry["admission"] == "candidate-only" for entry in release["entries"]),
        {"runtimeAdmission": release["runtimeAdmission"]},
    )

    pilot_by_id = {entry["bodyType"]: entry for entry in pilot["samples"]}
    gate_by_id = {item["bodyType"]: item for item in gate["items"]}
    body_results: list[dict[str, Any]] = []

    for entry in release["entries"]:
        body_type = entry["bodyType"]
        pilot_entry = pilot_by_id[body_type]
        gate_entry = gate_by_id[body_type]
        package_id = entry["id"].removesuffix("-body-color")
        package_dir = ROOT / "assets-source/native-parameter-game-packages-v1" / package_id
        profile = read_json(package_dir / "profile-candidate.json")
        provenance = read_json(package_dir / "provenance.json")
        budget = read_json(ROOT / "evidence/m2-native-batch-adaptation-v1" / f"{package_id}-budget.json")

        body_path = ROOT / entry["sourceModel"]
        candidate_path = ROOT / provenance["native"]["path"]
        png_path = ROOT / entry["fallbackPng"]
        ktx_path = ROOT / entry["derivedTexture"]
        png_width, png_height, png_color_type = png_dimensions(png_path)

        body_hash = sha256(body_path)
        candidate_hash = sha256(candidate_path)
        png_hash = sha256(png_path)
        ktx_hash = sha256(ktx_path)
        gate_budget = gate_entry["budgetClassification"]
        static_budget = budget["metrics"]
        violations = budget["violations"]

        body_checks = [
            body_hash == entry["sourceModelSha256"] == gate_entry["bodySha256"],
            profile["sourceExportSha256"] == provenance["native"]["sha256"] == candidate_hash,
            provenance["bodySha256"] == body_hash,
            png_hash == entry["fallbackPngSha256"] == pilot_entry["sourcePngSha256"],
            png_width == pilot_entry["width"] == 2048
            and png_height == pilot_entry["height"] == 2048
            and png_color_type == 6,
            ktx_hash == entry["derivedTextureSha256"] == pilot_entry["encoded"]["sha256"],
            entry["target"]["materialContract"] == {
                "baseColorTextureIndex": pilot_entry["materialContract"]["baseColorTextureIndex"],
                "shadeMultiplyTextureIndex": pilot_entry["materialContract"]["shadeMultiplyTextureIndex"],
                "alphaMode": pilot_entry["materialContract"]["alphaMode"],
                "alphaCutoff": pilot_entry["materialContract"]["alphaCutoff"],
                "texCoord": pilot_entry["materialContract"]["texCoord"],
                "transformIdentity": pilot_entry["materialContract"]["transformIdentity"],
                "sourceImageSha256": pilot_entry["materialContract"]["sourceImageSha256"],
            },
            gate_budget["decision"] == "reject-static-over-budget"
            and gate_budget["budgetAdmission"] is False
            and budget["status"] == "rejected",
            gate_budget["ordinaryPC"]["status"] == "unmeasured",
        ]

        body_results.append(
            {
                "id": entry["id"],
                "bodyType": body_type,
                "identity": {
                    "bodySha256": body_hash,
                    "sourceExportSha256": profile["sourceExportSha256"],
                    "candidateExportSha256": candidate_hash,
                    "fallbackPngSha256": png_hash,
                    "derivedTextureSha256": ktx_hash,
                    "encodedBytes": ktx_path.stat().st_size,
                },
                "material": {
                    "materialIndex": entry["target"]["materialIndex"],
                    "imageIndex": entry["target"]["imageIndex"],
                    "materialName": entry["target"]["materialName"],
                    "width": png_width,
                    "height": png_height,
                    "pngColorType": png_color_type,
                    "contract": entry["target"]["materialContract"],
                    "uvTransform": provenance["bodyConsumer"]["effectiveTransformIdentity"],
                    "effectiveUV": provenance["bodyConsumer"]["effectiveUV"],
                    "alphaPixels": pilot_entry["alphaPixels"],
                },
                "budget": {
                    "decision": gate_budget["decision"],
                    "budgetAdmission": gate_budget["budgetAdmission"],
                    "status": budget["status"],
                    "ordinaryPC": gate_budget["ordinaryPC"],
                    "violations": violations,
                    "metrics": static_budget,
                },
                "checksPassed": sum(body_checks),
                "checksTotal": len(body_checks),
                "allChecksPassed": all(body_checks),
            }
        )

    encoded_hashes = {item["identity"]["derivedTextureSha256"] for item in body_results}
    check(
        "deterministic-encoded-byte-identity",
        len(encoded_hashes) == 1,
        {"sha256": sorted(encoded_hashes), "bodyCount": len(body_results)},
    )
    check(
        "two-body-audit-complete",
        len(body_results) == 2 and all(item["allChecksPassed"] for item in body_results),
        {"bodies": [item["id"] for item in body_results]},
    )

    all_checks_passed = all(item["passed"] for item in checks)
    report = {
        "schema": "native-facecontour-sidecar-budget-review-v1",
        "status": "technical-pass-candidate-only" if all_checks_passed else "audit-failed",
        "decision": "reject-runtime-admission",
        "candidateDerivative": "safe-candidate-only",
        "runtimeAdmission": False,
        "sourceManifest": rel(PILOT_MANIFEST_PATH),
        "releaseManifest": rel(RELEASE_MANIFEST_PATH),
        "gate": rel(GATE_PATH),
        "checks": checks,
        "bodies": body_results,
        "reasonsForRuntimeRejection": [
            "v18 gate rejects both bodies as statically over budget",
            "ordinary-PC performance is unmeasured",
            "KTX2 browser/WebGL loader and target-device residency are not admitted",
            "dynamic motion, head attachments, surface/texture and runtime record checks remain per-body follow-ups",
        ],
        "nextMinimumInput": [
            "A deterministic body-target KTX2 browser/WebGL decode and close/reopen trace for each exact body SHA",
            "ordinary-PC measurement using the fixed candidate build and the existing runtime budget contract",
            "A new body export or budget specification that clears every v18 static violation before admission is reconsidered",
        ],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "decision": report["decision"], "report": rel(REPORT_PATH)}))
    return 0 if all_checks_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
