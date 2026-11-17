"""Read saved LP results without solving again; audit original tensor indexing."""
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-head-cage-feasibility-v1'


def main():
    plan = json.loads((BASE/'plan.json').read_bytes())
    report = json.loads((BASE/'generated/report.json').read_bytes())
    checks = []

    def check(name, passed):
        checks.append({'name': name, 'passed': bool(passed)})

    check('fixed-plan', report['planSha256'] == hashlib.sha256((BASE/'plan.json').read_bytes()).hexdigest())
    for ref in plan['inputs']+plan['producer']+[plan['apiCheck']]:
        data = (ROOT/ref['path']).read_bytes()
        check('fixed-bytes/'+ref['path'], hashlib.sha256(data).hexdigest() == ref['sha256'] and len(data) == ref['bytes'])
    check('two-known-api-systems', json.loads((BASE/'api-check.json').read_bytes())['passed'])
    check('eight-once-results', len(report['cases']) == 8 and len({r['id'] for r in report['cases']}) == 8 and report['unattempted'] == [])
    check('no-geometry-acceptance', report['geometryAccepted'] is False)
    for result in report['cases']:
        row = json.loads((BASE/'inputs/assets-source/m2-head-cage-response-probe-v1/generated'/
                          (result['sex']+'.json')).read_bytes())
        saved = json.loads((BASE/'generated'/(result['id']+'.json')).read_bytes())
        check(result['id']+'/saved-result-identical', saved == result)
        check(result['id']+'/numerical-status', result['status'] in ('proxy-feasible', 'proxy-infeasible'))
        check(result['id']+'/no-geometry-acceptance', result['geometryAccepted'] is False)
        if result['status'] == 'proxy-infeasible':
            check(result['id']+'/infeasible-status-no-invented-primal', result['scipyStatus'] == 2 and not result['success'] and 'coefficientsM' not in result and 'actualCagePositionsM' not in result)
            continue
        request = next(r for r in row['requests'] if r['id'] == result['id'])
        c = np.asarray(result['coefficientsM'], float).reshape(3, len(row['controls']))
        # Direct tensor contraction independently checks output/column layout.
        displacement = np.einsum('alco,ac->lo', np.asarray(row['responseTensor']), c)
        residual = np.asarray(row['sourceLandmarksM'])+displacement-np.asarray(request['requestedLandmarksM'])
        check(result['id']+'/all-coordinate-residual-readback', np.allclose(residual, result['allCoordinateResidualM'], rtol=0, atol=1e-14))
        check(result['id']+'/fixed-2mm-proxy-band', abs(residual).max() <= .002+1e-7)
        check(result['id']+'/minimax-t-readback', abs(abs(c).max()-result['optimalT_M']) <= 1e-7)
        actual = np.asarray(result['actualCagePositionsM']).reshape(-1, 4, 3)
        rest = np.asarray(row['restCagePositionsM']).reshape(-1, 4, 3)
        gap = np.diff(actual[:, :2, 1], axis=0)
        width = actual[:, 1, 0]-actual[:, 0, 0]
        depth = actual[:, [3, 2], 2]-actual[:, [0, 1], 2]
        check(result['id']+'/actual-cage-weak-order', min(gap.min(), width.min(), depth.min()) >= -1e-7)
        check(result['id']+'/fixed-rear-endpoints', np.array_equal(actual[:, 2:], rest[:, 2:]) and np.array_equal(actual[[0, -1]], rest[[0, -1]]))
        euclidean = np.linalg.norm(actual-rest, axis=2)
        check(result['id']+'/actual-euclidean-readback', abs(euclidean.max()-result['maximumEuclideanControlDisplacementM']) < 1e-14)
    result = {'schema': 'head-cage-feasibility-readback-v1',
              'status': 'pass' if all(r['passed'] for r in checks) else 'fail',
              'checks': checks, 'actualAdditionalSolves': 0,
              'geometryAccepted': False,
              'limit': 'Infeasible cases have no returned primal vector. Their status is the numerical HiGHS result, without an independent exact-arithmetic infeasibility certificate.'}
    (BASE/'qa-report.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'checks': len(checks),
                      'failed': [r['name'] for r in checks if not r['passed']]}))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
