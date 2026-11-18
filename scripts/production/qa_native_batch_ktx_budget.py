"""Read-only KTX sidecar fit and static budget report for native FaceContour packages."""
import hashlib
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KTX = ROOT / "assets-source/m2-ktx-pilot-v1"
PACKAGES = ROOT / "assets-source/native-parameter-game-packages-v1"
EVIDENCE = ROOT / "evidence/m2-native-batch-adaptation-v1"
PILOT = json.loads((KTX / "manifest.json").read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_report():
    old_female = next(row for row in PILOT["samples"] if row["id"] == "female-body-color")
    rows = []
    for name in ("contour-roundness-a", "contour-cheek-b"):
        folder = PACKAGES / name
        profile = json.loads((folder / "profile-candidate.json").read_bytes())
        package_png = folder / "native-tops-body.png"
        body = json.loads((folder / "provenance.json").read_bytes())
        budget = json.loads((EVIDENCE / (name + "-budget.json")).read_bytes())
        rows.append({
            "id": name,
            "bodySha256": profile["profile"]["sha256"],
            "bodySourceExportSha256": profile["sourceExportSha256"],
            "packagePngSha256": sha(package_png),
            "pilotFemaleBodySourceModelSha256": old_female["sourceModelSha256"],
            "pilotFemaleBodyPngSha256": old_female["sourcePngSha256"],
            "pilotReuse": {"sourceModel": False, "bodyPng": False, "materialName": False},
            "sidecarPolicy": "publish-KTX2-as-explicit-derived-resource-only; keep VRM source and PNG/Canvas fallback",
            "staticBudget": {
                "status": budget["status"],
                "metrics": budget["metrics"],
                "violations": budget.get("violations", []),
                "ordinaryPCPerformance": budget.get("ordinaryPCPerformance"),
            },
            "dynamicMotion": "requires per-body motion recheck before hair KTX sidecar admission",
            "surfaceAndTexture": "PNG body coverage admitted; KTX2 texture replacement not admitted",
            "provenanceSha256": sha(folder / "provenance.json"),
        })
    out = {
        "schema": "native-batch-ktx-sidecar-budget-v1",
        "pilotManifestSha256": sha(KTX / "manifest.json"),
        "pilotConfiguration": PILOT["configuration"],
        "pilotRuntimeVerified": PILOT["runtimeVerified"],
        "decision": "reject-direct-ktx-reuse",
        "decisionReasons": [
            "KTX pilot samples pin old 801 model and image identities, not either FaceContour body",
            "Current runtime KTX trial requires PNG/Canvas fallback for hair and does not replace a VRM image graph generically",
            "New FaceContour bodies exceed current static body budget and need explicit target-device evidence",
            "No KTX2 encoding was run for the new bodies and no VRM source model was modified",
        ],
        "candidates": rows,
    }
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the read-only native KTX sidecar budget report")
    parser.add_argument("--overwrite", action="store_true", help="replace an existing report only after its bytes are intentionally changed")
    args = parser.parse_args(argv)
    target = EVIDENCE / "native-batch-ktx-budget.json"
    rendered = json.dumps(build_report(), ensure_ascii=False, indent=2) + "\n"
    encoded = rendered.encode("utf8")
    if target.exists():
        existing = target.read_bytes()
        if existing == encoded:
            print(json.dumps({"output": target.as_posix(), "status": "unchanged", "candidates": 2}))
            return
        if not args.overwrite:
            raise SystemExit(
                f"refusing to replace changed evidence: {target}; rerun with --overwrite after reviewing the diff"
            )
    target.write_bytes(encoded)
    print(json.dumps({"output": target.as_posix(), "status": "written", "candidates": 2}))


if __name__ == "__main__":
    main()
