"""Build a complete-skin body and its three native embedded garments for each recipe."""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / "assets-source/native-parameter-game-packages-v1"
CONFIG = Path(__file__).with_name("native-body-package-v1.json")
GARMENT_SLOTS = (("top", "Tops"), ("bottom", "Bottoms"), ("shoes", "Shoes"))
GARMENT_SELECTOR_KEYS = {"node", "mesh", "skin", "primitive", "material"}
ONE_PIECE = re.compile(r"(?<![a-z0-9])one[-_ ]?piece(?![a-z0-9])", re.IGNORECASE)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


skin = module("native_skin_readback", "assets-source/native-vroid-waist-body-texture-fit-v1/build.py")
geometry = module("native_skin_encoder", "assets-source/native-vroid-geometry-factory-input-v1/build.py")
equipment = module("native_equipment_extract", "scripts/native-vroid-equipment-extract.py")
importer = module("native_import", "scripts/production/native_import.py")
GLB = skin.gmod.GLB
encode = equipment.js


def verify(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pinned(ref):
    path = importer.confined(ROOT, ref["path"])
    verify(sha(path.read_bytes()) == ref["sha256"], "Source SHA mismatch: " + ref["path"])
    return path


def resources(config):
    verify(config["schema"] == "native-body-package-recipe-v1", "Unknown recipe")
    paths = {k:pinned(config[k]) for k in ("template","donor","baseline","mask","authoringResult","authoringBatch")}
    batch = json.loads(paths["authoringBatch"].read_bytes())
    verify(batch["template"]["sha256"] == config["template"]["sha256"], "Authoring template mismatch")
    return paths, batch, json.loads(paths["authoringResult"].read_bytes())


def check_body_uv(reference, candidate):
    rp, rm, _, rc = skin.body(reference)
    cp, cm, _, cc = skin.body(candidate)
    verify(rm == cm and rc == cc, "Body material or UV consumer differs")
    indices = reference.acc(rp["indices"])
    verify(skin.same(indices, candidate.acc(cp["indices"])), "Body topology differs")
    ids = np.unique(indices)
    for attr in ("TEXCOORD_0","JOINTS_0","WEIGHTS_0"):
        verify(skin.same(reference.acc(rp["attributes"][attr])[ids], candidate.acc(cp["attributes"][attr])[ids]),
               "Body indexed attribute differs: " + attr)


def garment_selection(doc, consumer, item):
    """Check the existing single-owner, three-primitive extraction contract."""
    nodes, meshes, materials = (doc[key] for key in ("nodes", "meshes", "materials"))
    body_mesh = consumer["mesh"]

    def location(selector):
        node, mesh, prim, material = (selector[key] for key in ("node", "mesh", "primitive", "material"))
        node_name = nodes[node].get("name") if type(node) is int and 0 <= node < len(nodes) else None
        material_name = materials[material].get("name") if type(material) is int and 0 <= material < len(materials) else None
        skin_index = selector.get("skin")
        return f"node[{node}] {node_name!r} mesh[{mesh}] primitive[{prim}] material[{material}] {material_name!r} skin[{skin_index}]"

    def fail(reason, selectors):
        raise ValueError(f"Native body {item['id']!r}: {reason}. " + " | ".join(map(location, selectors)))

    owners_by_mesh = {}
    for index, owner in enumerate(nodes):
        if "mesh" in owner:
            owners_by_mesh.setdefault(owner["mesh"], []).append(index)
    owners = owners_by_mesh.get(body_mesh, [])
    if len(owners) != 1:
        fail("expected one Body mesh owner for three-slot extraction",
             [dict(node=i, mesh=body_mesh, primitive=consumer["primitive"], material=consumer["material"])
              for i in owners or [None]])
    body_owner = owners[0]
    node = nodes[body_owner]
    found = {slot: [] for slot, _ in GARMENT_SLOTS}
    inspected, unknown_clothes = [], []
    for mesh, data in enumerate(meshes):
        mesh_owners = owners_by_mesh.get(mesh, [])
        for prim, primitive in enumerate(data["primitives"]):
            material = primitive["material"]
            name = materials[material]["name"]
            selectors = [dict(node=i, mesh=mesh, skin=nodes[i].get("skin") if i is not None else None,
                              primitive=prim, material=material) for i in mesh_owners or [None]]
            if mesh == body_mesh:
                inspected.extend(selectors)
            matches = [slot for slot, token in GARMENT_SLOTS if f"_{token}_" in name]
            if ONE_PIECE.search(name):
                fail("onePiece requires an explicit same-body donor and coverage contract outside this extractor", selectors)
            if len(matches) > 1:
                fail("one primitive claims multiple slots: " + ", ".join(matches), selectors)
            if matches:
                found[matches[0]].extend(selectors)
            elif "_CLOTH" in name:
                unknown_clothes.extend(selectors)

    selected = {}
    for slot, _ in GARMENT_SLOTS:
        candidates = found[slot]
        if not candidates:
            fail(f"missing slot {slot!r} on the Body mesh", inspected + [r for r in unknown_clothes if r["mesh"] != body_mesh])
        if len(candidates) > 1:
            fail(f"multiple candidates for slot {slot!r}. This extractor requires one primitive per slot", candidates)
        selected[slot] = candidates[0]
    if unknown_clothes:
        fail("unmapped clothing primitive requires a supported slot and coverage contract", unknown_clothes)

    if "garmentSelection" in item:
        requested = item["garmentSelection"]
        if not isinstance(requested, dict) or set(requested) != set(found):
            fail("garmentSelection requires exactly top, bottom and shoes. Multi-part and onePiece are unsupported",
                 selected.values())
        claimed = set()
        for slot, _ in GARMENT_SLOTS:
            selector = requested[slot]
            if (not isinstance(selector, dict) or set(selector) != GARMENT_SELECTOR_KEYS or
                    any(type(index) is not int or index < 0 for index in selector.values())):
                fail(f"invalid garmentSelection selector for slot {slot!r}. Expected one exact node/mesh/skin/primitive/material",
                     [selected[slot]])
            key = (selector["mesh"], selector["primitive"])
            if key in claimed:
                fail(f"garmentSelection assigns the same primitive to multiple slots at {slot!r}", [selector])
            claimed.add(key)
        for slot, selector in selected.items():
            if requested[slot] != selector:
                fail(f"garmentSelection for slot {slot!r} differs from the verified primitive", [requested[slot], selector])

    selections, names = [], {}
    for slot, token in GARMENT_SLOTS:
        selector = selected[slot]
        if selector["node"] != body_owner or selector["mesh"] != body_mesh:
            fail(f"slot {slot!r} is outside the single skinned Body mesh. A separate part is unsupported", [selector])
        skin_index = selector["skin"]
        if (set(node) != {"name", "mesh", "skin"} or not node.get("name") or
                type(skin_index) is not int or not 0 <= skin_index < len(doc.get("skins", []))):
            fail(f"slot {slot!r} requires the original untransformed Body mesh node and one raw skin", [selector])
        primitive = meshes[body_mesh]["primitives"][selector["primitive"]]
        material = materials[selector["material"]]
        if (primitive.get("mode", 4) != 4 or primitive.get("targets") or "indices" not in primitive or
                not {"POSITION", "JOINTS_0", "WEIGHTS_0"} <= primitive.get("attributes", {}).keys() or
                "VRMC_materials_mtoon" not in material.get("extensions", {})):
            fail(f"slot {slot!r} requires an indexed, weighted MToon triangle primitive without morph targets", [selector])
        selections.append((slot, selector["primitive"], token))
        names[slot] = material["name"]
    return body_owner, node, selections, names


def bindings_and_buffers(body, garment, item, *, expected_primitives=None):
    origin = garment.doc["extras"]
    verify(origin["sourceSha256"] == item["compatibleAvatarSha256"], "Extracted source and binding body identities differ")
    source_mesh = origin["sourceMesh"]
    node, = [n for n in body.doc["nodes"] if n.get("mesh") == source_mesh]
    source_skin = body.doc["skins"][node["skin"]]
    own_skin, = garment.doc["skins"]
    own_mesh, = garment.doc["meshes"]
    if "sourcePrimitives" in origin:
        source_ids = origin["sourcePrimitives"]
        verify("sourcePrimitive" not in origin and expected_primitives is not None and source_ids == expected_primitives,
               "Grouped extract requires the exact ordered input selections")
    else:
        source_ids = [origin["sourcePrimitive"]]
        verify(expected_primitives is None or source_ids == expected_primitives, "Extracted source selection differs")
    source_parts = body.doc["meshes"][source_mesh]["primitives"]
    verify(bool(source_ids) and all(type(i) is int and 0 <= i < len(source_parts) for i in source_ids)
           and len(set(source_ids)) == len(source_ids), "Invalid or repeated source primitive")
    verify(len(source_ids) == len(own_mesh["primitives"]), "Extracted primitive count differs")
    verify(source_skin["joints"] == own_skin["joints"], "Extracted bone order differs")
    for i, part in zip(source_ids, own_mesh["primitives"], strict=True):
        original = source_parts[i]
        verify(set(part["attributes"]) == set(original["attributes"]), "Extracted attribute set differs")
        for attr, index in original["attributes"].items():
            verify(skin.same(body.acc(index), garment.acc(part["attributes"][attr])), f"Extracted primitive {i} {attr} differs")
        verify(skin.same(body.acc(original["indices"]), garment.acc(part["indices"])), f"Extracted primitive {i} indices differ")
        verify(body.doc["materials"][original["material"]]["name"] == garment.doc["materials"][part["material"]]["name"],
               f"Extracted primitive {i} material differs")
    ibm = body.acc(source_skin["inverseBindMatrices"])
    verify(skin.same(ibm, garment.acc(own_skin["inverseBindMatrices"])), "Extracted IBM differ")
    verify(len(item["bindings"]) == len(ibm), "Incomplete binding manifest")
    for index, binding in enumerate(item["bindings"]):
        name = body.doc["nodes"][source_skin["joints"][index]]["name"]
        verify(binding["sourceBone"] == binding["targetRawBone"] == name and
               np.array_equal(ibm[index], binding["inverseBindMatrix"]), "Named raw binding differs")


def create(config, common, item, dest, temp):
    paths, batch, result = common
    ident = item["id"]
    recipe, = [r for r in batch["items"] if r["id"] == ident]
    row, = [r for r in result["items"] if r["id"] == ident]
    native = pinned(item["candidate"])
    delta = json.loads(pinned(item["delta"]).read_bytes())
    verify(delta.get("schema") == "native-dependency-delta-v1" and delta.get("status") == "compared",
           "Native reference comparison unavailable: " + str(delta.get("reason") or delta.get("status")))
    verify(result["passed"] and row["state"] == "exported" and recipe["values"] == row["coldReadback"] == row["values"],
           "Native final parameters not confirmed")
    verify(delta["baseline"]["sha256"] == config["baseline"]["sha256"] and
           delta["candidate"]["sha256"] == item["candidate"]["sha256"] == row["exported"]["sha256"], "Wrong delta or native export identity")
    editable = native.parent/row["editable"]["path"]
    verify(sha(editable.read_bytes()) == row["editable"]["sha256"], "Native editable SHA mismatch")
    original, baseline, donor = (GLB(p) for p in (native, paths["baseline"], paths["donor"]))
    _, mat, masked, consumer = skin.body(original)
    ni, node, selections, names = garment_selection(original.doc, consumer, item)
    check_body_uv(baseline, original)
    check_body_uv(donor, original)
    _, _, full, _ = skin.body(donor)
    verify(masked == paths["mask"].read_bytes() == skin.body(baseline)[2], "Native covered Body PNG differs from the verified top mask")
    a, b = [np.asarray(Image.open(io.BytesIO(data)).convert("RGBA")) for data in (full,masked)]
    verify(a.shape == b.shape and np.all(a[:,:,3] == 255) and np.array_equal(a[:,:,:3], b[:,:,:3]), "Body mask changed RGB or dimensions")
    changed = int(np.count_nonzero(a[:,:,3] != b[:,:,3]))
    verify(changed > 0, "Missing coverage alpha change")
    body_raw = geometry.encode(copy.deepcopy(original.doc), original.bin, consumer["image"], full)
    body_path = temp/"body.vrm"
    body_path.write_bytes(body_raw)
    target = GLB(body_path)
    for key in ("nodes","skins","meshes","extensions","materials","textures","samplers","accessors"):
        verify(target.doc.get(key) == original.doc.get(key), "Unmask changed " + key)
    for index in range(len(original.doc["accessors"])):
        verify(skin.same(original.acc(index), target.acc(index)), "Unmask changed accessor " + str(index))
    verify(skin.body(target)[2] == full, "Unmasked output has wrong body image")
    body_sha = sha(body_raw)
    package = "native-" + ident + "-v1"
    url_root = "/assets/" + package + "/"
    spec = dict(sourcePath=body_path.relative_to(ROOT).as_posix(), sourceSha256=body_sha,
                sourceNode=ni, sourceNodeName=node["name"], sourceMesh=node["mesh"], sourceSkin=node["skin"],
                primitives=selections, idPrefix="native-"+ident+"-", equipmentId=package+"-equipment",
                limits=["Exact same-source three garments only","Runtime fit/contact pending"])
    files = equipment.extract(spec, temp)
    trace = json.loads(files.pop("extraction.json"))
    trace["sourcePath"] = (dest/"body.vrm").relative_to(ROOT).as_posix()
    files["extraction.json"] = encode(trace)
    for name,data in files.items():
        (temp/name).write_bytes(data)
    catalog = json.loads(files["equipment.json"])
    rules, ids = [], {}
    for entry in catalog["items"]:
        bindings_and_buffers(target, GLB(temp/entry["url"]), entry)
        rules.append({k:entry[k] for k in ("id","slot","sha256","compatibleAvatarSha256")} |
                     dict(covered=entry["slot"]=="top",required=True))
        ids["shorts" if entry["slot"] == "bottom" else entry["slot"]] = entry["id"]
    floor = json.loads(subprocess.run(["node",str(Path(__file__).with_name("native_body_floor.mjs")),str(body_path),body_sha,names["shoes"]],
                                      cwd=ROOT,check=True,capture_output=True,text=True,encoding="utf8").stdout)
    coverage = dict(schema="native-body-texture-coverage-v1",id=package+"-coverage",avatarSha256=body_sha,
                    materialName=mat["name"],width=a.shape[1],height=a.shape[0],alphaTest=mat.get("alphaCutoff",.5),
                    basePngSha256=sha(full),covered=dict(url="native-tops-body.png",sha256=sha(masked)),
                    rgbPreserved=True,equipment=rules,sourceMaskLineage=dict(nativeMasked=item["candidate"],originalMask=config["mask"]))
    coverage_bytes = encode(coverage)
    profile = dict(id=package,label=item["label"],source="VRoid native FaceContour recipe; exact embedded garments and complete-skin donor",
                   fitStatus="Same-source geometry, raw bindings and CPU rest floor checked; gameplay fit and contact pending",
                   url=url_root+"body.vrm",sha256=body_sha,manifestUrl=url_root+"equipment.json",
                   sourceFloorY=floor["rest"],sourceRawFloorY=floor["raw"],baseBodyDisplay="source-with-hair",
                   bodyTextureCoverage=dict(url=url_root+"manifest.json",sha256=sha(coverage_bytes)),ids=ids,
                   defaultOutfit=dict(index=0,role="shorts",bottomRole="shorts",equipmentRoles=["top","shorts","shoes"]),
                   seatLayerThickness=0)
    files = {"body.vrm":body_raw, "equipment.json":files["equipment.json"],
             **{entry["url"]:files[entry["url"]] for entry in catalog["items"]},
             "manifest.json":coverage_bytes, "native-tops-body.png":masked}
    data = {"native-tops-body.png":masked, "manifest.json":coverage_bytes,
            "profile-candidate.json":encode(dict(schema="native-factory-profile-input-v1",status="offline-prepared",
                                                suggestedBodyType=package,sourceExportSha256=item["candidate"]["sha256"],
                                                recipeSha256=sha(encode(recipe)),profile=profile)),
            "recipe.json":encode(recipe),
            "import-spec.json":encode(dict(schema="native-parameter-factory-staging-v1",bodyFile="body.vrm",bodySha256=body_sha,
                                            bodyType=package,urlRoot=url_root,files={n:[(dest/n).relative_to(ROOT).as_posix(),sha(v)] for n,v in files.items()})),
            "provenance.json":encode(dict(schema="native-parameter-body-provenance-v1",id=ident,
                inputs={k:config[k] for k in paths},native=item["candidate"],editable=row["editable"],delta=item["delta"],
                recipeValues=recipe["values"],changedCoverageAlphaPixels=changed,bodyConsumer=consumer,
                allNativeAccessorsPreserved=len(target.doc["accessors"]),garmentAttributesAndInverseBindsExact=True,
                bodySha256=body_sha,sourceMeta=original.doc["extensions"]["VRMC_vrm"]["meta"],
                floor=floor,followUp=delta["requiredChecks"],runtimeAccepted=False,visualAccepted=False))}
    for name,raw in data.items():
        (temp/name).write_bytes(raw)
    importer.bindings(temp, {"bodyFile":"body.vrm"})
    return body_sha


def build(config, output=DEFAULT):
    output = output.resolve()
    verify(output.is_relative_to(ROOT) and output != ROOT, "Output must be in repository")
    common = resources(config)
    ids = [r["id"] for r in config["items"]]
    verify(ids and len(ids) == len(set(ids)) and all(re.fullmatch("[a-z][a-z0-9-]{0,60}",i) for i in ids), "Invalid candidate IDs")
    output.mkdir(parents=True,exist_ok=True)
    results = []
    for item in config["items"]:
        ident = item["id"]
        dest = output/ident
        try:
            with tempfile.TemporaryDirectory(dir=output,prefix=".prepare-") as scratch:
                folder = Path(scratch)/"package"
                folder.mkdir()
                digest = create(config,common,item,dest,folder)
                if not dest.exists():
                    try:
                        os.rename(folder,dest)
                    except FileExistsError:
                        pass
                if folder.exists():
                    importer.exact_directory(dest,{p.name:p.read_bytes() for p in folder.iterdir()})
            results.append(dict(id=ident,state="ready",bodySha256=digest))
        except Exception as error:
            results.append(dict(id=ident,state="failed",reason=f"{type(error).__name__}: {error}"))
    passed = all(r["state"]=="ready" for r in results)
    if passed:
        batch = dict(schema="native-factory-import-batch-v1",items=[dict(id=i,package="native-"+i+"-v1",
                     spec=(output/i/"import-spec.json").relative_to(ROOT).as_posix()) for i in ids])
        equipment.write_outputs({"import-batch.json":encode(batch)},output)
    return dict(passed=passed,items=results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",type=Path,default=CONFIG)
    parser.add_argument("--output",type=Path,default=DEFAULT)
    args = parser.parse_args()
    report = build(json.loads(args.config.read_bytes()),args.output)
    print(json.dumps(report,ensure_ascii=False))
    sys.exit(0 if report["passed"] else 1)
