"""Data-driven preparation of pinned native three-piece packages, not runtime admission.

Each item is published as a complete new directory. A failed item does not alter its
siblings. Existing output must match every byte; no identity is silently upgraded.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
loader = importlib.util.spec_from_file_location('native_stage', ROOT / 'scripts/stage-native-face-factory.py')
legacy = importlib.util.module_from_spec(loader)
loader.loader.exec_module(legacy)


def confined(root, name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name:
        raise ValueError('Expected relative POSIX resource path')
    path = PurePosixPath(name)
    if path.is_absolute() or any(p in ('', '.', '..') for p in name.split('/')):
        raise ValueError('Resource path escapes package')
    resolved = (root / name).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError('Resolved resource escapes package')
    return resolved


def digest(data):
    return hashlib.sha256(data).hexdigest()


def body_image(raw, coverage):
    if struct.unpack_from('<4sII', raw) != (b'glTF', 2, len(raw)):
        raise ValueError('Invalid body GLB')
    size, kind = struct.unpack_from('<I4s', raw, 12)
    if kind != b'JSON':
        raise ValueError('Missing GLB JSON')
    doc = json.loads(raw[20:20 + size])
    count, kind = struct.unpack_from('<I4s', raw, 20 + size)
    if kind != b'BIN\0' or 28 + size + count != len(raw):
        raise ValueError('Invalid embedded GLB binary')
    binary = raw[28 + size:]
    mats = [m for m in doc['materials'] if m.get('name') == coverage['materialName']]
    if len(mats) != 1:
        raise ValueError('Coverage body material is not unique')
    material = mats[0]
    texture = material['pbrMetallicRoughness']['baseColorTexture']['index']
    if material['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index'] != texture:
        raise ValueError('Unverified coverage shade consumer')
    image = doc['images'][doc['textures'][texture]['source']]
    view = doc['bufferViews'][image['bufferView']]
    if view.get('buffer') != 0 or 'uri' in image:
        raise ValueError('Expected embedded body image')
    start = view.get('byteOffset', 0)
    png = binary[start:start + view['byteLength']]
    if digest(png) != coverage['basePngSha256']:
        raise ValueError('Coverage base image does not match actual body')
    return png


def prepare(spec, source_root):
    required = {'bodyFile', 'files', 'bodySha256', 'bodyType', 'urlRoot', 'schema'}
    if set(spec) != required or not re.fullmatch('[0-9a-f]{64}', spec['bodySha256']):
        raise ValueError('Invalid native import spec')
    # Resolve every input before the legacy byte-pin checks, including junctions.
    for target, pair in spec['files'].items():
        confined(Path('unused-package-root').resolve(), target)
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError('Expected source path and SHA pair')
        confined(source_root, pair[0])
    body_key = spec['bodyFile']
    if not body_key.endswith('.vrm') or body_key not in spec['files']:
        raise ValueError('Missing explicit body VRM')
    if spec['files'][body_key][1] != spec['bodySha256']:
        raise ValueError('Body file pin disagrees with compatibility identity')
    files = legacy.plan(source_root, spec)
    if digest(files[body_key]) != spec['bodySha256']:
        raise ValueError('Actual body identity mismatch')
    equipment = json.loads(files['equipment.json'])
    coverage = json.loads(files['manifest.json'])
    garment_urls = {e['url'] for e in equipment['items']}
    expected_files = {body_key, 'equipment.json', 'manifest.json', coverage['covered']['url']} | garment_urls
    if len(garment_urls) != 3 or len(expected_files) != 7 or set(spec['files']) != expected_files:
        raise ValueError('Expected exact body/three garments/coverage package closure')
    if sorted(e['slot'] for e in equipment['items']) != ['bottom', 'shoes', 'top']:
        raise ValueError('Expected top/bottom/shoes slots')
    if not all(e.get('required') is True for e in coverage['equipment']):
        raise ValueError('Expected explicit coverage requirement')
    original = body_image(files[body_key], coverage)
    for png in (original, files[coverage['covered']['url']]):
        if png[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack_from('>II', png, 16) != (coverage['width'], coverage['height']):
            raise ValueError('Coverage PNG dimensions mismatch')
    return files


def exact_directory(folder, files):
    actual = {p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()}
    if any(p.is_symlink() or getattr(p, 'is_junction', lambda: False)() for p in folder.rglob('*')):
        raise ValueError('Existing package contains linked paths')
    if actual != set(files) or any((folder / n).read_bytes() != b for n, b in files.items()):
        raise ValueError('Existing package differs; create a new version')


def bindings(folder, spec):
    run = subprocess.run(['node', str(ROOT / 'scripts/production/native_import_bindings.mjs'), str(folder), spec['bodyFile']], capture_output=True, text=True, encoding='utf-8', timeout=120)
    if run.returncode:
        raise ValueError('Binding check failed: ' + run.stderr.strip()[-1500:])
    return json.loads(run.stdout)


def execute(batch, source_root, output):
    if set(batch) != {'schema', 'items'} or batch['schema'] != 'native-factory-import-batch-v1' or not isinstance(batch['items'], list) or not 1 <= len(batch['items']) <= 16:
        raise ValueError('Invalid bounded import batch')
    seen_ids, seen_packages = set(), set()
    for row in batch['items']:
        if set(row) != {'id', 'spec', 'package'} or not all(isinstance(v, str) for v in row.values()):
            raise ValueError('Invalid batch item')
        if not re.fullmatch('[a-z0-9][a-z0-9-]{0,79}', row['id']) or not re.fullmatch('[a-z0-9][a-z0-9-]{0,79}', row['package']):
            raise ValueError('Invalid item/package ID')
        if row['id'] in seen_ids or row['package'].lower() in seen_packages:
            raise ValueError('Duplicate item or package')
        seen_ids.add(row['id']); seen_packages.add(row['package'].lower())
        confined(source_root, row['spec'])
    # Never publish directly into live assets, source/evidence trees or a checkout.
    allowed = (ROOT / 'output').resolve()
    output = output.resolve()
    if not output.is_relative_to(allowed) or output == allowed:
        raise ValueError('Use a dedicated output/ candidate directory')
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for row in batch['items']:
        temp = None
        try:
            spec_bytes = confined(source_root, row['spec']).read_bytes()
            spec = json.loads(spec_bytes)
            if spec['urlRoot'] != '/assets/' + row['package'] + '/':
                raise ValueError('Package and URL root disagree')
            files = prepare(spec, source_root)
            dest = confined(output, row['package'])
            if dest.exists():
                exact_directory(dest, files)
                proof = bindings(dest, spec)
                state = 'reused-identical'
            else:
                temp = Path(tempfile.mkdtemp(prefix='.preparing-', dir=output))
                for name, data in files.items():
                    target = confined(temp, name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                proof = bindings(temp, spec)
                exact_directory(temp, files)
                try:
                    os.rename(temp, dest)
                    temp = None
                    state = 'prepared'
                except FileExistsError:
                    # A concurrent identical batch may have won publication.
                    exact_directory(dest, files)
                    state = 'reused-identical'
            results.append(dict(id=row['id'], state=state, bodyType=spec['bodyType'], bodySha256=spec['bodySha256'], specSha256=digest(spec_bytes), files=len(files), bindings=proof, runtimeAdmission='pending'))
        except Exception as error:
            results.append(dict(id=row['id'], state='failed', reason=str(error)))
        finally:
            if temp is not None:
                shutil.rmtree(temp)
    return dict(schema='native-factory-import-result-v1', passed=all(r['state'] != 'failed' for r in results), items=results, scope='Offline identity/coverage-reference/raw-binding preparation; not new authoring, full weights/deformation, runtime registration or visual acceptance')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = execute(json.loads(args.batch.read_text(encoding='utf-8')), ROOT, args.output)
    except Exception as error:
        report = dict(passed=False, reason=str(error))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
