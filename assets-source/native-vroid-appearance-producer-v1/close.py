"""Seal already-recorded readonly observations and unexecuted templates."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,v):
    with path.open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    readback=json.loads((BASE/'readback.json').read_bytes())
    assert readback['cleanModelUnchanged'] and readback['nativeWrites']==0
    for row in readback['sourceReferences']:assert sha(ROOT/row['path'])==row['sha256']
    sources=json.loads((BASE/'official-source/sources.json').read_bytes())
    for row in sources['files']:assert sha(ROOT/row['path'])==row['sha256']
    templates=[]
    for name in ['next-hair-sample-template.json','color-recipe-template.json']:
        p=BASE/name;d=json.loads(p.read_bytes());assert d['status']=='prepared-not-executed'
        templates.append(dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p)))
    write(BASE/'closure.json',dict(schema='native-appearance-producer-readonly-closure-v1',
        status='read-only-preparation-complete-one-partial-hair-layer-query-failure-retained',
        readback=dict(path=(BASE/'readback.json').relative_to(ROOT).as_posix(),sha256=sha(BASE/'readback.json')),
        templates=templates,mutationCalls=0,openSaveExportCalls=0,desktopOrGPUCalls=0,
        modelReadyCleanAndUnchanged=True,freePresetSelectedOnlyNotApplied=True,
        nextSample='One free native HairSet001 on immutable male editable source; save/cold-open/export under new identity and restore checkpoint',
        runtimeSourceOrPublicEdited=False,gitCommitCreated=False))
    files=[dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size) for p in sorted(BASE.rglob('*')) if p.is_file() and p.name!='package-files.json']
    write(BASE/'package-files.json',dict(schema='native-appearance-producer-preparation-files-v1',files=files))
    print(json.dumps({'files':len(files),'closureSha256':sha(BASE/'closure.json'),'packageSha256':sha(BASE/'package-files.json'),
        'nextRecipeSha256':sha(BASE/'next-hair-sample-template.json'),'colorRecipeSha256':sha(BASE/'color-recipe-template.json')}))

if __name__=='__main__':main()
