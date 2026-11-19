"""Read-only CPU comparison of the signed uniform bob look and the 1K female body."""
import json
from functools import partial
from types import SimpleNamespace

import numpy as np

from female_uniform_texture_fit import (ASSET_URL, PARENT, PARENT_SHA, PROFILE_ID, TARGET_SHA,
                                       VIEWS, body_bytes, prove_body)
from flow import GLB, Validator, require
from garment_source_mapping import json_bytes
from native_import import digest
from record_budget import legacy_texture_groups
from stripped_outfit_equipment import BodyReadback


HISTORIC = ("delivery/history/character-production-handoff-54e8a24c.json",
            "a88821b9106aa616c2b7d625b37fec0c4c5647538f3018db3f367e2e6cb619b3")
PAIR = ("evidence/m2-motion-response-compat-v1/pair-inventory.json",
        "fc3bd555c35836c96a5259d021b1e4b87c95904784e148ad58d707833106cd80")
RECORDS = ("evidence/m2-uniform-lite-operator-v1/records.json",
           "d38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989")
FIT = ("assets-source/m2-hairstyle-v1/fit.json",
       "73df2578f6fd7730b2476403525be481b71fe8127856193d19a444022df02f34")
PROVENANCE = ("assets-source/m2-hairstyle-v1/provenance.json",
              "db596f9db65108b71f713d1a13a3650b20d3a51b0d4706fb4fcd0caf2d240de2")
LOOK = {"hairStyle": "female-bob-v1", "hairColor": "blonde", "skinTone": "warm",
        "eyeColor": "brown", "lipColor": "coral"}


def head_fit(body, bob, fit):
    name = fit["hideOriginal"]["materialNames"][0]
    matches = [(mi, pi, p) for mi, m in enumerate(body.doc["meshes"])
               for pi, p in enumerate(m["primitives"])
               if "_HAIR" in body.doc["materials"][p["material"]]["name"]]
    (mi, pi, hair), = matches
    require((mi, pi, name) == (fit["hideOriginal"]["sourceMesh"], fit["hideOriginal"]["primitive"],
                               body.doc["materials"][hair["material"]]["name"]), "Hair hide group mismatch")
    mount = fit["attachment"]
    head, = [b["node"] for b in body.vrm["humanoid"]["humanBones"] if b["bone"] == "head"]
    require(body.doc["nodes"][head]["name"] == mount["rawBone"], "Raw head anchor mismatch")
    node, = [n for n in body.doc["nodes"] if n.get("mesh") == mi]
    skin = body.doc["skins"][node["skin"]]
    triangles = np.asarray(body.glb.accessor(hair["indices"])).ravel()
    used, remapped = np.unique(triangles, return_inverse=True)
    attrs = {k: np.asarray(body.glb.accessor(i))[used] for k, i in hair["attributes"].items()}
    require(np.allclose(attrs["WEIGHTS_0"].sum(1), 1) and
            np.all(np.asarray(skin["joints"])[attrs["JOINTS_0"]][attrs["WEIGHTS_0"] > 0] == head),
            "Original hair no longer rigid to head")
    mesh, = bob.doc["meshes"]
    primitive, = mesh["primitives"]
    require(not bob.doc.get("skins") and not bob.doc.get("animations") and not primitive.get("targets")
            and bob.doc["extras"] == {"coordinateSpace": "current-raw-head-bind-local", "avatarSha256": PARENT_SHA}
            and bob.doc["materials"][primitive["material"]]["name"] == name, "Wrong rigid bob input")
    require(np.array_equal(bob.accessor(primitive["attributes"]["TEXCOORD_0"]), attrs["TEXCOORD_0"])
            and np.array_equal(np.asarray(bob.accessor(primitive["indices"])).ravel(), remapped),
            "Bob triangle/UV correspondence differs")
    bind = body.glb.bind_by_name()[mount["rawBone"]]
    source = np.column_stack((attrs["POSITION"], np.ones(len(used)))) @ np.array(bind).reshape(4, 4)
    delta = np.linalg.norm(np.asarray(bob.accessor(primitive["attributes"]["POSITION"])) - source[:, :3], axis=1)
    face, = [m for m in body.doc["meshes"] if m["name"] == "Face.baked"]
    return {"attachment": mount, "headRestNode": body.doc["nodes"][head], "inverseBindColumnMajor": bind,
            "originalHair": {"mesh": mi, "primitive": pi, "material": name, "vertices": len(used),
                             "triangles": len(triangles) // 3, "headWeightedVertices": len(used)},
            "facePrimitives": len(face["primitives"]), "faceTargetNames": len(face["extras"]["targetNames"]),
            "bobDisplacementFromOriginal": {"verticesOverOneMicrometre": int(np.sum(delta > 1e-6)),
                                            "maxMetres": float(delta.max())}}


def palette(body, appearance, parts, reader):
    model = SimpleNamespace(doc=body.doc, view_bytes=partial(body_bytes, body))
    groups = legacy_texture_groups(model, appearance)
    result = {}
    for role, group in groups.items():
        name = group["materialName"]
        p, = [p for mesh in body.doc["meshes"] for p in mesh["primitives"]
              if body.doc["materials"][p["material"]]["name"] == name]
        uv = body.stream(p["attributes"]["TEXCOORD_0"])["payloadSha256"]
        row = {key: group[key] for key in ("materialName", "sourceTextureIndex", "sourceImageSha256",
                                           "width", "height", "selection")}
        row.update(uvSha256=uv, indexSha256=body.stream(p["indices"])["payloadSha256"],
                   materialStateSha256=digest(json_bytes(body.material(p["material"]))))
        if role in parts:
            part = parts[role]
            require((name, uv, group["sourceImageSha256"], [group["width"], group["height"]]) ==
                    (part["materialName"], part["uvSha256"], part["sourceMapSha256"], part["mapSize"]),
                    "Palette UV/image mapping mismatch: " + role)
            keys = ["mask"] + (["neutralMap"] if role == "iris" else [])
            for key in keys:
                reader.pin(reader.url(part[key + "Url"]), part[key + "Sha256"])
                row[key + "Sha256"] = part[key + "Sha256"]
        result[role] = row
    return result


def audit():
    reader = Validator()
    historic = json.loads(reader.pin(*HISTORIC))
    records = historic["inputs"]["signedRecords"]
    old, = [r for r in json.loads(reader.pin(records["path"], records["sha256"])) if r["identity"]["gender"] == "female"]
    new, = [r for r in json.loads(reader.pin(*RECORDS)) if r["identity"]["gender"] == "female"]
    pair = json.loads(reader.pin(*PAIR))
    received, = [r for r in pair["records"] if r["id"] == new["identity"]["id"]]
    previous, current = (r["appearanceRecipe"] for r in (old, new))
    require(previous["base"] == {"bodyType": "female", "sha256": PARENT_SHA} and previous["appearance"] == LOOK
            and current["base"] == {"bodyType": PROFILE_ID, "sha256": TARGET_SHA}
            and current["appearance"] == dict.fromkeys(LOOK, "original")
            and received["avatarSha256"] == TARGET_SHA and received["recordSha256"] == new["integrity"]["recordSha256"],
            "Signed female input or selected appearance differs")
    parent = BodyReadback(reader.pin(PARENT, PARENT_SHA))
    target = BodyReadback(reader.pin(reader.url(ASSET_URL + "/body.vrm"), TARGET_SHA))
    proof = prove_body(parent, target)
    fit = json.loads(reader.pin(*FIT))
    provenance = json.loads(reader.pin(*PROVENANCE))
    manifest = json.loads(reader.pin(reader.url("/assets/m2-hairstyle-v1/manifest.json"),
                                     previous["hairFit"]["manifestSha256"]))
    require(manifest["id"] == LOOK["hairStyle"] and manifest["compatibleBodies"] == [PARENT_SHA]
            and manifest["sha256"] == fit["sha256"] == previous["hairAssetSha256"]
            and fit["compatibleAvatarSha256"] == PARENT_SHA, "Historical bob identity differs")
    bob = GLB(reader.pin(reader.url(manifest["url"]), manifest["sha256"]))
    old_fit, new_fit = (head_fit(model, bob, fit) for model in (parent, target))
    require(old_fit == new_fit, "Raw head fit differs")
    palette_manifest = json.loads(reader.pin(reader.url("/assets/appearance-color-v3/runtime-manifest.json"),
                                             previous["paletteVersion"].split(":")[1]))
    rows = palette_manifest["variants"]
    parts, = [r["parts"] for r in rows if r["avatarSha256"] == PARENT_SHA]
    require(all(r["avatarSha256"] != TARGET_SHA for r in rows), "Historical manifest already includes target")
    old_palette, new_palette = (palette(model, LOOK, parts, reader) for model in (parent, target))
    require(old_palette == new_palette, "Head palette inputs differ")
    return {"schema": "uniform-lite-female-head-intake-v1", "scope": "offline exact-asset comparison",
            "previousRuntime": historic["runtime"], "targetRuntime": pair["runtime"],
            "records": [{"id": r["identity"]["id"], "recordSha256": r["integrity"]["recordSha256"],
                         "base": r["appearanceRecipe"]["base"], "appearance": r["appearanceRecipe"]["appearance"]}
                        for r in (old, new)],
            "retainedBody": proof, "rigidBob": new_fit, "paletteInputs": new_palette,
            "changedImages": [{"role": role, "image": image, "bufferView": view, "parentSha256": VIEWS[view][0],
                               "targetSha256": VIEWS[view][1], "sourceSide": 2048, "targetSide": VIEWS[view][2]}
                              for role, image, view in [("rendered body skin", 0, 0), ("metadata thumbnail", 23, 161)]],
            "fitDecisions": {
                "bob": "Reuse this asset and identity local transform in a new target-body explicit fit.",
                "hairAndBrow": "Blonde uses identical hair and linked brow inputs.",
                "irisAndLips": "Brown iris and coral lip use identical source maps, UVs, masks and iris neutral map.",
                "warmSkin": "Face input and material factors match. The body uses a resized opaque base/shade map. "
                            "The same multiplier can be evaluated on the new body, but the full skin pixels differ."},
            "remaining": ["Register target-specific fit and palette versions with the exact body SHA.",
                          "Validate signed production, package closure, budget, in-game selection, restoration and "
                          "negative rollback on the personalized target, including warm face/body contact under motion."],
            "runtimeAdmission": False, "visualAcceptance": False, "ordinaryPCPerformance": "unmeasured",
            "sourceLicense": provenance["vrmMeta"]["licenseName"], "provenanceStatus": provenance["provenanceStatus"],
            "inputs": reader.observed}


if __name__ == "__main__":
    print(json.dumps(audit(), indent=2, ensure_ascii=True, allow_nan=False))
