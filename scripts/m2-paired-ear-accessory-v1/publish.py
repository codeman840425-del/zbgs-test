"""Publish the exact checked stud, manifest and base fits into one runtime directory."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/m2-paired-ear-accessory-v1/generated'
TARGET = ROOT / 'prototype/public/assets/m2-paired-ear-accessory-v1'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def publish(target_dir=TARGET):
    inventory = json.loads((SOURCE/'package-files.json').read_text(encoding='utf-8'))
    for row in inventory['files']:
        source = (ROOT/row['path']).resolve()
        if not source.is_relative_to(ROOT.resolve()):
            raise ValueError('Unsafe checked source inventory path')
        data = source.read_bytes()
        if digest(data) != row['sha256'] or len(data) != row['bytes']:
            raise ValueError('Checked source inventory mismatch: '+row['path'])
    manifest_bytes = (SOURCE/'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest['schema'] != 'zbgs-paired-rigid-accessory-style-v1' or manifest['version'] != 1:
        raise ValueError('Unsupported paired accessory source manifest')
    refs = [manifest['asset']] + manifest['fits']
    plan = {'manifest.json': manifest_bytes}
    for ref in refs:
        name = ref['file']
        if Path(name).name != name or '/' in name or '\\' in name or ':' in name:
            raise ValueError('Unsafe paired accessory file: '+name)
        data = (SOURCE/name).read_bytes()
        if digest(data) != ref['sha256'] or ('bytes' in ref and len(data) != ref['bytes']):
            raise ValueError('Paired accessory source integrity mismatch: '+name)
        plan[name] = data
    checked = json.loads((SOURCE/'qa-report.json').read_text(encoding='utf-8'))
    if checked['passed'] is not True or checked['runtimeAccepted'] is not False:
        raise ValueError('Expected source-only paired accessory QA')
    for name, data in plan.items():
        target = target_dir/name
        if target.exists() and target.read_bytes() != data:
            raise ValueError('Refusing differing existing runtime file: '+name)
    target_dir.mkdir(parents=True, exist_ok=True)
    # Write the manifest last so a new directory is consumed only with resources present.
    for name in [key for key in plan if key != 'manifest.json'] + ['manifest.json']:
        target = target_dir/name
        if not target.exists():
            temporary = target_dir/(name+'.tmp')
            temporary.write_bytes(plan[name])
            temporary.replace(target)
    return {'sourceManifestSha256': digest(manifest_bytes), 'published': [
        {'path': (target_dir/name).relative_to(ROOT).as_posix() if target_dir.is_relative_to(ROOT) else name,
         'bytes': len(data), 'sha256': digest(data)}
        for name, data in plan.items()], 'sourceOnlyProvenance': 'manifest provenance field refers to the retained source package; runtime fetches only asset and exact fit'}


if __name__ == '__main__':
    try:
        print(json.dumps(publish(), indent=2))
    except (OSError, ValueError, KeyError) as failure:
        print(json.dumps({'status': 'invalid', 'error': str(failure)}))
        sys.exit(1)
