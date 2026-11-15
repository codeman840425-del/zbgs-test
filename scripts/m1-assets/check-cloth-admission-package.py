"""Read-only archive verification. No Blender, restoration, fit or simulation."""
from pathlib import Path
import ast
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / 'assets-source/m1/cloth-admission-v1'
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda b: hashlib.sha256(b).hexdigest()
manifest = read(PACKAGE / 'manifest.json')

def verify(path, record):
    data = path.read_bytes()
    assert len(data) == record['bytes'], f'Length mismatch: {path}'
    assert sha(data) == record['sha256'], f'SHA mismatch: {path}'
    return data

for name, record in manifest['files'].items():
    verify(PACKAGE / name, record)
for name, digest in manifest['scripts'].items():
    data = (ROOT / 'scripts/m1-assets' / name).read_bytes()
    assert sha(data) == digest, f'Script SHA mismatch: {name}'
    ast.parse(data.decode('utf-8'))
for name, record in read(PACKAGE / 'integrity-check.json')['externalDependencies'].items():
    verify(ROOT / name, record)
for name, record in read(PACKAGE / 'input/manifest.json').items():
    data = (PACKAGE / 'input' / (name + '.gz')).read_bytes()
    assert len(data) == record['gzipBytes'] and sha(data) == record['gzipSha256']
    raw = gzip.decompress(data)
    assert len(raw) == record['bytes'] and sha(raw) == record['sha256']
    json.loads(raw)
fit = read(PACKAGE / 'source-fit/fit-result.json')
validation = read(PACKAGE / 'source-fit/static-validation.json')
assert fit['parametersSha256'] == sha((PACKAGE / 'fit-plan.json').read_bytes())
assert validation['sourceFitSha256'] == sha((PACKAGE / 'source-fit/fit-result.json').read_bytes())
assert validation['status'] == 'rejected-no-native-cloth-authorized'
print('PASS archive identity/readability; source fit remains REJECTED. No generation or simulation executed.')
