"""Read requested full-skin targets only; never call a solver or export an asset."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name('result.json')
if OUT.exists():
    raise SystemExit('Preserve the first read-only result')
sys.path.insert(0, str(ROOT / 'scripts/m2-head-volume-slim-v1'))
import common

spec, domain, embedding, domain_report, guide, response, records, source = common.load_inputs()
loader = importlib.util.spec_from_file_location('source_reader_only', ROOT / spec['sourceReader'])
legacy = importlib.util.module_from_spec(loader)
loader.loader.exec_module(legacy)
context = legacy.source_context(source)
origin = np.asarray(response['rawHeadRestOriginM'])
P = np.asarray(response['sourcePointsM'])
F = np.asarray(response['sourceFaceTriangles'], int)
ids = np.unique(F)
face_lo = float(P[ids, 1].min() - origin[1])
nodes = domain['nodesM']
lookup = {tuple(point): i for i, point in enumerate(nodes)}
face_nodes = np.asarray([lookup[tuple(point)] for point in P[ids]], int)
classification_path = ROOT / 'assets-source/m2-head-attachment-slim-v1/preflight/classification-nodes.npz'
classification = np.load(classification_path, allow_pickle=False)
fixed = np.unique(np.r_[classification['newProtectedNodes'], domain['frameNodes']])
overlap = np.intersect1d(fixed, face_nodes)


def requested(points, parameters):
    # Exact original Head.fit target equations, generalized input set only.
    y = points[:, 1] - origin[1]
    jaw = 1 - legacy.smooth((y + .005) / .045)
    cheek = np.maximum(0, 1 - ((y - .005) / .045) ** 2) ** 2
    chin = 1 - legacy.smooth((y - face_lo) / (context['mouthMin'][1] - origin[1] - face_lo))
    target = points.copy()
    target[:, 0] += (points[:, 0] - origin[0]) * (parameters['jawWidth'] * jaw + parameters['cheekWidth'] * cheek)
    target[:, 1] -= parameters['chinLengthM'] * chin
    target[:, 2] -= parameters['chinProjectionM'] * chin
    return target


cases = []
tets = domain['tetrahedra']
controlled = np.unique(np.r_[face_nodes, fixed])
tet_ids = np.flatnonzero(np.isin(tets, controlled).all(axis=1))
T = tets[tet_ids]
base_volumes = np.linalg.det(np.transpose(nodes[T[:, 1:]] - nodes[T[:, :1]], (0, 2, 1)))
for identifier in ('male-long-lean-v2', 'male-round-stocky-v2'):
    request = next(row for row in response['requests'] if row['id'] == identifier)
    native = next(row for row in guide['cases'] if row['id'] == identifier)
    target_landmarks = requested(np.asarray(response['sourceLandmarksM']), request['parameters'])
    assert np.max(abs(target_landmarks - request['requestedLandmarksM'])) < 1e-12
    assert np.max(abs(requested(P[domain['guideSourceIndices']], request['parameters']) - native['requestedVertexPointsM'])) < 1e-12
    target = P.copy()
    target[ids] = requested(P[ids], request['parameters'])
    sections = common.horizontal_sections({response['sourceFacePositionAccessor']: target.astype(np.float32).astype(float)},
                                         response, request, origin, 'Float32 requested full-skin target, not solved')
    required = nodes.copy()
    required[face_nodes] = target[ids]
    collision = np.linalg.norm(required[overlap] - nodes[overlap], axis=1)
    exact_conflicts = overlap[collision > 0]
    # Do not override conflicts or pass them to a solver.
    volumes = np.linalg.det(np.transpose(required[T[:, 1:]] - required[T[:, :1]], (0, 2, 1)))
    ratio = volumes / base_volumes
    bad = np.flatnonzero(ratio <= .12)
    worst = np.argsort(ratio)[:8]
    cases.append({'id': identifier, 'targetOnly': True, 'nativeGuideEquationsIdentical': True,
        'requestedFullSkinSections': sections,
        'exactFixedNodeConflicts': exact_conflicts.tolist(),
        'fixedOverlapMaximumRequestDisplacementM': float(collision.max(initial=0)),
        'fullyControlledTetCount': len(T), 'minimumRequestedVolumeRatio': float(ratio.min()),
        'requestedTetsAtOrBelowPoint12': len(bad),
        'worstRequestedTets': [{'tetIndex': int(tet_ids[j]), 'nodes': T[j].tolist(), 'ratio': float(ratio[j])} for j in worst],
        'meaning': 'Necessary exact-target preflight only; soft SLIM output, free tetrahedra, expressions, contacts and game appearance untested'})

paths = [Path(__file__), ROOT / spec['domain'], ROOT / spec['response'], ROOT / spec['nativeGuide'],
         classification_path, ROOT / 'scripts/m2-representative-head-cage-v1/head.py',
         ROOT / 'scripts/m2-head-volume-slim-v1/common.py', ROOT / spec['sourceReader']]
result = {'schema': 'full-skin-request-readonly-preflight-v1', 'source': spec['source'],
    'sourceReferencedFaceVertices': len(ids), 'faceNativeNodes': len(np.unique(face_nodes)),
    'retainedFixedNodes': len(fixed), 'faceFixedNodeOverlap': len(overlap), 'totalControls': len(controlled),
    'cases': cases, 'solverCalled': False, 'geometryExported': False, 'runtimeAccepted': False,
    'inputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
assert 'igl' not in sys.modules
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False,
                          default=lambda value: value.item() if isinstance(value, np.generic) else str(value)) + '\n', encoding='utf-8')
print(json.dumps({'faceVertices': len(ids), 'cases': [{k: row[k] for k in ('id', 'minimumRequestedVolumeRatio', 'requestedTetsAtOrBelowPoint12', 'exactFixedNodeConflicts')} | {'requestedSectionErrorM': row['requestedFullSkinSections']['maximumErrorM']} for row in cases]}))
