"""Read-only dynamic and surface admission for the two native FaceContour packages."""
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "assets-source/native-vroid-geometry-production-v1/generated/female-geometry-baseline.vrm"
PACKAGES = ROOT / "assets-source/native-parameter-game-packages-v1"
EVIDENCE = ROOT / "evidence/m2-native-batch-adaptation-v1"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw)
    if (magic, version, length) != (b"glTF", 2, len(raw)):
        raise ValueError("Invalid GLB: " + str(path))
    json_size, kind = struct.unpack_from("<I4s", raw, 12)
    if kind != b"JSON":
        raise ValueError("Missing JSON chunk")
    doc = json.loads(raw[20:20 + json_size])
    bin_size, kind = struct.unpack_from("<I4s", raw, 20 + json_size)
    if kind != b"BIN\0" or bin_size + 28 + json_size != len(raw):
        raise ValueError("Invalid BIN chunk")
    return raw, doc, raw[28 + json_size:]


def image(doc, blob, index):
    view = doc["bufferViews"][doc["images"][index]["bufferView"]]
    start = view.get("byteOffset", 0)
    return blob[start:start + view["byteLength"]]


def body_consumer(doc):
    rows = []
    for mesh_index, mesh in enumerate(doc["meshes"]):
        for primitive_index, primitive in enumerate(mesh["primitives"]):
            material = doc["materials"][primitive["material"]]
            if "_Body_" in material.get("name", "") and "_SKIN" in material.get("name", ""):
                rows.append((mesh_index, primitive_index, primitive, material))
    if len(rows) != 1:
        raise ValueError("Body primitive is ambiguous")
    mesh_index, primitive_index, primitive, material = rows[0]
    texture_info = material["pbrMetallicRoughness"]["baseColorTexture"]
    shade_info = material["extensions"]["VRMC_materials_mtoon"]["shadeMultiplyTexture"]
    if texture_info["index"] != shade_info["index"]:
        raise ValueError("Body base/shade texture differs")
    texture = doc["textures"][texture_info["index"]]
    return {
        "mesh": mesh_index, "primitive": primitive_index,
        "material": material["name"], "texture": texture_info["index"],
        "image": texture["source"], "baseTextureInfo": texture_info,
        "shadeTextureInfo": shade_info,
    }


def exact_dynamic(baseline, candidate):
    checks = ["nodes", "skins"]
    rows = {key: baseline.get(key) == candidate.get(key) for key in checks}
    base_ext, cand_ext = baseline.get("extensions", {}), candidate.get("extensions", {})
    rows["humanoid"] = base_ext.get("VRMC_vrm", {}).get("humanoid") == cand_ext.get("VRMC_vrm", {}).get("humanoid")
    rows["expressions"] = base_ext.get("VRMC_vrm", {}).get("expressions") == cand_ext.get("VRMC_vrm", {}).get("expressions")
    rows["springBone"] = base_ext.get("VRMC_springBone") == cand_ext.get("VRMC_springBone")
    return rows


def inspect_package(name):
    folder = PACKAGES / name
    body_path = folder / "body.vrm"
    body_raw, body_doc, body_bin = glb(body_path)
    base_raw, base_doc, base_bin = glb(BASELINE)
    consumer = body_consumer(body_doc)
    base_consumer = body_consumer(base_doc)
    if consumer["material"] != base_consumer["material"] or consumer["baseTextureInfo"] != base_consumer["baseTextureInfo"] or consumer["shadeTextureInfo"] != base_consumer["shadeTextureInfo"]:
        raise ValueError("Body material consumer differs")
    dynamic = exact_dynamic(base_doc, body_doc)
    if not all(dynamic.values()):
        raise ValueError("Dynamic skeleton or expressions differ")
    base_png = image(body_doc, body_bin, consumer["image"])
    mask_png = (folder / "native-tops-body.png").read_bytes()
    base_pixels = np.asarray(Image.open(io.BytesIO(base_png)).convert("RGBA"))
    mask_pixels = np.asarray(Image.open(io.BytesIO(mask_png)).convert("RGBA"))
    if base_pixels.shape != (2048, 2048, 4) or mask_pixels.shape != base_pixels.shape:
        raise ValueError("Body coverage dimensions differ")
    if not np.all(base_pixels[:, :, 3] == 255) or not np.array_equal(base_pixels[:, :, :3], mask_pixels[:, :, :3]):
        raise ValueError("Body coverage RGB or source opacity differs")
    changed_alpha = int(np.count_nonzero(base_pixels[:, :, 3] != mask_pixels[:, :, 3]))
    if not changed_alpha:
        raise ValueError("Body mask did not change alpha")
    delta = json.loads((EVIDENCE / (name + "-delta.json")).read_bytes())
    spring = body_doc["extensions"]["VRMC_springBone"]
    return {
        "id": name,
        "body": {"path": body_path.relative_to(ROOT).as_posix(), "sha256": sha(body_raw), "bytes": len(body_raw)},
        "dynamicMotion": {
            "status": "shared-structure-requires-motion-recheck",
            "springExtension": "VRMC_springBone",
            "springCount": len(spring.get("springs", [])),
            "colliderCount": len(spring.get("colliders", [])),
            "exactAgainstBaseline": dynamic,
            "reuse": "Reuse spring/normalized-motion configuration only after this candidate's head attachments, hair and expression motion are checked",
            "reasons": delta["requiredChecks"]["dynamicMotion"]["reasons"],
        },
        "surfaceAndTexture": {
            "status": "body-pixel-contract-admitted-face-surface-recheck",
            "bodyConsumer": consumer,
            "basePngSha256": sha(base_png),
            "coveredPngSha256": sha(mask_png),
            "dimensions": [2048, 2048],
            "rgbExact": True,
            "baseOpaque": True,
            "changedAlphaPixels": changed_alpha,
            "materialsAndImages": {"materialCount": len(body_doc["materials"]), "imageCount": len(body_doc["images"]), "bodyImageIndex": consumer["image"]},
            "reasons": delta["requiredChecks"]["surfaceAndTexture"]["reasons"],
        },
        "dependencyDelta": {"path": (EVIDENCE / (name + "-delta.json")).relative_to(ROOT).as_posix(), "sha256": sha((EVIDENCE / (name + "-delta.json")).read_bytes())},
        "limits": ["No runtime motion or visual acceptance", "No head attachment, microphone, seating or ordinary-PC performance proof", "Body texture admission does not admit arbitrary surface edits"],
    }


def main():
    rows = [inspect_package(name) for name in ("contour-roundness-a", "contour-cheek-b")]
    output = {"schema": "native-batch-adaptation-admission-v1", "baseline": {"path": BASELINE.relative_to(ROOT).as_posix(), "sha256": sha(BASELINE.read_bytes())}, "candidates": rows}
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    target = EVIDENCE / "adaptation-admissions.json"
    if target.exists():
        raise FileExistsError(str(target))
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\n")
    print(json.dumps({"candidates": len(rows), "output": target.as_posix()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
