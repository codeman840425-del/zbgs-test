"""Offline source envelope and historical actual-skinned-pose checks.
No controller replay: old rails are assessed as geometric coverage only.
"""
import hashlib,importlib.util,json,pathlib
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/forearm-collision-v1'
spec=importlib.util.spec_from_file_location('profile_builder',pathlib.Path(__file__).with_name('build-forearm-collision-profile.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

def clearance(points,a,b,p):
 axis=b-a;length=np.linalg.norm(axis);axis/=length;d=points-a;u=d@axis/length
 rr=np.linalg.norm(d-u[:,None]*length*axis,axis=1)
 r=np.interp(u,[x['t']for x in p['knots']],[x['radius']for x in p['knots']])
 cone=np.where((u>=0)&(u<=1),rr-r,np.inf)
 return np.minimum(cone,np.minimum(np.linalg.norm(points-a,axis=1)-p['elbowCap']['radius'],np.linalg.norm(points-b,axis=1)-p['wristCap']['radius']))

def rigid(source,target):
 ac=source.mean(axis=0);bc=target.mean(axis=0);u,sv,vt=np.linalg.svd((source-ac).T@(target-bc));rot=u@vt
 if np.linalg.det(rot)<0:u[:,-1]*=-1;rot=u@vt
 trans=bc-ac@rot;res=np.linalg.norm(source@rot+trans-target,axis=1)
 assert sv[-1]>1e-8,'Degenerate rigid fit'
 return rot,trans,{'samples':len(source),'maxResidual':float(res.max()),'rmsResidual':float(np.sqrt(np.mean(res**2))),'singularValues':sv.tolist()}

results=[]
for sex in ['female','male']:
 src=g.load(sex);p=json.loads((OUT/(sex+'.json')).read_text());assert p['bodySHA256']==src['sha']
 for arm in p['profiles']:
  side=arm['side'];lower,a,b,axis,length,weights,faces,ids,u,rad=g.prepare(src,side)
  # All vertices and barycentric face interior grid; complements generator bound.
  tri=src['pos'][src['tri'][faces]];samples=[]
  for i in range(9):
   for j in range(9-i): samples.append(tri[:,0]*(i/8)+tri[:,1]*(j/8)+tri[:,2]*(1-(i+j)/8))
  samples=np.concatenate(samples);c=clearance(samples,a,b,arm)
  assert c.max()<1e-10,(sex,side,c.max())
  results.append({'body':sex,'side':side,'sourceSHA256':src['sha'],'triangles':len(faces),'sampleCount':len(samples),'maxOutsideEnvelope':float(max(0,c.max())),'largestOvercoverageAtSample':float(-c.min())})

C=ROOT/'experiments/skirt-offline-corrective/capture-ca72ada827d2';capture=json.loads((C/'capture.json').read_text());block=json.loads((ROOT/'assets-source/m1/offline-corrective/ring-cage-v1/source-arm-blocker.json').read_text())
src=g.load('female');profile=json.loads((OUT/'female.json').read_text());assert src['sha']==block['bodySHA256']==capture['identity']['primary']['actualSha256']
rows=capture['topology']['colliders'];off=0
for row in rows:
 if row['name']=='Bodybaked':break
 off+=row['vertexCount']
assert np.array_equal(src['tri'],np.array(row['triangles']).reshape(-1,3))
count=sum(x['vertexCount']for x in rows);positions=np.memmap(C/'colliders.f32',dtype='<f4',mode='r',shape=(len(capture['frames']),count,3))
arm=profile['profiles'][0];lower,a,b,axis,length,weights,faces,ids,u,rad=g.prepare(src,'left')
pure=np.flatnonzero((weights>1-1e-6)&np.isin(np.arange(len(weights)),ids))
frames=[]
for f in block['frames']:
 xyz=positions[f['frame']-1,off:off+row['vertexCount']].astype(float)
 rot,trans,fit=rigid(src['pos'][pure],xyz[pure]);assert fit['maxResidual']<1e-5,fit
 elbow=a@rot+trans;wrist=b@rot+trans;direction=(wrist-elbow);direction/=np.linalg.norm(direction)
 rx=np.cross(direction,[0,1,0]);rx/=np.linalg.norm(rx);ry=np.cross(direction,rx)
 edges=[]
 for edge in f['fixedWaistEdges']:
  s,e=np.array(edge['worldEndpoints']);ts=np.linspace(0,1,1001);points=s+ts[:,None]*(e-s)
  nc=clearance(points,elbow,wrist,arm)
  delta=points-elbow;mu=np.clip(delta@direction/length,0,1);dist=np.linalg.norm(points-(elbow+mu[:,None]*length*direction),axis=1)
  # Generous old geometric coverage includes full circular20mm capsule, more
  # than five12mm rails; it is not the old directional projection algorithm.
  old=dist-.020
  rail=[]
  for x,y in [(0,0),(1,0),(-1,0),(0,1),(0,-1)]:
   start=elbow+.012*(rx*x+ry*y);d=points-start;t=np.clip(d@direction/length,0,1);rail.append(np.linalg.norm(points-(start+t[:,None]*length*direction),axis=1)-.008)
  edges.append({'ids':edge['simVertexIds'],'newEnvelopeMinSignedClearance':float(nc.min()),'newDetected':bool(nc.min()<0),'generousOld20mmCapsuleMinClearance':float(old.min()),'oldFiveRails8mmRadialMarginMinClearance':float(np.array(rail).min()),'outsideOld20mmCapsule':bool(old.min()>0),'edgeSamplingMaxSpacing':float(np.linalg.norm(e-s)/1000)})
 actual=xyz[src['tri'][[3556,3557,3792,3794]]].reshape(-1,3)
 posed=xyz[src['tri'][faces]]; posed_samples=np.concatenate([posed[:,0]*(i/4)+posed[:,1]*(j/4)+posed[:,2]*(1-(i+j)/4) for i in range(5) for j in range(5-i)]); pc=clearance(posed_samples,elbow,wrist,arm)
 frames.append({'posedSelectedSurfaceSamples':len(pc),'posedOutsideCount':int(sum(pc>1e-6)),'posedMaxOutside':float(max(0,pc.max())),'frame':f['frame'],'sitProgress':f['sitProgress'],'jointRecovery':'Rigid fit on actual captured pure LowerArm weighted body vertices; not stored bone matrices','rigidFit':fit,'elbowWorld':elbow.tolist(),'wristWorld':wrist.tolist(),'actualConflictFaceVertexMaxOutsideEnvelope':float(max(0,clearance(actual,elbow,wrist,arm).max())),'edges':edges})
assert all(e['newDetected'] and e['oldFiveRails8mmRadialMarginMinClearance']>0 for f in frames if f['frame']==77 for e in f['edges']),frames
assert all(not e['newDetected'] for f in frames if f['frame']!=77 for e in f['edges']),frames
report={'schema':'m1.forearm-envelope-qa.1','bindChecks':results,'historicalBuild':block['captureBuild'],'capturePositionsSHA256':capture['colliders.f32']['sha256'],'historicalFrames':frames,'limits':['Historical fixed waist edges are not the old runtime projected skirt surface.','Old comparison tests geometric coverage of five rails and a more generous20mm capsule; it does not replay railClearance directional projection or prove controller runtime missed exactly these edges.','Known frame77 actual skin/waist conflict is independent capture evidence; frames76/78 may be proximity detections.','A conservative envelope can flag proximity before real skin intersects. Male historical waist capture unavailable: bind-only verification, not male posed proof.','Small rigid-fit residual validates bone recovery on pure-weight vertices, not all mixed elbow deformation.']}
(OUT/'validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({'bindChecks':results,'frames':frames},indent=2))
