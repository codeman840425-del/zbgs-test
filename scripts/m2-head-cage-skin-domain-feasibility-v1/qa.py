"""Read saved comparison results through the original tensor, never solve again."""
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
script = Path(__file__).with_name('run.py')
spec = importlib.util.spec_from_file_location('skin_domain_feasibility', script)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
np, old, BASE, ROOT = runner.np, runner.old, runner.BASE, runner.ROOT


def main():
    plan = json.loads((BASE/'plan.json').read_bytes())
    report = json.loads((BASE/'generated/report.json').read_bytes())
    checks = []

    def check(name, value):
        checks.append({'name': name, 'passed': bool(value)})

    check('eight-unique-results', len(report['cases']) == 8 and len({r['id'] for r in report['cases']}) == 8)
    check('plan-sha', old.sha((BASE/'plan.json').read_bytes()) == report['planSha256'])
    check('geometry-not-accepted', report['geometryAccepted'] is False)
    for ref in plan['inputs']+plan['sharedInputsAndProducer']+plan['producer']:
        check('fixed/'+ref['path'], runner.pin(ROOT/ref['path']) == {k: ref[k] for k in ('path', 'sha256', 'bytes')})
    for comparison in report['comparisons']:
        check(comparison['sex']+'/only-declared-differences', comparison['undeclaredDifferences'] == [])
        check(comparison['sex']+'/positive-domain-prerequisite', comparison['domainPrerequisite']['necessaryActiveOutsideCount'] == 0)
    for result in report['cases']:
        case_id = result['id']
        check(case_id+'/saved-result', json.loads((BASE/'generated'/(case_id+'.json')).read_bytes()) == result)
        check(case_id+'/proxy-status', result['status'] in ('proxy-feasible', 'proxy-infeasible'))
        if result['status'] == 'proxy-infeasible':
            check(case_id+'/no-fabricated-primal', result['scipyStatus'] == 2 and 'coefficientsM' not in result)
            continue
        row = runner.load_input(plan, runner.SOURCE+'generated/'+result['sex']+'.json')
        request = next(r for r in row['requests'] if r['id'] == case_id)
        c = np.asarray(result['coefficientsM']).reshape(3, 9)
        movement = np.einsum('alco,ac->lo', row['responseTensor'], c)
        residual = np.asarray(row['sourceLandmarksM'])+movement-np.asarray(request['requestedLandmarksM'])
        check(case_id+'/all-original-tensor-residuals', np.allclose(residual, result['allCoordinateResidualM'], rtol=0, atol=1e-14))
        check(case_id+'/same-2mm-coordinate-band', abs(residual).max() <= .002+1e-7)
        check(case_id+'/t-coefficient-readback', abs(abs(c).max()-result['optimalT_M']) <= 1e-7)
        cage = np.asarray(result['actualCagePositionsM']).reshape(-1, 4, 3)
        rest = np.asarray(row['restCagePositionsM']).reshape(-1, 4, 3)
        gaps = np.diff(cage[:, :2, 1], axis=0)
        widths = cage[:, 1, 0]-cage[:, 0, 0]
        depths = cage[:, [3, 2], 2]-cage[:, [0, 1], 2]
        check(case_id+'/weak-cage-readback', min(gaps.min(), widths.min(), depths.min()) >= -1e-7)
        check(case_id+'/euclidean-readback', abs(np.linalg.norm(cage-rest, axis=2).max()-result['maximumEuclideanControlDisplacementM']) <= 1e-14)
        check(case_id+'/fixed-corners', np.array_equal(cage[:, 2:], rest[:, 2:]) and np.array_equal(cage[[0, -1]], rest[[0, -1]]))
    result = {'schema': 'head-cage-skin-domain-feasibility-qa-v1',
              'status': 'pass' if all(r['passed'] for r in checks) else 'fail',
              'checks': checks, 'additionalActualSolves': 0, 'geometryAccepted': False,
              'limit': 'Infeasible status is a numerical HiGHS result without an independently verified exact-arithmetic certificate.'}
    old.dump(BASE/'qa-report.json', result)
    print(json.dumps({'status': result['status'], 'checks': len(checks),
                      'failed': [r['name'] for r in checks if not r['passed']]}))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
