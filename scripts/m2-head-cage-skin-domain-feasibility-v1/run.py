"""Skin-domain comparison, sharing the frozen original LP and numeric helpers."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-head-cage-skin-domain-feasibility-v1'
OLD = ROOT/'assets-source/m2-head-cage-feasibility-v1'
SOURCE = 'assets-source/m2-head-cage-skin-domain-v1/'
sys.path.insert(0, str(ROOT/'scripts/m2-head-cage-feasibility-v1'))
spec = importlib.util.spec_from_file_location('original_feasibility', ROOT/'scripts/m2-head-cage-feasibility-v1/run.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
np, scipy = old.np, old.scipy


def pin(path):
    data = path.read_bytes()
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': old.sha(data), 'bytes': len(data)}


def load_input(plan, path):
    return old.frozen_input(plan, path)


def prepare(source_root, commit):
    if (BASE/'plan.json').exists():
        raise SystemExit('Preserve the existing fixed plan')
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=source_root,
                          capture_output=True, text=True, check=True).stdout.strip()
    if head != commit:
        raise ValueError('Exact source checkout differs')
    paths = [SOURCE+'generated/'+name for name in
             ('manifest.json', 'female.json', 'male.json', 'bounds-only.diff', 'comparison.json')]
    paths += [SOURCE+'spec.json', 'scripts/m2-head-cage-skin-domain-v1/probe.py']
    inputs = []
    for path in paths:
        data = (source_root/path).read_bytes()
        committed = subprocess.run(['git', 'show', commit+':'+path], cwd=source_root,
                                   capture_output=True, check=True).stdout
        if committed != data:
            raise ValueError('Source differs from committed bytes: '+path)
        target = BASE/'inputs'/path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        inputs.append({**pin(target), 'originalPath': path})
    original_plan = json.loads((OLD/'plan.json').read_bytes())
    shared = [pin(ROOT/'scripts/m2-head-cage-feasibility-v1'/name)
              for name in ('run.py', 'solve.py')]
    for path in ('plan.json', 'generated/report.json', 'api-check.json'):
        shared.append(pin(OLD/path))
    for ref in original_plan['inputs']:
        if ref['originalPath'].endswith(('generated/female.json', 'generated/male.json',
                                        'generated/manifest.json',
                                        'm2-representative-head-cage-v1/head.py',
                                        'm2-representative-head-cage-v1/spec.json',
                                        'm2-representative-batch-v2/spec.json')):
            shared.append(pin(ROOT/ref['path']))
    plan = {'schema': 'head-cage-skin-domain-feasibility-plan-v1', 'inputCommit': commit,
            'inputs': inputs, 'sharedInputsAndProducer': shared,
            'producer': [pin(p) for p in sorted(Path(__file__).parent.glob('*.py'))],
            'epsilonM': .002, 'weakCageConstraintLowerBoundM': 0,
            'perCaseTimeLimitSeconds': 60, 'coefficientBounds': [None, None],
            'tBounds': [0, None], 'actualSolvesPerRequest': 1,
            'toolchain': original_plan['toolchain'], 'geometryAccepted': False,
            'scope': 'New skin-only bounds input domain; original eight requests, weights, protections and LP unchanged.'}
    old.dump(BASE/'plan.json', plan)
    print(json.dumps(pin(BASE/'plan.json')))


def compare_and_matrix(new, prior, source_spec, sex):
    if new['schema'] != 'head-cage-skin-domain-response-v1' or new['productionAdmitted'] is not False:
        raise ValueError('Actual new source response identity differs')
    allowed = {'schema', 'restCagePositionsM', 'responseMatrices', 'responseTensor',
               'flattenedResponseAxisMajor', 'probes', 'identityBefore', 'identityAfter',
               'identityLandmarkDriftM', 'maximumCrossAxisResponse', 'seconds',
               'domainPrerequisite', 'productionAdmitted'}
    changed = [key for key in sorted(set(new)|set(prior)) if new.get(key) != prior.get(key)]
    unexpected = sorted(set(changed)-allowed)
    if unexpected:
        raise ValueError('Undeclared response differences: '+', '.join(unexpected))
    gate = new['domainPrerequisite']
    if (gate['status'] != 'identity-and-necessary-coverage-passed' or
            gate['necessaryActiveOutsideCount'] != 0 or
            gate['maximumIdentityErrorM'] > source_spec['setup']['identityToleranceM'] or
            gate['sourceGeometryMutated'] is not False):
        raise ValueError('New declared source-domain prerequisites failed')
    if new['sex'] != sex or new['source'] != source_spec['sources'][sex]['body']:
        raise ValueError('Original source body differs')
    tensor = np.asarray(new['responseTensor'], float)
    if tensor.shape != (3, 202, 9, 3) or not np.isfinite(tensor).all():
        raise ValueError('Full new response shape/nonfinite error')
    A = tensor.transpose(3, 1, 0, 2).reshape(606, 27)
    np.testing.assert_array_equal(A, new['flattenedResponseAxisMajor'])
    for axis in range(3):
        np.testing.assert_array_equal(tensor[axis, :, :, axis], new['responseMatrices'][axis])
    if len(new['probes']) != 27 or {(p['probeAxis'], p['controlIndex']) for p in new['probes']} != {(a, c) for a in range(3) for c in range(9)}:
        raise ValueError('Incomplete/duplicate new probe observations')
    for probe in new['probes']:
        np.testing.assert_allclose(tensor[probe['probeAxis'], :, probe['controlIndex'], :]*new['nominalProbeM'],
                                   probe['landmarkDisplacementsM'], rtol=0, atol=1e-15)
    return A, {'sex': sex, 'changedTopLevelFields': changed,
               'undeclaredDifferences': unexpected,
               'sourceLandmarksRequestsWeightsControlsUnchanged': True,
               'oldRestBoundsM': [np.asarray(prior['restCagePositionsM']).min(0).tolist(), np.asarray(prior['restCagePositionsM']).max(0).tolist()],
               'newRestBoundsM': [np.asarray(new['restCagePositionsM']).min(0).tolist(), np.asarray(new['restCagePositionsM']).max(0).tolist()],
               'domainPrerequisite': gate,
               'spectral': old.spectral_readback(A, new)}


def execute():
    out = BASE/'generated'
    if out.exists():
        raise SystemExit('Preserve the single real comparison attempt')
    started = time.perf_counter()
    raw = (BASE/'plan.json').read_bytes()
    plan = json.loads(raw)
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    committed = subprocess.run(['git', 'show', head+':'+(BASE/'plan.json').relative_to(ROOT).as_posix()], cwd=ROOT, capture_output=True, check=True).stdout
    if raw != committed:
        raise ValueError('Plan must be committed before real execution')
    refs = plan['inputs']+plan['sharedInputsAndProducer']+plan['producer']
    report = {'schema': 'head-cage-skin-domain-feasibility-batch-v1', 'status': 'solver-failed',
              'executionCommit': head, 'planSha256': old.sha(raw), 'inputCommit': plan['inputCommit'],
              'toolchain': {'numpyVersion': np.__version__, 'scipyVersion': scipy.__version__},
              'comparisons': [], 'cases': [], 'geometryAccepted': False,
              'limits': ['Same +/-2mm attached-coordinate proxy band, not actual horizontal-section half-width acceptance.',
                         'Nonnegative cage conditions allow degeneration.',
                         'Full measured response retained with its original source-based baseline.',
                         'No geometry evaluation, shape export or production admission.']}
    try:
        if report['toolchain'] != plan['toolchain']:
            raise ValueError('Original numeric toolchain differs')
        for ref in refs:
            data = (ROOT/ref['path']).read_bytes()
            if old.sha(data) != ref['sha256'] or len(data) != ref['bytes']:
                raise ValueError('Pinned input/producer changed: '+ref['path'])
        prior_plan = json.loads((OLD/'plan.json').read_bytes())
        source_spec = old.frozen_input(prior_plan, 'assets-source/m2-representative-head-cage-v1/spec.json')
        new_spec = load_input(plan, SOURCE+'spec.json')
        if new_spec['requests'] != source_spec['requests'] or new_spec['setup'] != source_spec['setup']:
            raise ValueError('Original requests or geometry setup changed')
        manifest = load_input(plan, SOURCE+'generated/manifest.json')
        if (manifest['schema'] != 'head-cage-skin-domain-manifest-v1' or
                manifest['status'] != 'response-only-complete-not-production' or
                any(manifest[k] is not False for k in ('shapeSolveCalled', 'characterExported', 'productionAdmitted'))):
            raise ValueError('New source manifest did not complete')
        prior_manifest = old.frozen_input(prior_plan, 'assets-source/m2-head-cage-response-probe-v1/generated/manifest.json')
        if manifest['extractedAstSha256'] != prior_manifest['extractedAstSha256']:
            raise ValueError('Original target/response AST changed')
        head_ref = next(r for r in prior_plan['inputs'] if r['originalPath'] == 'scripts/m2-representative-head-cage-v1/head.py')
        new_head_ref = next(r for r in manifest['inputs'] if r['path'] == 'scripts/m2-representative-head-cage-v1/head.py')
        if head_ref['sha256'] != new_head_ref['sha256']:
            raise ValueError('Original Head weights/protection code changed')
        diff_ref = next(r for r in plan['inputs'] if r['originalPath'] == SOURCE+'generated/bounds-only.diff')
        if diff_ref['sha256'] != manifest['constructorDiffSha256']:
            raise ValueError('Declared constructor diff digest differs')
        prepared = {}
        for sex in ('female', 'male'):
            ref = next(r for r in manifest['cases'] if r['sex'] == sex)
            actual = next(r for r in plan['inputs'] if r['originalPath'] == ref['path'])
            if ref['sha256'] != actual['sha256'] or ref['bytes'] != actual['bytes']:
                raise ValueError('Manifest measured file pin differs')
            new = load_input(plan, SOURCE+'generated/'+sex+'.json')
            prior = old.frozen_input(prior_plan, 'assets-source/m2-head-cage-response-probe-v1/generated/'+sex+'.json')
            A, comparison = compare_and_matrix(new, prior, source_spec, sex)
            if new['domainPrerequisite']['includedMaterialTokens'] != new_spec['boundsDomainMaterialTokens']:
                raise ValueError('Actual selected domain differs from declared material roles')
            C, g0, labels = old.cage_constraints(new['restCagePositionsM'], new['controls'])
            prepared[sex] = new, A, C, g0, labels
            report['comparisons'].append(comparison)
        # All declared-only differences are checked before the first actual LP.
        for request in source_spec['requests']:
            row, A, C, g0, labels = prepared[request['sex']]
            target = next(r for r in row['requests'] if r['id'] == request['id'])
            source = np.asarray(row['sourceLandmarksM'])
            b = (np.asarray(target['requestedLandmarksM'])-source).T.reshape(-1)
            result = old.solve(A, b, C, g0, plan['epsilonM'], plan['perCaseTimeLimitSeconds'])
            result.update({'id': request['id'], 'sex': request['sex'],
                           'weakCageConstraintLabels': labels, 'weakCageOriginalValuesM': g0.tolist()})
            if 'coefficientsM' in result:
                c = np.asarray(result['coefficientsM'])
                result['allCoordinateResidualM'] = (A@c-b).reshape(3, 202).T.tolist()
                result.update(old.actual_cage_readback(row['restCagePositionsM'], row['controls'], c))
            else:
                result['primalLimit'] = 'No primal solution returned. No t, displacement or residual is fabricated.'
            report['cases'].append(result)
            old.dump(out/(request['id']+'.json'), result)
            old.dump(out/'report.json', report)
            if result['status'] == 'solver-failed':
                raise ValueError('Solver anomaly; remaining actual requests stopped')
        report['status'] = 'proxy-infeasible' if any(r['status'] == 'proxy-infeasible' for r in report['cases']) else 'proxy-feasible'
    except Exception as error:
        report['failure'] = {'type': type(error).__name__, 'message': str(error)}
    report['seconds'] = time.perf_counter()-started
    report['allPinsStable'] = all((ROOT/r['path']).is_file() and old.sha((ROOT/r['path']).read_bytes()) == r['sha256'] for r in refs)
    if not report['allPinsStable']:
        report['status'] = 'solver-failed'
    old.dump(out/'report.json', report)
    print(json.dumps({'status': report['status'], 'actualCases': len(report['cases']), 'failure': report.get('failure')}))
    return 0 if report['status'] != 'solver-failed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'execute'])
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--source-commit')
    args = parser.parse_args()
    if args.action == 'prepare':
        prepare(args.source_root, args.source_commit)
    else:
        raise SystemExit(execute())
