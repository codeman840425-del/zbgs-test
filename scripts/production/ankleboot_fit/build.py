"""Build the fixed CPU ankle-boot fit and its rest-surface audit. No public install."""

import argparse
import copy
import io
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flow import GLB, ROOT, require
from native_import import digest
from native_mesh_budget import accessor, encode
from production_paths import project_output, publish_new_directory
from donor import read_donor
from surfaces import crossings, section, triangles

SOURCE = ROOT / "assets-source/ankle-boot-fit-v1"


def pinned(path, sha):
    require(digest(path.read_bytes()) == sha, "Source differs: " + str(path))
    return path


def measure_frame(points, joints):
    origin = joints["ankle"]
    forward = joints["ball"] - origin
    forward[1] = 0
    forward /= np.linalg.norm(forward)
    basis = np.column_stack((np.cross([0, 1, 0], forward), [0, 1, 0], forward))
    local = (points - origin) @ basis
    low = local[local[:, 1] <= 0]
    z = [low[:, 2].min(), 0.0, (joints["ball"] - origin) @ forward, low[:, 2].max()]
    y = [local[:, 1].min(), joints["ball"][1] - origin[1], 0.0, joints["knee"][1] - origin[1]]
    require(np.all(np.diff(z) > 0) and np.all(np.diff(y) > 0), "Inverted foot landmarks")
    return dict(basis=basis, origin=origin, z=np.array(z), y=np.array(y), local=local)


def remap(x, a, b):
    i = np.searchsorted(a[1:-1], x)
    return b[i] + (x - a[i]) * (b[i + 1] - b[i]) / (a[i + 1] - a[i])


def fit_boot(pos, faces, skin, names, donor, flat, flat_tri, target, body_tri, pants_tri):
    output = np.empty_like(pos)
    report = {}
    for side, sign in [("l", 1), ("r", -1)]:
        own = pos[:, 0] * sign > 0
        opposing = [i for i, n in enumerate(names) if not n.endswith("_" + side)]
        require(not skin[own][:, opposing].any(), "Contralateral donor weight")
        tar_tri = flat_tri[flat_tri[:, :, 0].mean(axis=1) * sign < 0]
        original = flat[flat[:, 0] * sign < 0]
        src, dst = measure_frame(pos[own], donor[side]), measure_frame(original, target[side])
        source_tri = (pos[faces[(pos[faces][:, :, 0].mean(axis=1) * sign) > 0]] - src["origin"]) @ src[
            "basis"
        ]
        target_tri = (tar_tri - dst["origin"]) @ dst["basis"]
        # Sample the widths on each ball plane. Convert forward Z to section Y.
        sx = section(source_tri[:, :, [0, 2, 1]], src["z"][2])["widthM"]
        tx = section(target_tri[:, :, [0, 2, 1]], dst["z"][2])["widthM"]
        q = src["local"].copy()
        q[:, 0] *= tx / sx
        q[:, 1] = remap(q[:, 1], src["y"], dst["y"])
        q[:, 2] = remap(q[:, 2], src["z"], dst["z"])
        output[own] = q @ dst["basis"].T + dst["origin"]
        fitted = output[own]
        boot_tri = output[faces[(pos[faces][:, :, 0].mean(axis=1) * sign) > 0]]
        # The cuff is open. Use both the actual shaft top and anatomical ankle as reference planes.
        side_body = body_tri[body_tri[:, :, 0].mean(axis=1) * sign < 0]
        side_pants = pants_tri[pants_tri[:, :, 0].mean(axis=1) * sign < 0]
        report[side] = dict(
            donorJointsM={k: v.tolist() for k, v in donor[side].items()},
            targetJointsM={k: v.tolist() for k, v in target[side].items()},
            forwardAxesXYZ=[src["basis"][:, 2].tolist(), dst["basis"][:, 2].tolist()],
            heelAnkleBallTipProjectionsM={"donor": src["z"].tolist(), "target": dst["z"].tolist()},
            floorBallAnkleKneeHeightsRelativeToAnkleM={
                "donor": src["y"].tolist(),
                "target": dst["y"].tolist(),
            },
            outerBallPlaneWidthM={"donor": sx, "targetFlat": tx},
            donorFloorY=float(pos[own, 1].min()),
            targetFloorY=float(fitted[:, 1].min()),
            donorTopY=float(pos[own, 1].max()),
            targetTopY=float(fitted[:, 1].max()),
            kneeJointHeightAboveBootM=float(target[side]["knee"][1] - fitted[:, 1].max()),
            sections={},
        )
        for label, y in [
            ("ankle", target[side]["ankle"][1]),
            ("shaft", (target[side]["ankle"][1] + fitted[:, 1].max()) / 2),
            ("topInterior", fitted[:, 1].max() - 0.002),
            ("knee", target[side]["knee"][1]),
        ]:
            report[side]["sections"][label] = {
                "yM": float(y),
                "boot": section(boot_tri, y),
                "body": section(side_body, y),
                "pants": section(side_pants, y),
            }
    return output, report


def pack(flat, pos, uv, corners, skin, names, files, asset_id):
    doc = copy.deepcopy(flat.doc)
    primitive = doc["meshes"][0]["primitives"][0]
    require(
        len(doc["meshes"]) == 1 and len(doc["meshes"][0]["primitives"]) == 1,
        "Unexpected target skeleton container",
    )
    key, inv = np.unique(corners.reshape(-1, 2), axis=0, return_inverse=True)
    faces = corners[:, :, 0]
    normal = np.zeros_like(pos)
    area = np.cross(pos[faces[:, 1]] - pos[faces[:, 0]], pos[faces[:, 2]] - pos[faces[:, 0]])
    for j in range(3):
        np.add.at(normal, faces[:, j], area)
    lengths = np.linalg.norm(normal, axis=1)
    require(lengths.min() > 0, "Degenerate donor normal")
    normal /= lengths[:, None]
    source_indices = key[:, 0]
    tex = uv[key[:, 1]].copy()
    tex[:, 1] = 1 - tex[:, 1]  # OBJ origin is opposite glTF
    order = np.argsort(-skin, axis=1, kind="stable")[:, :4]
    weights = np.take_along_axis(skin, order, axis=1)
    require(np.allclose(weights.sum(axis=1), 1, rtol=0, atol=1e-6), "Influence truncation")
    target_names = [doc["nodes"][j]["name"] for j in doc["skins"][0]["joints"]]
    target_indices = []
    for n in names:
        bone, side = n.split("_")
        target_indices.append(
            target_names.index(
                "J_Bip_" + side.upper() + "_" + {"calf": "LowerLeg", "foot": "Foot", "ball": "ToeBase"}[bone]
            )
        )
    streams = {
        "POSITION": pos[source_indices].astype("<f4"),
        "NORMAL": normal[source_indices].astype("<f4"),
        "TEXCOORD_0": tex.astype("<f4"),
        "JOINTS_0": np.array(target_indices, dtype="<u2")[order][source_indices],
        "WEIGHTS_0": weights[source_indices].astype("<f4"),
    }
    values = {primitive["attributes"][name]: arr for name, arr in streams.items()}
    values[primitive["indices"]] = inv.reshape(-1, 1).astype("<u4")
    replacements = {}
    for i, arr in values.items():
        acc = doc["accessors"][i]
        acc["count"] = len(arr)
        for bound, fn in [("min", np.min), ("max", np.max)]:
            if bound in acc:
                acc[bound] = fn(arr, axis=0).tolist()
        replacements[acc["bufferView"]] = arr.tobytes()
    img = io.BytesIO()
    with Image.open(files["BootsAnkleM.png"]) as original:
        require(original.getextrema()[3] == (255, 255), "Nonopaque donor material")
        original.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS).save(img, format="PNG")
    replacements[doc["images"][0]["bufferView"]] = img.getvalue()
    doc["images"][0] = {
        "mimeType": "image/png",
        "bufferView": doc["images"][0]["bufferView"],
        "name": "MRT boots diffuse 1K",
    }
    doc["materials"][0] = {
        "name": "MRT_Ankle_Shoes",
        "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0},
        "extensions": {"KHR_materials_unlit": {}},
    }
    doc["meshes"][0]["name"] = doc["nodes"][0]["name"] = asset_id
    doc["asset"] = {"version": "2.0", "generator": "ankleboot_fit/build.py"}
    doc["extras"] = {
        "author": "MargaretToigo (MRT)",
        "sourceLicense": "CC0",
        "purpose": "offline neutral rest-fit diagnostic",
    }
    data = bytearray()
    for i, view in enumerate(doc["bufferViews"]):
        old = view.get("byteOffset", 0)
        blob = replacements.get(i, flat.binary[old : old + view["byteLength"]])
        data.extend(bytes(-len(data) % 4))
        view.update(byteOffset=len(data), byteLength=len(blob))
        data.extend(blob)
    data.extend(bytes(-len(data) % 4))
    doc["buffers"][0]["byteLength"] = len(data)
    return encode(doc, data)


def build():
    recipe = json.loads((SOURCE / "recipe.json").read_bytes())
    fixed = {}
    for key in ("authorReceipt", "donorReference", "body", "flat", "pants"):
        path, sha = recipe[key]
        fixed[key] = pinned(ROOT / path, sha)
    auth = json.loads(fixed["authorReceipt"].read_bytes())
    files = {
        r["filename"]: pinned(fixed["authorReceipt"].parent / "toigo" / r["filename"], r["sha256"])
        for r in auth["members"]
    }
    ref = json.loads(fixed["donorReference"].read_bytes())
    inputs = {}
    cache = SOURCE / ".reference-cache"
    for row in ref["referenceInputs"]:
        path = ROOT / row["path"]
        chosen = cache / path.name if cache.exists() else path
        inputs[path.name] = pinned(chosen, row["sha256"])
    pos, uv, corners, names, skin, donor = read_donor(files, inputs)
    flat, body, pants = [GLB(fixed[k].read_bytes()) for k in ("flat", "body", "pants")]
    flat_tri = triangles(flat, flat.doc["meshes"][0]["primitives"][0])
    flat_v = np.unique(flat_tri.reshape(-1, 3), axis=0)
    bp = body.doc["meshes"][1]["primitives"]
    body_tri = np.concatenate(
        [triangles(body, p) for p in bp if "Body_00_SKIN" in body.doc["materials"][p["material"]]["name"]]
    )
    pants_tri = triangles(pants, pants.doc["meshes"][0]["primitives"][0])
    target = {}
    binds = body.bind_by_name()
    require(
        all(np.allclose(m, binds[n], rtol=0, atol=1e-6) for n, m in flat.bind_by_name().items()),
        "Target shoe binds differ",
    )
    for side in ("l", "r"):
        target[side] = {
            key: np.linalg.inv(np.asarray(binds["J_Bip_" + side.upper() + "_" + bone]).reshape(4, 4).T)[:3, 3]
            for key, bone in [("ankle", "Foot"), ("ball", "ToeBase"), ("knee", "LowerLeg")]
        }
    faces = corners[:, :, 0]
    fitted, landmarks = fit_boot(
        pos, faces, skin, names, donor, flat_v, flat_tri, target, body_tri, pants_tri
    )
    raw = pack(flat, fitted, uv, corners, skin, names, files, recipe["id"])
    glb = GLB(raw)
    prim = glb.doc["meshes"][0]["primitives"][0]
    tri = triangles(glb, prim)
    require(
        np.max(abs(tri - fitted[faces])) < 1e-6 and glb.bind_by_name() == flat.bind_by_name(),
        "Export readback differs",
    )
    attrs = prim["attributes"]
    weights = accessor(glb, attrs["WEIGHTS_0"])
    joints = accessor(glb, attrs["JOINTS_0"])
    require(
        joints.max() < 6 and (weights >= 0).all() and np.allclose(weights.sum(axis=1), 1, rtol=0, atol=1e-6),
        "Invalid skin",
    )
    report = {
        "schema": "ankleboot-target-rest-fit-v1",
        "body": recipe["body"],
        "pants": recipe["pants"],
        "flatReference": recipe["flat"],
        "source": auth["asset"],
        "assetSha256": digest(raw),
        "bytes": len(raw),
        "triangles": len(tri),
        "renderVertices": len(weights),
        "landmarks": landmarks,
        "boundBones": list(glb.bind_by_name()),
        "maxNormalizedWeightSumError": float(abs(weights.sum(axis=1) - 1).max()),
        "maxPositionReadbackErrorM": float(np.max(abs(tri - fitted[faces]))),
        "maxInfluences": int((weights > 0).sum(axis=1).max()),
        "restSurfaceCrossings": {
            name: {
                part: crossings(shoe, other)
                for part, other in [("bareBody", body_tri), ("trousers", pants_tri)]
            }
            for name, shoe in [("boot", tri), ("originalFlatControl", flat_tri)]
        },
        "runtimeAccepted": False,
        "limits": [
            "Noncoplanar triangle edge crossings at the undeformed bind pose. Counts do not measure visible area, enclosed surfaces, penetration depth or motion.",
            "Unlit 1K source diffuse only for this geometry sample. The source normal and specular maps remain in the author archive.",
            "No body or trousers hidden. Walk, seated cuff, sole contact, live material rendering and recovery remain untested.",
        ],
    }
    return {
        recipe["id"] + ".glb": raw,
        "fit-report.json": (json.dumps(report, indent=2, allow_nan=False) + "\n").encode(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = SOURCE / "generated"
    out = project_output(expected, __file__)
    require(out == expected and not out.is_symlink(), "Redirected output")
    files = build()
    if not out.exists() and not args.check:
        with TemporaryDirectory(dir=out.parent, prefix=".boot-") as tmp:
            fresh = Path(tmp) / "generated"
            fresh.mkdir()
            for name, data in files.items():
                (fresh / name).write_bytes(data)
            try:
                publish_new_directory(fresh, out)
            except FileExistsError:
                pass
    require(out.is_dir() and {p.name for p in out.iterdir()} == set(files), "Missing or unexpected output")
    for name, data in files.items():
        target = project_output(out / name, __file__)
        require(target == out / name and target.read_bytes() == data, "Existing output differs: " + name)
    print(json.dumps({k: digest(v) for k, v in files.items()}))


if __name__ == "__main__":
    main()
