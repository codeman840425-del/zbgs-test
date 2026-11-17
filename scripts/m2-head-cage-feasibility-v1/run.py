"""One eight-request diagnostic, using frozen full measured responses only."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
import numpy as np
import scipy
from solve import solve, cage_constraints, actual_cage_readback

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-head-cage-feasibility-v1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False)+'\n', encoding='utf-8')


def frozen_input(plan, original_path):
    ref = next(r for r in plan['inputs'] if r['originalPath'] == original_path)
    return json.loads((ROOT/ref['path']).read_bytes())


def response_matrix(row):
    if (row['schema'] != 'head-cage-response-probe-v1' or row['nominalProbeM'] != .002 or
            row['rowOrder'] != 'outputXYZ axis-major then landmark' or
            row['columnOrder'] != 'probeXYZ axis-major then control index' or
            row['shapeSolveCalled'] is not False or row['characterExported'] is not False or
            row['controlSigns'] != [[-1, 1], [1, 1], [1, 1]]):
        raise ValueError('Unexpected measured response identity/order/probe contract')
    tensor = np.asarray(row['responseTensor'], float)
    controls = row['controls']
    source = np.asarray(row['sourceLandmarksM'], float)
    if tensor.shape != (3, len(source), len(controls), 3):
        raise ValueError('Full measured tensor dimension mismatch')
    if source.shape != (202, 3) or len(controls) != 9:
        raise ValueError('Original 202 landmarks / nine controls changed')
    A = tensor.transpose(3, 1, 0, 2).reshape(3*len(source), 3*len(controls))
    if not np.isfinite(A).all():
        raise ValueError('Nonfinite response')
    np.testing.assert_array_equal(A, np.asarray(row['flattenedResponseAxisMajor'], float))
    np.testing.assert_array_equal(source.T.reshape(-1), row['sourceFlatAxisMajor'])
    for axis in range(3):
        np.testing.assert_array_equal(tensor[axis, :, :, axis], row['responseMatrices'][axis])
    if row['controlVertexIndices'] != [[4*r, 4*r+1] for r in controls]:
        raise ValueError('Control cage vertices differ from Head semantics')
    if len(row['probes']) != 3*len(controls):
        raise ValueError('Incomplete actual response observation list')
    for probe in row['probes']:
        axis, control = probe['probeAxis'], probe['controlIndex']
        if probe['ring'] != controls[control]:
            raise ValueError('Observed probe ring mismatch')
        np.testing.assert_allclose(tensor[axis, :, control, :]*row['nominalProbeM'],
                                   probe['landmarkDisplacementsM'], rtol=0, atol=1e-15)
    return A, source


def spectral_readback(A, row):
    singular = np.linalg.svd(A, compute_uv=False)
    tolerance = float(singular[0]*max(A.shape)*np.finfo(float).eps)
    tensor = np.asarray(row['responseTensor'], float)
    off_axis = np.asarray([tensor[a, :, :, b] for a in range(3) for b in range(3) if a != b])
    source = np.asarray(row['sourceLandmarksM'], float)
    before = np.asarray(row['identityBefore']['landmarksM'], float)
    after = np.asarray(row['identityAfter']['landmarksM'], float)
    drift = after-before
    np.testing.assert_array_equal(drift, row['identityLandmarkDriftM'])
    baseline_error = float(max(abs(before-source).max(), abs(after-source).max()))
    drift_maximum = float(abs(drift).max())
    equivalent_baseline_response = baseline_error/row['nominalProbeM']
    equivalent_drift_response = drift_maximum/row['nominalProbeM']
    source_float32_ulp = float(np.spacing(abs(np.asarray(row['sourcePointsM'], dtype=np.float32))).max())
    ulp_over_probe = source_float32_ulp/row['nominalProbeM']
    return {'matrixShape': list(A.shape),
            'matrixFloat64Sha256': sha(A.astype('<f8').tobytes()),
            'singularValues': singular.tolist(),
            'rankTolerance': tolerance,
            'rankRule': 'smax*max(A.shape)*float64_eps',
            'rank': int(np.count_nonzero(singular > tolerance)),
            'condition2': float(singular[0]/singular[-1]) if singular[-1] > 0 else None,
            'condition2Infinite': bool(singular[-1] == 0),
            'maximumCrossAxisResponse': float(abs(off_axis).max()),
            'maximumSourceBaselineCoordinateErrorM': baseline_error,
            'maximumBeforeAfterBaselineCoordinateDriftM': drift_maximum,
            'sourceBaselineErrorDividedByProbe': equivalent_baseline_response,
            'baselineDriftDividedByProbe': equivalent_drift_response,
            'maximumSourcePointFloat32UlpM': source_float32_ulp,
            'maximumSourcePointFloat32UlpDividedByProbe': ulp_over_probe,
            'smallestSingularValueOverFloat32UlpDividedByProbe': float(singular[-1]/ulp_over_probe) if ulp_over_probe else None,
            'float32UlpMeaning': 'Coordinate quantization scale only, not a rigorous bound on the response matrix spectral error. No rank threshold is silently changed using this indicator.',
            'smallestSingularValueOverBaselineErrorDividedByProbe': float(singular[-1]/equivalent_baseline_response) if equivalent_baseline_response else None,
            'smallestSingularValueOverDriftDividedByProbe': float(singular[-1]/equivalent_drift_response) if equivalent_drift_response else None,
            'maximumCrossAxisResponseOverSmallestSingularValue': float(abs(off_axis).max()/singular[-1]) if singular[-1] > 0 else None,
            'fullMeasuredResponsePreserved': True,
            'noiseInterpretation': 'Numerical rank is not a physical controllability certificate. Compare minimum singular values with measured baseline drift and probe numerical precision.'}


def run():
    started = time.perf_counter()
    out = BASE/'generated'
    if out.exists():
        raise SystemExit('Preserve existing actual attempt; refusing a repeated real solve')
    plan_data = (BASE/'plan.json').read_bytes()
    plan = json.loads(plan_data)
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT,
                          capture_output=True, text=True, check=True).stdout.strip()
    relative_plan = (BASE/'plan.json').relative_to(ROOT).as_posix()
    committed = subprocess.run(['git', 'show', head+':'+relative_plan], cwd=ROOT,
                               capture_output=True, check=True).stdout
    if committed != plan_data:
        raise SystemExit('Plan must be committed unchanged before actual execution')
    report = {'schema': 'head-cage-feasibility-batch-v1', 'status': 'solver-failed',
              'planSha256': sha(plan_data), 'executionCommit': head,
              'inputCommit': plan['inputCommit'], 'scipyVersion': scipy.__version__,
              'numpyVersion': np.__version__, 'python': sys.version,
              'cases': [], 'sexes': [], 'unattempted': [],
              'geometryAccepted': False,
              'limits': plan['limits'] + ['Nonnegative cage conditions permit degeneracy.',
                 'Coordinate proxy tolerance is not the original horizontal-section half-width gate.',
                 'Full measured A retains source-based probe baseline drift. No recentering or cross-axis zeroing.',
                 'No official modifier reevaluation, source geometry, VRM export or runtime acceptance performed.']}
    try:
        if plan['toolchain'] != {'numpyVersion': np.__version__, 'scipyVersion': scipy.__version__}:
            raise ValueError('Fixed solver toolchain changed')
        for ref in plan['inputs']+plan['producer']+[plan['apiCheck']]:
            data = (ROOT/ref['path']).read_bytes()
            if sha(data) != ref['sha256'] or len(data) != ref['bytes']:
                raise ValueError('Fixed input/producer SHA mismatch: '+ref['path'])
        original = frozen_input(plan, 'assets-source/m2-representative-batch-v2/spec.json')
        head_spec = frozen_input(plan, 'assets-source/m2-representative-head-cage-v1/spec.json')
        probe_spec = frozen_input(plan, 'assets-source/m2-head-cage-response-probe-v1/spec.json')
        if probe_spec['requests'] != head_spec['requests']:
            raise ValueError('Probe spec request identities changed')
        probe_manifest = frozen_input(plan, 'assets-source/m2-head-cage-response-probe-v1/generated/manifest.json')
        if (probe_manifest['schema'] != 'head-response-probe-manifest-v1' or
                probe_manifest['status'] != 'response-probe-complete' or
                probe_manifest['shapeSolveCalled'] is not False or
                probe_manifest['characterExported'] is not False or
                sorted(r['sex'] for r in probe_manifest['cases']) != ['female', 'male']):
            raise ValueError('Response probe did not complete the exact two sources')
        for measured in probe_manifest['cases']:
            ref = next(r for r in plan['inputs'] if r['originalPath'] == measured['path'])
            if ref['sha256'] != measured['sha256'] or ref['bytes'] != measured['bytes']:
                raise ValueError('Probe manifest case pin mismatch')
        if original['variants'] != head_spec['requests'] or len(original['variants']) != 8:
            raise ValueError('Original eight request identity changed')
        rows = {sex: frozen_input(plan, 'assets-source/m2-head-cage-response-probe-v1/generated/'+sex+'.json') for sex in ('female', 'male')}
        all_requests = [r for row in rows.values() for r in row['requests']]
        if sorted(r['id'] for r in all_requests) != sorted(r['id'] for r in original['variants']):
            raise ValueError('Probe request identities differ from original eight')
        prepared = {}
        for sex, row in rows.items():
            if row['sex'] != sex or row['source'] != head_spec['sources'][sex]['body']:
                raise ValueError('Measured response source body differs from original source')
            A, source = response_matrix(row)
            C, g0, labels = cage_constraints(row['restCagePositionsM'], row['controls'])
            spectral = spectral_readback(A, row)
            spectral.update({'sex': sex, 'identityBefore': row['identityBefore'],
                             'identityAfter': row['identityAfter']})
            report['sexes'].append(spectral)
            prepared[sex] = A, source, C, g0, labels
        for request in original['variants']:
            sex = request['sex']
            row = rows[sex]
            probe_request = next(r for r in row['requests'] if r['id'] == request['id'])
            if probe_request['parameters'] != request['parameters']:
                raise ValueError('Original request parameters changed')
            target = np.asarray(probe_request['requestedLandmarksM'], float)
            np.testing.assert_array_equal(target.T.reshape(-1), probe_request['requestedFlatAxisMajor'])
            A, source, C, g0, labels = prepared[sex]
            if target.shape != source.shape or not np.isfinite(target).all():
                raise ValueError('Invalid requested landmark target')
            b = (target-source).T.reshape(-1)
            result = solve(A, b, C, g0, plan['epsilonM'], plan['perCaseTimeLimitSeconds'])
            result.update({'id': request['id'], 'sex': sex,
                           'parameters': request['parameters'],
                           'sourceLandmarksM': source.tolist(),
                           'requestedLandmarksM': target.tolist(),
                           'weakCageConstraintLabels': labels,
                           'weakCageOriginalValuesM': g0.tolist()})
            if 'coefficientsM' in result:
                c = np.asarray(result['coefficientsM'])
                residual = (A@c-b).reshape(3, len(source)).T
                result['allCoordinateResidualM'] = residual.tolist()
                result['predictedLandmarksM'] = (source+(A@c).reshape(3, len(source)).T).tolist()
                result.update(actual_cage_readback(row['restCagePositionsM'], row['controls'], c))
                direct = np.r_[np.asarray(result['frontYGapM'])[:, 0],
                               np.asarray(result['frontWidthM'])[row['controls']],
                               np.asarray(result['frontRearDepthM'])[row['controls'], 0]]
                disagreement = float(abs(direct-(g0+C@c)).max(initial=0))
                result['independentCageConstraintReadbackDifferenceM'] = disagreement
                if disagreement > 1e-12:
                    result['status'] = 'solver-failed'
            else:
                result['residualReadbackLimit'] = 'HiGHS returned no primal solution. No feasible coordinates or cage displacements are fabricated.'
            report['cases'].append(result)
            dump(out/(request['id']+'.json'), result)
            dump(out/'report.json', report)
            if result['status'] == 'solver-failed':
                raise RuntimeError('Solver anomaly. Stopping further actual requests')
        report['status'] = ('proxy-infeasible' if any(r['status'] == 'proxy-infeasible' for r in report['cases']) else 'proxy-feasible')
    except Exception as error:
        report['failure'] = {'type': type(error).__name__, 'message': str(error)}
    report['seconds'] = time.perf_counter()-started
    completed = {r['id'] for r in report['cases']}
    report['unattempted'] = [r['id'] for r in locals().get('original', {}).get('variants', []) if r['id'] not in completed]
    report['allInputProducerPinsStableAfterRun'] = all((ROOT/r['path']).is_file() and sha((ROOT/r['path']).read_bytes()) == r['sha256'] for r in plan['inputs']+plan['producer']+[plan['apiCheck']])
    if not report['allInputProducerPinsStableAfterRun']:
        report['status'] = 'solver-failed'
    dump(out/'report.json', report)
    print(json.dumps({'status': report['status'], 'cases': len(report['cases']),
                      'seconds': report['seconds'], 'failure': report.get('failure')}))
    return 0 if report['status'] != 'solver-failed' else 1


if __name__ == '__main__':
    raise SystemExit(run())
