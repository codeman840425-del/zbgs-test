"""Check the receiver package bytes, record identities and shared garment paths."""

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import posixpath


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BODY_URLS = {
    'source-male-ab9a-v1': '/assets/raw-male-equipment-v1/Base_Male.vrm',
    'source-male-ab9a-release-v1': '/assets/source-outfit-release-v1/body.vrm',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load(path):
    return json.loads(path.read_bytes())


def package_path(path):
    package = path.resolve(strict=True)
    require(package.is_dir() and package.is_relative_to(ROOT), 'Package must be in this project')
    return package


def match_file(root, row):
    relative = PurePosixPath(row['path'])
    require(not relative.is_absolute() and all(p not in ('', '.', '..') for p in relative.parts),
            'Invalid package file path')
    location = root / relative
    require(location.resolve(strict=True) == location, 'Package contains a redirected file: ' + row['path'])
    data = location.read_bytes()
    require(sha256(data).hexdigest() == row['sha256'] and len(data) == row['bytes'],
            'Package file identity differs: ' + row['path'])


def verify(inventory, inputs, package):
    require(inventory['schema'] == 'game-character-record-package-v1', 'Unknown inventory schema')
    require(len(inputs) == len(inventory['records']) == 2, 'Expected two complete input records')
    files = {row['path']: row for row in inventory['files']}
    require(len(files) == len(inventory['files']), 'Duplicate inventory paths')
    found = {p.relative_to(package).as_posix() for p in package.rglob('*') if p.is_file()}
    require(found == set(files) | {'runtime-package.json'}, 'Physical package differs from dependency inventory')
    require(load(package / 'runtime-package.json') == inventory, 'Packaged inventory differs')
    for row in files.values():
        match_file(package, row)

    manifests, garments, identities, expected_entries = [], [], [], []
    for record, bound in zip(inputs, inventory['records'], strict=True):
        identity = record['identity']['id']
        recipe = record['appearanceRecipe']
        body = recipe['base']
        digest = record['integrity']['recordSha256']
        require(bound['id'] == identity and bound['recordSha256'] == digest and bound['revision'] == record['revision'] and
                bound['bodyType'] == body['bodyType'] and bound['avatarSha256'] == body['sha256'],
                'Inventory record identity differs: ' + identity)
        require(load(package / bound['file']) == record, 'Packaged record payload differs: ' + identity)
        body_file = BODY_URLS[body['bodyType']].lstrip('/')
        require(files[body_file]['sha256'] == body['sha256'], 'Packaged body identity differs: ' + identity)
        manifest = recipe['equipment']['manifestUrl'].lstrip('/')
        manifests.append(manifest)
        entries = {item['id']: item for item in load(package / manifest)['items']}
        resources = recipe['equipment']['resources'].values()
        selected = {}
        for entry in resources:
            require(entry['compatibleAvatarSha256'] == body['sha256'] and entries[entry['id']] == entry,
                    'Packaged garment fit differs: ' + entry['id'])
            url = entry['url']
            relative = url.lstrip('/') if url.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(manifest), url))
            require(files[relative]['sha256'] == entry['sha256'] and files[relative]['bytes'] == entry['bytes'],
                    'Packaged garment bytes differ: ' + entry['id'])
            selected[relative] = entry['sha256']
        require(len(selected) == 3 and sorted(bound['equipmentIds']) == sorted(entry['id'] for entry in resources),
                'Packaged outfit differs: ' + identity)
        garments.append(selected)
        identities.append({'id': identity, 'recordSha256': digest, 'bodyType': body['bodyType'],
                           'bodySha256': body['sha256'], 'bodyPath': body_file, 'catalogPath': manifest})
        expected_entries.append({'id': identity, 'url': '/' + bound['file'], 'recordSha256': digest})

    require(set(BODY_URLS) == {row['bodyType'] for row in identities} and len(set(manifests)) == 2,
            'Expected two distinct body and catalog versions')
    require(garments[0] == garments[1], 'The two outfits must consume the same three physical GLBs')
    for relative, digest in garments[0].items():
        require([row['path'] for row in files.values() if row['sha256'] == digest] == [relative],
                'Garment bytes duplicated in standalone package: ' + relative)
    require(load(package / inventory['recordManifest']) == {'schema': 'character-record-input-v1', 'entries': expected_entries},
            'Game entry manifest does not select the exact signed records in order')
    return {
        'passed': True, 'runtime': inventory['runtime'], 'records': identities,
        'inventoryFileCount': len(files), 'physicalFileCount': len(found),
        'physicalBytes': sum(row['bytes'] for row in files.values()) + (package / 'runtime-package.json').stat().st_size,
        'sharedGarmentFiles': [files[path] for path in sorted(garments[0])],
        'duplicateGarmentFileBytesAvoided': sum(files[path]['bytes'] for path in garments[0]),
        'scope': 'CPU packaging, exact records and resource bytes. Browser runtime and performance are separate.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, default=HERE / 'inventory.json')
    parser.add_argument('--inputs', type=Path, default=HERE / 'inputs.json')
    parser.add_argument('--package', type=Path, default=HERE / 'game-package')
    args = parser.parse_args()
    print(json.dumps(verify(load(args.inventory), load(args.inputs), package_path(args.package)), indent=2))
