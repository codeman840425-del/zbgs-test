"""Targeted paired-ear index/readback regressions. No producer or browser run."""
import hashlib
import json
import subprocess
import sys
from flow import ROOT, Validator, local, read_json, validate_config

config = read_json(ROOT / 'scripts/production/workflows.json')
validate_config(config)
workflow = next(w for w in config['workflows'] if w['id'] == 'paired-ear-accessory-source')
base = 'assets-source/m2-paired-ear-accessory-v1/'
paths = [row['path'] for row in read_json(ROOT / (base + 'generated/package-files.json'))['files']]
paths += [base + 'generated/package-files.json'] + workflow['inputs']
def fingerprint():
    return {p: hashlib.sha256(local(ROOT, p).read_bytes()).hexdigest() for p in paths}
before = fingerprint()
first = Validator().validate(workflow)
assert first == Validator().validate(workflow), 'Readback must be deterministic'
assert first['assets'][0]['runtimeAccepted'] is False
assert first['assets'][0]['inventoryFiles'] == 18
for command in ['list', 'show', 'dry-run', 'validate']:
    argv = [sys.executable, '-B', str(ROOT / 'scripts/production/flow.py'), command, workflow['id']]
    a = subprocess.check_output(argv, cwd=ROOT)
    assert a == subprocess.check_output(argv, cwd=ROOT), command + ' changed between repeated queries'
    result = json.loads(a)
    assert result['readOnly'] is True

class JSONFault(Validator):
    def __init__(self, target, mutate):
        super().__init__()
        self.target = target
        self.mutate = mutate
    def json(self, name):
        value = super().json(name)
        if name == self.target:
            self.mutate(value)
        return value

failures = []
def rejects(label, operation, expected):
    try:
        operation()
    except (ValueError, FileNotFoundError) as error:
        assert expected in str(error), (label, str(error))
        failures.append(label)
    else:
        raise AssertionError('Accepted ' + label)

p = base + 'generated/manifest.json'
rejects('duplicate semantic side', lambda: JSONFault(p, lambda j: j['instances'][1].update(side='left')).validate(workflow), 'semantic sides')
rejects('source acceptance promoted', lambda: JSONFault(p, lambda j: j.update(runtimeAccepted=True)).validate(workflow), 'source-only')
rejects('wrong fit base', lambda: JSONFault(p, lambda j: j['fits'][0].update(baseAvatarSha256='0'*64)).validate(workflow), 'fit identity')
rejects('source license changed', lambda: JSONFault(base + 'provenance.json', lambda j: j.update(license='other')).validate(workflow), 'license identity')
rejects('CPU witness fails', lambda: JSONFault(base + 'generated/qa-report.json', lambda j: j.update(passed=False)).validate(workflow), 'CPU QA')
v = Validator()
p = base + 'generated/stud.glb'
data = local(ROOT, p).read_bytes() + b'corrupt'
v.cache[local(ROOT, p)] = (data, hashlib.sha256(data).hexdigest())
rejects('corrupt export bytes', lambda: v.validate(workflow), 'SHA mismatch')
commands = [c for stage in workflow['stages'].values() for c in stage]
for script in ['build.py', 'qa.py']:
    c = next(c for c in commands if 'scripts/m2-paired-ear-accessory-v1/' + script in c['argv'])
    assert c['writes'] == [base + 'generated/'], 'Missing transitive production scope'
assert fingerprint() == before, 'Readback/query changed source or exports'
print(json.dumps({'passed': True, 'workflow': workflow['id'], 'repeatReadbackAndCLIIdentical': True,
                  'negativeCases': failures, 'sourceAndExportBytesUnchanged': True,
                  'exportersInvoked': False, 'browserStarted': False, 'GPUUsed': False,
                  'runtimeAccepted': False}, indent=2))
