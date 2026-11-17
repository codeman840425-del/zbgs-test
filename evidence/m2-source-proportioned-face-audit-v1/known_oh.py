"""One stored known-oh pair, actual new exported coordinates, original strict helper."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'evidence/m2-axial-head-export-audit-v1'))
from check_combinations import compose,face_data,original_contacts
loader=importlib.util.spec_from_file_location('known_oh_actual_reader',ROOT/'scripts/m2-male-face-v1/glb.py')
reader=importlib.util.module_from_spec(loader);loader.loader.exec_module(reader)
audit=json.loads((OUT/'result.json').read_bytes())
source=face_data(reader.GLB(ROOT/audit['source']['path']))
candidate=face_data(reader.GLB(ROOT/audit['candidate']['path']))
assert hashlib.sha256((ROOT/audit['candidate']['path']).read_bytes()).hexdigest()==audit['candidate']['sha256']
S,_=compose(source,.65,1.,'oh',.66);C,_=compose(candidate,.65,1.,'oh',.66)
contacts,identities=original_contacts()
old_path=ROOT/'evidence/m2-axial-head-export-audit-v1/combination-09.json'
old=json.loads(old_path.read_bytes());old_pair=next(r for r in old['contacts'] if r['pair']=='mouth-skin')
w=next(w for w in old_pair['addedWitnesses'] if w['trianglePair']==[128,1020])
A=source['triangles']['FaceMouth_00_FACE'];B=source['triangles']['Face_00_SKIN'];av,bv=A[128],B[1020]
assert np.array_equal(S[av],np.asarray(w['originalPointsA'])) and np.array_equal(S[bv],np.asarray(w['originalPointsB']))
new_hit=bool(contacts(C,A[128:129],B[1020:1021]));source_hit=bool(contacts(S,A[128:129],B[1020:1021]))
assert not source_hit and not new_hit
result={'schema':'actual-new-source-proportioned-known-oh-witness-v1','weights':old['weights'],
    'candidate':audit['candidate'],'source':audit['source'],'pair':[128,1020],
    'sourceVertexIdsA':av.tolist(),'sourceVertexIdsB':bv.tolist(),
    'sourcePointsA':S[av].tolist(),'sourcePointsB':S[bv].tolist(),
    'candidatePointsA':C[av].tolist(),'candidatePointsB':C[bv].tolist(),
    'rejectedHeadReferencePointsA':w['leanPointsA'],'rejectedHeadReferencePointsB':w['leanPointsB'],
    'rejectedHeadReference':{'path':old_path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(old_path.read_bytes()).hexdigest()},
    'sourceLocalStrictHit':source_hit,'candidateLocalStrictHit':new_hit,'oldRejectedSavedStrictHit':True,
    'maxCandidateVersusSourceYZDifferenceM':float(max(abs(C[av,1:]-S[av,1:]).max(),abs(C[bv,1:]-S[bv,1:]).max())),
    'candidateMinusSourcePointsA_M':(C[av]-S[av]).tolist(),'candidateMinusSourcePointsB_M':(C[bv]-S[bv]).tolist(),
    'strictFunctions':identities,'new55Or10SweepRepeated':False,
    'meaning':'Original rejected known-oh pair is absent under the unchanged local strict routine on this different new candidate. No general expression, inclusive-contact, visual-depth or production claim.'}
path=OUT/'known-oh-witness.json'
if path.exists():raise RuntimeError('Preserve first local pair witness')
path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:result[k] for k in ['pair','sourceLocalStrictHit','candidateLocalStrictHit','maxCandidateVersusSourceYZDifferenceM']}))
