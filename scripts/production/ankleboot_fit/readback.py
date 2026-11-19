"""Measure the open boot rims against the target shin and long pants at bind pose."""

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flow import GLB, ROOT, require
from native_import import digest
from native_mesh_budget import accessor
from production_paths import project_output
from surfaces import triangles


def rim_vertices(pos, indices):
    geom, ids = np.unique(pos, axis=0, return_inverse=True)
    welded = ids[indices]
    edges = Counter(
        tuple(sorted((int(a), int(b)))) for face in welded for a, b in zip(face, np.roll(face, -1))
    )
    adj = defaultdict(set)
    for (a, b), n in edges.items():
        if n == 1:
            adj[a].add(b)
            adj[b].add(a)
    require(all(len(row) == 2 for row in adj.values()), "Non-manifold opening")
    unseen = set(adj)
    rings = []
    while unseen:
        start = min(unseen)
        ring = [start]
        unseen.remove(start)
        cur = start
        while remaining := adj[cur] & unseen:
            cur = min(remaining)
            unseen.remove(cur)
            ring.append(cur)
        require(start in adj[cur], "Unclosed rim")
        rings.append(geom[ring])
    require(sorted(len(r) for r in rings) == [22, 22], "Expected two open authored cuffs")
    return rings


def first_surface(origin, direction, tris):
    edge1, edge2 = tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]
    p = np.cross(direction, edge2)
    det = (edge1 * p).sum(axis=1)
    inv = np.divide(1.0, det, out=np.zeros_like(det), where=abs(det) > 1e-12)
    offset = origin - tris[:, 0]
    q = np.cross(offset, edge1)
    u = (offset * p).sum(axis=1) * inv
    v = q @ direction * inv
    distance = (edge2 * q).sum(axis=1) * inv
    selected = np.sort(distance[(abs(det) > 1e-12) & (u >= 0) & (v >= 0) & (u + v <= 1) & (distance > 0)])
    if not len(selected):
        return None
    hits = selected[np.r_[True, np.diff(selected) > 1e-6]]
    return float(hits[0]) if len(hits) % 2 == 1 else None


def radial_gaps(rim, others):
    mean = rim.mean(axis=0)
    boundary = {}
    for name, tris in others.items():
        same = tris[tris[:, :, 0].mean(axis=1) * mean[0] > 0]
        gaps = []
        for vertex in rim:
            origin = np.array([mean[0], vertex[1], mean[2]])
            delta = vertex - origin
            radius = float(np.linalg.norm(delta))
            distance = first_surface(origin, delta / radius, same)
            if distance is not None:
                gaps.append((radius - distance) if name == "bareShin" else (distance - radius))
        boundary[name] = {
            "valid": len(gaps),
            "outsideLayerOrder": int(np.count_nonzero(np.asarray(gaps) < 0)),
            "minSignedClearanceM": min(gaps) if gaps else None,
            "maxSignedClearanceM": max(gaps) if gaps else None,
        }
    return dict(
        vertexCount=len(rim),
        centerXYZ=mean.tolist(),
        minXYZ=rim.min(axis=0).tolist(),
        maxXYZ=rim.max(axis=0).tolist(),
        boundary=boundary,
    )


def neutral_skin_error(glb, attrs):
    doc = glb.doc
    translations = {}

    def walk(i, parent):
        n = doc["nodes"][i]
        require(
            "matrix" not in n
            and n.get("rotation", [0, 0, 0, 1]) == [0, 0, 0, 1]
            and n.get("scale", [1, 1, 1]) == [1, 1, 1],
            "Unsupported rest transform",
        )
        translations[i] = parent + np.array(n.get("translation", [0, 0, 0]))
        for child in n.get("children", []):
            walk(child, translations[i])

    for root in doc["scenes"][doc["scene"]]["nodes"]:
        walk(root, np.zeros(3))
    joints = accessor(glb, attrs["JOINTS_0"])
    weights = accessor(glb, attrs["WEIGHTS_0"]).astype(float)
    pos = accessor(glb, attrs["POSITION"]).astype(float)
    results = np.zeros_like(pos)
    (skin,) = doc["skins"]
    inv = accessor(glb, skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    for slot, i in enumerate(skin["joints"]):
        world = np.eye(4)
        world[:3, 3] = translations[i]
        matrix = world @ inv[slot]
        strength = (weights * (joints == slot)).sum(axis=1)
        results += strength[:, None] * (pos @ matrix[:3, :3].T + matrix[:3, 3])
    return float(np.linalg.norm(results - pos, axis=1).max())


def main():
    evidence = ROOT / "evidence/m2-footwear-author-intake-v1"
    out = project_output(evidence / "target-readback.json", __file__)
    require(out == evidence / "target-readback.json", "Redirected audit")
    pack = ROOT / "assets-source/ankle-boot-fit-v1/generated"
    report = json.loads((pack / "fit-report.json").read_bytes())

    def read(asset, sha):
        raw = asset.read_bytes()
        require(digest(raw) == sha, "Mesh differs: " + str(asset))
        return GLB(raw)

    boot = read(pack / "toigo-cc0-male-ankle-boot-fit-v1.glb", report["assetSha256"])
    body = read(ROOT / report["body"][0], report["body"][1])
    pants = read(ROOT / report["pants"][0], report["pants"][1])
    body_tris = np.concatenate(
        [
            triangles(body, p)
            for p in body.doc["meshes"][1]["primitives"]
            if "Body_00_SKIN" in body.doc["materials"][p["material"]]["name"]
        ]
    )
    others = {"bareShin": body_tris, "pants": triangles(pants, pants.doc["meshes"][0]["primitives"][0])}
    prim = boot.doc["meshes"][0]["primitives"][0]
    attrs = prim["attributes"]
    rings = rim_vertices(accessor(boot, attrs["POSITION"]), accessor(boot, prim["indices"]).reshape(-1, 3))
    measured = {
        "schema": "ankleboot-target-cuff-readback-v1",
        "assetSha256": report["assetSha256"],
        "maxNeutralSkinnedDisplacementM": neutral_skin_error(boot, attrs),
        "method": "At each welded cuff vertex height, cast outward from the horizontal cuff center to the body and trousers. Accept an odd crossing count on the same side, use the first surface. Positive radial clearance means bare skin < cuff < outer trousers. This is a directional rest-pose measurement.",
        "cuffs": {"left" if r[:, 0].mean() < 0 else "right": radial_gaps(r, others) for r in rings},
    }
    require(measured["maxNeutralSkinnedDisplacementM"] < 1e-6, "Neutral skin drift")
    raw = (json.dumps(measured, indent=2, allow_nan=False) + "\n").encode()
    if out.exists():
        require(out.read_bytes() == raw, "Existing readback differs")
    else:
        with out.open("xb") as f:
            f.write(raw)
    print(raw.decode())


if __name__ == "__main__":
    main()
