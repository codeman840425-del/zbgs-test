"""Read retained evidence through the production validators; emit an audit to stdout."""
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
folder = Path(__file__).resolve().parent
sys.path.insert(0, str(folder.parents[1] / 'scripts/production'))
from outfit_admission import verify_guard_report, verify_room_report, verify_runtime_readback


def read(name):
    return json.loads((folder / name).read_bytes())


records = read('game/signed.json')
inventory = read('build/inventory.json')
runtime = inventory['runtime']
restore = read('restore/report.json')
guards = read('selection-guards/report.json')
plan = read('request/formal-plan/plan.json')
assert plan['acceptedCount'] == 0 and plan['rejectedCount'] == len(records) == 2
rows = []
for record, room_file, fit_file in zip(records,
        ['game/room-0625-01/report.json', 'game/room-0375-01/report.json'],
        ['fit/candidate.json', 'fit/control.json'], strict=True):
    verify_room_report(read(room_file), record, runtime)
    verify_runtime_readback(restore, inventory, record, runtime)
    verify_guard_report(guards, record, runtime)
    fit = read(fit_file)
    assert fit['bodySha256'] == record['appearanceRecipe']['base']['sha256']
    for equipment in record['appearanceRecipe']['equipment']['resources'].values():
        assert any(equipment['id'] == item['id'] and equipment['sha256'] == item['garmentSha256']
                   and item['fitSha256'] == fit['bodySha256'] for item in fit['equipment'].values())
    paths = [room_file, fit_file, 'restore/report.json', 'selection-guards/report.json',
             'budget/source-rights.json', 'budget/record-budget.json', 'budget/dev-runtime/report.json']
    rows.append({'record':record['integrity']['recordSha256'], 'body':fit['bodySha256'],
                 'validatedByProductionFunctions':['normalSpeedMotion','recordAndRestore','selectionGuards'],
                 'fitScope':'Registered three-piece outfit, actual bind, neutral changed-surface clearance and sole.',
                 'rightsScope':'Model and these three garments. See archived source and limits.',
                 'budgetScope':'Static single and pair, development runtime only. Ordinary PC not measured.',
                 'humanVisualReview':'pending', 'wholeOutfitAdmission':'not-issued',
                 'evidence':{p:hashlib.sha256((folder/p).read_bytes()).hexdigest() for p in paths}})
print(json.dumps({'runtime':runtime, 'records':rows, 'formalPlan':plan['mode'],
                  'acceptedForFormalProduction':plan['acceptedCount']}, indent=2))
