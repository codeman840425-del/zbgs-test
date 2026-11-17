"""Synthetic guard and authored-normal tests. Never invokes bake."""
import copy
import json
from types import SimpleNamespace

from adapter import BASE, function, io, np, strict_gate, validate_results


def run():
    tests = []
    source = SimpleNamespace(doc={'meshes': [{'primitives': [
        {'attributes': {'POSITION': 0, 'NORMAL': 1}, 'targets': [{'POSITION': 2}]}]}]},
        acc=lambda _: np.zeros((3, 3)))
    fresh = {0: {'positions': np.zeros((3, 3)), 'normals': np.ones((3, 3)),
        'endpoints': [np.ones((3, 3))], 'endpointNormals': [np.ones((3, 3))]}}
    validate_results(source, fresh)
    tests.append('complete-synthetic-one-target-accepted-before-bake')
    def refuses(name, operation):
        try:
            operation()
        except (ValueError, KeyError):
            tests.append(name)
        else:
            raise AssertionError('Expected refusal: ' + name)
    for key in ['endpoints', 'endpointNormals']:
        wrong = copy.deepcopy(fresh)
        wrong[0][key] = []
        refuses('zip-length-' + key, lambda: validate_results(source, wrong))
    wrong = copy.deepcopy(fresh)
    wrong[0]['positionAccessor'] = 3
    refuses('mutated-results', lambda: validate_results(source, wrong))
    wrong = copy.deepcopy(fresh)
    wrong[0]['normals'][0, 0] = np.nan
    refuses('nonfinite-normal', lambda: validate_results(source, wrong))
    wrong = copy.deepcopy(fresh)
    wrong[0]['positions'] = np.zeros((2, 3))
    refuses('partial-accessor', lambda: validate_results(source, wrong))
    refuses('missing-group', lambda: validate_results(source, {}))
    shared = copy.deepcopy(source.doc)
    shared['meshes'][0]['primitives'].append({'attributes': {'POSITION': 0, 'NORMAL': 4}, 'targets': [{'POSITION': 2}]})
    refuses('shared-normal-conflict', lambda: validate_results(SimpleNamespace(doc=shared, acc=source.acc), fresh))
    shared['meshes'][0]['primitives'][1]['attributes']['NORMAL'] = 1
    shared['meshes'][0]['primitives'][1]['targets'] = []
    refuses('shared-target-conflict', lambda: validate_results(SimpleNamespace(doc=shared, acc=source.acc), fresh))
    mapping = function('scripts/m2-representative-batch-v1/deform.py', 'normal_map')
    N = np.array([[.2, .8, -.3], [1., 0., 0.]])
    J = np.broadcast_to(np.eye(3), (2, 3, 3)).copy()
    base, endpoint = mapping(N, J), mapping(N, J)
    assert np.array_equal(base, N) and np.array_equal(endpoint-base, np.zeros_like(N))
    tests.append('identity-authored-N-and-zero-endpoint-delta')
    J[:, 0, 1] = .25
    expected = np.linalg.solve(J.transpose(0, 2, 1), N[:, :, None])[:, :, 0]
    expected *= (np.linalg.norm(N, axis=1)/np.linalg.norm(expected, axis=1))[:, None]
    assert np.array_equal(mapping(N, J), expected)
    tests.append('actual-J-inverse-transpose-author-length')
    refuses('old-method-strict-report', lambda: strict_gate({'schema': 'semantic-head-slim-result-v1'}, {}, {}))
    return {'schema': 'axial-head-export-prepare-qa-v1', 'passed': True, 'checks': tests,
        'bakeInvocations': 0, 'realCandidateExported': False}


if __name__ == '__main__':
    result = run()
    io.save(BASE / 'qa-report.json', result)
    print(json.dumps(result))
