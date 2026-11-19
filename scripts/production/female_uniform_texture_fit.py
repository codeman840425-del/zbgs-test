"""Stage four exact female uniform fits and two index masks for the new 1K body."""

import argparse
import io
import json
from pathlib import Path, PurePosixPath
import subprocess

import numpy as np
from PIL import Image

from flow import GLB, ROOT, Validator, require
from garment_basecolor_runtime import coverage as check_rest_coverage
from garment_source_mapping import json_bytes
from native_import import digest
from native_release_textures import verify_unchanged, view_payload
from native_uniform_normal import entries
from production_paths import project_output
from stripped_outfit_equipment import BodyReadback


PARENT_SHA = "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95"
TARGET_SHA = "1049f87a865e523e02b53d9985a37aa5229dd2221b7a9645f2261f16d35c172c"
PARENT = "prototype/public/assets/foundation/base-female-roundtrip.vrm"
TARGET = ROOT / "output/m2-female-body-release-candidate/body.vrm"
STAGE = ROOT / "output/m2-female-body-fit"
OUTPUT = STAGE / "final"
PROFILE_ID = "source-female-uniform-texture-v1"
ASSET_URL = "/assets/female-uniform-texture-release-v1"
BODY_MATERIAL = "F00_001_01_Body_00_SKIN"
SHOE_MATERIAL = "F00_001_01_Shoes_01_CLOTH"
TOP_MATERIALS = ("F00_001_01_Tops_01_CLOTH", "F00_001_01_Accessory_Tie_01_CLOTH")
CATALOGS = (
    ("prototype/public/assets/m1/equipment.json", "6b2e784326566008668978932be6d6def603bd2c09f4e6732200a4195b905bea"),
    ("prototype/public/assets/garment-basecolor-release-v1/female/equipment.json",
     "8a9c814ec42f968982940952423d62d29ae411c1ac9db39eafe6610ddb5f6dc7"),
)
COVERAGE_SPEC = ("assets-source/garment-basecolor-release-v1/runtime-fits.json",
                 "66989e0e65dfb6972d86de7503b056389c71804ef26a4dce893e44f205c8d040")
FAR_COVERAGE = ("prototype/public/assets/garment-basecolor-release-v1/female/body-coverage.json",
                "fab2830ae2a47d79f19a265bdec60431b6fbc5f67916004215651e355a147c36")
ROLES = {"top": ("m1-uniform-top", "top", TOP_MATERIALS),
         "topFar": ("m1-female-uniform-top-1k-v1", "top", TOP_MATERIALS),
         "pants": ("m1-training-pants", "bottom", ("M1_TrainingPants",)),
         "shoes": ("m1-uniform-shoes", "shoes", (SHOE_MATERIAL,))}
RELEASE_IDS = {"top": PROFILE_ID + "-top", "topFar": PROFILE_ID + "-top-1k",
               "pants": PROFILE_ID + "-pants", "shoes": PROFILE_ID + "-shoes"}
VIEWS = {
    0: ("ff84d277896e7fd0e365763e7426ca27a89aadd42f24880cfbed25ce8203c6da",
        "b0f3bc32747b81321a125178e8be620d7c6c09f0dddc85eccc5ea1d89a9d4789", 1024),
    161: ("abb54667fbf00f4b5991af9e35a3a42b8d01187ac2840bb771b3af6a11da7018",
          "ecb17ac5a81851cd61427afbae7ba1e0974e7294aa927df0946c9aadb0266f8d", 512),
}


def body_bytes(body, view):
    return view_payload(body.glb.binary, body.doc["bufferViews"][view])


def prove_body(old, new):
    replacements = {}
    for image, view in ((0, 0), (23, 161)):
        before_sha, after_sha, size = VIEWS[view]
        require(old.doc["images"][image]["bufferView"] == new.doc["images"][image]["bufferView"] == view
                and [path for path, value in entries(old.doc) if path[-1] == "bufferView" and value == view]
                == [("images", image, "bufferView")], "Changed or shared body image view")
        before, after = body_bytes(old, view), body_bytes(new, view)
        require((digest(before), digest(after)) == (before_sha, after_sha), "Unexpected body or preview PNG")
        with Image.open(io.BytesIO(before)) as original, Image.open(io.BytesIO(after)) as image_out:
            require(original.format == image_out.format == "PNG" and original.size == (2048, 2048)
                    and image_out.size == (size, size), "Wrong approved PNG resize")
            if image == 0:
                require(all(pic.convert("RGBA").getchannel("A").getextrema() == (255, 255)
                            for pic in (original, image_out)), "Body alpha differs")
            else:
                require(original.mode == image_out.mode == "RGBA", "Thumbnail alpha channel differs")
        replacements[view] = after
    storage = verify_unchanged(old.doc, old.glb.binary, new.doc, new.glb.binary, replacements)
    body_skin = new.doc["materials"][0]
    legacy = new.vrm["materialProperties"][0]
    require(body_skin["name"] == legacy["name"] == BODY_MATERIAL
            and body_skin["alphaMode"] == "MASK" and body_skin["alphaCutoff"] == legacy["floatProperties"]["_Cutoff"] == .5
            and body_skin["pbrMetallicRoughness"]["baseColorTexture"] == {"index": 0}
            and legacy["textureProperties"]["_MainTex"] == legacy["textureProperties"]["_ShadeTexture"] == 0
            and new.vrm["meta"]["texture"] == 23, "Body material or metadata consumer differs")
    require(old.skins == new.skins, "Raw skin or inverse bind bytes changed")
    streams = [old.stream(i) for i in range(len(old.doc["accessors"]))]
    require(streams == [new.stream(i) for i in range(len(new.doc["accessors"]))], "Geometry accessors differ")
    return {"storage": storage, "accessors": len(streams), "morphGroups": len(new.vrm["blendShapeMaster"]["blendShapeGroups"]),
            "skinSignatureSha256": digest(json_bytes(old.skins)), "accessorSignaturesSha256": digest(json_bytes(streams)),
            "renderBodyTexture": 0, "metadataThumbnailTexture": 23}


def drawn_primitives(model):
    for node in model.doc["nodes"]:
        if "mesh" in node:
            require("skin" in node, "Expected skinned garment primitive")
            for part in model.doc["meshes"][node["mesh"]]["primitives"]:
                yield model.doc["materials"][part["material"]]["name"], node, part


def index_streams(model, node, part):
    attrs = part["attributes"]
    indices = np.asarray(model.accessor(part["indices"]), dtype=np.int64).ravel()
    streams = {k: np.asarray(model.accessor(attrs[k]), dtype="<f4")[indices]
               for k in ("POSITION", "NORMAL", "TEXCOORD_0") if k in attrs}
    weights = np.asarray(model.accessor(attrs["WEIGHTS_0"]), dtype="<f4")[indices]
    joints = np.asarray(model.accessor(attrs["JOINTS_0"]), dtype=np.int64)[indices]
    names = np.array([model.doc["nodes"][i]["name"] for i in model.doc["skins"][node["skin"]]["joints"]])
    return streams, weights, np.where(weights > 0, names[joints], "")


def embedded_witness(body, garment):
    by_name = {mat: (node, part) for mat, node, part in drawn_primitives(body)}
    proofs = {}
    for material, node, part in drawn_primitives(garment):
        require(material in by_name, "Missing exact embedded witness material: " + material)
        original, old_weights, old_joints = index_streams(body, *by_name[material])
        actual, weights, joints = index_streams(garment, node, part)
        require(actual.keys() == original.keys()
                and all(np.array_equal(actual[k], original[k]) for k in original)
                and np.array_equal(joints, old_joints) and weights.shape == old_weights.shape,
                "Embedded draw geometry, normal, UV or bone lanes differ: " + material)
        error = float(np.max(np.abs(weights - old_weights)))
        require(error <= np.finfo(np.float32).eps, "Embedded garment per-vertex weight differs: " + material)
        proofs[material] = {"triangles": len(weights) // 3, "maxNormalizedWeightDelta": error,
                            "positionSha256": digest(actual["POSITION"].tobytes())}
    return proofs


def fit_item(reader, role, item, catalog, old, new):
    original_id, slot, expected_materials = ROLES[role]
    require(item["id"] == original_id and item["slot"] == slot, "Unexpected garment or slot: " + role)
    old_fit = reader.equipment(item, PARENT_SHA, old, catalog)
    file = (reader.url(item["url"]) if item["url"].startswith("/")
            else (PurePosixPath(catalog).parent / item["url"]).as_posix())
    glb = GLB(reader.pin(file, item["sha256"], item["bytes"]))
    materials = tuple(mat for mat, _, _ in drawn_primitives(glb))
    require(materials == expected_materials, "Unexpected garment material: " + role)
    garment_binds, old_binds, new_binds = glb.bind_by_name(), old.bind_by_name(), new.bind_by_name()
    require(all(b["sourceBone"] == b["targetRawBone"]
                and garment_binds[b["sourceBone"]] == old_binds[b["targetRawBone"]] == new_binds[b["targetRawBone"]]
                for b in item["bindings"]), "Actual raw bone bind changes: " + role)
    skin = []
    for skin_row in glb.doc["skins"]:
        skin.extend(glb.doc["nodes"][joint]["name"] for joint in skin_row["joints"])
    streams = []
    for mat, _, primitive in drawn_primitives(glb):
        values = {"indices": primitive["indices"], **primitive["attributes"]}
        streams.append({"material": mat, "accessors": {k: digest(json_bytes(glb.accessor(i))) for k, i in values.items()}})
    equipped = dict(item, id=RELEASE_IDS[role], fitId=RELEASE_IDS[role] + "-fit-v1",
                    styleId=item.get("styleId", item["id"]), version=1, compatibleAvatarSha256=TARGET_SHA,
                    url="/" + PurePosixPath(file).relative_to("prototype/public").as_posix(),
                    limits=["Exact 1K female body CPU source fit. Gameplay contacts remain pending.", *item.get("limits", [])])
    positive = reader.equipment(equipped, TARGET_SHA, new, "")
    require((positive["bones"], positive["weightedVertices"]) == (old_fit["bones"], old_fit["weightedVertices"]),
            "Garment binding proof changed after body update")
    witness = embedded_witness(new, glb) if role != "pants" else {}
    return equipped, glb, {**positive, "fitId": equipped["fitId"], "sourceId": original_id, "skinJoints": skin,
                           "garmentSha256": item["sha256"], "streams": streams, "embeddedWitness": witness}


def measure_floor(path, sha):
    proc = subprocess.run(["node", str(Path(__file__).with_name("native_body_floor.mjs")), str(path), sha, SHOE_MATERIAL],
                          cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(proc.stdout)


def rebind_coverage(reader, role, old_rule, old_rule_pin, pose_body, top_model, near, far, release, spec):
    regenerated, witness = check_rest_coverage(pose_body, top_model, near, far, spec)
    expected = json.loads(reader.pin(*FAR_COVERAGE))
    require(regenerated == expected and witness["selectedFaces"] == 252 and witness["restSurfaceHits"] == 1764,
            "Recomputed coverage and stored triangle witnesses differ")
    original = near if role == "top" else far
    require(old_rule["avatarSha256"] == PARENT_SHA and old_rule["topId"] == original["id"]
            and old_rule["topSha256"] == original["sha256"] == release["sha256"]
            and release["compatibleAvatarSha256"] == TARGET_SHA, "Wrong body, top identity or asset for coverage")
    for field in ("bodyMesh", "bodyMeshIndex", "bodyPrimitive", "bodyMaterial", "bodyIndexAccessorSha256",
                  "bodyFaceCount", "selectedFaceIds", "selectedTriangles", "selectedVertices"):
        require(old_rule[field] == regenerated[field], "Coverage source selection differs: " + field)
    new = dict(old_rule, id=release["id"] + "-coverage-v1", avatarSha256=TARGET_SHA,
               topId=release["id"], topSha256=release["sha256"], parentCoverage=old_rule_pin,
               status="candidate; exact geometry and sampled rest coverage rechecked for this 1K body")
    return json_bytes(new), witness


def build(candidate):
    require(candidate.resolve().is_relative_to(ROOT), "Expected a project-local source candidate")
    raw = candidate.read_bytes()
    require(digest(raw) == TARGET_SHA, "Wrong texture body candidate SHA")
    reader = Validator()
    old, new = BodyReadback(reader.pin(PARENT, PARENT_SHA)), BodyReadback(raw)
    body = prove_body(old, new)
    near_cat, far_cat = (json.loads(reader.pin(*pin)) for pin in CATALOGS)
    spec_doc = json.loads(reader.pin(*COVERAGE_SPEC))
    [spec] = [r for r in spec_doc["items"] if r["id"] == ROLES["topFar"][0]]
    require(spec["body"] == {"path": PARENT, "sha256": PARENT_SHA}, "Wrong source coverage body")
    near_fit_ref = spec["coverage"]
    near_fit = json.loads(reader.pin(near_fit_ref["path"], near_fit_ref["sha256"]))
    far_fit = json.loads(reader.pin(*FAR_COVERAGE))
    witnessed = {r: reader.item(far_cat if r == "topFar" else near_cat, identity)
                 for r, (identity, _, _) in ROLES.items()}
    assets, models, proofs = {}, {}, {}
    for r, item in witnessed.items():
        catalog_path = CATALOGS[1 if r == "topFar" else 0][0]
        assets[r], models[r], proofs[r] = fit_item(reader, r, item, catalog_path, old.glb, new.glb)
    require(proofs["top"]["streams"] == proofs["topFar"]["streams"], "1K top actual draw streams differ")
    files = {"body.vrm": raw, "equipment.json": json_bytes({"schema": "zbgs-equipment-v1", "items": list(assets.values())})}
    masks = {}
    for r, path, original, pin in (
        ("top", "coverage-top.json", near_fit, near_fit_ref),
        ("topFar", "coverage-top-1k.json", far_fit, dict(zip(("path", "sha256"), FAR_COVERAGE, strict=True))),
    ):
        files[path], witness = rebind_coverage(reader, r, original, pin, new.glb, models[r],
                                              witnessed["top"], witnessed["topFar"], assets[r], spec)
        masks[r] = {"url": ASSET_URL + "/" + path, "sha256": digest(files[path]), **witness}
    pre, post = measure_floor(ROOT / PARENT, PARENT_SHA), measure_floor(candidate, TARGET_SHA)
    require(all(pre[k] == post[k] for k in ("raw", "rest", "vertices", "material", "threeRevision")),
            "Runtime shoe rest changed against the original")
    profile = {"id": PROFILE_ID, "label": "女性制服 · 1K 身体肤色", "source": "Base_Female / 1K body color and 512px preview",
               "workbenchGroup": "female", "workbenchLabel": "制服身体肤色 1K · 两套上衣",
               "url": ASSET_URL + "/body.vrm", "sha256": TARGET_SHA, "manifestUrl": ASSET_URL + "/equipment.json",
               "manifestSha256": digest(files["equipment.json"]), "ids": RELEASE_IDS, "embeddedClothing": True,
               "baseBodyDisplay": "source-with-hair", "sourceFloorY": 0, "seatLayerThickness": 0.006 / 0.61,
               "defaultOutfit": {"index": 0, "role": "pants", "bottomRole": "pants",
                                 "equipmentRoles": ["top", "shoes", "pants"]},
               "extraOutfits": [{"index": 5, "role": "pants-top-far", "bottomRole": "pants",
                                 "equipmentRoles": ["topFar", "shoes", "pants"], "label": "1K 上衣、及膝裤和平底鞋"}],
               "bodyCoverage": {k: masks["top"][k] for k in ("url", "sha256")},
               "additionalBodyCoverage": [{"role": "topFar", "descriptor": {k: masks["topFar"][k] for k in ("url", "sha256")}}],
               "fitStatus": "两套裤装已核原始绑定与静止遮挡。动作、观感和普通电脑表现待验。"}
    files["profile.json"] = json_bytes({PROFILE_ID: profile})
    files["report.json"] = json_bytes({"schema": "female-uniform-texture-fit-v1", "bodyType": PROFILE_ID,
        "sourceBodySha256": PARENT_SHA, "targetBodySha256": TARGET_SHA, "bodyProof": body, "fits": proofs, "coverage": masks,
        "floor": {"source": pre, "derived": post, "profileOffsetBasis": "Retained legacy female origin (0 m)"},
        "files": {name: digest(data) for name, data in files.items()}, "inputs": reader.observed,
        "runtimeAccepted": False, "ordinaryPCPerformance": "unmeasured"})
    return files


def run(candidate, output, check_only):
    path = project_output(output, __file__)
    require(path.is_relative_to(STAGE) and path == Path(output).absolute(), "Expected unredirected female fit output")
    files = build(candidate.resolve())
    for name, raw in files.items():
        dest = project_output(path / name, __file__)
        require(dest == path / name, "Redirected female fit output file")
        if check_only or dest.exists():
            require(dest.is_file() and dest.read_bytes() == raw, "Existing female fit output differs: " + name)
    if not check_only:
        path.mkdir(parents=True, exist_ok=True)
        for name, raw in files.items():
            dest = path / name
            try:
                with dest.open("xb") as stream:
                    stream.write(raw)
            except FileExistsError:
                require(dest.is_file() and dest.read_bytes() == raw, "Existing female fit output differs: " + name)
    return {name: digest(raw) for name, raw in files.items()}


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--candidate", type=Path, default=TARGET)
    cli.add_argument("--output", type=Path, default=OUTPUT)
    cli.add_argument("--check", action="store_true")
    options = cli.parse_args()
    try:
        print(json.dumps(run(options.candidate, options.output, options.check)))
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        cli.error(str(error))
