"""Focused CPU regression checks for verifier classification, not runtime QA."""
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
loader = importlib.util.spec_from_file_location('batch_verifier', root / 'scripts/qa-representative-batch-v1.py')
verifier = importlib.util.module_from_spec(loader)
loader.loader.exec_module(verifier)
source = 'prototype/public/assets/foundation/base-female-roundtrip.vrm'
jaw = 'prototype/public/assets/m1-variants/m1a-jaw-v1/avatar.vrm'
results = []
for label, target, expected_change in [('unchanged-original', source, False), ('actual-jaw-geometry', jaw, True)]:
    audit = verifier.Audit(root)
    audit.read(source)
    audit.read(target)
    old, new = audit.glb(root/source), audit.glb(root/target)
    detail = audit.compare_avatar(old, new)
    checks = {check['name']: check['passed'] for check in audit.checks}
    assert checks['real-geometry-change'] is expected_change
    assert checks['not-only-global-uniform-scale-and-translation'] is expected_change
    assert all(check['passed'] for check in audit.checks if check['name'] not in ['real-geometry-change', 'not-only-global-uniform-scale-and-translation'])
    results.append({'case': label, 'expectedChanged': expected_change, 'changedVertices': detail['changedVertices'], 'uniformScaleFit': detail['uniformScaleFit'], 'checks': audit.checks, 'files': list(audit.files.values())})
# CPU classifier fixture only. No generated avatar or runtime claim.
audit = verifier.Audit(root)
old, uniform = audit.glb(root/source), audit.glb(root/source)
base_accessors = {primitive['attributes']['POSITION'] for mesh in uniform.doc['meshes'] for primitive in mesh['primitives']}
read_accessor = uniform.acc
def uniform_accessor(index):
    value = read_accessor(index)
    return (value * 1.1 + [0.01, 0.02, 0.03]).astype(value.dtype) if index in base_accessors else value
uniform.acc = uniform_accessor
detail = audit.compare_avatar(old, uniform)
checks = {check['name']: check['passed'] for check in audit.checks}
assert checks['real-geometry-change'] is True
assert checks['not-only-global-uniform-scale-and-translation'] is False
results.append({'case': 'synthetic-uniform-scale-classifier-fixture', 'scope': 'Actual source accessors transformed in memory only, tests rejection of global scaling.', 'changedVertices': detail['changedVertices'], 'uniformScaleFit': detail['uniformScaleFit'], 'checks': audit.checks})
audit = verifier.Audit(root)
for label, reference in [('bad-source-sha-rejected', {'path': source, 'sha256': '0'*64}), ('bad-byte-count-rejected', {'path': source, 'sha256': verifier.BODY_SHA['female'], 'bytes': 1})]:
    try:
        audit.ref(reference)
    except ValueError as error:
        results.append({'case': label, 'passed': True, 'error': str(error)})
    else:
        raise AssertionError(label)
output = {'status': 'passed', 'scope': 'Real original/jaw GLB CPU verifier regression. No new export, browser or runtime claim.', 'cases': results}
Path(__file__).with_name('focused-cpu-results.json').write_text(json.dumps(output, separators=(',', ':'))+'\n',encoding='utf-8')
print(json.dumps({'status': output['status'], 'cases': [result['case'] for result in results]}))
