"""Extract four pinned VRM images and encode one bounded KTX2 UASTC candidate.

Run from any directory with Python + Pillow. Encoding uses existing Ubuntu WSL.
No source VRM is written. Obtain the shared heavy-work slot before --encode.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import platform
import struct
import subprocess
import tarfile
import time
import urllib.request

import PIL
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets-source/m2-ktx-pilot-v1"
EVIDENCE = ROOT / "evidence/m2-ktx-pilot-source-v1"
VERSION = "4.4.2"
ARCHIVE = f"KTX-Software-{VERSION}-Linux-x86_64.tar.bz2"
ARCHIVE_SHA = "a8781bad05f9624edbf910b7f258cd0a4ba7d3e63b49ecc0a0ab440bf6a0a245"
DOWNLOAD = f"https://github.com/KhronosGroup/KTX-Software/releases/download/v{VERSION}/{ARCHIVE}"
TOOL = ASSETS / f"tools/KTX-Software-{VERSION}-Linux-x86_64/bin/ktx"
SOURCE_SHA = {
    "male": "62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff",
    "female": "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95",
}
OPTIONS = [
    "--format", "R8G8B8A8_SRGB", "--encode", "uastc", "--uastc-quality", "2",
    "--zstd", "18", "--generate-mipmap", "--mipmap-filter", "lanczos4",
    "--mipmap-wrap", "wrap", "--assign-tf", "srgb", "--assign-primaries", "bt709",
    "--assign-texcoord-origin", "top-left", "--threads", "4",
]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(path):
    return path.relative_to(ROOT).as_posix()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def wsl_path(path):
    resolved = path.resolve().as_posix()
    return f"/mnt/{resolved[0].lower()}{resolved[2:]}"


def run_tool(arguments, name):
    command = ["wsl", "-d", "Ubuntu", "--exec", wsl_path(TOOL), *arguments]
    started = time.perf_counter()
    result = subprocess.run(command, capture_output=True)
    record = {
        "command": command, "exitCode": result.returncode,
        "elapsedSeconds": time.perf_counter() - started,
        "stdout": result.stdout.decode("utf-8", errors="replace"),
        "stderr": result.stderr.decode("utf-8", errors="replace"),
    }
    write_json(EVIDENCE / "commands" / f"{name}.json", record)
    if result.returncode:
        raise RuntimeError(f"Tool failed, retained {name}.json")
    return record


def bootstrap():
    archive = ASSETS / "tools" / ARCHIVE
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        urllib.request.urlretrieve(DOWNLOAD, archive)
    if sha(archive.read_bytes()) != ARCHIVE_SHA:
        raise ValueError("Official archive SHA mismatch")
    if not TOOL.exists():
        with tarfile.open(archive) as source:
            source.extractall(archive.parent, filter="data")
    version = run_tool(["--version"], "version")
    if "v4.4.2" not in version["stdout"]:
        raise ValueError("KTX executable version mismatch")
    run_tool(["create", "--help"], "create-help")
    return {
        "version": VERSION, "downloadUrl": DOWNLOAD, "archiveSha256": ARCHIVE_SHA,
        "sourceCommit": "4d6fc70eaf62ad0558e63e8d97eb9766118327a6",
        "archiveBytes": archive.stat().st_size, "executableSha256": sha(TOOL.read_bytes()),
        "execution": "Existing WSL Ubuntu, isolated extracted Linux x86_64 release, no installation",
        "releaseUrl": "https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2",
        "publishedDigestUrl": "https://github.com/KhronosGroup/KTX-Software/releases/expanded_assets/v4.4.2",
        "license": "Apache-2.0 for project files plus upstream third-party licenses. See licenses/README.md.",
        "python": platform.python_version(), "pillow": PIL.__version__,
    }


def extract(gender):
    model = ROOT / f"experiments/m2-runtime-transfer-801/{gender}-final-package/assets/foundation/base-{gender}-roundtrip.vrm"
    raw = model.read_bytes()
    if sha(raw) != SOURCE_SHA[gender]:
        raise ValueError(f"Pinned {gender} source changed")
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    if raw[:4] != b"glTF" or json_type != 0x4E4F534A:
        raise ValueError("Expected binary glTF JSON chunk")
    document = json.loads(raw[20:20 + json_length])
    bin_length, bin_type = struct.unpack_from("<II", raw, 20 + json_length)
    if bin_type != 0x004E4942:
        raise ValueError("Expected BIN chunk")
    binary = raw[28 + json_length:28 + json_length + bin_length]
    samples = []
    for image_index, role in [(0, "body-color"), (9, "hair-alpha-canvas")]:
        image = document["images"][image_index]
        view = document["bufferViews"][image["bufferView"]]
        offset = view.get("byteOffset", 0)
        png = binary[offset:offset + view["byteLength"]]
        decoded = Image.open(io.BytesIO(png))
        rgba = decoded.convert("RGBA")
        alpha = rgba.getchannel("A").histogram()
        path = ASSETS / "images" / f"{gender}-{role}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(png)
        textures = [i for i, value in enumerate(document["textures"]) if value.get("source") == image_index]
        uses = []
        for material_index, material in enumerate(document["materials"]):
            texture_index = material.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
            mtoon = document["extensions"]["VRM"]["materialProperties"][material_index]
            properties = {key: value for key, value in mtoon["textureProperties"].items() if value in textures}
            if texture_index not in textures and not properties:
                continue
            primitives = [
                {"meshIndex": mi, "meshName": mesh.get("name"), "primitiveIndex": pi,
                 "positionAccessor": primitive["attributes"]["POSITION"]}
                for mi, mesh in enumerate(document["meshes"])
                for pi, primitive in enumerate(mesh["primitives"])
                if primitive.get("material") == material_index
            ]
            uses.append({"materialIndex": material_index, "name": material["name"],
                         "gltfBaseColorTextureIndex": texture_index, "mtoonTextureProperties": properties,
                         "alphaMode": material.get("alphaMode", "OPAQUE"),
                         "alphaCutoff": material.get("alphaCutoff"), "primitiveUses": primitives})
        samples.append({
            "id": f"{gender}-{role}", "gender": gender, "sourceModel": relative(model),
            "sourceModelSha256": sha(raw), "sourceModelBytes": len(raw), "imageIndex": image_index,
            "imageName": image.get("name"), "mimeType": image["mimeType"],
            "sourceBufferView": image["bufferView"], "sourceBufferViewOffset": offset,
            "sourcePng": relative(path), "sourcePngSha256": sha(png), "sourcePngBytes": len(png),
            "width": rgba.width, "height": rgba.height, "mode": decoded.mode,
            "alphaPixels": {"zero": alpha[0], "oneTo254": sum(alpha[1:255]), "opaque255": alpha[255]},
            "sourcePngMetadata": {key: value for key, value in decoded.info.items() if isinstance(value, (str, int, float, list, tuple))},
            "materialUses": uses, "textureIndices": textures,
            "samplers": [document["samplers"][document["textures"][index]["sampler"]] for index in textures],
            "colorSpace": "sRGB RGB, linear straight alpha, glTF baseColor and MToon color/shade roles",
            "mipDeclaration": {"sourcePngLevels": 1, "sourceSamplerMinFilter": 9729,
                               "encodedLevels": max(rgba.size).bit_length(), "filter": "lanczos4", "wrap": "wrap",
                               "runtimeRule": "Preserve original LINEAR minFilter, wrapping, flipY=false and material alpha state. Record original actual generated mips separately."},
            "canvasReadSource": relative(path) if image_index == 9 else None,
            "canvasRule": "Hair requires original PNG texture.image for neutralTexture. Keep PNG Source separate from CompressedTexture Source. Original face/iris/brow PNG remain unchanged.",
        })
    return samples


def ktx_header(path):
    data = path.read_bytes()
    if data[:12] != b"\xabKTX 20\xbb\r\n\x1a\n":
        raise ValueError("Expected KTX2 signature")
    values = struct.unpack_from("<9I", data, 12)
    names = ["vkFormat", "typeSize", "pixelWidth", "pixelHeight", "pixelDepth", "layerCount", "faceCount", "levelCount", "supercompressionScheme"]
    result = dict(zip(names, values))
    result["levels"] = [dict(zip(["byteOffset", "byteLength", "uncompressedByteLength"], struct.unpack_from("<3Q", data, 80 + i * 24))) for i in range(result["levelCount"])]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--encode", action="store_true", help="Requires parent-held heavy CPU slot")
    args = parser.parse_args()
    tool = bootstrap()
    samples = extract("male") + extract("female")
    manifest = {"schema": "m2-ktx-pilot-source-v1", "fixedBuildId": "801c7a9c9026",
                "fixedSourceCommit": "58bc10748cc9fa618f8ecf58b54abbb7de12ffb8", "tool": tool,
                "configuration": {"id": "uastc-q2-zstd18-srgb-full-mips-v1", "options": OPTIONS,
                                  "attemptBudget": "One configuration, at most one evidence-driven correction, no sweep"},
                "samples": samples, "runtimeVerified": False}
    write_json(ASSETS / "manifest.json", manifest)
    if args.encode:
        for sample in samples:
            source = ROOT / sample["sourcePng"]
            output = ASSETS / "encoded" / f"{sample['id']}.ktx2"
            output.parent.mkdir(parents=True, exist_ok=True)
            run = run_tool(["create", *OPTIONS, wsl_path(source), wsl_path(output)], sample["id"] + "-encode")
            run_tool(["validate", wsl_path(output)], sample["id"] + "-validate")
            info = run_tool(["info", "--format", "json", wsl_path(output)], sample["id"] + "-info")
            write_json(EVIDENCE / (sample["id"] + "-ktx-info.json"), json.loads(info["stdout"]))
            sample["encoded"] = {"path": relative(output), "sha256": sha(output.read_bytes()),
                                 "bytes": output.stat().st_size, "encodingSeconds": run["elapsedSeconds"],
                                 "header": ktx_header(output), "validation": "KTX4.4.2 validate exit0"}
            if sample["encoded"]["header"]["pixelWidth"] != sample["width"] or sample["encoded"]["header"]["pixelHeight"] != sample["height"]:
                raise ValueError("Same-resolution requirement failed")
            write_json(ASSETS / "manifest.json", manifest)
            print(sample["id"], sample["sourcePngBytes"], "->", sample["encoded"]["bytes"], f"{run['elapsedSeconds']:.2f}s", flush=True)
    write_json(EVIDENCE / "source-report.json", manifest)


if __name__ == "__main__":
    main()
