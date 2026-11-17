"""Freeze explicit consumed sources and serializer regression, without solver."""
import json
import sys

from adapter import BASE, ROOT, clean, common, evaluate_function, load, save

execution, method, old_spec, domain, embedding, domain_report, guide, response, records, source = load()
sample = {'passed': common.np.bool_(True), 'failed': common.np.bool_(False), 'count': common.np.int64(101)}
decoded = json.loads(json.dumps(clean(sample), allow_nan=False))
assert decoded == {'passed': True, 'failed': False, 'count': 101}
assert type(decoded['passed']) is bool and type(decoded['count']) is int
_, difference = evaluate_function()
if difference != (BASE / 'evaluate-adapter.diff').read_bytes().decode():
    raise ValueError('Frozen semantic adapter diff differs')
if 'igl' in sys.modules:
    raise ValueError('Preparation must not import official solver')
value = {'schema': 'semantic-head-attachment-execution-prepared-v1', 'status': 'prepared-not-solved',
    'methodSpecSha256': common.digest(BASE / 'spec.json'),
    'executionSpecSha256': common.digest(BASE / 'execution-spec.json'),
    'consumedInputs': execution['inputs'], 'serializationRegression': decoded,
    'fixedEndpointRoles': ['fixed-eye', 'fixed-neck'], 'solverCalled': False,
    'futureOutputSchema': 'semantic-head-attachment-slim-result-v1', 'futureSuccessStatus': 'numerical-head-candidate-only'}
output = BASE / 'execution-prepared.json'
encoded = (json.dumps(clean(value), indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode()
if output.exists() and output.read_bytes() != encoded:
    raise ValueError('Preserve existing execution preparation')
output.write_bytes(encoded)
print(json.dumps({'status': value['status'], 'serializerRegression': decoded}))
