"""Read existing targets only; no solve, source edit, or geometry export."""
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name('target-readback.json')
if OUT.exists():
    raise SystemExit('Refusing to overwrite evidence')
result = {'schema': 'face-target-readonly-review-v1', 'shapeSolveCalled': False,
          'geometryExported': False, 'sexes': []}
for sex in ('female', 'male'):
    path = ROOT / f'assets-source/m2-head-cage-skin-domain-v1/generated/{sex}.json'
    raw = path.read_bytes()
    data = json.loads(raw)
    source = np.asarray(data['sourceLandmarksM'])
    origin = np.asarray(data['rawHeadRestOriginM'])
    groups = {}
    for i, row in enumerate(data['landmarks']):
        key = tuple(sorted((row['a'], row['b'])))
        t = row['t'] if row['a'] == key[0] else 1 - row['t']
        groups.setdefault(key, []).append((t, i))
    record = {'sex': sex, 'path': path.relative_to(ROOT).as_posix(),
              'sha256': hashlib.sha256(raw).hexdigest(),
              'uniqueSourceEdges': len(groups),
              'upperRightSourceLocalM': (source[-1]-origin).tolist(),
              'upperRightInterpolatedWeight': data['landmarks'][-1]['interpolatedVertexWeight'],
              'cases': []}
    for request in data['requests']:
        target = np.asarray(request['requestedLandmarksM'])
        maximum, witness = 0., None
        for key, entries in groups.items():
            entries = sorted(entries)
            a, ia = entries[0]
            b, ib = entries[-1]
            if b-a < 1e-10:
                continue
            for t, i in entries[1:-1]:
                alpha = (t-a)/(b-a)
                difference = abs(target[i]-(1-alpha)*target[ia]-alpha*target[ib])
                axis = int(difference.argmax())
                # For any affine edge output with coordinate error <= e,
                # this three-point chord deviation cannot exceed 2*e.
                bound = float(difference[axis]/2)
                if bound > maximum:
                    maximum = bound
                    witness = {'edge': list(key), 'sampleIndices': [ia, i, ib],
                               'axis': axis, 'alpha': alpha}
        record['cases'].append({'id': request['id'],
            'upperRightRequestedDisplacementM': (target[-1]-source[-1]).tolist(),
            'minimumRequestedYGapM': float(np.diff(target[::2, 1]).min()),
            'provenCoordinateResidualLowerBoundM': maximum,
            'witness': witness,
            'interpretation': 'Lower bound only. A value below 2mm is not a feasibility certificate.'})
    result['sexes'].append(record)
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
print(json.dumps({'output': OUT.as_posix(), 'sexes': len(result['sexes']), 'shapeSolveCalled': False}))
