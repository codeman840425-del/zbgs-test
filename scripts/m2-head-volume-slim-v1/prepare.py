"""Read all pinned arrays/source/constraints without importing igl or solving."""
import json

from common import BASE, SPEC, input_checks, load_inputs, receipt, save

spec, domain, embedding, report, guide, response, records, source = load_inputs()
checks = input_checks(domain, embedding, guide, records, source, spec['toleranceM'])
value = {'schema': 'native-head-slim-preparation-v1', 'status': 'prepared-not-solved',
    'receipt': receipt(spec), 'checks': checks, 'solverCalled': False, 'characterExported': False,
    'runtimeAccepted': False, 'executionCommand': 'python -B scripts/m2-head-volume-slim-v1/run.py --execute-once'}
output = BASE / 'prepared.json'
encoded = (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode()
if output.exists() and output.read_bytes() != encoded:
    raise ValueError('Keep previous preparation. Changed inputs/scripts require a new explicit receipt identity.')
output.write_bytes(encoded)
print(json.dumps({'status': value['status'], 'checks': checks}))
