"""Surface-band input, frozen official evaluator. Only run after root approval."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import sys

from adapter import BASE, ROOT, common, load, np, reused_functions, save

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
out = args.out.resolve()
report = {'schema': 'surface-band-head-slim-execution-v1', 'status': 'checking', 'cases': [],
    'methodId': 'm2-head-surface-band-slim-v1', 'characterExported': False, 'runtimeAccepted': False}
try:
    if out != (BASE / 'generated').resolve() or not out.is_dir():
        raise ValueError('Expected new runner-created surface-band output')
    if Path(sys.prefix).resolve() != (ROOT / 'experiments/tools/slim-core-2.6.3/.venv').resolve():
        raise ValueError('Dedicated official binary environment required')
    execution = json.loads((BASE / 'execution-spec.json').read_bytes())
    for row in execution['inputs']:
        if common.digest(ROOT / row['path']) != row['sha256']:
            raise ValueError('Prepared execution input differs: ' + row['path'])
    method, old_spec, domain, embedding, domain_report, guide, response, records, source = load()
    prepared = json.loads((BASE / 'prepared/report.json').read_bytes())
    if prepared['status'] != 'prepared-with-soft-target-risk-not-solved' or prepared['methodSpecSha256'] != common.digest(BASE / 'spec.json'):
        raise ValueError('Exact source-band preparation required')
    for name, version in execution['versions'].items():
        if importlib.metadata.version(name) != version:
            raise ValueError('Numeric binary version differs')
    guide_nodes = None
    requests = []
    for identifier in method['requests']:
        request = json.loads((BASE / 'prepared' / (identifier + '-request.json')).read_bytes())
        targets = dict(np.load(BASE / 'prepared' / (identifier + '-targets.npz'), allow_pickle=False))
        if guide_nodes is not None and not np.array_equal(guide_nodes, targets['guideNodes']):
            raise ValueError('Requests must use one common source-band set')
        guide_nodes = targets['guideNodes']
        if not np.array_equal(request['requestedVertexPointsM'], targets['guideTargetsM']):
            raise ValueError('Prepared JSON/NPZ guide targets differ')
        requests.append(request)
    domain = {**domain, 'guideNodes': guide_nodes}
    evaluate_factory, run_case = reused_functions()
    evaluate, _ = evaluate_factory()
    report.update(methodSpecSha256=common.digest(BASE / 'spec.json'), executionSpecSha256=common.digest(BASE / 'execution-spec.json'),
        source=method['source'], consumedInputs=execution['inputs'])
    save(out / 'report.json', report)
    identity = run_case(evaluate, 'identity', None, method, old_spec, domain, embedding, domain_report,
        guide, response, records, source, out)
    report['identityStatus'] = identity['status']
    if identity['status'] != 'identity-passed':
        raise ValueError('Surface-band identity gate failed; no requests may run')
    for request in requests:
        actual = run_case(evaluate, 'request', request, method, old_spec, domain, embedding, domain_report,
            guide, response, records, source, out)
        report['cases'].append({'id': actual['id'], 'sourceRequestId': request['id'], 'status': actual['status'], 'failures': actual.get('failures', [])})
        save(out / 'report.json', report)
        if actual.get('fatalNumericFailure'):
            raise ValueError('Nonfinite raw retained; no further request')
    report['status'] = 'surface-band-fixed-requests-finished-not-production-admission'
except Exception as error:
    report.update(status='stopped-no-retry', error=f'{type(error).__name__}: {error}')
finally:
    save(out / 'report.json', report)
print(json.dumps(report))
raise SystemExit(0 if report['status'] == 'surface-band-fixed-requests-finished-not-production-admission' else 2)
