"""CPU-only continuation contract checks. Popen is mocked against Blender launch."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagnostic import BASE, SOURCE, validate_failed_preflight, quarantine
from contact_classification import pair_record


def main():
    before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in (SOURCE / 'generated').rglob('*') if p.is_file()}
    old = json.loads((SOURCE / 'generated/preflight.json').read_bytes())
    audit = json.loads((BASE / 'inputs/report.json').read_bytes())
    pair = json.loads((SOURCE / 'generated/pair-diagnosis.json').read_bytes())
    checks = []
    accepted = validate_failed_preflight(old, audit, pair)
    checks.append({'id': 'only-reviewed-prerequisite-is-diagnostic', 'passed': accepted['productionAdmitted'] is False})
    wrong = copy.deepcopy(old)
    wrong['sexes'][0]['gates'][0]['passed'] = False
    try:
        validate_failed_preflight(wrong, audit, pair)
    except ValueError:
        checks.append({'id': 'additional-failed-gate-rejected', 'passed': True})
    else:
        checks.append({'id': 'additional-failed-gate-rejected', 'passed': False})
    source = pair['sourceFloat64Endpoint']
    target = pair['actualModifierEndpoint']
    observed = pair_record((47, 1007), (source['mouthTriangleM'], source['skinTriangleM']),
                           (target['mouthTriangleM'], target['skinTriangleM']), False, True)
    checks.append({'id': 'real-frozen-pair-still-fails-strict', 'passed': observed['newStrict'] and observed['legacyGateStillFails'] and observed['sourceInclusive'] and observed['targetInclusive'], 'record': observed})
    for failures in [[], ['new strict contact']]:
        report = {'failures': failures, 'runtimeAccepted': False}
        name, reference = quarantine(report, [])
        checks.append({'id': 'quarantine-' + str(bool(failures)), 'passed': name != 'equipment.json' and reference['schema'] != 'zbgs-equipment-v1' and report['productionAdmitted'] is False and report['status'] != 'source-candidate'})
    spec = importlib.util.spec_from_file_location('normal_head_entry', Path(__file__).with_name('run.py'))
    normal = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(normal)
    with patch.object(sys, 'argv', [str(Path(normal.__file__)), '--phase', 'batch', '--tool-root', 'F:/gamemake']), patch.object(normal.subprocess, 'Popen', side_effect=AssertionError('Blender launch forbidden in CPU QA')) as launch:
        try:
            normal.main()
        except ValueError as error:
            checks.append({'id': 'normal-batch-original-failure-still-rejected', 'passed': 'passed preflight' in str(error) and not launch.called})
        else:
            checks.append({'id': 'normal-batch-original-failure-still-rejected', 'passed': False})
    checks.append({'id': 'old-failure-files-unchanged', 'passed': all(hashlib.sha256(p.read_bytes()).hexdigest() == digest for p, digest in before.items())})
    result = {'schema': 'head-diagnostic-cpu-qa-v1', 'checks': checks, 'passed': all(r['passed'] for r in checks),
              'blenderStarted': False, 'batchStarted': False, 'productionAdmitted': False, 'runtimeAccepted': False}
    (BASE / 'cpu-qa.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
    print(json.dumps({'passed': result['passed'], 'checks': len(checks), 'blenderStarted': False}))
    assert result['passed']


if __name__ == '__main__':
    main()
