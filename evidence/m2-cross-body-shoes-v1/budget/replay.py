"""From the project root: python -X utf8 -B evidence/m2-cross-body-shoes-v1/budget/replay.py"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path('evidence/m2-cross-body-shoes-v1')
SOURCE = Path('experiments/worktrees/cross-body-shoes-da2edab6')
PUBLIC = ROOT/SOURCE/'prototype/public'
GAME = ROOT/'output/m2-cross-body-shoes-v1/game-package'
TOOL = Path('scripts/production/record_budget.py')
FLAT = Path('evidence/m2-uniform-lite-operator-v1/records.json')
COMMIT = 'da2edab6108433326c900c5f649103d8fd3ab5ee'
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def shoe_and_meshes(record, signed):
    shoe, = [item for item in signed['appearanceRecipe']['equipment']['resources'].values() if item['slot']=='shoes']
    body_model, = [m for m in record['models'] if m['id']=='body']
    body_binds = GLB((PUBLIC/body_model['path']).read_bytes()).bind_by_name()
    selected = []
    shoe_proof = None
    for model in record['models']:
        if not model['selected']:
            continue
        raw = (PUBLIC/model['path']).read_bytes()
        assert sha(raw) == model['sha256']
        glb = GLB(raw)
        selected.append({'id':model['id'], 'path':model['path'], 'sha256':model['sha256'],
                         'meshDefinitions':len(glb.doc['meshes']),
                         'meshNodes':sum('mesh' in node for node in glb.doc['nodes'])})
        if model['id'] == shoe['id']:
            assert model['sha256'] == shoe['sha256'] and len(raw) == shoe['bytes']
            image, = glb.doc['images']
            view = glb.doc['bufferViews'][image['bufferView']]
            start = view.get('byteOffset',0)
            own_binds = glb.bind_by_name()
            bindings = {row['sourceBone']:row for row in shoe['bindings']}
            assert bindings.keys()==own_binds.keys()
            max_delta = max(abs(a-b) for name,row in bindings.items()
                            for matrix in (body_binds[row['targetRawBone']],own_binds[name])
                            for a,b in zip(matrix,row['inverseBindMatrix'],strict=True))
            assert max_delta<1e-6
            shoe_proof = {**{k:shoe[k] for k in ('id','fitId','url','sha256','bytes','compatibleAvatarSha256')},
                          'embeddedImageSha256':sha(glb.binary[start:start+view['byteLength']]),
                          'rawBones':sorted(own_binds), 'maxInverseBindDelta':max_delta, 'metrics':model['cost']['metrics']}
    assert shoe_proof
    return shoe_proof,selected


def measure(label, input_path):
    signed = read(ROOT/input_path)
    assert len(signed) == 2
    by_id = {s['identity']['id']:s for s in signed}
    args = [TOOL.as_posix(),'measure',input_path.as_posix(),'--source-root',SOURCE.as_posix(),
            '--budget-version','m2-technical-v1','--concurrent-group',*by_id]
    run = subprocess.run([sys.executable,'-X','utf8','-B',*args],cwd=ROOT,check=False,capture_output=True)
    result = json.loads(run.stdout)
    assert run.returncode in (0,1),result
    assert result['sourceCommit'] == COMMIT and result['inputSha256'] == sha((ROOT/input_path).read_bytes())
    actors,paths = {},{}
    for r in result['records']:
        s = by_id[r['id']]
        recipe = s['appearanceRecipe']
        assert r['recordSha256'] == s['integrity']['recordSha256'] and r['avatarSha256'] == recipe['base']['sha256']
        shoe,models = shoe_and_meshes(r,s)
        assert recipe['equipment']['role'] == ('pants-top-far-platform' if label=='platform' else 'pants-top-far')
        actor = {k:r[k] for k in ('id','revision','recordSha256','avatarSha256','outfitIndex','status','closureSourceBytes')}
        actors[r['bodyType']] = {**actor,'selected':r['selectedCost']['totals'],'startupAndSelected':r['startupAndSelectedCost']['totals'],
                                 'shoe':shoe,'models':models,'fileCount':len(r['files'])}
        for file in r['files']:
            row = paths.setdefault(file['path'],{'sha256':file['sha256'],'bytes':file['bytes'],'bodies':[]})
            assert (row['sha256'],row['bytes']) == (file['sha256'],file['bytes'])
            row['bodies'].append(r['bodyType'])
    group, = result['concurrentAssessment']['groups']
    assert len(paths) == group['closureUnionFileCount'] and sum(row['bytes'] for row in paths.values()) == group['closureUnionSourceBytes']
    return {'signed':input_path.as_posix(),'inputSha256':result['inputSha256'],'command':['python','-X','utf8','-B',*args],
            'budgetVersion':result['budgetVersion'],'budgetFileSha256':result['budgetFileSha256'],
            'actors':actors,'declaredConcurrent':group,'temporaryReference':result['temporaryAggregateLimits'],
            'sharedSourceBytes':sum(row['bytes'] for row in paths.values() if len(row['bodies'])==2),'files':paths}


def package(closure, group):
    filename = GAME/'runtime-package.json'
    raw = filename.read_bytes()
    manifest = json.loads(raw)
    assert manifest['runtime']['sourceCommit'] == COMMIT
    assert {row['recordSha256'] for row in group['actors']} == {row['recordSha256'] for row in manifest['records']}
    extra = []
    rows = {row['path']:row for row in manifest['files']}
    assert len(rows)==len(manifest['files']) and closure.keys()<=rows.keys()
    for path,row in rows.items():
        data = (GAME/path).read_bytes()
        assert len(data)==row['bytes'] and sha(data)==row['sha256']
        if path in closure:
            assert all(row[k]==closure[path][k] for k in ('bytes','sha256'))
        else:
            extra.append({k:row[k] for k in ('path','bytes','sha256')})
    disk = {p.relative_to(GAME).as_posix() for p in GAME.rglob('*') if p.is_file()}
    assert disk == set(rows)|{'runtime-package.json'}
    return {'manifest':filename.relative_to(ROOT).as_posix(),'manifestSha256':sha(raw),'manifestBytes':len(raw),
            'runtime':manifest['runtime'],'physicalFileCount':len(disk),'physicalBytes':len(raw)+sum(r['bytes'] for r in rows.values()),
            'additionalFilesBeyondSelectedSourceClosure':extra}


def replay():
    signed = next((p for p in (EVIDENCE/'signed.json',EVIDENCE/'records.json') if (ROOT/p).is_file()),None)
    if signed is None:
        raise FileNotFoundError('Expected the signed platform pair under '+str(EVIDENCE))
    old,new = measure('flat',FLAT),measure('platform',signed)
    assert new['actors'].keys()==old['actors'].keys() and len(new['actors'])==2
    deltas = {}
    for body,actor in new['actors'].items():
        flat = old['actors'][body]
        assert actor['avatarSha256']==flat['avatarSha256'] and actor['shoe']['sha256']!=flat['shoe']['sha256']
        assert actor['shoe']['embeddedImageSha256']==flat['shoe']['embeddedImageSha256']
        fit_path = Path(actor['shoe']['url'][1:]).parent/'fit.json'
        fit = read(PUBLIC/fit_path)
        assert (fit['sourceShoeSha256'],fit['shoeSha256'],fit['bodySha256'],fit['id'],fit['soleOffsetM']) == (
            flat['shoe']['sha256'],actor['shoe']['sha256'],actor['avatarSha256'],actor['shoe']['fitId'],.020)
        actor['shoe']['offlineFit'] = {'path':fit_path.as_posix(),'sha256':sha((PUBLIC/fit_path).read_bytes()),
                                      'sourceShoeSha256':fit['sourceShoeSha256'],'soleOffsetM':fit['soleOffsetM'],
                                      'inRecordDependencyClosure':fit_path.as_posix() in new['files']}
        shared = {m['sha256'] for m in actor['models']} & {m['sha256'] for m in flat['models']}
        assert len(shared)==len(actor['models'])-1==len(flat['models'])-1
        deltas[body] = {'unchangedSelectedModelCount':len(shared),'sourceFileCount':actor['fileCount']-flat['fileCount'],
                        'sourceBytes':actor['closureSourceBytes']-flat['closureSourceBytes'],
                        'selected':{k:v-flat['selected'][k] for k,v in actor['selected'].items()}}
    a,b = new['actors'].values()
    return {'schema':'cross-body-shoes-static-budget-v1','sourceCommit':COMMIT,'toolSha256':sha((ROOT/TOOL).read_bytes()),
            'flat':old,'platform':new,'platformMinusFlat':deltas,'platformSharedSelectedModelSha256':sorted(
                {m['sha256'] for m in a['models']} & {m['sha256'] for m in b['models']}),
            'platformPackage':package(new['files'],new['declaredConcurrent']),
            'limits':['Selected models include their embedded geometry, including hidden source meshes.',
                      'Source paths count once across the pair. Texture objects and RGBA8 estimates sum per actor.',
                      'Physical GPU memory, transient changes, P95 frame time and ordinary-PC performance were not measured by this CPU review.']}


if __name__ == '__main__':
    print(json.dumps(replay(),ensure_ascii=True,indent=2)+'\n',end='')
