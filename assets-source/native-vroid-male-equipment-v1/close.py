"""Seal the finite male equipment/coverage source package without re-evaluation."""
from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
COVERAGE=ROOT/'assets-source/native-vroid-male-body-texture-fit-v1'
OUT=ROOT/'evidence/native-vroid-male-equipment-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    cpu=json.loads((OUT/'cpu-verification.json').read_bytes())
    assert all(p['finite'] for p in cpu['poses']) and len(cpu['poses'])==9
    assert cpu['oldA18aAvatarIdentityRejectedForAllThree'] and cpu['damagedInverseBindRejectedForAllThree']
    for row in cpu['runtimePins']:assert sha(ROOT/row['path'])==row['sha256']
    source=json.loads((OUT/'source-readback.json').read_bytes());assert len(source['items'])==3
    negatives=json.loads((OUT/'binding-negatives.json').read_bytes());assert len(negatives['results'])==3
    qa=json.loads((OUT/'qa.json').read_bytes())
    for check in qa['checks']:
        for name,digest in check['resourceHashes'].items():assert sha(ROOT/check['package']/'generated'/name)==digest
    def ref(p):return dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size)
    closure=dict(schema='male-native-three-piece-source-closure-v1',status='source-extraction-target-fit-and-actual-adapter-CPU-verified-not-factory',
        targetAvatar=ref(ROOT/'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'),
        equipment=ref(BASE/'generated/equipment.json'),coverage=ref(COVERAGE/'generated/manifest.json'),
        cpu=ref(OUT/'cpu-verification.json'),sourceReadback=ref(OUT/'source-readback.json'),
        repetitionAndRefusals=ref(OUT/'qa.json'),bindingNegatives=ref(OUT/'binding-negatives.json'),
        floor=ref(BASE/'generated/floor-measurement.json'),runtimePins=cpu['runtimePins'],
        sourceHelpers=[ref(ROOT/p) for p in ['assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py','assets-source/native-vroid-body-audit-v1/audit.py','scripts/m2-male-face-v1/glb.py']],
        python=platform.python_version(),numpy=np.__version__,pillow=pillow_version,
        pending=['Male body texture runtime admission currently hard-pinned to female','Factory, normalized actions, springs and pose contacts',
                 'Actual MToon image rendering, same-room visuals and recipe/save restore','Commercial/distribution authorization'],
        studioOrGPUCalls=0,publicOrRuntimeEdited=False,gitCommitCreated=False)
    write(BASE/'closure.json',closure)
    files=[]
    for directory in [BASE,COVERAGE,OUT]:
        for p in sorted(directory.rglob('*')):
            if p.is_file() and p.name!='package-files.json':files.append(ref(p))
    write(BASE/'package-files.json',dict(schema='male-equipment-and-coverage-package-files-v1',files=files))
    print(json.dumps({'files':len(files),'closureSha256':sha(BASE/'closure.json'),'packageFilesSha256':sha(BASE/'package-files.json')}))

if __name__=='__main__':main()
