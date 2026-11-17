"""Independent array reconstruction; does not load MuJoCo, Mink or the VRM runtime."""
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
PACKAGE=Path(__file__).resolve().parent
EVIDENCE=ROOT/'evidence/vrm-mink-roundtrip-v1'
read=lambda name:json.loads((PACKAGE/name).read_bytes())
source=read('source-rig.json');fk=read('solver-roundtrip.json');replay=read('runtime-replay.json');spec=read('spec.json')
def rotation(q):
    x,y,z,w=np.array(q)/np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def transform(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape(4,4,order='F')
    m=np.eye(4);m[:3,:3]=rotation(node.get('rotation',[0,0,0,1]))@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
parents={}
for i,node in enumerate(source['sourceNodes']):
    for child in node.get('children',[]):
        assert child not in parents
        parents[child]=i
cache={}
def original_world(i):
    if i not in cache:
        local=transform(source['sourceNodes'][i]);cache[i]=(original_world(parents[i])@local if i in parents else local)
    return cache[i]
scene=np.array(source['scene']['worldMatrix']).reshape(4,4,order='F')
raw_rows=[]
for i,raw in enumerate(source['baseline']['raw']):
    expected=scene@original_world(i);actual=np.array(raw['worldMatrix']).reshape(4,4,order='F')
    raw_rows.append({'id':i,'name':raw['name'],'parentExact':raw['parentId']==parents.get(i),'worldMatrixMaxError':float(np.max(np.abs(expected-actual))),'worldPositionErrorMm':float(np.linalg.norm(expected[:3,3]-actual[:3,3])*1000)})
rest,zero,single=source['cases']
bone='leftUpperArm';r0=rest['normalized'];r1=single['normalized'];pivot=np.array(r0[bone]['worldPosition'])
parent=r0[bone]['parentSemantic'];pr=rotation(r0[parent]['worldQuaternion']);axis=pr@np.array(spec['cases'][2]['axis']);angle=spec['cases'][2]['angleRadians']
x,y,z=axis;K=np.array([[0.,-z,y],[z,0.,-x],[-y,x,0.]])
delta=np.eye(3)+np.sin(angle)*K+(1-np.cos(angle))*(K@K)
witness=[]
for s in ['leftUpperArm','leftLowerArm','leftHand']:
    expected=pivot+delta@(np.array(r0[s]['worldPosition'])-pivot)
    witness.append({'semantic':s,'expectedWorldPositionM':expected.tolist(),'actualWorldPositionM':r1[s]['worldPosition'],'errorMm':float(np.linalg.norm(expected-r1[s]['worldPosition'])*1000)})
zero_max=max(np.linalg.norm(np.array(a['worldPosition'])-b['worldPosition'])*1000 for a,b in zip(rest['raw'],zero['raw']))
C=np.array(fk['CRowMajor']);selected=source['selectedSemantics'];rows=[]
for case,expected_case in zip(fk['cases'],source['cases']):
    for s in selected:
        a=case['actualSolverFrames'][s];e=expected_case['normalized'][s]
        q=a['quaternionWXYZ'];Rsolver=rotation([q[1],q[2],q[3],q[0]])
        rows.append({'case':case['id'],'semantic':s,'positionErrorMm':float(np.linalg.norm(C.T@a['position']-e['worldPosition'])*1000),'rotationMatrixMaxError':float(np.max(np.abs(C.T@Rsolver-rotation(e['worldQuaternion']))))})
matrix_replay=max(x['matrixMaxError'] for c in replay['results'] for x in c['rawErrors'])
ok=all(x['parentExact'] for x in raw_rows) and max(x['worldPositionErrorMm'] for x in raw_rows)<=spec['positionToleranceMm'] and max(x['worldMatrixMaxError'] for x in raw_rows)<1e-10 and max(x['errorMm'] for x in witness)<=spec['positionToleranceMm'] and zero_max<=spec['positionToleranceMm'] and max(x['positionErrorMm'] for x in rows)<=spec['positionToleranceMm'] and max(x['rotationMatrixMaxError'] for x in rows)<1e-10 and matrix_replay<1e-10 and fk['status']=='passed' and replay['status']=='passed'
result={'schema':'vrm-mink-independent-array-readback-v1','status':'passed' if ok else 'failed','inputs':{n:hashlib.sha256((PACKAGE/n).read_bytes()).hexdigest() for n in ['spec.json','source-rig.json','male-arm-chain.xml','solver-roundtrip.json','runtime-replay.json']},'sourceRawNodes':raw_rows,'sourceZeroActionMaxPositionDifferenceMm':float(zero_max),'analyticSingleRotation':{'bone':bone,'axisLocal':spec['cases'][2]['axis'],'axisWorld':axis.tolist(),'angleRadians':angle,'pivotWorldM':pivot.tolist(),'rows':witness},'independentSolverFrames':rows,'runtimeAll69NodeMatrixMaxError':matrix_replay,'scope':'Independent original GLTF tree reconstruction plus Rodrigues single-bone witness and WXYZ/world-basis reversal; no new FK, IK, rendering or contacts'}
with (EVIDENCE/'array-readback.json').open('x',encoding='utf-8') as f:json.dump(result,f,indent=2,allow_nan=False)
print(json.dumps({'status':result['status'],'sourceZeroActionMaxPositionDifferenceMm':float(zero_max),'runtimeAll69NodeMatrixMaxError':matrix_replay,'analyticMaxMm':max(x['errorMm'] for x in witness)}))
raise SystemExit(0 if ok else 2)
