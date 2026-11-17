"""Full original HairBack topology and unsigned skin proximity, no root selection."""
import ast
import hashlib
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace

sys.dont_write_bytecode = True
import numpy as np
import scipy
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

ROOT = Path('F:/gamemake')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, require


def sha(data):
    return hashlib.sha256(data).hexdigest()


def summary(values):
    return {'minimumM': float(np.min(values)), 'medianM': float(np.median(values)),
        'p95M': float(np.percentile(values, 95)), 'maximumM': float(np.max(values))}


def topology(P, F):
    edges = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1)
    edges, uses = np.unique(edges, axis=0, return_counts=True)
    graph = coo_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(len(P), len(P)))
    count, labels = connected_components(graph, directed=False)
    boundary = edges[uses == 1]
    vertices = np.unique(boundary)
    adjacency = coo_matrix((np.ones(len(boundary)),
        (np.searchsorted(vertices, boundary[:, 0]), np.searchsorted(vertices, boundary[:, 1]))), shape=(len(vertices), len(vertices)))
    loops, loop_labels = connected_components(adjacency, directed=False)
    degrees = np.bincount(boundary.ravel(), minlength=len(P))[vertices]
    return {'vertices': len(P), 'triangles': len(F), 'edges': len(edges), 'components': count,
        'componentVertexCounts': np.bincount(labels).tolist(), 'EulerCharacteristic': len(P) - len(edges) + len(F),
        'boundaryEdgeCount': len(boundary), 'boundaryVertexCount': len(vertices), 'boundaryComponents': loops,
        'boundaryComponentVertexCounts': np.bincount(loop_labels).tolist(), 'allBoundaryDegreesTwo': bool(np.all(degrees == 2)),
        'nonmanifoldEdges': edges[uses > 2].tolist()}, boundary


def main():
    started = time.monotonic()
    source_path = ROOT / 'prototype/public/assets/foundation/base-male-roundtrip.vrm'
    source_sha = '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'
    assert sha(source_path.read_bytes()) == source_sha
    g = GLB(source_path.read_bytes())
    p = g.doc['meshes'][0]['primitives'][5]
    material = g.doc['materials'][p['material']]
    assert material['name'] == 'M00_000_HairBack_00_HAIR'
    P = np.asarray(g.accessor(p['attributes']['POSITION']), float)
    F = np.asarray(g.accessor(p['indices']), int).reshape(-1, 3)
    used = np.unique(F)
    hair, local_faces = P[used], np.searchsorted(used, F)
    raw, boundary = topology(hair, local_faces)
    positions, inverse = np.unique(hair, axis=0, return_inverse=True)
    quotient_faces = inverse[local_faces]
    quotient, quotient_boundary = topology(positions, quotient_faces)
    duplicates = [[int(v) for v in used[inverse == i]] for i in range(len(positions)) if np.count_nonzero(inverse == i) > 1]
    uv = np.asarray(g.accessor(p['attributes']['TEXCOORD_0']))
    duplicate_uv = [{'sourceVertices': group, 'UVs': uv[group].tolist(),
        'UVsDiffer': not all(np.array_equal(uv[group[0]], uv[v]) for v in group[1:])} for group in duplicates]
    skin_node = next(n for n in g.doc['nodes'] if n.get('mesh') == 0)
    skin = g.doc['skins'][skin_node['skin']]
    joint_values = np.asarray(g.accessor(p['attributes']['JOINTS_0']), int)[used]
    weights = np.asarray(g.accessor(p['attributes']['WEIGHTS_0']), float)[used]
    active_bones = sorted({g.doc['nodes'][skin['joints'][int(j)]]['name'] for J, W in zip(joint_values, weights)
        for j, w in zip(J, W) if w > 0})
    assert active_bones == ['J_Bip_C_Head']
    assert np.all(weights.sum(1) == 1)

    # Reuse the frozen full closest-triangle/barycentric method from the v2
    # source donor mapper. Every actual Body/Face skin triangle is included.
    closest_path = ROOT / 'scripts/m2-representative-batch-v2/deform.py'
    tree = ast.parse(closest_path.read_bytes())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Source')
    bind = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'bind')
    namespace = {'np': np, 'require': require, 'numeric': lambda a: sha(np.asarray(a).tobytes()), 'sha': sha}
    exec(compile(ast.Module([bind], []), str(closest_path) + ':bind-only', 'exec'), namespace)
    skin_points, skin_faces, skin_labels = [], [], []
    for mi, mesh in enumerate(g.doc['meshes']):
        for pi, primitive in enumerate(mesh['primitives']):
            name = g.doc['materials'][primitive['material']]['name']
            if not any(s in name for s in ['Body_00_SKIN', 'Face_00_SKIN']):
                continue
            points = np.asarray(g.accessor(primitive['attributes']['POSITION']), float)
            faces = np.asarray(g.accessor(primitive['indices']), int).reshape(-1, 3)
            offset = sum(len(a) for a in skin_points)
            skin_points.append(points)
            skin_faces.append(faces + offset)
            skin_labels.extend({'mesh': mi, 'primitive': pi, 'material': name, 'triangle': t,
                'sourceIndices': face.tolist()} for t, face in enumerate(faces))
    all_skin_points, all_skin_faces = np.concatenate(skin_points), np.concatenate(skin_faces)
    boundary_vertices = np.unique(boundary)
    boundary_midpoints = hair[boundary].mean(1)
    # No distance/Y threshold selects a supposed root region. Query all hair
    # vertices and every raw boundary edge midpoint with fixed source topology.
    queries = np.concatenate([hair, boundary_midpoints])
    donor = SimpleNamespace(P=all_skin_points, F=all_skin_faces, anchors={})
    result = namespace['bind'](donor, queries)
    anchors = result['anchor']
    distances = np.linalg.norm(queries - anchors, axis=1)
    assert np.isfinite(distances).all()
    nearest_ids = result['faces']
    nearest_vertices = cKDTree(all_skin_points[np.unique(all_skin_faces)]).query(hair)[0]
    vertex_rows = [{'sourceVertex': int(used[i]), 'positionM': hair[i].tolist(),
        'onRawBoundary': bool(i in boundary_vertices), 'unsignedSkinDistanceM': float(distances[i]),
        'nearestSkinTriangle': skin_labels[int(nearest_ids[i])], 'barycentric': result['bary'][i].tolist(),
        'skinPointM': anchors[i].tolist(), 'sourceOffsetVectorM': result['offset'][i].tolist(),
        'rootLabel': 'unknown-not-automatically-selected'} for i in range(len(hair))]
    edge_rows = [{'sourceEdge': used[edge].tolist(), 'midpointM': boundary_midpoints[i].tolist(),
        'unsignedSkinDistanceM': float(distances[len(hair) + i]),
        'nearestSkinTriangle': skin_labels[int(nearest_ids[len(hair) + i])],
        'barycentric': result['bary'][len(hair) + i].tolist(),
        'rootLabel': 'unknown-geometric-boundary-only'} for i, edge in enumerate(boundary)]
    quotient_rows = [{'sourceVertexGroups': [used[inverse == int(v)].tolist() for v in edge],
        'positionsM': positions[edge].tolist(), 'rootLabel': 'unknown-geometric-boundary-only'} for edge in quotient_boundary]
    quotient_boundary_vertices = np.unique(quotient_boundary)
    quotient_source_representatives = [int(np.flatnonzero(inverse == v)[0]) for v in quotient_boundary_vertices]
    build_report = json.loads((ROOT / 'assets-source/m2-male-hairstyle-v1/build-report.json').read_bytes())
    assert build_report['originalUsedVertices'] == used.tolist()
    assert np.array_equal(build_report['sourceWorldPositions'], hair)
    pins = [source_path, closest_path, ROOT / 'scripts/production/flow.py',
        ROOT / 'scripts/m2-male-hairstyle-v1/build.py', ROOT / 'assets-source/m2-male-hairstyle-v1/build-report.json',
        ROOT / 'assets-source/m2-male-hairstyle-v1/fit.json']
    report = {'schema': 'male-hair-attachment-source-topology-v1', 'source': {'path': source_path.relative_to(ROOT).as_posix(), 'sha256': source_sha},
        'primitive': {'mesh': 0, 'primitive': 5, 'positionAccessor': p['attributes']['POSITION'], 'indexAccessor': p['indices'],
            'material': material, 'indicesSHA256UInt32LE': sha(F.astype('<u4').tobytes())},
        'rawIndexedTopology': raw, 'exactPositionQuotientDiagnosticOnly': quotient,
        'exactPositionDuplicateSourceVertexGroups': duplicates, 'allReferencedSourceVertices': used.tolist(),
        'duplicatePositionUVDetails': duplicate_uv,
        'skeleton': {'activeBones': active_bones, 'weightSumExactlyOne': True,
            'sourceHairMorphTargets': len(p.get('targets', [])), 'node': skin_node['name'],
            'headIBM': np.asarray(g.accessor(skin['inverseBindMatrices']))[
                skin['joints'].index(next(i for i, n in enumerate(g.doc['nodes']) if n.get('name') == 'J_Bip_C_Head'))].tolist(),
            'meaning': 'One head binding supplies rigid follow. Bone weights do not distinguish roots, lengths or free tips.'},
        'skinRelation': {'method': 'Exact AST reuse of existing Source.bind, all actual Body_SKIN and Face_SKIN triangles, no Y/nearest subset selection.',
            'skinTriangles': len(all_skin_faces), 'allHairVertexDistance': summary(distances[:len(hair)]),
            'allRawBoundaryVertexDistance': summary(distances[boundary_vertices]),
            'allRawBoundaryEdgeMidpointDistance': summary(distances[len(hair):]),
            'allGeometricBoundaryCoordinateDistance': summary(distances[quotient_source_representatives]),
            'geometricBoundaryCoordinateCount': len(quotient_boundary_vertices),
            'allGeometricBoundarySourceVertexIds': used[np.isin(inverse, quotient_boundary_vertices)].tolist(),
            'exactHairVertexToSkinVertexCoincidences': int(np.count_nonzero(nearest_vertices == 0)),
            'scope': 'Unsigned nearest distance only. This is not scalp annotation, attachment proof, signed penetration or continuous edge/triangle clearance.'},
        'vertices': vertex_rows, 'allRawBoundaryEdges': edge_rows, 'allExactPositionQuotientBoundaryEdges': quotient_rows,
        'existingHairBuilderSourceIdentityMatches': True, 'tools': {'numpy': np.__version__, 'scipy': scipy.__version__,
            'topology': 'scipy.sparse.csgraph.connected_components plus exact index edge multiplicity',
            'trimeshInstalled': False, 'packagesInstalledByThisAudit': False},
        'pins': [{'path': x.relative_to(ROOT).as_posix(), 'sha256': sha(x.read_bytes())} for x in pins],
        'seconds': time.monotonic() - started, 'sourceChanged': False, 'rootAttachmentAccepted': False, 'runtimeAccepted': False}
    (OUT / 'readback.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    np.savez_compressed(OUT / 'source-diagnostic-arrays.npz', hairSourceIndices=used, hairPositionsM=hair,
        hairTriangles=local_faces, rawBoundaryEdges=boundary, exactPositionQuotientPositionsM=positions,
        exactPositionQuotientTriangles=quotient_faces, exactPositionQuotientBoundaryEdges=quotient_boundary,
        sourceSkinPositionsM=all_skin_points, sourceSkinTriangles=all_skin_faces)
    print(json.dumps({k: report[k] for k in ['rawIndexedTopology', 'exactPositionQuotientDiagnosticOnly', 'skinRelation', 'seconds']}))


if __name__ == '__main__':
    main()
