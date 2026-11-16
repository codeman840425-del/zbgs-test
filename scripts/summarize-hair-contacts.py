"""Summarize bounded actual room contact samples; never infer visual approval."""
import argparse
import hashlib
import json
from pathlib import Path


def stats(values):
    values = sorted(values)
    if not values:
        return {}
    return {'count': len(values), 'p50': values[int((len(values)-1)*.5)],
            'p95': values[int((len(values)-1)*.95)], 'max': values[-1]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('room', type=Path)
    args = parser.parse_args()
    source = args.room/'report.json'
    report = json.loads(source.read_text(encoding='utf-8'))
    data = report['measurements']
    result = {'build': report['build'], 'source': source.name,
              'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'status': report['status'], 'limits': [
                  '200ms vertex-in-OBB samples only; no triangle continuous collision guarantee',
                  'Timing is development machine with video and geometry diagnostics; not ordinary PC',
                  'Timer quantized about 0.1ms; zeros are not zero cost',
                  'Solver timing excludes garment dynamics and rendering; frame intervals are recorded separately'],
              'phases': {}}
    phases = sorted({sample['phase'] for key in ['contactSamples', 'solverTimes', 'frameIntervals'] for sample in data[key]})
    for phase in phases:
        contacts = [sample for sample in data['contactSamples'] if sample['phase'] == phase]
        boxes = [box for sample in contacts for box in sample['samples']]
        result['phases'][phase] = {
            'samples': len(contacts),
            'insideMax': max((box['inside'] for box in boxes), default=0),
            'depthMaxLocalM': max((box['maxDepthLocalM'] for box in boxes), default=0),
            **{key: stats([sample['ms'] for sample in data[key] if sample['phase'] == phase])
               for key in ['solverTimes', 'frameIntervals']}}
    result['settled'] = {key: report[key] for key in ['pantsSeated', 'skirtSeated']}
    result['device'] = data['device']
    target = args.room/'diagnostic-summary.json'
    if target.exists():
        raise FileExistsError(f'Refusing to replace retained evidence: {target}')
    target.write_bytes((json.dumps(result, ensure_ascii=False, indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'output': str(target), 'build': result['build'], 'phases': len(phases)}))


if __name__ == '__main__':
    main()
