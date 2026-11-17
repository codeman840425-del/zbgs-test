import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
manifest_bytes = (root / 'transfer-manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
for entry in manifest['files']:
    data = (root / entry['path']).read_bytes()
    assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256'], entry['path']

def inventory(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in directory.rglob('*') if p.is_file()}

original = inventory(root / 'viewer')
rebuilt = inventory(root / 'source/prototype/dist-company')
assert original == rebuilt
report = {'status': 'passed', 'build': manifest['buildId'], 'manifestFiles': len(manifest['files']),
          'runtimeFiles': len(original), 'identical': True, 'excludedFiles': [],
          'commands': ['npm ci --no-audit --no-fund', 'node scripts/build-company-id.mjs',
                       'node node_modules/vite/bin/vite.js build --config vite.company.config.js'],
          'packageRoot': str(root), 'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest()}
pathlib.Path(__file__).with_name('rebuild.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(report))
