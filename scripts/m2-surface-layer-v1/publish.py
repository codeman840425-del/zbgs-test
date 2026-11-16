"""Publish a verified, immutable surface package; never overwrite other bytes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/m2-surface-layer-v1/generated'
def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', default=str(ROOT/'prototype/public/assets/m2-surface-layer-v1'))
    args = ap.parse_args()
    dest = Path(args.output).resolve()
    inventory = json.loads((SOURCE/'package-files.json').read_text(encoding='utf-8'))['files']
    for entry in inventory:
        path = (ROOT/entry['path']).resolve()
        if not path.is_relative_to(ROOT): raise ValueError('Source inventory escaped repository')
        data = path.read_bytes()
        if len(data) != entry['bytes'] or sha(data) != entry['sha256']:
            raise ValueError('Source inventory mismatch: '+entry['path'])
    qa = json.loads((SOURCE/'qa-report.json').read_text(encoding='utf-8'))
    if qa.get('passed') is not True: raise ValueError('Source checks have not passed')
    manifest_bytes = (SOURCE/'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get('schema') != 'character-surface-layer-v1': raise ValueError('Invalid surface schema')
    payload = {'manifest.json': manifest_bytes}
    def include(ref):
        name = ref['url']
        if Path(name).name != name or '/' in name or '\\' in name: raise ValueError('Unsafe source filename')
        data = (SOURCE/name).read_bytes()
        if sha(data) != ref['sha256']: raise ValueError('Resource identity mismatch: '+name)
        if name in payload and payload[name] != data: raise ValueError('Duplicate resource conflict')
        payload[name] = data
    for variant in manifest['variants']:
        include(variant['protectedMask'])
        for layer in variant['layers']:
            include(layer); include(layer['regionMask'])
    if dest.exists():
        existing = {p.relative_to(dest).as_posix():p.read_bytes() for p in dest.rglob('*') if p.is_file()}
        if existing != payload: raise ValueError('Different existing release; use a new output/version')
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix='.surface-stage-', dir=dest.parent))
        try:
            for name, data in payload.items(): (staging/name).write_bytes(data)
            # Same filesystem rename publishes all files together.
            os.rename(staging, dest)
        finally:
            if staging.exists(): shutil.rmtree(staging)
    print(json.dumps({'published':True,'manifestSha256':sha(manifest_bytes),'files':len(payload),'bytes':sum(map(len,payload.values()))}))

if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'published':False,'error':str(error)})); raise SystemExit(2)
