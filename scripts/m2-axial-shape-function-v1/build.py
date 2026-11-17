"""One identity and two PCHIP coefficient preflights, no character evaluation."""
import ast
import copy
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np
from scipy.interpolate import BPoly, PchipInterpolator, PPoly

from proof import bernstein, bound, certify, encoded, rational

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets-source/m2-axial-shape-function-v1'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe(value):
    if isinstance(value, np.generic):
        return safe(value.item())
    if isinstance(value, np.ndarray):
        return safe(value.tolist())
    if isinstance(value, dict):
        return {key: safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe(item) for item in value]
    if isinstance(value, float) and not np.isfinite(value):
        return {'nonFinite': str(value)}
    return value


def save(path, value):
    path.write_bytes((json.dumps(safe(value), ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode())


def target_function(source, reader, response):
    path = ROOT / 'scripts/m2-representative-head-cage-v1/head.py'
    tree = ast.parse(path.read_bytes())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Head')
    node = copy.deepcopy(next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'fit'))
    end = next(i for i, n in enumerate(node.body) if isinstance(n, ast.Assign)
        and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'cage')
    node.name = 'original_targets_only'
    node.body = node.body[2:end] + [ast.Return(ast.Name('target', ast.Load()))]
    namespace = {'np': np, 'legacy': reader}
    exec(compile(ast.fix_missing_locations(ast.Module([node], [])), str(path) + ':target-only', 'exec'), namespace)
    P = np.asarray(response['sourcePointsM'])
    F = np.asarray(response['sourceFaceTriangles'], int)
    H = np.asarray(response['rawHeadRestOriginM'])
    props = {'H': H, 'face_lo': float(P[np.unique(F), 1].min() - H[1]), 'context': reader.source_context(source)}
    def target(points, parameters):
        return namespace['original_targets_only'](SimpleNamespace(**props, landmark_source=np.asarray(points)), parameters)
    return target, H, ast.dump(node)


def scalar_targets(y, parameters, target, H):
    reference = np.column_stack([np.full(len(y), H[0] + 1), H[1] + y, np.full(len(y), H[2])])
    actual = target(reference, parameters)
    return np.column_stack([1 + (actual[:, 0] - reference[:, 0]) / (reference[:, 0] - H[0]),
        actual[:, 1] - reference[:, 1], actual[:, 2] - reference[:, 2]])


def map_markers(points, curve, H, L, U):
    """Only requested 23/202 markers, not the complete source/endpoint mesh."""
    local = points - H
    values = np.column_stack([np.ones(len(points)), np.zeros(len(points)), np.zeros(len(points))])
    selected = (local[:, 1] > L) & (local[:, 1] < U)
    values[selected] = curve(local[selected, 1])
    mapped = points.copy()
    mapped[:, 0] = H[0] + values[:, 0] * local[:, 0]
    mapped[:, 1] += values[:, 1]
    mapped[:, 2] += values[:, 2]
    return mapped


def proof_regression():
    from fractions import Fraction as F
    cases = [('constant-pass', [F(1)], True),
        ('interior-failure-endpoints-pass', [F(1), F(-4), F(4)], False),
        ('subdivision-certifies', [F(38, 100), F(-1), F(1)], True)]
    rows = []
    for name, power, expected in cases:
        budget = {'visited': 0, 'maximum': 4096}
        leaves = bound(bernstein(power), F(3, 25), 0, 'q', budget, 12)
        actual = all(row['status'] == 'certified-strictly-above' for row in leaves)
        if actual != expected:
            raise ValueError('Exact proof regression failed: ' + name)
        rows.append({'id': name, 'expectedAllCertified': expected, 'actualAllCertified': actual, 'visited': budget['visited']})
    leaves = bound(bernstein([F(38, 100), F(-1), F(1)]), F(3, 25), 0, 'q',
        {'visited': 0, 'maximum': 1}, 12)
    if all(row['status'] == 'certified-strictly-above' for row in leaves):
        raise ValueError('Exhausted certificate budget must reject')
    return {'cases': rows, 'budgetExhaustionRejected': True, 'characterCurvesConstructed': False}


def build_case(identifier, parameters, knots, origins, target, H, L, U, spec, response, native, out):
    folder = out / identifier
    folder.mkdir()
    values = scalar_targets(knots, parameters, target, H)
    duplicate_checks = 0
    for i, provenance in enumerate(origins):
        repeated_y = np.repeat(knots[i], len(provenance))
        repeated_values = scalar_targets(repeated_y, parameters, target, H)
        for j, row in enumerate(provenance):
            if row['kind'] == 'identity-guard':
                repeated_values[j] = [1., 0., 0.]
        if not np.array_equal(repeated_values, np.repeat(repeated_values[:1], len(provenance), axis=0)):
            raise ValueError('Duplicate source Y requests conflict; no averaging')
        duplicate_checks += max(0, len(provenance) - 1)
    guards = np.asarray([any(row['kind'] == 'identity-guard' for row in provenance) for provenance in origins])
    for i in np.flatnonzero(guards):
        if any(row['kind'] != 'identity-guard' for row in origins[i]) and not np.array_equal(values[i], [1., 0., 0.]):
            raise ValueError('Same source Y conflicts with identity guard; no clamp')
    values[guards] = [1., 0., 0.]
    # This is the sole PchipInterpolator construction for this candidate.
    curve = PchipInterpolator(knots, values, axis=0, extrapolate=False)
    curves = {'schema': 'axial-pchip-stored-function-v1', 'id': identifier, 'parameters': parameters,
        'headOriginM': H.tolist(), 'components': ['s', 'dY', 'h'], 'knotsLocalY_M': knots,
        'knotValues': values, 'coefficients': curve.c, 'coefficientOrder': 'c[k,segment,component]*(u-x[segment])**(3-k)',
        'outsideRule': 'identity for u<=L or u>=U, no extrapolation', 'supportL': L, 'supportU': U,
        'pchipConstructions': 1, 'extrapolate': False}
    save(folder / 'curves.json', curves)
    stored = json.loads((folder / 'curves.json').read_bytes())
    if not np.array_equal(stored['coefficients'], curve.c) or not np.array_equal(stored['knotsLocalY_M'], knots):
        raise ValueError('Stored Float64 coefficients/knots changed on JSON roundtrip')
    proof = certify(stored['knotsLocalY_M'], stored['coefficients'], spec['maximumProofIntervals'], spec['maximumProofDepth'])
    proof['storedCurvesSha256'] = sha(folder / 'curves.json')
    save(folder / 'bernstein-proof.json', proof)
    value_jump = max((abs(row['valueDifference']['approximate']) for seam in proof['seams'] for row in seam['components']), default=0.)
    derivative_jump = max((abs(row['derivativeDifference']['approximate']) for seam in proof['seams'] for row in seam['components']), default=0.)
    platform = (knots[1:] <= L) | (knots[:-1] >= U)
    expected = np.zeros_like(curve.c[:, platform])
    expected[3, :, 0] = 1
    platform_pass = np.array_equal(curve.c[:, platform], expected)
    marker_rows = []
    for name, points in [('original23', np.asarray(native['sourcePointsM'])),
            ('original202', np.asarray(response['sourceLandmarksM']))]:
        requested = target(points, parameters)
        actual = map_markers(points, curve, H, L, U)
        residual = actual - requested
        marker_rows.append({'id': name, 'count': len(points), 'maximumEuclideanErrorM': float(np.linalg.norm(residual, axis=1).max()),
            'maximumCoordinateErrorM': float(abs(residual).max()), 'residualVectorsM': residual})
    plane_y = np.asarray(response['sourceLandmarksM'])[::2, 1] - H[1]
    scalar_residual = curve(plane_y) - scalar_targets(plane_y, parameters, target, H)
    derivative = curve.derivative()
    # Non-certified numerical cross checks only.
    q_coefficients = []
    for i in range(len(knots) - 1):
        fprime = derivative.c[:, i, 1].copy()
        fprime[-1] += 1
        q_coefficients.append(np.convolve(curve.c[:, i, 0], fprime))
    q = PPoly(np.asarray(q_coefficients).T, knots, extrapolate=False)
    bp = BPoly.from_power_basis(q, extrapolate=False)
    roots = q.derivative().roots(discontinuity=False, extrapolate=False)
    finite_roots = roots[np.isfinite(roots)]
    numeric_points = np.r_[knots, finite_roots]
    cross = {'certified': False, 'minimumFloatBPolyCoefficient': float(bp.c.min()),
        'rootsWithSentinels': roots, 'nonFiniteRootSentinels': int((~np.isfinite(roots)).sum()),
        'minimumAtNumericRootsAndKnots': float(q(numeric_points).min()),
        'meaning': 'Floating companion roots/BPoly conversion, diagnostic only; not whole-domain proof or floating execution bound'}
    failures = []
    if not proof['allCertified']:
        failures.append('Stored coefficient s/q full-segment Bernstein certificate not established')
    if value_jump > spec['seamValueTolerance'] or derivative_jump > spec['seamDerivativeTolerance']:
        failures.append('Numerical cross-knot C0/C1 precision guard failed')
    if not platform_pass:
        failures.append('Identity platform coefficients are not exactly constant')
    if any(row['maximumEuclideanErrorM'] > spec['markerToleranceM'] for row in marker_rows):
        failures.append('Original requested marker residual exceeds declared 2um readback guard')
    finite = bool(np.isfinite(curve.c).all() and np.isfinite(values).all())
    if not finite:
        failures.append('Nonfinite stored curve data')
    report = {'schema': 'axial-function-coefficient-preflight-v1', 'id': identifier,
        'status': 'coefficient-preflight-passed-pending-geometry' if not failures else 'failed-not-admissible',
        'failures': failures, 'finite': finite, 'curveSha256': sha(folder / 'curves.json'),
        'knotCount': len(knots), 'segmentCount': len(knots) - 1, 'storedRealPolynomialCertificate': proof['summaries'],
        'exactDuplicateYConsistencyChecks': duplicate_checks,
        'proofIntervalsVisited': proof['budget']['visited'], 'maximumC0CoefficientValueJump': value_jump,
        'maximumC1CoefficientDerivativeJump': derivative_jump, 'seamValueTolerance': spec['seamValueTolerance'],
        'seamDerivativeTolerance': spec['seamDerivativeTolerance'], 'seamUnits': {'s': 'dimensionless/value, per metre/derivative', 'dY,h': 'metres/value, dimensionless/derivative'},
        'exactIdentityPlatformCoefficients': platform_pass, 'platformSegmentIndices': np.flatnonzero(platform),
        'markerReadbacks': marker_rows, 'source101ScalarResiduals': scalar_residual,
        'source101MaximumScaleResidual': float(abs(scalar_residual[:, 0]).max()),
        'source101MaximumDYResidualM': float(abs(scalar_residual[:, 1]).max()),
        'source101MaximumHResidualM': float(abs(scalar_residual[:, 2]).max()), 'noncertifiedCrossCheck': cross,
        'floatingExecutionWholeDomainBoundEstablished': False, 'globalStrictC1OrInjectivityProved': False,
        'fullSourceEndpointsEvaluated': False, 'actual101MeshSectionsEvaluated': False,
        'characterExported': False, 'runtimeAccepted': False}
    save(folder / 'report.json', report)
    return {'id': identifier, 'status': report['status'], 'failures': failures,
        'reportSha256': sha(folder / 'report.json'), 'curveSha256': sha(folder / 'curves.json')}


if __name__ == '__main__':
    spec = json.loads((BASE / 'spec.json').read_bytes())
    out = BASE / 'generated'
    if not out.is_dir() or (out / 'report.json').exists():
        raise ValueError('Use a new runner-created coefficient output')
    report = {'schema': 'axial-function-source-run-v1', 'status': 'checking', 'cases': [],
        'newShapeGenerated': False, 'characterExported': False, 'runtimeAccepted': False}
    try:
        for row in spec['inputs']:
            if sha(ROOT / row['path']) != row['sha256']:
                raise ValueError('Input identity differs: ' + row['path'])
        for name, version in spec['versions'].items():
            if importlib.metadata.version(name) != version:
                raise ValueError('Numeric version differs: ' + name)
        save(out / 'proof-unit-regression.json', proof_regression())
        response = json.loads((ROOT / spec['response']).read_bytes())
        native = next(row for row in json.loads((ROOT / spec['nativeGuide']).read_bytes())['sexes'] if row['sex'] == 'male')
        intervals = json.loads((ROOT / spec['intervalReadback']).read_bytes())
        band = json.loads((ROOT / spec['bandAudit']).read_bytes())['sourceRequestTriangleBand']
        loader = importlib.util.spec_from_file_location('fixed_original_source_reader', ROOT / spec['sourceReader'])
        reader = importlib.util.module_from_spec(loader)
        loader.loader.exec_module(reader)
        source = reader.GLB((ROOT / spec['source']['path']).read_bytes())
        target, H, formula = target_function(source, reader, response)
        L, U = intervals['conservativeOpenSupportLocalY_M']
        frame_y = np.asarray(intervals['fixedFrameLocalPositionsM'])[:, 1]
        guards = [('frameLow', float(frame_y.min())), ('neckMax', L), ('eyeMin', U), ('frameHigh', float(frame_y.max()))]
        raw = []
        P = np.asarray(response['sourcePointsM'])
        for vertex in band['sourceVertexIndices']:
            raw.append((float(P[vertex, 1] - H[1]), {'kind': 'band-vertex', 'sourceVertex': vertex}))
        for plane, y in enumerate(band['sourceLevelsM']):
            raw.append((y, {'kind': 'source101', 'plane': plane}))
        raw += [(y, {'kind': 'identity-guard', 'name': name}) for name, y in guards]
        knots = np.unique([y for y, _ in raw])
        origins = [[provenance for y, provenance in raw if y == knot] for knot in knots]
        save(out / 'common-knots.json', {'knotsLocalY_M': knots, 'sources': origins, 'guards': guards,
            'headOriginM': H, 'exactUniqueOnly': True, 'sourceCount': len(raw), 'uniqueCount': len(knots), 'formulaAst': formula})
        cases = [('identity', {'jawWidth': 0., 'cheekWidth': 0., 'chinLengthM': 0., 'chinProjectionM': 0.})]
        cases += [(identifier, next(row for row in response['requests'] if row['id'] == identifier)['parameters']) for identifier in spec['requests']]
        for identifier, parameters in cases:
            report['cases'].append(build_case(identifier, parameters, knots, origins, target, H, L, U,
                spec, response, native, out))
            save(out / 'report.json', report)
            if identifier == 'identity' and report['cases'][-1]['status'] != 'coefficient-preflight-passed-pending-geometry':
                raise ValueError('Identity coefficient preflight failed; stop before requested curves')
        report.update(status='coefficient-preflights-finished-no-character', specSha256=sha(BASE / 'spec.json'), inputs=spec['inputs'])
        if 'igl' in sys.modules:
            raise ValueError('Coefficient preflight must not import SLIM')
    except Exception as error:
        report.update(status='stopped-no-retry', error=f'{type(error).__name__}: {error}')
        raise
    finally:
        save(out / 'report.json', report)
    print(json.dumps(report))
