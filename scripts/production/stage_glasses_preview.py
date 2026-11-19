"""Install reproducible glasses fits in the existing diagnostic catalog."""
import argparse
import json
from pathlib import Path

from native_import import ROOT, confined
from production_paths import project_output
from register_native_accessories import check, merge, public_path, publish, read_pin, snapshot
from uniform_glasses_transfer import ASSETS, CHECKOUT, encoded, run as verify_transfer


CATALOG = 'prototype/public/assets/native-glasses-candidate-v2/manifest.json'


def install(source, root=ROOT):
    catalog_path = project_output(confined(root, CATALOG), __file__)
    provenance = json.loads((source / 'provenance.json').read_bytes())
    check(provenance['schema'] == 'uniform-glasses-transfer-provenance-v1' and
          provenance['runtimeAdmission'] is False, 'Expected diagnostic transfer provenance')
    lock = catalog_path.with_suffix('.lock')
    with lock.open('x', encoding='utf-8') as stream:
        stream.write('stage_glasses_preview\n')
    try:
        before = catalog_path.read_bytes()
        catalog = json.loads(before)
        check(catalog['schema'] == 'native-glasses-candidate-manifest-v1' and
              catalog['status'] == 'candidate-only', 'Expected diagnostic fit catalog')
        changes = []
        for row in provenance['candidates']:
            body = row['body']
            check(row['file'] == body + '.json', 'Glasses candidate filename differs from its body')
            raw = read_pin(confined(source, row['file']), row)
            profile = json.loads(raw)
            check(profile['schema'] == 'm1.glasses-temple-fit.1' and profile['id'] == row['fitId']
                  and profile['bodySHA256'] == row['targetSha256']
                  and profile['accessorySHA256'] == provenance['accessory']['sha256'],
                  'Glasses preview identity differs from the measured transfer')
            url = '/assets/native-glasses-candidate-v2/' + body + '/glasses.json'
            target = project_output(public_path(root, url), __file__)
            old = snapshot(target)
            check(old is None or old == raw, 'Existing glasses preview differs: ' + body)
            if old is None:
                changes.append((target, None, raw))
            entry = {'bodyType': body, 'bodySHA256': row['targetSha256'], 'url': url,
                     'sha256': row['sha256'], 'bytes': row['bytes'], 'status': 'cpu-candidate-only'}
            merge(catalog['profiles'], entry, ('bodyType', 'bodySHA256', 'url'))
        if catalog != json.loads(before):
            after = encoded(catalog)
            if b'\r\n' in before:
                after = after.replace(b'\n', b'\r\n')
            changes.append((catalog_path, before, after))
        if changes:
            publish(project_output(catalog_path.parent, __file__), changes)
        return [path.relative_to(root).as_posix() for path, _, _ in changes]
    finally:
        lock.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', default=CHECKOUT, type=Path)
    args = parser.parse_args()
    source = ASSETS / 'generated'
    verify_transfer(ASSETS / 'recipe.json', args.checkout, source, check_only=True)
    print(json.dumps({'status': 'candidate-only', 'changed': install(source)}))
