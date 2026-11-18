"""Audit one native-authored palette against the two exact FaceContour bodies."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "assets-source/native-vroid-iris-study-v1"
BROW = "assets-source/native-vroid-hair-color-study-v1"
STAGING = ROOT / "assets-source/native-facecontour-iris-palette-v1"
MALE_PALETTE = "prototype/public/assets/native-iris-palette-v1"
TARGETS = {
    "contour-roundness-a": (
        "825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547",
        "7c94290453078406d7b140117df6a06c0e6104b01d152c00128fefee0e74c2e6",
    ),
    "contour-cheek-b": (
        "9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb",
        "98dcc6fbe1554b05b50f520fe01e51bad4376d3416535debcb17c1d0e238d087",
    ),
}
SAMPLER = {"magFilter": 9729, "minFilter": 9729, "wrapS": 10497, "wrapT": 10497}
LICENSE_FIELDS = (
    "authors", "licenseUrl", "avatarPermission", "creditNotation", "allowRedistribution",
    "commercialUsage", "modification", "allowExcessivelyViolentUsage",
    "allowExcessivelySexualUsage", "allowPoliticalOrReligiousUsage", "allowAntisocialOrHateUsage",
)

spec = importlib.util.spec_from_file_location("native_iris_readback", ROOT / SOURCE / "readback.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pinned(ref):
    path = (ROOT / ref["path"]).resolve()
    require(path.is_relative_to(ROOT), "Input escapes repository")
    data = path.read_bytes()
    require(sha(data) == ref["sha256"], "Input identity mismatch: " + ref["path"])
    return data


def reference(path, digest):
    return {"path": path, "sha256": digest}


def model(ref):
    pinned(ref)
    return native.reader.GLB(ROOT / ref["path"])


def main_image(gltf, token):
    material, = [m for m in gltf.doc["materials"] if token in m["name"]]
    tex = gltf.doc["textures"][material["pbrMetallicRoughness"]["baseColorTexture"]["index"]]
    return native.image(gltf, tex["source"])


def material_texture_uses(gltf, image_index):
    def texture_infos(obj, prefix=""):
        for key, value in obj.items():
            if isinstance(value, dict):
                path = prefix + key
                if key.lower().endswith("texture") and "index" in value:
                    yield path, value["index"]
                yield from texture_infos(value, path + ".")

    return [
        [index, slot]
        for index, material in enumerate(gltf.doc["materials"])
        for slot, texture in texture_infos(material)
        if gltf.doc["textures"][texture]["source"] == image_index
    ]


def iris_signature(gltf, expected_material):
    raw, entry = native.extract(gltf)
    require(entry["material"] == expected_material and entry["sampler"] == SAMPLER,
            "Iris MToon material or sampler differs")
    consumer, = entry["consumers"]
    material_index = entry["materialIndex"]
    require(material_texture_uses(gltf, entry["imageIndex"]) == [
        [material_index, "pbrMetallicRoughness.baseColorTexture"],
        [material_index, "extensions.VRMC_materials_mtoon.shadeMultiplyTexture"],
    ], "Iris image has an unexpected material consumer")
    expressions = gltf.doc["extensions"]["VRMC_vrm"]["expressions"]
    require(not any(
        bind["material"] == material_index
        for group in expressions.values()
        for expr in group.values()
        for kind in ("materialColorBinds", "textureTransformBinds")
        for bind in expr.get(kind, [])
    ), "An expression changes iris texture routing or material")
    indices = gltf.acc(consumer["indexAccessor"]).ravel()
    uv = gltf.acc(consumer["attributes"]["TEXCOORD_0"])[indices]
    return raw, {
        "materialName": entry["materialName"],
        "materialSha256": sha(json.dumps(expected_material, sort_keys=True).encode()),
        "sampler": entry["sampler"],
        "indices": len(indices),
        "indexSha256": sha(indices.tobytes()),
        "indexedUvSha256": sha(uv.tobytes()),
        "protectedEyeImages": {
            role: sha(main_image(gltf, "_" + role + "_")) for role in ("EyeWhite", "EyeHighlight")
        },
    }


def license_terms(gltf):
    meta = gltf.doc["extensions"]["VRMC_vrm"]["meta"]
    return {field: meta[field] for field in LICENSE_FIELDS}


def audit():
    iris_ref = reference(
        SOURCE + "/manifest.json", "714c0448c4aa4bade52a13c68115ea384b652c5710f44e4345cb48900465b9b8"
    )
    iris = json.loads(pinned(iris_ref))
    require(iris["schema"] == "native-iris-color-source-v1", "Wrong iris source schema")
    pinned(iris["sourceEditable"])
    pinned(iris["nativeEditable"])
    author_base = model(iris["originalVrm"])
    author_edit = model(iris["nativeVrm"])
    expected_material = iris["consumer"]["material"]
    source_png, signature = iris_signature(author_base, expected_material)
    green_png, edited_signature = iris_signature(author_edit, expected_material)
    require(source_png == pinned(iris["sourceImage"]) and green_png == pinned(iris["image"]),
            "Iris PNG does not equal its original author export")
    require(signature == edited_signature, "Authored iris edit changed its consumer or protected eye images")
    changed_images = {
        i for i, (a, b) in enumerate(zip(author_base.images(), author_edit.images(), strict=True)) if a != b
    }
    require(changed_images == {
        iris["consumer"]["imageIndex"], iris["licenseMeta"]["thumbnailImage"],
    }, "Unexpected original author export image differences")
    with Image.open(io.BytesIO(source_png)) as original, Image.open(io.BytesIO(green_png)) as green:
        require(original.size == green.size == (1024, 512), "Iris PNG dimensions differ")
        original_pixels = np.asarray(original.convert("RGBA"))
        green_pixels = np.asarray(green.convert("RGBA"))
    require(np.array_equal(original_pixels[..., 3], green_pixels[..., 3]), "Iris alpha differs")
    changed_pixels = int(np.count_nonzero(np.any(original_pixels != green_pixels, axis=2)))
    require(changed_pixels > 0, "Authored iris edit has no changed pixels")
    license_boundary = license_terms(author_edit)
    require(license_boundary == license_terms(author_base), "Source license metadata changed")

    brow_ref = reference(
        BROW + "/manifest.json", "62905d3336598164f31c6d3ed29443e9cf713562f47d08205e95145f26d8ae88"
    )
    brow = json.loads(pinned(brow_ref))
    brow_original, = [r for r in brow["extractedImages"] if r["material"] == "source-brow"]
    brow_color, = [r for r in brow["extractedImages"] if r["material"] != "source-brow"]
    require(main_image(author_base, "_FaceBrow_") == pinned(brow_original), "Author brow source differs")
    require(main_image(model(brow["nativeVrm"]), "_FaceBrow_") == pinned(brow_color), "Author brow edit differs")

    rows = []
    for package, (body_sha, provenance_sha) in TARGETS.items():
        body_type = "native-" + package + "-v1"
        public_body = reference("prototype/public/assets/" + body_type + "/body.vrm", body_sha)
        folder = "assets-source/native-parameter-game-packages-v1/" + package
        provenance_ref = reference(folder + "/provenance.json", provenance_sha)
        provenance = json.loads(pinned(provenance_ref))
        require(provenance["id"] == package and provenance["bodySha256"] == body_sha, "Wrong body provenance")
        require(pinned(reference(folder + "/body.vrm", body_sha)) == pinned(public_body), "Public body differs")
        raw_body = model(provenance["native"])
        game_body = model(public_body)
        for gltf in (raw_body, game_body):
            new_source, new_signature = iris_signature(gltf, expected_material)
            require(new_source == source_png and new_signature == signature,
                    "Exact iris mapping rejected: " + body_type)
            require(license_terms(gltf) == license_boundary, "Target license metadata differs")

        brow_sha = sha(main_image(game_body, "_FaceBrow_"))
        require(brow_sha != brow_original["sha256"], "Brow compatibility needs new review")
        require(not any("lip" in m["name"].lower() for m in game_body.doc["materials"]),
                "New lip material needs review")
        editable = reference(
            (Path(provenance["native"]["path"]).parent / provenance["editable"]["path"]).as_posix(),
            provenance["editable"]["sha256"],
        )
        pinned(editable)
        rows.append({
            "bodyType": body_type,
            "body": public_body,
            "nativeExport": provenance["native"],
            "editable": editable,
            "provenance": provenance_ref,
            "variants": {
                "eyeColor": {"status": "offline-compatible-candidate", "color": "green"},
                "eyebrowColor": {
                    "status": "rejected-baseline-mismatch",
                    "targetPngSha256": brow_sha,
                    "authorBaselinePngSha256": brow_original["sha256"],
                },
                "skinColor": {
                    "status": "requires-native-authored-variant",
                    "facePngSha256": sha(main_image(game_body, "_Face_00_SKIN")),
                    "uncoveredBodyPngSha256": sha(main_image(game_body, "_Body_00_SKIN")),
                    "coveredBodyPngSha256": sha(main_image(raw_body, "_Body_00_SKIN")),
                },
                "lipColor": {
                    "status": "requires-native-lip-overlay",
                    "mouthPngSha256": sha(main_image(game_body, "_FaceMouth_")),
                    "dedicatedLipMaterial": False,
                },
            },
        })
    return {
        "schema": "native-palette-compatibility-v1",
        "scope": "Internal author offline candidate; preserve source license metadata",
        "runtimeAdmission": False,
        "visualAcceptance": False,
        "licenseMeta": license_boundary,
        "irisSource": {
            "manifest": iris_ref, "originalVrm": iris["originalVrm"], "nativeVrm": iris["nativeVrm"],
            "color": iris["targetHex"], "originalPng": iris["sourceImage"], "coloredPng": iris["image"],
            "dimensions": [1024, 512], "changedPixels": changed_pixels, "alphaExact": True,
            "consumer": signature,
        },
        "rejectedBrowSource": {"manifest": brow_ref, "originalPng": brow_original, "coloredPng": brow_color},
        "bodies": rows,
    }


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def palette_files(report):
    original = json.loads(pinned(reference(
        MALE_PALETTE + "/manifest.json", "909f1c8699d2dd0338854090dc4f534273e33a78d1c00c3f470eb2ff826d8b7a",
    )))
    source = report["irisSource"]
    require(original["schema"] == "native-facial-palette-v1" and
            original["sourceManifestSha256"] == source["manifest"]["sha256"],
            "Published male palette source differs")
    iris = original["iris"]
    require(iris["colors"]["green"]["color"] == source["color"], "Shared palette color differs")
    for shared, key in ((iris["source"], "originalPng"), (iris["colors"]["green"], "coloredPng")):
        require(shared["sha256"] == source[key]["sha256"] and
                pinned(reference("prototype/public" + shared["url"], shared["sha256"])) == pinned(source[key]),
                "Shared public iris PNG differs")

    return {
        row["bodyType"] + "/manifest.json": json_bytes({
            **original,
            "id": row["bodyType"] + "-iris-palette-v1",
            "avatarSha256": row["body"]["sha256"],
        })
        for row in report["bodies"]
    }


def check_stage(destination, files):
    actual = {p.relative_to(destination).as_posix(): p for p in destination.rglob("*") if p.is_file()}
    require(actual.keys() == files.keys(), "Staged palette file set differs")
    for name, data in files.items():
        require(actual[name].read_bytes() == data, "Staged palette identity differs: " + name)


def stage(destination, files):
    if destination.exists():
        check_stage(destination, files)
        return

    with tempfile.TemporaryDirectory(dir=destination.parent, prefix=".iris-palette-") as work:
        pending = Path(work) / "candidate"
        for name, data in files.items():
            path = pending / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        check_stage(pending, files)
        try:
            pending.rename(destination)
        except FileExistsError:
            check_stage(destination, files)
    check_stage(destination, files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write a new report without overwriting an existing file")
    staging = parser.add_mutually_exclusive_group()
    staging.add_argument("--stage", action="store_true", help="Stage the two source-only manifests")
    staging.add_argument("--check", action="store_true", help="Verify the exact staged manifest bytes")
    args = parser.parse_args()
    report = audit()
    files = palette_files(report)
    report["candidateManifests"] = [
        reference((STAGING / name).relative_to(ROOT).as_posix(), sha(data)) for name, data in files.items()
    ]
    if args.stage:
        stage(STAGING, files)
    elif args.check:
        check_stage(STAGING, files)
    if args.output is None:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        with args.output.open("xb") as handle:
            handle.write(json_bytes(report))


if __name__ == "__main__":
    main()
