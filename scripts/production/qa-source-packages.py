"""Read-only real-package tests and in-memory fault injection. No tool execution."""
import copy
import hashlib
import json
from flow import ROOT, Validator, local, read_json, validate_config

config = read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
workflows = {w['id']: w for w in config['workflows']}
assert len(workflows) == 8
new = [w for w in workflows.values() if w['kind'] == 'source-package']
assert len(new) == 3
paths = set()
for w in workflows.values():
    paths.update(w['sources'])
for w in new:
    paths.add(w['identity']['manifest'])
    package = read_json(ROOT/w['identity']['manifest'])
    for key in ['files', 'dependencies', 'retainedFiles', 'inputFiles']:
        paths.update(row['path'] for row in package.get(key, []))
fingerprint = lambda: {p: hashlib.sha256(local(ROOT,p).read_bytes()).hexdigest() for p in sorted(paths)}
before = fingerprint()
results = [Validator().validate(w) for w in workflows.values()]
assert all(r['structuralReadbackPassed'] and r['toolsExecuted'] is False for r in results)
failures = []


def rejects(label, operation, expected):
    try:
        operation()
    except (ValueError, FileNotFoundError) as error:
        assert expected in str(error), (label, str(error))
        failures.append({'case': label, 'error': str(error), 'expectedResourceOrReason': expected,
                         'injection': 'memory only; frozen files unchanged'})
    else:
        raise AssertionError('Did not reject: '+label)


class JSONFault(Validator):
    def __init__(self, path, mutate):
        super().__init__(); self.path = path; self.mutate = mutate

    def json(self, name):
        value = super().json(name)
        if name == self.path:
            self.mutate(value)
        return value


for w in new:
    bad = copy.deepcopy(w); bad['identity']['manifestSha256'] = '0'*64
    rejects(w['id']+' wrong frozen package version', lambda: Validator().validate(bad), w['identity']['manifest'])
    bad = copy.deepcopy(w); bad['sources'].append('assets-source/'+w['id']+'/missing-editable.blend')
    rejects(w['id']+' missing editable source', lambda: Validator().validate(bad), bad['sources'][-1])
    package = read_json(ROOT/w['identity']['manifest'])
    rows = package.get('files', package.get('retainedFiles'))
    row = next(r for r in rows if r['path'].endswith(('.vrm', '.glb')))
    v = Validator(); p = local(ROOT,row['path']); data = bytearray(p.read_bytes()); data[-1] ^= 1
    v.cache[p] = (bytes(data), hashlib.sha256(data).hexdigest())
    rejects(w['id']+' corrupt stored export', lambda: v.validate(w), row['path'])

face = workflows['male-jaw-source']
p = 'assets-source/m2-male-face-v1/generated/build-report.json'
rejects('male face stale repeat export receipt', lambda: JSONFault(p,lambda j:j.update(repeatExportSha256='0'*64)).validate(face), p)
mouth = workflows['male-jaw-mouth']
p = 'assets-source/m2-male-jaw-mouth-v1/spec.json'
rejects('jaw mouth cannot inherit continuous range', lambda: JSONFault(p,lambda j:j.update(supportedSamples=[-.04,0,.04])).validate(mouth), p)
hair = workflows['male-jaw-hair-fit']
p = 'assets-source/m2-male-jaw-hair-fit-v1/manifest.json'
rejects('same hair GLB wrong fit version', lambda: JSONFault(p,lambda j:j['fit'].update(version=2)).validate(hair), 'Hair fit ID/version')
rejects('same hair GLB wrong target body', lambda: JSONFault(p,lambda j:j.update(compatibleBodies=['0'*64])).validate(hair), 'Hair style/target mismatch')
assert fingerprint() == before, 'Source/output changed during read-only checks'
print(json.dumps({'passed': True, 'workflowCount': len(results),
                  'workflowResults': results, 'negativeCases': failures,
                  'sourceOutputUnchanged': before, 'exportsInvoked': False, 'browserStarted': False,
                  'scope': 'Stored source/export identity and bounded relationships only; not runtime/visual acceptance or batch production'}, indent=2))
