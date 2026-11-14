"""Curate existing fixed evidence without rewriting original files or videos."""
import gzip
import hashlib
import json
import pathlib
import shutil
import sys

build = sys.argv[1] if len(sys.argv) > 1 else 'a3f0c319f4f6'
src = pathlib.Path('output/playwright/m1c-live') / build
dst = pathlib.Path('evidence') / ('live-' + build)
dst.mkdir(parents=True, exist_ok=True)
names = ['female-pants.webm', 'female-skirt.webm', 'male-pants.webm', 'compact-summary.json',
         'female-pants-decoded-blink.png', 'female-skirt-840.png', 'male-pants-1020.png']
for name in names:
    shutil.copyfile(src / name, dst / name)
(dst / 'report.json.gz').write_bytes(gzip.compress((src / 'report.json').read_bytes(), mtime=0))
reports = json.loads((src / 'report.json').read_text(encoding='utf8'))
manifest = {
    'build': build, 'sourceDigest': reports[0]['build']['sourceDigest'],
    'fixedDist': 'experiments/m1-' + build + '/dist',
    'development': False, 'rawEvidence': str(src).replace('\\', '/'),
    'capture': 'Actual fixed runtime, 1x wall-clock sequence, no module injection.',
    'screenshots': {
        'female-pants-decoded-blink.png': 'front, original video decoded nearest 2.65s; blink',
        'female-skirt-840.png': 'side, simulated7s; seated',
        'male-pants-1020.png': 'side, simulated8.5s; rising',
    },
    'limits': ['Two actual camera angles, three representative action instants; no back view recorded.',
               'Fine grip failed approximate handle contact probe (~9.2mm penetration).',
               'Procedural vowel demonstration, not audio lipsync.',
               'Full report gzip is byte-exact original report after decompression; timeline sheets intentionally omitted.'],
    'files': [], 'qaSources': [],
}
for file in sorted(dst.iterdir()):
    if file.name == 'manifest.json' or not file.is_file():
        continue
    data = file.read_bytes()
    manifest['files'].append({'file': file.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
for name in ['scripts/m1c/qa-live-fixed.cjs', 'scripts/m1c/review-video.py', 'scripts/m1c/summarize-live-fixed.py', 'scripts/m1c/package-live-evidence.py']:
    data = pathlib.Path(name).read_bytes()
    manifest['qaSources'].append({'file': name, 'sha256': hashlib.sha256(data).hexdigest()})
manifest['originalReportSha256'] = hashlib.sha256((src / 'report.json').read_bytes()).hexdigest()
(dst / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
assert gzip.decompress((dst / 'report.json.gz').read_bytes()) == (src / 'report.json').read_bytes()
print(str(dst), len(manifest['files']), 'files, gzip roundtrip verified')
