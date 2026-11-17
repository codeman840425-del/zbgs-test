"""Recover JSON from the sole run's raw arrays. Never import or call igl."""
import json
import math
from pathlib import Path
import sys

from common import (BASE, ROOT, SPEC, constraints, digest, float32_readback, horizontal_sections,
    interpolate, load_inputs, np, safe_json, tetra_metrics)

OUT = BASE / 'recovered-readback'


def serializable(value):
    if isinstance(value, np.generic):
        return serializable(value.item())
    if isinstance(value, np.ndarray):
        return serializable(value.tolist())
    if isinstance(value, dict):
        return {key: serializable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serializable(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return {'nonFinite': str(value)}
    return value


def save(path, value):
    path.write_bytes((json.dumps(serializable(value), indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode())


def serialization_regression():
    sample = {'passed': np.bool_(True), 'failed': np.bool_(False),
        'count': np.int64(101), 'error': np.float64(.002), 'nested': [np.bool_(True)]}
    try:
        json.dumps(safe_json(sample), allow_nan=False)
    except TypeError as error:
        old_error = str(error)
    else:
        raise ValueError('Expected original NumPy bool serialization failure was not reproduced')
    actual = json.loads(json.dumps(serializable(sample), allow_nan=False))
    assert actual == {'passed': True, 'failed': False, 'count': 101, 'error': .002, 'nested': [True]}
    assert type(actual['passed']) is bool and type(actual['count']) is int
    return {'originalSerializerFailureReproduced': old_error, 'recoveredSerializerPassed': True,
        'conversion': 'np.generic.item() before recursive JSON serialization', 'actual': actual}


def recover(identifier, spec, domain, embedding, domain_report, guide, response, records, source):
    folder = BASE / 'generated' / identifier
    raw_files = [folder / name for name in ['solved-nodes.npz', 'tetra-readback.npz', 'mapped-endpoints.npz']]
    original = dict(np.load(raw_files[0], allow_pickle=False))
    positions = original['positionsM']
    nodes, tets = domain['nodesM'], domain['tetrahedra']
    request = next(row for row in guide['cases'] if row['id'] == identifier)
    b, bc, roles, duplicates = constraints(domain, np.asarray(request['requestedVertexPointsM']))
    if not np.array_equal(original['constraintIndices'], b) or not np.array_equal(original['constraintTargetsM'], bc):
        raise ValueError('Stored actual constraints differ from pinned native target')
    if not np.isfinite(positions).all():
        raise ValueError('Nonfinite stored nodes. Preserve raw; no SVD attempted.')
    actual, J, determinants = tetra_metrics(nodes, positions, tets, b, bc, spec['softP'])
    if not actual['finite']:
        raise ValueError('Nonfinite stored actual J. Preserve raw; no endpoint readback.')
    mapped = interpolate(positions, embedding)
    bake, decoded, base = float32_readback(mapped, records, source)
    saved_mapping = dict(np.load(raw_files[2], allow_pickle=False))
    saved_tets = dict(np.load(raw_files[1], allow_pickle=False))
    protected_error = float(np.linalg.norm(positions[domain['protectedNodes']] - nodes[domain['protectedNodes']], axis=1).max())
    frame_error = float(np.linalg.norm(positions[domain['frameNodes']] - nodes[domain['frameNodes']], axis=1).max())
    endpoint_error = np.linalg.norm(mapped - domain['sourceEndpointsM'], axis=1)
    protected_endpoint_error = max(float(endpoint_error[row['offset']:row['offset'] + row['count']].max())
        for row in records if row['role'] in ['feature-preservation', 'neck-preservation'])
    origin = np.asarray(domain_report['rawHeadOriginM'])
    sections32 = horizontal_sections({a: P.astype(np.float32).astype(float) for a, P in base.items()},
        response, request, origin, 'Float32 base simulated bake readback, no actual GLB export')
    sections64 = horizontal_sections(base, response, request, origin,
        'Float64 proposed volume mapping, no actual GLB export')
    failures = []
    if actual['minimumDeterminant'] <= spec['minimumDeterminant']:
        failures.append('Actual tet J determinant <= original 0.12 gate')
    if max(protected_error, frame_error, protected_endpoint_error) > spec['toleranceM']:
        failures.append('Protected/frame actual displacement >2um')
    if not bake['finite'] or bake['maximumErrorM'] > spec['toleranceM']:
        failures.append('All selected source/morph Float32 bake precision >2um or nonfinite')
    if not sections32['passed']:
        failures.append('Original 101 actual Float32 horizontal halfwidth target misses 2mm or has empty sections')
    initial, _, _ = tetra_metrics(nodes, nodes, tets, b, bc, spec['softP'])
    result = {'schema': 'native-head-slim-recovered-readback-v1', 'id': identifier,
        'status': 'failed-not-admissible' if failures else 'numeric-gates-only-not-production-admission',
        'recoveryOnly': True, 'solverCalled': False, 'originalIterationContract': 20,
        'originalCaseReportStatus': json.loads((folder / 'report.json').read_bytes())['status'],
        'rawInputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p), 'bytes': p.stat().st_size} for p in raw_files],
        'request': request, 'uniqueSoftControls': len(b), 'freeNodes': len(nodes) - len(b),
        'duplicateTargets': duplicates, 'initial': initial, 'actual': actual,
        'maximumAllNodeDisplacementM': float(np.linalg.norm(positions - nodes, axis=1).max()),
        'maximumProtectedNodeDisplacementM': protected_error, 'maximumFrameDisplacementM': frame_error,
        'maximumProtectedEndpointDisplacementM': protected_endpoint_error,
        'float32MorphBakeReadback': bake, 'original101HorizontalSectionsFloat32': sections32,
        'auxiliary101HorizontalSectionsFloat64': sections64, 'failures': failures,
        'rawRecomputeDifferences': {
            'maximumMappedEndpointErrorM': float(np.linalg.norm(mapped - saved_mapping['mappedEndpointsM'], axis=1).max()),
            'maximumFloat32BakePointErrorM': float(np.linalg.norm(decoded - saved_mapping['float32BakeRoundTripM'], axis=1).max()),
            'maximumJacobianAbsoluteError': float(abs(J - saved_tets['tetraJacobians']).max()),
            'maximumDeterminantAbsoluteError': float(abs(determinants - saved_tets['tetraDeterminants']).max())},
        'characterExported': False, 'runtimeAccepted': False,
        'pending': ['Original-triangle strict/expression relation checks', 'Actual VRM/normals/skin/clothing/game acceptance']}
    save(OUT / (identifier + '.json'), result)
    return {key: result[key] for key in ['id', 'status', 'failures', 'maximumProtectedNodeDisplacementM',
        'maximumFrameDisplacementM', 'rawRecomputeDifferences']} | {
        'minimumDeterminant': actual['minimumDeterminant'],
        'maximumFloat32HorizontalHalfwidthErrorM': sections32['maximumErrorM'],
        'missingSections': sections32['missingSections']}


if __name__ == '__main__':
    if OUT.exists():
        raise ValueError('Preserve the first recovery output; directory already exists')
    OUT.mkdir()
    original_paths = [SPEC, BASE / 'prepared.json'] + sorted((BASE / 'generated').rglob('*'))
    prepared = json.loads((BASE / 'prepared.json').read_bytes())
    original_paths += [ROOT / row['path'] for row in prepared['receipt']['scripts']]
    before = {p.relative_to(ROOT).as_posix(): digest(p) for p in original_paths if p.is_file()}
    report = {'schema': 'native-head-slim-recovery-v1', 'status': 'reading-original-raw',
        'recoveryOnly': True, 'solverCalled': False, 'characterExported': False, 'runtimeAccepted': False,
        'originalFilesBefore': before, 'cases': []}
    try:
        report['serializationRegression'] = serialization_regression()
        spec, domain, embedding, domain_report, guide, response, records, source = load_inputs()
        report['originalExecutionReport'] = json.loads((BASE / 'generated/report.json').read_bytes())
        report['originalProcessReceipt'] = json.loads((BASE / 'generated/run-report.json').read_bytes())
        for identifier in spec['requests']:
            report['cases'].append(recover(identifier, spec, domain, embedding, domain_report, guide, response, records, source))
        report['status'] = 'raw-readback-recovered-original-run-still-failed'
        if 'igl' in sys.modules or any(name.startswith('igl.') for name in sys.modules):
            raise ValueError('Recovery unexpectedly imported igl')
    except Exception as error:
        report.update(status='recovery-failed-no-solve', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        after = {path: digest(ROOT / path) for path in before}
        report['originalFilesAfter'] = after
        report['allOriginalBytesUnchanged'] = before == after
        report['recoveryScriptSha256'] = digest(Path(__file__))
        save(OUT / 'report.json', report)
    print(json.dumps(serializable({'status': report['status'], 'cases': report['cases'],
        'allOriginalBytesUnchanged': report['allOriginalBytesUnchanged']})))
