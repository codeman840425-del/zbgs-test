"""Install or check one of the two verified texture outfits in the shared source profile catalog."""

import argparse
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

import female_uniform_texture_fit as female
import texture_body_outfit_fit as male
from flow import ROOT, require
from garment_source_mapping import json_bytes
from native_import import confined, digest, exact_directory
from production_paths import catalog_lock, main_checkout, project_output, publish_new_directory


PRODUCERS = {'male': male, 'female': female}
STAGES = {'male': male.STAGE, 'female': female.OUTPUT}
LABELS = {'male': '身体肤色 1K · 两套制服候选', 'female': '制服身体肤色 1K · 两套上衣'}
RUNTIME_FILES = {'male': ('body.vrm', 'equipment.json'),
                 'female': ('body.vrm', 'equipment.json', 'coverage-top.json', 'coverage-top-1k.json')}
CATALOG = Path('prototype/src/source-outfit-profiles.json')


def checked(path):
    actual = project_output(path, __file__)
    require(actual == Path(os.path.abspath(path)), 'Redirected registration output: ' + str(path))
    return actual


def unique_fields(pairs):
    obj = {}
    for name, value in pairs:
        require(name not in obj, 'Duplicate catalog key: ' + name)
        obj[name] = value
    return obj


def load_candidate(group, stage):
    producer = PRODUCERS[group]
    body_path = confined(stage, 'body.vrm')
    require(body_path == stage / 'body.vrm', 'Redirected staged body')
    if group == 'male':
        files, proof = male.build(ROOT, body_path.read_bytes())
        require(male.REPORT.read_bytes() == proof, 'Male fit receipt differs from exact recomputation')
    else:
        files = female.build(body_path)
    # Compare the complete producer package, including any offline receipt and
    # both female masks, before selecting the public runtime files.
    for name in files:
        require((stage / name).is_file(), 'Missing producer file: ' + name)
    expected = json.loads(files['profile.json'], object_pairs_hook=unique_fields)
    require(list(expected) == [producer.PROFILE_ID], 'Wrong generated body registration')
    received = json.loads((stage / 'profile.json').read_bytes(), object_pairs_hook=unique_fields)
    require(list(received) == [producer.PROFILE_ID] and isinstance(received[producer.PROFILE_ID], dict),
            'Missing expected producer profile: ' + producer.PROFILE_ID)
    missing = expected[producer.PROFILE_ID].keys() - received[producer.PROFILE_ID].keys()
    require(not missing, 'Missing generated profile fields: ' + ', '.join(sorted(missing)))
    exact_directory(stage, files)
    files.pop('profile.json')
    row = expected[producer.PROFILE_ID]
    if group == 'male' and 'workbenchGroup' not in row and 'workbenchLabel' not in row:
        row.update(workbenchGroup=group, workbenchLabel=LABELS[group])
    require(row.get('workbenchGroup') == group and row.get('workbenchLabel') == LABELS[group],
            'Missing or incorrect workbench group or label')
    require(row['id'] == producer.PROFILE_ID and row['url'] == producer.ASSET_URL + '/body.vrm'
            and row['manifestUrl'] == producer.ASSET_URL + '/equipment.json'
            and row['sha256'] == producer.TARGET_SHA == digest(files['body.vrm'])
            and row['manifestSha256'] == digest(files['equipment.json']), 'Wrong generated body or equipment identity')
    if group == 'female':
        files.pop('report.json')
        require(row['bodyCoverage'] == {'url': female.ASSET_URL + '/coverage-top.json', 'sha256': digest(files['coverage-top.json'])}
                and row['additionalBodyCoverage'] == [{'role': 'topFar', 'descriptor': {
                    'url': female.ASSET_URL + '/coverage-top-1k.json', 'sha256': digest(files['coverage-top-1k.json'])}}],
                'Female coverage does not match the generated package')
    return row, files


def next_catalog(previous, profile):
    catalog = json.loads(previous, object_pairs_hook=unique_fields)
    require(isinstance(catalog, dict), 'Expected source profile catalog object')
    ident = profile['id']
    if ident in catalog:
        require(json.dumps(catalog[ident], sort_keys=True) == json.dumps(profile, sort_keys=True),
                'Body ID already has different production data: ' + ident)
        return previous
    # Preserve the other registrations' exact formatting.
    entry = json_bytes({ident: profile}).removeprefix(b'{\n').removesuffix(b'\n}\n')
    prefix = previous.rstrip()[:-1].rstrip()
    return prefix + (b',\n' if catalog else b'\n') + entry + b'\n}\n'


def register(group, *, root=ROOT, stage=None, check=False):
    producer = PRODUCERS[group]
    catalog = checked(root / CATALOG)
    public = catalog.parent.parent / 'public'
    dest = checked(public / producer.ASSET_URL.lstrip('/'))
    for name in RUNTIME_FILES[group]:
        checked(dest / name)
    key = digest(os.path.normcase(str(catalog)).encode())
    lock = checked(main_checkout(__file__) / 'output/texture-outfit-locks' / (key + '.lock'))
    stage = Path(stage or STAGES[group]).absolute()
    profile, files = load_candidate(group, stage)
    require(set(files) == set(RUNTIME_FILES[group]), 'Unexpected public package files')
    items = json.loads(files['equipment.json'])['items']
    for item in items:
        require(item['url'].startswith('/assets/'), 'Expected project garment URL')
        data = confined(public, item['url'][1:]).read_bytes()
        require(digest(data) == item['sha256'] and len(data) == item['bytes'],
                'Target checkout garment differs: ' + item['id'])

    if check:
        previous = catalog.read_bytes()
        require(next_catalog(previous, profile) == previous, 'Missing texture outfit registration')
        exact_directory(dest, files)
        require(catalog.read_bytes() == previous, 'Catalog changed during readback')
    else:
        with catalog_lock(lock, checked):
            previous = catalog.read_bytes()
            payload = next_catalog(previous, profile)
            if dest.exists():
                exact_directory(dest, files)
            if not dest.exists() or payload != previous:
                with TemporaryDirectory(dir=checked(catalog.parent.parent), prefix='.texture-install-') as tmp:
                    folder = Path(tmp) / 'package'
                    folder.mkdir()
                    for name, data in files.items():
                        (folder / name).write_bytes(data)
                    exact_directory(folder, files)
                    staged_catalog = Path(tmp) / 'catalog.json'
                    staged_catalog.write_bytes(payload)
                    require(catalog.read_bytes() == previous, 'Catalog changed during registration')
                    if not dest.exists():
                        publish_new_directory(folder, checked(dest))
                    if payload != previous:
                        # If replacement fails, the complete, unreferenced immutable
                        # directory is verified and reused by the next invocation.
                        require(catalog.read_bytes() == previous, 'Catalog changed during publication')
                        os.replace(staged_catalog, checked(catalog))
    return {'bodyType': profile['id'], 'bodySha256': profile['sha256'], 'manifestSha256': profile['manifestSha256'],
            'catalogSha256': digest(catalog.read_bytes()), 'runtimeFiles': sorted(files)}


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('group', choices=PRODUCERS)
    cli.add_argument('--check', action='store_true', help='Verify the existing install without modifying it')
    args = cli.parse_args()
    print(json.dumps(register(args.group, check=args.check), ensure_ascii=False))
