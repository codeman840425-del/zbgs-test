"""Source-author focused readback and actual publisher in disposable mirrors."""
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
from surface_package import BASE, GENERATED, OUTPUT, SCRIPTS

config = read_json(ROOT/'scripts/production/workflows.json'); validate_config(config)
workflow = next(w for w in config['workflows'] if w['id'] == 'surface-layer-source')
v = Validator(); first = v.validate(workflow)
paths = {r['path'] for r in v.observed} | set(workflow['sources'])
fingerprint = lambda: {p: hashlib.sha256(local(ROOT, p).read_bytes()).hexdigest() for p in paths}
before = fingerprint(); assert first == Validator().validate(workflow)
assert first['assets'][0]['inventoryFiles'] == 24 and first['assets'][0]['publishedFiles'] == 11
assert first['assets'][0]['publishedBytesMatchSource'] is True
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


def fault(label, path, mutate, expected):
    rejects(label, lambda: JSONFault(path, mutate).validate(workflow), expected)


fault('failed source QA', GENERATED+'qa-report.json', lambda j: j.update(passed=False), 'stored source QA')
fault('missing output protection proof', GENERATED+'output-qa.json', lambda j: j.update(wholePlanCheckedBeforeAnyWrite=False), 'output protection QA')
fault('source acceptance promoted', GENERATED+'manifest.json', lambda j: j.update(runtimeAccepted=True), 'source-only report')
fault('wrong body identity', GENERATED+'manifest.json', lambda j: j['variants'][0].update(avatarSha256='0'*64), 'exact body identity')
fault('wrong decoded source pixels', GENERATED+'manifest.json', lambda j: j['variants'][0].update(sourcePixelSha256='0'*64), 'source texture identity')
fault('wrong shade image reference', GENERATED+'manifest.json', lambda j: j['variants'][0]['textureReferences'][2].update(imageIndex=0), 'source texture identity')
fault('protected pixels changed', GENERATED+'qa-report.json', lambda j: j['bodies'][0]['layers'][0].update(protectedChangedPixels=1), 'source protection identity')
for name in [GENERATED+'female-freckles.png', SCRIPTS+'publish.py', OUTPUT+'manifest.json']:
    bad = Validator(); raw = b'corrupt fixture'; bad.cache[local(ROOT, name)] = (raw, hashlib.sha256(raw).hexdigest())
    rejects('corrupt '+name, lambda: bad.validate(workflow), 'SHA mismatch: '+name)
inventory = read_json(ROOT/(GENERATED+'package-files.json'))
mutated = copy.deepcopy(inventory); mutated['files'][-1] = mutated['files'][0]
raw = (json.dumps(mutated)+'\n').encode(); bad = Validator(); inventory_path = local(ROOT, GENERATED+'package-files.json')
bad.cache[inventory_path] = (raw, hashlib.sha256(raw).hexdigest()); fixture = copy.deepcopy(workflow)
fixture['identity']['manifestSha256'] = hashlib.sha256(raw).hexdigest()
rejects('duplicate inventory fixture', lambda: bad.validate(fixture), 'inventory incomplete or duplicate')

module_spec = importlib.util.spec_from_file_location('actual_surface_publisher', ROOT/(SCRIPTS+'publish.py'))
publisher = importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(publisher)
with tempfile.TemporaryDirectory(prefix='surface-publish-') as directory:
    mirror = Path(directory)
    for name in [r['path'] for r in inventory['files']]+[GENERATED+'package-files.json']:
        target = mirror/name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(ROOT/name, target)
    publisher.ROOT = mirror; publisher.SOURCE = mirror/GENERATED
    destination = mirror/'release'
    def publish(dest):
        with patch.object(sys, 'argv', ['publish.py', '--output', str(dest)]), redirect_stdout(io.StringIO()) as output:
            publisher.main()
        return json.loads(output.getvalue())
    first_publish = publish(destination)
    published = {p.name: p.read_bytes() for p in destination.iterdir()}
    times = {p.name: p.stat().st_mtime_ns for p in destination.iterdir()}
    assert first_publish['published'] is True and first_publish['files'] == len(published) == 11
    assert publish(destination) == first_publish
    assert published == {p.name: p.read_bytes() for p in destination.iterdir()} and times == {p.name: p.stat().st_mtime_ns for p in destination.iterdir()}
    (destination/'female-freckles.png').write_bytes(b'conflict')
    conflicting = {p.name: p.read_bytes() for p in destination.iterdir()}
    rejects('publisher different release writes nothing', lambda: publish(destination), 'Different existing release')
    assert conflicting == {p.name: p.read_bytes() for p in destination.iterdir()}
    failed = mirror/'failed-release'
    source_png = publisher.SOURCE/'female-blush.png'; original_png = source_png.read_bytes(); source_png.write_bytes(b'broken source')
    rejects('publisher tampered source writes nothing', lambda: publish(failed), 'Source inventory mismatch')
    assert not failed.exists(); source_png.write_bytes(original_png)
    qa_path = publisher.SOURCE/'qa-report.json'; original_qa = qa_path.read_bytes()
    qa = json.loads(original_qa); qa['passed'] = False; failed_qa = (json.dumps(qa)+'\n').encode(); qa_path.write_bytes(failed_qa)
    changed_inventory = copy.deepcopy(inventory)
    row = next(r for r in changed_inventory['files'] if r['path'] == GENERATED+'qa-report.json')
    row.update(bytes=len(failed_qa), sha256=hashlib.sha256(failed_qa).hexdigest())
    (publisher.SOURCE/'package-files.json').write_bytes((json.dumps(changed_inventory)+'\n').encode())
    rejects('publisher failed QA writes nothing', lambda: publish(failed), 'Source checks have not passed')
    assert not failed.exists() and not list(mirror.glob('.surface-stage-*'))
commands = [c for stage in workflow['stages'].values() for c in stage]
assert next(c for c in commands if SCRIPTS+'publish.py' in c['argv'])['writes'] == [OUTPUT, 'prototype/public/assets/.surface-stage-*/']
assert next(c for c in commands if SCRIPTS+'qa.py' in c['argv'])['writes'] == [GENERATED, BASE+'tmp*.json']
assert fingerprint() == before
print(json.dumps({'passed': True, 'reviewRole': 'Source author validation, not independent review', 'inventoryFiles': 24,
    'exactPublicFiles': 11, 'repeatReadbackIdentical': True, 'firstAndRepeatPublishIdentical': True,
    'negativeCases': failures, 'repositorySourceAndPublicBytesUnchanged': True,
    'publisherExecutedOnlyInTemporaryMirror': True, 'producerExecuted': False, 'GPUUsed': False, 'runtimeAccepted': False}, indent=2))
