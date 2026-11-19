"""Read the original signed records and check this ordinary game with the production gates."""
from hashlib import sha256
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'scripts/production'))
from outfit_admission import runtime_pin, verify_guard_report, verify_room_report, verify_runtime_readback


def load(path):
    return json.loads(path.read_bytes())


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def main():
    records = load(HERE.parent / 'm2-rule-batch-delivery-v1/records.json')
    package = load(HERE / 'inventory.json')
    runtime = runtime_pin({key: package['runtime'][key] for key in ('sourceCommit', 'sourceDigest', 'buildId')})
    release = load(HERE / 'build-and-package.json')
    assert runtime['sourceDigest'] == '241ce1c278f0229e341b553246b9f9da31df550641f160e40d8b5be2b062cbb0'
    assert release['runtime'] == package['runtime']
    assert digest(HERE / 'inventory.json') == release['ordinaryPackage']['manifestSha256']
    guards = load(HERE / 'guards/report.json')
    restore = load(HERE / 'restore/report.json')
    rooms = load(HERE / 'two-rooms.json')
    assert rooms['runtime'] == runtime
    static = load(HERE / 'current-cost/static.json')
    costs = load(HERE / 'current-cost/report.json')
    assert static['reviewedRuntime'] == runtime['sourceDigest']
    assert static['sourceCommit'] == runtime['sourceCommit']
    assert costs['package']['runtime'] == package['runtime']
    assert costs['package']['manifestSha'] == release['ordinaryPackage']['manifestSha256']
    for file, expected in release['currentCost'].items():
        assert digest(HERE / 'current-cost' / file) == expected
    assert costs['errors'] == [] and costs['status'] == 'measured-development-only'
    assert static['status'] == 'within-static-limits'
    assert [row['ids'] for row in costs['cases']] == [[records[0]['identity']['id']],
        [records[1]['identity']['id']], [r['identity']['id'] for r in records]]
    for record in records:
        ident = record['identity']['id']
        signature = record['integrity']['recordSha256']
        room = next(r for r in rooms['records'] if r['id'] == ident)
        assert room['recordSha256'] == signature
        assert signature == next(r['recordSha256'] for r in static['records'] if r['id'] == ident)
        for file, key in [('report.json', 'report'), ('room-produced-1x.webm', 'video')]:
            assert digest(HERE / ident / file) == room[key]['sha256']
        verify_room_report(load(HERE / ident / 'report.json'), record, runtime)
        verify_runtime_readback(restore, package, record, runtime)
        verify_guard_report(guards, record, runtime)
    print(json.dumps({'runtime': runtime['buildId'], 'originals': len(records), 'rooms': len(rooms['records']),
                      'selectionCases': len(guards['cases']), 'restored': len(restore['reopened']),
                      'static': static['status'], 'development': costs['status'],
                      'ordinaryPC': 'unmeasured', 'wholeOutfitApproval': 'pending'}))


if __name__ == '__main__':
    main()
