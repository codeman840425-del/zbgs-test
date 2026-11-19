"""Compare actual drawn surfaces before and after one native garment removal.

The caller supplies the native operation receipt separately. Geometry alone
does not attest who removed a group or certify skin coverage, weights or fit.
"""
import argparse
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np

from native_dependency_delta import decoder, read_pinned, ref
from native_import import embedded_glb


SELECTOR = ("node", "mesh", "skin", "primitive", "material")


def require(test, message):
    if not test:
        raise ValueError(message)


def surface_hash(position, uv, indices):
    """Hash a multiset of oriented triangles, independent of vertex and face numbering."""
    require(position.dtype == uv.dtype == np.dtype("<f4")
            and position.shape == (len(uv), 3) and uv.shape[1:] == (2,), "Unsupported position/UV streams")
    points = np.concatenate((position, uv), axis=1)
    require(np.isfinite(points).all(), "Non-finite surface attribute")
    points[points == 0] = 0  # Float +0 and -0 denote the same coordinate.
    require(indices.dtype.kind == "u" and indices.size and indices.max() < len(points)
            and indices.size % 3 == 0, "Invalid triangle indices")
    vertices = list(map(bytes, points))
    encoded = []
    for i, j, k in indices.reshape(-1, 3).tolist():
        a, b, c = vertices[i], vertices[j], vertices[k]
        encoded.append(min(a + b + c, b + c + a, c + a + b))
    return hashlib.sha256(b"".join(sorted(encoded))).hexdigest()


def surfaces(data):
    doc, _ = embedded_glb(data)
    require(doc.get("extensions", {}).get("VRMC_vrm", {}).get("specVersion") == "1.0", "Expected VRM 1.0")
    glb = decoder.GLB(SimpleNamespace(read_bytes=lambda: data))
    result = {}
    for ni, node in enumerate(doc["nodes"]):
        if "mesh" not in node:
            continue
        mesh = ref(doc["meshes"], node["mesh"])
        for pi, part in enumerate(mesh["primitives"]):
            require(part.get("mode", 4) == 4 and "skin" in node, "Unreviewed mesh layout")
            ref(doc["skins"], node["skin"])
            material = ref(doc["materials"], part["material"])["name"]
            key = (node["name"], material)
            require(all(key) and key not in result, f"Ambiguous owner and material: {key}")
            attrs = part["attributes"]
            for accessor_id, kind in ((part["indices"], "SCALAR"), (attrs["POSITION"], "VEC3"), (attrs["TEXCOORD_0"], "VEC2")):
                entry = ref(doc["accessors"], accessor_id)
                require(entry["type"] == kind and not entry.get("sparse") and not entry.get("normalized"), "Unsupported surface accessor")
            indices = glb.acc(part["indices"])
            selector = dict(zip(SELECTOR, (ni, node["mesh"], node["skin"], pi, part["material"])))
            result[key] = {"owner": key[0], "materialName": material, "selector": selector,
                           "triangles": indices.size // 3,
                           "surfaceSha256": surface_hash(glb.acc(attrs["POSITION"]), glb.acc(attrs["TEXCOORD_0"]), indices)}
    require(bool(result), "No drawn surfaces")
    return result


def difference(before, after):
    added = set(after) - set(before)
    require(not added, f"Unexpected new surfaces: {sorted(added)}")
    changed = [key for key, row in after.items() if before[key]["surfaceSha256"] != row["surfaceSha256"]]
    require(not changed, f"Unrelated surviving surfaces changed: {sorted(changed)}")
    removed = [row for key, row in before.items() if key not in after]
    require(removed and after, "Expected a garment removal with surviving surfaces")
    return {"matchingSurfaces": len(after), "matchingTriangles": sum(row["triangles"] for row in after.values()),
            "removed": removed}


def compare(before, after, members):
    require(members and all(set(row) == set(SELECTOR) and
                            all(type(row[k]) is int and row[k] >= 0 for k in SELECTOR)
                            for row in members), "Invalid expected source selectors")
    expected = {tuple(row[k] for k in SELECTOR) for row in members}
    require(len(expected) == len(members), "Repeated source selector")
    result = difference(before, after)
    removed = result["removed"]
    actual = {tuple(row["selector"][k] for k in SELECTOR) for row in removed}
    require(actual == expected, f"Removed source primitives differ: {sorted(actual)}")
    return result


def check(spec):
    inputs, tables = {}, {}
    for field in ("source", "reference"):
        path = Path(spec[field]["path"])
        info, raw = read_pinned(path, spec[field]["sha256"])
        inputs[field], tables[field] = info, surfaces(raw)
    result = compare(tables["source"], tables["reference"], spec["members"])
    return {"schema": "native-garment-removal-surfaces-v1", "inputs": inputs, **result,
            "scope": "Mesh-local indexed POSITION and TEXCOORD_0 with winding and multiplicity. Native group lineage, material response, skinning and body-mask ownership require separate evidence.",
            "runtimeAdmission": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path, help="Pinned source/reference pair and expected source selectors; run from project root")
    args = parser.parse_args()
    print(json.dumps(check(json.loads(args.spec.read_bytes())), ensure_ascii=False, indent=2))
