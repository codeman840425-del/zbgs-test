"""Frozen readback, in-memory refusals and disposable publisher fixtures."""
import hashlib
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import shutil
import tempfile

from flow import ROOT, Validator, local, read_json, validate_config
from lower_leg_package import BASE, GENERATED, OUTPUT, SCRIPTS

config = read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
workflow = next(w for w in config['workflows'] if w['id'] == 'lower-leg-proportion-source')
validator = Validator()
result = validator.validate(workflow)
paths = {r['path'] for r in validator.observed} | set(workflow['sources'])


def fingerprint():
    return {p: hashlib.sha256(local(ROOT, p).read_bytes()).hexdigest() for p in paths}


before = fingerprint()
assert result == Validator().validate(workflow)
detail = result['assets'][0]
assert detail['inventoryFiles'] == 24 and detail['runtimeAccepted'] is False
assert detail['publishedBytesMatchSource'] is True
failures = []


def rejects(label, operation, expected):
    try:
        operation()
    except (ValueError, FileNotFoundError, AssertionError) as error:
        assert expected in str(error), (label, str(error))
        failures.append(label)
    else:
        raise AssertionError('Accepted '+label)


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


def check_fault(label, path, mutate, expected):
    rejects(label, lambda: JSONFault(path, mutate).validate(workflow), expected)


check_fault('unsupported +30 mm parameter', BASE+'spec.json', lambda j: j.update(lowerLegLengthIncreaseM=.03), 'exact male +20 mm')
check_fault('old body masquerades as derived fit', GENERATED+'fit.json',
            lambda j: j.update(avatarSha256=j['sourceBodySha256']), 'derived fit identity')
check_fault('old body equipment fit', GENERATED+'equipment.json',
            lambda j: j['items'][0].update(compatibleAvatarSha256='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'),
            'Wrong body fit')
check_fault('failed source QA', GENERATED+'qa-report.json', lambda j: j.update(passed=False), 'stored source QA')
check_fault('source runtime promotion', GENERATED+'qa-report.json', lambda j: j.update(runtimeAccepted=True), 'cannot grant runtime')
check_fault('profile equivalence claim missing', GENERATED+'upper-body-fit.json',
            lambda j: j.update(selectedGeometryWeightsAndBindsExact=False), 'upper-body source equivalence')
check_fault('measured parent profile changed', 'prototype/public/assets/forearm-collision-v2/male.json',
            lambda j: j.update(profiles=[]), 'measured profile equivalence')
for label, path in [('corrupt derived export', GENERATED+'avatar.vrm'), ('corrupt published export', OUTPUT+'avatar.vrm')]:
    faulty = Validator()
    data = b'corrupt fixture'
    faulty.cache[local(ROOT, path)] = (data, hashlib.sha256(data).hexdigest())
    rejects(label, lambda: faulty.validate(workflow), 'SHA mismatch: '+path)

commands = [c for stage in workflow['stages'].values() for c in stage]
publish = next(c for c in commands if SCRIPTS+'publish.py' in c['argv'])
assert publish['writes'] == [OUTPUT]
repeat = next(c for c in commands if SCRIPTS+'qa.py' in c['argv'])
assert repeat['writes'] == [GENERATED]

# Execute the publisher only against disposable copied source bytes.
publisher_spec = importlib.util.spec_from_file_location('lower_leg_publisher_qa', ROOT/(SCRIPTS+'publish.py'))
publisher = importlib.util.module_from_spec(publisher_spec)
publisher_spec.loader.exec_module(publisher)
with tempfile.TemporaryDirectory(prefix='lower-leg-publish-') as directory:
    mirror = Path(directory)
    inventory = read_json(ROOT/(GENERATED+'package-files.json'))
    for name in [r['path'] for r in inventory['files']]+[GENERATED+'package-files.json']:
        target = mirror/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT/name, target)
    publisher.ROOT = mirror
    publisher.SOURCE = mirror/GENERATED
    publisher.DEST = mirror/OUTPUT
    with redirect_stdout(io.StringIO()):
        publisher.main()
        published = {p.name: p.read_bytes() for p in publisher.DEST.iterdir()}
        publisher.main()
    assert len(published) == 7
    assert published == {p.name: p.read_bytes() for p in publisher.DEST.iterdir()}
    publisher.DEST = mirror/'failed-publication'
    report_path = publisher.SOURCE/'qa-report.json'
    original_bytes = report_path.read_bytes()
    report_path.write_bytes(b'broken source')
    rejects('publisher inventory mismatch writes nothing', publisher.main, 'Source inventory mismatch')
    assert not publisher.DEST.exists()
    failed_report = json.loads(original_bytes)
    failed_report['passed'] = False
    failed_bytes = (json.dumps(failed_report)+'\n').encode('utf-8')
    report_path.write_bytes(failed_bytes)
    row = next(r for r in inventory['files'] if r['path'] == GENERATED+'qa-report.json')
    row.update(bytes=len(failed_bytes), sha256=hashlib.sha256(failed_bytes).hexdigest())
    (publisher.SOURCE/'package-files.json').write_text(json.dumps(inventory), encoding='utf-8')
    rejects('publisher failed QA writes nothing', publisher.main, 'Source QA incomplete')
    assert not publisher.DEST.exists()

assert fingerprint() == before, 'Readback changed original/source/published bytes'
print(json.dumps({'passed': True, 'inventoryFiles': 24, 'repeatReadbackIdentical': True,
                  'sourceAndPublishedBytesUnchanged': True, 'negativeCases': failures,
                  'producerExecuted': False, 'publisherTemporaryMirrorOnly': True,
                  'repeatPublishIdentical': True, 'GPUUsed': False,
                  'runtimeAccepted': False}, indent=2))
