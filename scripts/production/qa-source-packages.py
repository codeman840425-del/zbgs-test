"""Read-only real-package tests and in-memory fault injection. No tool execution."""
import copy
import hashlib
import json
from flow import ROOT, Validator, local, read_json, validate_config

config = read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
workflows = {w['id']: w for w in config['workflows']}
assert len(workflows) == 12
new = [w for w in workflows.values() if w['kind'] == 'source-package']
assert len(new) == 7
relative_packages = {'outer-panels': 'assets-source/m2-outer-panels-v2/', 'onepiece': 'assets-source/m2-onepiece-v1/',
                     'garment-coverage': 'assets-source/m2-garment-coverage-v1/'}
paths = set()
for w in workflows.values():
    paths.update(w['sources'])
for w in new:
    paths.add(w['identity']['manifest'])
    package = read_json(ROOT/w['identity']['manifest'])
    for key in ['files', 'dependencies', 'retainedFiles', 'inputFiles']:
        prefix = relative_packages.get(w['identity']['package'], '')
        paths.update(prefix+row['path'] for row in package.get(key, []))
paths.update(['scripts/m2-outer-panels-v2/build.py',
              'prototype/public/assets/m1b/equipment.json',
              'prototype/public/assets/m2-outer-panels-v2/author-export.glb',
              'scripts/m2-onepiece-v1/build.py', 'scripts/install-onepiece-runtime.py',
              'prototype/public/assets/m2-onepiece-v1/author-export.glb',
              'prototype/public/assets/m2-onepiece-v1/fit.json',
              'scripts/m2-garment-coverage-v1/build.py',
              'scripts/m2-garment-coverage-v1/install-runtime.py',
              'prototype/public/assets/m2-garment-coverage-v1/coverage-mask.json'])
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
    row = (next(r for r in rows if r['path'] == 'generated/author-export.glb')
           if w['identity']['package'] in {'outer-panels', 'onepiece'}
           else next(r for r in rows if r['path'].endswith(('.vrm', '.glb')))
           if w['identity']['package'] not in {'garment-coverage'}
           else next(r for r in rows if r['path'] == 'coverage-mask.json'))
    prefix = relative_packages.get(w['identity']['package'], '')
    stored_path = prefix+row['path']
    v = Validator(); p = local(ROOT,stored_path); data = bytearray(p.read_bytes()); data[-1] ^= 1
    v.cache[p] = (bytes(data), hashlib.sha256(data).hexdigest())
    rejects(w['id']+' corrupt stored export', lambda: v.validate(w), stored_path)

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
outer = workflows['male-outer-panels-source']
b = 'assets-source/m2-outer-panels-v2/'
p = b+'generated/fit.json'
rejects('outer wrong fit version', lambda: JSONFault(p,lambda j:j.update(version=3)).validate(outer), 'Outer fit ID/version')
rejects('outer wrong target body', lambda: JSONFault(p,lambda j:j.update(targetBodySha256='0'*64)).validate(outer), 'Outer fit body')
rejects('outer wrong inner top', lambda: JSONFault(p,lambda j:j.update(innerTopSha256='0'*64)).validate(outer), 'Outer fit body/inner top')
rejects('outer unsupported layer', lambda: JSONFault(p,lambda j:j.update(layerWith=['other-top'])).validate(outer), 'Outer layer/bottom')
rejects('outer unsupported bottom', lambda: JSONFault(p,lambda j:j['allowedBottoms'].append('other-pants')).validate(outer), 'Outer layer/bottom')
rejects('outer coverage expansion', lambda: JSONFault(p,lambda j:j.update(coverage=['body'])).validate(outer), 'Outer layer/bottom')
rejects('outer stale fit asset', lambda: JSONFault(p,lambda j:j.update(assetSha256='0'*64)).validate(outer), 'Outer actual source export')
p = b+'generated/report.json'
rejects('outer wrong generator', lambda: JSONFault(p,lambda j:j.update(generatorSha256='0'*64)).validate(outer), 'scripts/m2-outer-panels-v2/build.py')
p = b+'rebuild/editable-report.json'
rejects('outer stale rebuild export', lambda: JSONFault(p,lambda j:j.update(authorExportSha256='0'*64)).validate(outer), 'Outer editable/rebuild')
p = 'prototype/public/assets/m1b/equipment.json'
def wrong_runtime(j):
    next(e for e in j['items'] if e['id'] == 'm2-male-open-vest-panels-v2')['sha256'] = '0'*64
rejects('outer runtime is not actual source', lambda: JSONFault(p,wrong_runtime).validate(outer), 'Outer runtime/source')
p = b+'generated/author-equipment.json'
rejects('outer corrupt actual source inverse bind',
        lambda: JSONFault(p,lambda j:j['items'][0]['bindings'][0]['inverseBindMatrix'].__setitem__(12, .2)).validate(outer),
        'Inverse bind mismatch')
onepiece = workflows['male-onepiece-source']
b = 'assets-source/m2-onepiece-v1/'
p = b+'generated/fit.json'
rejects('onepiece wrong fit version', lambda: JSONFault(p,lambda j:j.update(version=2)).validate(onepiece), 'Onepiece fit ID/version')
rejects('onepiece wrong target body', lambda: JSONFault(p,lambda j:j.update(targetBodySha256='0'*64)).validate(onepiece), 'Onepiece fit body')
rejects('onepiece loses bottom occupancy', lambda: JSONFault(p,lambda j:j.update(occupies=['top'])).validate(onepiece), 'Onepiece occupancy')
rejects('onepiece body mask expansion', lambda: JSONFault(p,lambda j:j.update(bodyCoverageMasks=['torso'])).validate(onepiece), 'Onepiece occupancy/coverage')
rejects('onepiece construction offset drift', lambda: JSONFault(p,lambda j:j.update(outerSurfaceOffsetMetres=.006)).validate(onepiece), 'Onepiece source dimension')
rejects('onepiece drops known static defects', lambda: JSONFault(p,lambda j:j.update(staticContacts={})).validate(onepiece), 'Onepiece stored static audit')
p = b+'generated/author-report.json'
rejects('onepiece no actual edited source', lambda: JSONFault(p,lambda j:j.update(editedFromEarlierSource=None)).validate(onepiece), 'Onepiece edited/repeat')
p = b+'repeat/author-report.json'
rejects('onepiece stale repeated author export', lambda: JSONFault(p,lambda j:j.update(authorExportSha256='0'*64)).validate(onepiece), 'Onepiece edited/repeat')
p = b+'generated/author-equipment.json'
rejects('onepiece actual source inverse bind corrupt',
        lambda: JSONFault(p,lambda j:j['items'][0]['bindings'][0]['inverseBindMatrix'].__setitem__(12,.2)).validate(onepiece), 'Inverse bind mismatch')
p = 'prototype/public/assets/m1b/equipment.json'
def wrong_onepiece_fit(j):
    next(e for e in j['items'] if e['id'] == 'm2-male-training-onepiece-v1')['fitResource']['sha256'] = '0'*64
rejects('onepiece runtime fit SHA drift', lambda: JSONFault(p,wrong_onepiece_fit).validate(onepiece), b+'generated/fit.json')
p = 'prototype/public/assets/m2-onepiece-v1/fit.json'
v = Validator(); data = bytearray(local(ROOT,p).read_bytes()); data[-1] ^= 1
v.cache[local(ROOT,p)] = (bytes(data),hashlib.sha256(data).hexdigest())
rejects('onepiece corrupt runtime fit bytes', lambda:v.validate(onepiece), p)
coverage = workflows['male-garment-coverage-source']
b = 'assets-source/m2-garment-coverage-v1/'
p = b+'spec.json'
rejects('coverage wrong source identity', lambda: JSONFault(p,lambda j:j.update(outerSha256='0'*64)).validate(coverage), 'SHA mismatch')
p = b+'coverage-mask.json'
rejects('coverage wrong selected face identity', lambda: JSONFault(p,lambda j:j.update(selectedFaceIds=[0])).validate(coverage), 'Garment coverage')
rejects('coverage loses inner-side witness', lambda: JSONFault(p,lambda j:j['observations'].update(innerSidePassed=False)).validate(coverage), 'Garment coverage geometry witness')
p = 'prototype/public/assets/m2-garment-coverage-v1/coverage-mask.json'
v = Validator(); data = bytearray(local(ROOT,p).read_bytes()); data[-1] ^= 1
v.cache[local(ROOT,p)] = (bytes(data),hashlib.sha256(data).hexdigest())
rejects('coverage corrupt public descriptor', lambda:v.validate(coverage), p)
assert fingerprint() == before, 'Source/output changed during read-only checks'
print(json.dumps({'passed': True, 'workflowCount': len(results),
                  'workflowResults': results, 'negativeCases': failures,
                  'sourceOutputUnchanged': before, 'exportsInvoked': False, 'browserStarted': False,
                  'scope': 'Stored source/export identity and bounded relationships only; not runtime/visual acceptance or batch production'}, indent=2))
