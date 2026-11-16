"""Publish an independently audited eight-body batch; never grants visual acceptance.

Run after the source producer commit has been integrated. Original palettes and
original assets stay immutable. New body identities get a separate palette package.
"""
import argparse
from collections import Counter
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'm2-representative-batch-v1'
PUBLIC = ROOT / 'prototype/public/assets' / PREFIX
SOURCE = ROOT / 'assets-source' / PREFIX

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf8')
    if path.exists() and path.read_bytes() != raw:
        raise ValueError('Refusing to silently replace published identity: ' + str(path))
    path.write_bytes(raw)

def copy_exact(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and sha(source) != sha(target):
        raise ValueError('Existing candidate differs; use a new explicit revision: ' + str(target))
    shutil.copyfile(source, target)

LABELS = {
    'female-round-full': '圆脸 · 丰满', 'female-long-slender': '长脸 · 纤细',
    'female-square-athletic': '方脸 · 运动体格', 'female-soft-wide': '柔和脸 · 宽腰胯',
    'male-wide-muscular': '宽脸 · 厚实体格', 'male-long-lean': '长脸 · 精瘦',
    'male-round-stocky': '圆脸 · 壮实', 'male-angular-athletic': '棱角脸 · 运动体格',
}

def reviewed_subset(manifest, audit):
    """Admit only fully audited source outputs; an incomplete batch stays incomplete."""
    expected = {key + '-v2' for key in LABELS}
    entries = manifest.get('variants', [])
    variants = audit.get('variants', [])
    if len(entries) != 8 or {v.get('id') for v in entries} != expected:
        raise ValueError('Partial preview still requires all eight declared source outcomes')
    if len(variants) != 8 or {v.get('id') for v in variants} != expected:
        raise ValueError('Audit must include each declared preset exactly once')
    audit_rows = {v['id']: v for v in variants}
    files = {v['path']: v for v in audit.get('files', [])}
    if len(files) != len(audit.get('files', [])):
        raise ValueError('Duplicate independently audited file')
    def require_audited(ref):
        path = (ROOT / ref['path']).resolve()
        if not path.is_relative_to(ROOT.resolve()):
            raise ValueError('Audited reference escapes project')
        relative = path.relative_to(ROOT.resolve()).as_posix()
        record = files.get(relative)
        if not record or record['sha256'] != ref['sha256'] or record['bytes'] != ref['bytes']:
            raise ValueError('Selected resource missing from exact audit: ' + relative)
        if path.stat().st_size != record['bytes'] or sha(path) != record['sha256']:
            raise ValueError('Selected audited resource changed: ' + relative)
        return path
    selected = [v for v in entries if v.get('status') == 'source-passed']
    failed = [v for v in entries if v.get('status') == 'failed']
    if len(selected) != 6 or {v['id'] for v in failed} != {'female-long-slender-v2', 'male-long-lean-v2'}:
        raise ValueError('This reviewed partial package must contain six outputs and the two recorded lean failures')
    for entry in selected:
        row = audit_rows[entry['id']]
        if row.get('passed') is not True or not row.get('checks') or any(c.get('passed') is not True for c in row['checks']):
            raise ValueError('Selected source has incomplete or failed independent checks: ' + entry['id'])
        for field in ['avatar', 'equipmentManifest', 'fit', 'profile', 'report']:
            require_audited(entry[field])
        equipment = read(ROOT / entry['equipmentManifest']['path'])
        if len(equipment['items']) != 3 or {i['slot'] for i in equipment['items']} != {'top','bottom','shoes'}:
            raise ValueError('Selected equipment is incomplete')
        directory = Path(entry['equipmentManifest']['path']).parent
        for item in equipment['items']:
            require_audited({'path': (directory / item['url']).as_posix(), 'sha256': item['sha256'], 'bytes': item['bytes']})
    # Remove the exact per-preset records from the complete check ledger. Global
    # failures may ONLY describe missing outputs from explicitly FAILED sources.
    key = lambda c: json.dumps(c, sort_keys=True, separators=(',', ':'))
    remaining = Counter(key(c) for c in audit.get('checks', []))
    for row in variants:
        if not row.get('checks'):
            raise ValueError('Empty per-preset audit')
        for check in row['checks']:
            token = key(check)
            if remaining[token] <= 0:
                raise ValueError('Per-preset checks do not belong to the complete audit')
            remaining[token] -= 1
    global_checks = [json.loads(token) for token, count in remaining.items() for _ in range(count)]
    if Counter(key(c) for c in audit.get('globalChecks', [])) != Counter(key(c) for c in global_checks):
        raise ValueError('Global audit ledger does not match its declared scope')
    allowed_missing = {'four-distinct-position-contents-' + v['sex'] for v in failed}
    if not global_checks or any(c.get('passed') is not True and c.get('name') not in allowed_missing for c in global_checks):
        raise ValueError('Shared audit failed beyond explicitly missing source outputs')
    for entry in failed:
        if audit_rows[entry['id']].get('passed') is not False or any(field in entry for field in ['avatar', 'equipmentManifest', 'profile', 'fit', 'report']):
            raise ValueError('Failed source must not claim an admitted resource')
        expected_checks = {'sex-' + entry['id']: True, 'exact-spec-parameters-' + entry['id']: True,
                           'source-status-' + entry['id']: False, 'failed-record-identity-' + entry['id']: True,
                           'readback-' + entry['id']: False}
        actual_checks = audit_rows[entry['id']]['checks']
        if len(actual_checks) != len(expected_checks) or {c['name']:c['passed'] for c in actual_checks} != expected_checks:
            raise ValueError('Failed preset audit scope includes unexpected checks')
    return selected, [{'id': v['id'], 'reason': v.get('error'), 'status': 'not-published-source-failed'} for v in failed]

def main():
    global PREFIX, PUBLIC, SOURCE
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', type=int, choices=[1, 2], default=1)
    parser.add_argument('--reviewed-subset', action='store_true', help='Revision 2 only: publish independently passed entries, retaining failed batch outcomes')
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--audit', required=True, type=Path)
    args = parser.parse_args()
    PREFIX = f'm2-representative-batch-v{args.revision}'
    PUBLIC, SOURCE = ROOT / 'prototype/public/assets' / PREFIX, ROOT / 'assets-source' / PREFIX
    labels = {key + ('-v2' if args.revision == 2 else ''): value for key, value in LABELS.items()}
    manifest, audit = read(args.manifest), read(args.audit)
    if args.manifest.resolve() != (SOURCE / 'generated/manifest.json').resolve():
        raise ValueError('Manifest path must match the explicitly requested revision')
    if manifest.get('schema') != 'character-representative-batch-v1' or manifest.get('version') != args.revision:
        raise ValueError('Manifest revision mismatch')
    if args.reviewed_subset:
        if args.revision != 2 or audit.get('status') != 'cpu-readback-incomplete-or-failed':
            raise ValueError('Reviewed subset requires explicit revision 2 and a truthful incomplete audit')
        publish_entries, unpublished = reviewed_subset(manifest, audit)
    else:
        if not audit.get('checks') or any(c.get('passed') is not True for c in audit['checks']):
            raise ValueError('Independent checks missing or failed')
        if audit['status'] != 'body-garment-cpu-readback-passed-appearance-runtime-pending':
            raise ValueError('Independent body readback has not passed')
        publish_entries, unpublished = manifest['variants'], []
    audited_manifest = next((entry for entry in audit['files'] if entry['path'] == audit['manifest']), None)
    if audited_manifest is None or args.manifest.resolve() != (ROOT / audit['manifest']).resolve() or sha(args.manifest) != audited_manifest['sha256']:
        raise ValueError('Requested manifest is not the exact independently audited manifest')
    for entry in audit['files']:
        # The integrated copy must still be the exact bytes independently read.
        if sha(ROOT / entry['path']) != entry['sha256']:
            raise ValueError('Audited input changed during integration: ' + entry['path'])
    if len(manifest['variants']) != 8 or {v['id'] for v in manifest['variants']} != set(labels):
        raise ValueError('Expected the whole agreed eight-preset batch')
    palette_source = ROOT / 'prototype/public/assets/appearance-color-v3/runtime-manifest.json'
    if sha(palette_source) != '2eff13c1d3837c4f8f76b7d97007b219059c212c1031d77e27a2f824715af321':
        raise ValueError('Existing palette package changed; new dependency audit required')
    palette = read(palette_source)
    derived_palette = {**palette, 'variants': []}
    index = {'schema': 'representative-runtime-index-v1', 'version': 1,
             'sourceManifestSha256': sha(args.manifest), 'auditSha256': sha(args.audit),
             'presets': [], 'noHair': [], 'palette': None,
             'limits': ['Source/bind admission only; runtime and visual acceptance separate.',
                        'Only per-preset top, pants or shorts, and flat shoes included.',
                        'New procedural medium curls rejected; not included.',
                        'No claim of arbitrary shape, hair, skirt or accessory compatibility.']}
    spec = importlib.util.spec_from_file_location('batch_glb_reader', ROOT / 'scripts/m2-male-face-v1/glb.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    if args.reviewed_subset:
        index.update(declaredBatchSize=8, completeBatch=False, unpublished=unpublished)
        index['limits'].append('Only six independently checked source candidates; face requests partially projected by 8.668–31.058 mm half-width. Not full requested appearance or whole-batch acceptance.')
    for entry in publish_entries:
        identifier, sex = entry['id'], entry['sex']
        folder = ROOT / Path(entry['avatar']['path']).parent
        target = PUBLIC / identifier
        profile = read(folder / 'profile.json')
        if profile['sha256'] != entry['avatar']['sha256'] or sha(folder / 'avatar.vrm') != profile['sha256']:
            raise ValueError('Profile body identity mismatch: ' + identifier)
        if args.revision == 2:
            base = entry.get('basePresetId')
            if base not in LABELS or identifier != base + '-v2' or profile.get('bodyType') != identifier:
                raise ValueError('Derived identity does not preserve its base preset: ' + identifier)
            if profile.get('url') != f'/assets/{PREFIX}/{identifier}/avatar.vrm':
                raise ValueError('Derived profile URL is outside its revision')
        equipment = read(folder / 'equipment.json')
        for filename in ['avatar.vrm', 'equipment.json', 'fit.json'] + [x['url'] for x in equipment['items']]:
            source = (folder / filename).resolve()
            if not source.is_relative_to(folder.resolve()):
                raise ValueError('Equipment path escaped candidate directory')
            copy_exact(source, target / filename)
        # Regenerate from actual source vertices; no inherited female radius or fake SHA.
        contact = SOURCE / 'runtime-contact' / identifier
        contact.mkdir(parents=True, exist_ok=True)
        subprocess.run([sys.executable, str(ROOT / 'scripts/m1-variants/build-forearm-profile.py'),
            '--input', entry['avatar']['path'], '--body-id', identifier,
            '--expect-sha', profile['sha256'], '--output', str(contact / 'forearm')], cwd=ROOT, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        copy_exact(contact / 'forearm/profile.json', target / 'forearm-profile.json')
        profile['forearmCollision'] = {'url': f'/assets/{PREFIX}/{identifier}/forearm-profile.json',
                                       'sha256': sha(target / 'forearm-profile.json')}
        # Same builder reads the actual input's semantic hand joints for both sexes.
        hand = contact / 'hand-profile.json'
        subprocess.run([sys.executable, str(ROOT / 'assets-source/hand-joint-contact-v1/scripts/build-joint-hand-profile.py'),
            '--source', str(folder / 'avatar.vrm'), '--output', str(hand)], cwd=ROOT, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        hand_data = read(hand)
        if hand_data['bodySHA256'] != profile['sha256']:
            raise ValueError('Hand measurement source mismatch')
        hand_data['limits'] = [x for x in hand_data['limits'] if 'only original female' not in x] + [
            'Regenerated from this exact derived body. Bind enclosure only; posed hand/clothing contact remains unverified.']
        hand.write_text(json.dumps(hand_data, indent=2)+'\n', encoding='utf8')
        copy_exact(hand, target / 'hand-profile.json')
        profile['handSurfaceContact'] = {'url': f'/assets/{PREFIX}/{identifier}/hand-profile.json',
                                         'sha256': sha(target / 'hand-profile.json')}
        profile['referenceBody'] = sex
        profile['label'] = labels[identifier]
        profile['pantsLabel'] = '派生适配及膝裤' if sex == 'female' else '派生适配露膝短裤'
        profile['workbenchGroup'] = sex
        profile['batchId'] = PREFIX
        profile['seatLayerThickness'] = 0
        profile['fitStatus'] = 'Own source geometry and measured arm/hand profiles; posed garment/seat acceptance pending. No original compensation inherited.'
        # Palette reuse is based on all actual materials/images/UVs, not the family name.
        original = module.GLB(ROOT / entry['sourceBody']['path']); changed = module.GLB(folder / 'avatar.vrm')
        if original.images() != changed.images() or original.doc['materials'] != changed.doc['materials']:
            raise ValueError('Palette source image/material changed: ' + identifier)
        for m, n in zip(original.doc['meshes'], changed.doc['meshes']):
            for p, q in zip(m['primitives'], n['primitives']):
                for key in ['TEXCOORD_0']:
                    if (key in p['attributes']) != (key in q['attributes']):
                        raise ValueError('Palette UV layout changed: ' + identifier)
                    if key in p['attributes'] and original.acc(p['attributes'][key]).tobytes() != changed.acc(q['attributes'][key]).tobytes():
                        raise ValueError('Palette UV changed: ' + identifier)
        variant = copy.deepcopy(next(v for v in palette['variants'] if v['avatarSha256'] == entry['sourceBody']['sha256']))
        variant.update(avatarSha256=profile['sha256'], bodyType=identifier)
        derived_palette['variants'].append(variant)
        index['presets'].append({'id': identifier, 'sex': sex, 'label': labels[identifier], 'profile': profile,
                                 'appearance': {'hairStyle': 'original', 'hairColor': 'brown' if sex=='female' else 'black',
                                                'skinTone':'original','eyeColor':'original','lipColor':'original'}})
        index['noHair'].append({'id':identifier,'sha256':profile['sha256'],'sourceSkinEvidence':sex,
                               'status':'Full source topology retained, hair cap unchanged; neck volume differs; own runtime base-mode review pending',
                               'evidence':args.audit.relative_to(ROOT).as_posix() if args.audit.is_absolute() else args.audit.as_posix()})
    write(PUBLIC / 'palette-manifest.json', derived_palette)
    index['palette']={'url':f'/assets/{PREFIX}/palette-manifest.json','sha256':sha(PUBLIC/'palette-manifest.json'),
                      'version':f'appearance-color-v3-batch{args.revision}:'+sha(PUBLIC/'palette-manifest.json'),
                      'bodySha256s':[x['profile']['sha256'] for x in index['presets']]}
    write(PUBLIC / 'runtime-index.json', index)
    write(SOURCE / 'runtime-contact' / 'publish-receipt.json', {
        'runtimeIndexSHA256':sha(PUBLIC/'runtime-index.json'),'sourceManifestSHA256':sha(args.manifest),
        'auditSHA256':sha(args.audit),'publisherSHA256':sha(Path(__file__)),
        'forearmGeneratorSHA256':sha(ROOT/'scripts/m1-variants/build-forearm-profile.py'),
        'handGeneratorSHA256':sha(ROOT/'assets-source/hand-joint-contact-v1/scripts/build-joint-hand-profile.py'),
        'status':'published-candidates-not-visual-acceptance'})
    print(json.dumps({'presets':len(index['presets']),'runtimeIndexSHA256':sha(PUBLIC/'runtime-index.json')}))

if __name__ == '__main__':
    main()
