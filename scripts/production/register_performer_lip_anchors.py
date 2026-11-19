"""Publish source-verified lip landmarks for exactly the configured game bodies."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory

from lip_anchor import build, write_or_verify
from production_paths import catalog_lock, project_output


ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path('prototype/src/performer-lip-anchors.json')
URL_ROOT = '/assets/performer-lip-anchors-v1/'
DEFAULT_INPUTS = ROOT / 'assets-source/performer-lip-anchors-v1/inputs.json'
PROFILE_QUERY = """
import {foundationProfile} from './prototype/src/foundation-profiles.js';
console.log(JSON.stringify(process.argv.slice(1).map(id=>{
  const {url,sha256}=foundationProfile(id);
  return {url,sha256};
})));
"""


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode()


def checked(path):
    destination = project_output(path, __file__)
    if destination != Path(os.path.abspath(path)):
        raise ValueError('Redirected lip-anchor publication path: ' + str(path))
    return destination


def prepare(batch_file):
    batch = json.loads(batch_file.read_bytes())
    if not isinstance(batch, dict) or batch.get('schema') != 'performer-lip-anchor-intake-v1' or not isinstance(batch.get('entries'), list) or not batch['entries']:
        raise ValueError('Expected a nonempty performer-lip-anchor-intake-v1 batch')
    if any(not isinstance(row, dict) or any(not isinstance(row.get(key), str) or not row[key].strip()
               for key in ('bodyType', 'descriptor')) for row in batch['entries']):
        raise ValueError('Each lip-anchor input needs a bodyType and descriptor path')
    ids = [row['bodyType'] for row in batch['entries']]
    profiles = json.loads(subprocess.check_output(
        ['node', '--input-type=module', '-e', PROFILE_QUERY, '--', *ids], cwd=ROOT))
    prepared = {}
    public = (ROOT / 'prototype/public').resolve()
    for row, profile in zip(batch['entries'], profiles, strict=True):
        if not profile['url'].startswith('/assets/'):
            raise ValueError('Registered body is not a local public asset')
        body = (public / profile['url'][1:]).resolve()
        if not body.is_relative_to(public):
            raise ValueError('Registered body resolves outside the public assets')
        descriptor = json.loads((batch_file.parent / row['descriptor']).read_bytes())
        part = descriptor['faceMouth']
        body_sha = profile['sha256']
        measured = build(body, body_sha, part['mesh'], part['primitive'], part['material'], checkout=ROOT)
        # Read-only inputs can be moved or renamed. Publish portable provenance
        # for the verified in-game body; the original receipt stays untouched.
        descriptor['source']['path'] = measured['source']['path']
        if json.dumps(descriptor, sort_keys=True) != json.dumps(measured, sort_keys=True):
            raise ValueError('Lip descriptor differs from the registered body: ' + row['bodyType'])
        prepared[body_sha] = encoded(measured)
    return prepared


def install(root, prepared, *, check=False):
    catalog = checked(root / CATALOG)
    lock = root / 'output/performer-lip-registry.lock'
    with catalog_lock(lock, checked):
        previous = catalog.read_bytes()
        registry = json.loads(previous)
        if not isinstance(registry, dict):
            raise ValueError('Invalid lip-anchor registry')
        files = []
        for body_sha, data in prepared.items():
            if not re.fullmatch(r'[0-9a-f]{64}', body_sha):
                raise ValueError('Expected a lowercase body SHA-256')
            url = URL_ROOT + body_sha + '.json'
            target = checked(root / 'prototype/public' / url[1:])
            pin = {'url': url, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            if body_sha in registry and registry[body_sha] != pin:
                raise ValueError('Conflicting lip-anchor registration: ' + body_sha)
            if target.exists() and target.read_bytes() != data:
                raise ValueError('Conflicting lip-anchor asset: ' + str(target))
            if check and (registry.get(body_sha) != pin or not target.is_file()):
                raise ValueError('Missing published lip-anchor registration or asset: ' + body_sha)
            registry[body_sha] = pin
            files.append((target, data))
        if not check:
            for target, data in files:
                write_or_verify(target, data)
            updated = encoded(dict(sorted(registry.items())))
            if previous != updated:
                with TemporaryDirectory(dir=catalog.parent) as tmp:
                    staged = Path(tmp) / catalog.name
                    staged.write_bytes(updated)
                    os.replace(staged, catalog)
        return {key: registry[key] for key in prepared}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=Path, default=DEFAULT_INPUTS)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(install(ROOT, prepare(args.batch.resolve()), check=args.check), indent=2))
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')
