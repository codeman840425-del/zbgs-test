"""Read the delivered pair and replay the existing whole-outfit planner and evidence gates."""
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ARCHIVE = HERE.parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'scripts/production'))
import outfit_admission as gate
from flow import Validator
from native_batch_gate import budget_admission_index
from production_paths import project_output
from received_outfit_request import outfit_payload
from verify_shape_delivery_batch import verify
from variant_batch import plan

DELIVERY = ROOT / 'output/m2-rule-batch-delivery-v1/pair'


def load(path):
    return json.loads(path.read_bytes())


def run():
    pins = {}

    def pin(path):
        descriptor = gate.evidence_pin(path)
        gate.pinned_file(descriptor)
        pins[descriptor['path']] = descriptor
        return descriptor['sha256']

    receipt_sha = pin(ARCHIVE/'receipt.json')
    verify_result = verify(ROOT/'assets-source/rule-body-batch-v1/batch.json', DELIVERY, receipt_sha)
    assert verify_result == load(ARCHIVE/'readback.json')
    for filename in ['records.json','receipt.json','inventory.json']:
        assert pin(DELIVERY/filename) == pin(ARCHIVE/filename)
    assert pin(DELIVERY/'game/runtime-package.json') == pin(ARCHIVE/'inventory.json')
    receipt = load(DELIVERY/'receipt.json')
    inventory = load(DELIVERY/'inventory.json')
    records = load(DELIVERY/'records.json')
    runtime = gate.runtime_pin({key:inventory['runtime'][key] for key in ('sourceCommit','sourceDigest','buildId')})
    assert all(receipt['runtime'][key] == value for key, value in runtime.items())
    reg = ROOT/'scripts/runtime-package/game-runtime-reviews.json'
    row = load(reg)['externalRecords'][runtime['sourceDigest']]
    reviewed = reg.parent/row['file']
    assert pin(reviewed) == row['sha256']
    review = load(reviewed)
    assert all(review[key] == runtime[key] for key in ('sourceDigest','sourceCommit'))
    for file, expected in review['files'].items():
        assert pin(DELIVERY/'game'/file) == expected['sha256']

    inputs, profiles = [], {}
    for issued, record in zip(receipt['items'], records, strict=True):
        pack = DELIVERY/issued['shapePackPath']
        profile, fit = load(pack/'profile.json'), load(pack/'fit.json')
        assert pin(pack/'index.json') == issued['indexSha256'] and pin(pack/'profile.json') == issued['profileSha256']
        assert pin(pack/'fit.json') == load(pack/'index.json')['fit']['sha256']
        body = DELIVERY/'game'/profile['url'].lstrip('/')
        equipment = DELIVERY/'game'/profile['manifestUrl'].lstrip('/')
        assert pin(body) == profile['sha256'] == issued['bodySha256']
        assert pin(equipment) == profile['manifestSha256']
        assert issued['identity'] == record['identity'] and issued['recordSha256'] == record['integrity']['recordSha256']
        profiles[profile['id']] = profile
        inputs.append((load(pack/'recipe.json'),fit,(body,{'equipment.json':equipment.read_bytes()})))

    # Generate the same candidate matrix as the receiving tool, without installing
    # assets into the frozen checkout or adding any entry to the reviewed registry.
    files = outfit_payload(inputs,HERE,Validator(ROOT),profiles)
    matrix, request = (json.loads(files[name]) for name in ['matrix.json','request.json'])
    for item, record in zip(request['items'],records,strict=True):
        assert item['bodyType'] == record['appearanceRecipe']['base']['bodyType']
        assert gate.normalized_equipment(item['outfit']['equipment']) == gate.record_outfit(record)
        assert item['outfit']['role'] == record['appearanceRecipe']['equipment']['role']
        item.update(stableId=record['identity']['id'],identity=record['identity'])
    index_sha = pin(gate.INDEX)
    approvals = gate.load_reviewed_admissions()
    formal = plan(matrix,request,diagnostic=False,admissions=approvals,runtime_commit=runtime['sourceCommit'])
    assert formal['acceptedCount'] == 0 and formal['rejectedCount'] == len(records)
    assert [item['reason'] for item in formal['items']] == [
        'Whole-outfit runtime admission evidence is required from the reviewed index'] * len(records)

    restore,guards = (HERE/folder/'report.json' for folder in ('restore','guards'))
    cold,seat = ARCHIVE/'cold/report.json',ARCHIVE/'seat/report.json'
    budget = ARCHIVE/'budget/record-measure.json'
    for file in [restore,guards,cold,seat,budget,ARCHIVE/'seat/room-1x.webm',ARCHIVE/'cold/dual-external-cold-1x.webm']:
        pin(file)
    restore_report,guard_report,cold_report,seat_report,estimate = map(load,[restore,guards,cold,seat,budget])
    assert estimate['inputSha256'] == pin(DELIVERY/'records.json') and estimate['reviewedRuntime'] == runtime['sourceDigest']
    assert seat_report['passed'] and not seat_report['errors'] and seat_report['build'] == inventory['runtime']
    assert cold_report['status'] == 'functional-pass' and len(cold_report['sessions']) == 2
    for session in cold_report['sessions']:
        assert session['build'] == runtime['sourceDigest'] and not session['errors']
        assert [(r['id'],r['sha']) for r in session['first']] == [(r['identity']['id'],r['integrity']['recordSha256']) for r in records]
    lanes = []
    for record in records:
        identity = record['identity']['id']
        gate.verify_runtime_readback(restore_report,inventory,record,runtime)
        gate.verify_guard_report(guard_report,record,runtime)
        measured = gate.exact_entry(estimate['records'],'id',identity)
        assert measured['recordSha256'] == record['integrity']['recordSha256']
        seat_actor = gate.exact_entry(seat_report['records'],'id',identity)
        assert seat_actor['sha'] == measured['recordSha256'] and seat_actor['body'] == measured['bodyType']
        try:
            gate.verify_room_report(seat_report,record,runtime)
        except (KeyError,ValueError) as error:
            motion = {'status':'rejected-existing-room-report','errorType':type(error).__name__,'reason':str(error)}
        else:
            raise AssertionError('Record the newly accepted motion report before reusing this audit')
        for session in cold_report['sessions']:
            wave = gate.exact_entry(session['motions'],'id',identity)
            assert wave['gesture']['status'] == 'completed' and wave['drawFrames'] > 0
        equipment = gate.record_outfit(record)
        lanes.append({'id':identity,'recordSha256':measured['recordSha256'],'bodyType':measured['bodyType'],
                      'bodySha256':measured['avatarSha256'],'equipment':equipment,
                      'formalReadback':'passed','formalSelectionGuards':'passed','formalRoomReplay':motion,
                      'seatObservations':[o['task']['kind'] for o in seat_report['observations'] if o['id']==identity],
                      'staticBudget':measured['status']})
    try:
        budget_admission_index(budget)
    except ValueError as error:
        four_layers = str(error)
    else:
        raise AssertionError('Unexpected four-layer budget admission')
    assert pin(gate.INDEX) == index_sha
    for descriptor in pins.values():
        gate.pinned_file(descriptor)
    return {'schema':'exact-batch-whole-outfit-replay-v1','runtime':runtime,'records':lanes,
            'formalPlanner':formal,'reviewedIndexEntries':len(approvals),'fourLayerBudgetRejection':four_layers,
            'staticPairBudget':estimate['concurrentAssessment']['status'],'ordinaryPC':estimate['ordinaryPCPerformance'],
            'guardCases':len(guard_report['cases']),'recordsAndRestoreBrowser':restore_report['browser'],
            'publishedGameFiles':verify_result['gameFiles'],'reviewedLanes':list(gate.LANES),'inputs':list(pins.values())}


if __name__ == '__main__':
    output = project_output(HERE/'review.json', __file__)
    raw = (json.dumps(run(), ensure_ascii=False, indent=2)+'\n').encode()
    if output.exists():
        assert output.read_bytes()==raw, 'Review differs; preserve the prior result'
    else:
        with output.open('xb') as stream:
            stream.write(raw)
    print(hashlib.sha256(raw).hexdigest(), output)
