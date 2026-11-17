"""Build four explicit source/runtime-candidate grip profiles from pinned CPU output."""
import hashlib, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-source/native-live-accessory-fit-v1"
OUT = SRC / "runtime-candidate"
PRESENT = SRC / "presentation"
OUT.mkdir(exist_ok=True); PRESENT.mkdir(exist_ok=True)

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    grips = {key: json.loads((SRC / f"{key}-grip.json").read_text()) for key in ("female", "male")}
    mouths = {
        "female": json.loads((SRC / "female-mouth.json").read_text()),
        "male": json.loads((SRC / "male-mouth.json").read_text()),
        "female-face": json.loads((SRC / "female-face-mouth.json").read_text()),
        "female-waist": json.loads((SRC / "female-waist-mouth.json").read_text()),
    }
    comparison = json.loads((SRC / "hand-source-comparison.json").read_text())
    readback = json.loads((SRC / "vrm-readback.json").read_text())
    source_by_id = {row["id"]: row for row in comparison["rows"]}
    readback_by_id = {row["body"]: row for row in readback["cases"]}
    mapping = {
        "female-843ac": ("female843ac", "female", "843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef", False),
        "female-face-cc0843": ("femaleFace", "female-face", "cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce", True),
        "female-waist-cf1574": ("femaleWaist", "female-waist", "cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5", True),
        "male-7586": ("male7586", "male", "7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81", False),
    }
    rows = []
    for profile_id, (source_id, mouth_id, target_sha, reused) in mapping.items():
        grip_key = "female" if source_id != "male7586" else "male"
        source = source_by_id[source_id]
        grip = grips[grip_key]
        mouth = mouths[mouth_id]
        row = {
            "schema": "native-live-accessory-grip-profile-v1",
            "id": profile_id,
            "status": "cpu-candidate-conditional" if grip["metrics"]["maxPenetrationMm"] > 0 else "cpu-candidate-only",
            "runtimeApplied": False,
            "targetBodySha256": target_sha,
            "sourceGripSha256": sha(SRC / f"{grip_key}-grip.json"),
            "sourceSkinReferenceSha256": sha(SRC / f"{grip_key}-skin-reference.json"),
            "sourceHandDependencyId": source_id,
            "grip": {"micRawHandLocal": grip["micRawHandLocal"], "normalizedFingerRotations": grip["normalizedFingerRotations"], "metrics": grip["metrics"], "optimizerStatus": grip["status"]},
            "mouth": {"sourceSha256": mouth["avatarSha256"], "rawHeadLocal": mouth["mouthRawHeadLocal"], "aaMorphIndex": mouth["aaMorphIndex"], "aaRawHeadLocal": mouth["aaMouthRawHeadLocal"], "rimVertexCount": len(mouth["rimVertexIds"])},
            "handDependency": {"positionAccessor": source["positionAccessor"], "selectedHandVertexCount": source["selectedHandVertexCount"], "influenceNodeIds": source["influenceNodeIds"], "influenceHumanoidSemantics": source["influenceHumanoidSemantics"], "jointsSameAsFemale843ac": source["jointsSameAsFemale843ac"], "weightsSameAsFemale843ac": source["weightsSameAsFemale843ac"], "handPositionSameAsFemale843ac": source["handPositionSameAsFemale843ac"], "reuseFemaleGrip": reused},
            "vrmLoaderReadback": readback_by_id[grip_key],
            "limits": ["No browser/GPU visual grip or speech acceptance.", "Microphone is a geometric existing reference; no new runtime accessory registration."]
        }
        (OUT / f"{profile_id}.json").write_text(json.dumps(row, indent=2) + "\n")
        presentation = {"schema": "native-live-accessory-presentation-candidate-v1", "profileId": profile_id, "targetBodySha256": target_sha, "runtimeApplied": False, "mount": grip["micRawHandLocal"], "mouth": row["mouth"], "microphoneReference": {"source": "prototype/public/assets/m1c/studio-microphone-v1.glb", "sha256": "4c236a9b58ae2736fdd5a69ed040db1d9434935b0b7548e3c75452a4aad4964c", "grilleFrontPoleLocal": [4.649162388403738e-09, 0.14799999818205833, -3.874301990336448e-09]}, "status": "source-candidate-awaiting-runtime-visual"}
        (PRESENT / f"{profile_id}.json").write_text(json.dumps(presentation, indent=2) + "\n")
        rows.append({"id": profile_id, "sha256": sha(OUT / f"{profile_id}.json"), "presentationSha256": sha(PRESENT / f"{profile_id}.json"), "status": row["status"]})
    result = {"schema": "native-live-accessory-profile-index-v1", "profiles": rows, "limits": ["Profiles are not runtime/public registrations.", "Female face/waist reuse is limited to exact hand POSITION/JOINTS/WEIGHTS and relevant hand influence IBM/rest matrices; mouth anchors remain source-specific."]}
    (SRC / "runtime-candidate-index.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))

if __name__ == "__main__": main()
