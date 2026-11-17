"""Complete original metadata plus small synthetic new-method fixtures only."""
import copy
import argparse
import json
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
import numpy as np
import readback as entry


def main():
    spec, helper, contract, inventory, source, baseline = entry.load()
    expected = entry.source_records(source, inventory)
    checks = []
    entry.validate_records(expected, expected)
    assert len(expected['records']) == 56 and expected['sourceEndpointOccurrences'] == 120935
    checks.append({'id': 'real-source-9911-indices-56-records-120935-occurrences', 'passed': True})

    def reject(name, action):
        try:
            action()
        except ValueError as error:
            checks.append({'id': name, 'passed': True, 'error': str(error)})
        else:
            raise AssertionError(name)

    wrong = copy.deepcopy(expected)
    wrong['records'][0]['references'].pop(1)
    reject('missing-original-top-clothing-reference-rejected', lambda: entry.validate_records(wrong, expected))
    wrong = copy.deepcopy(expected)
    wrong['records'][0]['sourceIndices'][0] = wrong['records'][0]['sourceIndices'][1]
    reject('duplicate-and-missing-source-id-rejected', lambda: entry.validate_records(wrong, expected))
    wrong = copy.deepcopy(expected)
    wrong['records'][0]['endpoint'] = 0
    reject('fabricated-body-morph-rejected', lambda: entry.validate_records(wrong, expected))
    wrong = copy.deepcopy(expected)
    wrong['source']['sha256'] = '0' * 64
    reject('wrong-source-identity-rejected', lambda: entry.validate_records(wrong, expected))
    doc = copy.deepcopy(source.doc)
    doc['meshes'][1]['primitives'][0]['targets'][0]['POSITION'] += 1
    fake = SimpleNamespace(doc=doc, accessor=source.accessor)
    reject('real-source-shared-POSITION-target-signature-conflict-rejected', lambda: entry.source_records(fake, inventory))

    # New report contract fixture. This does not represent an evaluated G.
    policy = copy.deepcopy(spec)
    policy['evaluationSpec'] = {'path': 'synthetic-new-method.json', 'sha256': '1' * 64}
    request = {'sourceRequestId': 'male-long-lean-v2', 'candidateId': 'male-long-lean-axial-head-v1',
        'source': contract['sourceBody'], 'sourceSpec': policy['evaluationSpec'],
        'functionSpec': spec['inputs']['functionSpec'], 'coefficients': spec['coefficients']['male-long-lean-v2'],
        'coefficientAudit': spec['inputs']['coefficientAudit'], 'sourceInventory': spec['inputs']['inventory'],
        'sourceRecords': spec['inputs']['producerRecords'], 'fixedSourceMasks': spec['inputs']['producerMasks'],
        'mappedEndpoints': {'path': 'synthetic-arrays.npz', 'sha256': '4' * 64}}
    report = {**request, 'schema': spec['candidateReportSchema'], 'status': spec['successStatus'],
        'id': request['candidateId'], 'methodId': spec['evaluationMethodId'], 'methodSpecSha256': policy['evaluationSpec']['sha256'],
        'failures': [], 'finite': True, 'actualGJacobian': {'finite': True, 'minimumDeterminant': .5},
        'maximumFixedEyeDisplacementM': 0, 'maximumFixedNeckDisplacementM': 0,
        'maximumProtectedEndpointDisplacementM': 0, 'maximumFrameDisplacementM': 0,
        'rawArrays': request['mappedEndpoints'],
        'float32MorphBakeReadback': {'finite': True, 'maximumErrorM': 0},
        'original101HorizontalSectionsFloat32': {'passed': True, 'sectionCount': 101, 'missingSections': 0, 'maximumErrorM': .001}}
    entry.numeric_gate(report, request, policy)
    checks.append({'id': 'explicit-new-G-report-contract-fixture', 'passed': True})
    wrong = copy.deepcopy(report)
    wrong['methodId'] = 'male-head-attachment-slim-v1'
    reject('old-SLIM-method-rejected', lambda: entry.numeric_gate(wrong, request, policy))
    wrong = copy.deepcopy(report)
    wrong['actual'] = wrong.pop('actualGJacobian')
    reject('tet-field-cannot-substitute-for-actual-G-J', lambda: entry.numeric_gate(wrong, request, policy))
    wrong = copy.deepcopy(report)
    wrong['sourceSpec']['sha256'] = '0' * 64
    reject('wrong-new-sourceSpec-sha-rejected', lambda: entry.numeric_gate(wrong, request, policy))
    wrong = copy.deepcopy(report)
    wrong['rawArrays']['sha256'] = '0' * 64
    reject('passed-report-and-raw-array-split-rejected', lambda: entry.numeric_gate(wrong, request, policy))
    wrong = copy.deepcopy(report)
    wrong['original101HorizontalSectionsFloat32']['maximumErrorM'] = .003
    reject('formal-2mm-miss-rejected-before-contacts', lambda: entry.numeric_gate(wrong, request, policy))

    # Unequal source groups, explicit source index order and one face morph.
    arrays = {0: np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], np.float32),
        1: np.array([[.1, .2, .3], [.4, .5, .6], [.7, .8, .9]], np.float32),
        2: np.array([[.01, 0, 0], [0, .02, 0], [0, 0, .03]], np.float32),
        4: np.array([[0, 1, 2]]), 5: np.array([[2, 1, 0]])}
    tiny_source = SimpleNamespace(accessor=lambda i: arrays[i], doc={'meshes': [{}, {'primitives': [
        {'attributes': {'POSITION': 1}, 'targets': [{'POSITION': 2}]}]}]})
    tiny_rows = [{'positionAccessor': a, 'endpoint': e, 'sourceIndices': ids, 'offset': i * 3, 'count': 3,
        'references': [{'mesh': 0 if a == 0 else 1, 'primitive': 0}]} for i, (a, e, ids) in enumerate([
            (0, -1, [2, 0, 1]), (1, -1, [2, 0, 1]), (1, 0, [1, 2, 0])])]
    B0, B1 = arrays[0].astype(float) + .001, arrays[1].astype(float) + .002
    E = B1 + arrays[2].astype(float) * 1.1
    mapped = np.concatenate([B0[[2, 0, 1]], B1[[2, 0, 1]], E[[1, 2, 0]]])
    contacts, bake, _ = helper.functions(spec)
    adapted = entry.adapted_records(tiny_rows)
    _, decoded, _ = bake(mapped, adapted, tiny_source)
    tiny_contract = {'faceSurface': {'mesh': 1, 'primitive': 0, 'positionAccessor': 1, 'indexAccessor': 4}, 'mouthSurface': {'indexAccessor': 5}}
    frames = helper.reconstruct_face(decoded, adapted, tiny_source, tiny_contract)
    assert np.array_equal(frames[0], (B1.astype(np.float32) + (E - B1).astype(np.float32)).astype(float))
    checks.append({'id': 'new-records-adapt-to-real-float32-core-without-body-morph-fabrication', 'passed': True})
    V = np.array([[10, 0, 0], [11, 0, 0], [10, 1, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0], [.25, .25, -1], [.25, .25, 1], [.75, .25, 1]])
    assert contacts(V, np.array([[6, 7, 8]]), np.array([[0, 1, 2], [3, 4, 5]])) == {(0, 1)}
    checks.append({'id': 'actual-frozen-strict-triangle-numbering-synthetic-only', 'passed': True})
    result = {'schema': 'axial-head-postreadback-qa-v1', 'passed': True, 'checks': checks,
        'originalBaselineFramesLoaded': len(baseline), 'actualCandidateRead': False,
        'actual55FrameContactExecuted': False, 'syntheticContactCallsOnly': 1, 'runtimeAccepted': False}
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=entry.Path, default=entry.BASE / 'qa.json')
    args = parser.parse_args()
    output = args.out.resolve()
    require = helper.require
    require(output.is_relative_to(entry.BASE.resolve()) and not output.exists(), 'Use unused QA output inside package')
    output.write_bytes(helper.encode(result))
    print(json.dumps({'passed': True, 'checks': len(checks), 'actualCandidateRead': False}))


if __name__ == '__main__':
    main()
