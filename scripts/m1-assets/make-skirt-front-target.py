"""Fit one editable seated front surface to an actual captured pose, not cloth.
Usage: python scripts/m1-assets/make-skirt-front-target.py <front-input-directory>
The output is an isolated candidate, never an equipment manifest/product edit.
"""
import hashlib, json, math, sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
CAP=Path(sys.argv[1]).resolve()
OUT=ROOT/'assets-source/m1/seated-front-v1'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
capture=read(CAP/'capture.json')
region=read(ROOT/'assets-source/m1/shape-guide-review-v1/front-region.json')
topo=read(CAP/'source-topology.json' if (CAP/'source-topology.json').exists() else ROOT/'experiments/skirt-offline-corrective/source-topology.json')
capture_sha=capture.get('originCaptureSha256',sha(CAP/'capture.json'))
assert capture['schema']=='m1.skirt-front-target-input.1'
assert capture['sourceSkirtSha256']==region['sourceSha256']==topo['sha256']
assert capture['identity']['primary']['actualSha256']=='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
assert capture['identity']['runtimeBuild']['sourceDigest']==capture['finalIdentity']['runtimeBuild']['sourceDigest']
assert not capture['errors'] and all(f['bodyVisible'] for f in capture['frames'])
assert sha(CAP/'displayed.f32')==capture['displayed.f32']['sha256']
frames=capture['frames'];stable=[i for i,f in enumerate(frames) if f['sitProgress']>.999]
assert stable,'Capture contains no fully seated frame'
frame=stable[len(stable)//2]
count=capture['topology']['displayed']['vertexCount']
world=np.fromfile(CAP/'displayed.f32',dtype='<f4').reshape(len(frames),count,3)[frame].astype(float)
hip=np.array(frames[frame]['hipWorld']).reshape(4,4).T
local=(np.column_stack([world,np.ones(count)])@np.linalg.inv(hip).T)[:,:3]
mapping=np.array(region['renderToWeld']);rest=np.array(region['referenceHipLocalPosition'])
display=np.array([local[mapping==i].mean(axis=0) for i in range(len(rest))])
mask=np.array(region['frontWeight']);select=(mask>.2)&(rest[:,2]<.03)
# Semantic X/depth parameters retain source pleat lateral offsets. The only
# new artist surface is a degree4-by2 Bezier patch, 15 editable xyz controls.
u=np.clip((rest[:,0]-rest[select,0].min())/np.ptp(rest[select,0]),0,1)
v=np.clip((.09-rest[:,1])/(.09-rest[select,1].min()),0,1)
bern=lambda n,x:np.column_stack([math.comb(n,i)*x**i*(1-x)**(n-i) for i in range(n+1)])
B=(bern(4,u)[:,:,None]*bern(2,v)[:,None,:]).reshape(len(rest),15)
W=np.sqrt(mask[select])[:,None]
controls,_,rank,_=np.linalg.lstsq(B[select]*W,display[select]*W,rcond=1e-10)
assert rank==15,'Insufficient actual front data for the editable patch'
OUT.mkdir(parents=True,exist_ok=True)
control_path=OUT/'controls.json'
if control_path.exists():
    editable=read(control_path)
    assert editable['sourceSha256']==region['sourceSha256']
    assert editable['captureJsonSha256']==capture_sha,'Controls belong to a different captured input; make a separate candidate directory'
    controls=np.array(editable['controls'],dtype=float).reshape(15,3)
    assert np.isfinite(controls).all()
else:
    editable={'schema':'zbgs-skirt-seated-front-controls-v1','sourceSha256':region['sourceSha256'],
      'captureJsonSha256':capture_sha,'coordinate':'captured seated hips local metres',
      'origin':'Weighted least-squares fit to actual displayed front, frame '+str(frames[frame]['frame']),
      'surface':'Bezier degree 4x2; edit only control xyz, preserve source identity',
      'controls':controls.reshape(5,3,3).tolist()}
    control_path.write_text(json.dumps(editable,indent=2)+'\n',encoding='utf-8')
surface=B@controls
assert np.isfinite(surface).all()
# Keep pins/boundary outside the front target explicitly untouched. Runtime
# interpolation is applied before collision constraints, not after them.
target=surface.copy();target[mask==0]=display[mask==0]
delta=target-display
assert np.max(np.abs(delta[np.array(region['pinnedWeldedIndices'])]))==0
OUT.mkdir(parents=True,exist_ok=True)
result={'schema':'zbgs-skirt-seated-front-target-v1','status':'isolated-candidate-not-visually-accepted',
 'sourceSha256':region['sourceSha256'],'solverSha256':region['solverSha256'],
 'captureBuild':capture['identity']['runtimeBuild']['shortId'],'captureJsonSha256':capture_sha,
 'captureDisplayedSha256':capture.get('originDisplayedSha256',sha(CAP/'displayed.f32')),'frame':frames[frame]['frame'],'time':frames[frame]['time'],
 'editableControlsSha256':sha(control_path),'editableControlsFile':'controls.json',
 'coordinate':'captured seated hips local metres','surface':'Bezier degree 4x2, control order u-major/v-minor',
 'controls':controls.reshape(5,3,3).tolist(),'uvParameters':np.column_stack([u,v]).tolist(),
 'targetHipLocal':target.tolist(),'frontWeight':mask.tolist(),'pinnedWeldedIndices':region['pinnedWeldedIndices'],
 'fit':{'selectedPoints':int(select.sum()),'rank':int(rank),'rmsMeters':float(np.sqrt(np.mean(np.sum(delta[select]**2,axis=1)))),
        'maxMeters':float(np.linalg.norm(delta[select],axis=1).max())},
 'limits':['One actual seated pose; full captured sequence gate required before browser comparison.',
           'No source index/UV/weights/body/pins removed. Low-frequency shape deliberately changes source front pleat profile.',
           'No cloth, self-collision guarantee, universal chair or body fit.']}
(OUT/'target.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
# Editable mesh pair retains original render vertex/face ordering and exact UV.
for label,points in [('captured-seated-basis',display),('authored-front-target',display+mask[:,None]*delta)]:
 lines=['# '+label+'; hips local metres; source SHA '+region['sourceSha256']]
 lines += ['v '+' '.join(f'{x:.10g}' for x in points[i]) for i in mapping]
 lines += ['vt '+' '.join(f'{x:.10g}' for x in uv) for uv in topo['uv']]
 lines += ['f '+' '.join(f'{i+1}/{i+1}' for i in face) for face in topo['renderTriangles']]
 (OUT/(label+'.obj')).write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'out':str(OUT),'captureBuild':result['captureBuild'],'frame':frames[frame]['frame'],'fit':result['fit']},indent=2))
