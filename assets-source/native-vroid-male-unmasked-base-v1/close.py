"""Read current CPU evidence and seal exact new package identities."""
from pathlib import Path
import hashlib
import json
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence/native-vroid-male-unmasked-base-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    readback=json.loads((EVIDENCE/'independent-readback.json').read_bytes())
    qa=json.loads((EVIDENCE/'qa.json').read_bytes())
    assert readback['nonTargetJSONExact'] and readback['nativePNGExact']
    assert qa['wrongFemaleSourceRejectedBeforeWrite'] and qa['existingOutputsRejectedAndUnchanged']
    manifest=json.loads((BASE/'generated/manifest.json').read_bytes())
    for row in manifest['inputs']:
        assert sha(ROOT/row['path'])==row['sha256'],row['path']
    for name,digest in qa['repeatedResourcesByteExact'].items():
        assert sha(BASE/'generated'/name)==digest
        assert sha(EVIDENCE/'rebuild'/name)==digest
    closure=dict(schema='native-male-unmasked-source-closure-v1',status='CPU-derivative-verified-not-factory-admitted',
        avatar=manifest['avatar'],sourceManifest=dict(path=(BASE/'generated/manifest.json').relative_to(ROOT).as_posix(),sha256=sha(BASE/'generated/manifest.json')),
        independentReadback=dict(path=(EVIDENCE/'independent-readback.json').relative_to(ROOT).as_posix(),sha256=sha(EVIDENCE/'independent-readback.json')),
        repeatAndNegativeQA=dict(path=(EVIDENCE/'qa.json').relative_to(ROOT).as_posix(),sha256=sha(EVIDENCE/'qa.json')),
        consumedSourceFiles=[dict(path=p,sha256=sha(ROOT/p)) for p in ['assets-source/native-vroid-unmasked-base-v1/build.py','scripts/m2-male-face-v1/glb.py']],
        originalNodes=91,skinJointCounts=[79,79],accessors=139,originalBufferViews=160,nonTargetImages=20,
        sourceMetaExact=True,singleMergedVroidExists=False,studioOrGPUCalls=0,runtimeOrPublicEdited=False,gitCommitCreated=False,
        pending=['Equipment binding/fit source identity','Body texture coverage','Factory/pose/expression/visual and persistence','Commercial/distribution authorization'])
    write(BASE/'closure.json',closure)
    files=[]
    for directory in [BASE,EVIDENCE]:
        for p in sorted(directory.rglob('*')):
            if p.is_file() and p.name!='package-files.json':
                files.append(dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=sha(p)))
    write(BASE/'package-files.json',dict(schema='native-male-unmasked-source-files-v1',files=files))
    print(json.dumps({'files':len(files),'closureSha256':sha(BASE/'closure.json'),'packageFilesSha256':sha(BASE/'package-files.json')}))

if __name__=='__main__':main()
