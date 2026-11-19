"""Recompute the body-only table in place, or compare it to the saved files (default)."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts/production'))
from asset_budget import budget_config, check
from flow import local, require
from production_paths import project_output

REGISTRATION = Path('F:/gamemake-test/native-studio-round/registration')
RULES = ROOT / 'scripts/production/asset-budgets-v1.json'
REFERENCE = ROOT / 'prototype/public/assets/cc0-body-release-v1/body.vrm'
OLD_REFERENCE = ROOT / 'evidence/m2-cc0-body-release-fit-v1/source-body.json'
VERSION = 'm2-technical-v1'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def pin(path):
    name = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    return {'path': name.as_posix(), 'sha256': sha(path)}


def run(write):
    csv_path, json_path = [project_output(HERE / name, __file__)
                           for name in ['seven-body-budgets.csv', 'seven-body-budgets.json']]
    registry = REGISTRATION / 'evidence/seven-registered-bodies.json'
    replay = read(HERE / 'seven-inventory-replay.json')
    audit_path = local(ROOT, replay['localFullReport'])
    require(sha(audit_path) == replay['reportSha256'], 'Receiver audit differs from its recorded SHA')
    audit = read(audit_path)
    bodies = {r['role']: r for r in audit['existingReceiverRecords']}
    ledger = read(registry)
    require(len(bodies) == len(ledger) == 7 and set(bodies) == {r['role'] for r in ledger}, 'Role mismatch')
    config = budget_config(RULES, VERSION)
    old = read(OLD_REFERENCE)
    rules_sha = sha(RULES)
    require(rules_sha == old['assetBudget']['sha256'], 'Reference budget changed')
    reference = check(REFERENCE, 'body', config)
    expected = old['bodyBudgetChecks']['derived']
    require(all(reference[k] == v for k, v in expected.items()) and reference['status'] == 'admitted',
            'Reference disagrees with its previous measurement')

    table = io.StringIO()
    rows = csv.writer(table, lineterminator='\n')
    rows.writerow(['role', 'metric', 'actual', 'limit', 'actualMinusLimit', 'referenceActual', 'actualMinusReference'])
    subjects = []

    def record(role, result, provenance):
        for metric, limit in config['classes']['body'].items():
            actual = result['metrics'][metric]
            ref = reference['metrics'][metric]
            rows.writerow([role, metric, actual, limit, actual - limit, ref, actual - ref])
        subjects.append({'role': role, 'bodySha256': result['sha256'], 'status': result['status'],
                         'overLimitMetrics': [v['metric'] for v in result['violations']], **provenance})

    record('source-male-cc0-texture-release-v1', reference,
           {'asset': REFERENCE.relative_to(ROOT).as_posix(), 'previousFullBudget': pin(OLD_REFERENCE)})
    for item in ledger:
        role = item['role']
        candidate = bodies[role]
        model, = [p for p in candidate['verifiedModelPaths'] if p.endswith('/body.vrm')]
        paths = [local(Path(audit['runtime'][dist]), model) for dist in ['firstDist', 'repeatDist']]
        result = check(paths[0], 'body', config)
        require(result['sha256'] == sha(paths[1]) == candidate['bodySha256'] == item['completeBodySha256'],
                role + ': fixed body identity mismatch')
        receipt = local(REGISTRATION, item['registeredIntake'])
        previous = read(receipt)['staticBodyBudget']
        require(previous['rulesSha256'] == rules_sha and previous['version'] == VERSION and
                result['metrics'] == previous['metrics'] and
                result['status'] == previous['status'] == item['staticBudgetStatus'] == 'rejected' and
                result['violations'] == previous['violations'] == item['completeBodyViolations'],
                role + ': previous static budget differs')
        record(role, result, {'rawRegistrationSha256': item['rawSha256'],
                              'modelInBothDistributions': model, 'previousFullBudget': pin(receipt)})
    csv_bytes = table.getvalue().encode('utf-8')
    report = {'scope': 'Static cost of the complete body VRM only, no equipment, GPU measurements or runtime admission.',
              'budgetVersion': VERSION, 'assetClass': 'body', 'rules': pin(RULES),
              'implementation': [pin(ROOT / 'scripts/production' / name) for name in ('asset_budget.py', 'flow.py')],
              'registration': pin(registry), 'receiverAudit': pin(audit_path),
              'fixedDistributionRoots': {k: audit['runtime'][k] for k in ('firstDist', 'repeatDist')},
              'checkedAgainstHistoricalMetrics': len(subjects), 'metricCountPerBody': len(config['classes']['body']),
              'csv': {'file': csv_path.name, 'sha256': hashlib.sha256(csv_bytes).hexdigest()},
              'subjects': subjects}
    json_bytes = (json.dumps(report, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    for path, data in [(csv_path, csv_bytes), (json_path, json_bytes)]:
        if write and not path.exists():
            with path.open('xb') as stream:
                stream.write(data)
        require(path.read_bytes() == data, 'Stored comparison differs: ' + path.name)
    print('Verified 8 bodies, 160 metric rows; historical metrics, limits and violations match.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='also create missing evidence files')
    run(parser.parse_args().write)
