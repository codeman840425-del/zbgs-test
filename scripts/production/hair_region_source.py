"""Export an indexed color-region mask for the existing authored ponytail."""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

from flow import GLB, local, require
from production_paths import project_output, publish_new_directory


ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "hair-region-source-recipe-v1"
PINS = ("body", "asset", "styleManifest", "styleFit", "authoredSpec", "authoredAsset", "weldedRevision")


def digest(data):
    return sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def pinned(root, pin, label):
    require(set(pin) == {"path", "sha256"} and not Path(pin["path"]).is_absolute(), f"Expected a relative {label} pin")
    raw = local(root, pin["path"]).read_bytes()
    require(digest(raw) == pin["sha256"], f"{label} SHA-256 mismatch")
    return raw


def mesh(glb, primitive):
    a = primitive["attributes"]
    pos = np.array(glb.accessor(a["POSITION"]), dtype="<f4")
    uv = np.array(glb.accessor(a["TEXCOORD_0"]), dtype="<f4")
    triangles = np.array(glb.accessor(primitive["indices"]), dtype="<u4").reshape(-1, 3)
    return pos, uv, triangles


def source_image(glb, texture):
    image_index = glb.doc["textures"][texture]["source"]
    image = glb.doc["images"][image_index]
    view = glb.doc["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return image_index, glb.binary[start:start + view["byteLength"]]


def band_weights(bands, ring, divisions):
    require(set(bands) == {"root", "tip"}, "Expected root and tip bands")
    root, tip = bands["root"], bands["tip"]
    require(set(root) == {"start", "peak", "end", "linearRgbMultiplier"} and
            set(tip) == {"start", "full", "linearRgbMultiplier"}, "Unexpected band fields")
    limits = [root["start"], root["peak"], root["end"], tip["start"], tip["full"]]
    require(all(type(x) in (int, float) for x in limits) and 3 / divisions <= limits[0] < limits[1] <
            limits[2] <= limits[3] < limits[4] <= 1, "Band intervals overlap or reach the protected root rings")
    require(all(isinstance(row["linearRgbMultiplier"], list) and len(row["linearRgbMultiplier"]) == 3 and
                all(type(x) in (int, float) and 0 < x <= 2 for x in row["linearRgbMultiplier"]) and
                row["linearRgbMultiplier"] != [1, 1, 1] for row in (root, tip)), "Invalid linear RGB multiplier")

    def ease(t, start, end):
        fraction = np.clip((t - start) / (end - start), 0, 1)
        return fraction * fraction * (3 - 2 * fraction)

    t = ring / divisions
    w = np.column_stack((ease(t, root["start"], root["peak"]) * (1 - ease(t, root["peak"], root["end"])),
                         ease(t, tip["start"], tip["full"])))
    result = np.rint(w * 255).astype("uint8")
    require(result[:, 0].max() == result[:, 1].max() == 255, "Both bands need an actual fully weighted ring")
    return result


def derive_rings(authored_pos, authored_uv, pos, uv, cap_size, spec, revision):
    radial, axial = spec["radialDivisions"], spec["axialDivisions"]
    require(radial >= 3 and axial >= 8 and revision["replacedTubeSpans"] == 1, "Unsupported authored ring layout")
    end = cap_size + radial * (axial + 1)
    authored_rings = authored_uv[cap_size:end].reshape(axial + 1, radial, 2)
    u0, v0, u1, v1 = spec["texturePatchUV"]
    expected_v = np.array([v0 + (v1 - v0) * (i / axial) for i in range(axial + 1)], dtype="<f4")
    expected_u = np.array([u0 + (u1 - u0) * j / radial for j in range(radial)], dtype="<f4")
    mean_y = authored_pos[cap_size:end].reshape(axial + 1, radial, 3)[:, :, 1].mean(axis=1)
    require(np.all(authored_rings[:, :, 0] == expected_u) and np.all(authored_rings[:, :, 1] == expected_v[:, None]) and
            np.all(np.diff(mean_y) < 0), "Actual authored UV rings do not follow the descending strand")
    require(np.array_equal(authored_uv[end:end + 2, 1], expected_v[[0, -1]]), "Authored end center UVs differ")
    old_keys = {row.tobytes(): i for i, row in enumerate(np.column_stack((authored_pos, authored_uv)))}
    current_keys = [row.tobytes() for row in np.column_stack((pos, uv))]
    require(len(old_keys) == len(authored_pos) and len(set(current_keys)) == len(pos) and
            all(key in old_keys for key in current_keys), "Welded mesh vertices do not map uniquely to the authored mesh")
    mapped = np.array([old_keys[key] for key in current_keys])
    strand = np.sort(mapped[mapped >= cap_size])
    require(np.array_equal(strand, np.r_[cap_size + radial:end, end + 1]) and
            np.count_nonzero(mapped < cap_size) == cap_size - 1, "Unexpected surviving cap or strand vertices")
    rings = np.full(len(mapped), -1, dtype=int)
    selected = mapped >= cap_size
    rings[selected] = np.minimum((mapped[selected] - cap_size) // radial, axial)
    return rings, mean_y, expected_v


def source_protection(body, hair_image):
    roles = {"eyebrow": ("_FaceBrow_",), "eye": ("_Eye", "_FaceEyeline_", "_FaceEyelash_"),
             "skin": ("_SKIN",), "mouth": ("_FaceMouth_",)}
    rows = {}
    used = {p["material"] for m in body.doc["meshes"] for p in m["primitives"]}
    for role, tags in roles.items():
        rows[role] = []
        for i in sorted(used):
            material = body.doc["materials"][i]
            if not any(tag in material["name"] for tag in tags):
                continue
            legacy = body.doc["extensions"]["VRM"]["materialProperties"][i]["textureProperties"]
            slots = {key: source_image(body, legacy[key]) for key in ("_MainTex", "_ShadeTexture") if key in legacy}
            require(slots and all(image != hair_image for image, _ in slots.values()), f"Hair bitmap aliases {role}")
            rows[role].append({"material": material["name"], "index": i,
                               "maps": {key: {"image": image, "sha256": digest(raw)} for key, (image, raw) in slots.items()}})
        require(rows[role], f"No actual {role} surface was found")
    return rows


def witnesses(pos, uv, tris, weights, cap_uv, raw_png, bands):
    rgba = np.asarray(Image.open(BytesIO(raw_png)).convert("RGBA"))
    geometry = pos[tris]
    back = np.cross(geometry[:, 1] - geometry[:, 0], geometry[:, 2] - geometry[:, 0])[:, 2] > 0
    edges = np.roll(cap_uv, -1, axis=1) - cap_uv
    cap_area = edges[:, 0, 0] * edges[:, 1, 1] - edges[:, 0, 1] * edges[:, 1, 0]
    samples = []
    for channel, band in enumerate(("root", "tip")):
        eligible = np.flatnonzero(back & np.all(weights[tris, channel] >= 190, axis=1))
        require(len(eligible) > 0, f"No outward {band} triangle with actual band coverage")
        for i in eligible:
            corners = tris[i]
            center = uv[corners].mean(0)
            delta = center - cap_uv
            cross = edges[:, :, 0] * delta[:, :, 1] - edges[:, :, 1] * delta[:, :, 0]
            shared = np.flatnonzero((abs(cap_area) > 1e-8) & (np.all(cross >= 0, axis=1) | np.all(cross <= 0, axis=1)))
            if len(shared):
                break
        require(len(shared) > 0, f"Expected actual {band} atlas overlap with protected hair cap")
        pixel = np.floor(center * np.array([rgba.shape[1], rgba.shape[0]])).astype(int)
        value = rgba[pixel[1], pixel[0]]
        require(value[3] == 255 and np.any(value[:3] > 0), f"Expected opaque real {band} source sample")
        weight = weights[corners, channel].mean().item() / 255
        strength = 1 + weight * (np.array(bands[band]["linearRgbMultiplier"]) - 1)
        srgb = value[:3] / 255
        linear = np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)
        colored = linear * strength
        require(np.max(abs(colored - linear)) > .03, f"No meaningful sampled {band} color change")
        samples.append({"band": band, "triangle": int(i), "vertices": corners.tolist(), "uv": center.tolist(),
                        "headLocalM": geometry[i].mean(0).tolist(), "texelXY": pixel.tolist(), "sourceRgba": value.tolist(),
                        "mixWeightAtCentroid": weight, "linearRgbMultiplierAtCentroid": strength.tolist(),
                        "sourceTexelLinearRgb": linear.tolist(), "illustrativeTintedTexelLinearRgb": colored.tolist(),
                        "overlappingProtectedOriginalHairTriangles": shared.tolist()})
    return samples


def make_plan(recipe_bytes, *, root=ROOT):
    spec = json.loads(recipe_bytes)
    require(set(spec) == {"schema", "id", "bands", *PINS} and spec["schema"] == SCHEMA, "Unknown region recipe")
    require(isinstance(spec["id"], str) and re.fullmatch(r"[a-z][a-z0-9-]{1,79}", spec["id"]), "Invalid region recipe ID")
    source = {key: pinned(root, spec[key], key) for key in PINS}
    body, asset, reference = (GLB(source[key]) for key in ("body", "asset", "authoredAsset"))
    manifest, fit, authored, revision = (json.loads(source[key]) for key in
                                        ("styleManifest", "styleFit", "authoredSpec", "weldedRevision"))
    body_sha, asset_sha = spec["body"]["sha256"], spec["asset"]["sha256"]
    require(manifest["id"] == fit["styleId"] == authored["id"] == revision["styleId"] == "female-ponytail-v1" and
            manifest["version"] == fit["version"] == revision["version"] == 2 and
            manifest["fit"]["sha256"] == spec["styleFit"]["sha256"] and
            manifest["fit"]["id"] == fit["id"] and manifest["compatibleBodies"] == [body_sha] and
            body_sha == fit["targetBodySha256"] == authored["source"]["sha256"] and
            asset_sha == manifest["sha256"] == fit["assetSha256"] and
            revision["sourceAssetSha256"] == spec["authoredAsset"]["sha256"], "Body, style, fit or authored revision identity differs")
    name = manifest["sourceMaterial"]
    require(name == fit["sourceMaterial"] == authored["sourceMaterial"], "Source material differs")
    base_hair, = [p for m in body.doc["meshes"] for p in m["primitives"] if body.doc["materials"][p["material"]]["name"] == name]
    _, cap_uv, cap_tris = mesh(body, base_hair)
    hair, = [p for m in asset.doc["meshes"] for p in m["primitives"]]
    old_hair, = [p for m in reference.doc["meshes"] for p in m["primitives"]]
    require(asset.doc["materials"][hair["material"]]["name"] == reference.doc["materials"][old_hair["material"]]["name"] == name,
            "Expected one authored hair primitive with its exact material")
    pos, uv, tris = mesh(asset, hair)
    original_p, original_uv, _ = mesh(reference, old_hair)
    rings, mean_y, expected_v = derive_rings(original_p, original_uv, pos, uv, len(np.unique(cap_tris)), authored, revision)
    weights = band_weights(spec["bands"], rings, authored["axialDivisions"])
    cap_faces = np.any(rings[tris] < 0, axis=1)
    require(np.all(weights[rings <= 3] == 0) and np.all(weights[tris[cap_faces]] == 0) and
            not np.any(np.all(weights > 0, axis=1)), "Color reaches the protected cap, join or crosses bands")
    body_material = body.doc["materials"][base_hair["material"]]
    body_img, raw_png = source_image(body, body_material["pbrMetallicRoughness"]["baseColorTexture"]["index"])
    _, replacement_png = source_image(asset, asset.doc["materials"][hair["material"]]["pbrMetallicRoughness"]["baseColorTexture"]["index"])
    require(raw_png == replacement_png, "Published hair uses a different author bitmap")
    details = witnesses(pos, uv, tris, weights, cap_uv[cap_tris], raw_png, spec["bands"])
    mask = weights.tobytes()
    document = {"schema": "hair-region-source-v1", "id": spec["id"], "recipeSha256": digest(recipe_bytes),
                "bodySha256": body_sha, "styleId": manifest["id"], "styleVersion": manifest["version"],
                "styleManifestSha256": spec["styleManifest"]["sha256"], "fitSha256": spec["styleFit"]["sha256"],
                "assetSha256": asset_sha, "mesh": 0, "primitive": 0, "material": name,
                "vertices": len(pos), "triangles": len(tris),
                "streams": {"positionFloat32Le": digest(pos.tobytes()), "uvFloat32Le": digest(uv.tobytes()),
                            "triangleIndicesUint32Le": digest(tris.tobytes())},
                "mask": {"file": "mask.rg8", "sha256": digest(mask), "bytes": len(mask),
                         "format": "normalized-uint8x2-in-primitive-vertex-order", "channels": ["root", "tip"]},
                "bands": spec["bands"], "sourceHairBasePngSha256": digest(raw_png), "runtimeAccepted": False}
    report = {"schema": "hair-region-source-readback-v1", "verticesWithRootWeight": int(np.count_nonzero(weights[:, 0])),
              "verticesWithTipWeight": int(np.count_nonzero(weights[:, 1])), "protectedCapVertices": int(np.sum(rings < 0)),
              "protectedCapOrWeldFaces": int(np.sum(cap_faces)), "protectedRings": [1, 2, 3],
              "authoredRingV": expected_v.tolist(), "authoredRingCenterYHeadLocalM": mean_y.tolist(),
              "protectedSourceMaterialMaps": source_protection(body, body_img), "actualUvTriangleWitnesses": details,
              "scope": "Author mesh/UV and source image readback only. No texture changes, rendering or runtime admission."}
    return {"manifest.json": encode(document), "mask.rg8": mask, "readback.json": encode(report)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recipe", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    dest = project_output(args.output, __file__)
    require(not dest.exists(), "Output already exists")
    files = make_plan(args.recipe.read_bytes())
    dest.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".hair-region-", dir=dest.parent) as tmp:
        stage = Path(tmp) / "region"
        stage.mkdir()
        for name, data in files.items():
            (stage / name).write_bytes(data)
        publish_new_directory(stage, dest)
    print(json.dumps({"maskSha256": digest(files["mask.rg8"]), "manifestSha256": digest(files["manifest.json"])}))


if __name__ == "__main__":
    main()
