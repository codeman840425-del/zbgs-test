"""Verify weighted, drawn surfaces across two pinned native VRM1 exports."""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np

from native_dependency_delta import Export, node_state, read_pinned, ref
from native_garment_removal_surfaces import compare, difference, require, surfaces


def signature(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def rest_matrix(node):
    if "matrix" in node:
        require(not any(k in node for k in ("translation", "rotation", "scale")), "Node mixes matrix with TRS")
        values = np.asarray(node["matrix"], dtype=float)
        require(values.shape == (16,), "Invalid node matrix dimensions")
        matrix = values.reshape(4, 4).T.copy()
    else:
        q = np.asarray(node.get("rotation", [0, 0, 0, 1]), dtype=float)
        require(q.shape == (4,) and np.isfinite(q).all() and abs(np.linalg.norm(q) - 1) < 1e-5,
                "Invalid rest rotation")
        x, y, z, w = q
        rotation = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                             [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                             [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
        matrix = np.eye(4)
        scale, offset = (np.asarray(node.get(k, default), dtype=float)
                         for k, default in (("scale", [1, 1, 1]), ("translation", [0, 0, 0])))
        require(scale.shape == offset.shape == (3,) and np.isfinite(scale).all() and np.isfinite(offset).all(),
                "Invalid rest scale or translation")
        matrix[:3, :3] = rotation @ np.diag(scale)
        matrix[:3, 3] = offset
    require(np.isfinite(matrix).all() and np.array_equal(matrix[3], [0, 0, 0, 1])
            and np.linalg.det(matrix[:3, :3]) != 0, "Invalid rest transform")
    matrix[matrix == 0] = 0
    return matrix.tolist()


class Skeleton:
    def __init__(self, export):
        self.nodes = node_state(export)
        self.roles = {}
        for role, value in export.vrm["humanoid"]["humanBones"].items():
            name = export.name("nodes", value["node"])
            require(name not in self.roles, "Multiple humanoid roles on node " + name)
            self.roles[name] = role

    def frames(self, names):
        result = {}
        for name in names:
            seen = set()
            while name is not None:
                require(name not in seen, "Cycle in weighted joint hierarchy")
                seen.add(name)
                node = self.nodes[name]
                if name not in result:
                    result[name] = {"parent": node["parent"], "role": self.roles.get(name),
                                    "localRest": rest_matrix(node)}
                name = node["parent"]
        return result


def surface_binding(export, skeleton, row):
    sel = row["selector"]
    skin = ref(export.doc["skins"], sel["skin"])
    primitive = export.doc["meshes"][sel["mesh"]]["primitives"][sel["primitive"]]
    attrs = primitive["attributes"]
    faces = export.accessor(primitive["indices"])[0].reshape(-1, 3)
    drawn, remapped = np.unique(faces.ravel(), return_inverse=True)
    points = []
    for key, width in (("POSITION", 3), ("TEXCOORD_0", 2), ("NORMAL", 3)):
        require(key in attrs, "Missing native " + key)
        values, normalized = export.accessor(attrs[key])
        require(not normalized and values.dtype == np.dtype("<f4") and values.shape[1] == width
                and drawn[-1] < len(values), "Unsupported native " + key)
        points.append(values[drawn])
    corners = np.concatenate(points, axis=1)
    require(np.isfinite(corners).all(), "Non-finite drawn surface attribute")
    corners[corners == 0] = 0

    joint_nodes = [export.name("nodes", index) for index in skin["joints"]]
    require(len(set(joint_nodes)) == len(joint_nodes), "Duplicate joint node in skin")
    require("inverseBindMatrices" in skin, "Explicit native inverse binds required")
    matrices, normalized = export.accessor(skin["inverseBindMatrices"])
    require(not normalized and matrices.dtype == np.dtype("<f4") and matrices.shape == (len(joint_nodes), 16),
            "Invalid inverse bind table")
    fields = {k for k in attrs if k.startswith(("JOINTS_", "WEIGHTS_"))}
    count = len(fields) // 2
    require(count and fields == {f"{k}_{i}" for k in ("JOINTS", "WEIGHTS") for i in range(count)},
            "Unpaired skin influence attributes")
    slot_sets, weight_sets = [], []
    for i in range(count):
        slots, jnorm = export.accessor(attrs[f"JOINTS_{i}"])
        weights, wnorm = export.accessor(attrs[f"WEIGHTS_{i}"])
        expected = (len(export.accessor(attrs["POSITION"])[0]), 4)
        require(slots.shape == weights.shape == expected and not jnorm and slots.dtype.kind == "u" and slots.itemsize <= 2,
                "Invalid joint/weight stream layout")
        if wnorm:
            require(weights.dtype.kind == "u" and weights.itemsize <= 2, "Invalid normalized weights")
            weights = weights[drawn].astype(float) / np.iinfo(weights.dtype).max
        else:
            require(weights.dtype == np.dtype("<f4"), "Invalid floating weights")
            weights = weights[drawn]
        slot_sets.append(slots[drawn])
        weight_sets.append(weights)
    slots = np.concatenate(slot_sets, axis=1)
    weights = np.concatenate(weight_sets, axis=1)
    require(np.isfinite(weights).all() and np.all(weights >= 0) and np.allclose(weights.sum(axis=1, dtype=float), 1, atol=1e-5, rtol=0),
            "Invalid drawn skin weights")
    active_slots = np.unique(slots[weights > 0])
    require(len(active_slots) and active_slots[-1] < len(joint_nodes), "Weighted joint outside skin")
    active = {joint_nodes[i]: int(i) for i in active_slots}
    ordinals = {name: i for i, name in enumerate(sorted(active))}
    by_slot = {slot: ordinals[name] for name, slot in active.items()}
    tokens = []
    for point, js, ws in zip(corners, slots, weights, strict=True):
        influences = defaultdict(list)
        for slot, weight in zip(js, ws, strict=True):
            if weight > 0:
                influences[by_slot[int(slot)]].append(float(weight))
        binding = b"".join(struct.pack("<Id", key, math.fsum(influences[key])) for key in sorted(influences))
        tokens.append(hashlib.sha256(point.tobytes() + binding).digest())
    triangles = []
    for i, j, k in remapped.reshape(-1, 3):
        a, b, c = tokens[i], tokens[j], tokens[k]
        triangles.append(min(a+b+c, b+c+a, c+a+b))
    weighted = hashlib.sha256(b"".join(sorted(triangles))).hexdigest()
    roots = [row["owner"]]
    if "skeleton" in skin:
        roots.append(export.name("nodes", skin["skeleton"]))
    binds = {}
    for name, slot in active.items():
        matrix = matrices[slot].copy().reshape(4, 4).T
        require(np.isfinite(matrix).all() and np.array_equal(matrix[3], [0, 0, 0, 1]) and np.linalg.det(matrix[:3, :3].astype(float)) != 0,
                "Singular or non-affine weighted inverse bind: " + name)
        matrix[matrix == 0] = 0
        binds[name] = matrix.tolist()
    return {"weightedCorners": weighted, "roots": roots, "inverseBinds": binds,
            "frames": skeleton.frames([*roots, *active]), "activeSlots": active, "slotCount": len(joint_nodes),
            "drawnVertices": len(drawn), "vertexRows": len(export.accessor(attrs["POSITION"])[0])}


def verify_surviving_skin(source_bytes, reference_bytes, members=None):
    """Return a JSON receipt or raise ValueError on changed or unsupported native inputs."""
    source_rows, reference_rows = surfaces(source_bytes), surfaces(reference_bytes)
    structural = difference(source_rows, reference_rows) if members is None else compare(source_rows, reference_rows, members)
    source, reference = Export(source_bytes), Export(reference_bytes)
    source_skeleton, reference_skeleton = Skeleton(source), Skeleton(reference)
    results = []
    for key, row in reference_rows.items():
        a = surface_binding(source, source_skeleton, source_rows[key])
        b = surface_binding(reference, reference_skeleton, row)
        for field in ("roots", "inverseBinds", "frames", "weightedCorners"):
            if a[field] != b[field]:
                detail = ""
                if field in ("frames", "inverseBinds"):
                    detail = ": " + ", ".join(k for k in sorted(a[field].keys() | b[field].keys())
                                              if a[field].get(k) != b[field].get(k))
                raise ValueError(f"{key[0]}/{key[1]}: changed {field}{detail}")
        results.append({"owner": key[0], "material": key[1], "triangles": row["triangles"],
                        "sourceVertexRows": a["vertexRows"], "referenceVertexRows": b["vertexRows"],
                        "sourceDrawnVertices": a["drawnVertices"], "referenceDrawnVertices": b["drawnVertices"],
                        "sourceSkinSlots": a["slotCount"], "referenceSkinSlots": b["slotCount"],
                        "weightedJoints": len(a["activeSlots"]),
                        "reorderedWeightedSlots": sum(i != b["activeSlots"][n] for n, i in a["activeSlots"].items()),
                        "weightedCornerSha256": a["weightedCorners"], "inverseBindSha256": signature(a["inverseBinds"]),
                        "framesSha256": signature(a["frames"])})
    return {"schema": "native-removal-surviving-skin-v1", **structural, "surfaces": results,
            "scope": "Indexed neutral POSITION/UV0/NORMAL triangles, weighted nodes and inverse binds, mesh/skeleton roots, ancestor rest frames and humanoid roles.",
            "runtimeAdmission": False}


def check(spec):
    refs = [read_pinned(Path(spec[k]["path"]), spec[k]["sha256"]) for k in ("source", "reference")]
    return {**verify_surviving_skin(refs[0][1], refs[1][1], spec.get("members")),
            "source": refs[0][0], "reference": refs[1][0]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path)
    args = parser.parse_args()
    print(json.dumps(check(json.loads(args.spec.read_bytes())), ensure_ascii=False, indent=2))
