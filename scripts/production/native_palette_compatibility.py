"""Validate and stage a batch of exact FaceContour bodies for the native iris palette."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "assets-source/native-vroid-iris-study-v1"
BROW = "assets-source/native-vroid-hair-color-study-v1"
STAGING = ROOT / "assets-source/native-facecontour-iris-palette-v1"
MALE_PALETTE = "prototype/public/assets/native-iris-palette-v1"
BATCH = Path(__file__).with_name("native-facecontour-iris-batch-v1.json")
PUBLIC = ROOT / "prototype/public/assets/native-facecontour-iris-palette-v1"
REGISTRY = "registry.json"
REGISTRY_SCHEMA = "native-facecontour-iris-registry-v1"
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


def audit(batch=BATCH):
    targets = json.loads(batch.read_bytes())
    require(targets.get("schema") == "native-facecontour-iris-batch-v1" and
            isinstance(targets.get("targets"), list) and targets["targets"], "Invalid iris batch")
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
    seen_types, seen_bodies = set(), set()
    for target in targets["targets"]:
        body_type, body_sha = target["bodyType"], target["bodySha256"]
        require(re.fullmatch(r"native-[a-z0-9-]+", body_type) and re.fullmatch(r"[a-f0-9]{64}", body_sha),
                "Invalid iris target identity")
        require(body_type not in seen_types and body_sha not in seen_bodies, "Duplicate iris target")
        seen_types.add(body_type)
        seen_bodies.add(body_sha)
        public_body = reference("prototype/public/assets/" + body_type + "/body.vrm", body_sha)
        provenance_ref = target["provenance"]
        folder = Path(provenance_ref["path"]).parent.as_posix()
        provenance = json.loads(pinned(provenance_ref))
        require(provenance["schema"] == "native-parameter-body-provenance-v1" and
                "native-" + provenance["id"] + "-v1" == body_type and provenance["bodySha256"] == body_sha,
                "Wrong body provenance")
        require(pinned(reference(folder + "/body.vrm", body_sha)) == pinned(public_body), "Public body differs")
        raw_body = model(provenance["native"])
        game_body = model(public_body)
        for gltf in (raw_body, game_body):
            new_source, new_signature = iris_signature(gltf, expected_material)
            require(new_source == source_png and new_signature == signature,
                    "Exact iris mapping rejected: " + body_type)
            require(license_terms(gltf) == license_boundary, "Target license metadata differs")

        brow_sha = sha(main_image(game_body, "_FaceBrow_"))
        has_lip = any("lip" in m["name"].lower() for m in game_body.doc["materials"])
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
                    "status": ("rejected-baseline-mismatch" if brow_sha != brow_original["sha256"]
                               else "requires-independent-brow-review"),
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
                    "dedicatedLipMaterial": has_lip,
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

    files = {
        row["bodyType"] + "/manifest.json": json_bytes({
            **original,
            "id": row["bodyType"] + "-iris-palette-v1",
            "avatarSha256": row["body"]["sha256"],
        })
        for row in report["bodies"]
    }
    entries = [{
        "bodyType": row["bodyType"], "bodySha256": row["body"]["sha256"],
        "manifestSha256": sha(files[row["bodyType"] + "/manifest.json"]),
    } for row in sorted(report["bodies"], key=lambda item: item["bodyType"])]
    files[REGISTRY] = json_bytes({"schema": REGISTRY_SCHEMA, "entries": entries})
    return files


def check_stage(destination, files):
    actual = {p.relative_to(destination).as_posix(): p for p in destination.rglob("*") if p.is_file()}
    require(actual.keys() == files.keys(), "Staged palette file set differs")
    for name, data in files.items():
        require(actual[name].read_bytes() == data, "Staged palette identity differs: " + name)


def stage(destination, files):
    # Stage immutable manifests first. A reader sees new registrations only
    # after their files exist. The OS releases the writer lock on process exit.
    lock_key = sha(str(destination.resolve()).encode())
    lock_path = Path(tempfile.gettempdir()) / ("gamemake-iris-" + lock_key + ".lock")
    with lock_path.open("a+b") as lock:
        if os.name == "nt":
            import msvcrt
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        existing = {p.relative_to(destination).as_posix(): p for p in destination.rglob("*") if p.is_file()}
        require(existing.keys() <= files.keys(), "Batch omits existing palette assets")
        for name, path in existing.items():
            if name != REGISTRY:
                require(path.read_bytes() == files[name], "Staged palette identity differs: " + name)
        if REGISTRY in existing:
            prior = json.loads(existing[REGISTRY].read_bytes())
            wanted = json.loads(files[REGISTRY])["entries"]
            require(prior.get("schema") == REGISTRY_SCHEMA and isinstance(prior.get("entries"), list) and
                    all(row in wanted and row["bodyType"] + "/manifest.json" in existing
                        for row in prior["entries"]), "Batch changes a published palette registration")
        with tempfile.TemporaryDirectory(dir=destination.parent, prefix=".iris-palette-") as work:
            for name in [key for key in files if key != REGISTRY] + [REGISTRY]:
                path = destination / name
                if name in existing and path.read_bytes() == files[name]:
                    continue
                pending = Path(work) / "next"
                pending.write_bytes(files[name])
                path.parent.mkdir(parents=True, exist_ok=True)
                os.replace(pending, path)
        check_stage(destination, files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, default=BATCH, help="Exact body and package provenance pins")
    parser.add_argument("--output", type=Path, help="Write a new report without overwriting an existing file")
    staging = parser.add_mutually_exclusive_group()
    staging.add_argument("--stage", action="store_true", help="Stage the manifests and generated registry")
    staging.add_argument("--check", action="store_true", help="Verify all staged bytes")
    staging.add_argument("--publish", action="store_true", help="Verify staging and publish the runtime subset")
    staging.add_argument("--check-published", action="store_true", help="Verify staging and public runtime bytes")
    args = parser.parse_args()
    report = audit(args.batch)
    files = palette_files(report)
    report["candidateManifests"] = [
        reference((STAGING / name).relative_to(ROOT).as_posix(), sha(data)) for name, data in files.items()
        if name != REGISTRY
    ]
    report["registry"] = reference((STAGING / REGISTRY).relative_to(ROOT).as_posix(), sha(files[REGISTRY]))
    if args.stage:
        stage(STAGING, files)
    elif args.check or args.publish or args.check_published:
        check_stage(STAGING, files)
        if args.publish:
            stage(PUBLIC, files)
        elif args.check_published:
            check_stage(PUBLIC, files)
    if args.output is None:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        with args.output.open("xb") as handle:
            handle.write(json_bytes(report))


if __name__ == "__main__":
    main()
