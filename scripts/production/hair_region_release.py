"""Publish an immutable palette and verified root/tip weights on the existing fitted hair."""
import argparse
import json
import math
from pathlib import Path
import re
from tempfile import TemporaryDirectory

import hair_region_source as regions
from flow import require
from native_import import exact_directory
from production_paths import project_output, publish_new_directory

ROOT = Path(__file__).resolve().parents[2]
RECIPE = ROOT / "assets-source/hair-region-release-v1/recipe.json"


def make_plan(recipe, root=ROOT):
    fields = {"schema", "id", "version", "label", "assetDirectory", "sourceRegions", "sourceProvenance",
              "rootLinearRgb", "tipLinearRgb"}
    require(set(recipe) == fields and recipe["schema"] == "hair-region-release-recipe-v1", "Invalid colorway recipe")
    style, version, label, directory = (recipe[key] for key in ("id", "version", "label", "assetDirectory"))
    require(type(version) is int and version >= 1 and isinstance(style, str)
            and re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v" + str(version), style)
            and isinstance(label, str) and bool(label.strip()), "Invalid versioned style or label")
    require(isinstance(directory, str) and re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v" + str(version), directory),
            "Invalid versioned asset directory")
    palette = {"schema": "hair-region-palette-v1"}
    for key in ("rootLinearRgb", "tipLinearRgb"):
        channels = recipe[key]
        require(isinstance(channels, list) and len(channels) == 3
                and all(type(v) in (int, float) and math.isfinite(v) and v >= 0 for v in channels),
                "Expected three finite nonnegative linear RGB multipliers")
        palette[key] = channels

    provenance = json.loads(regions.pinned(root, recipe["sourceProvenance"], "region provenance"))
    require(provenance["schema"] == "hair-region-provenance-v1" and provenance["license"] == "CC0-1.0",
            "Invalid region provenance")
    for pin in provenance["sourceRecords"]:
        regions.pinned(root, pin, "author source")
    source_bytes = regions.pinned(root, recipe["sourceRegions"], "region recipe")
    spec = json.loads(source_bytes)
    built = regions.make_plan(source_bytes, root=root)
    source = json.loads(regions.pinned(root, spec["styleManifest"], "source style"))
    fit = json.loads(regions.pinned(root, spec["styleFit"], "source fit"))
    require(spec["styleManifest"]["path"] == "prototype/public/assets/m2-long-hair-rootjoin-v2/manifest.json"
            and spec["asset"]["path"] == "prototype/public" + source["url"]
            and spec["styleFit"]["path"] == "prototype/public" + source["fit"]["url"]
            and style != source["id"], "Source URLs or style identity differ")
    files = {"regions.json": built["manifest.json"], "mask.rg8": built["mask.rg8"],
             "palette.json": regions.encode(palette)}
    base = "/assets/" + directory + "/"

    def pin(name):
        raw = files[name]
        return {"url": base + name, "sha256": regions.digest(raw), "bytes": len(raw)}

    region_colorway = {
        "sourceStyle": {"id": source["id"], "version": source["version"], "manifestSha256": spec["styleManifest"]["sha256"],
                        "fitSha256": spec["styleFit"]["sha256"]},
        "regions": pin("regions.json"), "palette": pin("palette.json"),
    }
    fit_id = style.rsplit("-v", 1)[0] + "-fit-v" + str(version)
    files["fit.json"] = regions.encode({**fit, "id": fit_id, "version": version, "styleId": style,
                                        "regionColorway": region_colorway})
    fit_ref = {"id": fit_id, "version": version, "url": base + "fit.json", "sha256": regions.digest(files["fit.json"])}
    files["manifest.json"] = regions.encode({**source, "id": style, "version": version, "label": label,
                                             "fit": fit_ref, "regionColorway": region_colorway})
    files["catalog.json"] = regions.encode([{
        "id": style, "label": label, "manifestUrl": base + "manifest.json",
        "manifestSha256": regions.digest(files["manifest.json"]), "assetSha256": source["sha256"],
        "sourceBodySha256": fit["sourceBodySha256"], "sourceMaterial": source["sourceMaterial"],
        "compatibleBodies": source["compatibleBodies"], "legacyImplicitFit": False, "fit": fit_ref,
    }])
    return files


def publish(recipe_path, output, source_root=ROOT):
    dest = project_output(output, __file__)
    recipe = json.loads(recipe_path.read_bytes())
    files = make_plan(recipe, root=source_root)
    if dest.is_relative_to(ROOT / "prototype/public"):
        require(dest == ROOT / "prototype/public/assets" / recipe["assetDirectory"], "Published URL differs from output")
    if dest.exists():
        exact_directory(dest, files)
        return "reused-identical"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".hair-colorway-", dir=dest.parent) as tmp:
        stage = Path(tmp) / "release"
        stage.mkdir()
        for name, raw in files.items():
            (stage / name).write_bytes(raw)
        try:
            publish_new_directory(stage, dest)
        except FileExistsError:
            exact_directory(dest, files)
            return "reused-identical"
    return "published"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, default=ROOT)
    args = parser.parse_args()
    print(publish(args.recipe, args.output, args.source_root.resolve(strict=True)))
