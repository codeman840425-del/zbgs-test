"""Recover an indexed geometric patch from a UV-split export with source corner correspondence.

For an offline geometry derivative. Render UVs remain per corner. The caller
must supply the original indexed source faces in the export's corner order,
from an independent trusted source or the exporter's recorded correspondence.
Spatial proximity is never evidence of shared vertex identity.
"""
from collections import defaultdict

import numpy as np


def check(condition, message):
    if not condition:
        raise ValueError(message)


def oriented_edges(faces):
    edges = defaultdict(list)
    fans = defaultdict(lambda: defaultdict(set))
    seen = set()
    for a, b, c in faces.tolist():
        key = tuple(sorted((a, b, c)))
        check(len(set(key)) == 3 and key not in seen, 'degenerate or duplicate triangle')
        seen.add(key)
        for v, x, y in ((a, b, c), (b, c, a), (c, a, b)):
            edges[tuple(sorted((v, x)))].append((v, x))
            fans[v][x].add(y)
            fans[v][y].add(x)
    for uses in edges.values():
        check(len(uses) == 1 or (len(uses) == 2 and uses[0] == uses[1][::-1]), 'nonmanifold or inconsistent edge')
    for fan in fans.values():
        check(all(len(neighbors) <= 2 for neighbors in fan.values()), 'branched vertex link')
        visited, stack = set(), [next(iter(fan))]
        while stack:
            vertex = stack.pop()
            if vertex not in visited:
                visited.add(vertex)
                stack.extend(fan[vertex] - visited)
        check(len(visited) == len(fan), 'disconnected vertex link')
    return edges


def stitch_uv_patch(source_faces, source_attributes, render_faces, render_attributes, uv, allowed_raw_joints):
    """Return source vertex IDs per triangle and the original per-corner UVs.

    Supply every non-UV vertex attribute involved in the derivative. The two
    input sets must use the same skeleton joint-index space and coordinate frame.
    """
    check(source_faces is not None, 'missing source corner correspondence')
    src, draw = np.asarray(source_faces), np.asarray(render_faces)
    check(src.shape == draw.shape and src.ndim == 2 and src.shape[1] == 3 and len(src) > 0, 'unaligned triangle lists')
    check(all(x.dtype.kind in 'ui' and x.min() >= 0 for x in (src, draw)), 'invalid vertex index')
    check(set(source_attributes) == set(render_attributes) and
          {'POSITION', 'JOINTS_0', 'WEIGHTS_0'} <= set(source_attributes), 'incomplete vertex attribute correspondence')
    check(not any(k.startswith(('JOINTS_', 'WEIGHTS_')) and k not in ('JOINTS_0', 'WEIGHTS_0') for k in source_attributes),
          'multiple skin sets require a dedicated reader')
    used = np.unique(src)
    for name in sorted(source_attributes):
        a, b = np.asarray(source_attributes[name]), np.asarray(render_attributes[name])
        check(a.ndim == b.ndim == 2 and a.shape[1:] == b.shape[1:] and a.shape[0] > src.max() and b.shape[0] > draw.max(),
              'invalid attribute layout ' + name)
        check(np.isfinite(a[used]).all() and np.array_equal(a[src], b[draw]), 'source attribute differs ' + name)
    positions = np.asarray(source_attributes['POSITION'])
    check(positions.shape[1] == 3, 'positions must have three components')
    tri = positions[src].astype(float)
    check(np.all(np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) > 0), 'zero-area source triangle')
    joints, weights = np.asarray(source_attributes['JOINTS_0'])[used], np.asarray(source_attributes['WEIGHTS_0'])[used]
    allowed = set(allowed_raw_joints)
    check(bool(allowed) and joints.shape == weights.shape and joints.dtype.kind in 'iu' and
          np.all(weights >= 0) and np.max(abs(weights.sum(axis=1) - 1)) < 1e-6 and
          set(joints[weights > 0].tolist()) <= allowed, 'wrong anatomical joint or invalid skin')
    uv = np.asarray(uv)
    check(uv.ndim == 2 and uv.shape[1] == 2 and uv.shape[0] > draw.max() and np.isfinite(uv[draw]).all(), 'invalid UVs')
    source_edges = oriented_edges(src)
    render_edges = oriented_edges(draw)
    by_draw, siblings = {}, defaultdict(set)
    for new, old in zip(draw.ravel().tolist(), src.ravel().tolist()):
        check(by_draw.setdefault(new, old) == old, 'render vertex aliases distinct source vertices')
        siblings[old].add(new)
    boundary_by_source = defaultdict(list)
    for uses in render_edges.values():
        if len(uses) == 1:
            d, e = uses[0]
            key = tuple(sorted((by_draw[d], by_draw[e])))
            boundary_by_source[key].append((d, e))
    paired = []
    links = defaultdict(lambda: defaultdict(set))
    for edge, halves in sorted(boundary_by_source.items()):
        if len(source_edges[edge]) == 1:
            check(len(halves) == 1, 'original open edge has duplicated use')
            continue
        check(len(halves) == 2, 'missing mate for source interior edge')
        (a, b), (d, c) = halves
        check(by_draw[a] == by_draw[c] and by_draw[b] == by_draw[d], 'boundary winding mismatch')
        check(not (np.array_equal(uv[a], uv[c]) and np.array_equal(uv[b], uv[d])), 'split edge has no UV discontinuity')
        for u, v in [(a, c), (b, d)]:
            links[by_draw[u]][u].add(v)
            links[by_draw[u]][v].add(u)
        paired.append((a, b, d, c))
    check(paired, 'no proven split UV edge')
    for old, group in siblings.items():
        if len(group) <= 1:
            continue
        visited, stack = set(), [min(group)]
        while stack:
            node = stack.pop()
            if node not in visited:
                visited.add(node)
                stack.extend(links[old][node] - visited)
        check(visited == group, 'vertex copies lack an edge-by-edge identity chain')
    return {'sourceFaces': src.copy(), 'cornerUV': uv[draw].copy(), 'pairedBoundaryEdges': paired}
