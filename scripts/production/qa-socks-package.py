"""Source readback and publisher tests in an OS temporary mirror. CPU only."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from flow import ROOT, Validator, local, read_json, validate_config
from socks_package import producer

config = read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
workflow = next(w for w in config['workflows'] if w['id'] == 'socks-layer-source')
module = producer(ROOT)
v = Validator()
plan, originals, info = module.create_plan(ROOT, v)
tracked = {row['path'] for row in v.observed} | set(originals) | {workflow['identity']['manifest']}
fingerprint = lambda: {name: hashlib.sha256(local(ROOT, name).read_bytes()).hexdigest() for name in tracked}
before = fingerprint()
assert Validator().validate(workflow) == Validator().validate(workflow)
assert info['inventoryFiles'] == 25 and info['runtimeAccepted'] is False
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
    def __init__(self, target, mutate):
        super().__init__()
        self.target, self.mutate = target, mutate
    def json(self, name):
        value = super().json(name)
        if name == self.target:
            self.mutate(value)
        return value


def check_fault(label, target, mutate, expected):
    rejects(label, lambda: module.create_plan(ROOT, JSONFault(target, mutate)), expected)


generated = module.BASE+'generated/'
check_fault('incomplete inventory', generated+'package-files.json', lambda j: j['files'].pop(), 'inventory incomplete')
check_fault('failed source QA', generated+'qa-report.json', lambda j: j.update(passedSourceIdentityAndSkin=False), 'source-only socks QA')
check_fault('source runtime promotion', generated+'qa-report.json', lambda j: j.update(runtimeAccepted=True), 'source-only socks QA')
check_fault('wrong fit', generated+'male-fit.json', lambda j: j.update(baseAvatarSha256='0'*64), 'fit identity')
check_fault('wrong pairing', generated+'male-entry.json', lambda j: j['pairedWith']['lower'].pop(), 'pairing declaration')
check_fault('relative recipe URL', 'prototype/public/assets/m1b/equipment.json',
            lambda j: j['items'][3]['materialRecipes'][0].update(url='recipe.json'), 'absolute dependency URL')
check_fault('missing dependency', 'prototype/public/assets/m1b/equipment.json',
            lambda j: j['items'][0].update(url='missing.glb'), 'missing.glb')
check_fault('existing socks ID conflict', 'prototype/public/assets/m1/equipment.json',
            lambda j: j.update(items=[i for i in j['items'] if i['id'] != 'female-plain-crew-socks-v1']+
                [dict(read_json(ROOT/(generated+'female-entry.json')), url='/assets/wrong.glb')]), 'Existing socks entry differs')
bad = Validator()
path = local(ROOT, generated+'male-plain-crew-socks-v1.glb')
bad.cache[path] = (b'corrupt', hashlib.sha256(b'corrupt').hexdigest())
rejects('corrupt source GLB', lambda: module.create_plan(ROOT, bad), 'SHA mismatch')

with tempfile.TemporaryDirectory(prefix='socks-publisher-') as directory:
    mirror = Path(directory)
    for name in tracked:
        target = mirror/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local(ROOT, name), target)
    old = {name: read_json(mirror/name) for name in originals}
    first = module.publish(root=mirror)
    actual = {name: (mirror/name).read_bytes() for name in plan}
    assert all(actual[name] == data for name, data in plan.items())
    assert module.publish(root=mirror) == first
    assert actual == {name: (mirror/name).read_bytes() for name in plan}
    for name, manifest in old.items():
        updated = read_json(mirror/name)
        old_items = manifest['items']
        assert updated['items'][:len(old_items)] == old_items
        assert {k: val for k, val in updated.items() if k != 'items'} == {k: val for k, val in manifest.items() if k != 'items'}
        assert len(updated['items']) == len(old_items)+(not any(i['slot'] == 'socks' for i in old_items))
    assert not list(mirror.rglob('.socks-*'))
    conflicting = next(name for name in plan if name.endswith('.glb'))
    (mirror/conflicting).write_bytes(b'conflict')
    snapshots = {name: (mirror/name).read_bytes() for name in plan}
    rejects('differing existing output', lambda: module.publish(root=mirror), 'differing existing runtime file')
    assert snapshots == {name: (mirror/name).read_bytes() for name in plan}
    fresh = mirror/'preflight'
    for name, data in originals.items():
        target = fresh/name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    target = fresh/conflicting
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b'conflict')
    snapshot = {p.relative_to(fresh).as_posix(): p.read_bytes() for p in fresh.rglob('*') if p.is_file()}
    rejects('full preflight before any new write', lambda: module.publish(target_root=fresh), 'differing existing runtime file')
    assert snapshot == {p.relative_to(fresh).as_posix(): p.read_bytes() for p in fresh.rglob('*') if p.is_file()}

assert fingerprint() == before, 'Source or original manifest changed during QA'
commands = [c for stage in workflow['stages'].values() for c in stage]
publish = next(c for c in commands if module.SCRIPTS+'publish.py' in c['argv'])
assert set(publish['writes']) == {module.OUTPUT, *originals}
print(json.dumps({'passed': True, 'inventoryFiles': 25, 'repeatReadbackAndPublishIdentical': True,
    'originalEntriesAndOrderPreserved': True, 'negativeCases': failures, 'sourceAndOriginalBytesUnchanged': True,
    'temporaryMirrorOnly': True, 'GPUUsed': False, 'runtimeAccepted': False}, indent=2))
