"""Copy the verified source package unchanged; conflicting releases are refused."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'assets-source/m2-long-hair-v1/generated'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT/'prototype/public/assets/m2-long-hair-v1'))
    dest = Path(parser.parse_args().output).resolve()
    for entry in json.loads((SOURCE/'package-files.json').read_text(encoding='utf-8'))['files']:
        item = (ROOT/entry['path']).resolve()
        if not item.is_relative_to(ROOT):
            raise ValueError('Source path escapes repository')
        data = item.read_bytes()
        if len(data) != entry['bytes'] or sha(data) != entry['sha256']:
            raise ValueError('Source identity mismatch: '+entry['path'])
    for name in ['qa-report.json', 'runtime-cpu-qa.json']:
        if json.loads((SOURCE/name).read_text(encoding='utf-8')).get('passed') is not True:
            raise ValueError('Source validation did not pass: '+name)
    payload = {name:(SOURCE/name).read_bytes() for name in ['female-ponytail.glb','fit.json','manifest.json']}
    manifest = json.loads(payload['manifest.json'])
    fit = json.loads(payload['fit.json'])
    if manifest['sha256'] != sha(payload['female-ponytail.glb']) or manifest['fit']['sha256'] != sha(payload['fit.json']):
        raise ValueError('Runtime asset/fit identity mismatch')
    if (manifest['physics'], fit['schema'], fit['assetSha256']) != ('vrm-spring','character-hair-fit-v2',manifest['sha256']):
        raise ValueError('Not the declared skinned spring fit')
    if dest.exists():
        existing = {p.relative_to(dest).as_posix():p.read_bytes() for p in dest.rglob('*') if p.is_file()}
        if existing != payload:
            raise ValueError('Different existing release; use a new version/output')
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix='.hair-stage-',dir=dest.parent))
        try:
            for name,data in payload.items():
                (staging/name).write_bytes(data)
            os.rename(staging,dest)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    print(json.dumps({'published':True,'manifestSha256':sha(payload['manifest.json']),
                      'files':len(payload),'bytes':sum(map(len,payload.values()))}))

if __name__ == '__main__':
    try:
        main()
    except (ValueError,KeyError,TypeError,OSError) as error:
        print(json.dumps({'published':False,'error':str(error)}))
        raise SystemExit(2)
