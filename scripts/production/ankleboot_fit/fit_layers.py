"""One authored boot/pant pair, one bind-pose fit. All coordinates are metres."""

import argparse
import copy
import json
from pathlib import Path
import re
import sys

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flow import ROOT, GLB, require
from garment_source_mapping import json_bytes
from native_import import digest
from native_mesh_budget import accessor, encode
from production_paths import project_output
from sole_variant import install
from surfaces import triangles, crossings
from readback import first_surface, neutral_skin_error, radial_gaps, rim_vertices

PACKAGE = ROOT / "assets-source/ankle-boot-layers-v2"


def pinned(row):
    data = (ROOT / row["path"]).read_bytes()
    require(digest(data) == row["sha256"], "Source differs: " + row["path"])
    return data


def mesh(glb):
    (prim,) = glb.doc["meshes"][0]["primitives"]
    attrs = prim["attributes"]
    pos = accessor(glb, attrs["POSITION"])
    faces = accessor(glb, prim["indices"]).reshape(-1, 3)
    return pos, faces, attrs


def distances(origin, direction, tri):
    same = tri[(tri[:, :, 1].min(axis=1) <= origin[1]) & (tri[:, :, 1].max(axis=1) >= origin[1])]
    a, b, c = same.transpose(1, 0, 2)
    edge1, edge2 = b - a, c - a
    p = np.cross(direction, edge2)
    det = (edge1 * p).sum(axis=1)
    inv = np.divide(1.0, det, out=np.zeros_like(det), where=abs(det) > 1e-12)
    offset = origin - a
    q = np.cross(offset, edge1)
    u, v = (offset * p).sum(axis=1) * inv, (q @ direction) * inv
    hit = (edge2 * q).sum(axis=1) * inv
    return hit[(abs(det) > 1e-12) & (u >= 0) & (v >= 0) & (u + v <= 1) & (hit > 0)]


def fit_shaft(points, boot_tris, body_tris, pants_tris, origin_xz, landmarks, clearance):
    ankle = np.array(landmarks["targetJointsM"]["ankle"])
    ball = np.array(landmarks["targetJointsM"]["ball"])
    fwd = np.array(landmarks["forwardAxesXYZ"][1])
    mid = landmarks["sections"]["shaft"]["yM"]
    result = points.copy()
    for i, p in enumerate(points):
        if p[1] <= ankle[1] or (p - ball) @ fwd >= 0:
            continue
        origin = np.array([origin_xz[0], p[1], origin_xz[1]])
        direction = p - origin
        radius = np.linalg.norm(direction)
        direction /= radius
        skin = first_surface(origin, direction, body_tris)
        outer = first_surface(origin, direction, pants_tris)
        require(skin is not None and outer is not None, "Unresolved upper shaft envelope")
        span = np.append(distances(origin, direction, boot_tris), radius)
        inside, outside = skin - span.min(), outer - span.max()
        # Preserve the radial span (including the folded edge), fitting the skin
        # first where the captured trousers cannot carry a full two-sided gap.
        reserve = min(clearance, max(0.0, (outside - inside) / 2))
        delta = max(inside + reserve, min(0.0, outside - reserve))
        blend = min(1.0, (p[1] - ankle[1]) / (mid - ankle[1]))
        result[i] += direction * delta * blend**2 * (3 - 2 * blend)
    return result


def fit_trousers(points, faces, shoe, xz, clearance, centerline):
    # Use the actual radial surface in this face's angular sector. The overall
    # convex support of a foot slice also contains the shoe tip; assigning its
    # radius to the medial trouser hem destroys the inter-leg gap.
    floor, top = shoe[:, :, 1].min(), shoe[:, :, 1].max()
    faces = faces[(points[faces, 1].min(axis=1) <= top) & (points[faces, 1].max(axis=1) >= floor)]
    active = np.unique(faces)
    idmap = {int(i): j for j, i in enumerate(active)}
    radii = points[:, [0, 2]] - xz
    unit = radii / np.maximum(np.linalg.norm(radii, axis=1)[:, None], 1e-10)
    cloth = points[faces]
    horizontal = np.cross(cloth[:, 1] - cloth[:, 0], cloth[:, 2] - cloth[:, 0])[:, [0, 2]]
    normal = horizontal / np.maximum(np.linalg.norm(horizontal, axis=1)[:, None], 1e-10)
    normal *= np.sign((normal * unit[faces].mean(axis=1)).sum(axis=1))[:, None]
    coeffs, limits = [], []
    nvert = len(active)

    def constraint(terms, minimum):
        row = {}
        for i, value in terms:
            j = idmap[int(i)] * 4
            for k, c in enumerate((value[0], -value[0], value[1], -value[1])):
                row[j + k] = row.get(j + k, 0.0) - float(c)
        coeffs.append(row)
        limits.append(-float(minimum))

    probes = 0

    def witness(face_index, w, p, outer_radius=None):
        nonlocal probes
        if p[1] < floor or p[1] > top:
            return
        o = np.array([xz[0], p[1], xz[1]])
        d = p - o
        distance = np.linalg.norm(d)
        d /= distance
        if outer_radius is None:
            h = distances(o, d, shoe)
            if not len(h):
                return
            outer_radius = float(h.max())
        probes += 1
        outward = normal[face_index]
        angle = outward @ d[[0, 2]]
        if angle < 0.5:
            outward = d[[0, 2]]
            angle = 1.0
        gap = (outer_radius + clearance - distance) * angle
        constraint([(i, weight * outward) for i, weight in zip(faces[face_index], w)], gap)

    # Cover the outer garment, including its 12-point hem and all fold edges.
    for n, face in enumerate(faces):
        for i in face:
            constraint([(i, unit[i])], 0.0)
        for a in range(5):
            for b in range(5 - a):
                w = np.array([a, b, 4 - a - b]) * 0.25
                witness(n, w, w @ cloth[n])
    # Also project the inner garment's vertices and edge midpoints onto the real
    # trousers. This captures relief between sparse trouser vertices.
    inner = np.unique(
        np.concatenate([shoe.reshape(-1, 3), ((shoe + np.roll(shoe, 1, axis=1)) / 2).reshape(-1, 3)]), axis=0
    )
    lower = cloth[:, :, 1].min(axis=1)
    upper = cloth[:, :, 1].max(axis=1)
    for p in inner:
        cand = np.flatnonzero((lower <= p[1]) & (upper >= p[1]))
        if not len(cand):
            continue
        origin = np.array([xz[0], p[1], xz[1]])
        d = p - origin
        r = np.linalg.norm(d)
        d /= r
        a, b, c = cloth[cand].transpose(1, 0, 2)
        e1, e2 = b - a, c - a
        h = np.cross(d, e2)
        det = (e1 * h).sum(axis=1)
        inv = np.divide(1.0, det, out=np.zeros_like(det), where=abs(det) > 1e-12)
        off = origin - a
        q = np.cross(off, e1)
        u = (off * h).sum(axis=1) * inv
        v = (q @ d) * inv
        distance = (e2 * q).sum(axis=1) * inv
        for j in np.flatnonzero((abs(det) > 1e-12) & (u >= 0) & (v >= 0) & (u + v <= 1) & (distance > 0)):
            witness(cand[j], [1 - u[j] - v[j], u[j], v[j]], origin + distance[j] * d, r)
    for i in active:
        sign = float(np.sign(xz[0] - centerline))
        # Keep each panel on its own side of the midsagittal plane.
        constraint([(i, np.array([sign, 0.0]))], clearance / 2 - sign * (points[i, 0] - centerline))
    # Penalize changes in displacement between sewn neighbours alongside total
    # movement, so the original straight-leg panel remains continuous.
    edges = sorted(
        {tuple(sorted((int(a), int(b)))) for face in faces for a, b in zip(face, np.roll(face, -1))}
    )
    cost = [1.0] * (4 * nvert)
    for a, b in edges:
        for axis in (0, 1):
            j = len(cost)
            cost.append(1 / 3)
            move = np.eye(2)[axis]
            for sign in (1, -1):
                constraint([(a, sign * move), (b, -sign * move)], 0.0)
                coeffs[-1][j] = -1.0
    I, J, V = [], [], []
    for i, row in enumerate(coeffs):
        for j, v in row.items():
            if v:
                I.append(i)
                J.append(j)
                V.append(v)
    A = coo_matrix((V, (I, J)), shape=(len(limits), len(cost))).tocsr()
    solve = linprog(cost, A_ub=A, b_ub=limits, bounds=(0, None), method="highs")
    require(solve.success, "No paired lower-trouser fit: " + solve.message)
    movement = solve.x[: 4 * nvert].reshape(-1, 4)
    out = points.copy()
    out[active, 0] += movement[:, 0] - movement[:, 1]
    out[active, 2] += movement[:, 2] - movement[:, 3]
    return out, {
        "radialWitnesses": probes,
        "supportConstraints": len(limits),
        "activeWeldedVertices": nvert,
        "maxResidualM": float(max(0.0, (A @ solve.x - np.asarray(limits)).max())),
    }


def repack(source, new_positions, id_):
    pos, faces, attrs = mesh(source)
    old, weld = np.unique(pos, axis=0, return_inverse=True)
    first = np.unique(weld, return_index=True)[1]
    new = new_positions[first]
    require(np.allclose(new[weld], new_positions, rtol=0, atol=1e-8), "Split welded geometry")
    tri = weld[faces]

    def smooth(v):
        area = np.cross(v[tri[:, 1]] - v[tri[:, 0]], v[tri[:, 2]] - v[tri[:, 0]])
        n = np.zeros_like(v, dtype=float)
        for j in range(3):
            np.add.at(n, tri[:, j], area)
        return n / np.maximum(np.linalg.norm(n, axis=1)[:, None], 1e-10)

    # Rotate the authored per-corner normal by the change in the welded normal.
    # Unmoved vertices, including preserved shoe landmarks, keep all old bytes.
    a, b = smooth(old)[weld], smooth(new)[weld]
    t = np.cross(a, b)
    original = accessor(source, attrs["NORMAL"])
    normal = original.copy()
    moved = np.any(new_positions != pos, axis=1)
    v = original[moved].astype(float)
    cross = np.cross(t[moved], v)
    adjusted = (
        v
        + cross
        + np.cross(t[moved], cross) / np.maximum(1 + (a[moved] * b[moved]).sum(axis=1)[:, None], 1e-8)
    )
    normal[moved] = adjusted / np.maximum(np.linalg.norm(adjusted, axis=1)[:, None], 1e-10)
    doc = copy.deepcopy(source.doc)
    doc["meshes"][0]["name"] = id_
    (mesh_node,) = [n for n in doc["nodes"] if "mesh" in n]
    mesh_node["name"] = id_
    binary = bytearray(source.binary)
    for name, arr in [("POSITION", new_positions), ("NORMAL", normal)]:
        acc = doc["accessors"][attrs[name]]
        view = doc["bufferViews"][acc["bufferView"]]
        raw = np.asarray(arr, dtype="<f4").tobytes()
        require(
            len(raw) == view["byteLength"] and "byteStride" not in view and not acc.get("byteOffset"),
            "Unexpected source layout",
        )
        start = view.get("byteOffset", 0)
        binary[start : start + len(raw)] = raw
        for bound, fn in [("min", np.min), ("max", np.max)]:
            if bound in acc:
                acc[bound] = fn(arr.astype("<f4"), axis=0).tolist()
    return encode(doc, binary)


def check_pair(before, after, expected):
    p0, f0, a0 = mesh(before)
    p1, f1, a1 = mesh(after)
    require(np.array_equal(p1, expected.astype("<f4")) and np.array_equal(f0, f1), "Geometry readback")
    for name in ("TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"):
        require(
            np.array_equal(accessor(before, a0[name]), accessor(after, a1[name])),
            "Vertex data changed: " + name,
        )
    exempt = {before.doc["accessors"][a0[name]]["bufferView"] for name in ("POSITION", "NORMAL")}
    require(
        before.doc["bufferViews"] == after.doc["bufferViews"]
        and before.doc["materials"] == after.doc["materials"]
        and before.doc["textures"] == after.doc["textures"]
        and before.doc["images"] == after.doc["images"]
        and before.bind_by_name() == after.bind_by_name(),
        "Layer input identity changed",
    )
    for i, view in enumerate(before.doc["bufferViews"]):
        if i in exempt:
            continue
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        require(before.binary[start:end] == after.binary[start:end], "Non-geometry buffer changed")
    require(np.array_equal(p0[:, 1], p1[:, 1]), "Changed authored height")
    moved = np.linalg.norm(p1 - p0, axis=1)
    changed = moved > 0
    return dict(
        renderVertices=len(p1),
        triangles=len(f1),
        changedVertices=int(changed.sum()),
        changedHeightRangeM=[float(p1[changed, 1].min()), float(p1[changed, 1].max())],
        maxHorizontalChangeM=float(moved.max()),
        maxHeightChangeM=0,
        preserved=[
            "indices",
            "UV",
            "JOINTS_0",
            "WEIGHTS_0",
            "inverseBindMatrices",
            "images",
            "materials",
            "samplers",
        ],
        neutralSkinnedDisplacementM=neutral_skin_error(after, a1),
    )


def run():
    recipe = json.loads((PACKAGE / "recipe.json").read_bytes())
    require(recipe["schema"] == "ankleboot-covered-by-straight-trousers-v2" and recipe["outerLayer"] == "pants",
            "Unsupported layer-fit rule")
    names = [recipe[k]["id"] for k in ("boot", "pants")]
    require(len(set(names)) == 2 and all(re.fullmatch(r"[a-z][a-z0-9-]{1,79}", name) for name in names),
            "Invalid derived equipment ID")
    for name in names:
        asset = PACKAGE / "generated" / (name + ".glb")
        require(project_output(asset, __file__) == asset, "Redirected derived equipment asset")
    fit = json.loads(pinned(recipe["baseFit"]))
    envelope = json.loads(pinned(recipe["neutralEnvelope"]))
    for name in ("boot", "pants", "body"):
        require(name in envelope["inputs"], "Missing input " + name)
    meshes = {name: GLB(pinned(envelope["inputs"][name])) for name in ("body", "boot", "pants")}
    body = meshes["body"]
    body_tri = np.concatenate(
        [
            triangles(body, p)
            for p in body.doc["meshes"][1]["primitives"]
            if "Body_00_SKIN" in body.doc["materials"][p["material"]]["name"]
        ]
    )
    clearance = (
        min(
            data["rim"]["maximumEqualClearanceBothSidesAcrossSampledDirectionsMM"]
            for data in envelope["summary"].values()
        )
        * 0.001
    )
    boot_pos, boot_faces, _ = mesh(meshes["boot"])
    pants_pos, pants_faces, _ = mesh(meshes["pants"])
    boot_map, boot_inv = np.unique(boot_pos.astype(float), axis=0, return_inverse=True)
    pants_map, pants_inv = np.unique(pants_pos.astype(float), axis=0, return_inverse=True)
    boot = boot_map.copy()
    pants = pants_map.copy()
    solver = {}
    cid = np.mean([L["targetJointsM"]["ankle"][0] for L in fit["landmarks"].values()])
    for side in ("left", "right"):
        sign = -1 if side == "left" else 1
        L = fit["landmarks"][side[0]]
        origin = np.array(envelope["boots"][side]["originXZ"])
        tri_b = boot_map[boot_inv[boot_faces]]
        tri_p = pants_map[pants_inv[pants_faces]]
        tri_b = tri_b[(tri_b[:, :, 0].mean(1) - cid) * sign > 0]
        tri_p = tri_p[(tri_p[:, :, 0].mean(1) - cid) * sign > 0]
        sh = body_tri[(body_tri[:, :, 0].mean(1) - cid) * sign > 0]
        use = (boot_map[:, 0] - cid) * sign > 0
        boot[use] = fit_shaft(boot_map[use], tri_b, sh, tri_p, origin, L, clearance)
        f = pants_inv[pants_faces]
        side_faces = f[(pants_map[f][:, :, 0].mean(axis=1) - cid) * sign > 0]
        inner = boot[boot_inv[boot_faces]]
        inner = inner[(inner[:, :, 0].mean(axis=1) - cid) * sign > 0]
        result, solver[side] = fit_trousers(pants_map, side_faces, inner, origin, clearance, cid)
        changed = np.any(result != pants_map, axis=1)
        require(not np.any(pants[changed] != pants_map[changed]), "Opposite trouser leg modified")
        pants[changed] = result[changed]
    outputs = {}
    derived = {}
    info = {}
    for name, positions in [("boot", boot[boot_inv]), ("pants", pants[pants_inv])]:
        spec = recipe[name]
        file = spec["id"] + ".glb"
        raw = repack(meshes[name], positions, spec["id"])
        outputs[file] = raw
        derived[name] = GLB(raw)
        info[name] = {
            **spec,
            "sourceSha256": envelope["inputs"][name]["sha256"],
            "filename": file,
            "sha256": digest(raw),
            "bytes": len(raw),
            "readback": check_pair(meshes[name], derived[name], positions),
        }
    bp, bf, ba = mesh(derived["boot"])
    pp, pf, _ = mesh(derived["pants"])
    ribs = rim_vertices(bp, bf)
    others = {"bareShin": body_tri, "pants": pp[pf].astype(float)}
    cuff = dict(
        schema="ankleboot-target-cuff-readback-v1",
        assetSha256=info["boot"]["sha256"],
        maxNeutralSkinnedDisplacementM=neutral_skin_error(derived["boot"], ba),
        cuffs={"left" if r[:, 0].mean() < 0 else "right": radial_gaps(r, others) for r in ribs},
    )
    report = dict(
        schema="ankleboot-paired-layer-fit-v2",
        bodyType=recipe["bodyType"],
        bodySha256=envelope["inputs"]["body"]["sha256"],
        runtimeAccepted=False,
        recipeSha256=digest((PACKAGE / "recipe.json").read_bytes()),
        **info,
        cuffReadback=cuff,
        restSurfaceCrossings={
            "before": fit["restSurfaceCrossings"]["boot"],
            "after": {
                "bareBody": crossings(bp[bf].astype(float), body_tri),
                "trousers": crossings(bp[bf].astype(float), others["pants"]),
            },
        },
        horizontalSupportClearanceM=clearance,
        solver=solver,
        outerLayer="pants",
        applicability="Only these authored trousers over these boots on this 1K male. Keep the vamp/heel/forefoot at and below the ankle fixed. Angular shaft corrections above ankle blend into full effect at the measured shaft middle; original trouser vertices above the first face ring outside the boot height remain fixed.",
        limits=[
            "Geometry clearance and folded-cuff tests are neutral-pose measurements. Relative knee/foot skin weights can alter clearances in walking and while seated.",
            "Existing boot-to-bare-foot intersections below the ankle are retained. No body masking, shoe sole edits, trouser shortening, texture edits, or topology removal.",
        ]
    )
    outputs["fit-report.json"] = json_bytes(report)
    return outputs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = PACKAGE / "generated"
    output = project_output(expected, __file__)
    require(output == expected, "Redirected layer output")
    print(json.dumps(install(output, run(), args.check)))
