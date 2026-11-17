"""Evaluate requested guide equations; no solver, mapped mesh, or asset output."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name('native-vertex-guide.json')
if OUT.exists():
    raise SystemExit('Refusing to overwrite evidence')
legacy_path = ROOT/'scripts/m2-representative-batch-v1/deform.py'
spec = importlib.util.spec_from_file_location('readonly_legacy', legacy_path)
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
result = {'schema': 'native-source-vertex-guide-v1', 'shapeSolveCalled': False,
          'geometryExported': False, 'targetMeaning': 'Requests only, not achieved positions',
          'originalTargetProducerSha256': hashlib.sha256((ROOT/'scripts/m2-representative-head-cage-v1/head.py').read_bytes()).hexdigest(),
          'sexes': []}
for sex in ('female', 'male'):
    path = ROOT/f'assets-source/m2-head-cage-skin-domain-v1/generated/{sex}.json'
    raw = path.read_bytes()
    data = json.loads(raw)
    body = (ROOT/data['source']['path']).read_bytes()
    assert hashlib.sha256(body).hexdigest() == data['source']['sha256']
    g = legacy.GLB(body)
    context = legacy.source_context(g)
    points = np.asarray(data['sourcePointsM'])
    origin = np.asarray(data['rawHeadRestOriginM'])
    faces = np.asarray(data['sourceFaceTriangles'])
    face_lo = float(points[np.unique(faces), 1].min()-origin[1])
    ids = sorted({i for row in data['landmarks'] for i in (row['a'], row['b'])})
    source_guides = points[ids]
    lookup = {index: i for i, index in enumerate(ids)}
    def requested(P, parameters):
        y = P[:, 1]-origin[1]
        jaw = 1-legacy.smooth((y+.005)/.045)
        cheek = np.maximum(0, 1-((y-.005)/.045)**2)**2
        chin = 1-legacy.smooth((y-face_lo)/(context['mouthMin'][1]-origin[1]-face_lo))
        T = P.copy()
        T[:, 0] += (P[:, 0]-origin[0])*(parameters['jawWidth']*jaw+parameters['cheekWidth']*cheek)
        T[:, 1] -= parameters['chinLengthM']*chin
        T[:, 2] -= parameters['chinProjectionM']*chin
        return T
    record = {'sex': sex, 'responseSha256': hashlib.sha256(raw).hexdigest(),
              'source': data['source'], 'guideVertexCount': len(ids),
              'guideVertexIndices': ids, 'positionAccessor': data['sourceFacePositionAccessor'], 'sourcePointsM': source_guides.tolist(), 'errorEvidence': 'evidence/m2-face-target-next-method-review-v1/vertex-guide-readback.json', 'cases': []}
    for request in data['requests']:
        original = np.asarray(request['requestedLandmarksM'])
        recalculated = requested(np.asarray(data['sourceLandmarksM']), request['parameters'])
        assert abs(recalculated-original).max() < 1e-12
        guides = requested(source_guides, request['parameters'])
        reconstructed = np.asarray([(1-row['t'])*guides[lookup[row['a']]]+row['t']*guides[lookup[row['b']]]
                                    for row in data['landmarks']])
        error = reconstructed-original
        record['cases'].append({'id': request['id'], 'parameters': request['parameters'], 'requestedVertexPointsM': guides.tolist(),
            'originalTargetEquationReadbackMaximumCoordinateErrorM': float(abs(recalculated-original).max()),
            'guideInterpolationMaximumCoordinateErrorM': float(abs(error).max()),
            'guideInterpolationMaximumEuclideanErrorM': float(np.linalg.norm(error, axis=1).max()),
            'guideInterpolationAllErrorM': error.tolist(),
            'meaning': 'Approximate vertex guide. Neither achieved geometry nor a certificate for actual horizontal sections.'})
    result['sexes'].append(record)
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
print(json.dumps({'output': OUT.as_posix(), 'shapeSolveCalled': False, 'geometryExported': False}))
