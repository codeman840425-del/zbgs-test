"""Exact affected-state comparison. Wall-cost timers are not pose semantics."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TIMERS = {'fitElapsedMs', 'simulateMs'}


def read(path):
    data = path.read_bytes()
    if path.suffix == '.gz':
        data = gzip.decompress(data)
    return json.loads(data.decode('utf-8-sig'))


def semantic(value, parent=''):
    if isinstance(value, dict):
        return {k: semantic(v, k) for k, v in value.items()
                if k not in TIMERS and not (parent in {'live', 'liveState'} and k == 'time')}
    if isinstance(value, list):
        return [semantic(v, parent) for v in value]
    return value


def first_difference(a, b, location=''):
    if isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys():
            return location + ': keys differ'
        for key in a:
            difference = first_difference(a[key], b[key], location + '/' + key)
            if difference:
                return difference
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return f'{location}: lengths {len(a)} != {len(b)}'
        for i, (x, y) in enumerate(zip(a, b)):
            difference = first_difference(x, y, f'{location}/{i}')
            if difference:
                return difference
    elif a != b:
        return f'{location}: {a!r} != {b!r}'
    return None


cases = [
    ('state', 'evidence/hand-release-038341558517/state/report.json',
     'state-candidate/report.json',
     ['refreshChecks', 'cleanAfterOff', 'outfitBefore', 'outfitAfter',
      'reenabled', 'riseEnd', 'reset', 'resetSeedCleared']),
    *[(body, f'evidence/hand-release-038341558517/variant-boundary/{body}/contact/actual-surfaces.json.gz',
       f'variant-candidate/{body}/actual-surfaces.json.gz',
       ['scenarioFailure', 'timeline', 'rows', 'maxHits', 'assetCombination', 'selectedMeshes'])
      for body in ['jaw', 'waisthip']],
    ('mic-silent', 'evidence/mic-skirt-038-vs-7a86/sit-trigger-silent-candidate/trace.json.gz',
     'mic-silent-candidate/trace.json.gz',
     ['errors', 'speaking', 'frames', 'rows', 'maxHits', 'sourcePins', 'selectedMeshes']),
]
results = []
for name, before, after, fields in cases:
    pa, pb = ROOT / before, HERE / after
    a, b = read(pa), read(pb)
    assert a['build'] == '038341558517' and b['build'] == '6fb6c051aacd'
    differences = [first_difference(semantic(a[k]), semantic(b[k]), k) for k in fields]
    differences = [d for d in differences if d]
    live_clock = None
    clock_key = 'frames' if 'frames' in a else 'rows' if 'rows' in a else None
    if clock_key:
        live_key = 'live' if clock_key == 'frames' else 'liveState'
        offsets = [y[live_key]['time'] - x[live_key]['time']
                   for x, y in zip(a[clock_key], b[clock_key])]
        residual = max(abs(x - offsets[0]) for x in offsets)
        live_clock = {'initialOffsetSeconds': offsets[0],
                      'maxOffsetDriftSeconds': residual,
                      'reason': 'Live clock starts before debug pause/reset; retain its absolute difference, verify equal advancement.'}
        if residual > 1e-12:
            differences.append('Live clock advancement mismatch: ' + str(residual))
    results.append({'case': name, 'fields': fields, 'differences': differences,
                    'passed': not differences,
                    'liveClock': live_clock,
                    'samples': {k: len(b[k]) for k in ['timeline', 'frames', 'rows'] if k in b},
                    'beforeSHA256': hashlib.sha256(pa.read_bytes()).hexdigest(),
                    'afterSHA256': hashlib.sha256(pb.read_bytes()).hexdigest()})
report = {'oldBuild': '038341558517', 'candidateBuild': '6fb6c051aacd',
          'excludedWallTimers': sorted(TIMERS), 'results': results,
          'absoluteLiveClock': 'Excluded only live.time/liveState.time from pose comparison; offsets and drift reported separately. Initial failed comparison retained.',
          'passed': all(r['passed'] for r in results),
          'scope': 'Exact sampled runtime geometry, state and animation equality, no performance or new visual acceptance.'}
(HERE / 'runtime-equivalence.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
assert report['passed'], 'Runtime equality failed; first-difference evidence retained'
