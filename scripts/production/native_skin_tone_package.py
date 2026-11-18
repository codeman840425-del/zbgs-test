"""Extract an authored skin tone after exact export, coverage and per-avatar material checks."""

from __future__ import annotations

import argparse
import copy
import io
import json
import os
from pathlib import Path
import re
import tempfile

import numpy as np
from PIL import Image

from native_palette_compatibility import (
    ROOT, SAMPLER, check_stage, json_bytes, license_terms, material_texture_uses,
    model, native, pinned, reference, require, sha,
)

PACKAGE = "native-skin-tone-package-v1"
STAGING = ROOT / "assets-source" / PACKAGE
PUBLIC = ROOT / "prototype/public/assets" / PACKAGE
SPEC = STAGING / "recipe.json"
TARGETS = Path(__file__).with_name("native-facecontour-iris-batch-v1.json")
FACE = "N00_000_00_Face_00_SKIN (Instance)"
BODY = "N00_000_00_Body_00_SKIN (Instance)"
EYELINE = "N00_000_00_FaceEyeline_00_FACE (Instance)"
SURFACES = (FACE, EYELINE, BODY)
SLOTS = ("pbrMetallicRoughness.baseColorTexture", "extensions.VRMC_materials_mtoon.shadeMultiplyTexture")


def texel_data(encoded):
    with Image.open(io.BytesIO(encoded)) as im:
        require(im.format == "PNG", "Expected embedded native PNG")
        return np.asarray(im.convert("RGBA"))


def skin_surface(g, name):
    doc = g.doc
    supported = {"KHR_texture_transform", "KHR_materials_unlit", "VRMC_vrm", "VRMC_springBone", "VRMC_materials_mtoon"}
    require(set(doc["extensionsUsed"]) <= supported and
            all(set(m.get("extensions", {})) <= {"KHR_materials_unlit", "VRMC_materials_mtoon"}
                for m in doc["materials"]) and
            all(set(t) <= {"name", "source", "sampler"} for t in doc["textures"]),
            "Unsupported native export extension or texture source")
    mi, = [i for i, mat in enumerate(doc["materials"]) if mat["name"] == name]
    mat = doc["materials"][mi]
    base = mat["pbrMetallicRoughness"]["baseColorTexture"]
    shade = mat["extensions"]["VRMC_materials_mtoon"]["shadeMultiplyTexture"]
    for info in (base, shade):
        require(info["index"] == base["index"] and info.get("texCoord", 0) == 0 and
                info.get("extensions", {}) == {"KHR_texture_transform": {"offset": [0, 0], "scale": [1, 1]}},
                "Skin texture routing differs: " + name)
    tex = doc["textures"][base["index"]]
    ii = tex["source"]
    require(set(tex) <= {"sampler", "source", "name"} and doc["samplers"][tex["sampler"]] == SAMPLER,
            "Unsupported skin sampler or texture extension")
    require(material_texture_uses(g, ii) == [[mi, slot] for slot in SLOTS], "Unexpected skin texture consumer")
    require(doc["extensions"]["VRMC_vrm"]["meta"].get("thumbnailImage") != ii, "Skin image used as thumbnail")
    for group in doc["extensions"]["VRMC_vrm"]["expressions"].values():
        for expr in group.values():
            require(all(bind["material"] != mi for key in ("materialColorBinds", "textureTransformBinds")
                        for bind in expr.get(key, [])), "Expression changes skin material")
    prim, = [p for node in doc["nodes"] if "mesh" in node for p in doc["meshes"][node["mesh"]]["primitives"]
             if p["material"] == mi]
    indices = g.acc(prim["indices"]).ravel()
    uv = g.acc(prim["attributes"]["TEXCOORD_0"])[indices]
    expected_alpha = ("BLEND", None) if name == EYELINE else ("MASK", .5)
    require((mat["alphaMode"], mat.get("alphaCutoff")) == expected_alpha, "Unexpected skin alpha mode")
    # Removing a top can renumber later MToon matcap/outline textures. Resolve every material texture
    # to its sampler and actual image, with only the explicitly recolored image replaced by its role.
    def normalized(obj):
        if not isinstance(obj, dict):
            return obj
        obj = dict(obj)
        for key, value in obj.items():
            if key.lower().endswith("texture") and isinstance(value, dict) and "index" in value:
                texture = doc["textures"][value["index"]]
                image = texture["source"]
                obj[key] = {**value, "index": {"sampler": doc["samplers"][texture["sampler"]],
                            "image": "skin" if image == ii else sha(native.image(g, image))}}
            else:
                obj[key] = normalized(value)
        return obj
    sig = {"material": sha(json.dumps(normalized(mat), sort_keys=True).encode()), "alphaMode": mat["alphaMode"],
           "alphaCutoff": mat.get("alphaCutoff"), "indexedUvSha256": sha(uv.tobytes()),
           "indexSha256": sha(indices.tobytes()), "indexCount": len(indices),
           "baseColorFactor": mat["pbrMetallicRoughness"]["baseColorFactor"],
           "shadeColorFactor": mat["extensions"]["VRMC_materials_mtoon"]["shadeColorFactor"],
           "sampler": SAMPLER}
    return ii, native.image(g, ii), sig


def compare_surfaces(old, edited, label):
    before, after = texel_data(old), texel_data(edited)
    require(before.shape == after.shape, label + " dimensions changed")
    require(np.array_equal(before[..., 3], after[..., 3]), label + " alpha changed")
    changed = np.any(before[..., :3] != after[..., :3], axis=2)
    visible = before[..., 3] >= 128
    changed_visible = int(np.count_nonzero(changed & visible))
    require(changed_visible > 0, label + " has no visible skin edit")
    return {"sourceSha256": sha(old), "authoredSha256": sha(edited),
            "width": before.shape[1], "height": before.shape[0],
            "changedPixels": int(changed.sum()), "changedVisiblePixels": changed_visible,
            "alphaSha256": sha(after[..., 3].tobytes())}


def donor_geometry(reference, donor, covered):
    # A no-top copy of the round-waist template predates the two FaceContour shapes. Its
    # joint table, indices and weights are authoritative for the no-top export. Geometry
    # and morph values come from the exact authored contour, indexed per surviving primitive.
    checked_accessors = set()
    indexed_fields = 0
    original = covered.primitives()
    actual = donor.primitives()
    require(set(original) - set(actual) == {m for m in original if "_Tops_" in m}
            and set(actual) < set(original), "Unexpected material removal with Tops")
    for name, prim in actual.items():
        other = original[name]
        indices = donor.acc(prim["indices"]).ravel()
        other_indices = covered.acc(other["indices"]).ravel()
        for left, right in zip([prim["attributes"], *prim.get("targets", [])],
                               [other["attributes"], *other.get("targets", [])], strict=True):
            for key in ("POSITION", "NORMAL"):
                if key not in left:
                    continue
                require(np.array_equal(donor.acc(left[key])[indices], covered.acc(right[key])[other_indices]),
                        "No-top contour geometry/morph differs: " + name + " " + key)
                checked_accessors.add(left[key])
                indexed_fields += 1
    for i in range(len(donor.doc["accessors"])):
        if i not in checked_accessors:
            require(reference.acc(i).tobytes() == donor.acc(i).tobytes(),
                    "No-top topology, UV, skin or inverse bind differs: " + str(i))
    return {"indexedPositionNormalAndMorphFieldsExactToCovered": indexed_fields,
            "contourAccessorsCheckedByIndexedValues": len(checked_accessors),
            "otherAccessorsExactToOriginalNoTop": len(donor.doc["accessors"]) - len(checked_accessors)}


def compare_exports(before, after, covered=None):
    # Byte offsets and image lengths naturally move. Every decoded accessor and all semantic
    # glTF data (including protected materials, expressions, springs and skeletons) are compared.
    def semantic_doc(g):
        result = copy.deepcopy(g.doc)
        for key in ("bufferViews", "buffers"):
            result.pop(key)
        meta = result["extensions"]["VRMC_vrm"]["meta"]
        for key in ("name", "version"):
            meta.pop(key, None)
        if covered is not None:
            # Bounds reflect the contour. Validate them against the respective actual data.
            for i, accessor in enumerate(result["accessors"]):
                for bound, reduce in (("min", np.min), ("max", np.max)):
                    if bound in accessor:
                        recorded = np.asarray(accessor.pop(bound), dtype=g.acc(i).dtype)
                        require(np.array_equal(recorded, reduce(g.acc(i), axis=0)), "Invalid no-top accessor bounds")
        return result
    left, right = semantic_doc(before), semantic_doc(after)
    require(left == right, "Native export changed semantic data: " +
            ", ".join(k for k in left.keys() | right.keys() if left.get(k) != right.get(k)))
    accessors = len(left["accessors"])
    if covered is None:
        require(all(before.acc(i).tobytes() == after.acc(i).tobytes() for i in range(accessors)),
                "Native export changed geometry, weights, morphs or binds")
        geometry = {"accessorsExactToSource": accessors}
    else:
        geometry = donor_geometry(before, after, covered)
    rows = {}
    changed = set()
    for name in SURFACES:
        idx, old, source_fit = skin_surface(before, name)
        edited_idx, new, result_fit = skin_surface(after, name)
        require(idx == edited_idx and source_fit == result_fit, "Native skin material or UV changed")
        rows[name] = compare_surfaces(old, new, name)
        changed.add(idx)
    old_hashes, new_hashes = before.images(), after.images()
    thumb = before.doc["extensions"]["VRMC_vrm"]["meta"]["thumbnailImage"]
    require(not material_texture_uses(before, thumb), "Thumbnail is also used by a material")
    observed = {i for i, (a, b) in enumerate(zip(old_hashes, new_hashes, strict=True)) if a != b}
    require(changed <= observed <= changed | {thumb}, "Unexpected modified native image indices: " + str(observed))
    return {"geometry": geometry, "changedImages": sorted(observed), "surfaces": rows,
            "protectedImages": {str(i): h for i, h in enumerate(old_hashes) if i not in changed | {thumb}},
            "protectedMaterials": [m["name"] for m in left["materials"] if m["name"] not in SURFACES]}


def compare_coverage(full_bytes, covered_bytes):
    full, covered = texel_data(full_bytes), texel_data(covered_bytes)
    require(full.shape == covered.shape and np.array_equal(full[..., :3], covered[..., :3]),
            "Covered/native full RGB bytes differ")
    require(np.all(full[..., 3] == 255), "Tops-removed skin is still masked")
    changed_alpha = int(np.count_nonzero(full[..., 3] != covered[..., 3]))
    require(changed_alpha > 0, "Covered export lacks the authored top mask")
    return changed_alpha


def stage_new(path, files):
    if path.is_dir():
        check_stage(path, files)
        return
    with tempfile.TemporaryDirectory(dir=path.parent, prefix=".skin-tone-") as tmp:
        pending = Path(tmp) / "package"
        for name, raw in files.items():
            target = pending / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        try:
            os.rename(pending, path)
        except FileExistsError:
            check_stage(path, files)
    check_stage(path, files)

def read_export_pair(pair, covered=None):
    # An exact original export for each clothing state makes a skin-only change measurable.
    for key in ("sourceEditable", "authoredEditable"):
        pinned(pair[key])
    require(pair["sourceEditable"]["sha256"] != pair["authoredEditable"]["sha256"], "Unchanged editable source")
    before, after = (model(pair[key]) for key in ("sourceVrm", "authoredVrm"))
    return before, after, compare_exports(before, after, covered)


def build(recipe):
    require(recipe["schema"] == "native-linked-skin-recipe-v1" and recipe["toneId"] == "native-warm-v1" and
            re.fullmatch("#[a-fA-F0-9]{6}", recipe["mainColor"]), "Invalid native skin recipe")
    receipt = json.loads(pinned(recipe["authoringReceipt"]))
    require(receipt["schema"] == "native-facecontour-skin-tone-authoring-v1"
            and receipt["targetHex"] == recipe["mainColor"]
            and recipe["covered"]["sourceEditable"] == reference(receipt["source"], receipt["sourceSha256"])
            and receipt["removedTop"]["type"] == "TransferableGroupType.N00.Level1.Tops",
            "Recipe differs from editor receipt")
    author_folder = Path(recipe["authoringReceipt"]["path"]).parent
    for state, product in (("covered", "covered"), ("full", "donor")):
        for key, ext in (("authoredVrm", "vrm"), ("authoredEditable", "vroid")):
            out = receipt["products"][product][ext]
            require(recipe[state][key] == reference((author_folder / out["path"]).as_posix(), out["sha256"]),
                    "Author export identity mismatch")
    calibration = json.loads(pinned(recipe["coldReadback"]))
    groups = {"FaceSkin", "BodySkin", "NoseLighting", "Eyelid"}
    require(set(calibration["coldReadback"]) == groups and calibration["allOtherReturnedParamsUnchanged"]
            and {"Iris", "EyeWhite", "EyeHighlight", "Mouth", "MouthLine"} <= set(calibration["protectedGroups"]),
            "Incomplete protected native parameter readback")
    for name in groups:
        cold, old = calibration["coldReadback"][name], calibration["baseline"][name]
        rgb = cold["MainColor"]["value"]
        color = "#" + "".join(f"{round(rgb[k] * 255):02x}" for k in "rgb")
        require(color == recipe["mainColor"] and rgb["a"] == 1 and old["MainColor"] != cold["MainColor"]
                and all(cold[k] == old[k] for k in ("ShadowColor", "HighlightColor")),
                "Native cold readback differs from recipe")
    covered, warm_covered, covered_report = read_export_pair(recipe["covered"])
    full, warm_full, full_report = read_export_pair(recipe["full"], warm_covered)
    covered_skin = {n: skin_surface(covered, n) for n in SURFACES}
    full_skin = {n: skin_surface(full, n) for n in SURFACES}
    warm_face = skin_surface(warm_full, FACE)[1]
    warm_body = skin_surface(warm_full, BODY)[1]
    warm_mask = skin_surface(warm_covered, BODY)[1]
    for name in (FACE, EYELINE):
        require(full_skin[name][1] == covered_skin[name][1]
                and skin_surface(warm_full, name)[1] == skin_surface(warm_covered, name)[1],
                "Covered and full head textures differ: " + name)
    require(all(full_skin[n][2] == covered_skin[n][2] for n in SURFACES),
            "Full and covered skin material or UV differs")
    license_meta = license_terms(covered)
    require(all(license_terms(g) == license_meta for g in (full, warm_full, warm_covered)),
            "VRM author permissions differ")
    alpha_count = compare_coverage(full_skin[BODY][1], covered_skin[BODY][1])
    require(compare_coverage(warm_body, warm_mask) == alpha_count, "Authored body coverage differs")
    target_batch = json.loads(TARGETS.read_bytes())
    admissions = json.loads((ROOT / "prototype/src/native-body-texture-coverage-admissions.json").read_bytes())
    entries, reports, files = [], [], {}
    for target in target_batch["targets"]:
        body_type, avatar = target["bodyType"], target["bodySha256"]
        require(re.fullmatch(r"native-[a-z0-9-]+", body_type) and re.fullmatch(r"[a-f0-9]{64}", avatar)
                and all(e["bodyType"] != body_type and e["bodySha256"] != avatar for e in entries),
                "Invalid or duplicate body identity")
        folder = "prototype/public/assets/" + body_type + "/"
        avatar_ref = reference(folder + "body.vrm", avatar)
        body = model(avatar_ref)
        provenance = json.loads(pinned(target["provenance"]))
        require(provenance["bodySha256"] == avatar and "native-" + provenance["id"] + "-v1" == body_type,
                "Wrong authoring provenance for target")
        original = model(provenance["native"])
        require(license_terms(original) == license_terms(body) == license_meta, "Target VRM permissions differ")
        coverage, = [a for a in admissions if a["avatarSha256"] == avatar]
        fit_ref = reference(folder + "manifest.json", coverage["manifestSha256"])
        fit = json.loads(pinned(fit_ref))
        require(fit["avatarSha256"] == avatar and fit["materialName"] == BODY and
                sha(full_skin[BODY][1]) == coverage["basePngSha256"] == fit["basePngSha256"] and
                sha(covered_skin[BODY][1]) == coverage["maskedPngSha256"] == fit["covered"]["sha256"] and
                pinned(reference(folder + fit["covered"]["url"], fit["covered"]["sha256"])) == covered_skin[BODY][1],
                "Covered/full native source differs from target coverage")
        for name in SURFACES:
            require(skin_surface(body, name)[1:] == full_skin[name][1:] and
                    skin_surface(original, name)[1:] == covered_skin[name][1:],
                    "Exact material/UV/skin image compatibility rejected: " + body_type + " " + name)
        # All protected runtime materials retain their own inputs. The package contains just the skin PNGs.
        equipment = []
        for e in fit["equipment"]:
            require(e["compatibleAvatarSha256"] == avatar, "Coverage equipment uses a different avatar")
            equipment_ref = reference(folder + e["id"] + ".glb", e["sha256"])
            pinned(equipment_ref)
            equipment.append(equipment_ref)

        def asset(filename, encoded):
            path = body_type + "/" + filename
            files[path] = encoded
            return {"url": "/assets/" + PACKAGE + "/" + path, "sha256": sha(encoded)}

        def part(name, filename, encoded):
            readback = full_report["surfaces"][name]
            return {"materialName": name, "sourceSha256": readback["sourceSha256"],
                    "authored": asset(filename, encoded), "width": readback["width"], "height": readback["height"],
                    "alphaMode": full_skin[name][2]["alphaMode"], "alphaCutoff": full_skin[name][2]["alphaCutoff"]}

        manifest = {"schema": PACKAGE, "id": body_type + "-skin-tone-v1", "version": 1, "avatarSha256": avatar,
                    "coverageManifestSha256": fit_ref["sha256"], "toneId": recipe["toneId"],
                    "face": part(FACE, "face.png", warm_face),
                    "eyeline": part(EYELINE, "eyeline.png", skin_surface(warm_full, EYELINE)[1]),
                    "body": {**part(BODY, "body.png", warm_body), "coveredSourceSha256": sha(covered_skin[BODY][1]),
                             "coveredAuthored": asset("body-covered.png", warm_mask)}}
        manifest_bytes = json_bytes(manifest)
        files[body_type + "/manifest.json"] = manifest_bytes
        entries.append({"bodyType": body_type, "bodySha256": avatar, "manifestSha256": sha(manifest_bytes),
                        "coverageManifestSha256": fit_ref["sha256"], "colors": {recipe["toneId"]: recipe["mainColor"]}})
        reports.append({"bodyType": body_type, "gameBody": avatar_ref, "nativeBody": provenance["native"],
                        "sourceProvenance": target["provenance"], "coverage": fit_ref, "equipment": equipment,
                        "surfaceFits": {name: full_skin[name][2] for name in SURFACES}})
    files["registry.json"] = json_bytes({"schema": "native-skin-tone-registry-v1",
                                         "entries": sorted(entries, key=lambda row: row["bodyType"])})
    return files, {"schema": "native-linked-skin-readback-v1", "coveredExport": covered_report,
                   "fullExport": full_report, "source": recipe, "coveredAlphaPixels": alpha_count,
                   "license": license_meta, "targets": reports, "runtimeAdmission": False, "visualAcceptance": False}

def publish(files):
    # The runtime may already have a zero-entry registry. Install both immutable
    # avatar folders before atomically replacing it. Interrupted runs can retry.
    empty_registry = {"schema": "native-skin-tone-registry-v1", "entries": []}
    if not PUBLIC.exists():
        stage_new(PUBLIC, files)
        return
    existing = {p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob("*") if p.is_file()}
    require(existing <= files.keys(), "Unexpected public skin package files")
    for name in existing - {"registry.json"}:
        require((PUBLIC / name).read_bytes() == files[name], "Different public skin package asset: " + name)
    registry = PUBLIC / "registry.json"
    if registry.exists():
        prior = registry.read_bytes()
        require(prior == files["registry.json"] or json.loads(prior) == empty_registry,
                "Different published skin registry")
    for folder in sorted({n.partition("/")[0] for n in files if "/" in n}):
        stage_new(PUBLIC / folder, {n.partition("/")[2]: data for n, data in files.items()
                                    if n.startswith(folder + "/")})
    if not registry.exists() or registry.read_bytes() != files["registry.json"]:
        with tempfile.TemporaryDirectory(dir=PUBLIC.parent) as tmp:
            staged = Path(tmp) / "registry.json"
            staged.write_bytes(files["registry.json"])
            os.replace(staged, registry)
    check_stage(PUBLIC, files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", type=Path, default=SPEC)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--stage", action="store_true")
    mode.add_argument("--publish", action="store_true")
    mode.add_argument("--check-published", action="store_true")
    args = parser.parse_args()
    recipe = json.loads(args.recipe.read_bytes())
    files, report = build(recipe)
    staged = STAGING / "runtime"
    if args.stage:
        stage_new(staged, files)
        stage_new(STAGING / "readback", {"report.json": json_bytes(report)})
    if args.publish or args.check_published:
        check_stage(staged, files)
        check_stage(STAGING / "readback", {"report.json": json_bytes(report)})
        if args.publish:
            publish(files)
        check_stage(PUBLIC, files)
    print(json.dumps({"registrySha256": sha(files["registry.json"]), "coveredAlphaPixels": report["coveredAlphaPixels"],
                      "targets": [t["bodyType"] for t in report["targets"]]}))


if __name__ == "__main__":
    main()
