"""Local layer projection, original live skin palettes, and split-normal geometry."""

import numpy as np


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def matrix(values):
    return np.asarray(values, float).reshape(4, 4).T


def skin(points, live):
    joints, weights = np.asarray(live["joints"], int), np.asarray(
        live["weights"], float
    )
    base = (
        np.column_stack((points, np.ones(len(points)))) @ matrix(live["bindMatrix"]).T
    )
    result = np.zeros_like(base)
    for index, bone in enumerate(live["bones"]):
        palette = matrix(bone["matrixWorld"]) @ matrix(bone["inverseBind"])
        influence = np.where(joints == index, weights, 0).sum(1)
        result += (base @ palette.T) * influence[:, None]
    result[:, 3] = 1
    return (
        result @ matrix(live["bindMatrixInverse"]).T @ matrix(live["matrixWorld"]).T
    )[:, :3]


def projection(points, camera):
    if camera is None:
        return points, np.ones(len(points))
    clip = (
        np.column_stack((points, np.ones(len(points))))
        @ matrix(camera["matrixWorldInverse"]).T
        @ matrix(camera["projectionMatrix"]).T
    )
    return clip[:, :3] / clip[:, 3, None], clip[:, 3]


def barycentric(point, triangle):
    values = np.linalg.solve(
        np.column_stack((triangle[1] - triangle[0], triangle[2] - triangle[0])),
        point - triangle[0],
    )
    return np.r_[1 - values.sum(), values]


def overlap(first, second):
    polygon = [p.copy() for p in first]
    orientation = cross2(second[1] - second[0], second[2] - second[0])
    if abs(orientation) < 1e-15:
        return []
    sign = np.sign(orientation)
    for a, b in zip(second, np.roll(second, -1, axis=0)):
        output = []
        for p, q in zip(polygon, polygon[1:] + polygon[:1]):
            dp = sign * cross2(b - a, p - a)
            dq = sign * cross2(b - a, q - a)
            if dp >= -1e-13:
                output.append(p)
            if (dp >= 0) != (dq >= 0):
                output.append(p + (q - p) * dp / (dp - dq))
        polygon = output
        if not polygon:
            return []
    unique = []
    for p in polygon:
        if not any(np.linalg.norm(p - q) < 1e-11 for q in unique):
            unique.append(p)
    return unique


def gap(top, top_faces, pants, pants_faces, core_faces, candidate_pants, camera):
    projected_top, wt = projection(top, camera)
    projected_pants, wp = projection(pants, camera)
    bottom_triangles = projected_pants[pants_faces[candidate_pants]]
    low, high = bottom_triangles[:, :, :2].min(1), bottom_triangles[:, :, :2].max(1)
    minimum, critical, pairs, samples = np.inf, None, 0, 0
    for face in core_faces:
        ti = top_faces[face]
        t = projected_top[ti]
        if abs(cross2(t[1, :2] - t[0, :2], t[2, :2] - t[0, :2])) < 1e-15:
            continue
        selected = np.flatnonzero(
            np.all(high >= t[:, :2].min(0), axis=1)
            & np.all(low <= t[:, :2].max(0), axis=1)
        )
        for local in selected:
            other = int(candidate_pants[local])
            bi = pants_faces[other]
            b = projected_pants[bi]
            polygon = overlap(t[:, :2], b[:, :2])
            if len(polygon) < 3:
                continue
            pairs += 1
            points = (
                polygon
                + [(p + q) / 2 for p, q in zip(polygon, polygon[1:] + polygon[:1])]
                + [np.mean(polygon, axis=0)]
            )
            for point in points:
                bt, bb = barycentric(point, t[:, :2]), barycentric(point, b[:, :2])
                tx, bx = bt / wt[ti], bb / wp[bi]
                tx, bx = tx / tx.sum(), bx / bx.sum()
                tp, bp = tx @ top[ti], bx @ pants[bi]
                if camera is None:
                    value = float(bp[2] - tp[2])
                else:
                    signed_depth = bb @ b[:, 2] - bt @ t[:, 2]
                    value = float(np.sign(signed_depth) * np.linalg.norm(bp - tp))
                samples += 1
                if value < minimum:
                    minimum = value
                    critical = {
                        "topTriangle": int(face),
                        "pantsTriangle": other,
                        "topBarycentric": tx.tolist(),
                        "pantsBarycentric": bx.tolist(),
                        "topPointM": tp.tolist(),
                        "pantsPointM": bp.tolist(),
                        "gapM": value,
                    }
    if not np.isfinite(minimum) or not samples:
        raise ValueError("Local layer constraint has no measured overlap")
    return {
        "minimumGapM": minimum,
        "overlappingTrianglePairs": pairs,
        "samples": samples,
        "critical": critical,
    }


def selection(points, faces, spec):
    seeds = np.unique(faces[spec["coreTriangles"]])
    if seeds.tolist() != sorted(spec["seedVertices"]):
        raise ValueError("Common source triangle/vertex selection differs")
    # Position aliases move together across UV or normal splits.
    keys = [tuple(p) for p in points]
    seed_keys = {keys[i] for i in seeds}
    neighbors = set(seeds.tolist())
    for face in faces:
        if any(keys[i] in seed_keys for i in face):
            neighbors.update(face.tolist())
    neighbor_keys = {keys[i] for i in neighbors}
    weights = np.array(
        [
            1.0 if key in seed_keys else 0.5 if key in neighbor_keys else 0.0
            for key in keys
        ]
    )
    return weights


def geometric_normals(points, faces):
    cross = np.cross(
        points[faces[:, 1]] - points[faces[:, 0]],
        points[faces[:, 2]] - points[faces[:, 0]],
    )
    lengths = np.linalg.norm(cross, axis=1)
    return cross / np.maximum(lengths, 1e-30)[:, None], lengths


def updated_normals(old, new, faces, source_normals):
    # Existing normal splits define smoothing groups. UV aliases with the same
    # source split normal share accumulation, while hard normal splits stay apart.
    groups = {}
    for i, (p, n) in enumerate(zip(old, source_normals)):
        groups.setdefault((tuple(p), tuple(np.round(n, 6))), []).append(i)
    changed = np.linalg.norm(new - old, axis=1) > 1e-12
    affected_faces = np.any(changed[faces], axis=1)
    affected = set(np.unique(faces[affected_faces]).tolist())
    normal, _ = geometric_normals(new, faces)
    contributions = np.zeros_like(new)
    for corner in range(3):
        a = new[faces[:, (corner + 1) % 3]] - new[faces[:, corner]]
        b = new[faces[:, (corner + 2) % 3]] - new[faces[:, corner]]
        cosine = np.sum(a * b, axis=1) / np.maximum(
            np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1), 1e-30
        )
        angle = np.arccos(np.clip(cosine, -1, 1))
        np.add.at(contributions, faces[:, corner], normal * angle[:, None])
    result = source_normals.copy()
    updated = []
    for ids in groups.values():
        if not any(i in affected for i in ids):
            continue
        total = contributions[ids].sum(0)
        length = np.linalg.norm(total)
        if length < 1e-12:
            raise ValueError("Changed split-normal group is degenerate")
        result[ids] = total / length
        updated.extend(ids)
    return result, {
        "method": "Angle-weighted actual changed geometry; original POSITION/source-NORMAL smoothing groups retain splits and UV aliases",
        "updatedVertices": sorted(updated),
        "normalGroups": len(groups),
    }


def shape_checks(old, new, faces, thresholds):
    before, area_before = geometric_normals(old, faces)
    after, area_after = geometric_normals(new, faces)
    changed = np.any(np.linalg.norm(new - old, axis=1)[faces] > 1e-12, axis=1)
    edges = {
        tuple(sorted((int(a), int(b))))
        for face in faces
        for a, b in zip(face, np.roll(face, -1))
    }
    edge_list = np.array(sorted(edges))
    old_length = np.linalg.norm(old[edge_list[:, 1]] - old[edge_list[:, 0]], axis=1)
    new_length = np.linalg.norm(new[edge_list[:, 1]] - new[edge_list[:, 0]], axis=1)
    active_edges = (np.linalg.norm(new - old, axis=1)[edge_list].max(1) > 1e-12) & (
        old_length > 1e-12
    )
    ratio = new_length[active_edges] / old_length[active_edges]
    adjacency = {}
    for i, face in enumerate(faces):
        for a, b in zip(face, np.roll(face, -1)):
            adjacency.setdefault(tuple(sorted((int(a), int(b)))), []).append(i)
    changes = []
    for edge, ids in adjacency.items():
        if len(ids) == 2 and changed[ids].any():
            a, b = ids
            old_angle = np.degrees(np.arccos(np.clip(before[a] @ before[b], -1, 1)))
            new_angle = np.degrees(np.arccos(np.clip(after[a] @ after[b], -1, 1)))
            changes.append(
                {
                    "vertices": list(edge),
                    "dihedralChangeDegrees": float(abs(new_angle - old_angle)),
                }
            )
    area_ratio = area_after[changed] / np.maximum(area_before[changed], 1e-30)
    facing = np.sum(before[changed] * after[changed], axis=1)
    result = {
        "minimumAreaRatio": float(area_ratio.min()),
        "minimumNormalDot": float(facing.min()),
        "edgeLengthRatioRange": [float(ratio.min()), float(ratio.max())],
        "maximumDihedralChangeDegrees": max(
            (c["dihedralChangeDegrees"] for c in changes), default=0
        ),
        "largestDihedralChanges": sorted(
            changes, key=lambda c: c["dihedralChangeDegrees"], reverse=True
        )[:12],
    }
    passed = (
        result["minimumAreaRatio"] >= thresholds["minimumAreaRatio"]
        and result["minimumNormalDot"] > 0
    )
    passed &= (
        ratio.min() >= thresholds["minimumEdgeRatio"]
        and ratio.max() <= thresholds["maximumEdgeRatio"]
    )
    passed &= (
        result["maximumDihedralChangeDegrees"]
        <= thresholds["maximumDihedralChangeDegrees"]
    )
    result["passed"] = bool(passed)
    return result
