"""Plan stable character-production requests from the registered native catalog."""
import argparse
import json
import re
from pathlib import Path
import sys

from native_import import ROOT, confined, digest


SCHEMA = 'native-record-batch-request-v1'
REQUEST_SCHEMA = 'character-production-request-v1'
SHA = re.compile(r'^[a-f0-9]{64}$')
ID = re.compile(r'^[a-z][a-z0-9-]{1,95}$')


def check(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(root, path):
    return json.loads(confined(root, path).read_bytes())


def pin(root, path):
    location = confined(root, path)
    return {'path': location.relative_to(root).as_posix(), 'sha256': digest(location.read_bytes())}


def public_file(root, url):
    check(isinstance(url, str) and url.startswith('/assets/'), f'Invalid public URL: {url!r}')
    return confined(confined(root, 'prototype/public/assets'), url.removeprefix('/assets/'))


def accessory_asset(root, accessory_manifest, accessory_id):
    matches = [entry for entry in accessory_manifest.get('items', []) if entry.get('id') == accessory_id]
    if len(matches) != 1:
        return None, f'Accessory asset {accessory_id} is not uniquely registered'
    entry = matches[0]
    if not SHA.fullmatch(entry.get('sha256', '')) or not isinstance(entry.get('bytes'), int):
        return None, f'Accessory asset {accessory_id} has an invalid identity'
    try:
        raw = public_file(root, entry['url']).read_bytes()
    except (KeyError, OSError, ValueError) as error:
        return None, f'Accessory asset {accessory_id} cannot be read: {error}'
    if len(raw) != entry['bytes'] or digest(raw) != entry['sha256']:
        return None, f'Accessory asset {accessory_id} bytes do not match its registry'
    return entry, None


def exact_microphone(root, body_sha, grips, presentation, accessory):
    entries = [entry for entry in grips.get('items', [])
               if entry.get('compatibleAvatarSha256') == body_sha]
    if len(entries) != 1:
        return None, 'mic omitted because no unique exact body grip is registered'
    entry = entries[0]
    if entry.get('accessoryId') != accessory['id'] or entry.get('accessorySha256') != accessory['sha256']:
        return None, 'mic omitted because grip accessory identity differs'
    fit = presentation.get(body_sha)
    if not fit:
        return None, 'mic omitted because no exact body presentation fit is registered'
    if fit.get('bodySha256') != body_sha or fit.get('microphoneSha256') != accessory['sha256']:
        return None, 'mic omitted because presentation fit identity differs'
    try:
        resource = public_file(root, entry['url'])
        raw = resource.read_bytes()
    except (KeyError, OSError, ValueError) as error:
        return None, f'mic omitted because grip resource cannot be read: {error}'
    if len(raw) != entry.get('bytes') or digest(raw) != entry.get('sha256'):
        return None, 'mic omitted because grip resource bytes differ'
    return {'kind': 'mic', 'id': entry['id'], 'fitId': fit.get('id'),
            'assetId': accessory['id'], 'assetSha256': accessory['sha256']}, None


def exact_glasses(root, body_sha, glasses, accessory):
    entries = [entry for entry in glasses.get('profiles', [])
               if entry.get('bodySHA256') == body_sha]
    if len(entries) != 1:
        return None, 'glasses omitted because no unique exact body temple fit is registered'
    entry = entries[0]
    try:
        profile = json.loads(public_file(root, entry['url']).read_bytes())
    except (KeyError, OSError, ValueError, json.JSONDecodeError) as error:
        return None, f'glasses omitted because temple fit cannot be read: {error}'
    if (profile.get('bodySHA256') != body_sha or profile.get('accessorySHA256') != accessory['sha256']
            or profile.get('schema') != 'm1.glasses-temple-fit.1' or len(profile.get('controls', [])) != 2):
        return None, 'glasses omitted because temple fit identity or controls differ'
    return {'kind': 'glasses', 'fitId': profile.get('id'),
            'assetId': accessory['id'], 'assetSha256': accessory['sha256']}, None


def identity_for(profile):
    version = profile.get('recipeSha256')
    check(SHA.fullmatch(version or ''), 'Catalog recipe SHA is missing')
    return f'batch-{profile["id"]}-{version[:12]}'


def plan(catalog, root=ROOT, grips=None, glasses=None, presentation=None):
    check(catalog.get('schema') == 'native-production-catalog-v1', 'Invalid native production catalog')
    entries = catalog.get('entries')
    check(isinstance(entries, list) and entries, 'Catalog has no entries')
    accessory_manifest = read_json(root, 'prototype/public/assets/m1c/accessories.json')
    microphone, mic_error = accessory_asset(root, accessory_manifest, 'studio-microphone-v1')
    glasses_asset, glasses_error = accessory_asset(root, accessory_manifest, 'studio-glasses-v1')
    grips = grips if grips is not None else read_json(root, 'prototype/public/assets/m1c/grips/manifest.json')
    glasses = glasses if glasses is not None else read_json(root, 'prototype/src/glasses-temple-fit-manifest.json')
    presentation = presentation if presentation is not None else read_json(root, 'prototype/src/native-microphone-presentation-fits.json')
    seen = set()
    results = []
    for entry in entries:
        item = {'bodyType': entry.get('bodyType'), 'status': 'rejected', 'omittedCapabilities': []}
        try:
            profile = entry['profile']
            body_type = entry['bodyType']
            check(isinstance(body_type, str) and ID.fullmatch(body_type), 'Invalid bodyType')
            check(body_type not in seen, 'Duplicate bodyType')
            seen.add(body_type)
            check(entry.get('group') in {'female', 'male'}, 'Invalid body group')
            check(profile.get('id') == body_type and profile.get('baseBodyDisplay') == 'source-with-hair', 'Catalog profile identity differs')
            check(SHA.fullmatch(profile.get('sha256', '')) and profile.get('url', '').endswith('.vrm'), 'Catalog body identity is incomplete')
            body = public_file(root, profile['url'])
            check(body.is_file() and digest(body.read_bytes()) == profile['sha256'], 'Catalog body bytes do not match profile SHA')
            identity = identity_for({'id': body_type, 'recipeSha256': entry.get('recipeSha256')})
            edits = [{'domain': 'outfit', 'index': 0}]
            if microphone is None:
                item['omittedCapabilities'].append(mic_error)
            else:
                fit, reason = exact_microphone(root, profile['sha256'], grips, presentation, microphone)
                if fit:
                    edits.append({'domain': 'liveAccessory', 'kind': 'mic', 'enabled': True})
                else:
                    item['omittedCapabilities'].append(reason)
            if glasses_asset is None:
                item['omittedCapabilities'].append(glasses_error)
            else:
                fit, reason = exact_glasses(root, profile['sha256'], glasses, glasses_asset)
                if fit:
                    edits.append({'domain': 'liveAccessory', 'kind': 'glasses', 'enabled': True})
                else:
                    item['omittedCapabilities'].append(reason)
            item.update(status='accepted', request={'schema': REQUEST_SCHEMA, 'operation': 'create', 'bodyType': body_type,
                'identity': {'id': identity, 'name': profile['label'], 'gender': entry['group']}, 'edits': edits},
                body={'path': body.relative_to(root).as_posix(), 'sha256': digest(body.read_bytes())},
                recipeSha256=entry['recipeSha256'])
        except (KeyError, OSError, ValueError, TypeError) as error:
            item['reason'] = str(error) or type(error).__name__
        results.append(item)
    return results


def write_json(path, value):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')


def run(catalog_path, output, root=ROOT, **registries):
    root, catalog_path, output = root.resolve(), catalog_path.resolve(), output.resolve()
    check(catalog_path.is_relative_to(root) and output.is_relative_to(root) and output != root, 'Paths must be inside repository')
    results = plan(json.loads(catalog_path.read_bytes()), root, **registries)
    output.mkdir(parents=True, exist_ok=False)
    rows = []
    for item in results:
        row = {key: value for key, value in item.items() if key != 'request'}
        if item['status'] == 'accepted':
            request_file = output / f'{item["bodyType"]}.request.json'
            write_json(request_file, item['request'])
            row['request'] = {'path': request_file.name, 'sha256': digest(request_file.read_bytes()), 'bytes': request_file.stat().st_size}
        rows.append(row)
    batch = {'schema': SCHEMA, 'sourceCatalog': pin(root, catalog_path.relative_to(root).as_posix()), 'items': rows,
             'acceptedCount': sum(item['status'] == 'accepted' for item in rows), 'rejectedCount': sum(item['status'] == 'rejected' for item in rows)}
    write_json(output / 'batch-request.json', batch)
    return batch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=ROOT / 'prototype/src/native-production-catalog.json')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--grips', type=Path)
    parser.add_argument('--glasses', type=Path)
    parser.add_argument('--presentation', type=Path)
    args = parser.parse_args()
    try:
        registry = {}
        for key in ('grips', 'glasses', 'presentation'):
            path = getattr(args, key)
            if path is not None:
                registry[key] = json.loads(path.read_bytes())
        print(json.dumps(run(args.catalog, args.output, **registry), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
