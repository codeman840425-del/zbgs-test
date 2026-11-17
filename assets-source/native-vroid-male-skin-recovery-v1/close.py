"""Seal existing native results and CPU evidence; never calls the editor."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence/native-vroid-male-skin-recovery-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:
        f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    spec=importlib.util.spec_from_file_location('source_glb',ROOT/'scripts/m2-male-face-v1/glb.py')
    reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
    old=reader.GLB(ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm')
    new=reader.GLB(BASE/'generated/male-tops-removed.vrm')
    names0=[n.get('name','') for n in old.doc['nodes']]
    names1=[n.get('name','') for n in new.doc['nodes']]
    assert len(set(names0))==len(names0) and len(set(names1))==len(names1)
    source_skin={names0[i] for s in old.doc['skins'] for i in s['joints']}
    removed=sorted(set(names0)-set(names1))
    architecture=dict(schema='male-tops-removal-raw-node-architecture-v1',removedRawNodes=removed,
        removedSkinNodes=sorted(set(removed)&source_skin),removedNonSkinEndNodes=sorted(set(removed)-source_skin),
        sourceSpringCount=len(old.doc.get('extensions',{}).get('VRMC_springBone',{}).get('springs',[])),
        donorSpringCount=len(new.doc.get('extensions',{}).get('VRMC_springBone',{}).get('springs',[])),
        note='readback.skeleton.removed is the skin joint set. Its sharedNonRemovedJoints means outside that skin set, not proof dummy end nodes survived. This full node list records all30 removed nodes.')
    write(EVIDENCE/'raw-node-architecture.json',architecture)
    records=[]
    for path in sorted(EVIDENCE.glob('[0-9][0-9]-*.json')):
        d=json.loads(path.read_bytes())
        assert d['ok'] and not d['failures'],path
        records.append(dict(path=path.relative_to(ROOT).as_posix(),sha256=sha(path),wallSeconds=d['wallSeconds']))
    assert len(records)==18
    cycle=json.loads((BASE/'native-cycle.json').read_bytes())
    readback=json.loads((EVIDENCE/'readback/result.json').read_bytes())
    assert readback['failures']==[]
    for row in cycle['generated']:
        assert sha(ROOT/row['path'])==row['sha256']
    license_keys=['licenseUrl','avatarPermission','commercialUsage','allowRedistribution','modification','creditNotation']
    assert all(readback['metaBefore'][k]==readback['metaAfter'][k] for k in license_keys)
    closure=dict(schema='male-native-skin-recovery-closure-v1',status='native-donor-and-CPU-correspondence-verified-not-factory',
        nativeCalls=records,cycle=dict(path=(BASE/'native-cycle.json').relative_to(ROOT).as_posix(),sha256=sha(BASE/'native-cycle.json')),
        cpuReadback=dict(path=(EVIDENCE/'readback/result.json').relative_to(ROOT).as_posix(),sha256=sha(EVIDENCE/'readback/result.json')),
        originalSourceUnchanged=True,entrySnapshotRestored=True,restoredReady=True,restoredDirty=False,
        nativeDonorVRM=cycle['generated'][-1],nativeDonorEditable=cycle['generated'][-2],nativePNG=readback['nativePNG'],
        sourceLicenseFieldsPreserved=license_keys,
        failureHistory=[dict(kind='CPU script parse failure before any readback work',error='SyntaxError: unmatched parenthesis',
            snapshot='evidence/native-vroid-male-skin-recovery-v1/readback-syntax-failure.py.txt',
            corrected='Removed one extra closing parenthesis in commonWorldMaxAbs generator; no native call repeated')],
        remaining=['Original79-bone+native PNG derivative not built here','Equipment rebind/coverage/factory/pose/visual not tested',
                   'No claim all-pixel raster coverage or commercial/distribution permission'],
        editorWindowReleased=True,desktopInput=False,gpuCalls=0,runtimeOrPublicChanged=False)
    write(BASE/'closure.json',closure)
    files=[]
    for directory in [BASE,EVIDENCE]:
        for p in sorted(directory.rglob('*')):
            if p.is_file() and p.name!='package-files.json':
                files.append(dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size))
    write(BASE/'package-files.json',dict(schema='male-native-skin-recovery-files-v1',files=files))
    print(json.dumps({'files':len(files),'closureSha256':sha(BASE/'closure.json'),
        'packageSha256':sha(BASE/'package-files.json'),'readbackSha256':sha(EVIDENCE/'readback/result.json')}))

if __name__=='__main__':main()
