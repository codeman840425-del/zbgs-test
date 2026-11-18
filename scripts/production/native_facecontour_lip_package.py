"""Extract the native N00/101 lip preset into two tone-specific Face images for exact FaceContour bodies."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile

from native_palette_compatibility import ROOT, check_stage, json_bytes, license_terms, model, pinned, reference, require, sha
import native_skin_tone_package as skin

PACKAGE = "native-facecontour-lip-package-v1"
REGISTRY = "native-facecontour-lip-registry-v1"
SOURCE_DIR = ROOT / "assets-source" / PACKAGE
PUBLIC = ROOT / "prototype/public/assets" / PACKAGE
INPUTS = SOURCE_DIR / "inputs.json"
AUTHOR = ROOT / "assets-source/native-facecontour-lip-author-v1"
LIP = "native-lip-101-v1"
WARM = "native-warm-v1"
MOUTH = "N00_000_00_FaceMouth_00_FACE (Instance)"
COLOR = "#ffb8b2"

spec = importlib.util.spec_from_file_location("native_lip_batch_author", AUTHOR / "author.py")
author = importlib.util.module_from_spec(spec)
spec.loader.exec_module(author)


def author_images(pair):
    receipt = json.loads(pinned(pair["authoring"]))
    recipe = json.loads(pinned(pair["recipe"]))
    require(receipt["presetId"] == recipe["id"] == author.PRESET
            and receipt["sourceResource"] == recipe["resource"] == author.RESOURCE
            and receipt["restoredMainMenu"] and not receipt.get("failure"), "Invalid native authoring receipt")
    require(set(receipt["products"]) == set(pair["states"]) == {"original", "warm"}, "Missing source skin contexts")
    outputs, files, fits = {}, {}, {}
    for state, tone in (("original", "original"), ("warm", WARM)):
        product = receipt["products"][state]
        state_row = pair["states"][state]
        require(json.loads(pinned(state_row["readback"])) == product, "Native per-tone receipt differs")
        require(product["sourceEditable"] == recipe["sourceStates"][state], "Source tone was swapped")
        for k in ("sourceEditable", "authoredEditable"):
            pinned(product[k])
        parameter, = product["lipParametersCold"]
        values = parameter["value"]
        color = "#" + "".join(f"{round(values[k] * 255):02x}" for k in "rgb")
        require(parameter["key"] == "Level1Lip_OverlayColor" and color == COLOR and values["a"] == 1,
                "Unexpected native Lip preset color")
        old_ref, new_ref = (product["readback"][k] for k in ("source", "authored"))
        old, edited = model(old_ref), model(new_ref)
        result = author.compare(ROOT / old_ref["path"], ROOT / new_ref["path"])
        require(result == product["readback"] and result["onlyFacialBaseAndShadeChanged"], "Lip author export changed")
        # These checks include sampler/texture transform/indices/UV and all other MToon maps and factors.
        _, face_src, face_fit = skin.skin_surface(old, skin.FACE)
        _, lip_face, lip_fit = skin.skin_surface(edited, skin.FACE)
        _, mouth_src, mouth_fit = skin.skin_surface(old, MOUTH)
        mouth_new = skin.skin_surface(edited, MOUTH)
        require(face_fit == lip_fit and (mouth_src, mouth_fit) == mouth_new[1:]
                and license_terms(old) == license_terms(edited), "Face fit, protected mouth or permissions changed")
        require(sha(face_src) == state_row["faceSource"] and sha(lip_face) == state_row["faceOutput"]
                and sha(mouth_src) == state_row["mouthPngSha256"] and state_row["changedAlphaPixels"] == 0,
                "Native paired face image pins differ")
        path = "images/" + sha(lip_face) + ".png"
        files[path] = lip_face
        outputs[tone] = {"sourceSha256": sha(face_src), "authored": {"url": "/assets/" + PACKAGE + "/" + path,
                                                                   "sha256": sha(lip_face)}}
        fits[tone] = {"face": face_fit, "mouth": mouth_fit, "mouthSha256": sha(mouth_src), "license": license_terms(old)}
    require(fits["original"] == fits[WARM] and len(files) == 2, "The two native tones lack compatible distinct images")
    return outputs, files, fits["original"]


def exact_target(body, manifest, outputs, source_fit):
    _, source_face, fit = skin.skin_surface(body, skin.FACE)
    _, mouth, mouth_fit = skin.skin_surface(body, MOUTH)
    require(fit == source_fit["face"] and mouth_fit == source_fit["mouth"] and sha(mouth) == source_fit["mouthSha256"]
            and license_terms(body) == source_fit["license"], "Face material/UV or protected oral fit differs")
    face = manifest["face"]
    require(manifest["toneId"] == WARM and face["materialName"] == skin.FACE and face["width"] == face["height"] == 1024
            and face["sourceSha256"] == sha(source_face) == outputs["original"]["sourceSha256"]
            and face["authored"]["sha256"] == outputs[WARM]["sourceSha256"], "Original/warm face source mismatch")
    path = face["authored"]["url"]
    require(path.startswith("/assets/" + skin.PACKAGE + "/"), "Unknown warm skin image origin")
    pinned(reference("prototype/public" + path, outputs[WARM]["sourceSha256"]))


def build(inputs):
    require(inputs["schema"] == "native-facecontour-lip-inputs-v1", "Unknown lip inputs")
    pair = json.loads(pinned(inputs["authorPair"]))
    require(pair["schema"] == "native-facecontour-lip-pair-verification-v1", "Unknown native lip pair")
    outputs, files, fit = author_images(pair)
    registry = json.loads(pinned(inputs["skinRegistry"]))
    require(registry["schema"] == "native-skin-tone-registry-v1", "Unexpected linked skin registry")
    targets = {t["bodyType"]: t for t in json.loads(skin.TARGETS.read_bytes())["targets"]}
    entries, reports = [], []
    for row in registry["entries"]:
        key = row["bodyType"]
        require(key in targets and targets[key]["bodySha256"] == row["bodySha256"], "Wrong or duplicate FaceContour target")
        target = targets.pop(key)
        body_ref = reference("prototype/public/assets/" + key + "/body.vrm", row["bodySha256"])
        body = model(body_ref)
        src = json.loads(pinned(target["provenance"]))
        require(src["bodySha256"] == body_ref["sha256"], "Wrong native body provenance")
        skin_ref = reference("prototype/public/assets/" + skin.PACKAGE + "/" + key + "/manifest.json", row["manifestSha256"])
        linked_skin = json.loads(pinned(skin_ref))
        require(linked_skin["schema"] == skin.PACKAGE and linked_skin["avatarSha256"] == row["bodySha256"] and
                linked_skin["coverageManifestSha256"] == row["coverageManifestSha256"], "Skin manifest identity differs")
        exact_target(body, linked_skin, outputs, fit)
        exact_target(model(src["native"]), linked_skin, outputs, fit)
        manifest = {"schema": PACKAGE, "version": 1, "avatarSha256": row["bodySha256"],
                    "skinManifestSha256": skin_ref["sha256"], "lipId": LIP, "color": COLOR,
                    "face": {"materialName": skin.FACE, "width": 1024, "height": 1024, "alphaMode": "MASK",
                             "alphaCutoff": .5}, "tones": outputs}
        data = json_bytes(manifest)
        files[key + "/manifest.json"] = data
        entries.append({"bodyType": key, "bodySha256": row["bodySha256"], "skinManifestSha256": skin_ref["sha256"],
                        "lipId": LIP, "color": COLOR, "manifestSha256": sha(data)})
        reports.append({"body": body_ref, "native": src["native"], "provenance": target["provenance"],
                        "skinManifest": skin_ref, "matchedToneSources": {t: v["sourceSha256"] for t, v in outputs.items()}})
    require(not targets and len(entries) == 2, "Expected both current FaceContour records")
    files["registry.json"] = json_bytes({"schema": REGISTRY, "entries": sorted(entries, key=lambda e: e["bodyType"])})
    return files, {"schema": "native-facecontour-lip-target-fit-v1", "inputs": inputs, "targets": reports,
                   "fit": fit, "tones": outputs, "runtimeAdmission": False, "visualAcceptance": False}


def publish(files):
    if not PUBLIC.exists():
        skin.stage_new(PUBLIC, files)
        return
    existing = {p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob("*") if p.is_file()}
    require(existing <= files.keys(), "Unexpected files in lip package")
    registry = PUBLIC / "registry.json"
    if registry.exists():
        prior = registry.read_bytes()
        require(prior == files["registry.json"] or json.loads(prior) == {"schema": REGISTRY, "entries": []},
                "Cannot replace an existing lip registration")
    for folder in sorted({k.split("/")[0] for k in files if "/" in k}):
        skin.stage_new(PUBLIC / folder, {k.split("/", 1)[1]: d for k, d in files.items() if k.startswith(folder + "/")})
    if not registry.exists() or registry.read_bytes() != files["registry.json"]:
        with tempfile.TemporaryDirectory(dir=PUBLIC.parent) as tmp:
            pending = Path(tmp) / "registry.json"
            pending.write_bytes(files["registry.json"])
            os.replace(pending, registry)
    check_stage(PUBLIC, files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    for name in ("stage", "publish", "check"):
        operation.add_argument("--" + name, action="store_true")
    args = parser.parse_args()
    files, report = build(json.loads(INPUTS.read_bytes()))
    report_files = {"report.json": json_bytes(report)}
    if args.stage:
        skin.stage_new(SOURCE_DIR / "runtime", files)
        skin.stage_new(SOURCE_DIR / "readback", report_files)
    else:
        check_stage(SOURCE_DIR / "runtime", files)
        check_stage(SOURCE_DIR / "readback", report_files)
        if args.publish:
            publish(files)
        check_stage(PUBLIC, files)
    print(json.dumps({"registrySha256": sha(files["registry.json"]), "bodies": len(report["targets"]),
                      "toneImages": len(report["tones"])}))


if __name__ == "__main__":
    main()
