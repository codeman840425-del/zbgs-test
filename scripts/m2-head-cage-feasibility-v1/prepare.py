"""Freeze source numbers and exact producer pins before any real LP solve."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
import scipy

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-head-cage-feasibility-v1'


def pin(path):
    data = path.read_bytes()
    return {'path': path.relative_to(ROOT).as_posix(),
            'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe-root', type=Path, required=True)
    parser.add_argument('--probe-commit', required=True)
    args = parser.parse_args()
    if (BASE/'plan.json').exists():
        raise SystemExit('Fixed plan already exists; preserve the original attempt')
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=args.probe_root,
                          capture_output=True, text=True, check=True).stdout.strip()
    if head != args.probe_commit:
        raise SystemExit('Source probe checkout differs from exact requested commit')
    paths = ['assets-source/m2-head-cage-response-probe-v1/generated/'+name
             for name in ('manifest.json', 'female.json', 'male.json')]
    paths += ['assets-source/m2-representative-head-cage-v1/spec.json',
              'assets-source/m2-representative-batch-v2/spec.json',
              'assets-source/m2-head-cage-response-probe-v1/spec.json',
              'scripts/m2-head-cage-response-probe-v1/probe.py',
              'scripts/m2-representative-head-cage-v1/head.py']
    inputs = []
    for path in paths:
        source = args.probe_root/path
        data = source.read_bytes()
        committed = subprocess.run(['git', 'show', head+':'+path], cwd=args.probe_root,
                                   capture_output=True, check=True).stdout
        if committed != data:
            raise SystemExit('Uncommitted source bytes differ: '+path)
        destination = BASE/'inputs'/path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        inputs.append({**pin(destination), 'originalPath': path,
                       'sourceCommit': head})
    plan = {'schema': 'head-cage-feasibility-plan-v1', 'revision': 1,
            'inputCommit': head, 'inputs': inputs,
            'apiCheck': pin(BASE/'api-check.json'),
            'toolchain': {'numpyVersion': np.__version__, 'scipyVersion': scipy.__version__},
            'producer': [pin(p) for p in sorted(Path(__file__).parent.glob('*.py'))],
            'method': 'scipy.optimize.linprog(method=highs)',
            'sourceResponse': 'full measured tensor; no block-diagonal replacement',
            'responseBaseline': 'sourceLandmarksM, matching original Head.fit',
            'coefficientOrder': 'probeAxis then original interior-ring control',
            'coordinateOrder': 'outputAxis then landmark',
            'epsilonM': .002, 'epsilonScope': 'each attached landmark coordinate; separate from actual horizontal-section half-width gate',
            'weakCageConstraintLowerBoundM': 0, 'weakCageScope': 'allows degeneration; diagnostic necessary conditions only',
            'coefficientBounds': [None, None], 'tBounds': [0, None],
            'maxActualCases': 8, 'actualSolvesPerCase': 1,
            'perCaseTimeLimitSeconds': 60,
            'svdRankRule': 'smax*max(A.shape)*float64_eps',
            'solverOptions': {'presolve': True, 'primal_feasibility_tolerance': 'HiGHS default 1e-7'},
            'numericalResidualReadbackToleranceM': 1e-7,
            'shapeExportAllowed': False, 'geometryAccepted': False,
            'stopOnDependencyOrSolverFailure': True,
            'limits': ['No cap/tolerance/regularization sweep.',
                       'LP result describes the frozen linear proxy only.',
                       'Any subsequent source geometry test requires a separate bounded task.']}
    (BASE/'plan.json').write_text(json.dumps(plan, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'plan': pin(BASE/'plan.json'), 'inputs': len(inputs)}))


if __name__ == '__main__':
    main()
