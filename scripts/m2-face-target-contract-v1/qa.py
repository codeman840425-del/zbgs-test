"""Real resource readback, repeatability and bounded misuse rejection checks."""
import copy
import json
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
import build


def main():
    checks = []
    expected = build.documents()
    output = build.BASE / 'generated'
    build.check_output(output, expected)
    checks.append({'id': 'actual-sources-edges-native-guide-and-808-section-readback', 'passed': True})
    before = {p.relative_to(output).as_posix(): (build.digest(p.read_bytes()), p.stat().st_mtime_ns)
        for p in output.rglob('*') if p.is_file()}
    require = build.require
    require(build.produce(output, build.documents()) == 'identical-existing-output', 'Repeat rewrote output')
    after = {p.relative_to(output).as_posix(): (build.digest(p.read_bytes()), p.stat().st_mtime_ns)
        for p in output.rglob('*') if p.is_file()}
    require(before == after, 'Repeat changed bytes or modification times')
    checks.append({'id': 'repeat-generation-identical-sha-and-no-rewrite', 'passed': True, 'files': len(before)})
    manifest = expected['manifest.json']
    require(manifest['existingBodySourcePassed'] == 6 and manifest['existingBodySourceFailed'] == 2 and
        manifest['newFacePassedCount'] == 0 and not manifest['volumeDomainCreated'], 'Overstated progress')
    spec = json.loads((build.BASE / 'spec.json').read_bytes())
    source_status = build.read_json(spec['sourceStatus'])
    require(len(source_status['variants']) == 8 and sum(v['status'] == 'failed' for v in source_status['variants']) == 2, 'Original6/8 facts differ')
    original_failure = build.read_json(spec['originalPreflight'])
    require(original_failure['status'] == 'failed-stop-before-batch' and not original_failure['shapeBatchStarted'], 'Original strict prerequisite failure was lost')
    checks.append({'id': 'six-of-eight-body-status-and-original-strict-failure-retained', 'passed': True})
    for sex in ['female', 'male']:
        source = expected['source-' + sex + '.json']
        protected = source['featurePreservation']['protectedPrimitives']
        require(len(protected) == 7 and all(p['endpoints'][0]['target'] == -1 for p in protected), 'Missing protection base')
        require(all([e['target'] for e in p['endpoints']] == list(range(-1, p['endpointCount'] - 1)) for p in protected), 'Missing original protection endpoint')
        require(all(e['volumeMapping'] is None for p in protected for e in p['endpoints']), 'False completed volume map')
    checks.append({'id': 'all-seven-protected-primitives-base-and-individual-endpoints-declared', 'passed': True})
    validation = build.BASE / 'validation'
    validation.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='qa-', dir=validation) as temporary:
        fixture = Path(temporary)
        target_name = 'targets/male-long-lean-v2.json'
        correct = expected[target_name]

        def reject(identifier, action):
            try:
                action()
            except ValueError as error:
                checks.append({'id': identifier, 'passed': True, 'error': str(error)})
            else:
                raise AssertionError('Missing rejection: ' + identifier)

        pinned = fixture / 'source-copy.bin'
        body_ref = expected['source-male.json']['sourceBody']
        source_bytes = build.read_pin(body_ref)
        pinned.write_bytes(source_bytes[:-1] + bytes([source_bytes[-1] ^ 1]))
        reject('actual-source-byte-tamper-rejected', lambda: build.read_pin({'path': pinned.name, 'sha256': body_ref['sha256']}, fixture))
        reject('missing-source-rejected', lambda: build.read_pin({'path': 'missing.vrm', 'sha256': body_ref['sha256']}, fixture))
        reject('unsafe-resource-path-rejected', lambda: build.read_pin({'path': '../source.vrm', 'sha256': body_ref['sha256']}, fixture))
        reject('missing-contract-output-rejected', lambda: build.check_output(fixture / 'missing-output', expected))
        reject('outside-package-output-rejected-before-write', lambda: build.produce(build.BASE.parent / 'not-authorized-face-output', expected))

        path = fixture / target_name
        path.parent.mkdir()
        mutations = []
        wrong = copy.deepcopy(correct)
        wrong['materialGuide']['acceptanceRequired'] = True
        mutations.append(('material-guide-cannot-become-formal-gate', wrong))
        wrong = copy.deepcopy(correct)
        wrong['sectionAcceptance']['requestedYMetres'].pop()
        mutations.append(('missing-101st-section-rejected', wrong))
        wrong = copy.deepcopy(correct)
        wrong['sectionAcceptance']['maximumAbsoluteHalfWidthErrorM'] = .003
        mutations.append(('formal-2mm-threshold-change-rejected', wrong))
        wrong = copy.deepcopy(correct)
        wrong['sourceBody']['sha256'] = '0' * 64
        mutations.append(('wrong-target-source-identity-rejected', wrong))
        wrong = copy.deepcopy(correct)
        wrong['originalRequest']['parameters']['jawWidth'] = 0
        mutations.append(('original-request-parameter-change-rejected', wrong))
        wrong = copy.deepcopy(correct)
        wrong['nativeVertexGuide']['acceptanceRequired'] = True
        mutations.append(('native-guide-cannot-become-formal-gate', wrong))
        for identifier, changed in mutations:
            path.write_bytes(build.encoded(changed))
            reject(identifier, lambda: build.check_output(fixture, {target_name: correct}))
    require(all(c['passed'] for c in checks), 'QA failed')
    result = {'schema': 'face-target-contract-qa-v1', 'checks': checks, 'passed': True,
        'frozenInputHashesUnchanged': True, 'blenderStarted': False, 'shapeSolveCalled': False,
        'runtimeAccepted': False, 'producerSHA256': build.digest(Path(build.__file__).read_bytes())}
    (validation / 'qa.json').write_bytes(build.encoded(result))
    print(json.dumps({'passed': True, 'checks': len(checks), 'repeatFiles': len(before), 'shapeGenerated': False}))


if __name__ == '__main__':
    main()
