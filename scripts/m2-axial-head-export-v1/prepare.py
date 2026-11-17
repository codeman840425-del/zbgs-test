"""Freeze thin export inputs without calling normal assembly or container bake."""
import json
from pathlib import Path

from adapter import BASE, ROOT, io, load, np, pinned, require
from qa import run

spec, source, records, groups = load()
for case in spec['cases']:
    report = json.loads(pinned(case['evaluationReport']).read_bytes())
    require(report['source'] == spec['source'] and report['rawArrays'] == case['mappedEndpoints'], 'Wrong report/raw identity')
    require(report['id'] == case['candidateId'] and report['sourceSpec'] == spec['evaluationSpec'], 'Wrong candidate/spec identity')
    with np.load(pinned(case['mappedEndpoints']), allow_pickle=False) as raw:
        require(raw['sourceEndpointsM'].shape == raw['mappedEndpointsM'].shape == raw['float32BakeRoundTripM'].shape == (120935, 3)
            and raw['sourceJacobians'].shape == (120935, 3, 3), 'Incomplete future export arrays')
        require(all(np.isfinite(raw[key]).all() for key in raw.files), 'Nonfinite future export arrays')
qa = run()
io.save(BASE / 'qa-report.json', qa)
io.save(BASE / 'prepared.json', {'schema': 'axial-head-export-preparation-v1', 'status': 'prepared-no-real-bake',
    'source': spec['source'], 'sourceSpec': io.ref(BASE / 'spec.json'), 'inputReferences': spec['inputs'],
    'sourceGroups': len(groups), 'records': len(records), 'occurrences': 120935,
    'scripts': [io.ref(ROOT / path) for path in spec['scripts']], 'qa': io.ref(BASE / 'qa-report.json'),
    'originalBakeSourceUnchanged': True, 'provenanceAdaptation': 'AST replacement of one generator RHS only',
    'realBakeInvocations': 0, 'authorNormalArraysPrepared': False, 'strictAdmissionPending': True,
    'runtimeAccepted': False})
print(json.dumps({'status': 'prepared-no-real-bake', 'syntheticChecks': len(qa['checks'])}))
