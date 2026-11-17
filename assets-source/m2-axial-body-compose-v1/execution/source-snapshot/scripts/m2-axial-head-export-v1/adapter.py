"""Complete accessor assembly around unchanged bake and authored-normal helpers."""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import struct
from types import SimpleNamespace

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-head-export-v1'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def module(path, name):
    loader = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(result)
    return result


io = module('scripts/m2-axial-head-evaluation-v1/source.py', 'axial_export_source_io')


def pinned(reference):
    path = ROOT / reference['path']
    require(io.sha(path) == reference['sha256'], 'Input SHA differs: ' + reference['path'])
    return path


def function(path, name):
    tree = ast.parse((ROOT / path).read_bytes())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    env = {'np': np}
    exec(compile(ast.Module([node], []), path + ':' + name, 'exec'), env)
    return env[name]


def load():
    spec = json.loads((BASE / 'spec.json').read_bytes())
    for reference in spec['inputs']:
        pinned(reference)
    audit = json.loads(pinned(spec['numericalAudit']).read_bytes())
    require(audit['status'] == 'complete-numerical-readback-only-not-production-admission', 'Incomplete numerical audit')
    evaluation = json.loads(pinned(spec['evaluationSpec']).read_bytes())
    source, inventory = io.load(evaluation)
    records, _, groups, _ = io.source_records(source, inventory)
    actual = json.loads(pinned(spec['sourceRecords']).read_bytes())
    require(actual['records'] == records and actual['totalSourceEndpointOccurrences'] == 120935,
        'Incomplete or changed full source records')
    return spec, source, records, groups


def validate_results(source, results):
    consumers = {}
    for mesh in source.doc['meshes']:
        for primitive in mesh['primitives']:
            consumers.setdefault(primitive['attributes']['POSITION'], []).append(primitive)
    require(set(results) == set(consumers), 'Missing or foreign POSITION result group')
    for accessor, primitives in consumers.items():
        row = results[accessor]
        require(not {'positionAccessor', 'normalAccessor', 'targets'} & row.keys(), 'Reused mutated bake results')
        require(len({p['attributes']['NORMAL'] for p in primitives}) == 1, 'Conflicting shared NORMAL source')
        targets = primitives[0].get('targets', [])
        require(all(p.get('targets', []) == targets for p in primitives), 'Conflicting shared target source')
        require(len(targets) == len(row['endpoints']) == len(row['endpointNormals']), 'Target/endpoints/normal zip length differs')
        shape = source.acc(accessor).shape
        for value in [row['positions'], row['normals'], *row['endpoints'], *row['endpointNormals']]:
            require(value.shape == shape and np.isfinite(value).all(), 'Incomplete or nonfinite accessor result')


def assemble(source, records, raw):
    total = sum(r['count'] for r in records)
    P, Q, saved, J = [raw[k] for k in ['sourceEndpointsM', 'mappedEndpointsM', 'float32BakeRoundTripM', 'sourceJacobians']]
    require(P.shape == Q.shape == saved.shape == (total, 3) and J.shape == (total, 3, 3), 'Complete endpoint/J shape required')
    require(all(np.isfinite(v).all() for v in [P, Q, saved, J]), 'Nonfinite endpoint/J')
    require(np.linalg.det(J).min() > .12, 'Saved actual G Jacobian fails .12')
    transfer = function('scripts/m2-representative-batch-v1/deform.py', 'normal_map')
    consumers = {}
    for mesh in source.doc['meshes']:
        for primitive in mesh['primitives']:
            consumers.setdefault(primitive['attributes']['POSITION'], []).append(primitive)
    results = {}
    for record in records:
        accessor, endpoint = record['positionAccessor'], record['endpoint']
        a, n = record['offset'], record['count']
        require(record['sourceIndices'] == list(range(source.acc(accessor).shape[0])), 'Partial or reordered source group')
        primitive = consumers[accessor][0]
        original = source.acc(accessor).astype(float)
        N = source.acc(primitive['attributes']['NORMAL']).astype(float)
        if endpoint >= 0:
            target = primitive['targets'][endpoint]
            original += source.acc(target['POSITION']).astype(float)
            if 'NORMAL' in target:
                N += source.acc(target['NORMAL']).astype(float)
        require(np.array_equal(P[a:a+n], original), 'Raw endpoint not the original actual P+D')
        mapped_N = transfer(N, J[a:a+n])
        if endpoint == -1:
            require(accessor not in results, 'Duplicate base')
            results[accessor] = {'positions': Q[a:a+n].copy(), 'normals': mapped_N,
                'endpoints': [], 'endpointNormals': []}
            reconstructed = Q[a:a+n].astype(np.float32)
        else:
            row = results[accessor]
            require(len(row['endpoints']) == endpoint, 'Missing or reordered morph endpoint')
            row['endpoints'].append(Q[a:a+n].copy())
            row['endpointNormals'].append(mapped_N)
            reconstructed = row['positions'].astype(np.float32) + (Q[a:a+n] - row['positions']).astype(np.float32)
        require(np.array_equal(reconstructed.astype(float), saved[a:a+n]), 'Raw simulated bake differs')
    validate_results(source, results)
    return results


def bake_bytes(source, results, provenance):
    # Only the existing hard-coded generator RHS is replaced. Binary append core is unchanged.
    validate_results(source, results)
    path = 'scripts/m2-representative-head-cage-v1/export.py'
    tree = ast.parse((ROOT / path).read_bytes())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'bake')
    assignments = [n for n in ast.walk(node) if isinstance(n, ast.Assign) and
        any(ast.unparse(t) == "doc['asset']['generator']" for t in n.targets)]
    require(len(assignments) == 1 and isinstance(assignments[0].value, ast.Constant), 'Unexpected bake provenance seam')
    assignments[0].value = ast.Constant(provenance)
    ast.fix_missing_locations(node)
    env = {'np': np, 'copy': copy, 'json': json, 'struct': struct}
    exec(compile(ast.Module([node], []), path + ':generator-RHS-only', 'exec'), env)
    # This call owns results, which must never be supplied to bake again.
    return env['bake'](SimpleNamespace(doc=source.doc, binary=source.bin), results)


def strict_gate(report, case, spec):
    require(report['schema'] == 'axial-head-postreadback-result-v1' and
        report['status'] == 'contacts-and-fixed-endpoints-passed-semantic-review-pending' and
        report['methodId'] == 'm2-axial-head-readback-v1', 'Strict/fixed report has not passed')
    request = report['inputRequest']
    require(report['candidateId'] == case['candidateId'] and request['sourceRequestId'] == case['sourceRequestId'], 'Wrong strict candidate')
    for key, expected in [('source', spec['source']), ('report', case['evaluationReport']),
            ('mappedEndpoints', case['mappedEndpoints']), ('sourceSpec', spec['evaluationSpec']),
            ('sourceRecords', spec['sourceRecords'])]:
        require(request[key] == expected, 'Strict input differs: ' + key)
    frames = report['frames']
    require(len(frames) == 55 and sorted(r['target'] for r in frames) == list(range(-1, 54)), 'Incomplete strict 55 original states')
    require(all(r['passed'] and r['newStrictPairs'] == [] for r in frames), 'New strict pairs')
    require(report['fixedEndpoints'] and all(r['passed'] and r['maximumDisplacementM'] <= 2e-6
        for r in report['fixedEndpoints']), 'Fixed endpoint readback failed')


def readback(source, actual, expected, identity=False):
    require(actual.bin[:len(source.bin)] == source.bin, 'Original binary prefix changed')
    require(set(actual.doc) == set(source.doc), 'Document properties added/removed')
    for key, value in source.doc.items():
        if key not in {'asset', 'meshes', 'accessors', 'bufferViews', 'buffers'}:
            require(actual.doc[key] == value, 'Original document property changed: ' + key)
    require({k:v for k,v in actual.doc['asset'].items() if k != 'generator'} ==
        {k:v for k,v in source.doc['asset'].items() if k != 'generator'}, 'Original asset metadata changed')
    require(actual.doc['accessors'][:len(source.doc['accessors'])] == source.doc['accessors'], 'Original accessors changed')
    require(actual.doc['bufferViews'][:len(source.doc['bufferViews'])] == source.doc['bufferViews'], 'Original views changed')
    require(len(actual.doc['meshes']) == len(source.doc['meshes']) and len(actual.doc['buffers']) == len(source.doc['buffers']), 'Mesh/buffer count changed')
    for original, output in zip(source.doc['buffers'], actual.doc['buffers'], strict=True):
        require({k:v for k,v in original.items() if k != 'byteLength'} ==
            {k:v for k,v in output.items() if k != 'byteLength'}, 'Original buffer metadata changed')
    require(actual.images() == source.images(), 'Original image bytes changed')
    maximum_position, maximum_normal, identity_N_error, max_delta = 0., 0., 0., 0.
    targets_checked, primitive_count = 0, 0
    shared = {}
    for mi, mesh in enumerate(source.doc['meshes']):
        other_mesh = actual.doc['meshes'][mi]
        require({k:v for k,v in mesh.items() if k != 'primitives'} ==
            {k:v for k,v in other_mesh.items() if k != 'primitives'}, 'Mesh/expression metadata changed')
        require(len(mesh['primitives']) == len(other_mesh['primitives']), 'Primitive count changed')
        for pi, primitive in enumerate(mesh['primitives']):
            other = other_mesh['primitives'][pi]
            row = expected[primitive['attributes']['POSITION']]
            require({k:v for k,v in primitive.items() if k not in {'attributes','targets'}} ==
                {k:v for k,v in other.items() if k not in {'attributes','targets'}}, 'Primitive/index/material changed')
            require({k:v for k,v in primitive['attributes'].items() if k not in {'POSITION','NORMAL'}} ==
                {k:v for k,v in other['attributes'].items() if k not in {'POSITION','NORMAL'}}, 'UV/skin/other attributes changed')
            signature = (other['attributes']['POSITION'], other['attributes']['NORMAL'], json.dumps(other.get('targets', []), sort_keys=True))
            require(shared.setdefault(primitive['attributes']['POSITION'], signature) == signature, 'Shared consumer export differs')
            P, N = actual.acc(other['attributes']['POSITION']), actual.acc(other['attributes']['NORMAL'])
            require(np.array_equal(P, row['positions'].astype(np.float32)) and np.array_equal(N, row['normals'].astype(np.float32)), 'Base output differs')
            maximum_position = max(maximum_position, float(np.linalg.norm(P.astype(float)-row['positions'],axis=1).max()))
            maximum_normal = max(maximum_normal, float(np.linalg.norm(N.astype(float)-row['normals'],axis=1).max()))
            require(len(other.get('targets', [])) == len(primitive.get('targets', [])), 'Target list changed')
            original_N = source.acc(primitive['attributes']['NORMAL'])
            identity_N_error = max(identity_N_error, float(abs(N-original_N).max()))
            for target_index, target in enumerate(other.get('targets', [])):
                original_target = primitive['targets'][target_index]
                require({k:v for k,v in target.items() if k not in {'POSITION','NORMAL'}} ==
                    {k:v for k,v in original_target.items() if k not in {'POSITION','NORMAL'}}, 'Other morph attribute changed')
                dP, dN = actual.acc(target['POSITION']), actual.acc(target['NORMAL'])
                expected_dP = (row['endpoints'][target_index]-row['positions']).astype(np.float32)
                expected_dN = (row['endpointNormals'][target_index]-row['normals']).astype(np.float32)
                require(np.array_equal(dP, expected_dP) and np.array_equal(dN, expected_dN), 'Morph position/normal delta differs')
                require(np.isfinite(N+dN).all(), 'Nonfinite actual morph normal')
                maximum_position = max(maximum_position, float(np.linalg.norm((P+dP).astype(float)-row['endpoints'][target_index],axis=1).max()))
                maximum_normal = max(maximum_normal, float(np.linalg.norm((N+dN).astype(float)-row['endpointNormals'][target_index],axis=1).max()))
                max_delta = max(max_delta, float(abs(dN).max()))
                targets_checked += 1
            primitive_count += 1
    require(maximum_position <= 2e-6, 'Actual Float32 endpoint position precision >2um')
    if identity:
        require(identity_N_error == 0 and max_delta == 0, 'Identity author normals or zero NORMAL deltas changed')
    return {'allSharedConsumersChecked': primitive_count, 'morphConsumerEndpointsChecked': targets_checked,
        'maximumPositionBakeErrorM': maximum_position, 'maximumNormalBakeError': maximum_normal,
        'maximumBaseNormalDifferenceFromOriginal': identity_N_error, 'maximumMorphNormalDelta': max_delta,
        'binaryPrefixAndOriginalPropertiesPreserved': True, 'imagesPreserved': True,
        'normalsMeaning': 'Original authored shading N inverse-transpose by actual saved DG at each P and P+D. Geometric area normals remain a separate diagnostic.'}
