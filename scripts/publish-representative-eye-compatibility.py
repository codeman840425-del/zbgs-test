"""Admit the existing joy/blink correction only where its real source lanes match."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
manifest_path=ROOT/'assets-source/m2-representative-batch-v1/generated/manifest.json'
manifest=json.loads(manifest_path.read_bytes())
rows=[];profiles=[]
for variant in manifest['variants']:
    original_path=ROOT/variant['sourceBody']['path'];derived_path=ROOT/variant['avatar']['path']
    assert sha(original_path)==variant['sourceBody']['sha256'] and sha(derived_path)==variant['avatar']['sha256']
    a,b=GLB(original_path),GLB(derived_path);checks=[]
    assert a.doc['extensions']['VRM']['blendShapeMaster']==b.doc['extensions']['VRM']['blendShapeMaster']
    for am,bm in zip(a.doc['meshes'],b.doc['meshes']):
        names=am.get('extras',{}).get('targetNames',[])
        assert names==bm.get('extras',{}).get('targetNames',[])
        for p,q in zip(am['primitives'],bm['primitives']):
            material=a.doc['materials'][p['material']]['name']
            if not any(name in material for name in ['Face_00_SKIN','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE']):continue
            indices=np.unique(a.acc(p['indices']))
            for key in ['EYE_Joy','EYE_Close']:
                hits=[i for i,n in enumerate(names) if n.endswith('_Fcl_'+key)]
                assert len(hits)==1
                index=hits[0]
                before=a.acc(p['targets'][index]['POSITION'])[indices]
                after=b.acc(q['targets'][index]['POSITION'])[indices]
                assert before.tobytes()==after.tobytes(),variant['id']+'/'+material+'/'+key
                checks.append({'material':material,'key':key,'count':len(indices),
                               'deltaSHA256':hashlib.sha256(after.tobytes()).hexdigest(),'exact':True})
    assert len(checks)==8
    rows.append({'id':variant['id'],'sourceSHA256':variant['sourceBody']['sha256'],'targetSHA256':variant['avatar']['sha256'],'checks':checks})
    profiles.append({'sha256':variant['avatar']['sha256'],'prefix':'F00_000_00_' if variant['sex']=='female' else 'M00_000_00_',
                     'targets':56 if variant['sex']=='female' else 54})
output=ROOT/'prototype/public/assets/m2-representative-batch-v1/eye-blink-profiles.json'
payload={'schema':'representative-eye-blink-admission-v1','profiles':profiles,'sourceManifestSHA256':sha(manifest_path),
         'scope':'Exact matching EYE_Joy/EYE_Close position lanes on four corrected material roles and unchanged VRM expression bindings. Runtime still validates mesh ownership/mapping. Visual combination pending.'}
output.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf8')
report={'status':'source-lanes-passed-visual-pending','scriptSHA256':sha(Path(__file__)),'sourceManifestSHA256':sha(manifest_path),
        'outputSHA256':sha(output),'variants':rows}
(ROOT/'evidence/m2-representative-batch-eye-dependencies.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({'presets':len(profiles),'status':report['status'],'outputSHA256':sha(output)}))
