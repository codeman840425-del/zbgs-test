"""Replay the published motion intake from the drive root with the four historical independent records."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT/'scripts/production'))
from production_paths import project_output
from verify_record_room import publish

def read(path):
    return json.loads(path.read_bytes())


def main():
    external = ROOT.parent/'gamemake-test'
    room = ROOT/'evidence/m2-rule-formal-room-v1'
    receiver = external/'rule-formal-fdc31e05/output/receiver-formal'
    reference = read(room/'formal-verification.json')
    blind = read(external/'native-studio-round/independent/studio-20-admission/formal-room-fdc31e05/results.json')
    runtime = reference['runtime']
    assert runtime == blind['runtime']
    pairs = [(ROOT/'output/m2-rule-batch-delivery-v1/pair/game/records'/f'{row["id"]}.json',
              room/row['id']/'report.json') for row in reference['normalSpeedMotion']]
    for ident in blind['motion']:
        pairs.append((external/'rule-blind-9c72d4fd/output/receiver-cft-replay'/ident/'game/records'/f'{ident}.json',
                      receiver/ident/'report.json'))
    fixed = ROOT/'experiments/worktrees/formal-room-a-4becd8e4'
    tool = ROOT/'scripts/production/verify_record_room.py'
    negatives = {}
    def run(items, out, *, source=fixed, digest=runtime['sourceDigest'], rejection=None, name=None):
        args = [sys.executable,'-B',tool,'--fixed-root',source,'--commit',runtime['sourceCommit'],'--digest',digest]
        for record, report in items:
            args += ['--pair',record,report]
        result = subprocess.run([*args,'--out',out],cwd=ROOT.anchor,capture_output=True)
        if rejection:
            error = result.stderr.decode(errors='replace')
            assert result.returncode == 1 and rejection in error, error
            negatives[name] = {'exit':result.returncode,'reason':rejection}
        else:
            assert result.returncode == 0, result.stderr.decode(errors='replace')
            assert result.stdout == out.read_bytes()
            return json.loads(result.stdout)

    receipt = HERE/'four-records.json'
    verified = run(pairs,receipt)
    for row, old in zip(verified['records'][:2],reference['normalSpeedMotion'],strict=True):
        assert [row['id'],row['recordSha256'],row['report']['sha256'],row['video']['sha256']] == [
            old['id'],old['recordSha256'],old['reportSha256'],old['videoSha256']]
    for row in verified['records'][2:]:
        old = blind['motion'][row['id']]
        assert [row['recordSha256'],row['original']['sha256'],row['report']['sha256'],row['video']['sha256']] == [
            old['signedSha'],old['originalFileSha'],old['reportSha'],old['videoSha']]

    with TemporaryDirectory(dir=project_output(HERE,__file__)) as temp:
        scratch = Path(temp)
        out = scratch/'retry.json'
        run([pairs[0],(pairs[2][0],pairs[3][1])],out,rejection='different record',name='wrongRecordLate')
        run([pairs[0],pairs[0]],out,rejection='Duplicate record ID',name='duplicateId')
        run(pairs[2:],out,digest='0'*64,rejection='Different fixed build metadata',name='wrongBuild')
        tampered = scratch/'modified.json'
        report = read(pairs[2][1])
        del report['tasks'][1]['requestId']
        tampered.write_text(json.dumps(report),encoding='utf8')
        run([(pairs[2][0],tampered)],out,rejection='room task identities',name='missingRequest')
        report = read(pairs[2][1])
        report['actors']['beforeClose']['equipment'][0]['sha256'] = '0'*64
        tampered.write_text(json.dumps(report),encoding='utf8')
        run([(pairs[2][0],tampered)],out,rejection='Wrong actor, body or worn equipment',name='wrongEquipment')
        record = read(pairs[2][0])
        record['updatedAt'] = '2026-11-29T12:00:00.000Z'
        tampered.write_text(json.dumps(record),encoding='utf8')
        run([(tampered,pairs[2][1])],out,rejection='Invalid signed record',name='staleSignature')
        assert not out.exists()
        for name, target in [('outsideCheckout',external/'out-of-scope-room-intake.json'),
                             ('parentTraversal',scratch/'..'/'..'/'..'/'..'/'out-of-scope-room-intake.json')]:
            run(pairs[:1],target,rejection='inside the production tool main checkout',name=name)
            assert not target.exists()
        if os.name == 'nt':
            from _winapi import CreateJunction
            junction = scratch/'external-input'
            CreateJunction(str(receiver),str(junction))
            try:
                run(pairs[:1],junction/'out-of-scope-room-intake.json',
                    rejection='inside the production tool main checkout',name='externalJunction')
                assert not (receiver/'out-of-scope-room-intake.json').exists()
            finally:
                junction.rmdir()
        external_fixed = receiver.parents[1]/'experiments/worktrees/receiver-formal-runtime'
        retry = run(pairs[2:],out,source=external_fixed)
        assert retry['runtime'] == runtime and retry['records'] == verified['records'][2:]
        saved = out.read_bytes()
        run(pairs[:1],out,rejection='Existing receipt differs',name='differentExistingReceipt')
        assert out.read_bytes() == saved
        assert run(pairs[2:],out,source=external_fixed) == retry
    result = {'runtime':runtime, 'launchDirectory':ROOT.anchor, 'verifiedRecords':len(pairs),
              'receiptSha256':hashlib.sha256(receipt.read_bytes()).hexdigest(),
              'independentHistoricalPinsMatched':True, 'externalCheckoutReadOnlyRecheck':True,
              'reusedAfterRejectedBatch':True,'identicalRerun':True,'rejections':negatives}
    publish(HERE/'checks.json',(json.dumps(result,indent=2)+'\n').encode())
    print(json.dumps(result))


if __name__ == '__main__':
    main()
