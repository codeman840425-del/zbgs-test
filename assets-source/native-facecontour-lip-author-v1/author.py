"""Author one stock Overlay/Lip on the exact neutral, then (for baked facial colour) warm skin source."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/production"))
import native_skin_tone_package as skin
import numpy as np

spec = importlib.util.spec_from_file_location("skin_author", ROOT / "assets-source/native-facecontour-skin-tone-v1/author.py")
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
runner, require = previous.runner, previous.require
SOURCES = {
    "original": (previous.SOURCE, previous.PIN, "a5aa0d4ffff9137f787d17565d738ece580bba085cac1fee2aa88b8e4dcc7cf2"),
    "warm": (ROOT / "assets-source/native-facecontour-skin-tone-v1/generated/covered.vroid",
             "17b487a875af6b6e06a253d4c753a83cdd1493bf7289162ec38d2d0dc3bbfc72",
             "06b6757e47e827f275fb4a015bcb51139c6aea5c6c04dc04d378959d3c59630d"),
}
PRESET = "2eeea322ca3040fbdd8c67033208045488584ddc.transferablegroup"
RESOURCE = "pixiv/VRoid/Overlay/Lip/N00/101/TransferableGroupType.N00.Level1.Lip.transferablegroup"


def ref(path):
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": runner.sha(path.read_bytes()), "bytes": path.stat().st_size}


def compare(source, edited):
    a, b = (skin.native.reader.GLB(path) for path in (source, edited))
    # Image byte lengths can shift every following buffer view. All remaining document fields,
    # every decoded accessor and every unmodified image are compared.
    differences = [k for k in a.doc.keys() | b.doc.keys() if k not in {"buffers", "bufferViews"}
                   and a.doc.get(k) != b.doc.get(k)]
    changed_accessors = [i for i in range(len(a.doc["accessors"])) if a.acc(i).tobytes() != b.acc(i).tobytes()]
    changed = []
    face_index = skin.skin_surface(a, skin.FACE)[0]
    thumb = a.doc["extensions"]["VRMC_vrm"]["meta"]["thumbnailImage"]
    teeth = next(i for i, m in enumerate(a.doc["materials"]) if "_FaceMouth_" in m["name"])
    teeth_tex = a.doc["materials"][teeth]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    teeth_image = a.doc["textures"][teeth_tex]["source"]
    for i, (x, y) in enumerate(zip(a.images(), b.images(), strict=True)):
        if x == y:
            continue
        old, new = (skin.texel_data(skin.native.image(g, i)) for g in (a, b))
        diff = np.any(old[..., :3] != new[..., :3], axis=2)
        yy, xx = np.nonzero(diff)
        changed.append({"image": i, "sourceSha256": x, "authoredSha256": y,
                        "details": "thumbnail" if i == thumb else "material",
                        "consumers": skin.material_texture_uses(a, i), "dimensions": [old.shape[1], old.shape[0]],
                        "changedRgbPixels": len(yy), "alphaChanges": int(np.count_nonzero(old[..., 3] != new[..., 3])),
                        "rgbBoundsInclusive": [int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())] if len(yy) else []})
    material_changes = [r for r in changed if r["details"] == "material"]
    return {"source": ref(source), "authored": ref(edited), "semanticDocDifferences": differences,
            "accessorCount": len(a.doc["accessors"]), "changedAccessors": changed_accessors, "images": changed,
            "unchangedImageCount": len(a.doc["images"]) - len(changed),
            "mouthImage": {"index": teeth_image, "sourceSha256": a.images()[teeth_image],
                           "authoredSha256": b.images()[teeth_image]},
            "onlyFacialBaseAndShadeChanged": (not differences and not changed_accessors
                and len(material_changes) == 1 and material_changes[0]["image"] == face_index
                and material_changes[0]["changedRgbPixels"] > 0 and material_changes[0]["alphaChanges"] == 0)}


def produce(output, exit_owned):
    generated, calls = output / "generated", output / "calls"
    generated.mkdir(parents=True)
    calls.mkdir()
    counter = 0
    def call(tool, args=None, label=None):
        nonlocal counter
        counter += 1
        return runner.live_transport(tool, args or {}, calls, f"{counter:03d}-{label or tool}")

    def clean(path):
        require(runner.get_entry(call("vroid_status")) == path, "Unexpected active/dirty editor document")

    initial = call("vroid_status")
    require(runner.is_home(initial) and initial["plugin"] == "VRoidMcpBridge 0.15.0" and
            initial["unity"] == "6000.0.62f1", "Unexpected editor or active source")
    report = {"schema": "native-facecontour-lip-author-v1", "presetId": PRESET, "sourceResource": RESOURCE,
              "host": {k: initial[k] for k in ("unity", "plugin")}, "products": {}}
    owned, exporting = set(), None
    try:
        for label, (source, source_pin, vrm_pin) in SOURCES.items():
            vrm = source.with_suffix(".vrm")
            require(ref(source)["sha256"] == source_pin and ref(vrm)["sha256"] == vrm_pin, "Source pins differ")
            work, edited = (generated / (label + suffix) for suffix in ("-copy.vroid", "-lip.vroid"))
            target = edited.with_suffix(".vrm")
            owned.update((work, edited))
            with work.open("xb") as f:
                f.write(source.read_bytes())
            call("vroid_open", {"path": str(work)})
            clean(work)
            catalog = call("vroid_list_presets", {"filter": "Overlay/Lip", "include_locked": False, "limit": 3})
            choice, = [r for r in catalog["presets"] if r["id"] == PRESET]
            require(choice["category"] == "Overlay/Lip" and choice["resource"] == RESOURCE and choice["usable"]
                    and choice["price"] == 0 and not choice["isSet"] and not choice["active"], "Unavailable/active preset")
            groups, ids, before = previous.inventory(call, label + "-before")
            require("Lip" not in ids, "Source already has Lip")
            screenshot_before = call("vroid_screenshot", {"width": 960, "height": 1280})
            call("vroid_apply_preset", {"id": PRESET, "preserve_material": False})
            after_groups, after_ids, after = previous.inventory(call, label + "-applied")
            new_lip, = [r for r in after_groups if r["type"].endswith(".Lip")]
            require(new_lip["id"] == PRESET and new_lip["resource"] == RESOURCE and set(after_ids) == set(ids) | {"Lip"}
                    and all(after_ids[k] == v for k, v in ids.items())
                    and all(before[k] == after[k] for k in before)
                    and sorted((r for r in after_groups if r != new_lip), key=lambda g: g["id"])
                        == sorted(groups, key=lambda g: g["id"]), "Preset changed unrelated groups or parameters")
            call("vroid_save", {"path": str(edited)})
            clean(edited)
            call("vroid_main_menu")
            call("vroid_open", {"path": str(edited)})
            clean(edited)
            cold_groups, cold_ids, cold = previous.inventory(call, label + "-cold")
            require(cold_ids == after_ids and cold == after and sorted(cold_groups, key=lambda g:g["id"])
                    == sorted(after_groups, key=lambda g:g["id"]), "Cold reopen changed preset or source groups")
            screenshot_after = call("vroid_screenshot", {"width": 960, "height": 1280})
            exporting = edited
            runner.export_options(call, False)
            response = call("vroid_export_vrm", dict(previous.EXPORT, path=str(target)))
            require(response["warnings"] == [] and response["version"] == "1.0" and response["leftExportScreen"]
                    and Path(response["path"]).resolve() == target and response["bytes"] == target.stat().st_size
                    and all(response["settings"][v] == previous.EXPORT[k] for k,v in runner.EXPORT_SETTINGS.items()),
                    "Unexpected export or option")
            clean(edited)
            exporting = None
            result = compare(vrm, target)
            report["products"][label] = {"preset": choice, "sourceEditable": ref(source), "authoredEditable": ref(edited),
                "protectedGroupCount": len(before), "protectedParameterCount": sum(len(v) for v in before.values()),
                "lipParametersCold": cold["Lip"], "nativeScreenshots": [screenshot_before, screenshot_after],
                "readback": result}
            runner.write(output / (label + "-readback.json"), report["products"][label])
            require(result["onlyFacialBaseAndShadeChanged"], "Non-facial changes or absent baked face edit; inspect result")
            call("vroid_main_menu")
        runner.write(output / "recipe.json", {"schema": "native-lip-preset-recipe-v1", "id": PRESET, "resource": RESOURCE,
            "method": "vroid_apply_preset", "arguments": {"id": PRESET, "preserve_material": False},
            "sourceStates": {k: v["sourceEditable"] for k,v in report["products"].items()},
            "export": previous.EXPORT})
    except Exception as error:
        report["failure"] = str(error)
        raise
    finally:
        try:
            runner.restore(call, None, None, owned, generated / "failure-state.vroid", exporting)
            require(all(ref(p)["sha256"] == pin for p,pin,_ in SOURCES.values()), "Source changed")
            report["restoredMainMenu"] = True
            if exit_owned:
                report["exit"] = call("vroid_exit", {"discard": False})
        finally:
            runner.write(output / "authoring.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--exit-owned-editor", action="store_true")
    args = parser.parse_args()
    produce(args.output.resolve(), args.exit_owned_editor)
