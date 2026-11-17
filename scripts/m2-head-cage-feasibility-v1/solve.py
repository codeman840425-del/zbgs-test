"""One fixed HiGHS minimax LP. All coordinates/coefficient values are metres."""
import time

import numpy as np
from scipy.optimize import linprog


def solve(A, b, C, g0, epsilon_m, time_limit_seconds):
    A, b, C, g0 = (np.asarray(x, dtype=float) for x in (A, b, C, g0))
    n = A.shape[1]
    if (A.ndim != 2 or b.shape != (len(A),) or C.ndim != 2 or
            C.shape[1] != n or g0.shape != (len(C),)):
        raise ValueError('Inconsistent LP dimensions')
    if not all(np.isfinite(x).all() for x in (A, b, C, g0)):
        raise ValueError('Nonfinite LP input')
    upper_matrix = np.vstack([
        np.column_stack([A, np.zeros(len(A))]),
        np.column_stack([-A, np.zeros(len(A))]),
        np.column_stack([-C, np.zeros(len(C))]),
        np.column_stack([np.eye(n), -np.ones(n)]),
        np.column_stack([-np.eye(n), -np.ones(n)]),
    ])
    upper_rhs = np.r_[b+epsilon_m, -b+epsilon_m, g0, np.zeros(2*n)]
    started = time.perf_counter()
    result = linprog(np.r_[np.zeros(n), 1.], A_ub=upper_matrix,
                     b_ub=upper_rhs, bounds=[(None, None)]*n + [(0, None)],
                     method='highs', options={'presolve': True,
                                             'time_limit': time_limit_seconds})
    elapsed = time.perf_counter()-started
    report = {'status': 'proxy-infeasible' if result.status == 2 else 'solver-failed',
              'scipyStatus': int(result.status), 'success': bool(result.success),
              'message': str(result.message), 'seconds': elapsed,
              'iterations': int(result.nit), 'epsilonM': epsilon_m,
              'variables': n+1, 'inequalities': len(upper_rhs),
              'coefficientBounds': 'explicit (None,None); signed free',
              'tBounds': [0, None], 'coefficientUnit': 'metres',
              'geometryAccepted': False}
    if result.status != 0:
        return report
    vector = np.asarray(result.x, float)
    coefficients, t = vector[:-1], float(vector[-1])
    coordinate_residual = A@coefficients-b
    ordering = g0+C@coefficients
    upper_slack = upper_rhs-upper_matrix@vector
    # HiGHS default primal feasibility tolerance is 1e-7. This readback
    # threshold verifies numerical solving and is not a geometry allowance.
    maximum_violation = float(np.maximum(-upper_slack, 0).max(initial=0))
    valid = (np.isfinite(vector).all() and t >= -1e-7 and
             maximum_violation <= 1e-7 and
             abs(t-float(abs(coefficients).max(initial=0))) <= 1e-7)
    report.update({'status': 'proxy-feasible' if valid else 'solver-failed',
                   'coefficientsM': coefficients.tolist(), 'optimalT_M': t,
                   'maximumAbsoluteCoefficientM': float(abs(coefficients).max(initial=0)),
                   'tMinusMaximumAbsoluteCoefficientM': t-float(abs(coefficients).max(initial=0)),
                   'coordinateResidualM': coordinate_residual.tolist(),
                   'weakCageValuesM': ordering.tolist(),
                   'allInequalitySlacksM': upper_slack.tolist(),
                   'maximumPrimalViolationM': maximum_violation,
                   'numericalReadbackToleranceM': 1e-7,
                   'proxyMaximumCoordinateErrorM': float(abs(coordinate_residual).max(initial=0)),
                   'minimumWeakCageValueM': float(ordering.min(initial=np.inf))})
    return report


def cage_constraints(rest_positions, controls):
    rest = np.asarray(rest_positions, dtype=float).reshape(-1, 4, 3)
    controls = np.asarray(controls, dtype=int)
    rings, n = len(rest), len(controls)
    if not np.array_equal(controls, np.arange(1, rings-1)):
        raise ValueError('Unexpected Head interior-ring control order')
    if not np.array_equal(rest[:, 0, 1:], rest[:, 1, 1:]):
        raise ValueError('Original front-corner Y/Z symmetry changed')
    if (not np.array_equal(rest[:, 2, 1:], rest[:, 3, 1:]) or
            not np.array_equal(rest[:, 0, 1], rest[:, 2, 1]) or
            not np.array_equal(rest[:, 0, 0], rest[:, 3, 0]) or
            not np.array_equal(rest[:, 1, 0], rest[:, 2, 0])):
        raise ValueError('Original rectangular rest-ring assumptions changed')
    selector = np.eye(rings)[:, controls]
    C = np.zeros((rings-1+2*n, 3*n))
    C[:rings-1, n:2*n] = np.diff(selector, axis=0)
    C[rings-1:rings-1+n, :n] = 2*np.eye(n)
    C[rings-1+n:, 2*n:] = -np.eye(n)
    gaps = np.diff(rest[:, 0, 1])
    widths = rest[:, 1, 0]-rest[:, 0, 0]
    depths = rest[:, 3, 2]-rest[:, 0, 2]
    g0 = np.r_[gaps, widths[controls], depths[controls]]
    if not np.all(gaps > 0) or not np.all(widths > 0) or not np.all(depths > 0):
        raise ValueError('Unexpected degenerate original rest cage')
    labels = (['frontYGap/'+str(i) for i in range(rings-1)] +
              ['frontWidth/'+str(i) for i in controls] +
              ['frontRearDepth/'+str(i) for i in controls])
    return C, g0, labels


def actual_cage_readback(rest_positions, controls, coefficients):
    rest = np.asarray(rest_positions, dtype=float).reshape(-1, 4, 3)
    cage = rest.copy()
    coefficients = np.asarray(coefficients, float).reshape(3, len(controls))
    for j, ring in enumerate(controls):
        cage[ring, 0] += coefficients[:, j]*[-1, 1, 1]
        cage[ring, 1] += coefficients[:, j]
    lengths = np.linalg.norm(cage-rest, axis=2)
    return {'actualCagePositionsM': cage.reshape(-1, 3).tolist(),
            'controlEuclideanDisplacementsM': lengths[np.asarray(controls), :2].tolist(),
            'maximumEuclideanControlDisplacementM': float(lengths.max()),
            'frontYGapM': np.diff(cage[:, :2, 1], axis=0).tolist(),
            'frontWidthM': (cage[:, 1, 0]-cage[:, 0, 0]).tolist(),
            'frontRearDepthM': (cage[:, [3, 2], 2]-cage[:, [0, 1], 2]).tolist(),
            'fixedRearCornersUnchanged': bool(np.array_equal(cage[:, 2:], rest[:, 2:])),
            'fixedEndRingsUnchanged': bool(np.array_equal(cage[[0, -1]], rest[[0, -1]]))}
