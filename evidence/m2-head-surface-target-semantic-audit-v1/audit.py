"""Pure target arithmetic and source support-set audit. Never import a solver."""
import sys
sys.dont_write_bytecode = True
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name('result.json')
if OUT.exists():
    raise SystemExit('Refusing to overwrite completed evidence')
sys.path.insert(0, str(ROOT / 'scripts/m2-head-volume-slim-v1'))
import common
spec, D, B, domain_report, guide, response, records, source = common.load_inputs()
loader = importlib.util.spec_from_file_location('semantic_source_reader', ROOT / spec['sourceReader'])
legacy = importlib.util.module_from_spec(loader)
loader.loader.exec_module(legacy)
context = legacy.source_context(source)
origin = np.asarray(response['rawHeadRestOriginM'])
P = np.asarray(response['sourcePointsM'])
F = np.asarray(response['sourceFaceTriangles'], int)
ids = np.unique(F)
face_lo = float(P[ids, 1].min() - origin[1])
V, T = D['nodesM'], D['tetrahedra']
lookup = {tuple(p): i for i, p in enumerate(V)}
face_nodes = np.asarray([lookup[tuple(p)] for p in P[ids]], int)
node_face = {int(n): ids[face_nodes == n].tolist() for n in np.unique(face_nodes)}
classification_path = ROOT / 'assets-source/m2-head-attachment-slim-v1/preflight/classification-nodes.npz'
C = np.load(classification_path, allow_pickle=False)
fixed = np.unique(np.r_[C['newProtectedNodes'], D['frameNodes']])
overlap = np.intersect1d(face_nodes, fixed)
preflight_path = ROOT / 'evidence/m2-head-surface-target-preflight-v1/check.py'
tree = ast.parse(preflight_path.read_bytes())
requested_ast = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'requested')
exec(compile(ast.Module([requested_ast], []), str(preflight_path) + ':requested-only', 'exec'))
root_result = json.loads(preflight_path.with_name('result.json').read_bytes())

# Conservative source support: every triangle crossing any original source plane,
# before any z filter. Include all its vertices; do not select extremal edges only.
source_levels = np.asarray(response['sourceLandmarksM'])[::2, 1] - origin[1]
local = P - origin
tri_y = local[F, 1]
cross = (tri_y.min(axis=1)[:, None] <= source_levels) & (tri_y.max(axis=1)[:, None] >= source_levels)
support_triangles = np.flatnonzero(cross.any(axis=1))
support_ids = np.unique(F[support_triangles])
support_nodes = np.unique([lookup[tuple(p)] for p in P[support_ids]])
support_plus_guides = np.union1d(support_nodes, D['guideNodes'])
support_controls = np.union1d(support_plus_guides, fixed)
support_full_tets = np.flatnonzero(np.isin(T, support_controls).all(axis=1))
full_controls = np.union1d(face_nodes, fixed)
full_tets = np.flatnonzero(np.isin(T, full_controls).all(axis=1))
base_det = np.linalg.det(np.swapaxes(V[T[full_tets, 1:]] - V[T[full_tets, :1]], 1, 2))

cases = []
conflict_union = set()
for identifier in ('male-long-lean-v2', 'male-round-stocky-v2'):
    request = next(r for r in response['requests'] if r['id'] == identifier)
    native = next(r for r in guide['cases'] if r['id'] == identifier)
    assert np.max(abs(requested(np.asarray(response['sourceLandmarksM']), request['parameters']) - request['requestedLandmarksM'])) < 1e-12
    assert np.max(abs(requested(P[D['guideSourceIndices']], request['parameters']) - native['requestedVertexPointsM'])) < 1e-12
    Q = P.copy()
    Q[ids] = requested(P[ids], request['parameters'])
    required = V.copy()
    required[face_nodes] = Q[ids]
    conflicts = overlap[np.linalg.norm(required[overlap] - V[overlap], axis=1) > 0]
    conflict_union.update(map(int, conflicts))
    conflict_displacements = [{'node': int(n), 'deltaM': (required[n]-V[n]).tolist(), 'distanceM': float(np.linalg.norm(required[n]-V[n]))} for n in conflicts]
    # The one requested alternative: exact fixed semantics have priority.
    Q[ids[np.isin(face_nodes, fixed)]] = P[ids[np.isin(face_nodes, fixed)]]
    required[fixed] = V[fixed]
    assert np.array_equal(required[fixed], V[fixed])
    assert np.array_equal(Q[ids[~np.isin(face_nodes, fixed)]], requested(P[ids[~np.isin(face_nodes, fixed)]], request['parameters']))
    assert np.max(abs(Q[D['guideSourceIndices']] - native['requestedVertexPointsM'])) < 1e-12
    sections = common.horizontal_sections({response['sourceFacePositionAccessor']: Q.astype(np.float32).astype(float)}, response, request, origin, 'Float32 fixed-semantics-priority target only; not solved')
    original_sections = next(r for r in root_result['cases'] if r['id'] == identifier)['requestedFullSkinSections']
    assert sections['actualHalfWidthsM'] == original_sections['actualHalfWidthsM']
    sections['countAbove2mm'] = sum(a is not None and abs(a-b) > .002 for a,b in zip(sections['actualHalfWidthsM'], sections['requestedHalfWidthsM']))
    det = np.linalg.det(np.swapaxes(required[T[full_tets, 1:]] - required[T[full_tets, :1]], 1, 2)) / base_det
    bad = np.flatnonzero(det <= .12)
    bad_rows = []
    for j in bad:
        ti = int(full_tets[j])
        vertices = []
        for n in T[ti]:
            vertices.append({'node': int(n), 'skinSourceIndices': node_face.get(int(n), []), 'fixed': bool(n in fixed),
                'originalGuide': bool(n in D['guideNodes']), 'inSourceTriangleBand': bool(n in support_nodes),
                'sourceLocalM': (V[n]-origin).tolist(), 'targetLocalM': (required[n]-origin).tolist()})
        bad_rows.append({'tetIndex': ti, 'exactTargetVolumeRatio': float(det[j]), 'vertices': vertices,
            'stillFullyControlledBySourceBandPlusGuidesAndFixed': bool(ti in support_full_tets),
            'allSourceVerticesAboveFormalSourceY': bool(np.all(V[T[ti],1]-origin[1] > source_levels.max()))})
    cases.append({'id': identifier, 'targetOnly': True, 'nonzeroFixedConflicts': conflict_displacements,
        'maximumConflictDisplacementM': max(r['distanceM'] for r in conflict_displacements),
        'fixedPrioritySections': sections, 'all101WidthsExactlyEqualToOriginalFullSkinTarget': True,
        'original23GuideTargetsUnchanged': True, 'otherSkinTargetsUnchanged': True,
        'fullyControlledTetCount': len(full_tets), 'minimumExactTargetVolumeRatio': float(det.min()),
        'exactTargetTetsAtOrBelowPoint12': len(bad_rows), 'badExactTargetTets': bad_rows,
        'badTetsStillFullyControlledBySupportSetCount': sum(r['stillFullyControlledBySourceBandPlusGuidesAndFixed'] for r in bad_rows),
        'meaning': 'Exact-node target compatibility on fixed positive tet connectivity only; not actual soft output, continuous analytic-map Jacobian, surface impossibility or formal-gate impossibility.'})

# Reconstruct original GLB occurrence provenance, including all morph endpoints.
provenance = {n: [] for n in sorted(conflict_union)}
for row in records:
    primitive = source.doc['meshes'][row['mesh']]['primitives'][row['primitive']]
    A = np.asarray(source.accessor(row['positionAccessor']), float)
    if row['endpoint'] >= 0:
        A += np.asarray(source.accessor(primitive['targets'][row['endpoint']]['POSITION']), float)
    joints = np.asarray(source.accessor(primitive['attributes']['JOINTS_0']), int)
    weights = np.asarray(source.accessor(primitive['attributes']['WEIGHTS_0']), float)
    mesh_nodes = [(ni,n) for ni,n in enumerate(source.doc['nodes']) if n.get('mesh') == row['mesh']]
    for vi in row['sourceIndices']:
        n = lookup.get(tuple(A[vi]))
        if n not in conflict_union:
            continue
        bone_info=[]
        for ni, mesh_node in mesh_nodes:
            if 'skin' not in mesh_node:
                continue
            skin = source.doc['skins'][mesh_node['skin']]
            bone_info.append({'meshNode': ni, 'skin': mesh_node['skin'], 'nonzeroBones': [
                {'jointSlot': int(j), 'node': skin['joints'][int(j)], 'name': source.doc['nodes'][skin['joints'][int(j)]].get('name'), 'weight': float(w)}
                for j,w in zip(joints[vi], weights[vi]) if w != 0]})
        provenance[n].append({'mesh': row['mesh'], 'primitive': row['primitive'], 'material': row['material'],
            'positionAccessor': row['positionAccessor'], 'sourceIndex': vi, 'endpoint': row['endpoint'],
            'recordRole': row['role'], 'bones': bone_info})
conflict_rows = [{'node': n, 'sourceM': V[n].tolist(), 'localM': (V[n]-origin).tolist(),
    'skinSourceIndices': node_face[n], 'inSourceTriangleBand': n in support_nodes,
    'aboveAllFormalSourcePlanes': bool(V[n,1]-origin[1] > source_levels.max()), 'occurrences': provenance[n]} for n in sorted(conflict_union)]
assert all(any('EyeWhite' in o['material'] for o in r['occurrences']) for r in conflict_rows)
assert all(not any('EyeIris' in o['material'] or 'EyeHighlight' in o['material'] for o in r['occurrences']) for r in conflict_rows)

support = {'rule': 'Union of ALL Face_SKIN triangle vertices whose source Y interval contains at least one of the 101 source landmark Y planes. Inclusive interval; no z pruning, no silhouette-extremum pruning, no near-coordinate merge.',
    'sourceYRangeM': [float(source_levels.min()), float(source_levels.max())],
    'sourceLevelsM': source_levels.tolist(), 'sourceTriangleIndices': support_triangles.tolist(),
    'sourceVertexIndices': support_ids.tolist(), 'nativeNodes': support_nodes.tolist(),
    'triangles': len(support_triangles), 'vertices': len(support_ids), 'uniqueNodes': len(support_nodes),
    'sourceTriangleCountsPerPlane': cross.sum(axis=0).tolist(),
    'all101PlanesCovered': bool(cross.any(axis=0).all()),
    'sourceLocalBoundsM': [local[support_ids].min(axis=0).tolist(), local[support_ids].max(axis=0).tolist()],
    'fixedOverlapNodes': np.intersect1d(support_nodes, fixed).tolist(),
    'nonzeroConflictNodesIncluded': sorted(conflict_union & set(support_nodes)),
    'originalGuideSourceIndicesNotInBand': np.setdiff1d(D['guideSourceIndices'], support_ids).tolist(),
    'bandPlusGuideNodes': len(support_plus_guides), 'bandPlusGuidePlusFixedControls': len(support_controls),
    'fullyControlledTetCountForSetOnly': len(support_full_tets),
    'previousWorstTrianglesCovered': {str(i): bool(i in support_triangles) for i in [101,104,224,227,114,115,237,238]},
    'alternativeBandTargetEvaluated': False,
    'risk': 'Source support is deterministic and common to both presets; it does not prove future moved-in extrema, soft solve, det, expressions or attachment contacts. No third target, solve or new asset was made.'}
paths = [Path(__file__), preflight_path, preflight_path.with_name('result.json'), classification_path,
    ROOT/spec['domain'],ROOT/spec['embedding'],ROOT/spec['response'],ROOT/spec['nativeGuide'],ROOT/spec['source']['path'],
    ROOT/spec['endpointRecords'],ROOT/spec['sourceReader'],ROOT/'scripts/m2-head-volume-slim-v1/common.py',ROOT/'scripts/m2-representative-head-cage-v1/batch.py']
result = {'schema': 'head-surface-target-fixed-semantics-audit-v1', 'status': 'target-arithmetic-only-not-shape-admission',
    'sourceSkinVertices': len(ids), 'sourceSkinUniqueNodes': len(np.unique(face_nodes)), 'fixedNodesIncludingFrame': len(fixed),
    'skinFixedOverlapNodes': overlap.tolist(), 'nonzeroConflictNodeCount': len(conflict_union),
    'conflictSourceProvenance': conflict_rows, 'cases': cases, 'sourceRequestTriangleBand': support,
    'solverCalled': False, 'delaunayCalled': False, 'assetExported': False, 'runtimeAccepted': False,
    'embeddingUsed': False, 'embeddingOrderPreserved': 'If later used, simplexVertexIndices and barycentric must remain paired; never substitute positive tetrahedra order.',
    'pins': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}}
assert 'igl' not in sys.modules
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False, default=lambda v: v.item() if isinstance(v,np.generic) else str(v))+'\n', encoding='utf-8')
print(json.dumps({'conflictNodes': len(conflict_union), 'support': {k:support[k] for k in ['triangles','vertices','uniqueNodes','fixedOverlapNodes','nonzeroConflictNodesIncluded','originalGuideSourceIndicesNotInBand','bandPlusGuidePlusFixedControls']},
    'cases': [{'id': c['id'], 'sectionErrorM': c['fixedPrioritySections']['maximumErrorM'], 'badExactTets': c['exactTargetTetsAtOrBelowPoint12'], 'badTetsStillFullyControlledBySupport': c['badTetsStillFullyControlledBySupportSetCount']} for c in cases]}))
