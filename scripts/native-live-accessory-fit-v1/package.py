"""Seal CPU-only native microphone grip/mouth evidence without touching M1C outputs."""
import hashlib, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence/native-live-accessory-fit-v1"
SRC = ROOT / "assets-source/native-live-accessory-fit-v1"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    grip = {body: json.loads((SRC / f"{body}-grip.json").read_text()) for body in ("female", "male")}
    mouth = {name: json.loads((SRC / f"{name}-mouth.json").read_text()) for name in ("female", "male", "female-face", "female-waist")}
    comparison = json.loads((SRC / "hand-source-comparison.json").read_text())
    vrm_readback = json.loads((SRC / "vrm-readback.json").read_text())
    profile_index = json.loads((SRC / "runtime-candidate-index.json").read_text()) if (SRC / "runtime-candidate-index.json").exists() else None
    legacy_mic_anchors_path = ROOT / "evidence/mic-mouth-target/source-anchors.json"
    legacy_mic_anchors = json.loads(legacy_mic_anchors_path.read_text())
    old_failure = OUT / "old-m1c-overwrite-failure"
    old_files = sorted(str(path.relative_to(ROOT)).replace("\\", "/") for path in old_failure.rglob("*") if path.is_file())
    report = {
        "schema": "native-live-accessory-fit-v1",
        "status": "cpu-source-candidate-only",
        "grip": {
            body: {"sourceSha256": grip[body]["avatarSha256"], "source": grip[body]["source"],
                   "status": grip[body]["status"], "runtimeApplied": grip[body]["runtimeApplied"],
                   "metrics": grip[body]["metrics"], "micRawHandLocal": grip[body]["micRawHandLocal"]}
            for body in ("female", "male")
        },
        "mouth": {
            key: {"sourceSha256": mouth[key]["avatarSha256"], "source": mouth[key]["source"],
                  "mouthRawHeadLocal": mouth[key]["mouthRawHeadLocal"],
                  "aaMorphIndex": mouth[key]["aaMorphIndex"],
                  "aaMouthRawHeadLocal": mouth[key]["aaMouthRawHeadLocal"],
                  "rimVertexCount": len(mouth[key]["rimVertexIds"]),
                  "adjacentFaceNormal": mouth[key]["adjacentFaceAreaWeightedNormalRawHeadLocal"]}
            for key in mouth
        },
        "microphoneReference": {
            "source": legacy_mic_anchors["microphone"]["source"],
            "sha256": legacy_mic_anchors["microphone"]["sha256"],
            "gripSocketLocal": legacy_mic_anchors["microphone"]["gripSocketLocal"],
            "grilleFrontPoleLocal": legacy_mic_anchors["microphone"]["grilleFrontPoleLocal"],
            "meaning": "Existing geometric microphone reference only; no new native runtime asset was created."
        },
        "handDependencyComparison": comparison,
        "vrmLoaderReadback": vrm_readback,
        "runtimeCandidateIndex": profile_index,
        "oldOutputOverwriteFailure": {
            "detected": True, "restoredToGitHead": True,
            "preservedModifiedCopies": old_files,
            "cause": "Earlier fit generation wrote the legacy m1c-grip destination. The isolated script now writes only native-live-accessory-fit-v1."
        },
        "sourcePins": {
            "fitScript": sha(ROOT / "scripts/native-live-accessory-fit-v1/fit.py"),
            "mouthScript": sha(ROOT / "scripts/native-live-accessory-fit-v1/mouth.py"),
            "comparisonScript": sha(ROOT / "scripts/native-live-accessory-fit-v1/compare-hand-sources.py"),
            "vrmReadbackScript": sha(ROOT / "scripts/native-live-accessory-fit-v1/verify-vrm.mjs"),
            "profileScript": sha(ROOT / "scripts/native-live-accessory-fit-v1/build-profiles.py"),
            "packageScript": sha(ROOT / "scripts/native-live-accessory-fit-v1/package.py"),
            "femaleGrip": sha(SRC / "female-grip.json"), "maleGrip": sha(SRC / "male-grip.json"),
            "femaleMouth": sha(SRC / "female-mouth.json"), "maleMouth": sha(SRC / "male-mouth.json"),
            "femaleFaceMouth": sha(SRC / "female-face-mouth.json"), "femaleWaistMouth": sha(SRC / "female-waist-mouth.json"),
            "handComparison": sha(SRC / "hand-source-comparison.json")
        },
        "limits": [
            "No browser, VRM loader, GPU, runtime registration, or visual grip acceptance was run.",
            "The male optimizer ended at max function evaluations. Zero sampled cylinder penetration is not a successful natural grip.",
            "The corrected VRM1 thumb mapping gives Three/VRMLoader raw hand-local readback below 6.5e-8m for both bodies, while the male source cylinder still has 6.20mm thumb penetration and 13 vertices beyond 1mm.",
            "The mouth anchor is a static neutral FaceMouth seam centroid with a separate aa displacement, not a microphone-to-mouth presentation fit.",
            "Face and waist female sources preserve the 843ac hand POSITION/JOINTS/WEIGHTS and joint semantics, but their own mouth anchors were measured separately.",
            "The old M1C destination was restored after an overwrite failure and is not part of this candidate."
        ]
    }
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"status": report["status"], "reportSha256": sha(OUT / "report.json"), "sourcePins": report["sourcePins"]}, indent=2))

if __name__ == "__main__":
    main()
