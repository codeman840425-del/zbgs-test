"""Side-effect-free independent probes for the reviewed-subset admission function."""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publisher', type=Path, default=ROOT / 'scripts/publish-representative-batch.py')
    parser.add_argument('--out', type=Path, default=Path(__file__).with_name('publisher-subset-results.json'))
    args = parser.parse_args()
    loader = importlib.util.spec_from_file_location('publisher_gate', args.publisher)
    publisher = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(publisher)
    manifest = json.loads((ROOT / 'assets-source/m2-representative-batch-v2/generated/manifest.json').read_bytes())
    audit = json.loads(Path(__file__).with_name('report.json').read_bytes())
    results = []
    def probe(name, expected, mutate):
        source, review = copy.deepcopy(manifest), copy.deepcopy(audit)
        mutate(source, review)
        try:
            chosen, failed = publisher.reviewed_subset(source, review)
            accepted, reason = True, {'selected': len(chosen), 'unpublished': len(failed)}
        except Exception as error:
            accepted, reason = False, str(error)
        results.append({'name': name, 'expectedAccepted': expected, 'accepted': accepted, 'passed': accepted == expected, 'detail': reason})
    probe('real-six-complete', True, lambda m, a: None)
    probe('empty-selected-checks', False, lambda m, a: a['variants'][0].update(checks=[]))
    probe('missing-audit-preset', False, lambda m, a: a['variants'].pop())
    probe('extra-global-failure', False, lambda m, a: a['checks'].append({'name': 'injected-input-sha-failure', 'passed': False, 'detail': None}))
    for field in ('avatar', 'equipmentManifest', 'fit', 'report', 'profile'):
        probe('failed-claims-' + field, False, lambda m, a, key=field: m['variants'][1].update({key: {'path': 'fake'}}))
    probe('selected-passed-flag-false', False, lambda m, a: a['variants'][0].update(passed=False))
    def hide_global(m, a):
        check = {'name': 'injected-input-sha-failure', 'passed': False, 'detail': None}
        a['checks'].append(check)
        a['variants'][1]['checks'].append(check)
    probe('extra-global-failure-placed-in-failed-preset', False, hide_global)
    def omit_resource(m, a):
        a['files'] = [f for f in a['files'] if not f['path'].endswith('female-round-full-v2-top.glb')]
    probe('selected-resource-missing-from-audit-files', False, omit_resource)
    def false_selected_check(m, a):
        a['variants'][0]['checks'][0]['passed'] = False
    probe('selected-check-failed', False, false_selected_check)
    probe('duplicate-audited-file', False, lambda m, a: a['files'].append(copy.deepcopy(a['files'][0])))
    probe('missing-selected-profile-reference', False, lambda m, a: m['variants'][0].pop('profile'))
    probe('declared-global-ledger-empty', False, lambda m, a: a.update(globalChecks=[]))
    def wrong_bytes(m, a):
        m['variants'][0]['avatar']['bytes'] += 1
    probe('selected-reference-byte-count-mismatch', False, wrong_bytes)
    original_sha = publisher.sha
    def simulated_bad_sha(path):
        if str(path).endswith('female-round-full-v2-top.glb'):
            return '0' * 64
        return original_sha(path)
    publisher.sha = simulated_bad_sha
    try:
        probe('simulated-actual-selected-file-sha-mismatch', False, lambda m, a: None)
    finally:
        publisher.sha = original_sha
    result = {'status': 'passed' if all(r['passed'] for r in results) else 'failed',
              'publisherPath': str(args.publisher.resolve()), 'publisherSha256': hashlib.sha256(args.publisher.read_bytes()).hexdigest(),
              'auditSha256': hashlib.sha256(Path(__file__).with_name('report.json').read_bytes()).hexdigest(),
              'probes': results, 'scope': 'Only calls reviewed_subset on deep-copied metadata. No main(), export, browser, contact generation or publication.'}
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
