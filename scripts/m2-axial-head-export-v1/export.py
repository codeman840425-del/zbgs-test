"""Future one-shot export, only with a pinned selected strict-pass request plan."""
import argparse
import json

from adapter import BASE, ROOT, assemble, bake_bytes, io, load, np, pinned, readback, require, strict_gate


def execute(plan_path):
    spec, source, records, _ = load()
    plan = json.loads(plan_path.read_bytes())
    require(plan['schema'] == 'axial-head-export-request-v1', 'Wrong export request')
    require(plan['exportSpec'] == io.ref(BASE / 'spec.json'), 'Unpinned export spec')
    selected = plan['requests']
    require(selected and len({r['sourceRequestId'] for r in selected}) == len(selected), 'Empty/duplicate requested cases')
    cases = {c['sourceRequestId']: c for c in spec['cases']}
    for request in selected:
        require(request['sourceRequestId'] in cases and request['sourceRequestId'] != 'identity', 'Unsupported export request')
        strict_gate(json.loads(pinned(request['strictReport']).read_bytes()), cases[request['sourceRequestId']], spec)
    out = BASE / 'generated'
    require(not out.exists(), 'Preserve first real export attempt')
    out.mkdir()
    report = {'schema': 'axial-head-export-run-v1', 'methodId': spec['id'], 'status': 'exporting',
        'exportSpec': io.ref(BASE / 'spec.json'), 'requestPlan': io.ref(plan_path), 'cases': [],
        'bodyParametersApplied': False, 'runtimeAccepted': False}
    io.save(out / 'report.json', report)
    try:
        for key in ['identity'] + [r['sourceRequestId'] for r in selected]:
            case = cases[key]
            numeric = json.loads(pinned(case['evaluationReport']).read_bytes())
            expected_status = 'identity-passed' if key == 'identity' else 'axial-head-numerical-candidate-only'
            require(numeric['schema'] == 'axial-head-evaluation-result-v1' and numeric['status'] == expected_status
                and numeric['methodId'] == 'm2-axial-head-evaluation-v1' and numeric['failures'] == []
                and numeric['finite'] and numeric['rawArrays'] == case['mappedEndpoints']
                and numeric['sourceSpec'] == spec['evaluationSpec'], 'Failed/foreign numerical input')
            with np.load(pinned(case['mappedEndpoints']), allow_pickle=False) as raw:
                results = assemble(source, records, raw)  # Always new, complete results for each bake.
            provenance = ('m2-axial-head-export-v1 saved axial PPoly G; authored N via legacy DG inverse transpose; '
                'head-only; spec=' + io.sha(BASE/'spec.json') + '; request=' + key)
            raw_vrm = bake_bytes(source, results, provenance)
            path = out / (case['candidateId'] + '.vrm')
            path.write_bytes(raw_vrm)  # Failed actual readback remains preserved.
            actual = type(source)(path)
            checked = readback(source, actual, results, identity=key == 'identity')
            require(actual.doc['asset']['generator'] == provenance, 'Wrong method provenance')
            report['cases'].append({'sourceRequestId': key, 'candidateId': case['candidateId'],
                'status': 'actual-container-and-normal-readback-passed-pending-semantic-runtime',
                'resource': io.ref(path), 'readback': checked})
            io.save(out / 'report.json', report)
        report['status'] = 'export-readback-complete-not-runtime-acceptance'
    except Exception as error:
        report.update(status='failed-not-admissible', error=f'{type(error).__name__}: {error}')
    finally:
        io.save(out / 'report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute-once', action='store_true', required=True)
    parser.add_argument('--request', required=True)
    args = parser.parse_args()
    result = execute(ROOT / args.request)
    print(json.dumps({'status': result['status']}))
    raise SystemExit(0 if result['status'] == 'export-readback-complete-not-runtime-acceptance' else 2)
