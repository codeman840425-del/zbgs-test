"""Verify the two fitted FaceContour records in a fixed-build room capture.

The result binds runtime material observations and media to a source build and
record. Screenshots, texture sizes and historical budgets do not grant admission.
"""
import argparse
import hashlib
import io
import json
import re
import runpy
from pathlib import Path

import av
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
STATIC = runpy.run_path(str(ROOT / "scripts/qa-native-surface-texture-admission.py"))
EVIDENCE = ROOT / "evidence"
BUDGET = EVIDENCE / "m2-native-batch-runtime-seam-v1/budget-classification-v1.json"
TRACE = EVIDENCE / "m2-native-budget-runtime-4196-v4/report.json"
RECORD_BYTES = {
    "contour-roundness-a": "1cf5a81e71160e697b2caaa6d74bc3946c1d51840a919df493c156e885c50f69",
    "contour-cheek-b": "d62b88d23100496d80bc7e0b47ad1eefb45ce7b33451baca7602d9149d5890db",
}
# Source names distinguish the face skin from the Body coverage consumer.
TOKENS = {"faceSkin": "_Face_", "mouth": "_FaceMouth_", "iris": "_EyeIris_",
          "eyeHighlight": "_EyeHighlight_", "eyeWhite": "_EyeWhite_", "brow": "_FaceBrow_",
          "eyelash": "_FaceEyelash_", "eyeline": "_FaceEyeline_", "body": "_Body_",
          "hairBack": "_HairBack_", "hair": "_Hair_"}
GEAR = {"top", "shorts", "shoes"}
CHANNELS = ("map", "shadeMultiplyTexture")


def require(test, message):
    if not test:
        raise ValueError(message)


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_contract(raw, cutoff):
    with Image.open(io.BytesIO(raw)) as image:
        alpha = image.convert("RGBA").getchannel("A")
        hist = alpha.histogram()
        below = sum(count for byte, count in enumerate(hist) if byte / 255 < cutoff)
        return {"width": image.width, "height": image.height, "pixelCount": sum(hist),
                "alphaSha256": hashlib.sha256(alpha.tobytes()).hexdigest(), "cutoff": cutoff,
                "belowCutoff": below, "atOrAboveCutoff": sum(hist) - below,
                "fullyTransparent": hist[0], "fullyOpaque": hist[255]}


def source_material(gltf, material):
    info = {"name": material["name"], "alphaMode": material.get("alphaMode", "OPAQUE"),
            "cutoff": material.get("alphaCutoff", 0.5), "doubleSided": material.get("doubleSided", False),
            "opacity": material["pbrMetallicRoughness"].get("baseColorFactor", [1, 1, 1, 1])[3],
            "blendDepthWrite": material["extensions"]["VRMC_materials_mtoon"].get("transparentWithZWrite", False)}
    for key, tex in zip(CHANNELS, (material["pbrMetallicRoughness"]["baseColorTexture"],
                                  material["extensions"]["VRMC_materials_mtoon"]["shadeMultiplyTexture"])):
        index = gltf.doc["textures"][tex["index"]]["source"]
        with Image.open(io.BytesIO(STATIC["texture_bytes"](gltf, index))) as image:
            info[key] = image.size
    return info


def source_contract(package, body_type, dist, case):
    rel = f"evidence/m2-native-hair-record-v1/{package}.json"
    require(case["sourceRecord"].replace("\\", "/") == rel, "source record path mismatch")
    path = ROOT / rel
    require(sha(path) == RECORD_BYTES[package], "fitted record bytes changed")
    record = read(path)
    body_sha = record["appearanceRecipe"]["base"]["sha256"]
    record_sha = record["integrity"]["recordSha256"]
    require(case["bodySha256"] == body_sha and case["recordSha256"] == case["restoredSha256"] == record_sha,
            "capture, record or restore identity mismatch")
    static = STATIC["audit_package"](package, body_type)
    require(static["bodySha256"] == body_sha, "static body identity mismatch")
    public = dist / "assets" / body_type
    require(sha(public / "body.vrm") == body_sha, "fixed build body bytes mismatch")
    gltf = STATIC["GLB"](public / "body.vrm")
    contract = {}
    for role, token in TOKENS.items():
        materials = [m for m in gltf.doc["materials"] if token in m["name"]]
        require(len(materials) == 1, f"ambiguous or absent {role} source material")
        contract[role] = source_material(gltf, materials[0])
    ids = {}
    for role, resource in record["appearanceRecipe"]["equipment"]["resources"].items():
        require(role in GEAR and Path(resource["url"]).name == resource["url"], "unexpected equipment")
        garment = public / resource["url"]
        require(sha(garment) == resource["sha256"], "fixed build garment bytes mismatch")
        model = STATIC["GLB"](garment)
        require(len(model.doc["materials"]) == 1, "unexpected garment material count")
        contract[role] = source_material(model, model.doc["materials"][0])
        ids[role] = resource["id"]
    require(set(ids) == GEAR, "missing source garments")
    manifest_path = public / "manifest.json"
    manifest = read(manifest_path)
    expected_manifest = ROOT / "assets-source/native-parameter-game-packages-v1" / package / "manifest.json"
    require(sha(manifest_path) == sha(expected_manifest) and manifest["avatarSha256"] == body_sha,
            "coverage manifest differs from source")
    base = STATIC["texture_bytes"](gltf, STATIC["EXPECTED"]["image"])
    covered = (public / manifest["covered"]["url"]).read_bytes()
    for raw, expected in [(base, manifest["basePngSha256"]), (covered, manifest["covered"]["sha256"])]:
        require(hashlib.sha256(raw).hexdigest() == expected, "coverage PNG identity mismatch")
    alpha = {mode: alpha_contract(raw, manifest["alphaTest"]) for mode, raw in [("base", base), ("dressed", covered)]}
    return record, contract, ids, sha(manifest_path), manifest, alpha


def check_state(state, mode, body_type, body_sha, build, materials, ids, manifest_sha, manifest, alpha):
    dressed = mode == "dressed"
    require(state["schema"] == "native-surface-runtime-materials-v1" and state["bodyMode"] == mode and
            (state["bodyType"], state["bodySha256"], state["build"]) == (body_type, body_sha, build),
            f"{mode} state identity mismatch")
    coverage = state["coverage"]
    tex = coverage["texture"]
    require(coverage["descriptor"]["sha256"] == manifest_sha and tex["avatarSha256"] == body_sha and
            tex["maskedPngSha256"] == manifest["covered"]["sha256"] and tex["covered"] is dressed and
            tex["pendingUpdates"] == 0 and tex["disposed"] is False and tex["cleanupErrors"] == [],
            f"{mode} coverage ownership mismatch")
    # The shared factory's base inspection retains the same shoes.
    expected_ids = ids if dressed else {"shoes": ids["shoes"]}
    require(sorted(tex["activeIds"]) == sorted(expected_ids.values()) and
            sorted((i["role"], i["id"]) for i in coverage["visibleEquipment"]) == sorted(expected_ids.items()),
            f"{mode} active equipment mismatch")
    by_texture = {t["uuid"]: t for t in state["textures"]}
    require(len(by_texture) == len(state["textures"]), "duplicate texture UUID")
    estimate, renderer = state["textureEstimate"], state["renderer"]
    require(not renderer["contextLost"] and renderer["calls"] > 0 and renderer["triangles"] > 0 and
            estimate["textureObjectCount"] == len(by_texture) and estimate["uniqueAssignedWebGLTextureCount"] > 0,
            f"{mode} renderer and active texture sample")
    surfaces = {}
    shader_differences = []
    for row in state["materials"]:
        role = row["role"]
        if role not in materials or row["outline"]:
            continue
        source = materials[role]
        require(row["name"] == source["name"] and row["visible"] is True and row["type"] == "MToonMaterial" and
                row["draws"] and all(d["drawCount"] > 0 for d in row["draws"]), f"{role} active MToon material")
        # Hair may cover several primitives that share one source material.
        for channel in CHANNELS:
            t = by_texture[row["maps"][channel]]
            require((t["width"], t["height"]) == source[channel] and t["colorSpace"] == "srgb",
                    f"{role} {channel} dimensions/color space mismatch")
        surfaces.setdefault(role, []).append(row)
        flags = {"transparent": source["alphaMode"] == "BLEND",
                 "alphaTest": source["cutoff"] if source["alphaMode"] == "MASK" else 0,
                 "opacity": source["opacity"], "depthWrite": source["alphaMode"] != "BLEND" or source["blendDepthWrite"],
                 "depthTest": True, "colorWrite": True,
                 "side": 2 if source["doubleSided"] else 0}
        for key, value in flags.items():
            if row[key] != value:
                shader_differences.append({"role": role, "field": key, "source": value, "observed": row[key]})
    require(set(surfaces) == set(TOKENS) | set(expected_ids), f"{mode} visible material roles differ")
    require(len(surfaces["body"]) == 1, "ambiguous Body material")
    body = surfaces["body"][0]
    observed = coverage.get("alphaPixels")
    verified_alpha = isinstance(observed, dict) and "error" not in observed
    if verified_alpha:
        require(observed["textureUuid"] == body["maps"]["map"] and all(observed[k] == v for k, v in alpha.items()),
                f"{mode} alpha channel differs from source")
    return {"actor": state["actorUuid"], "material": body["uuid"], "maps": [body["maps"][k] for k in CHANNELS],
            "alphaVerified": verified_alpha, "alphaReadbackError": (observed or {}).get("error"),
            "shaderDifferences": shader_differences, "roles": sorted(surfaces),
            "textureEstimate": {k: estimate[k] for k in ("textureObjectCount", "decodedImageRgba8Bytes",
                                "allocationRgba8WithMipmapsBytes", "uniqueAssignedWebGLTextureCount")},
            "renderer": renderer}


def check_media(folder, case):
    paths = {**{k: case["views"][k] for k in ("neutral", "mouth", "back", "room")}, "video": case["video"]}
    diagnostic = ("half-light-diagnostic", "restored-light")
    if any(k in case["views"] for k in diagnostic):
        paths.update({k: case["views"][k] for k in diagnostic})
    media = {}
    for kind, name in paths.items():
        path = (folder / name).resolve()
        require(not Path(name).is_absolute() and path.is_relative_to(folder), "media outside capture directory")
        if kind == "video":
            with av.open(str(path)) as container:
                require("webm" in container.format.name, "expected WebM")
                frames = container.decode(video=0)
                first = next(frames, None)
                require(first is not None and next(frames, None) is not None, "recording has fewer than two frames")
                size = [first.width, first.height]
        else:
            with Image.open(path) as image:
                image.load()
                require(image.format == "PNG" and any(a < b for a, b in image.convert("RGB").getextrema()),
                        f"{kind} missing PNG image content")
                size = list(image.size)
        media[kind] = {"path": name, "sha256": sha(path), "size": size}
    require(len({media[k]["sha256"] for k in ("neutral", "mouth", "back", "room")}) == 4, "duplicate view capture")
    lighting = {}
    if "restored-light" in media:
        with Image.open(folder / paths["neutral"]) as image:
            original = image.convert("RGB")
        for key in diagnostic:
            with Image.open(folder / paths[key]) as image:
                require(image.size == original.size, "lighting capture resolution mismatch")
                difference = ImageChops.difference(original, image.convert("RGB"))
            r, g, b = difference.split()
            histogram = ImageChops.lighter(r, ImageChops.lighter(g, b)).histogram()
            lighting[key] = {"changedPixels": sum(histogram[1:]), "totalPixels": sum(histogram),
                             "meanMaxChannelDelta": sum(i * n for i, n in enumerate(histogram)) / sum(histogram)}
    return media, lighting


def verify(capture_path, build_path):
    capture, build = read(capture_path), read(build_path)
    ident = {k: build[k] for k in ("shortId", "sourceDigest")}
    require(re.fullmatch("[a-f0-9]{64}", ident["sourceDigest"]) and ident["shortId"] == ident["sourceDigest"][:12]
            and all(capture["build"][k] == v for k, v in ident.items()), "build digest mismatch")
    require(capture["schema"] == "native-surface-room-capture-v1" and capture["errors"] == [] and
            not capture.get("failure"), "invalid capture/errors")
    cases = {r["bodyType"]: r for r in capture["cases"]}
    require(len(cases) == len(capture["cases"]) == 2 and set(cases) == set(STATIC["PACKAGES"].values()),
            "expected one capture per FaceContour body")
    rows = []
    for package, body_type in STATIC["PACKAGES"].items():
        case = cases[body_type]
        record, contracts, ids, pin, manifest, alpha = source_contract(package, body_type, build_path.parent, case)
        states = {}
        for name, mode in [("dressed", "dressed"), ("base", "base"), ("redressed", "dressed")]:
            states[name] = check_state(case["states"][name], mode, body_type, case["bodySha256"], ident["shortId"],
                                       contracts, ids, pin, manifest, alpha[mode])
        dressed, base, redressed = states.values()
        require(dressed["actor"] and all(s["actor"] == dressed["actor"] and s["material"] == dressed["material"]
                                          for s in states.values()), "Body actor/material changed during switch")
        require(dressed["maps"] == redressed["maps"] and all(a != b for a, b in zip(dressed["maps"], base["maps"])),
                "covered Body texture references were not switched and restored")
        budget = next(r for r in read(BUDGET)["records"] if r["bodyType"] == body_type)
        previous = next(r for r in read(TRACE)["input"]["records"] if r["bodySha256"] == case["bodySha256"])
        require(budget["bodySha256"] == case["bodySha256"], "historical budget body mismatch")
        media, lighting = check_media(capture_path.resolve().parent, case)
        rows.append({"bodyType": body_type, "bodySha256": case["bodySha256"], "sourceRecord": case["sourceRecord"],
                     "recordId": record["identity"]["id"], "revision": record["revision"], "recordSha256": case["recordSha256"],
                     "recordFileSha256": RECORD_BYTES[package], "restoredSha256": case["restoredSha256"],
                     "sourceMaskAlpha": alpha, "states": states, "media": media, "lightingVsNeutral": lighting,
                     "historicalResourceGates": budget["resourceGates"], "historicalBudgetRecordSha256": previous["recordSha256"],
                     "historicalBudgetRecordMatches": previous["recordSha256"] == case["recordSha256"]})
    return {"schema": "native-surface-room-readback-v1", "status": "partial", "build": ident,
            "captureSha256": sha(capture_path), "buildFileSha256": sha(build_path), "cases": rows,
            "budgetSources": [str(p.relative_to(ROOT).as_posix()) for p in (BUDGET, TRACE)],
            "limits": ["Source, MToon material state, mask switches, restored record identity and media are checked.",
                       "Final shader/pixel appearance and visual acceptance require review of these captures.",
                       "Historical resource failures remain. No new GPU bytes or ordinary-PC budget was measured."],
            "acceptedForRuntime": []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("capture", "build-file", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    try:
        result = verify(args.capture, args.build_file)
    except (AssertionError, ValueError, OSError, KeyError, StopIteration, TypeError) as exc:
        result = {"schema": "native-surface-room-readback-v1", "status": "failed",
                  "failure": f"{type(exc).__name__}: {exc}", "acceptedForRuntime": []}
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(result["status"], args.output)
    return int(result["status"] == "failed")


if __name__ == "__main__":
    raise SystemExit(main())
