"""Tiny geometry and bake/index fixtures only. Never reads a solved candidate."""
import copy
import json
from types import SimpleNamespace
import sys

sys.dont_write_bytecode = True
import numpy as np
import readback as entry


def main():
    spec, contract, semantic, _, records, baseline, total = entry.load_inputs()
    contacts, bake, _ = entry.functions(spec)
    checks = []
    V = np.array([[10, 0, 0], [11, 0, 0], [10, 1, 0],
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [.25, .25, -1], [.25, .25, 1], [.75, .25, 1]], float)
    mouth = np.array([[6, 7, 8]])
    skin = np.array([[0, 1, 2], [3, 4, 5]])
    assert contacts(V, mouth, skin) == {(0, 1)}
    assert contacts(V + np.array([.2, -.7, 3]), mouth, skin) == {(0, 1)}
    assert contacts(V, mouth, skin[::-1]) == {(0, 0)}
    checks.append({'id': 'actual-frozen-contacts-preserves-primitive-triangle-numbering', 'passed': True})
    P = np.array([[.1, .2, .3], [.4, .5, .6], [.7, .8, .9], [1, 1.1, 1.2]], dtype=np.float32)
    D = np.array([[.01, 0, 0], [0, .02, 0], [0, 0, .03], [.01, .02, .03]], dtype=np.float32)
    arrays = {0: P, 1: D, 2: np.array([[0, 1, 2]]), 3: np.array([[0, 2, 3]])}
    source = SimpleNamespace(accessor=lambda i: arrays[i], doc={'meshes': [{'primitives': [
        {'attributes': {'POSITION': 0}, 'targets': [{'POSITION': 1}]}]}]})
    little_contract = {'faceSurface': {'mesh': 0, 'primitive': 0, 'positionAccessor': 0, 'indexAccessor': 2},
        'mouthSurface': {'indexAccessor': 3}}
    slices = [(0, -1, [2, 0]), (2, -1, [1, 3]), (4, 0, [3, 1]), (6, 0, [0, 2])]
    little_records = [{'positionAccessor': 0, 'offset': offset, 'count': 2, 'endpoint': target,
        'sourceIndices': ids, 'mesh': 0, 'primitive': 0, 'role': 'synthetic'} for offset, target, ids in slices]
    B = P.astype(float) + np.array([.001, .002, .003])
    E = B + D.astype(float) * 1.1
    mapped = np.concatenate([(B if target == -1 else E)[ids] for _, target, ids in slices])
    _, decoded, _ = bake(mapped, little_records, source)
    frames = entry.reconstruct_face(decoded, little_records, source, little_contract)
    assert np.array_equal(frames[-1], B.astype(np.float32).astype(float))
    assert np.array_equal(frames[0], (B.astype(np.float32) + (E - B).astype(np.float32)).astype(float))
    checks.append({'id': 'actual-common-float32-bake-and-unordered-source-index-reconstruction', 'passed': True})
    try:
        entry.reconstruct_face(decoded, little_records[:-1], source, little_contract)
    except ValueError as error:
        checks.append({'id': 'missing-source-face-indices-rejected-without-identity-fallback', 'passed': True, 'error': str(error)})
    else:
        raise AssertionError('Missing indices were accepted')
    request = {'sourceRequestId': 'male-long-lean-v2', 'candidateId': 'male-long-lean-attachment-slim-v1'}
    report = {'schema': spec['candidateReportSchema'], 'status': spec['candidateSuccessStatus'],
        'id': request['candidateId'], 'sourceRequestId': request['sourceRequestId'],
        'methodSpecSha256': spec['inputs']['semanticContract']['sha256'],
        'sourceEndpointRecords': spec['inputs']['endpointRecords'], 'failures': [], 'finite': True,
        'actual': {'finite': True, 'minimumDeterminant': .2},
        'maximumProtectedNodeDisplacementM': 0, 'maximumProtectedEndpointDisplacementM': 0,
        'maximumFrameDisplacementM': 0, 'float32MorphBakeReadback': {'finite': True, 'maximumErrorM': 0},
        'original101HorizontalSectionsFloat32': {'passed': True, 'sectionCount': 101, 'missingSections': 0, 'maximumErrorM': .001}}
    entry.check_numeric_report(report, request, spec)
    checks.append({'id': 'documented-new-semantic-gate-interface-fixture', 'passed': True})
    wrong_cases = []
    for status in ['failed-not-admissible', 'numerical-head-candidate-only-old']:
        wrong = copy.deepcopy(report)
        wrong['status'] = status
        wrong_cases.append(('failed-or-unknown-status-' + status, wrong))
    wrong = copy.deepcopy(report)
    wrong['methodSpecSha256'] = '0' * 64
    wrong_cases.append(('wrong-method-rejected', wrong))
    wrong = copy.deepcopy(report)
    wrong['original101HorizontalSectionsFloat32']['maximumErrorM'] = .002638866
    wrong_cases.append(('formal-width-miss-rejected-before-contact', wrong))
    for name, value in wrong_cases:
        try:
            entry.check_numeric_report(value, request, spec)
        except ValueError as error:
            checks.append({'id': name, 'passed': True, 'error': str(error)})
        else:
            raise AssertionError(name)
    result = {'schema': 'head-attachment-postreadback-preparation-qa-v1', 'passed': True, 'checks': checks,
        'actualSource': contract['sourceBody'], 'originalEndpointRecords': len(records), 'sourceEndpointOccurrences': total,
        'exactOriginalStrictBaselineFramesLoaded': len(baseline),
        'sourceOrCandidate55FrameIntersectionExecuted': False, 'solvedCandidateArraysRead': False,
        'syntheticIntersectionCallsOnly': 3, 'runtimeAccepted': False}
    output = entry.BASE / 'qa.json'
    entry.require(not output.exists(), 'Preserve original QA')
    output.write_bytes(entry.encode(result))
    print(json.dumps({'passed': True, 'checks': len(checks), 'candidateContactExecuted': False}))


if __name__ == '__main__':
    main()
