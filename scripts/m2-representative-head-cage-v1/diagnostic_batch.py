"""Explicitly scheduled Blender diagnostic wrapper. Never production-admissible."""
import argparse
import json
from pathlib import Path
import sys
import traceback

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagnostic import ROOT, SOURCE, make_plan
from batch import run_source
from contact_classification import observe_frame
from head import bpy, io, require


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--plan', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    plan = json.loads(args.plan.read_bytes())
    require(plan == make_plan(Path(plan['toolRoot']), ROOT / plan['output']), 'Diagnostic plan stale')
    require(bpy.app.build_hash.decode() == plan['tool']['buildHash'], 'Actual Blender build differs')
    output = ROOT / plan['output']
    require(output.is_dir() and not list(output.glob('*/report.json')), 'Require unused diagnostic output')
    spec = json.loads((SOURCE / 'spec.json').read_bytes())
    rows = []
    failure = None
    try:
        for sex, source in spec['sources'].items():
            rows.extend(run_source(sex, source, [r for r in spec['requests'] if r['sex'] == sex], spec, output,
                                   diagnostic_only=True, contact_observer=observe_frame))
    except Exception as error:
        failure = {'error': str(error), 'traceback': traceback.format_exc()}
    reports = [json.loads(p.read_bytes()) for p in sorted(output.glob('*/report.json'))]
    require(all(r.get('diagnosticOnly') and r.get('productionAdmitted') is False and not r['runtimeAccepted'] for r in reports), 'Unmarked diagnostic report')
    require(not list(output.rglob('equipment.json')), 'Normal equipment manifest is forbidden in diagnostic output')
    result = {'schema': 'head-diagnostic-batch-v1', 'status': 'diagnostic-failed' if failure or any(r['failures'] for r in reports) else 'diagnostic-unadmitted',
        'diagnosticOnly': True, 'productionAdmitted': False, 'runtimeAccepted': False,
        'originalStrictFailure': plan['originalStrictFailure'], 'independentAuditSha256': plan['independentAuditSha256'],
        'originalRequests': spec['requests'], 'completed': rows, 'completedReports': len(reports), 'failure': failure,
        'shapeBatches': 1, 'singleCaseEdits': 0, 'retryOrSweep': False}
    (output / 'diagnostic-batch.json').write_bytes(io.encoded(result))
    require(result['status'] != 'diagnostic-failed', 'Diagnostic geometry/expression/intent or implementation failure retained; no admission and no retry')


if __name__ == '__main__':
    main()
