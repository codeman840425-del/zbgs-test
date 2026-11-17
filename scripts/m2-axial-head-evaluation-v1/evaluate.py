"""Direct saved-PPoly G on every actual source position/morph endpoint."""
import importlib.metadata
import json
from pathlib import Path
import sys
import time

from scipy.interpolate import PPoly

from source import BASE, ROOT, clean, load, np, ref, save, section_function, sha


def operator(points, data):
    if points.ndim != 2 or points.shape[1] != 3 or not np.isfinite(points).all():
        raise ValueError('G requires finite Nx3 source-rest metre points')
    H = np.asarray(data['headOriginM'])
    curve = PPoly(np.asarray(data['coefficients']), np.asarray(data['knotsLocalY_M']), extrapolate=False)
    local = points - H
    selected = (local[:, 1] > data['supportL']) & (local[:, 1] < data['supportU'])
    mapped = points.copy()  # Outside support remains byte-identical, without recenter arithmetic.
    J = np.broadcast_to(np.eye(3), (len(points), 3, 3)).copy()
    values, derivative = curve(local[selected, 1]), curve.derivative()(local[selected, 1])
    mapped[selected, 0] = H[0] + values[:, 0] * local[selected, 0]
    mapped[selected, 1] += values[:, 1]
    mapped[selected, 2] += values[:, 2]
    J[selected, 0, 0] = values[:, 0]
    J[selected, 0, 1] = local[selected, 0] * derivative[:, 0]
    J[selected, 1, 1] = 1 + derivative[:, 1]
    J[selected, 2, 1] = derivative[:, 2]
    return mapped, J, selected


def triangle_readback(g, record, P, Q, decoded):
    rows = []
    # Complete group references, not a single representative primitive.
    for reference in record['references']:
        triangles = g.acc(reference['indexAccessor']).astype(int).reshape(-1, 3)
        def cross(A):
            return np.cross(A[triangles[:, 1]] - A[triangles[:, 0]], A[triangles[:, 2]] - A[triangles[:, 0]])
        source_base = g.acc(record['positionAccessor'])
        baseline = source_base if record['endpoint'] == -1 else source_base + g.acc(record['targetPositionAccessor'])
        source_cross, actual_cross, float_cross = cross(baseline.astype(float)), cross(Q), cross(decoded)
        source_area = np.linalg.norm(source_cross, axis=1)
        actual_area = np.linalg.norm(actual_cross, axis=1)
        float_area = np.linalg.norm(float_cross, axis=1)
        nonzero = source_area > 0
        new_zero = nonzero & (float_area == 0)
        opposite = nonzero & (float_area > 0) & (np.einsum('ni,ni->n', source_cross, float_cross) <= 0)
        rows.append({'mesh': reference['mesh'], 'primitive': reference['primitive'], 'material': reference['material'],
            'endpoint': record['endpoint'], 'triangleCount': len(triangles),
            'sourceExactDegenerateCount': int((source_area == 0).sum()),
            'sourceExactDegenerateTriangleIndices': np.flatnonzero(source_area == 0),
            'mappedExactDegenerateCount': int((actual_area == 0).sum()),
            'float32ExactDegenerateCount': int((float_area == 0).sum()),
            'newFloat32ExactDegenerateTriangleIndices': np.flatnonzero(new_zero),
            'nonpositiveReferenceNormalDotTriangleIndices': np.flatnonzero(opposite),
            'minimumFloat32AreaRatioWhereSourceNonzero': float((float_area[nonzero] / source_area[nonzero]).min()) if nonzero.any() else None,
            'meaning': 'Original rendered Float32 base+original Float32 delta baseline. Normal-dot change is a direction diagnostic, not a strict intersection test.'})
    return rows


def run_case(case, spec, source, records, points, masks, response, out):
    started = time.monotonic()
    folder = out / case['sourceRequestId']
    folder.mkdir()
    data = json.loads((ROOT / case['coefficients']['path']).read_bytes())
    report = {'schema': 'axial-head-evaluation-result-v1', 'id': case['id'], 'sourceRequestId': case['sourceRequestId'],
        'methodId': 'm2-axial-head-evaluation-v1', 'status': 'evaluating-G', 'source': spec['source'],
        'sourceSpec': ref(BASE / 'spec.json'), 'methodSpecSha256': sha(BASE / 'spec.json'),
        'functionSpec': spec['functionSpec'], 'coefficients': case['coefficients'], 'coefficientAudit': spec['coefficientAudit'],
        'sourceInventory': spec['sourceInventory'], 'sourceRecords': ref(BASE / 'prepared/endpoint-records.json'),
        'fixedSourceMasks': ref(BASE / 'prepared/fixed-source-masks.json'),
        'headParametersApplied': ['jawWidth', 'cheekWidth', 'chinLengthM', 'chinProjectionM'],
        'otherBodyParametersProvenanceOnly': True, 'tetGateClaimedPassed': False,
        'characterExported': False, 'runtimeAccepted': False}
    save(folder / 'report.json', report)
    try:
        mapped, J, inside = operator(points, data)
        np.savez_compressed(folder / 'initial-G-arrays.npz', sourceEndpointsM=points, mappedEndpointsM=mapped, sourceJacobians=J)
        finite = bool(np.isfinite(mapped).all() and np.isfinite(J).all())
        if not finite:
            report['fatalNonfinite'] = True
            raise ValueError('Nonfinite full-source G/J; raw preserved before further work')
        determinants = np.linalg.det(J)
        decoded = np.empty_like(mapped)
        bases, bake_rows, directions = {}, [], []
        eye_error, neck_error, maximum_bake = 0., 0., 0.
        eye_occurrences, neck_occurrences = 0, 0
        material_displacements = {}
        for record in records:
            a, n, accessor = record['offset'], record['count'], record['positionAccessor']
            P, Q = points[a:a + n], mapped[a:a + n]
            if not np.array_equal(record['sourceIndices'], np.arange(n)):
                raise ValueError('This pinned full-source GLB has zero unused positions; exact full rows required')
            if record['endpoint'] == -1:
                bases[accessor] = Q
                reconstructed = Q.astype(np.float32)
            else:
                B = bases[accessor]
                reconstructed = B.astype(np.float32) + (Q - B).astype(np.float32)
            decoded[a:a + n] = reconstructed.astype(float)
            error = float(np.linalg.norm(decoded[a:a + n] - Q, axis=1).max())
            maximum_bake = max(maximum_bake, error)
            bake_rows.append({'positionAccessor': accessor, 'endpoint': record['endpoint'], 'count': n, 'maximumErrorM': error})
            displacement = np.linalg.norm(Q - P, axis=1)
            for mask in masks['fixedEye']:
                if mask['positionAccessor'] == accessor:
                    eye_error = max(eye_error, float(displacement[mask['sourceIndices']].max()))
                    eye_occurrences += len(mask['sourceIndices'])
            for mask in masks['neck']:
                if mask['positionAccessor'] == accessor and mask['endpoint'] == record['endpoint']:
                    neck_error = max(neck_error, float(displacement[mask['sourceIndices']].max()))
                    neck_occurrences += len(mask['sourceIndices'])
            for reference in record['references']:
                ids = np.unique(source.acc(reference['indexAccessor'])).astype(int)
                name = reference['material']
                material_displacements[name] = max(material_displacements.get(name, 0.), float(displacement[ids].max()))
            directions.extend(triangle_readback(source, record, P, Q, decoded[a:a + n]))
        frame = np.asarray(masks['frameSourcePointsM'])
        frame_actual, frame_J, _ = operator(frame, data)
        frame_error = float(np.linalg.norm(frame_actual - frame, axis=1).max())
        origin = np.asarray(data['headOriginM'])
        if case['sourceRequestId'] == 'identity':
            targets = np.asarray(response['sourceLandmarksM']) - origin
        else:
            targets = np.asarray(next(x for x in response['requests'] if x['id'] == case['sourceRequestId'])['requestedLandmarksM']) - origin
        levels = targets[::2, 1]
        desired = (targets[1::2, 0] - targets[::2, 0]) / 2
        face_record = next(x for x in records if x['positionAccessor'] == response['sourceFacePositionAccessor'] and x['endpoint'] == -1)
        face_base = decoded[face_record['offset']:face_record['offset'] + face_record['count']]
        actual_widths = section_function()(face_base - origin, np.asarray(response['sourceFaceTriangles'], int), levels)
        errors = [abs(actual - expected) for actual, expected in zip(actual_widths, desired) if actual is not None]
        sections = {'requestedYMetres': levels, 'requestedHalfWidthsM': desired, 'actualHalfWidthsM': actual_widths,
            'maximumErrorM': max(errors, default=None), 'missingSections': sum(v is None for v in actual_widths),
            'sectionCount': len(levels), 'passed': len(errors) == 101 and max(errors) <= .002,
            'precision': 'Complete group Float32 base simulated bake; original AST horizontal surface cut', 'actualGlbExported': False}
        new_degenerate = sum(len(x['newFloat32ExactDegenerateTriangleIndices']) for x in directions)
        opposite = sum(len(x['nonpositiveReferenceNormalDotTriangleIndices']) for x in directions)
        failures = []
        if determinants.min() <= .12:
            failures.append('Actual new G Jacobian <=0.12 at a complete source/endpoint input')
        if max(eye_error, neck_error, frame_error) > 2e-6:
            failures.append('Complete fixed-eye/neck/frame displacement >2um')
        if maximum_bake > 2e-6 or not np.isfinite(decoded).all():
            failures.append('Complete original Float32 base+delta readback precision >2um or nonfinite')
        if not sections['passed']:
            failures.append('Original actual101 Float32 full-skin halfwidth >2mm or missing section')
        if new_degenerate:
            failures.append('New exact degenerate output triangles')
        identity_error = float(np.linalg.norm(mapped - points, axis=1).max())
        if case['sourceRequestId'] == 'identity' and identity_error > 2e-6:
            failures.append('Full original source/endpoint identity >2um')
        np.savez_compressed(folder / 'mapped-endpoints.npz', sourceEndpointsM=points,
            mappedEndpointsM=mapped, float32BakeRoundTripM=decoded, sourceJacobians=J)
        save(folder / 'triangle-diagnostics.json', {'schema': 'axial-output-triangle-diagnostic-v1', 'rows': directions,
            'newExactDegenerateCount': new_degenerate, 'nonpositiveReferenceNormalDotCount': opposite,
            'strictIntersectionChecksRun': False})
        report.update(failures=failures, finite=finite, sourceEndpointOccurrences=len(points), sourceRecordsCount=len(records),
            uniqueReferencedBaseVertices=9911, insideSupportOccurrences=int(inside.sum()),
            actualGJacobian={'finite': bool(np.isfinite(determinants).all()), 'minimumDeterminant': float(determinants.min()),
                'maximumDeterminant': float(determinants.max()), 'failedOccurrenceIndices': np.flatnonzero(determinants <= .12),
                'minimumScale': float(J[:, 0, 0].min()), 'minimumFprime': float(J[:, 1, 1].min()),
                'detVersusDirectProductMaximumError': float(abs(determinants - J[:, 0, 0] * J[:, 1, 1]).max()), 'notTetMetrics': True},
            maximumFixedEyeDisplacementM=eye_error, maximumFixedNeckDisplacementM=neck_error,
            maximumProtectedEndpointDisplacementM=max(eye_error, neck_error), maximumFrameDisplacementM=frame_error,
            fixedEyeEndpointOccurrences=eye_occurrences, fixedNeckEndpointOccurrences=neck_occurrences,
            maximumFullSourceIdentityDisplacementM=identity_error if case['sourceRequestId'] == 'identity' else None,
            float32MorphBakeReadback={'finite': bool(np.isfinite(decoded).all()), 'maximumErrorM': maximum_bake, 'records': bake_rows},
            original101HorizontalSectionsFloat32=sections, materialMaximumDisplacementsM=material_displacements,
            triangleDiagnostics={'path': (folder / 'triangle-diagnostics.json').relative_to(ROOT).as_posix(),
                'sha256': sha(folder / 'triangle-diagnostics.json'), 'newExactDegenerateCount': new_degenerate,
                'nonpositiveReferenceNormalDotCount': opposite, 'strictChecksRun': False},
            rawArrays=ref(folder / 'mapped-endpoints.npz'), numericalSourceCoverageComplete=True,
            fullFloatingExecutionDomainBoundProved=False, strictExpressionChecksRun=False)
        report['status'] = ('identity-passed' if case['sourceRequestId'] == 'identity' else 'axial-head-numerical-candidate-only') if not failures else 'failed-not-admissible'
    except Exception as error:
        report.update(status='failed-not-admissible', error=f'{type(error).__name__}: {error}')
    finally:
        report['seconds'] = time.monotonic() - started
        save(folder / 'report.json', report)
    return report


if __name__ == '__main__':
    out = BASE / 'generated'
    if not out.is_dir() or (out / 'report.json').exists():
        raise ValueError('Use a new runner-created evaluation output')
    report = {'schema': 'axial-head-evaluation-run-v1', 'status': 'checking', 'cases': [],
        'characterExported': False, 'strictExpressionChecksRun': False, 'runtimeAccepted': False}
    try:
        spec = json.loads((BASE / 'spec.json').read_bytes())
        for row in json.loads((BASE / 'execution-spec.json').read_bytes())['inputs']:
            if sha(ROOT / row['path']) != row['sha256']:
                raise ValueError('Prepared input differs')
        source, _ = load(spec)
        for name, version in spec['versions'].items():
            if importlib.metadata.version(name) != version:
                raise ValueError('Numeric version differs')
        records = json.loads((BASE / 'prepared/endpoint-records.json').read_bytes())['records']
        masks = json.loads((BASE / 'prepared/fixed-source-masks.json').read_bytes())
        points = np.load(BASE / 'prepared/source-endpoints.npz', allow_pickle=False)['sourceEndpointsM']
        response = json.loads((ROOT / spec['response']).read_bytes())
        for case in spec['cases']:
            actual = run_case(case, spec, source, records, points, masks, response, out)
            report['cases'].append({'id': actual['id'], 'sourceRequestId': actual['sourceRequestId'],
                'status': actual['status'], 'failures': actual.get('failures', []), 'error': actual.get('error')})
            save(out / 'report.json', report)
            if case['sourceRequestId'] == 'identity' and actual['status'] != 'identity-passed':
                raise ValueError('Full-source identity failed; stop before requested evaluations')
            if actual.get('fatalNonfinite'):
                raise ValueError('Nonfinite raw retained; stop remaining requests')
        report['status'] = 'complete-source-evaluations-finished-not-production-admission'
        if 'igl' in sys.modules:
            raise ValueError('Direct axial G must not import SLIM')
    except Exception as error:
        report.update(status='stopped-no-retry', error=f'{type(error).__name__}: {error}')
    finally:
        save(out / 'report.json', report)
    print(json.dumps(clean(report)))
