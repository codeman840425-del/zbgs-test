"""Read-only exact source identity check. Source geometry checks do not admit animation."""
from pathlib import Path
import argparse
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-outer-panels-v2'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB, Validator

parser = argparse.ArgumentParser()
parser.add_argument('--require-static', action='store_true')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
manifest = json.loads((BASE / 'manifest.json').read_text(encoding='utf-8'))
for row in manifest['files']:
    path = (BASE / row['path']).resolve()
    assert path.is_relative_to(BASE) and path.stat().st_size == row['bytes'] and sha(path) == row['sha256'], row['path']
spec = json.loads((BASE / 'spec.json').read_text(encoding='utf-8'))
assert sha(ROOT / 'prototype/public/assets/foundation/base-male-roundtrip.vrm') == spec['bodySha256']
assert sha(ROOT / spec['parentTop']) == spec['parentTopSha256']
report = json.loads((BASE / 'generated/report.json').read_text(encoding='utf-8'))
assert sha(ROOT / 'scripts/m2-outer-panels-v2/build.py') == report['generatorSha256']
assert sha(BASE / 'spec.json') == report['specSha256']
body = GLB((ROOT / 'prototype/public/assets/foundation/base-male-roundtrip.vrm').read_bytes())
entry = json.loads((BASE / 'generated/author-equipment.json').read_text(encoding='utf-8'))['items'][0]
binding = Validator(ROOT).equipment(entry, spec['bodySha256'], body, 'assets-source/m2-outer-panels-v2/generated/author-equipment.json')
audit = json.loads((BASE / 'generated/source-audit.json').read_text(encoding='utf-8'))
for label, path in [('pants', 'prototype/public/assets/m1b/m1b-uniform-pants.glb'), ('shorts', 'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb')]:
    assert sha(ROOT / path) == audit['contacts'][label]['sha256']
if args.require_static:
    assert audit['passedNoInitialIntersections']
print(json.dumps({'identityPassed': True, 'binding': binding, 'sourceCollisionChecksPassed': audit['passedNoInitialIntersections'], 'gameAcceptance': False}))
