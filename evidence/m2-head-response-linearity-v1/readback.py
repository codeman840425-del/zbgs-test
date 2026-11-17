"""Recheck measured response against retained failed controls; no geometry export."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if args.output.exists():
    raise RuntimeError('Refuse to replace original evidence')
base = root / 'assets-source/m2-head-cage-response-probe-v1/generated'
failed = root / 'assets-source/m2-representative-head-cage-v1/diagnostic-v1/exports/once'
rows, inputs = [], []


def read(p):
    data = p.read_bytes()
    inputs.append({'path': p.relative_to(root).as_posix(), 'sha256': hashlib.sha256(data).hexdigest()})
    return json.loads(data)


for sex in ['female', 'male']:
    data = read(base / (sex + '.json'))
    matrix = np.asarray(data['flattenedResponseAxisMajor'])
    origin = np.asarray(data['sourceFlatAxisMajor'])
    for request in data['requests']:
        fit = read(failed / (request['basePresetId'] + '-head-cage-diagnostic-v1') / 'report.json')['fit']
        coefficients = np.asarray(fit['coefficientsM']).reshape(-1)
        actual = np.asarray(fit['achievedPointsM']).T.reshape(-1)
        error = (origin + matrix @ coefficients - actual).reshape(3, -1).T
        same_source = bool(np.array_equal(origin, np.asarray(fit['sourcePointsM']).T.reshape(-1)))
        assert same_source
        rows.append({'id': request['basePresetId'],
                     'maximumCoordinateErrorM': float(abs(error).max()),
                     'maximumPointDistanceM': float(np.linalg.norm(error, axis=1).max()),
                     'rmsCoordinateErrorM': float(np.sqrt((error * error).mean())),
                     'maximumActualCoefficientM': float(abs(coefficients).max()),
                     'actualAndProbeSourceMatch': same_source})
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'status': 'observed-not-admission', 'inputs': inputs, 'cases': rows,
                                  'limits': ['Original eight failed controls and base202 attached points only; no new solve or geometry acceptance.']}, indent=2) + '\n', encoding='utf-8')
