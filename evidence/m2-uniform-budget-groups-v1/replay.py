"""Print the verification receipt from the project root with

python -B evidence/m2-uniform-budget-groups-v1/replay.py

The ordinary batch exits 0. An unknown actor exits 2. A fresh request naming
both signed actors exits 1 for the excess recorded under concurrentAssessment.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
PRIOR = ROOT / 'evidence/m2-uniform-skin-v1'
TOOL = ROOT / 'scripts/production/record_budget.py'
SOURCE = ROOT / 'experiments/worktrees/warm-d96411eb'
RECORDS = PRIOR / 'signed-pair.json'
ARCHIVE = PRIOR / 'budget-signed-pair.json'
BROWSER = PRIOR / 'development-budget/report.json'


def read(path):
    return json.loads(path.read_bytes())


def measure(*options):
    run = subprocess.run([sys.executable, '-B', str(TOOL), 'measure', str(RECORDS),
                          '--source-root', str(SOURCE), '--budget-version', 'm2-technical-v1', *options],
                         cwd=ROOT, capture_output=True, text=True, check=False)
    return run.returncode, json.loads(run.stdout)


def pin(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def replay():
    ids = [record['identity']['id'] for record in read(RECORDS)]
    batch_exit, batch = measure()
    assert batch_exit == 0 and batch == read(ARCHIVE)
    invalid_exit, invalid = measure('--concurrent-group', ids[0], 'missing-actor')
    assert invalid_exit == 2 and invalid['status'] == 'invalid' and 'records' not in invalid
    group_exit, declared = measure('--concurrent-group', *ids)
    assessment = declared.pop('concurrentAssessment')
    assert group_exit == 1 and declared == batch
    group, = assessment['groups']
    proof = read(PRIOR / 'budget-concurrent-proof.json')['concurrentSelectedActorReference']
    for field in ('status', 'sumAcrossSelectedActors', 'closureUnionFileCount', 'closureUnionSourceBytes', 'excesses'):
        assert group[field] == proof[field], field
    browser = read(BROWSER)
    pair, = [case for case in browser['cases'] if case['ids'] == ids]
    assert not browser['errors'] and pair['build'] == 'd9cadedb54f6'
    assert [r['recordSha256'] for r in group['actors']] == [r['recordSha256'] for r in browser['input']['records']]
    return {'command': ['python', '-B', TOOL.relative_to(ROOT).as_posix(), 'measure', RECORDS.relative_to(ROOT).as_posix(),
                        '--source-root', SOURCE.relative_to(ROOT).as_posix(), '--budget-version', batch['budgetVersion'],
                        '--concurrent-group', *ids],
            'sourceCommit': batch['sourceCommit'], 'budgetVersion': batch['budgetVersion'],
            'budgetFileSha256': batch['budgetFileSha256'], 'temporaryAggregateLimits': batch['temporaryAggregateLimits'],
            'operator': pin(TOOL), 'signedRecords': pin(RECORDS),
            'ordinaryBatch': {'exit': batch_exit, 'status': batch['status'], 'matchesArchivedReport': pin(ARCHIVE),
                              'records': [{'id': r['id'], 'status': r['status']} for r in batch['records']]},
            'unknownActor': {'exit': invalid_exit, 'status': invalid['status'], 'error': invalid['error']},
            'declaredTogether': {'exit': group_exit, **assessment},
            'priorBrowserObservation': {'report': pin(BROWSER), 'build': pair['build'], 'device': browser['device'],
                                        'actorIds': pair['ids'], 'loadedTextures': pair['loaded']['textures'],
                                        'releasedTextures': pair['released']['textures']}}


if __name__ == '__main__':
    print(json.dumps(replay(), ensure_ascii=True, indent=2))
