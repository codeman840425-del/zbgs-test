"""One approved new-semantic identity and two fixed official requests."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import sys

from adapter import BASE, ROOT, common, evaluate_function, load, run_case, save

parser = argparse.ArgumentParser()
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
out = args.out.resolve()
report = {'schema': 'semantic-head-attachment-execution-v1', 'status': 'checking', 'cases': [],
    'methodId': 'm2-head-attachment-slim-v1', 'characterExported': False, 'runtimeAccepted': False}
try:
    if out != (BASE / 'generated').resolve() or not out.is_dir():
        raise ValueError('Expected fresh runner-created semantic output')
    if Path(sys.prefix).resolve() != (ROOT / 'experiments/tools/slim-core-2.6.3/.venv').resolve():
        raise ValueError('Dedicated official binary environment required')
    execution, method, old_spec, domain, embedding, domain_report, guide, response, records, source = load()
    prepared = json.loads((BASE / 'execution-prepared.json').read_bytes())
    if prepared['status'] != 'prepared-not-solved' or prepared['executionSpecSha256'] != common.digest(BASE / 'execution-spec.json'):
        raise ValueError('Exact semantic execution preparation required')
    for name, version in execution['versions'].items():
        if importlib.metadata.version(name) != version:
            raise ValueError('Numeric version changed')
    evaluate, _ = evaluate_function()
    report.update(methodSpecSha256=common.digest(BASE / 'spec.json'), executionSpecSha256=common.digest(BASE / 'execution-spec.json'),
        source=method['source'], consumedInputs=execution['inputs'])
    save(out / 'report.json', report)
    identity = run_case(evaluate, 'identity', None, method, old_spec, domain, embedding, domain_report,
        guide, response, records, source, out)
    report['identityStatus'] = identity['status']
    if identity['status'] != 'identity-passed':
        raise ValueError('Semantic identity gate failed; no requests may run')
    for identifier in method['requests']:
        request = next(row for row in guide['cases'] if row['id'] == identifier)
        actual = run_case(evaluate, 'request', request, method, old_spec, domain, embedding, domain_report,
            guide, response, records, source, out)
        report['cases'].append({'id': actual['id'], 'sourceRequestId': identifier, 'status': actual['status'], 'failures': actual.get('failures', [])})
        save(out / 'report.json', report)
        if actual.get('fatalNumericFailure'):
            raise ValueError('Nonfinite result retained; stop before next request')
    report['status'] = 'semantic-fixed-requests-finished-not-production-admission'
except Exception as error:
    report.update(status='stopped-no-retry', error=f'{type(error).__name__}: {error}')
finally:
    save(out / 'report.json', report)
print(json.dumps(report))
raise SystemExit(0 if report['status'] == 'semantic-fixed-requests-finished-not-production-admission' else 2)
