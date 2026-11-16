"""SciPy API example for Head's existing axis-major ring coefficients.

No Blender imports, source probing, asset loading, geometry evaluation or export.
All shape limits and the independently verified response are caller inputs.
"""
import json
import sys

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, minimize


def solve(A, rhs, rest, controls, *, regularization, cap_m,
          minimum_ring_gaps_m, minimum_widths_m, minimum_depths_m,
          objective_scale_m):
    """Return a linear-proxy candidate, never geometry acceptance.

    A columns are [all X rings, all Y rings, all Z rings]. Rows and rhs
    share the caller's audited order. rest has shape (rings, 4, 3).
    X moves front corner 0 by -c and front corner 1 by +c.
    Y/Z move both front corners by +c. Rear corners and end rings stay fixed.
    """
    A, rhs, rest = (np.asarray(v, dtype=float) for v in (A, rhs, rest))
    controls = np.asarray(controls, dtype=int)
    n = len(controls)
    if rest.ndim != 3 or rest.shape[1:] != (4, 3) or n < 1:
        raise ValueError('Expected four-corner rest rings and interior controls')
    rings = len(rest)
    if not np.array_equal(controls, np.arange(1, rings - 1)):
        raise ValueError('Control order must equal Head.controls interior order')
    if A.ndim != 2 or A.shape[1] != 3*n or rhs.shape != (len(A),):
        raise ValueError('Response/rhs must use the same audited axis-major order')
    if not all(np.isfinite(v).all() for v in (A, rhs, rest)):
        raise ValueError('Nonfinite input')
    if not all(np.isfinite(v) and v > 0 for v in (regularization, cap_m, objective_scale_m)):
        raise ValueError('Positive fixed regularization, cap and scale required')
    if not np.allclose(rest[:, 0, 1:], rest[:, 1, 1:], rtol=0, atol=1e-8):
        raise ValueError('Current Head front-corner YZ symmetry required')
    selector = np.eye(rings)[:, controls]
    ring_gaps = np.diff(rest[:, 0, 1])
    widths = rest[:, 1, 0] - rest[:, 0, 0]
    depths = rest[:, 3, 2] - rest[:, 0, 2]
    floors = [np.asarray(v, dtype=float) for v in
              (minimum_ring_gaps_m, minimum_widths_m, minimum_depths_m)]
    originals = [ring_gaps, widths, depths]
    if any(v.shape != old.shape or not np.isfinite(v).all() or
           not np.all((v > 0) & (v < old)) for v, old in zip(floors, originals)):
        raise ValueError('Fixed positive floors must leave rest strictly feasible')
    # Exact affine cage constraints. These do not approximate mesh Jacobians.
    C = np.zeros((rings-1 + 2*n, 3*n))
    C[:rings-1, n:2*n] = np.diff(selector, axis=0)
    C[rings-1:rings-1+n, :n] = 2*np.eye(n)
    C[rings-1+n:, 2*n:] = -np.eye(n)
    lower = np.r_[floors[0]-ring_gaps,
                  (floors[1]-widths)[controls],
                  (floors[2]-depths)[controls]]
    # u is dimensionless. A uniform objective rescale preserves the optimizer.
    coefficient_scale = cap_m / np.sqrt(3)
    design = A * coefficient_scale / objective_scale_m
    target = rhs / objective_scale_m
    ridge = regularization * (coefficient_scale/objective_scale_m)**2
    H = design.T @ design + ridge*np.eye(3*n)
    gradient_at_zero = -(design.T @ target)

    def objective(u):
        residual = design @ u - target
        return .5*(residual @ residual + ridge*(u @ u))

    result = minimize(objective, np.zeros(3*n), method='trust-constr',
                      jac=lambda u: H @ u + gradient_at_zero,
                      hess=lambda u: H,
                      bounds=Bounds(-np.ones(3*n), np.ones(3*n), keep_feasible=True),
                      constraints=LinearConstraint(C*coefficient_scale/cap_m,
                                                   lower/cap_m, np.inf,
                                                   keep_feasible=True),
                      options={'maxiter': 200, 'gtol': 1e-9, 'xtol': 1e-12,
                               'barrier_tol': 1e-10, 'verbose': 0})
    c = result.x * coefficient_scale
    front_displacements = c.reshape(3, n).T
    return {'status': 'linear-proxy-candidate' if result.success else 'solver-failed',
            'geometryAccepted': False, 'coefficientsM': c.reshape(3, n).tolist(),
            'success': bool(result.success), 'solverStatus': int(result.status),
            'message': str(result.message), 'iterations': int(result.nit),
            'optimality': float(result.optimality),
            'constraintViolationDimensionless': float(result.constr_violation),
            'maximumCageDisplacementM': float(np.linalg.norm(front_displacements, axis=1).max()),
            'maximumBoxViolationM': float(np.maximum(abs(c)-coefficient_scale, 0).max()),
            'maximumLinearViolationM': float(np.maximum(lower-C@c, 0).max()),
            'maximumProxyCoordinateResidualM': float(abs(A@c-rhs).max()),
            'capM': cap_m}


def self_check():
    # Synthetic API test only. This is not any source character or shape trial.
    rest = np.asarray([[[x, y, z] for x, z in
                        [(-.02, -.02), (.02, -.02), (.02, .02), (-.02, .02)]]
                       for y in [0, .01, .02, .03]])
    result = solve(np.eye(6), np.asarray([-.1, -.1, .1, -.1, .1, .1]),
                   rest, [1, 2], regularization=.0001, cap_m=.03,
                   minimum_ring_gaps_m=np.full(3, .005),
                   minimum_widths_m=np.full(4, .03),
                   minimum_depths_m=np.full(4, .035), objective_scale_m=.002)
    passed = (result['success'] and result['maximumLinearViolationM'] < 1e-10
              and result['maximumBoxViolationM'] < 1e-10
              and result['maximumCageDisplacementM'] <= .03 + 1e-10
              and np.allclose(result['coefficientsM'][0], [-.005, -.005], atol=1e-5)
              and np.allclose(result['coefficientsM'][1], [.0025, -.0025], atol=1e-5)
              and np.allclose(result['coefficientsM'][2], [.005, .005], atol=1e-5))
    return {'scope': 'synthetic-scipy-interface-only', 'passed': passed,
            'actualHeadFitAttempted': False, 'result': result}


if __name__ == '__main__':
    if sys.argv[1:] != ['--self-check']:
        raise SystemExit('Import solve with audited arrays, or use --self-check')
    report = self_check()
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
