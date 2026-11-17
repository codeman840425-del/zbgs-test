"""Read sealed targets/output only; no new shape, curve or solver evaluation."""
import sys
sys.dont_write_bytecode=True
import importlib.util,json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent/'result.json'
if OUT.exists():raise ValueError('Preserve audit result')
def load(p):return json.loads((ROOT/p).read_bytes())
def ref(p):return dict(path=p,sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest())
s=importlib.util.spec_from_file_location('original_glb',ROOT/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
g=m.GLB(ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm')
curves=load('assets-source/m2-axial-shape-function-v1/generated/male-long-lean-v2/curves.json');H=np.array(curves['headOriginM'])
r=load('assets-source/m2-head-cage-skin-domain-v1/generated/male.json');P=np.array(r['sourceLandmarksM']);request=next(x for x in r['requests'] if x['id']=='male-long-lean-v2');Q=np.array(request['requestedLandmarksM'])
width0=(P[1::2,0]-P[::2,0])/2;width1=(Q[1::2,0]-Q[::2,0])/2
raw=np.load(ROOT/'assets-source/m2-axial-head-evaluation-v1/generated/male-long-lean-v2/mapped-endpoints.npz')
source=raw['sourceEndpointsM'][7855:9911];mapped=raw['mappedEndpointsM'][7855:9911]
materials={}
for p in g.doc['meshes'][1]['primitives']:
    name=g.doc['materials'][p['material']]['name'];ids=np.unique(g.acc(p['indices'])).astype(int);A=source[ids];B=mapped[ids]
    materials[name]=dict(sourceLocalYRange=(A[:,1]-H[1]).min().item(),sourceLocalYMax=(A[:,1]-H[1]).max().item(),mappedLocalYRange=[float(B[:,1].min()-H[1]),float(B[:,1].max()-H[1])],maximumXYZChangeM=np.max(abs(B-A),axis=0).tolist(),meanYChangeM=float((B[:,1]-A[:,1]).mean()))
skin=materials['M00_000_00_Face_00_SKIN'];mouth=materials['M00_000_00_FaceMouth_00_FACE']
gap0=mouth['sourceLocalYRange']-skin['sourceLocalYRange'];gap1=mouth['mappedLocalYRange'][0]-skin['mappedLocalYRange'][0]
v1=load('assets-source/m2-representative-batch-v1/spec.json');v2=load('assets-source/m2-representative-batch-v2/spec.json')
row1=next(x for x in v1['variants'] if x['id']=='male-long-lean');row2=next(x for x in v2['variants'] if x['id']=='male-long-lean-v2')
result=dict(schema='preset-shape-target-audit-v1',noNewShapeEvaluation=True,parameters=curves['parameters'],v1v2ParametersEqual=row1['parameters']==row2['parameters'],source101LocalYRange=[float(P[:,1].min()-H[1]),float(P[:,1].max()-H[1])],target101LocalYRange=[float(Q[:,1].min()-H[1]),float(Q[:,1].max()-H[1])],minimumRequestedWidthRatio=float((width1/width0).min()),maximumRequestedWidthRatio=float((width1/width0).max()),maximumChinSampleDropM=float((P[:,1]-Q[:,1]).max()),mouthBottomToSkinBottomProxyM={'source':gap0,'mapped':gap1,'ratio':gap1/gap0,'meaning':'mesh material minimum-Y proxy, not anatomical lip landmark'},materials=materials,selectedSections=[dict(i=i,sourceY=float(P[2*i,1]-H[1]),targetY=float(Q[2*i,1]-H[1]),sourceHalfWidthM=float(width0[i]),targetHalfWidthM=float(width1[i]),ratio=float(width1[i]/width0[i])) for i in [0,5,10,20,30,40,50,75,100]],pins=[ref(p) for p in ['assets-source/m2-representative-batch-v1/spec.json','assets-source/m2-representative-batch-v2/spec.json','scripts/m2-representative-head-cage-v1/head.py','assets-source/m2-head-cage-skin-domain-v1/generated/male.json','assets-source/m2-axial-shape-function-v1/generated/male-long-lean-v2/curves.json','assets-source/m2-axial-head-evaluation-v1/generated/male-long-lean-v2/mapped-endpoints.npz','output/playwright/preset-triage/male-long-lean-axial-head-v1.png','docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt']])
OUT.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:result[k] for k in ['v1v2ParametersEqual','minimumRequestedWidthRatio','maximumChinSampleDropM','mouthBottomToSkinBottomProxyM']}))
