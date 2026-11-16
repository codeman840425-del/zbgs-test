"""Bounded frozen revision readback and temporary publisher refusal checks."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from flow import ROOT, Validator, local, read_json, validate_config
from long_hair_package import REVISION, SCRIPTS

config = read_json(ROOT/'scripts/production/workflows.json')
validate_config(config)
assert len(config['workflows']) == 16
workflow = next(w for w in config['workflows'] if w['id'] == 'long-hair-source')
node_check = next(c for c in workflow['stages']['check'] if SCRIPTS+'qa-rootjoin-v2.mjs' in c['argv'])
assert node_check['writes'] == [REVISION], 'Declare transitive root producer writes as well as Node reports'
v = Validator()
result = v.validate(workflow)
asset = result['assets'][0]
assert asset['inventoryFiles'] == 26 and asset['revisions'][0]['inventoryFiles'] == 16
assert asset['publishedBytesMatchSource'] and asset['revisions'][0]['publishedBytesMatchSource']
paths = {r['path'] for r in v.observed}


def fingerprint():
    return {p: hashlib.sha256(local(ROOT, p).read_bytes()).hexdigest() for p in paths}


before = fingerprint()
assert Validator().validate(workflow) == result
failures = []


def rejects(label, operation, expected):
    try:
        operation()
    except ValueError as error:
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


def fault(label, name, mutate, expected):
    rejects(label, lambda: JSONFault(name, mutate).validate(workflow), expected)


fault('revision wrong target body', REVISION+'fit.json', lambda j: j.update(targetBodySha256='0'*64), 'original body/attachment/physics')
fault('revision failed source QA', REVISION+'qa-report.json', lambda j: j.update(passed=False), 'source QA failed')
fault('revision source visual promotion refused', REVISION+'runtime-cpu-qa.json', lambda j: j.update(runtimeAccepted=True), 'cannot grant runtime/visual')
inventory = read_json(ROOT/(REVISION+'package-files.json'))
for attempt in ['attempt-1', 'attempt-2']:
    digest = next(r['sha256'] for r in inventory['files'] if r['path'] == REVISION+attempt+'/female-ponytail.glb')
    fault(attempt+' cannot replace curated asset', REVISION+'manifest.json', lambda j, digest=digest: j.update(sha256=digest), 'SHA mismatch')

publisher_commands = []
with tempfile.TemporaryDirectory(prefix='hair-revision-publisher-') as directory:
    mirror = Path(directory)
    for name in paths:
        target = mirror/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT/name, target)
    # Start with a fresh release so the actual staging/rename path executes.
    release = mirror/'test-release'

    def publish(dest, expected_error=None):
        argv = [sys.executable, '-B', str(mirror/(SCRIPTS+'publish-rootjoin-v2.py')), '--output', str(dest)]
        run = subprocess.run(argv, cwd=mirror, capture_output=True, text=True)
        publisher_commands.append({'argv': ['python', '-B', SCRIPTS+'publish-rootjoin-v2.py', '--output', '<temporary-release>'],
                                   'exitCode': run.returncode, 'expectedError': expected_error})
        if expected_error:
            assert run.returncode != 0 and expected_error in run.stdout+run.stderr, (run.returncode, run.stdout, run.stderr)
            failures.append(expected_error)
            return None
        assert run.returncode == 0, (run.stdout, run.stderr)
        return json.loads(run.stdout)

    first = publish(release)
    assert first['files'] == 3
    actual = {p.name: p.read_bytes() for p in release.iterdir()}
    times = {p.name: p.stat().st_mtime_ns for p in release.iterdir()}
    assert publish(release) == first
    assert actual == {p.name: p.read_bytes() for p in release.iterdir()}
    assert times == {p.name: p.stat().st_mtime_ns for p in release.iterdir()}
    (release/'fit.json').write_bytes(b'conflicting release')
    snapshot = {p.name: p.read_bytes() for p in release.iterdir()}
    publish(release, 'Different existing release')
    assert snapshot == {p.name: p.read_bytes() for p in release.iterdir()}

    failed = mirror/'failed-release'
    manifest_path = mirror/(REVISION+'manifest.json')
    original_manifest = manifest_path.read_bytes()
    altered = json.loads(original_manifest)
    altered['sha256'] = next(r['sha256'] for r in inventory['files'] if r['path'].endswith('attempt-1/female-ponytail.glb'))
    manifest_path.write_text(json.dumps(altered), encoding='utf-8')
    publish(failed, 'Refusing unreviewed root-join manifest identity')
    assert not failed.exists()
    manifest_path.write_bytes(original_manifest)

    qa_path = mirror/(REVISION+'qa-report.json')
    qa = read_json(qa_path)
    qa['passed'] = False
    changed = (json.dumps(qa)+'\n').encode()
    qa_path.write_bytes(changed)
    resealed = copy.deepcopy(inventory)
    row = next(r for r in resealed['files'] if r['path'] == REVISION+'qa-report.json')
    row.update(bytes=len(changed), sha256=hashlib.sha256(changed).hexdigest())
    (mirror/(REVISION+'package-files.json')).write_text(json.dumps(resealed), encoding='utf-8')
    publish(failed, 'Source validation did not pass')
    assert not failed.exists() and not list(mirror.rglob('.hair-stage-*'))

assert fingerprint() == before
report = {'passed': True, 'workflowCount': 16, 'sameWorkflowForBothCuratedVersions': True,
          'originalInventoryFiles': 26, 'revisionInventoryFiles': 16,
          'assets': asset, 'negativeCases': failures, 'publisherCommands': publisher_commands,
          'repeatPublishBytesAndMtimesIdentical': True, 'failedPublishChangesNothing': True,
          'sourceAndPublicBytesUnchanged': True, 'sourceFileSHA256': before,
          'GPUUsed': False, 'producerExecuted': False, 'publisherTemporaryMirrorOnly': True,
          'historicalRecursiveQAExecuted': False, 'runtimeAccepted': False, 'visualAccepted': False}
out = ROOT/'evidence/m2-long-hair-revision-production-v2'
out.mkdir(parents=True, exist_ok=True)
(out/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
shutil.copyfile(Path(__file__), out/'executed-script.py')
print(json.dumps({k: value for k, value in report.items() if k not in ['assets', 'sourceFileSHA256', 'publisherCommands']}, indent=2))
