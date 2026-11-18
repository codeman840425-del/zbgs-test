"""Read-only VRM1 mouth anchors for the native microphone candidate.

The result is a source contract only.  It records the welded lip seam, its
FaceMouth AA morph displacement, and the adjacent Face_SKIN normal.  It does
not modify a VRM, solve a microphone pose, or register a runtime accessory.
"""
import argparse, importlib.util, json, pathlib, numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIT = ROOT / "scripts/native-live-accessory-fit-v1/fit.py"
spec = importlib.util.spec_from_file_location("native_grip_fit", FIT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

SOURCES = {
    "female": ROOT / "assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm",
    "male": ROOT / "assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm",
}

def worlds(g):
    parents = {child: i for i, node in enumerate(g.doc["nodes"])
               for child in node.get("children", [])}
    cache = {}
    def at(i):
        if i not in cache:
            cache[i] = ((at(parents[i]) if i in parents else np.eye(4))
                        @ mod.transform(g.doc["nodes"][i]))
        return cache[i]
    return np.array([at(i) for i in range(len(g.doc["nodes"]))])

def skin(g, primitive, ids, world, mesh_index, delta=None):
    node = next(n for n in g.doc["nodes"] if n.get("mesh") == mesh_index)
    skin_doc = g.doc["skins"][node["skin"]]
    inverse = g.acc(skin_doc["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    palette = world[skin_doc["joints"]] @ inverse
    points = g.acc(primitive["attributes"]["POSITION"])[ids].astype(float)
    if delta is not None:
        points = points + delta[ids]
    joints = g.acc(primitive["attributes"]["JOINTS_0"])[ids]
    weights = g.acc(primitive["attributes"]["WEIGHTS_0"])[ids]
    weights = weights / weights.sum(1, keepdims=True)
    result = np.zeros((len(ids), 3))
    for k in range(4):
        result += np.einsum("nij,nj->ni", palette[joints[:, k]][:, :3, :],
                            np.c_[points, np.ones(len(points))]) * weights[:, k, None]
    return result

def measure(g):
    """Find the welded mouth boundary and measure its adjoining referenced facial skin."""
    doc = g.doc
    world = worlds(g)
    human = {name: item["node"] for name, item in
             doc["extensions"]["VRMC_vrm"]["humanoid"]["humanBones"].items()}
    head = human["head"]
    mesh_index = next(i for i, m in enumerate(doc["meshes"])
                      if any("FaceMouth" in doc["materials"][p["material"]]["name"]
                             for p in m["primitives"]))
    mesh = doc["meshes"][mesh_index]
    mouth = next(p for p in mesh["primitives"]
                 if "FaceMouth" in doc["materials"][p["material"]]["name"])
    face = next(p for p in mesh["primitives"]
                if "_Face_" in doc["materials"][p["material"]]["name"]
                and "SKIN" in doc["materials"][p["material"]]["name"])
    positions = g.acc(mouth["attributes"]["POSITION"]).astype(float)
    triangles = g.acc(mouth["indices"]).reshape(-1, 3)
    mouth_ids = np.unique(triangles)
    face_triangles = g.acc(face["indices"]).reshape(-1, 3)
    face_ids = np.unique(face_triangles)
    face_positions = g.acc(face["attributes"]["POSITION"])[face_ids].astype(float)
    welded = {}
    groups = []
    mapping = {}
    for i in mouth_ids:
        key = tuple(np.round(positions[i], 7))
        group = welded.setdefault(key, len(groups))
        if group == len(groups):
            groups.append([])
        groups[group].append(int(i))
        mapping[int(i)] = group
    welded_triangles = np.array([[mapping[int(v)] for v in tri] for tri in triangles])
    edges = {}
    for tri in welded_triangles:
        for a, b in zip(tri, np.roll(tri, -1)):
            edge = tuple(sorted((int(a), int(b))))
            edges[edge] = edges.get(edge, 0) + 1
    adjacency = {}
    for (a, b), count in edges.items():
        if count == 1:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)
    loops = []
    while adjacency:
        first = next(iter(adjacency))
        seen, todo = {first}, [first]
        while todo:
            for nxt in adjacency[todo.pop()]:
                if nxt not in seen:
                    seen.add(nxt)
                    todo.append(nxt)
        ids = [groups[i][0] for i in sorted(seen)]
        seam = positions[ids]
        distance = np.linalg.norm(seam[:, None, :] - face_positions[None, :, :], axis=2).min(1)
        loops.append({"ids": ids, "count": len(ids),
                      "skinCoincidenceMaxMetres": float(distance.max())})
        for item in seen:
            del adjacency[item]
    eligible = [loop for loop in loops if loop["skinCoincidenceMaxMetres"] < 1e-6]
    if len(eligible) != 1 or eligible[0]["count"] != 32:
        raise ValueError(f"expected one 32-point FaceMouth seam, got {[(x['count'], x['skinCoincidenceMaxMetres']) for x in loops]}")
    ring_ids = eligible[0]["ids"]
    inverse_head = np.linalg.inv(world[head])
    def head_local(points):
        return (np.c_[points, np.ones(len(points))] @ inverse_head.T)[:, :3]
    neutral = head_local(skin(g, mouth, ring_ids, world, mesh_index))
    preset = doc["extensions"]["VRMC_vrm"]["expressions"]["preset"]
    aa_bind, = preset["aa"]["morphTargetBinds"]
    if doc["nodes"][aa_bind["node"]].get("mesh") != mesh_index or aa_bind["weight"] != 1:
        raise ValueError("Expected a full-weight aa bind on the measured mouth mesh")
    aa_index = aa_bind["index"]
    aa_delta = g.acc(mouth["targets"][aa_index]["POSITION"])
    aa_points = head_local(skin(g, mouth, ring_ids, world, mesh_index, aa_delta))
    # Face and mouth may have separate vertex numbering even within a single skin.
    ring_points = positions[ring_ids]
    near = np.linalg.norm(face_positions[:, None, :] - ring_points[None, :, :], axis=2).min(1) < 1e-6
    adjacent = face_triangles[np.any(np.isin(face_triangles, face_ids[near]), axis=1)]
    used, mapping = np.unique(adjacent, return_inverse=True)
    points = head_local(skin(g, face, used, world, mesh_index))[mapping.reshape(adjacent.shape)]
    cross = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
    normal = cross.sum(0)
    norm = np.linalg.norm(normal)
    if not np.isfinite(norm) or norm <= 1e-12:
        raise ValueError("Expected a nondegenerate adjacent Face_SKIN surface")
    normal = normal / norm
    return {
        "rawHeadNode": head,
        "rawHeadName": doc["nodes"][head].get("name"),
        "meshIndex": mesh_index,
        "mouthMaterial": doc["materials"][mouth["material"]]["name"],
        "faceMaterial": doc["materials"][face["material"]]["name"],
        "method": "Unique welded FaceMouth boundary loop coincident with actual Face_SKIN surface",
        "boundaryComponents": loops,
        "rimVertexIds": ring_ids,
        "mouthRawHeadLocal": neutral.mean(0).tolist(),
        "neutralRimRawHeadLocal": neutral.tolist(),
        "neutralRimAABB": [neutral.min(0).tolist(), neutral.max(0).tolist()],
        "aaMorphIndex": aa_index,
        "aaMouthRawHeadLocal": aa_points.mean(0).tolist(),
        "aaRimAABB": [aa_points.min(0).tolist(), aa_points.max(0).tolist()],
        "adjacentFaceAreaWeightedNormalRawHeadLocal": normal.tolist(),
        "limits": ["Static native VRM1 source and aa morph only; no browser/visual microphone acceptance.",
                    "Mouth anchor is neutral lip-rim centroid; aa displacement is retained separately.",
                    "This does not prove microphone grille clearance, speech ergonomics, or runtime mapping."]
    }


def one(body, source_path=None, output_name=None):
    out = (ROOT / "assets-source/native-live-accessory-fit-v1" / (output_name or f"{body}-mouth.json")).resolve()
    if not out.is_relative_to(ROOT.resolve()):
        raise ValueError("Mouth evidence must stay inside the project")
    path = (ROOT / source_path if source_path else SOURCES[body]).resolve()
    g = mod.GLB(path)
    row = {"schema": "native-live-accessory-mouth-v1", "body": body, "avatarSha256": g.sha,
           "source": path.relative_to(ROOT).as_posix(), **measure(g)}
    try:
        # Historical Windows production JSON pins include CRLF.
        with out.open("x", encoding="utf8", newline="\r\n") as stream:
            stream.write(json.dumps(row, indent=2, allow_nan=False) + "\n")
    except FileExistsError:
        if json.loads(out.read_bytes()) != row:
            raise ValueError(f"Existing mouth evidence differs; choose a new output path: {out}")
    return row

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--body", choices=["female", "male", "both"], default="both")
    parser.add_argument("--source", help="optional native VRM1 path for one body")
    parser.add_argument("--output", help="optional output filename when --source is used")
    args = parser.parse_args()
    selected = ["female", "male"] if args.body == "both" else [args.body]
    rows = [one(body, args.source if args.source and len(selected) == 1 else None, args.output if args.output and len(selected) == 1 else None) for body in selected]
    print(json.dumps({"rows": [{k: row[k] for k in ("body", "avatarSha256", "meshIndex", "mouthRawHeadLocal", "aaMorphIndex", "aaMouthRawHeadLocal")} for row in rows]}, indent=2))
