"""Read-only exact-byte source backup check; no admission or regeneration."""
from pathlib import Path
import gzip, hashlib, json

root = Path(__file__).resolve().parents[3]
source = root / 'assets-source/m1/simple-skirt-v1'
manifest = json.loads((source / 'package-manifest.json').read_text(encoding='utf-8'))
for item in manifest['files']:
    path = root / item['path']
    assert path.is_file(), f'Missing {path}'
    assert path.stat().st_size == item['bytes'], f'Length changed: {path}'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256'], f'Hash changed: {path}'
capture = json.loads((source / 'input-269/manifest.json').read_text(encoding='utf-8'))
raw = gzip.decompress((source / 'input-269/four-poses.json.gz').read_bytes())
assert hashlib.sha256(raw).hexdigest() == capture['rawSha256']
assert len(json.loads(raw)['frames']) == 4
print(json.dumps({'status': 'exact-byte-package-valid', 'files': len(manifest['files']),
                  'poses': 4, 'acceptance': 'NOT admitted; identity only'}))
