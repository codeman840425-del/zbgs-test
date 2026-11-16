"""Focused frozen hat readback and publisher checks in disposable mirrors."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from flow import ROOT, Validator, local, read_json, validate_config
from hat_package import BASE, GENERATED, OUTPUT, READY

config = read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
baseline = json.loads(subprocess.check_output(['git', 'show', 'f7e0174:scripts/production/workflows.json'], cwd=ROOT))
assert len(config['workflows']) == 17 and config['workflows'][:-1] == baseline['workflows']
workflow = config['workflows'][-1]
assert workflow['id'] == 'hat-hair-source'
v = Validator()
result = v.validate(workflow)
assert result['assets'][0]['inventoryFiles'] == 27 and result['assets'][0]['publishedBytesMatchSource']
assert Validator().validate(workflow) == result
paths = {r['path'] for r in v.observed}


def fingerprint():
    return {p: hashlib.sha256(local(ROOT, p).read_bytes()).hexdigest() for p in paths}


before = fingerprint()
failures = []


def rejects(label, operation, expected):
    try:
        operation()
    except (ValueError, FileNotFoundError) as error:
        assert expected in str(error), (label, str(error))
        failures.append(label)
    else:
        raise AssertionError('Accepted '+label)


class JSONFault(Validator):
    def __init__(self, root, target, mutate):
        super().__init__(root)
        self.target, self.mutate = target, mutate

    def json(self, name):
        value = super().json(name)
        if name == self.target:
            self.mutate(value)
        return value


for label, target, mutate, expected in [
    ('bad ready manifest', GENERATED+'manifest.json', lambda j: j.update(id='unreviewed'), 'ready manifest identity'),
    ('bad exact body fit', GENERATED+'fit.json', lambda j: j.update(targetBodySha256='0'*64), 'body/hair fit'),
    ('bad hair dependency', BASE+'spec.json', lambda j: j['hair'].update(fitVersion=1), 'rootjoin-v2 dependency'),
]:
    rejects(label, lambda: JSONFault(ROOT, target, mutate).validate(workflow), expected)

module_spec = importlib.util.spec_from_file_location('actual_hat_publisher', ROOT/'scripts/publish-hat-hair-v1.py')
publisher = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(publisher)
with tempfile.TemporaryDirectory(prefix='hat-publisher-') as directory:
    mirror = Path(directory)
    for name in paths:
        target = mirror/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT/name, target)
    destination = mirror/'releases/hat'
    first = publisher.publish(root=mirror, output=destination)
    actual = {p.name: p.read_bytes() for p in destination.iterdir()}
    times = {p.name: p.stat().st_mtime_ns for p in destination.iterdir()}
    assert set(actual) == set(READY) and first['files'] == 3
    assert publisher.publish(root=mirror, output=destination) == first
    assert actual == {p.name: p.read_bytes() for p in destination.iterdir()}
    assert times == {p.name: p.stat().st_mtime_ns for p in destination.iterdir()}
    (destination/'fit.json').write_bytes(b'conflicting release')
    snapshot = {p.name: p.read_bytes() for p in destination.iterdir()}
    rejects('conflicting publication writes nothing', lambda: publisher.publish(root=mirror, output=destination), 'Different existing cap release')
    assert snapshot == {p.name: p.read_bytes() for p in destination.iterdir()}
    failed = mirror/'failed-release'
    manifest_path = mirror/(GENERATED+'manifest.json')
    original = manifest_path.read_bytes()
    manifest_path.write_bytes(b'corrupt manifest')
    rejects('corrupt manifest writes nothing', lambda: publisher.publish(root=mirror, output=failed), 'SHA mismatch')
    assert not failed.exists()
    manifest_path.write_bytes(original)
    body_path = mirror/'prototype/public/assets/foundation/base-female-roundtrip.vrm'
    original_body = body_path.read_bytes()
    body_path.unlink()
    rejects('missing exact body writes nothing', lambda: publisher.publish(root=mirror, output=failed), 'base-female-roundtrip.vrm')
    assert not failed.exists()
    body_path.write_bytes(original_body)
    bad_qa = JSONFault(mirror, GENERATED+'qa-report.json', lambda j: j.update(passed=False))
    rejects('failed QA semantic fixture writes nothing', lambda: publisher.publish(root=mirror, output=failed, validator=bad_qa), 'static QA failed')
    assert not failed.exists() and not list(mirror.rglob('.hat-stage-*'))

assert fingerprint() == before
publisher_command = next(c for c in workflow['stages']['export'] if 'scripts/publish-hat-hair-v1.py' in c['argv'])
assert publisher_command['writes'] == [OUTPUT, 'prototype/public/assets/.hat-stage-*/']
report = {'passed': True, 'baseCommit': 'f7e017463cac3b913a08e7fcca74ecf401767b85', 'workflowCount': 17,
          'existingSixteenWorkflowsUnchanged': True, 'sourceInventoryFiles': 27, 'identity': result['assets'][0],
          'negativeCases': failures, 'negativeFixtureScope': 'JSON semantic faults injected in memory; corrupt/missing files and conflicting release only in OS temporary mirror.',
          'repeatPublishBytesAndMtimesIdentical': True, 'failedPublishChangesNothing': True,
          'sourceAndPublicBytesUnchanged': True, 'sourceFileSHA256': before,
          'publisherTemporaryMirrorOnly': True, 'producerExecuted': False, 'sourceQAExecuted': False,
          'GPUUsed': False, 'runtimeAccepted': False,
          'commands': [['python', '-B', 'scripts/publish-hat-hair-v1.py'],
                       ['python', '-B', 'scripts/production/flow.py', 'validate', 'hat-hair-source'],
                       ['python', '-B', 'scripts/production/qa-hat-package.py']],
          'implementationSHA256': {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in
              ['scripts/production/hat_package.py', 'scripts/production/qa-hat-package.py',
               'scripts/publish-hat-hair-v1.py', 'scripts/production/workflows.json']}}
out = ROOT/'evidence/m2-hat-production-v1'
out.mkdir(parents=True, exist_ok=True)
(out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k: value for k, value in report.items() if k not in ['identity', 'sourceFileSHA256']}, indent=2))
