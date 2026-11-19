"""CPU bind-pose surface comparisons. Coordinates are in metres."""

import numpy as np


def triangles(glb, primitive):
    pos = np.asarray(glb.accessor(primitive["attributes"]["POSITION"]))
    faces = np.asarray(glb.accessor(primitive["indices"])).reshape(-1, 3)
    return pos[faces]


def segments_hit(start, end, triangles):
    # Moller-Trumbore on bounded segments, in both winding directions.
    v0, v1, v2 = triangles[:, 0], triangles[:, 1], triangles[:, 2]
    edge1, edge2 = v1 - v0, v2 - v0
    direction = end - start
    p = np.cross(direction, edge2)
    det = np.sum(edge1 * p, axis=-1)
    valid = abs(det) > 1e-15
    inv = np.divide(1.0, det, out=np.zeros_like(det), where=valid)
    offset = start - v0
    u = np.sum(offset * p, axis=-1) * inv
    q = np.cross(offset, edge1)
    v = np.sum(direction * q, axis=-1) * inv
    t = np.sum(edge2 * q, axis=-1) * inv
    return valid & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0) & (t < 1)


def crossings(boot, other):
    low, high = other.min(axis=1), other.max(axis=1)
    inside = ((high >= boot.min(axis=(0, 1))) & (low <= boot.max(axis=(0, 1)))).all(axis=1)
    other, low, high = other[inside], low[inside], high[inside]
    boot_faces, other_faces, pairs = set(), set(), 0
    yrange = []
    for i, tri in enumerate(boot):
        idx = np.flatnonzero(((high >= tri.min(axis=0)) & (low <= tri.max(axis=0))).all(axis=1))
        if not len(idx):
            continue
        cand = other[idx]
        hit = np.zeros(len(idx), dtype=bool)
        for a, b in ((0, 1), (1, 2), (2, 0)):
            hit |= segments_hit(tri[a], tri[b], cand) | segments_hit(cand[:, a], cand[:, b], tri[None])
        if hit.any():
            pairs += int(hit.sum())
            boot_faces.add(i)
            other_faces.update(idx[hit])
            yrange.extend(tri[:, 1])
    return dict(
        crossingPairs=pairs,
        bootTriangles=len(boot_faces),
        otherTriangles=len(other_faces),
        crossingBootTriangleYRangeM=[min(yrange), max(yrange)] if yrange else [],
    )


def section(triangles, y):
    """Intersect the horizontal plane with triangle edges, retaining metric bounds."""
    hits = []
    for i in range(3):
        a, b = triangles[:, i], triangles[:, (i + 1) % 3]
        use = (a[:, 1] < y) != (b[:, 1] < y)
        a, b = a[use], b[use]
        t = ((y - a[:, 1]) / (b[:, 1] - a[:, 1]))[:, None]
        hits.extend(a + t * (b - a))
    if not hits:
        return None
    hits = np.array(hits)
    return dict(
        minXYZ=hits.min(axis=0).tolist(),
        maxXYZ=hits.max(axis=0).tolist(),
        widthM=float(np.ptp(hits[:, 0])),
        depthM=float(np.ptp(hits[:, 2])),
    )
