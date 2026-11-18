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


def bindings_and_buffers(body, garment, item):
    source_mesh = garment.doc["extras"]["sourceMesh"]
    node, = [n for n in body.doc["nodes"] if n.get("mesh") == source_mesh]
    source_primitive = body.doc["meshes"][source_mesh]["primitives"][garment.doc["extras"]["sourcePrimitive"]]
    source_skin = body.doc["skins"][node["skin"]]
    own_skin, = garment.doc["skins"]
    own_primitive, = garment.doc["meshes"][0]["primitives"]
    verify(source_skin["joints"] == own_skin["joints"], "Extracted bone order differs")
    verify(set(own_primitive["attributes"]) == set(source_primitive["attributes"]), "Extracted attribute set differs")
    for attr, index in source_primitive["attributes"].items():
        verify(skin.same(body.acc(index), garment.acc(own_primitive["attributes"][attr])), "Extracted " + attr + " differs")
    verify(skin.same(body.acc(source_primitive["indices"]), garment.acc(own_primitive["indices"])), "Extracted indices differ")
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
    check_body_uv(baseline, original)
    check_body_uv(donor, original)
    _, mat, masked, consumer = skin.body(original)
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
    ni, node = next((i,n) for i,n in enumerate(target.doc["nodes"]) if n.get("mesh") == consumer["mesh"])
    base_mesh = target.doc["meshes"][node["mesh"]]
    selections, names = [], {}
    for slot, token in (("top","Tops"),("bottom","Bottoms"),("shoes","Shoes")):
        index, = [j for j,p in enumerate(base_mesh["primitives"]) if "_"+token+"_" in target.doc["materials"][p["material"]]["name"]]
        selections.append((slot,index,token))
        names[slot] = target.doc["materials"][base_mesh["primitives"][index]["material"]]["name"]
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
