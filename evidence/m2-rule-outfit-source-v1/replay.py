"""Replay the supplier and receiver fixtures from the drive root using their issuance pins."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0,str(ROOT/'scripts/production'))
from production_paths import project_output
from verify_record_room import publish


def read(path):
    return json.loads(path.read_bytes())


def main():
    supplier = ROOT/'output/m2-rule-batch-delivery-v1/pair'
    receiver_root = ROOT.parent/'gamemake-test/rule-blind-9c72d4fd'
    receiver = receiver_root/'output/receiver-cft-replay/receiver-jaw-orchid'
    cases = []
    for row in read(supplier/'receipt.json')['items']:
        ident = row['identity']['id']
        cases.append((ident,supplier/'game/records'/f'{ident}.json',row['recordSha256'],
                      supplier/row['shapePackPath'],row['indexSha256'],ROOT))
    receipt = read(receiver/'receipt.json')
    ident = receipt['identity']['id']
    cases.append((ident,receiver/'game/records'/f'{ident}.json',receipt['recordSha256'],
                  receiver/'shape-pack',receipt['shapePack']['indexSha256'],receiver_root))

    checks = {}
    def run(case, target, *, rejection=None, label=None, change=None):
        ident, record, signed, pack, index, source = case
        options = {'--record':record,'--record-sha256':signed,'--pack':pack,'--index-sha256':index,
                   '--source-root':source,'--out':target}
        options.update(change or {})
        args = [sys.executable,'-B',ROOT/'scripts/production/verify_outfit_source.py']
        for key, value in options.items():
            args += [key,str(value)]
        proc = subprocess.run(args,cwd=ROOT.anchor,capture_output=True)
        if rejection:
            assert proc.returncode == 1 and rejection in proc.stderr.decode(errors='replace'),proc.stderr
            checks[label] = {'exit':proc.returncode,'reason':rejection}
        else:
            assert proc.returncode == 0,proc.stderr
            assert proc.stdout == target.read_bytes()
            result = json.loads(proc.stdout)
            assert result['id'] == ident and result['technicalStatus'] == 'source-bytes-reproduced'
            assert result['provenanceAndRightsLane'] == 'not adjudicated' and result['humanRightsReview'] == 'not evaluated'
            return result

    rows = [run(case,HERE/(case[0]+'.json')) for case in cases]
    assert len({r['body']['sha256'] for r in rows}) == len(cases)
    for slot in ('top','bottom','shoes'):
        items = [next(i for i in r['lineage']['garments'] if i['slot'] == slot) for r in rows]
        assert len({i['file']['sha256'] for i in items}) == 1
        assert all(i['assignedBodySha256'] == r['body']['sha256'] for i,r in zip(items,rows,strict=True))
    recovered = next(doc for doc in rows[-1]['lineage']['sourceDocuments'] if 'recoveredOriginalLineEndings' in doc)
    assert recovered['recoveredOriginalLineEndings'] == 'CRLF' and recovered['checkoutFile']['sha256'] != recovered['sha256']

    with TemporaryDirectory(dir=project_output(HERE,__file__)) as temporary:
        scratch = Path(temporary)
        target = scratch/'retry.json'
        run(cases[0],target,change={'--record':cases[1][1]},rejection='Different signed record',label='wrongRecord')
        run(cases[0],target,change={'--pack':cases[1][3]},rejection='Different shape pack index',label='wrongPack')
        run(cases[0],target,change={'--pack':cases[1][3],'--index-sha256':cases[1][4]},
            rejection='different body or source',label='validOtherPackAndItsOwnPin')
        damaged = scratch/'pack'
        shutil.copytree(cases[0][3],damaged)
        top = next(i for i in rows[0]['lineage']['garments'] if i['slot'] == 'top')['file']['path']
        with (damaged/top).open('r+b') as f:
            f.seek(-1,os.SEEK_END)
            value = f.read(1)[0]
            f.seek(-1,os.SEEK_END)
            f.write(bytes([value ^ 1]))
        run(cases[0],target,change={'--pack':damaged},rejection='Content differs from trusted reconstruction: '+top,
            label='sameIndexChangedShirtBytes')
        run(cases[0],target,change={'--source-binding':cases[0][1]},rejection='original garment/body binding',
            label='unrelatedOriginalBinding')
        for key, bad in [('outsideProject',ROOT.parent/'out-of-scope-outfit-source.json'),
                         ('directoryTraversal',scratch/'..'/'..'/'..'/'..'/'out-of-scope-outfit-source.json')]:
            run(cases[0],bad,rejection='inside the production tool main checkout',label=key)
            assert not bad.exists()
        if os.name == 'nt':
            from _winapi import CreateJunction
            junction = scratch/'external'
            CreateJunction(str(receiver),str(junction))
            try:
                run(cases[0],junction/'out-of-scope-outfit-source.json',
                    rejection='inside the production tool main checkout',label='outsideViaJunction')
                assert not (receiver/'out-of-scope-outfit-source.json').exists()
            finally:
                junction.rmdir()
        assert not target.exists()
        assert run(cases[0],target) == rows[0]
        run(cases[1],target,rejection='Existing receipt differs',label='differentReceiptAtExistingPath')
        assert target.read_bytes() == (HERE/(cases[0][0]+'.json')).read_bytes()
    summary = {'workingDirectory':ROOT.anchor,'sourceReceipts':{
        case[0]:hashlib.sha256((HERE/(case[0]+'.json')).read_bytes()).hexdigest() for case in cases},
        'rejections':checks,'failureAndRetrySameTarget':True,
        'receiverOriginalText':recovered,
        'receiverFirstAttempt':'Exact raw checkout file digest differed from original binding before line-ending replay.'}
    publish(HERE/'checks.json',(json.dumps(summary,indent=2)+'\n').encode())
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
