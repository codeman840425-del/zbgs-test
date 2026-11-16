"""Admit the existing joy/blink correction only where its real source lanes match."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--revision', type=int, choices=[1,2], default=1)
parser.add_argument('--reviewed-subset', action='store_true')
parser.add_argument('--report', type=Path, help='New evidence destination; historical reports are not overwritten')
args=parser.parse_args()
prefix=f'm2-representative-batch-v{args.revision}'
manifest_path=ROOT/'assets-source'/prefix/'generated/manifest.json'
manifest=json.loads(manifest_path.read_bytes())
assert manifest['schema']=='character-representative-batch-v1' and manifest['version']==args.revision
assert len(manifest['variants'])==8 and len({v['id'] for v in manifest['variants']})==8
variants=manifest['variants']
unpublished=[]
if args.reviewed_subset:
    assert args.revision==2
    index=json.loads((ROOT/'prototype/public/assets'/prefix/'runtime-index.json').read_bytes())
    assert index['sourceManifestSha256']==sha(manifest_path) and index.get('completeBatch') is False
    variants=[v for v in variants if v.get('status')=='source-passed']
    assert len(variants)==6 and {v['id']:v['avatar']['sha256'] for v in variants}=={v['id']:v['profile']['sha256'] for v in index['presets']}
    unpublished=index['unpublished']
else:
    assert all(v.get('status')=='source-passed' for v in variants)
rows=[];profiles=[]
for variant in variants:
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
output=ROOT/'prototype/public/assets'/prefix/'eye-blink-profiles.json'
payload={'schema':'representative-eye-blink-admission-v1','profiles':profiles,'sourceManifestSHA256':sha(manifest_path),
         'scope':'Exact matching EYE_Joy/EYE_Close position lanes on four corrected material roles and unchanged VRM expression bindings. Runtime still validates mesh ownership/mapping. Visual combination pending.'}
text=json.dumps(payload,indent=2)+'\n'
# v1 was authored with Windows newlines; preserve its exact published identity.
raw=(text.replace('\n','\r\n') if args.revision==1 else text).encode('utf8')
if output.exists() and output.read_bytes()!=raw:
    raise ValueError('Published eye admission differs; use a new revision')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_bytes(raw)
report={'status':'source-lanes-passed-visual-pending','scriptSHA256':sha(Path(__file__)),'sourceManifestSHA256':sha(manifest_path),
        'outputSHA256':sha(output),'variants':rows}
report_path=args.report or ROOT/('evidence/m2-representative-batch-eye-dependencies.json' if args.revision==1 else 'evidence/m2-representative-batch-eye-dependencies-v2.json')
report_raw=(json.dumps(report,indent=2)+'\n').encode('utf8')
if report_path.exists() and report_path.read_bytes()!=report_raw:
    raise ValueError('Report already exists; provide a new --report destination')
report_path.parent.mkdir(parents=True,exist_ok=True)
report_path.write_bytes(report_raw)
print(json.dumps({'presets':len(profiles),'status':report['status'],'outputSHA256':sha(output)}))
