"""Read-only publication review. Writes only the requested local evidence report."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).with_name('report.json'))
    args = parser.parse_args()
    root = args.root.resolve()
    baseline = 'c24581c0652c8f9161fed47e5af38c91ef846cd7'
    checks, pins, cases = [], {}, []

    def check(name, ok, detail=None):
        row = {'name': name, 'passed': bool(ok)}
        if detail is not None:
            row['detail'] = detail
        checks.append(row)

    def read(path, expected=None):
        path = str(path).replace('\\', '/')
        data = (root / path).read_bytes()
        pin = {'path': path, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        if path in pins:
            check('repeat-read-stable/' + path, pins[path] == pin)
        pins[path] = pin
        if expected:
            check('declared-pin/' + path, all(pin[k] == expected[k] for k in ('sha256', 'bytes') if k in expected))
        return data

    def load(path, expected=None):
        return json.loads(read(path, expected))

    def public(url, manifest=None):
        from urllib.parse import urljoin
        url = urljoin(manifest or '/', url)
        assert url.startswith('/assets/') and '..' not in url.split('/')
        return 'prototype/public' + url

    def unchanged(path):
        data = read(path)
        old = subprocess.run(['git', 'show', baseline + ':' + path], cwd=root, capture_output=True, check=True).stdout
        check('baseline-identical/' + path, data == old)

    receipt_path = 'assets-source/m2-vest-layer-fit-v1/publication.json'
    publisher_path = 'scripts/m2-vest-layer-fit-v1/publish.mjs'
    receipt = load(receipt_path)
    publisher = read(publisher_path).decode('utf-8')
    check('receipt-schema-status', receipt['schema'] == 'vest-layer-publication-v1' and receipt['status'] == 'published-for-runtime-validation')
    for ref in receipt['inputs'] + receipt['outputs']:
        read(ref['path'], ref)
    outputs = [ref['path'] for ref in receipt['outputs']]
    actual = sorted(str(p.relative_to(root)).replace('\\', '/') for directory in ('m2-vest-layer-fit-v1', 'm2-vest-body-coverage-v1') for p in (root / 'prototype/public/assets' / directory).rglob('*') if p.is_file())
    check('exact-13-output-files', len(outputs) == len(set(outputs)) == 13 and actual == sorted(outputs))

    base = 'assets-source/m2-vest-layer-fit-v1/'
    batch = load(base + 'generated/manifest.json')
    spec = load(base + 'spec.json')
    coverage = load('assets-source/m2-vest-body-coverage-v1/generated/manifest.json')
    profiles = load('prototype/public/assets/m2-vest-layer-fit-v1/profiles.json')
    index_path = 'prototype/public/assets/m2-representative-batch-v2/runtime-index.json'
    index = load(index_path)
    unchanged(index_path)
    ids = ['female', 'female-round-full-v2', 'female-soft-wide-v2']
    check('exact-three-identities', sorted(profiles['profiles']) == sorted(ids) and sorted(c['id'] for c in batch['cases']) == sorted(ids) and sorted(c['id'] for c in coverage['cases']) == sorted(ids))
    legacy_report = load('evidence/m2-vest-legacy-recipes-ed2-v1/report.json')
    check('legacy-capture-identity', legacy_report['status'] == 'captured' and legacy_report['build'] == 'ed2153a2d822' and sorted(c['id'] for c in legacy_report['cases']) == sorted(ids))

    for case_id in ids:
        start = len(checks)
        source = next(c for c in spec['cases'] if c['id'] == case_id)
        row = next(c for c in batch['cases'] if c['id'] == case_id)
        mask_row = next(c for c in coverage['cases'] if c['id'] == case_id)
        profile = profiles['profiles'][case_id]
        body = read(source['body']['path'], source['body'])
        read(source['bottom']['path'], source['bottom'])
        fit = load(row['files']['fit.json']['path'], row['files']['fit.json'])
        entry = load(row['files']['equipment-entry.json']['path'], row['files']['equipment-entry.json'])
        old_url = '/assets/m1/equipment.json' if case_id == 'female' else next(p['profile']['manifestUrl'] for p in index['presets'] if p['id'] == case_id)
        old_path = public(old_url)
        old = load(old_path)
        unchanged(old_path)
        for item in old['items']:
            asset_path = public(item['url'], old_url)
            read(asset_path, item)
            unchanged(asset_path)
        bottom = next(i for i in old['items'] if i['id'] == fit['bottom']['id'])
        check(case_id + '/exact-old-pants', bottom['slot'] == 'bottom' and all(bottom[k] == source['bottom'][k] == fit['bottom'][k] for k in ('sha256', 'bytes')) and profile['bottomId'] == bottom['id'] and (case_id != 'female' or bottom['id'] == 'm1-training-pants'))
        runtime_body_path = source['body']['path'] if case_id == 'female' else public(next(p['profile']['url'] for p in index['presets'] if p['id'] == case_id))
        read(runtime_body_path, source['body'])
        unchanged(runtime_body_path)
        check(case_id + '/body-identity', profile['bodySha256'] == source['body']['sha256'] == row['bodySha256'] == fit['body']['sha256'] == entry['compatibleAvatarSha256'] and profile['sourceManifestUrl'] == old_url)
        catalog = load(public(profile['manifest']['url']), profile['manifest'])
        check(case_id + '/extension-single-new-entry', catalog['schema'] == 'zbgs-equipment-v1' and len(catalog['items']) == 1 and entry['id'] not in {i['id'] for i in old['items']})
        published_entry = catalog['items'][0]
        dependency = published_entry.get('layerFitResource')
        stripped = {k: v for k, v in published_entry.items() if k != 'layerFitResource'}
        check(case_id + '/entry-only-dependency-added', stripped == entry)
        check(case_id + '/fit-dependency', dependency == {'schema': 'vest-layer-fit-v1', 'url': '/assets/m2-vest-layer-fit-v1/' + case_id + '/fit.json', 'sha256': row['files']['fit.json']['sha256'], 'bottom': {k: bottom[k] for k in ('id', 'sha256', 'bytes')}})
        for filename, url in [('top.glb', entry['url']), ('fit.json', dependency['url'])]:
            ref = row['files'][filename]
            check(case_id + '/source-public-identical/' + filename, read(ref['path'], ref) == read(public(url), ref))
        check(case_id + '/top-identity', profile['topId'] == entry['id'] == fit['top']['id'] == mask_row['topId'] and all(fit['top'][k] == entry[k] == row['files']['top.glb'][k] for k in ('sha256', 'bytes')))
        mask_bytes = read(public(profile['bodyCoverage']['url']), profile['bodyCoverage'])
        check(case_id + '/source-public-identical/mask', mask_bytes == read(mask_row['files']['fit']['path'], mask_row['files']['fit']))
        mask = json.loads(mask_bytes)
        check(case_id + '/mask-dependencies', profile['bodyCoverage'] == mask_row['descriptor'] and mask['avatarSha256'] == profile['bodySha256'] and mask['topId'] == entry['id'] and mask['topSha256'] == entry['sha256'] and mask['topFitIdentity']['sha256'] == row['files']['fit.json']['sha256'] and mask['topFitIdentity']['id'] == entry['fitId'] == fit['id'] and mask['topFitIdentity']['targetBodySha256'] == profile['bodySha256'] and mask['topFitIdentity']['topAssetSha256'] == entry['sha256'])
        # Read actual immutable body index bytes, including accessor offsets/stride.
        json_len, json_kind = struct.unpack_from('<II', body, 12)
        document = json.loads(body[20:20 + json_len])
        bin_start = 20 + json_len + 8
        primitive = document['meshes'][mask['bodyMeshIndex']]['primitives'][mask['bodyPrimitive']]
        accessor = document['accessors'][primitive['indices']]
        view = document['bufferViews'][accessor['bufferView']]
        size, code = {5121: (1, 'B'), 5123: (2, 'H'), 5125: (4, 'I')}[accessor['componentType']]
        offset = bin_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', size)
        raw = b''.join(body[offset + n * stride:offset + n * stride + size] for n in range(accessor['count']))
        values = struct.unpack('<' + code * accessor['count'], raw)
        triangles = [list(values[n:n + 3]) for n in range(0, len(values), 3)]
        faces = mask['selectedFaceIds']
        check(case_id + '/mask-actual-body-indices', hashlib.sha256(raw).hexdigest() == mask['bodyIndexAccessorSha256'] and accessor['componentType'] == mask['bodyIndexComponentType'] and len(triangles) == mask['bodyFaceCount'] and len(faces) == len(set(faces)) == mask_row['selectedFaces'] and all(0 <= face < len(triangles) for face in faces) and [triangles[face] for face in faces] == mask['selectedTriangles'])
        check(case_id + '/profile-limited-addition', set(profile) == {'bodySha256', 'sourceManifestUrl', 'manifest', 'topId', 'bottomId', 'bodyCoverage', 'outfit'} and profile['outfit']['index'] == 4 and profile['outfit']['role'] == 'pants-layer-fit' and profile['outfit']['bottomRole'] == 'pants' and profile['outfit']['equipmentRoles'] == ['fitTop', 'shoes', 'pants'])
        recipe = load('evidence/m2-vest-legacy-recipes-ed2-v1/' + case_id + '.json')
        capture = next(c for c in legacy_report['cases'] if c['id'] == case_id)
        identity = capture['identity']
        check(case_id + '/legacy-captured-body-and-build', identity['runtimeBuild']['sourceDigest'] == 'ed2153a2d82253aba5e7365bb5601a4a04678d048cfc38bf7555a47550cf0078' and identity['primary']['declaredSha256'] == identity['primary']['actualSha256'] == profile['bodySha256'] and identity['primary']['bytes'] == source['body']['bytes'] and capture['file'] == case_id + '.json')
        check(case_id + '/legacy-recipe-body-and-role', recipe['base'] == {'bodyType': case_id, 'sha256': profile['bodySha256']} and recipe['equipment']['manifestUrl'] == old_url and recipe['equipment']['index'] == 0 and recipe['equipment']['role'] == 'pants')
        for role, resource in recipe['equipment']['resources'].items():
            if resource is None:
                continue
            matches = [i for i in old['items'] if i['id'] == resource['id']]
            check(case_id + '/legacy-resource-entry/' + role, len(matches) == 1 and matches[0] == resource)
            read(public(resource['url'], old_url), resource)
        cases.append({'id': case_id, 'body': pins[runtime_body_path], 'top': pins[public(entry['url'])], 'bottom': {**{k: bottom[k] for k in ('id', 'sha256', 'bytes')}, 'path': public(bottom['url'], old_url)}, 'mask': pins[public(profile['bodyCoverage']['url'])], 'selectedFaces': len(faces), 'checksPassed': all(c['passed'] for c in checks[start:])})

    for filename in ('motion.js', 'normalized-motion.js', 'm1-skirt.js', 'skirt-fit.js', 'behavior-tasks.js', 'turn-policy.js'):
        unchanged('prototype/src/' + filename)
    unchanged('prototype/public/assets/body-coverage-risk-v1/female-top.json')

    # Execute the fixed publisher's construction phase in memory, replacing its
    # entire mutation tail with byte comparisons. No public files are rewritten.
    marker = '// Verify all existing destinations before writing any file; no silent revision.'
    check('publisher-readonly-cut-marker', publisher.count(marker) == 1)
    dry = publisher.split(marker)[0].replace("path.resolve(import.meta.dirname,'../..')", json.dumps(str(root)))
    dry += "\nfor(const [file,bytes] of output){if(!(await fs.readFile(path.join(root,file))).equals(bytes))throw Error('Byte mismatch '+file);}\nconsole.log(JSON.stringify({files:output.size,status:'identical'}));"
    assert 'writeFile' not in dry and 'fs.mkdir' not in dry
    result = subprocess.run(['node', '--input-type=module', '-e', dry], cwd=root, capture_output=True, text=True, encoding='utf-8')
    check('publisher-memory-reconstruction-identical', result.returncode == 0 and json.loads(result.stdout)['files'] == 13, {'stdout': result.stdout.strip(), 'stderr': result.stderr.strip(), 'exitCode': result.returncode})
    for path, expected in list(pins.items()):
        data = (root / path).read_bytes()
        check('final-read-stable/' + path, hashlib.sha256(data).hexdigest() == expected['sha256'] and len(data) == expected['bytes'])
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
    report = {'schema': 'vest-layer-publication-review-v1', 'status': 'pass' if all(c['passed'] for c in checks) else 'fail', 'root': str(root), 'observedHead': head, 'unchangedResourceBaseline': baseline, 'legacyBuildDigest': 'ed2153a2d82253aba5e7365bb5601a4a04678d048cfc38bf7555a47550cf0078', 'cases': cases, 'checks': checks, 'files': list(pins.values()), 'limits': ['CPU byte/dependency readback only. Root owns full-speed action, switching, restore and visual acceptance.', 'Shared controller files listed in this report match the resource baseline. Runtime integration behavior is reviewed separately.', 'Publisher reconstructed 13 expected outputs in memory. No publisher writes, browser, GPU, generation or ffmpeg were run.', 'Legacy recipe resource expressibility is verified. Actual UI restoration remains a root runtime check.', 'Unexplained historical edge pixel [482,454] remains outside this publication identity review.']}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'files': len(pins), 'failed': [c['name'] for c in checks if not c['passed']]}, ensure_ascii=False))
    return 0 if report['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
