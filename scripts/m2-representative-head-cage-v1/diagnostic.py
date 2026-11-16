"""Prepare by default. Explicit execution is reserved for root's later window."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/m2-representative-head-cage-v1'
BASE = SOURCE / 'diagnostic-v1'
ORIGINAL = '2ff35cd0548da3f9b67be1f699aa361e508141e8'
PREFLIGHT_SHA = 'da45d4f1fb6d3e5222de827de659ba53bb5be6c212f7783bad16927b0c98eab9'
DIAGNOSIS_SHA = '39a75b618693c6732e2270a5291d4c2e11072e3b121269f8e15b510729c3b628'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_failed_preflight(preflight, audit, diagnosis):
    if preflight['status'] != 'failed-stop-before-batch' or preflight['shapeBatchStarted']:
        raise ValueError('Require original unexecuted failed preflight')
    failed = [(row['sex'], gate) for row in preflight['sexes'] for gate in row['gates'] if not gate['passed']]
    if len(failed) != 1 or failed[0][0] != 'male' or failed[0][1]['id'] != 'coherent-mouth-expression-probe':
        raise ValueError('Additional prerequisite failures cannot enter diagnostic continuation')
    frames = failed[0][1]['contactFrames']
    if [(f['target'], f['addedPairs']) for f in frames] != [(-1, []), (0, [[47, 1007]])]:
        raise ValueError('Unreviewed original contact pair or expression')
    if audit['commit'] != ORIGINAL or audit['pinnedPreflightSHA256'] != PREFLIGHT_SHA or audit['pinnedPairDiagnosisSHA256'] != DIAGNOSIS_SHA:
        raise ValueError('Independent review identity differs')
    if audit['status'] != 'reviewed-precision-boundary-uncertain-original-strict-failure-retained':
        raise ValueError('Independent boundary classification is absent')
    if diagnosis['pair'] != [47, 1007] or diagnosis['sourceTarget'] != 0:
        raise ValueError('Frozen pair identity differs')
    return {'status': 'original-strict-failure-retained', 'pair': [47, 1007], 'target': 0,
            'independentClassification': 'precision-boundary-uncertain', 'productionAdmitted': False}


def quarantine(report, entries):
    report.update(status='diagnostic-failed' if report['failures'] else 'diagnostic-unadmitted',
                  diagnosticOnly=True, productionAdmitted=False, runtimeAccepted=False,
                  contactCoordinateScope='Common map Float64 before Float32 GLB bake. Artifact-level contact and runtime review remain unverified.')
    return 'diagnostic-equipment.json', {'schema': 'diagnostic-equipment-reference-v1', 'items': entries,
        'diagnosticOnly': True, 'productionAdmitted': False, 'runtimeAccepted': False}


def make_plan(tool_root, output):
    spec = json.loads((SOURCE / 'spec.json').read_bytes())
    if sha(SOURCE / 'generated/preflight.json') != PREFLIGHT_SHA or sha(SOURCE / 'generated/pair-diagnosis.json') != DIAGNOSIS_SHA:
        raise ValueError('Original failure bytes changed')
    pins = json.loads((BASE / 'input-pins.json').read_bytes())
    for row in pins['files']:
        if sha(ROOT / row['path']) != row['sha256']:
            raise ValueError('Independent evidence SHA mismatch: ' + row['path'])
    audit = json.loads((BASE / 'inputs/report.json').read_bytes())
    old = json.loads((SOURCE / 'generated/preflight.json').read_bytes())
    failure = validate_failed_preflight(old, audit, json.loads((SOURCE / 'generated/pair-diagnosis.json').read_bytes()))
    original_requests = json.loads((ROOT / spec['sourceSpec']['path']).read_bytes())['variants']
    if spec['requests'] != original_requests:
        raise ValueError('Eight original requests changed')
    inputs = [spec['sourceSpec']] + [s['body'] for s in spec['sources'].values()] + [e for s in spec['sources'].values() for e in s['equipment']]
    for row in inputs:
        if sha(ROOT / row['path']) != row['sha256']:
            raise ValueError('Input identity differs: ' + row['path'])
    # Only the explicit optional batch hooks differ. Deformation/predicate code
    # and all other originally recorded producer dependencies remain exact.
    for row in old['receipt']['producer']:
        if row['path'] != 'scripts/m2-representative-head-cage-v1/batch.py' and sha(ROOT / row['path']) != row['sha256']:
            raise ValueError('Original scientific producer changed: ' + row['path'])
    binary = tool_root.resolve() / spec['tool']['path']
    if sha(binary) != spec['tool']['sha256']:
        raise ValueError('Blender binary differs')
    output = output.resolve()
    allowed = (BASE / 'exports').resolve()
    if not output.is_relative_to(allowed) or output == allowed:
        raise ValueError('Diagnostic output must be a quarantined exports child')
    paths = list(Path(__file__).parent.glob('*.py')) + [SOURCE / 'spec.json', BASE / 'input-pins.json']
    paths += [ROOT / s['equipmentManifest'] for s in spec['sources'].values()]
    return {'schema': 'head-diagnostic-plan-v1', 'status': 'prepared-not-run', 'diagnosticOnly': True,
        'productionAdmitted': False, 'runtimeAccepted': False, 'originalStrictFailure': failure,
        'toolRoot': tool_root.resolve().as_posix(), 'tool': spec['tool'], 'output': output.relative_to(ROOT).as_posix(),
        'preflightSha256': PREFLIGHT_SHA, 'independentAuditSha256': sha(BASE / 'inputs/report.json'),
        'requests': spec['requests'], 'inputs': inputs,
        'producer': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in sorted(paths)],
        'bounds': spec['setup'], 'batchStarted': False,
        'admissionPolicy': 'Classification is observation only. New strict contact/det/intent/feature failures remain rejected. No normal equipment manifest or public registration.'}


def execute(plan_path):
    import psutil
    plan = json.loads(plan_path.read_bytes())
    expected = make_plan(Path(plan['toolRoot']), ROOT / plan['output'])
    if plan != expected:
        raise ValueError('Prepared plan is stale')
    output = ROOT / plan['output']
    if output.exists():
        raise ValueError('Use one unused diagnostic output, preserve prior attempts')
    output.mkdir(parents=True)
    command = [str(Path(plan['toolRoot']) / plan['tool']['path']), '--background', '--factory-startup', '--threads', '2',
               '--python-exit-code', '1', '--python', str(Path(__file__).with_name('diagnostic_batch.py')),
               '--', '--plan', str(plan_path)]
    started, peak, stop = time.monotonic(), 0, None
    with (output / 'blender.log').open('wb') as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
            env={**os.environ, 'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '2'})
        observed = psutil.Process(process.pid)
        while process.poll() is None:
            try:
                peak = max(peak, observed.memory_info().rss)
            except psutil.NoSuchProcess:
                break
            if peak > plan['bounds']['maximumRssBytes'] or time.monotonic() - started > plan['bounds']['maximumSeconds']:
                stop = 'resource-limit'
                process.terminate()
                break
            time.sleep(.25)
        code = process.wait(timeout=15)
    report = {'schema': 'head-diagnostic-execution-v1', 'diagnosticOnly': True, 'productionAdmitted': False,
        'runtimeAccepted': False, 'exitCode': code, 'stop': stop, 'seconds': time.monotonic() - started, 'peakRssBytes': peak}
    (output / 'execution.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
    return 2 if stop or code else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tool-root', type=Path, default=ROOT)
    parser.add_argument('--out', type=Path, default=BASE / 'exports/once')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    plan_path = BASE / 'plan.json'
    if args.execute:
        raise SystemExit(execute(plan_path))
    plan = make_plan(args.tool_root, args.out)
    encoded = (json.dumps(plan, indent=2) + '\n').encode()
    if plan_path.exists() and plan_path.read_bytes() != encoded:
        raise ValueError('Existing diagnostic plan differs, preserve its identity')
    plan_path.write_bytes(encoded)
    print(json.dumps({'status': plan['status'], 'blenderStarted': False, 'output': plan['output']}))
