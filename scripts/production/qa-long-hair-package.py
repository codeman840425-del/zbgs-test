"""Source-author long-hair readback and real publisher refusal checks."""
import copy
import hashlib
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import shutil
import sys
import tempfile
from unittest.mock import patch
from flow import ROOT, Validator, local, read_json, validate_config
from long_hair_package import BASE, GENERATED, OUTPUT, SCRIPTS

config = read_json(ROOT/'scripts/production/workflows.json'); validate_config(config)
workflow = next(w for w in config['workflows'] if w['id'] == 'long-hair-source')
v = Validator(); result = v.validate(workflow)
paths = {r['path'] for r in v.observed} | set(workflow['sources'])
fingerprint = lambda: {p: hashlib.sha256(local(ROOT, p).read_bytes()).hexdigest() for p in paths}
before = fingerprint(); assert result == Validator().validate(workflow)
assert result['assets'][0]['inventoryFiles'] == 26 and result['assets'][0]['publishedBytesMatchSource'] is True
failures = []


def rejects(label, operation, expected):
    try: operation()
    except (ValueError, FileNotFoundError) as error:
        assert expected in str(error), (label, str(error)); failures.append(label)
    else: raise AssertionError('Accepted '+label)


class JSONFault(Validator):
    def __init__(self, target, mutate):
        super().__init__(); self.target, self.mutate = target, mutate
    def json(self, name):
        value = super().json(name)
        if name == self.target: self.mutate(value)
        return value


def fault(label, file, mutate, expected):
    rejects(label, lambda: JSONFault(file, mutate).validate(workflow), expected)


fault('failed source QA', GENERATED+'qa-report.json', lambda j: j.update(passed=False), 'stored source QA')
fault('failed official API CPU QA', GENERATED+'runtime-cpu-qa.json', lambda j: j.update(passed=False), 'official API')
fault('source dynamic approval promoted', GENERATED+'runtime-cpu-qa.json', lambda j: j.update(runtimeAccepted=True), 'cannot grant dynamic')
fault('wrong target body', GENERATED+'fit.json', lambda j: j.update(targetBodySha256='0'*64), 'attachment/body/asset fit')
fault('bad spring child identity', GENERATED+'fit.json', lambda j: j['dynamics']['joints'][0].update(child='head'), 'mixed skin/spring chain')
fault('rigid fallback masquerade', GENERATED+'fit.json', lambda j: j.update(physics='rigid'), 'manifest/fit identity')
fault('failed retained model promoted', GENERATED+'manifest.json', lambda j: j.update(sha256=read_json(ROOT/(BASE+'failed-source-v1/build-report.json'))['baseAssetSha256']), 'SHA mismatch')
for file in [GENERATED+'female-ponytail.glb', GENERATED+'fit.json', SCRIPTS+'publish.py', OUTPUT+'female-ponytail.glb']:
    bad = Validator(); data = b'corrupt fixture'; bad.cache[local(ROOT, file)] = (data, hashlib.sha256(data).hexdigest())
    rejects('corrupt '+file, lambda: bad.validate(workflow), 'SHA mismatch: '+file)
inventory = read_json(ROOT/(GENERATED+'package-files.json'))
extra = copy.deepcopy(inventory); extra['files'].append(dict(extra['files'][0], path=BASE+'exports/unreviewed/female-ponytail.glb'))
raw = (json.dumps(extra)+'\n').encode(); bad = Validator(); bad.cache[local(ROOT, GENERATED+'package-files.json')] = (raw, hashlib.sha256(raw).hexdigest())
fixture = copy.deepcopy(workflow); fixture['identity']['manifestSha256'] = hashlib.sha256(raw).hexdigest()
rejects('extra export cannot enter frozen source inventory', lambda: bad.validate(fixture), 'extra export')

module_spec = importlib.util.spec_from_file_location('actual_long_hair_publisher', ROOT/(SCRIPTS+'publish.py'))
publisher = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(publisher)
with tempfile.TemporaryDirectory(prefix='long-hair-publish-') as directory:
    mirror = Path(directory)
    for file in paths:
        target = mirror/file; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT/file, target)
    publisher.ROOT = mirror; publisher.SOURCE = mirror/GENERATED
    destination = mirror/'releases/ponytail'
    def publish(dest):
        with patch.object(sys, 'argv', ['publish.py', '--output', str(dest)]), redirect_stdout(io.StringIO()) as output:
            publisher.main()
        return json.loads(output.getvalue())
    first = publish(destination); assert first['files'] == 3
    output = {p.name: p.read_bytes() for p in destination.iterdir()}; times = {p.name: p.stat().st_mtime_ns for p in destination.iterdir()}
    assert publish(destination) == first and output == {p.name: p.read_bytes() for p in destination.iterdir()} and times == {p.name: p.stat().st_mtime_ns for p in destination.iterdir()}
    (destination/'fit.json').write_bytes(b'conflicting release')
    snapshot = {p.name: p.read_bytes() for p in destination.iterdir()}
    rejects('publisher conflicting destination writes nothing', lambda: publish(destination), 'Different existing release')
    assert snapshot == {p.name: p.read_bytes() for p in destination.iterdir()}
    failed = mirror/'failed-release'
    for filename in ['fit.json', 'female-ponytail.glb']:
        target = publisher.SOURCE/filename; original = target.read_bytes(); target.write_bytes(b'corrupt source')
        rejects('publisher corrupt '+filename+' writes nothing', lambda: publish(failed), 'Source identity mismatch')
        assert not failed.exists(); target.write_bytes(original)
    original_inventory = (publisher.SOURCE/'package-files.json').read_bytes()
    def reseal(updates):
        changed = copy.deepcopy(inventory)
        for name, data in updates.items():
            (publisher.SOURCE/name).write_bytes(data)
            row = next(r for r in changed['files'] if r['path'] == GENERATED+name)
            row.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        (publisher.SOURCE/'package-files.json').write_bytes((json.dumps(changed)+'\n').encode())
    for filename in ['qa-report.json', 'runtime-cpu-qa.json']:
        original = (publisher.SOURCE/filename).read_bytes(); data = json.loads(original); data['passed'] = False
        reseal({filename: (json.dumps(data)+'\n').encode()})
        rejects('publisher failed '+filename+' writes nothing', lambda: publish(failed), 'Source validation did not pass')
        assert not failed.exists(); (publisher.SOURCE/filename).write_bytes(original); (publisher.SOURCE/'package-files.json').write_bytes(original_inventory)
    original_fit, original_manifest = [(publisher.SOURCE/n).read_bytes() for n in ['fit.json', 'manifest.json']]
    changed_fit = json.loads(original_fit); changed_fit['schema'] = 'character-hair-fit-v1'; fit_bytes = (json.dumps(changed_fit)+'\n').encode()
    changed_manifest = json.loads(original_manifest); changed_manifest['fit']['sha256'] = hashlib.sha256(fit_bytes).hexdigest()
    reseal({'fit.json': fit_bytes, 'manifest.json': (json.dumps(changed_manifest)+'\n').encode()})
    rejects('publisher wrong resealed fit schema writes nothing', lambda: publish(failed), 'Not the declared skinned spring fit')
    assert not failed.exists() and not list(mirror.rglob('.hair-stage-*'))
commands = [c for stage in workflow['stages'].values() for c in stage]
assert next(c for c in commands if SCRIPTS+'publish.py' in c['argv'])['writes'] == [OUTPUT, 'prototype/public/assets/.hair-stage-*/']
assert fingerprint() == before
print(json.dumps({'passed': True, 'reviewRole': 'Source author validation; not independent review', 'inventoryFiles': 26,
    'curatedPublicFiles': 3, 'retainedFailedOrUnreviewedExportsAdmitted': False, 'repeatReadbackIdentical': True,
    'firstRepeatPublishBytesAndTimesIdentical': True, 'negativeCases': failures, 'publisherTemporaryFullMirrorOnly': True,
    'repositorySourceAndPublicBytesUnchanged': True, 'producerExecuted': False, 'GPUUsed': False, 'runtimeAccepted': False}, indent=2))
