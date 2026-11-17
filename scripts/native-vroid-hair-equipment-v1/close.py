"""Seal source package and honest old/new CPU scheduling evidence."""
from pathlib import Path
import hashlib,json
from prepare import ROOT,BASE,SOURCE,TARGET,SOURCE_SHA,TARGET_SHA,encode
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def ref(path):return dict(path=path.relative_to(ROOT).as_posix(),sha256=sha(path),bytes=path.stat().st_size)

def main():
    for p,pin in [(ROOT/SOURCE,SOURCE_SHA),(ROOT/TARGET,TARGET_SHA)]:assert sha(p)==pin
    qa=json.loads((BASE/'source-QA.json').read_bytes())
    baseline=json.loads((BASE/'cpu-verification.json').read_bytes())
    matched=json.loads((BASE/'cpu-phase-matched.json').read_bytes())
    assert qa['actualPositiveWeightJointUnion']==52 and qa['wrongSourceRejectedBeforeWrite']
    assert baseline['status']=='failed-source-pose-equivalence'
    assert matched['referenceSchedulingAdjusted'] is True and matched['maximumAllPoseDifferenceM']<1e-5
    fit=json.loads((BASE/'generated/fit.json').read_bytes())
    assert fit['assetSha256']==sha(BASE/'generated/hair.glb')
    manifest=json.loads((BASE/'generated/manifest.json').read_bytes())
    assert manifest['fit']['sha256']==sha(BASE/'generated/fit.json')
    assert manifest['sha256']==fit['assetSha256']
    for name,pin in qa['actualRebuildBytesExact'].items():
        assert sha(BASE/'generated'/name)==sha(BASE/'rebuild'/name)==pin
    dependencies=[ROOT/'prototype/node_modules/three/package.json',ROOT/'prototype/node_modules/@pixiv/three-vrm/package.json',
        ROOT/'prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js',
        ROOT/'prototype/node_modules/@pixiv/three-vrm-springbone/lib/three-vrm-springbone.module.js']
    independent=ROOT/'evidence/native-hair-v3-independent-v1/source-readback.json'
    audit=json.loads(independent.read_bytes());assert audit['passed'] and audit['fitSHA']==sha(BASE/'generated/fit.json')
    closure=dict(schema='native-hair-equipment-source-closure-v1',status='source-ready-matched-phase-CPU-equivalence-runtime-and-visual-pending',
        source=ref(ROOT/SOURCE),target=ref(ROOT/TARGET),runtimeResources=[ref(BASE/'generated'/n) for n in ['hair.glb','fit.json','manifest.json']],
        sourceQA=ref(BASE/'source-QA.json'),originalFailedCPU=ref(BASE/'cpu-verification.json'),matchedPhaseCPU=ref(BASE/'cpu-phase-matched.json'),
        independentSourceReadback=ref(independent),installedOfficialImplementations=[ref(p) for p in dependencies],
        actualPositiveWeightBoneUnion=52,skinTableEntriesPerMesh=64,retainedDynamicHairJoints=59,ownedExternalBodyFrames=15,
        nativeSpringCount=12,nativeColliders=22,nativeColliderGroups=10,ownedSourceNodes=88,onlyTwoActualHairMeshes=True,
        originalFailurePreserved=True,assetCorrectedForScheduling=False,fixtureWorldMatrixBoundaryCorrected=True,
        pending=['Shared runtime/proxy lifecycle implementation and its distinct failures','Rendered two-material equality/contact/dynamics','Per-actor isolation and recipe close/restore','Visual and ordinary-device acceptance'],
        studioOrGPUCalls=0,publicOrRuntimeEdited=False,gitCommitCreated=False)
    with (BASE/'closure.json').open('xb') as f:f.write(encode(closure))
    files=[]
    for directory in [BASE,Path(__file__).resolve().parent]:
        for p in sorted(directory.rglob('*')):
            if p.is_file() and p.name!='package-files.json' and '__pycache__' not in p.parts:files.append(ref(p))
    with (BASE/'package-files.json').open('xb') as f:f.write(encode(dict(schema='native-hair-equipment-source-files-v1',files=files)))
    print(json.dumps({'files':len(files),'closureSha256':sha(BASE/'closure.json'),'packageFilesSha256':sha(BASE/'package-files.json')}))

if __name__=='__main__':main()
