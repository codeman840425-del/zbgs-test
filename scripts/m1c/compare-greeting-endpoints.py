"""Compare actual raw wrist trajectories from two fixed greeting reports; no browser."""
import json
import statistics
import sys
from pathlib import Path


def measure(path):
    report = json.loads(path.read_text(encoding='utf-8'))
    result = {'build': report['build'], 'sourceReport': str(path), 'cases': []}
    for case in report['cases']:
        def wrist_y(sample):
            return next(b['p'][1] for b in sample['leftRaw'] if b['name'] == 'leftHand')
        stable = [s for s in case['samples'] if s['mode'] == 'sit'
                  and s['sit'] == 1 and s['greeting']['status'] == 'completed']
        active = [s for s in case['samples'] if s['greeting']['requestId'] == 'seated-complete'
                  and s['greeting']['status'] == 'playing']
        assert stable and active
        baseline = statistics.median(map(wrist_y, stable))
        low = min(active, key=wrist_y)
        result['cases'].append({'name': case['config']['name'],
            'stableSamples': len(stable), 'activeSamples': len(active),
            'baselineMedianYMetres': baseline, 'lowestActiveYMetres': wrist_y(low),
            'dipBelowBaselineMm': (baseline-wrist_y(low))*1000,
            'lowestSample': low})
    return result


before, after, output = map(Path, sys.argv[1:4])
data = {'method': 'Median actual raw leftHand world-Y of stable fully seated completed samples, minus minimum raw leftHand world-Y during seated-complete playing samples. Negative means above baseline. Sample times are actual frame observations, not identical frame indices across recordings.',
        'limits': 'Vertical bone trajectory diagnostic, not hand/garment mesh contact or CCD. Compare visual timelines separately.',
        'before': measure(before), 'after': measure(after)}
output.write_text(json.dumps(data, indent=2), encoding='utf-8')
print(json.dumps({key: [{'name': c['name'], 'dipMm': c['dipBelowBaselineMm']} for c in data[key]['cases']]
                  for key in ['before', 'after']}, indent=2))
