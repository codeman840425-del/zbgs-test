"""Publish exact socks alongside copies of original equipment manifests."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB, Validator, local, require

BASE = 'assets-source/m2-socks-layer-v1/'
SCRIPTS = 'scripts/m2-socks-layer-v1/'
OUTPUT = 'prototype/public/assets/m2-socks-layer-v1/'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def expected_inventory():
    paths = [BASE+name for name in ['.gitattributes', 'README.md', 'provenance.json', 'source-screening.json', 'spec.json']]
    paths += [SCRIPTS+name for name in ['.gitattributes', 'build.py', 'qa.py', 'publish.py', 'requirements.txt']]
    paths += [BASE+'generated/'+name for name in ['build-report.json', 'qa-report.json', 'parameter-variant/spec.json']]
    for folder in ['', 'parameter-variant/']:
        for body in ['female', 'male']:
            paths += [BASE+'generated/'+folder+body+suffix for suffix in ['-entry.json', '-fit.json', '-plain-crew-socks-v1.glb']]
    return set(paths)


def validate_ref(v, ref, prefix=None):
    url = ref['url']
    require(isinstance(url, str) and not any(c in url for c in ['\\', '?', '#', ':']) and '..' not in url.split('/'), 'Unsafe equipment dependency URL: '+str(url))
    if not url.startswith('/'):
        require(prefix is not None and Path(url).name == url, 'Expected absolute dependency URL: '+url)
        url = prefix+url
    v.pin(v.url(url), ref['sha256'], ref.get('bytes'))
    return url


def create_plan(root=ROOT, validator=None):
    v = validator or Validator(root)
    inventory = v.json(BASE+'generated/package-files.json')
    rows = inventory['files']
    require(len(rows) == len(expected_inventory()) and {row['path'] for row in rows} == expected_inventory(), 'Socks inventory incomplete or duplicate')
    for row in rows:
        v.pin(row['path'], row['sha256'], row['bytes'])
    spec = v.json(BASE+'spec.json')
    report = v.json(BASE+'generated/build-report.json')
    qa = v.json(BASE+'generated/qa-report.json')
    require(spec['schema'] == 'zbgs-socks-layer-source-v1' and spec['styleId'] == 'plain-crew-socks-v1', 'Socks source identity')
    require(qa['passedSourceIdentityAndSkin'] is True and qa['repeatExportExact'] is True and qa['runtimeAccepted'] is False and
            qa['GPUUsed'] is False and qa['BlenderUsed'] is False and report['runtimeAccepted'] is False, 'Expected source-only socks QA')
    v.pin(BASE+'spec.json', report['specSha256'])
    v.pin(SCRIPTS+'build.py', report['generatorSha256'])
    provenance = v.json(BASE+'provenance.json')
    require(provenance['styleId'] == spec['styleId'] and provenance['license'] == 'CC0-1.0', 'Socks source license identity')
    plan, before, bodies, published_entries = {}, {}, [], []
    for body_type, original_prefix in [('female', '/assets/m1/'), ('male', '/assets/m1b/')]:
        body = spec['bodies'][body_type]
        body_glb = GLB(v.pin(body['path'], body['sha256']))
        entry_path = BASE+'generated/'+body_type+'-entry.json'
        entry = v.json(entry_path)
        fit = v.json(BASE+'generated/'+body_type+'-fit.json')
        require(entry['id'] == body_type+'-plain-crew-socks-v1' and entry['styleId'] == spec['styleId'] and entry['version'] == 1 and entry['slot'] == 'socks', 'Socks entry identity')
        require(fit['schema'] == 'zbgs-socks-layer-fit-v1' and fit['id'] == entry['fitId'] and fit['garmentSha256'] == entry['sha256'] and
                fit['baseAvatarSha256'] == body['sha256'] and fit['runtimeAccepted'] is False, 'Socks fit identity')
        actual = v.equipment(entry, body['sha256'], body_glb, entry_path)
        require(actual['bones'] == 6 and entry['restMatrix'] == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 'Socks raw bind/rest identity')
        original = v.json(body['manifest'])
        original_bytes = local(root, body['manifest']).read_bytes()
        v.pin(body['manifest'], digest(original_bytes))
        before[body['manifest']] = original_bytes
        require(original['schema'] == 'zbgs-equipment-v1' and original['items'], 'Original equipment schema')
        ids = [item['id'] for item in original['items']]
        require(len(set(ids)) == len(ids), 'Duplicate equipment identity')
        copied = copy.deepcopy(original)
        for item in copied['items']:
            if item['id'] == entry['id']:
                continue
            validate_ref(v, item, original_prefix)
            for ref in item.get('materialRecipes', []) + ([item['fitResource']] if 'fitResource' in item else []):
                validate_ref(v, ref)
        expected_pairs = {'shoes': [], 'lower': []}
        for item_id in [body['shoesId']]+body['bottomIds']:
            item = v.item(original, item_id)
            require(item['sha256'] == body['pairingSha256'][item_id], 'Socks pairing source identity')
            expected_pairs['shoes' if item_id == body['shoesId'] else 'lower'].append({'id': item_id, 'sha256': item['sha256']})
        require(entry['pairedWith'] == expected_pairs, 'Socks exact pairing declaration')
        require(Path(entry['url']).name == entry['url'] and entry['url'].endswith('.glb'), 'Unsafe socks filename')
        filename = entry['url']
        plan[OUTPUT+filename] = v.pin(BASE+'generated/'+filename, entry['sha256'], entry['bytes'])
        published_entry = copy.deepcopy(entry)
        published_entry['url'] = '/assets/m2-socks-layer-v1/'+filename
        if entry['id'] in ids:
            require(v.item(original, entry['id']) == published_entry, 'Existing socks entry differs: '+entry['id'])
        else:
            copied['items'].append(published_entry)
        require(original == json.loads(original_bytes), 'Original manifest changed while planning: '+body['manifest'])
        # Preserve the complete original bytes when this exact entry is present.
        plan[body['manifest']] = original_bytes if copied == original else encode(copied)
        published_entries.append(published_entry)
        bodies.append({'bodyType': body_type, 'bodySha256': body['sha256'], 'originalManifest': body['manifest'],
                       'retainedItems': len(ids)-(entry['id'] in ids), 'socksSha256': entry['sha256']})
    plan[OUTPUT+'manifest.json'] = encode({'schema': 'zbgs-socks-layer-publication-v1', 'version': 1,
        'styleId': spec['styleId'], 'items': published_entries, 'sourceInventorySha256': digest(local(root, BASE+'generated/package-files.json').read_bytes()),
        'runtimeAccepted': False})
    return plan, before, {'inventoryFiles': len(rows), 'bodies': bodies, 'runtimeAccepted': False}


def encode(data):
    return (json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode('utf-8')


def target_path(root, name):
    raw = root/name
    require(not any((root/Path(*Path(name).parts[:i])).is_symlink() for i in range(len(Path(name).parts)+1)), 'Symlink publish target refused: '+name)
    return local(root, raw.relative_to(root).as_posix())


def publish(target_root=None, root=ROOT, validator=None):
    target_root = Path(target_root) if target_root is not None else root
    plan, before, summary = create_plan(root, validator)
    for name, data in plan.items():
        target = target_path(target_root, name)
        if name in before:
            require(target.is_file() and target.read_bytes() in [before[name], data], 'Original manifest changed before publish: '+name)
        else:
            require(not target.exists() or target.read_bytes() == data, 'Refusing differing existing runtime file: '+name)
    # All resources precede the source descriptor and both original manifests.
    order = [name for name in plan if name.endswith('.glb')]+[OUTPUT+'manifest.json']+list(before)
    for name in order:
        target = target_path(target_root, name)
        if target.exists() and target.read_bytes() == plan[name]:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.socks-', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(plan[name])
        try:
            if name in before:
                require(target.read_bytes() == before[name], 'Original manifest changed during publish: '+name)
                temporary.replace(target)
            else:
                try:
                    os.link(temporary, target)
                except FileExistsError:
                    require(target.read_bytes() == plan[name], 'Runtime file changed during publish: '+name)
        finally:
            temporary.unlink(missing_ok=True)
    summary['published'] = [{'path': name, 'bytes': len(data), 'sha256': digest(data)} for name, data in plan.items()]
    return summary


if __name__ == '__main__':
    try:
        print(json.dumps(publish(), indent=2))
    except (OSError, ValueError, KeyError, TypeError) as failure:
        print(json.dumps({'status': 'invalid', 'error': str(failure)}))
        sys.exit(1)
