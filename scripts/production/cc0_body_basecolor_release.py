"""Build the pinned CC0 VRM0 Body color release with its original opaque alpha."""

import argparse
import io
import json
from pathlib import Path
import platform
from tempfile import TemporaryDirectory
import zlib

import numpy
from PIL import Image, __version__ as pillow_version

from asset_budget import COMPONENTS, DIMENSIONS, budget_config, check
from garment_basecolor_release import half_png
from native_import import ROOT, confined, digest, embedded_glb
from native_mesh_budget import encode
from native_release_textures import splice, verify_unchanged, view_payload, view_range
from native_top_group_replay import checked_batch
from native_uniform_normal import entries
from production_paths import project_output
from stripped_outfit_body import pointers, validate_profile


SPEC = Path(__file__).with_name("cc0-body-basecolor-release-v1.json")
OUTPUT = ROOT / "output/m2-cc0-body-release-r01"
SCHEMA = "cc0-body-basecolor-release-v1"
OPERATION = "vrm0-opaque-body-color-half-v1"
EXCLUSIVE_IMAGE = "exclusive-image-preserve-accessor-alignment-v1"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pinned(pin):
    path = confined(ROOT, pin["path"])
    data = path.read_bytes()
    require(digest(data) == pin["sha256"], "Pinned source digest differs: " + pin["path"])
    return path, data


def texture_selection(doc, pin):
    validate_profile(doc)
    require(all(set(value) <= {"VRM", "KHR_materials_unlit"} for path, value in entries(doc) if path[-1] == "extensions"),
            "Unknown extension in Body color input")
    mi, ti, ii, vi = (pin[k] for k in ("material", "texture", "image", "bufferView"))
    for index, table in ((mi, "materials"), (ti, "textures"), (ii, "images"), (vi, "bufferViews")):
        require(type(index) is int and 0 <= index < len(doc[table]), "Invalid Body color " + table + " index")
    vrm = doc["extensions"]["VRM"]
    material = doc["materials"][mi]
    legacy = vrm["materialProperties"][mi]
    base_color = material["pbrMetallicRoughness"]["baseColorTexture"]
    shade = legacy["textureProperties"]
    require(material["name"] == legacy["name"] == pin["materialName"]
            and base_color == {"index": ti, "texCoord": 0}
            and shade["_MainTex"] == shade["_ShadeTexture"] == ti, "Body color bindings differ")
    expected = {(id(base_color), "index"), (id(shade), "_MainTex"), (id(shade), "_ShadeTexture")}
    actual = {(id(owner), key) for owner, key in pointers(doc, "textures") if owner[key] == ti}
    require(actual == expected, "Unexpected Body color texture consumer")
    require([i for i, tex in enumerate(doc["textures"]) if tex["source"] == ii] == [ti],
            "Unexpected Body color image alias")
    image = doc["images"][ii]
    require(image.get("bufferView") == vi and image.get("mimeType") == "image/png"
            and {p for p, value in entries(doc) if p[-1] == "bufferView" and value == vi}
            == {("images", ii, "bufferView")}, "Body color needs an exclusive embedded PNG bufferView")
    gltf_alpha = material.get("alphaCutoff", .5)
    require(material.get("alphaMode") == "MASK" and gltf_alpha == legacy["floatProperties"]["_Cutoff"] == .5
            and legacy["floatProperties"]["_BlendMode"] == 1 and legacy["keywordMap"]["_ALPHATEST_ON"] is True
            and material["pbrMetallicRoughness"]["baseColorFactor"][3] == legacy["vectorProperties"]["_Color"][3] == 1,
            "Body alpha test contract differs")
    primitives = [{"node": ni, "mesh": node["mesh"], "skin": node["skin"], "primitive": pi}
                  for ni, node in enumerate(doc["nodes"]) if "mesh" in node
                  for pi, part in enumerate(doc["meshes"][node["mesh"]]["primitives"]) if part["material"] == mi]
    require(primitives and primitives == pin["bodyPrimitives"], "Body color primitive consumers differ")
    return {"imageView": vi, "consumers": [
        ["materials", mi, "pbrMetallicRoughness", "baseColorTexture", "index"],
        ["extensions", "VRM", "materialProperties", mi, "textureProperties", "_MainTex"],
        ["extensions", "VRM", "materialProperties", mi, "textureProperties", "_ShadeTexture"],
    ], "sampler": doc["samplers"][doc["textures"][ti]["sampler"]],
         "bodyPrimitives": primitives, "alphaMode": "MASK", "alphaCutoff": gltf_alpha}


def png_facts(raw):
    with Image.open(io.BytesIO(raw)) as image:
        require(image.format == "PNG" and image.mode in ("RGB", "RGBA") and raw[24] == 8
                and not image.is_animated and not image.info, "Unexpected Body color PNG encoding")
        alpha = image.convert("RGBA").getchannel("A")
        low, high = alpha.getextrema()
        return {"sha256": digest(raw), "bytes": len(raw), "size": list(image.size),
                "mode": image.mode, "decodedAlpha": [low, high],
                "nonOpaqueTexels": sum(alpha.histogram()[:-1])}


def validate_image_storage(doc, binary, view):
    views = doc["bufferViews"]
    buffer_length = doc["buffers"][0]["byteLength"]
    require(type(buffer_length) is int and 0 <= len(binary) - buffer_length <= 3, "Invalid GLB buffer length")
    for row in views:
        start, size = row.get("byteOffset", 0), row["byteLength"]
        require(type(row["buffer"]) is int and row["buffer"] == 0 and type(start) is int and type(size) is int
                and 0 <= start < start + size <= buffer_length, "BufferView outside embedded buffer")
    selected = views[view]
    require("target" not in selected and "byteStride" not in selected, "Expected byte-only image bufferView")
    start, end = view_range(selected)
    require(not any(other != view and max(start, a) < min(end, b)
                    for other, (a, b) in enumerate(map(view_range, views))), "Body color image bufferView overlaps another view")


def exclusive_image_splice(doc, binary, view, replacement):
    """Use the strict splice in a scratch coordinate space, without changing published layout."""
    adjustment = -doc["bufferViews"][view].get("byteOffset", 0) % 4
    if not adjustment:
        return splice(doc, binary, {view: replacement})
    shifted = {**doc, "buffers": [{"byteLength": doc["buffers"][0]["byteLength"] + adjustment}],
               "bufferViews": [{**row, "byteOffset": row.get("byteOffset", 0) + adjustment}
                               for row in doc["bufferViews"]]}
    new_doc, new_binary = splice(shifted, bytes(adjustment) + binary, {view: replacement})
    for previous, row in zip(doc["bufferViews"], new_doc["bufferViews"], strict=True):
        row["byteOffset"] -= adjustment
        if not row["byteOffset"] and "byteOffset" not in previous:
            del row["byteOffset"]
    new_doc["buffers"][0]["byteLength"] -= adjustment
    return new_doc, new_binary[adjustment:]


def verify_alignment(before, after, image_view):
    initial_views, final_views = before["bufferViews"], after["bufferViews"]
    first, end = view_range(initial_views[image_view])
    output_first, _ = view_range(final_views[image_view])
    shift = after["buffers"][0]["byteLength"] - before["buffers"][0]["byteLength"]
    require(first == output_first and shift % 4 == 0, "Invalid published image position or alignment shift")
    for initial, final in zip(initial_views, final_views, strict=True):
        start, _ = view_range(initial)
        require(final.get("byteOffset", 0) == start + (shift if start >= end else 0),
                "Unexpected relocated bufferView")
    vertex_accessors = {accessor for mesh in before["meshes"] for part in mesh["primitives"]
                        for attributes in (part["attributes"], *part.get("targets", [])) for accessor in attributes.values()}
    checks = []
    for index, acc in enumerate(before["accessors"]):
        selected = acc["bufferView"]
        require(type(selected) is int and 0 <= selected < len(initial_views), "Invalid accessor bufferView")
        require(acc["type"] in {"SCALAR", "VEC2", "VEC3", "VEC4", "MAT4"} and acc["componentType"] in COMPONENTS
                and (acc["type"] != "MAT4" or acc["componentType"] == 5126), "Unreviewed accessor layout")
        component = COMPONENTS[acc["componentType"]][1]
        element = DIMENSIONS[acc["type"]] * component
        original_view = initial_views[selected]
        offset, count = acc.get("byteOffset", 0), acc["count"]
        stride = original_view.get("byteStride", element)
        require(all(type(x) is int for x in (count, offset, stride)) and count > 0 and offset >= 0
                and stride >= element and offset + (count - 1) * stride + element
                <= original_view["byteLength"], "Accessor outside embedded bufferView")
        require(index not in vertex_accessors or offset % 4 == stride % 4 == 0, "Unaligned vertex attribute layout")
        old_abs = original_view.get("byteOffset", 0) + offset
        new_abs = final_views[selected].get("byteOffset", 0) + offset
        require(old_abs % 4 == new_abs % 4 and offset % component == old_abs % component == new_abs % component == 0,
                "Accessor component or 4-byte offset remainder differs")
        checks.append(old_abs >= end)
    return {"sourceImageByteOffset": first, "outputImageByteOffset": output_first,
            "sourceImageOffsetMod4": first % 4, "suffixByteShift": shift,
            "accessorAbsoluteOffsetsChecked": len(checks), "shiftedAccessorsChecked": sum(checks)}


def derive(raw, selection, *, image_alignment="strict"):
    doc, binary = embedded_glb(raw)
    uses = texture_selection(doc, selection)
    view = uses["imageView"]
    require(image_alignment in ("strict", EXCLUSIVE_IMAGE), "Unknown image alignment policy")
    if image_alignment == EXCLUSIVE_IMAGE:
        validate_image_storage(doc, binary, view)
    source = view_payload(binary, doc["bufferViews"][view])
    before = png_facts(source)
    require(before["sha256"] == selection["sourcePngSha256"], "Pinned Body color PNG differs")
    replacement = half_png(source)
    after = png_facts(replacement)
    require(before["size"] == [2048, 2048] and after["size"] == [1024, 1024]
            and before["decodedAlpha"] == after["decodedAlpha"] == [255, 255]
            and before["nonOpaqueTexels"] == after["nonOpaqueTexels"] == 0, "Body alpha readback differs")
    replacements = {view: replacement}
    structure = (exclusive_image_splice(doc, binary, view, replacement) if image_alignment == EXCLUSIVE_IMAGE
                 else splice(doc, binary, replacements))
    candidate = encode(*structure)
    final_doc, final_bin = embedded_glb(candidate)
    proof = verify_unchanged(doc, binary, final_doc, final_bin, replacements)
    if image_alignment == EXCLUSIVE_IMAGE:
        validate_image_storage(final_doc, final_bin, view)
        proof.update(alignment=verify_alignment(doc, final_doc, view),
                     otherImagePayloads=len(doc["images"]) - 1)
    require(len(candidate) < len(raw), "Body color derivation did not reduce file bytes")
    return candidate, {"selection": uses, "originalPng": before, "derivedPng": after,
                       "preserved": {**proof, "accessors": len(doc["accessors"]), "nodes": len(doc["nodes"]),
                                     "skins": len(doc["skins"]),
                                     "blendShapeGroups": len(doc["extensions"]["VRM"]["blendShapeMaster"]["blendShapeGroups"])}}


def license_source(spec, raw):
    sources = spec["preservedSources"]
    _, published = pinned(sources["publisherVrm"])
    pinned(sources["editableBlenderReconstruction"])
    _, receipt = pinned(sources["publisherProvenance"])
    origin = json.loads(receipt)
    require(origin["vrmSHA256"] == digest(published), "Author provenance does not name the preserved source")
    original = embedded_glb(published)[0]["extensions"]["VRM"]["meta"]
    stripped = embedded_glb(raw)[0]["extensions"]["VRM"]["meta"]
    # The previous stripping operation repointed the metadata thumbnail index.
    match = lambda row: {k: v for k, v in row.items() if k != "texture"}
    require(match(original) == match(stripped) and stripped["licenseName"] == "CC0"
            and stripped["allowedUserName"] == "Everyone" and stripped["commercialUssageName"] == "Allow",
            "CC0 publisher and stripped VRM terms differ")
    return {"provenance": origin, "vrm0Metadata": stripped, "preservedSources": sources,
            "editableScope": "Project Blender import reconstruction preserved separately. Publisher archive supplied only a VRM."}


def model_cost(path, asset_class, config):
    result = check(path, asset_class, config)
    return {key: result[key] for key in ("sha256", "metrics", "violations", "status")}


def signed_comparison(pin, source_cost, candidate_cost, config):
    _, raw = pinned(pin["records"])
    records = [r for r in json.loads(raw) if r["identity"]["id"] == pin["id"]]
    require(len(records) == 1 and records[0]["integrity"]["recordSha256"] == pin["recordSha256"],
            "Pinned uniform recording differs")
    recipe = records[0]["appearanceRecipe"]
    require(recipe["base"]["sha256"] == source_cost["sha256"] and recipe["equipment"]["index"] == pin["outfitIndex"]
            and set(recipe["appearance"].values()) == {"original"}, "Unexpected signed uniform control")
    equipment = []
    for value in recipe["equipment"]["resources"].values():
        require(value["url"].startswith("/assets/") and value["compatibleAvatarSha256"] == source_cost["sha256"],
                "Signed equipment identity differs")
        path = confined(ROOT / "prototype/public", value["url"].removeprefix("/"))
        cost = model_cost(path, "garment", config)
        require(cost["sha256"] == value["sha256"] and cost["metrics"]["fileBytes"] == value["bytes"],
                "Signed equipment bytes differ")
        equipment.append({"id": value["id"], "url": value["url"], **cost})
    require({r["slot"] for r in recipe["equipment"]["resources"].values()} == {"top", "bottom", "shoes"}
            and len(equipment) == 3, "Expected the signed three-garment outfit")

    def selected_cost(body):
        assets = [*equipment, body]
        return {k: sum(a["metrics"][k] for a in assets) for k in ("fileBytes", "rgba8MipBytes", "textures")}

    return {"id": pin["id"], "recordSha256": pin["recordSha256"], "outfitIndex": pin["outfitIndex"],
            "garments": equipment, "originalSelectedModels": selected_cost(source_cost),
            "derivedBodyPlusOriginalGarmentsArithmetic": selected_cost(candidate_cost),
            "scope": "Measured exact signed control body/garment assets. Derived totals substitute the one measured body in arithmetic."}


def build(spec_path, output, *, check_only=False):
    out = checked_batch(project_output(output, __file__))
    if check_only:
        require(out.is_dir(), "Expected a generated release directory")
    raw_spec = spec_path.read_bytes()
    spec = json.loads(raw_spec)
    require(spec["schema"] == SCHEMA, "Incorrect Body texture release spec")
    source, source_raw = pinned(spec["source"])
    license_data = license_source(spec, source_raw)
    candidate, detail = derive(source_raw, spec["selection"])
    require(digest(candidate) == spec["target"]["sha256"]
            and detail["derivedPng"]["sha256"] == spec["target"]["pngSha256"], "Pinned derived identity differs")
    budget_path, budget_raw = pinned(spec["assetBudget"])
    budget = budget_config(budget_path, spec["assetBudget"]["version"])
    before = model_cost(source, "body", budget)
    out.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=out.parent, prefix=".cc0-body-budget-") as temp:
        path = Path(temp) / "candidate.vrm"
        path.write_bytes(candidate)
        after = model_cost(path, "body", budget)
    require(all(before["metrics"][key] == after["metrics"][key]
                for key in before["metrics"].keys() - {"fileBytes", "rgba8MipBytes"}),
            "Body derivation changed an unrelated budget metric")
    report = {"schema": SCHEMA, "specSha256": digest(raw_spec), "source": spec["source"],
              "target": {**spec["target"], "path": "body.vrm", "bytes": len(candidate)},
              "assetBudget": {**spec["assetBudget"], "configBytes": len(budget_raw)},
              "bodyBudgetChecks": {"original": before, "derived": after},
              "signedUniformControl": signed_comparison(spec["signedControl"], before, after, budget),
              "license": license_data, **detail,
              "toolVersions": {"python": platform.python_version(), "Pillow": pillow_version,
                               "numpy": numpy.__version__, "zlib": zlib.ZLIB_RUNTIME_VERSION},
              "admission": {"fitInherited": False, "runtimeAdmission": False, "externalRelease": False,
                            "gpuAndVisualChecks": "unmeasured"}}
    publish(out, candidate, report, check_only)
    return report


def publish(out, candidate, report, check_only):
    report_bytes = (json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n").encode()
    files = {"body.vrm": candidate, "report.json": report_bytes}
    for name, raw in files.items():
        path = confined(out, name)
        require(path == out / name, "Redirected release output")
        if check_only or path.exists():
            require(path.is_file() and path.read_bytes() == raw, "Existing release output differs: " + name)
    if not check_only:
        out.mkdir(exist_ok=True)
        for name, raw in files.items():
            path = confined(out, name)
            require(path == out / name, "Redirected release output")
            try:
                with path.open("xb") as stream:
                    stream.write(raw)
            except FileExistsError:
                require(path.is_file() and path.read_bytes() == raw, "Existing release output differs: " + name)


def build_operation(spec_path, output, *, check_only=False):
    out = checked_batch(project_output(output, __file__))
    raw_spec = spec_path.read_bytes()
    spec = json.loads(raw_spec)
    require(spec["schema"] == OPERATION, "Incorrect technical Body color recipe")
    _, raw = pinned(spec["source"])
    pinned(spec["sourceRights"])
    alignment = spec.get("imageAlignment", "strict")
    body, detail = derive(raw, spec["selection"], image_alignment=alignment)
    target = {"sha256": digest(body), "pngSha256": detail["derivedPng"]["sha256"]}
    require("target" not in spec or spec["target"] == target, "Pinned technical output identity differs")
    report = {"schema": OPERATION, "specSha256": digest(raw_spec),
              "source": {**spec["source"], "bytes": len(raw)}, "sourceRights": spec["sourceRights"],
              "target": {**target, "path": "body.vrm", "bytes": len(body)}, "imageAlignment": alignment,
              **detail, "fitInherited": False, "runtimeAdmission": False}
    if not check_only:
        out.parent.mkdir(parents=True, exist_ok=True)
    publish(out, body, report, check_only)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--operation", action="store_true", help="Derive a private candidate from a technical recipe")
    parser.add_argument("--check", action="store_true", help="Rebuild and check installed evidence bytes without replacing them")
    args = parser.parse_args()
    try:
        if args.operation:
            require(args.spec is not None and args.output is not None, "Technical operation needs --spec and --output")
            report = build_operation(args.spec, args.output, check_only=args.check)
        else:
            report = build(args.spec or SPEC, args.output or OUTPUT, check_only=args.check)
    except (ValueError, OSError, KeyError) as error:
        parser.error(str(error))
    result = {"target": report["target"]}
    if not args.operation:
        result["bodyBudgetStatus"] = report["bodyBudgetChecks"]["derived"]["status"]
    print(json.dumps(result))
