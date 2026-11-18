"""Recheck both baked native lip exports and their actual change footprints without VRoid."""
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
from author import ROOT, compare, ref, require, runner, skin
import numpy as np

def recheck(folder):
    author = json.loads((folder / "authoring.json").read_bytes())
    require(set(author["products"]) == {"original", "warm"} and author["restoredMainMenu"]
            and author["exit"]["ok"] and not author.get("failure"), "Authoring session incomplete")
    products = {}
    masks, atlases = {}, {}
    for tone, product in author["products"].items():
        r = product["readback"]
        old, new = [ROOT / r[k]["path"] for k in ("source", "authored")]
        require(compare(old, new) == r and r["onlyFacialBaseAndShadeChanged"], "Export readback differs")
        require(product["protectedGroupCount"] == 38 and product["protectedParameterCount"] == 240 and
                ref(ROOT / product["authoredEditable"]["path"]) == product["authoredEditable"], "Editable evidence differs")
        face_pair = [skin.skin_surface(skin.native.reader.GLB(path), skin.FACE)[1] for path in (old, new)]
        before, after = [skin.texel_data(png) for png in face_pair]
        mask = np.any(before[..., :3] != after[..., :3], axis=2)
        masks[tone], atlases[tone] = mask, after
        image, = [row for row in r["images"] if row["details"] == "material"]
        products[tone] = {"readback": ref(folder / (tone + "-readback.json")), "faceSource": skin.sha(face_pair[0]),
                          "faceOutput": skin.sha(face_pair[1]), "changedRgbPixels": int(mask.sum()),
                          "rgbBoundsInclusive": image["rgbBoundsInclusive"], "changedAlphaPixels": image["alphaChanges"],
                          "mouthPngSha256": r["mouthImage"]["authoredSha256"]}
    a, b = masks["original"], masks["warm"]
    return {"schema": "native-facecontour-lip-pair-verification-v1",
            "recipe": ref(folder / "recipe.json"), "authoring": ref(folder / "authoring.json"), "states": products,
            "footprints": {"overlap": int(np.count_nonzero(a & b)), "onlyOriginal": int(np.count_nonzero(a & ~b)),
                           "onlyWarm": int(np.count_nonzero(b & ~a))},
            "bakedLipPixelsDistinctBetweenTones": int(np.count_nonzero(
                np.any(atlases["original"] != atlases["warm"], axis=2) & (a | b))),
            "scope": "Two whole baked face textures bound to their own source tone; protected intraoral material, "
                     "geometry and morph buffers verified by paired exports. No new blend mode or arbitrary lip color."}

if __name__ == "__main__":
    folder = Path(__file__).resolve().parent
    result = recheck(folder)
    path = folder / "pair-readback.json"
    if path.exists():
        require(json.loads(path.read_bytes()) == result, "Recorded pair readback differs")
    else:
        runner.write(path, result)
    print(json.dumps(result, ensure_ascii=False))
