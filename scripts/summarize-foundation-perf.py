"""Keep the full measured frames in a lossless archive and a compact report."""
from pathlib import Path
import argparse, gzip, hashlib, json

p = argparse.ArgumentParser()
p.add_argument('directory', type=Path)
a = p.parse_args()
source = a.directory / 'report.json'
raw = source.read_bytes()
data = json.loads(raw)
packed = gzip.compress(raw, mtime=0)
(a.directory / 'report.json.gz').write_bytes(packed)
assert gzip.decompress(packed) == raw

def p95(values):
    values = sorted(values)
    return values[int(len(values) * .95)] if values else None

summary = {key: data.get(key) for key in
           ['schema', 'build', 'detail', 'passed', 'scriptSHA256', 'sampleSeconds',
            'selectedCases', 'viewport', 'browser', 'meta', 'limitations']}
summary['rawSHA256'] = hashlib.sha256(raw).hexdigest()
summary['archiveSHA256'] = hashlib.sha256(packed).hexdigest()
summary['cases'] = []
for case in data['results']:
    result = {key: case.get(key) for key in
              ['config', 'summary', 'exclusiveSummary', 'validity', 'resources', 'valid']}
    samples = [f['lastSubstepHandFit'] for f in case['frames'] if f.get('lastSubstepHandFit')]
    if samples:
        result['lastSubstepHandFitP95'] = {
            k: p95([s[k] for s in samples if isinstance(s.get(k), (int, float))])
            for k in samples[0]}
    summary['cases'].append(result)
summary['interpretation'] = [
    'garmentMs measures the final updateGarment call only. Seated cloth may already have run inside motion/seatHandSurfaces; zero does not mean cloth is free.',
    'handSurfaceMs includes raw-pose synchronization and garment preparation, not cloth alone.',
    'lastSubstepHandFitP95 describes the last simulation substep per rendered frame, not the sum of all substeps. Its timings overlap motionMs.',
    'Detailed instrumentation changes cost. Do not present the difference from a non-detailed run as a product regression.',
    'Only this development machine and these short sustained samples; ordinary-PC acceptance remains untested.']
(a.directory / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
(a.directory / '.gitignore').write_text('/report.json\n', encoding='utf-8')
print(json.dumps({'build': data['build'], 'cases': len(summary['cases']), 'archiveBytes': len(packed), 'lossless': True}))
