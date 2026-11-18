"""Audit native parameter-batch surface/texture identity without changing assets.

The report deliberately has three separate gates.  Static identity is checked
from the source provenance, embedded VRM and shipped body-coverage manifest.
Browser/runtime and visual admission require independent evidence and remain
blocked when the package has no such evidence.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "m2-male-face-v1"))
from glb import GLB  # noqa: E402

PACKAGES = {
    "contour-roundness-a": "native-contour-roundness-a-v1",
    "contour-cheek-b": "native-contour-cheek-b-v1",
}

# These are the exact common Body consumer identities recorded by the native
# exporter.  They are intentionally explicit so a changed body cannot inherit
# an older palette or texture claim by matching only its label.
EXPECTED = {
    "mesh": 1,
    "primitive": 0,
    "material": 8,
    "texture": 11,
    "image": 11,
    "materialName": "N00_000_00_Body_00_SKIN (Instance)",
    "imageName": "_10",
    "imageMimeType": "image/png",
    "imageSize": [2048, 2048],
    "imageSha256": "5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a",
    "uvAccessor": 129,
    "uvSha256": "6ff4b794e520ae96a7159a8bf2fa7872ff762bae6451fb7d9665f95008c865b0",
    "baseTexCoord": 0,
    "alphaMode": "MASK",
    "alphaCutoff": 0.5,
    "sampler": {"magFilter": 9729, "minFilter": 9729, "wrapS": 10497, "wrapT": 10497},
    "transform": {"offset": [0, 0], "scale": [1, 1]},
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def texture_bytes(gltf: GLB, image_index: int) -> bytes:
    image = gltf.doc["images"][image_index]
    view = gltf.doc["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return gltf.bin[start : start + view["byteLength"]]


def transform(info: dict | None) -> dict:
    ext = (info or {}).get("extensions", {}).get("KHR_texture_transform", {})
    return {"offset": ext.get("offset", [0, 0]), "scale": ext.get("scale", [1, 1])}


def audit_package(package: str, body_type: str) -> dict:
    source = ROOT / "assets-source" / "native-parameter-game-packages-v1" / package
    public = ROOT / "prototype" / "public" / "assets" / body_type
    provenance = json.loads((source / "provenance.json").read_text(encoding="utf-8"))
    source_manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    public_manifest = json.loads((public / "manifest.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "prototype" / "src" / "native-production-catalog.json").read_text(encoding="utf-8"))
    profile = next(row["profile"] for row in catalog["entries"] if row["bodyType"] == body_type)

    body_bytes = (source / "body.vrm").read_bytes()
    body_sha = sha(body_bytes)
    require(body_sha == provenance["bodySha256"], "source body SHA differs from provenance")
    require(body_sha == profile["sha256"], "source body SHA differs from production profile")
    require(body_sha == public_manifest["avatarSha256"], "source body SHA differs from public coverage manifest")
    require(source_manifest["avatarSha256"] == body_sha, "source coverage avatar identity mismatch")
    require(public_manifest["basePngSha256"] == EXPECTED["imageSha256"], "coverage base image identity mismatch")

    gltf = GLB(source / "body.vrm")
    consumer = provenance["bodyConsumer"]
    for key in ("mesh", "primitive", "material", "texture", "image"):
        require(consumer[key] == EXPECTED[key], f"provenance {key} identity mismatch")
    primitive = gltf.doc["meshes"][EXPECTED["mesh"]]["primitives"][EXPECTED["primitive"]]
    require(primitive["material"] == EXPECTED["material"], "Body primitive material index mismatch")
    material = gltf.doc["materials"][EXPECTED["material"]]
    require(material["name"] == EXPECTED["materialName"], "Body material name mismatch")
    base = material["pbrMetallicRoughness"]["baseColorTexture"]
    shade = material["extensions"]["VRMC_materials_mtoon"]["shadeMultiplyTexture"]
    require(base["index"] == EXPECTED["texture"] and base.get("texCoord", 0) == EXPECTED["baseTexCoord"], "Body base texture identity mismatch")
    require(shade["index"] == EXPECTED["texture"], "Body shade texture identity mismatch")
    require(transform(base) == EXPECTED["transform"] and transform(shade) == EXPECTED["transform"], "Body UV transform mismatch")
    texture = gltf.doc["textures"][EXPECTED["texture"]]
    require(texture["source"] == EXPECTED["image"], "Body texture image index mismatch")
    require(consumer["sampler"] == EXPECTED["sampler"], "Provenance sampler identity mismatch")
    sampler = gltf.doc["samplers"][texture["sampler"]]
    require(sampler == EXPECTED["sampler"], "Body sampler identity mismatch")
    image = gltf.doc["images"][EXPECTED["image"]]
    require(image.get("name") == EXPECTED["imageName"] and image.get("mimeType") == EXPECTED["imageMimeType"], "Body image identity mismatch")
    image_data = texture_bytes(gltf, EXPECTED["image"])
    require(sha(image_data) == EXPECTED["imageSha256"], "Embedded Body image SHA mismatch")
    with Image.open(io.BytesIO(image_data)) as embedded:
        require(list(embedded.size) == EXPECTED["imageSize"], "Embedded Body image dimensions mismatch")
    with Image.open(source / "native-tops-body.png") as covered:
        require(list(covered.size) == EXPECTED["imageSize"], "Covered Body image dimensions mismatch")
    uv = gltf.acc(primitive["attributes"]["TEXCOORD_0"])
    require(primitive["attributes"]["TEXCOORD_0"] == EXPECTED["uvAccessor"], "Body UV accessor identity mismatch")
    require(sha(uv.tobytes()) == EXPECTED["uvSha256"], "Body UV bytes mismatch")
    require(material["alphaMode"] == EXPECTED["alphaMode"] and material["alphaCutoff"] == EXPECTED["alphaCutoff"], "Body alpha identity mismatch")
    require(consumer["effectiveUV"] == EXPECTED["baseTexCoord"] and consumer["effectiveTransformIdentity"] is True, "Provenance UV identity mismatch")

    # The source and static checks above do not constitute browser or visual
    # acceptance.  Keep those gates typed and explicit in the artifact.
    return {
        "bodyType": body_type,
        "bodySha256": body_sha,
        "static": {
            "status": "passed",
            "bodyShaExact": True,
            "imageMaterialUvAlphaExact": True,
            "coverageManifestExact": True,
        },
        "runtime": {
            "status": "blocked",
            "reason": "No browser/WebGL runtime admission evidence is attached to this native batch package",
            "sourceRecordRuntimeAccepted": provenance.get("runtimeAccepted", False),
        },
        "visual": {
            "status": "blocked",
            "reason": "No human visual acceptance evidence is attached to this native batch package",
            "sourceRecordVisualAccepted": provenance.get("visualAccepted", False),
        },
        "limits": [
            "Static identity is exact for this body SHA and its own embedded image/material/UV/alpha graph.",
            "The result does not transfer palette, surface or hair evidence to another body SHA.",
            "Runtime and visual admission require separate browser and human evidence.",
        ],
    }


def main() -> None:
    rows = [audit_package(package, body_type) for package, body_type in PACKAGES.items()]
    report = {
        "schema": "native-surface-texture-admission-v1",
        "staticGate": "passed",
        "runtimeGate": "blocked",
        "visualGate": "blocked",
        "bodies": rows,
        "scope": "native parameter batch surface/texture identity only",
    }
    out = ROOT / "evidence" / "m2-native-surface-texture-admission-v1" / "REPORT.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "staticGate": "passed", "runtimeGate": "blocked", "visualGate": "blocked", "report": out.relative_to(ROOT).as_posix()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
