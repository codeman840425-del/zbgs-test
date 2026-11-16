"""Build a conservative inner-top triangle mask from two pinned rest-pose GLBs.

The mask is render-layer data for a later runtime union/restore adapter. It does
not modify either source asset and does not claim animation or visual acceptance.
"""
from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets-source/m2-garment-coverage-v1'
SPEC_PATH = OUT / 'spec.json'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB

def load_spec():
    spec = json.loads(SPEC_PATH.read_text(encoding='utf-8'))
    if spec.get('schema') != 'zbgs-garment-coverage-source-v1':
        raise ValueError('Unsupported coverage source schema')
    return spec


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def arrays(path, primitive_index=0):
    glb = GLB(path.read_bytes())
    primitive = glb.doc['meshes'][0]['primitives'][primitive_index]
    positions = np.array(glb.accessor(primitive['attributes']['POSITION']), dtype=float)
    indices = np.array(glb.accessor(primitive['indices']), dtype=np.int64).reshape(-1, 3)
    return glb, primitive, positions, indices


def point_triangle_distance(points, triangles):
    """Return each point's nearest distance to a triangle surface."""
    result = np.full(len(points), np.inf, dtype=float)
    for start in range(0, len(triangles), 256):
        chunk = triangles[start:start + 256]
        a, b, c = chunk[:, 0], chunk[:, 1], chunk[:, 2]
        ab, ac = b - a, c - a
        ap = points[:, None, :] - a[None, :, :]
        best = np.minimum(((points[:, None, :] - a[None, :, :]) ** 2).sum(2),
                          ((points[:, None, :] - b[None, :, :]) ** 2).sum(2))
        best = np.minimum(best, ((points[:, None, :] - c[None, :, :]) ** 2).sum(2))
        for u, v in ((a, b), (a, c), (b, c)):
            edge = v - u
            denominator = np.einsum('ki,ki->k', edge, edge)
            parameter = np.einsum('nki,ki->nk', points[:, None, :] - u[None, :, :], edge)
            parameter = np.clip(parameter / np.maximum(denominator, 1e-20)[None, :], 0, 1)
            closest = u[None, :, :] + parameter[:, :, None] * edge[None, :, :]
            best = np.minimum(best, ((points[:, None, :] - closest) ** 2).sum(2))
        normal = np.cross(ab, ac)
        denominator = np.einsum('ki,ki->k', normal, normal)
        signed = np.einsum('nki,ki->nk', ap, normal)
        projected = points[:, None, :] - (signed / np.maximum(denominator, 1e-20)[None, :])[:, :, None] * normal[None, :, :]
        v0, v1, v2 = ab, ac, projected - a[None, :, :]
        dot00 = np.einsum('ki,ki->k', v0, v0)
        dot01 = np.einsum('ki,ki->k', v0, v1)
        dot11 = np.einsum('ki,ki->k', v1, v1)
        dot20 = np.einsum('nki,ki->nk', v2, v0)
        dot21 = np.einsum('nki,ki->nk', v2, v1)
        inverse = 1 / np.maximum(dot00 * dot11 - dot01 * dot01, 1e-20)[None, :]
        u = (dot11[None, :] * dot20 - dot01[None, :] * dot21) * inverse
        v = (dot00[None, :] * dot21 - dot01[None, :] * dot20) * inverse
        inside = (u >= 0) & (v >= 0) & (u + v <= 1)
        surface_distance = np.abs(signed) / np.sqrt(np.maximum(denominator, 1e-20))[None, :]
        best = np.where(inside, surface_distance ** 2, best)
        result = np.minimum(result, best.min(1))
    return np.sqrt(result)


def nearest_surface(points, triangles, normals):
    """Return distance, closest triangle, closest point, and its normal."""
    result = np.full(len(points), np.inf, dtype=float)
    result_triangle = np.full(len(points), -1, dtype=int)
    result_point = np.zeros_like(points)
    for start in range(0, len(triangles), 256):
        chunk = triangles[start:start + 256]
        a, b, c = chunk[:, 0], chunk[:, 1], chunk[:, 2]
        ab, ac = b - a, c - a
        ap = points[:, None, :] - a[None, :, :]
        candidates = []
        for vertex in (a, b, c):
            candidates.append((points[:, None, :] - vertex[None, :, :]) ** 2)
        for u, v in ((a, b), (a, c), (b, c)):
            edge = v - u
            denominator = np.einsum('ki,ki->k', edge, edge)
            parameter = np.einsum('nki,ki->nk', points[:, None, :] - u[None, :, :], edge)
            parameter = np.clip(parameter / np.maximum(denominator, 1e-20)[None, :], 0, 1)
            candidates.append((points[:, None, :] - (u[None, :, :] + parameter[:, :, None] * edge[None, :, :])) ** 2)
        normal = np.cross(ab, ac)
        denominator = np.einsum('ki,ki->k', normal, normal)
        signed = np.einsum('nki,ki->nk', ap, normal)
        projected = points[:, None, :] - (signed / np.maximum(denominator, 1e-20)[None, :])[:, :, None] * normal[None, :, :]
        v0, v1, v2 = ab, ac, projected - a[None, :, :]
        dot00 = np.einsum('ki,ki->k', v0, v0)
        dot01 = np.einsum('ki,ki->k', v0, v1)
        dot11 = np.einsum('ki,ki->k', v1, v1)
        dot20 = np.einsum('nki,ki->nk', v2, v0)
        dot21 = np.einsum('nki,ki->nk', v2, v1)
        inverse = 1 / np.maximum(dot00 * dot11 - dot01 * dot01, 1e-20)[None, :]
        u = (dot11[None, :] * dot20 - dot01[None, :] * dot21) * inverse
        v = (dot00[None, :] * dot21 - dot01[None, :] * dot20) * inverse
        inside = (u >= 0) & (v >= 0) & (u + v <= 1)
        squared = np.stack([candidate.sum(2) for candidate in candidates], axis=2).min(2)
        surface_distance = np.abs(signed) / np.sqrt(np.maximum(denominator, 1e-20))[None, :]
        squared = np.where(inside, surface_distance ** 2, squared)
        local = squared.argmin(1)
        local_distance = squared[np.arange(len(points)), local]
        replace = local_distance < result
        if np.any(replace):
            rows = np.flatnonzero(replace)
            result[rows] = local_distance[rows]
            result_triangle[rows] = start + local[rows]
            # Recompute the exact closest point for the winning primitive.
            tri = chunk[local[rows]]
            aa, bb, cc = tri[:, 0], tri[:, 1], tri[:, 2]
            pp = points[rows]
            ab, ac = bb - aa, cc - aa
            ap = pp - aa
            d1, d2 = np.einsum('ki,ki->k', ab, ap), np.einsum('ki,ki->k', ac, ap)
            bp = pp - bb
            d3, d4 = np.einsum('ki,ki->k', ab, bp), np.einsum('ki,ki->k', ac, bp)
            cp = pp - cc
            d5, d6 = np.einsum('ki,ki->k', ab, cp), np.einsum('ki,ki->k', ac, cp)
            closest = aa.copy()
            at_a = (d1 <= 0) & (d2 <= 0)
            at_b = (d3 >= 0) & (d4 <= d3)
            closest[at_b] = bb[at_b]
            at_c = (d6 >= 0) & (d5 <= d6)
            closest[at_c] = cc[at_c]
            vc = d1 * d4 - d3 * d2
            at_ab = (vc <= 0) & (d1 >= 0) & (d3 <= 0)
            v = d1 / np.maximum(d1 - d3, 1e-20)
            closest[at_ab] = aa[at_ab] + v[at_ab, None] * ab[at_ab]
            vb = d5 * d2 - d1 * d6
            at_ac = (vb <= 0) & (d2 >= 0) & (d6 <= 0)
            w = d2 / np.maximum(d2 - d6, 1e-20)
            closest[at_ac] = aa[at_ac] + w[at_ac, None] * ac[at_ac]
            va = d3 * d6 - d5 * d4
            at_bc = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
            w = (d4 - d3) / np.maximum((d4 - d3) + (d5 - d6), 1e-20)
            closest[at_bc] = bb[at_bc] + w[at_bc, None] * (cc[at_bc] - bb[at_bc])
            interior = ~(at_a | at_b | at_c | at_ab | at_ac | at_bc)
            denominator = np.maximum(va + vb + vc, 1e-20)
            v = vb / denominator
            w = vc / denominator
            closest[interior] = aa[interior] + v[interior, None] * ab[interior] + w[interior, None] * ac[interior]
            result_point[rows] = closest
    return np.sqrt(result), result_triangle, result_point


def boundary_distance(points, boundary_segments):
    result = np.full(len(points), np.inf, dtype=float)
    for start in range(0, len(boundary_segments), 256):
        segment = boundary_segments[start:start + 256]
        a, b = segment[:, 0], segment[:, 1]
        edge = b - a
        denominator = np.einsum('ki,ki->k', edge, edge)
        t = np.einsum('nki,ki->nk', points[:, None, :] - a[None, :, :], edge)
        t = np.clip(t / np.maximum(denominator, 1e-20)[None, :], 0, 1)
        closest = a[None, :, :] + t[:, :, None] * edge[None, :, :]
        result = np.minimum(result, ((points[:, None, :] - closest) ** 2).sum(2).min(1))
    return np.sqrt(result)


def connected_components(face_ids, triangles):
    by_edge = defaultdict(list)
    selected = set(face_ids)
    for face in face_ids:
        tri = triangles[face]
        for a, b in zip(tri, np.roll(tri, -1)):
            by_edge[tuple(sorted((int(a), int(b))))].append(face)
    neighbors = defaultdict(set)
    for faces in by_edge.values():
        for face in faces:
            neighbors[face].update(other for other in faces if other != face)
    remaining = set(selected)
    components = []
    while remaining:
        first = remaining.pop()
        queue = deque([first])
        component = [first]
        while queue:
            for other in neighbors[queue.popleft()]:
                if other in remaining:
                    remaining.remove(other)
                    queue.append(other)
                    component.append(other)
        components.append(sorted(component))
    return sorted(components, key=lambda item: (item[0], len(item)))


def build():
    spec = load_spec()
    top_path = ROOT / spec['innerTop']
    outer_path = ROOT / spec['outer']
    if sha(top_path) != spec['innerTopSha256'] or sha(outer_path) != spec['outerSha256']:
        raise ValueError('Pinned source SHA mismatch')
    distance_limit = float(spec['distanceLimitM'])
    back_z_min = float(spec['backZMinM'])
    y_range = tuple(float(value) for value in spec['centroidYRangeM'])
    abs_x_max = float(spec['centroidAbsXMaxM'])
    top_glb, top_primitive, top_positions, top_indices = arrays(top_path, spec['innerTopPrimitive'])
    outer_glb, outer_primitive, outer_positions, outer_indices = arrays(outer_path)
    top_triangles = top_positions[top_indices]
    outer_triangles = outer_positions[outer_indices]
    outer_normals = np.array(outer_glb.accessor(outer_primitive['attributes']['NORMAL']), dtype=float)[outer_indices].mean(1)
    outer_normals /= np.maximum(np.linalg.norm(outer_normals, axis=1), 1e-20)[:, None]
    corners = point_triangle_distance(top_triangles.reshape(-1, 3), outer_triangles).reshape(-1, 3)
    centroids = top_triangles.mean(1)
    max_corner_distance = corners.max(1)
    eligible = ((max_corner_distance <= distance_limit)
                & (centroids[:, 2] >= back_z_min)
                & (centroids[:, 1] >= y_range[0])
                & (centroids[:, 1] <= y_range[1])
                & (np.abs(centroids[:, 0]) <= abs_x_max))
    selected = np.flatnonzero(eligible).astype(int).tolist()
    if not selected:
        raise RuntimeError('No covered inner-top triangles met the conservative back-region criteria')
    selected_triangles = top_indices[selected].astype(int).tolist()
    selected_points = np.concatenate((top_triangles[selected], top_triangles[selected].mean(1)[:, None, :],
                                       (top_triangles[selected][:, [0, 1, 2]] + top_triangles[selected][:, [1, 2, 0]]) / 2), axis=1).reshape(-1, 3)
    nearest_distance, nearest_triangle, nearest_points = nearest_surface(selected_points, outer_triangles, outer_normals)
    inner_side_signed = np.einsum('ki,ki->k', selected_points - nearest_points, outer_normals[nearest_triangle])
    construction = json.loads((ROOT / 'assets-source/m2-outer-panels-v2/generated/construction.json').read_text(encoding='utf-8'))
    boundary_indices = np.array(construction['boundaryEdges'], dtype=int)
    boundary_segments = outer_positions[boundary_indices]
    boundary_margins = boundary_distance(selected_points, boundary_segments)
    areas = 0.5 * np.linalg.norm(np.cross(top_triangles[:, 1] - top_triangles[:, 0],
                                           top_triangles[:, 2] - top_triangles[:, 0]), axis=1)
    top_material = top_glb.doc['materials'][top_primitive['material']]['name']
    outer_material = outer_glb.doc['materials'][outer_primitive['material']]['name']
    components = connected_components(selected, top_indices)
    fit = {
        'schema': 'zbgs-garment-coverage-mask-v1',
        'id': 'm2-male-open-vest-panels-v2-inner-top-back-mask-v1',
        'status': 'source-candidate-runtime-pending',
        'outerAssetSha256': sha(outer_path),
        'outerId': spec['outerId'],
        'outerSpec': 'assets-source/m2-outer-panels-v2/spec.json',
        'innerTopSha256': sha(top_path),
        'innerTopId': spec['innerTopId'],
        'innerTopPrimitive': 0,
        'innerTopMaterial': top_material,
        'topFaceCount': len(top_indices),
        'topIndexComponentType': 5125,
        'topIndexAccessorSha256': hashlib.sha256(top_glb.binary[top_glb.doc['bufferViews'][top_primitive['indices']]['byteOffset']:
                                                       top_glb.doc['bufferViews'][top_primitive['indices']]['byteOffset'] + top_glb.doc['bufferViews'][top_primitive['indices']]['byteLength']]).hexdigest(),
        'selectedFaceIds': selected,
        'selectedTriangles': selected_triangles,
        'coveredTriangleCount': len(selected),
        'coveredAreaM2': float(areas[selected].sum()),
        'connectedComponents': [len(component) for component in components],
        'criteria': {
            'method': 'All three inner-top rest-pose corners nearest to actual outer triangle surface within threshold, with centroid constrained to conservative back region',
            'distanceLimitM': distance_limit,
            'backZMinM': back_z_min,
            'centroidYRangeM': list(y_range),
            'centroidAbsXMaxM': abs_x_max,
            'frontOpeningExcluded': True,
            'tiePrimitiveExcluded': True,
        },
        'observations': {
            'maxSelectedCornerDistanceM': float(max_corner_distance[selected].max()),
            'minSelectedCornerDistanceM': float(max_corner_distance[selected].min()),
            'selectedCentroidBoundsM': [centroids[selected].min(0).tolist(), centroids[selected].max(0).tolist()],
            'outerMaterial': outer_material,
            'outerTrianglesCompared': len(outer_triangles),
            'topSourceTrianglesCompared': len(top_triangles),
            'sampleCount': len(selected_points),
            'innerSideSampleCount': int(np.count_nonzero(inner_side_signed >= 0)),
            'innerSidePassed': bool(np.all(inner_side_signed >= -1e-7)),
            'minInnerSideSignedM': float(inner_side_signed.min()),
            'maxInnerSideSignedM': float(inner_side_signed.max()),
            'openBoundaryPath': 'assets-source/m2-outer-panels-v2/generated/construction.json boundaryEdges mapped to outer front-surface vertices',
            'openBoundaryEdgeCount': len(boundary_segments),
            'minOpenBoundaryMarginM': float(boundary_margins.min()),
            'openBoundaryMarginPassed': bool(boundary_margins.min() >= 0.005),
        },
        'binding': {
            'mode': 'inner top remains original skin and index identity; mask stores source face IDs only',
            'sameSkeletonRequired': True,
        'bodySha256': spec['bodySha256'],
            'outerSkinJoints': len(outer_glb.doc['skins'][0]['joints']),
            'innerTopSkinJoints': len(top_glb.doc['skins'][0]['joints']),
        },
        'limits': [
            'CPU rest-pose geometry evidence only; no continuous animation or browser acceptance.',
            'Mask targets the original top primitive and does not hide the avatar body.',
            'No source GLB, runtime entry, or original art asset is modified.',
            'Distance is to the outer triangle surface at rest and does not prove full swept-volume separation.',
            'Inner-side and open-boundary margins are rest-pose geometric witnesses, not a collision solver.',
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'coverage-mask.json').write_text(json.dumps(fit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = dict(fit)
    report['sourceFiles'] = {
        'innerTop': {'path': top_path.relative_to(ROOT).as_posix(), 'sha256': fit['innerTopSha256'], 'bytes': top_path.stat().st_size},
        'outer': {'path': outer_path.relative_to(ROOT).as_posix(), 'sha256': fit['outerAssetSha256'], 'bytes': outer_path.stat().st_size},
    }
    report['rebuild'] = {'command': 'python scripts/m2-garment-coverage-v1/build.py', 'numpyCPUOnly': True}
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'selectedTriangles': len(selected), 'coveredAreaM2': fit['coveredAreaM2'],
                      'maxSelectedCornerDistanceM': fit['observations']['maxSelectedCornerDistanceM'],
                      'components': fit['connectedComponents'], 'innerTopSha256': fit['innerTopSha256'],
                      'outerAssetSha256': fit['outerAssetSha256']}))


if __name__ == '__main__':
    build()
