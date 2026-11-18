"""Prepare a bounded KTX2 sidecar for the two native FaceContour bodies.

This source-side tool reads the already packaged VRM bytes, extracts only the
Body material's exact PNG, and optionally encodes that PNG with the same pinned
KTX-Software configuration used by the fixed801 pilot. It never rewrites a VRM
or edits runtime admission tables. The generated manifest is an identity and
contract record for a future, separately reviewed runtime adapter.

Run without --encode for deterministic source/contract checks. Encoding uses
the existing isolated WSL KTX 4.4.2 executable and writes only this sidecar
directory and its evidence report.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import platform
import struct
import subprocess
import time
from pathlib import Path

import PIL
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
PILOT = ROOT / "assets-source/m2-ktx-pilot-v1"
SIDECAR = PILOT / "native-facecontour-sidecar-v1"
EVIDENCE = ROOT / "evidence/m2-ktx-native-facecontour-sidecar-v1"
TOOL_VERSION = "4.4.2"
TOOL = PILOT / f"tools/KTX-Software-{TOOL_VERSION}-Linux-x86_64/bin/ktx"
CONFIGURATION_ID = "uastc-q2-zstd18-srgb-full-mips-v1"
OPTIONS = [
    "--format", "R8G8B8A8_SRGB", "--encode", "uastc", "--uastc-quality", "2",
    "--zstd", "18", "--generate-mipmap", "--mipmap-filter", "lanczos4",
    "--mipmap-wrap", "wrap", "--assign-tf", "srgb", "--assign-primaries",
    "bt709", "--assign-texcoord-origin", "top-left", "--threads", "4",
]

EXPECTED = {
    "contour-roundness-a": {
        "bodyType": "native-contour-roundness-a-v1",
        "sourceModel": "assets-source/native-parameter-game-packages-v1/contour-roundness-a/body.vrm",
        "sourceModelSha256": "825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547",
        "coverageManifest": "assets-source/native-parameter-game-packages-v1/contour-roundness-a/manifest.json",
        "coverageManifestSha256": "e2b23e84213dd64fa87a8cf1c568120e392de5ae934710c25a2a8709589baead",
        "equipmentManifest": "assets-source/native-parameter-game-packages-v1/contour-roundness-a/equipment.json",
        "recipe": "assets-source/native-parameter-game-packages-v1/contour-roundness-a/recipe.json",
        "provenance": "assets-source/native-parameter-game-packages-v1/contour-roundness-a/provenance.json",
    },
    "contour-cheek-b": {
        "bodyType": "native-contour-cheek-b-v1",
        "sourceModel": "assets-source/native-parameter-game-packages-v1/contour-cheek-b/body.vrm",
        "sourceModelSha256": "9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb",
        "coverageManifest": "assets-source/native-parameter-game-packages-v1/contour-cheek-b/manifest.json",
        "coverageManifestSha256": "0a3e0c719d36ee8088047d79c91afceea94cb9479ac3b30097a24dfda6c60046",
        "equipmentManifest": "assets-source/native-parameter-game-packages-v1/contour-cheek-b/equipment.json",
        "recipe": "assets-source/native-parameter-game-packages-v1/contour-cheek-b/recipe.json",
        "provenance": "assets-source/native-parameter-game-packages-v1/contour-cheek-b/provenance.json",
    },
}
EXPECTED_BODY_IMAGE_SHA256 = "5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a"
EXPECTED_MASK_SHA256 = "dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def wsl_path(path: Path) -> str:
    resolved = path.resolve().as_posix()
    return f"/mnt/{resolved[0].lower()}{resolved[2:]}"


def read_glb(path: Path, spec: dict) -> tuple[bytes, dict, bytes]:
    raw = path.read_bytes()
    if sha(raw) != spec["sourceModelSha256"]:
        raise ValueError(f"Pinned source VRM changed: {relative(path)}")
    if raw[:4] != b"glTF":
        raise ValueError("Expected binary glTF VRM")
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("Expected JSON chunk")
    document = json.loads(raw[20:20 + json_length])
    bin_length, bin_type = struct.unpack_from("<II", raw, 20 + json_length)
    if bin_type != 0x004E4942:
        raise ValueError("Expected BIN chunk")
    binary = raw[28 + json_length:28 + json_length + bin_length]
    if len(binary) != bin_length:
        raise ValueError("Truncated BIN chunk")
    return raw, document, binary


def extract_body(slug: str) -> dict:
    spec = EXPECTED[slug]
    source = ROOT / spec["sourceModel"]
    raw, document, binary = read_glb(source, spec)
    materials = document.get("materials", [])
    matches = [(index, material) for index, material in enumerate(materials)
               if material.get("name") == "N00_000_00_Body_00_SKIN (Instance)"]
    if len(matches) != 1:
        raise ValueError(f"Expected one native Body material in {relative(source)}")
    material_index, material = matches[0]
    texture_index = material.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
    mtoon = material.get("extensions", {}).get("VRMC_materials_mtoon", {})
    shade_index = mtoon.get("shadeMultiplyTexture", {}).get("index")
    if texture_index != 11 or shade_index != 11:
        raise ValueError(f"Unexpected Body texture indices for {slug}: {texture_index}, {shade_index}")
    texture = document["textures"][texture_index]
    if texture.get("source") != 11:
        raise ValueError(f"Unexpected Body image source for {slug}")
    image = document["images"][11]
    view = document["bufferViews"][image["bufferView"]]
    offset = view.get("byteOffset", 0)
    png = binary[offset:offset + view["byteLength"]]
    if sha(png) != EXPECTED_BODY_IMAGE_SHA256:
        raise ValueError(f"Body PNG identity mismatch for {slug}")
    decoded = Image.open(io.BytesIO(png))
    rgba = decoded.convert("RGBA")
    alpha = rgba.getchannel("A").histogram()
    if rgba.size != (2048, 2048) or decoded.mode != "RGBA":
        raise ValueError(f"Body PNG dimensions/mode mismatch for {slug}")
    sampler = document["samplers"][texture["sampler"]]
    expected_sampler = {"magFilter": 9729, "minFilter": 9729, "wrapS": 10497, "wrapT": 10497}
    if {key: sampler.get(key) for key in expected_sampler} != expected_sampler:
        raise ValueError(f"Body sampler mismatch for {slug}")
    base_transform = material.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("extensions", {}).get("KHR_texture_transform", {})
    shade_transform = mtoon.get("shadeMultiplyTexture", {}).get("extensions", {}).get("KHR_texture_transform", {})
    if base_transform.get("offset", [0, 0]) != [0, 0] or base_transform.get("scale", [1, 1]) != [1, 1] or base_transform.get("texCoord", 0) != 0:
        raise ValueError(f"Body base UV transform mismatch for {slug}")
    if shade_transform.get("offset", [0, 0]) != [0, 0] or shade_transform.get("scale", [1, 1]) != [1, 1] or shade_transform.get("texCoord", 0) != 0:
        raise ValueError(f"Body shade UV transform mismatch for {slug}")
    if material.get("alphaMode") != "MASK" or material.get("alphaCutoff") != 0.5:
        raise ValueError(f"Body alpha contract mismatch for {slug}")
    package_manifest = json.loads((ROOT / spec["coverageManifest"]).read_text(encoding="utf-8"))
    if sha((ROOT / spec["coverageManifest"]).read_bytes()) != spec["coverageManifestSha256"]:
        raise ValueError(f"Coverage manifest identity mismatch for {slug}")
    if package_manifest.get("basePngSha256") != EXPECTED_BODY_IMAGE_SHA256 or package_manifest.get("covered", {}).get("sha256") != EXPECTED_MASK_SHA256:
        raise ValueError(f"Coverage manifest/body source mismatch for {slug}")
    output_png = SIDECAR / "images" / f"{slug}-body-color.png"
    output_png.parent.mkdir(parents=True, exist_ok=True)
    output_png.write_bytes(png)
    return {
        "id": f"{slug}-body-color",
        "bodyType": spec["bodyType"],
        "sourceModel": spec["sourceModel"],
        "sourceModelSha256": sha(raw),
        "sourceModelBytes": len(raw),
        "coverageManifest": spec["coverageManifest"],
        "coverageManifestSha256": spec["coverageManifestSha256"],
        "equipmentManifest": spec["equipmentManifest"],
        "recipe": spec["recipe"],
        "provenance": spec["provenance"],
        "materialIndex": material_index,
        "materialName": material["name"],
        "imageIndex": 11,
        "imageName": image.get("name"),
        "sourceBufferView": image["bufferView"],
        "sourceBufferViewOffset": offset,
        "sourcePng": relative(output_png),
        "sourcePngSha256": sha(png),
        "sourcePngBytes": len(png),
        "width": rgba.width,
        "height": rgba.height,
        "mode": decoded.mode,
        "alphaPixels": {"zero": alpha[0], "oneTo254": sum(alpha[1:255]), "opaque255": alpha[255]},
        "textureIndices": [texture_index, shade_index],
        "sampler": sampler,
        "materialContract": {
            "baseColorTextureIndex": texture_index,
            "shadeMultiplyTextureIndex": shade_index,
            "alphaMode": material["alphaMode"],
            "alphaCutoff": material["alphaCutoff"],
            "texCoord": 0,
            "transformIdentity": True,
            "sourceImageSha256": EXPECTED_BODY_IMAGE_SHA256,
        },
        "runtimeRule": "Body map candidate only. Preserve original Linear sampler, flipY=false, alpha MASK/0.5 and MToon material roles. Face, iris, brow and every hair map remain original PNG.",
    }


def ktx_header(path: Path) -> dict:
    data = path.read_bytes()
    if data[:12] != b"\xabKTX 20\xbb\r\n\x1a\n":
        raise ValueError("Expected KTX2 signature")
    values = struct.unpack_from("<9I", data, 12)
    names = ["vkFormat", "typeSize", "pixelWidth", "pixelHeight", "pixelDepth", "layerCount", "faceCount", "levelCount", "supercompressionScheme"]
    result = dict(zip(names, values))
    result["levels"] = [dict(zip(["byteOffset", "byteLength", "uncompressedByteLength"], struct.unpack_from("<3Q", data, 80 + index * 24))) for index in range(result["levelCount"])]
    return result


def run_tool(arguments: list[str], name: str) -> dict:
    command = ["wsl", "-d", "Ubuntu", "--exec", wsl_path(TOOL), *arguments]
    started = time.perf_counter()
    result = subprocess.run(command, capture_output=True)
    record = {
        "command": command,
        "exitCode": result.returncode,
        "elapsedSeconds": time.perf_counter() - started,
        "stdout": result.stdout.decode("utf-8", errors="replace"),
        "stderr": result.stderr.decode("utf-8", errors="replace"),
    }
    write_json(EVIDENCE / "commands" / f"{name}.json", record)
    if result.returncode:
        raise RuntimeError(f"KTX tool failed for {name}. See evidence command record.")
    return record


def encode(sample: dict) -> None:
    if not TOOL.exists():
        raise FileNotFoundError(f"Pinned KTX executable missing: {relative(TOOL)}")
    version = run_tool(["--version"], "version")
    if "v4.4.2" not in version["stdout"]:
        raise ValueError("Pinned KTX executable version mismatch")
    source = ROOT / sample["sourcePng"]
    output = SIDECAR / "encoded" / f"{sample['bodyType']}-body-color.ktx2"
    output.parent.mkdir(parents=True, exist_ok=True)
    create = run_tool(["create", *OPTIONS, wsl_path(source), wsl_path(output)], sample["bodyType"] + "-encode")
    validate = run_tool(["validate", wsl_path(output)], sample["bodyType"] + "-validate")
    info = run_tool(["info", "--format", "json", wsl_path(output)], sample["bodyType"] + "-info")
    header = ktx_header(output)
    if header["pixelWidth"] != sample["width"] or header["pixelHeight"] != sample["height"] or header["levelCount"] != 12:
        raise ValueError(f"KTX dimensions/mip count mismatch for {sample['bodyType']}")
    sample["encoded"] = {
        "path": relative(output),
        "sha256": sha(output.read_bytes()),
        "bytes": output.stat().st_size,
        "encodingSeconds": create["elapsedSeconds"],
        "validationExitCode": validate["exitCode"],
        "header": header,
        "info": json.loads(info["stdout"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--encode", action="store_true", help="Encode two KTX2 files with the pinned WSL tool")
    args = parser.parse_args()
    samples = [extract_body(slug) for slug in EXPECTED]
    manifest = {
        "schema": "m2-ktx-native-facecontour-sidecar-v1",
        "sourcePilotManifest": relative(PILOT / "manifest.json"),
        "sourcePilotManifestSha256": sha((PILOT / "manifest.json").read_bytes()),
        "tool": {
            "version": TOOL_VERSION,
            "executable": relative(TOOL),
            "executableSha256": sha(TOOL.read_bytes()) if TOOL.exists() else None,
            "python": platform.python_version(),
            "pillow": PIL.__version__,
            "execution": "Existing WSL Ubuntu isolated KTX release; no installation",
        },
        "configuration": {"id": CONFIGURATION_ID, "options": OPTIONS, "attemptBudget": "One pinned configuration; no sweep"},
        "samples": samples,
        "runtimeVerified": False,
        "limits": [
            "Source-side sidecar only. No VRM rewrite and no runtime admission or loader change.",
            "Body material map candidate only. Face, iris, brow and hair maps stay on original PNG sources.",
            "The two body identities bind separately even though their extracted Body PNG bytes and encoded KTX2 bytes are equal.",
            "No browser, GPU, ordinary-PC, action, visual, expression, garment-contact or gameplay acceptance is claimed.",
        ],
    }
    if args.encode:
        for sample in samples:
            encode(sample)
        if samples[0]["encoded"]["sha256"] != samples[1]["encoded"]["sha256"]:
            raise ValueError("Expected identical KTX bytes for identical body PNG inputs")
        manifest["encodedByteIdentity"] = {"equal": True, "sha256": samples[0]["encoded"]["sha256"]}
    else:
        manifest["encodedByteIdentity"] = {"equal": None, "reason": "Encoding not requested"}
    write_json(SIDECAR / "manifest.json", manifest)
    write_json(EVIDENCE / "report.json", manifest)
    print(json.dumps({"samples": [s["bodyType"] for s in samples], "encoded": args.encode, "manifest": relative(SIDECAR / "manifest.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
