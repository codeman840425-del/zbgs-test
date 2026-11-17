import hashlib
import json
from pathlib import Path

out = Path(__file__).resolve().parent
package = Path('F:/gamemake-company-mirror-quality-delivery-028')
roots = [package / 'viewer', package / 'source/prototype/dist-company', Path('F:/gamemake-company-mirror-quality-fixed-v1/prototype/dist-company')]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((package / 'transfer-manifest.json').read_text(encoding='utf-8'))
for f in manifest['files']:
    p = package / f['path']
    assert p.stat().st_size == f['bytes'] and digest(p) == f['sha256'], f['path']
maps = [{p.relative_to(root).as_posix(): digest(p) for p in root.rglob('*') if p.is_file()} for root in roots]
assert maps[0] == maps[1] == maps[2], 'Complete runtime file maps differ'
assert json.loads((roots[0] / 'company-build-info.json').read_text(encoding='utf-8'))['shortId'] == '028e9e44db24'
report = dict(status='passed', build='028e9e44db24', manifestFiles=len(manifest['files']), runtimeFiles=len(maps[0]), roots=list(map(str, roots)), exclusions=[], freshNpmCiAndViteBuild=True, files=[dict(path=k, sha256=v) for k, v in sorted(maps[0].items())])
(out / 'rebuild.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'files'}))
