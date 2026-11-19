"""Check a freshly recorded pair of single-actor room reports and reject mismatched inputs."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT/'scripts/production'))
from outfit_admission import evidence_pin, runtime_pin, source_commit, verify_room_report, verify_runtime_source
from production_paths import project_output


def read(path):
    return json.loads(path.read_bytes())


def rejected(check):
    try:
        check()
    except (KeyError,ValueError) as error:
        return str(error)
    raise AssertionError('Modified evidence was accepted')


def run(folder, records_file, fixed_root, digest):
    fixed_root = fixed_root.resolve()
    commit = source_commit(fixed_root)
    runtime = runtime_pin({'sourceCommit':commit,'sourceDigest':digest,'buildId':digest[:12]})
    info = fixed_root/'prototype/dist/build-info.json'
    assert read(info)['sourceDigest'] == digest
    verify_runtime_source(fixed_root,{'buildInfo':evidence_pin(info),'runtime':runtime})
    records = read(records_file)
    assert len(records) == 2
    output = []
    for index,record in enumerate(records):
        ident = record['identity']['id']
        assert ident in ('public-batch-a','public-batch-b')
        base = folder/ident
        report = read(base/'report.json')
        assert read(base/'input-record.json') == record
        assert report['schema'] == 'published-rule-workbench-room-v1'
        verify_room_report(report,record,runtime)
        other = records[1-index]
        missing_id = deepcopy(report)
        del missing_id['tasks'][1]['requestId']
        wrong_build = {**runtime, 'sourceDigest':'0'*64, 'buildId':'0'*12}
        wrong_gear = deepcopy(report)
        wrong_gear['actors']['reopenedRestored']['equipment'][0]['id'] = next(iter(other['appearanceRecipe']['equipment']['resources'].values()))['id']
        assert wrong_gear != report
        output.append({'id':ident,'recordSha256':record['integrity']['recordSha256'],
                       'reportSha256':hashlib.sha256((base/'report.json').read_bytes()).hexdigest(),
                       'videoSha256':hashlib.sha256((base/'room-produced-1x.webm').read_bytes()).hexdigest(),
                       'normalSpeedRoom':'passed','negativeChecks':{
                           'missingTaskId':rejected(lambda:verify_room_report(missing_id,record,runtime)),
                           'wrongBuild':rejected(lambda:verify_room_report(report,record,wrong_build)),
                           'wrongRecord':rejected(lambda:verify_room_report(report,other,runtime)),
                           'wrongEquipment':rejected(lambda:verify_room_report(wrong_gear,record,runtime))}})
    return {'runtime':runtime,'normalSpeedMotion':output}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder',type=Path,default=HERE)
    parser.add_argument('--records',type=Path,default=ROOT/'evidence/m2-rule-batch-delivery-v1/records.json')
    parser.add_argument('--fixed-root',type=Path,required=True)
    parser.add_argument('--digest',required=True)
    parser.add_argument('--write',action='store_true',help='Retain the verified result in this evidence directory')
    args=parser.parse_args()
    result = run(args.folder,args.records,args.fixed_root,args.digest)
    raw = (json.dumps(result,indent=2,ensure_ascii=True)+'\n').encode()
    if args.write:
        target = HERE/'formal-verification.json'
        assert project_output(target,__file__) == target
        if target.exists():
            assert target.read_bytes() == raw, 'Existing evidence differs'
        else:
            with target.open('xb') as output:
                output.write(raw)
        print(hashlib.sha256(raw).hexdigest(), target)
    else:
        print(raw.decode(),end='')
