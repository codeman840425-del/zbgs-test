"""Conservative source-only torso coverage FIT. Does not mutate/render body or clothing."""
from pathlib import Path
import json,struct,hashlib,collections
import numpy as np
from scipy.spatial import cKDTree
R=Path('F:/gamemake');ROOT=Path(__file__).resolve().parents[3];O=ROOT/'assets-source/m1/simple-skirt-v1/torso-coverage-risk-v1';O.mkdir(exist_ok=True)
assert not(O/'coverage-fit.json').exists(),'One frozen candidate, refuse overwrite'
def load(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);b=raw[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],k),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',k*dt.itemsize),dt.itemsize)).copy()
 return d,read,hashlib.sha256(raw).hexdigest()
bd,br,bsha=load(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm');td,tr,tsha=load(R/'prototype/public/assets/m1/m1-uniform-top.glb')
assert bsha=='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';assert tsha=='27bcfe020828ad2603f618fabf7f21cf1b09f66035c8ecd740e78cfc3650b9d6'
bp=bd['meshes'][0]['primitives'][0];tp=td['meshes'][0]['primitives'][0]
P=br(bp['attributes']['POSITION']);N=br(bp['attributes']['NORMAL']);BF=br(bp['indices']).reshape(-1,3);BJ=br(bp['attributes']['JOINTS_0']);BW=br(bp['attributes']['WEIGHTS_0']);T=tr(tp['attributes']['POSITION']);TF=tr(tp['indices']).reshape(-1,3);TJ=tr(tp['attributes']['JOINTS_0']);TW=tr(tp['attributes']['WEIGHTS_0']);bn=[bd['nodes'][j]['name']for j in bd['skins'][0]['joints']];tn=[td['nodes'][j]['name']for j in td['skins'][0]['joints']]
allowed={'J_Bip_C_Hips','J_Bip_C_Spine','J_Bip_C_Chest','J_Bip_C_UpperChest','J_Sec_L_Bust1','J_Sec_L_Bust2','J_Sec_R_Bust1','J_Sec_R_Bust2'}
brole=(BW*np.array([n in allowed for n in bn])[BJ]).sum(1)
forbidden={n for n in tn if any(x in n for x in ['Neck','Head','Shoulder','UpperArm'])};unsafe=(TW*np.array([n in forbidden for n in tn])[TJ]).sum(1)>.01
# Recover the existing explicit bottom fan, then its real perimeter. No virtual Y slab.
U,inv=np.unique(np.round(T,6),axis=0,return_inverse=True);WF=inv[TF];degree=np.bincount(WF.flatten());centers=np.flatnonzero(degree>=16);candidates=[]
for c in centers:
 fs=np.flatnonzero(np.any(WF==c,axis=1));n=np.cross(T[TF[fs,1]]-T[TF[fs,0]],T[TF[fs,2]]-T[TF[fs,0]]);n/=np.linalg.norm(n,axis=1)[:,None]
 if np.linalg.norm(n.mean(0))>.95 and U[c,1]<np.median(T[:,1]):candidates.append((c,fs))
assert len(candidates)==1;center,capFaces=candidates[0];ring=np.unique(WF[capFaces]);ring=ring[ring!=center];assert len(capFaces)==20 and len(ring)==20
capSet=set(map(int,capFaces));ringEdges=[]
for f in WF[capFaces]:
 e=[int(v)for v in f if v!=center];assert len(e)==2;ringEdges.append(e)
segments=U[np.array(ringEdges)];ss=segments[:,1]-segments[:,0];den=(ss*ss).sum(1)
margin=.025
# Distance to complete excluded clothing triangles, not just their vertices.
zone=T[TF[np.any(unsafe[TF],axis=1)]];za=zone[:,0];zab=zone[:,1]-za;zac=zone[:,2]-za;zn=np.cross(zab,zac);zn/=np.linalg.norm(zn,axis=1)[:,None];d00=(zab*zab).sum(1);d01=(zab*zac).sum(1);d11=(zac*zac).sum(1);zden=d00*d11-d01*d01

def zoneClearance(q):
 delta=q-za;plane=(delta*zn).sum(1);proj=delta-plane[:,None]*zn;d20=(proj*zab).sum(1);d21=(proj*zac).sum(1);u=(d11*d20-d01*d21)/np.maximum(zden,1e-30);v=(d00*d21-d01*d20)/np.maximum(zden,1e-30);inside=(u>=0)&(v>=0)&(u+v<=1)&(zden>1e-20)
 best=float(np.min(np.where(inside,abs(plane),np.inf)))
 for a,b in [(0,1),(1,2),(2,0)]:
  st=zone[:,a];dv=zone[:,b]-st;tt=np.clip(((q-st)*dv).sum(1)/np.maximum((dv*dv).sum(1),1e-30),0,1);best=min(best,float(np.linalg.norm(st+tt[:,None]*dv-q,axis=1).min()))
 return best

def clearance(q):
 t=np.clip(np.sum((q-segments[:,0])*ss,axis=1)/den,0,1);return float(np.linalg.norm(segments[:,0]+t[:,None]*ss-q,axis=1).min())
tri=T[TF];e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0];norm=np.cross(e1,e2);norm/=np.linalg.norm(norm,axis=1)[:,None]
topUnsafe=np.any(unsafe[TF],axis=1);topUnsafe[list(capSet)]=True

def ray(q,d):
 h=np.cross(np.broadcast_to(d,e2.shape),e2);a=np.einsum('ij,ij->i',e1,h);valid=abs(a)>1e-10;f=np.zeros(len(a));f[valid]=1/a[valid];s=q-tri[:,0];u=f*np.einsum('ij,ij->i',s,h);qq=np.cross(s,e1);v=f*(qq@d);dist=f*np.einsum('ij,ij->i',e2,qq)
 ok=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(dist>.0001)&(dist<=.03)&((norm@d)>.15)&~topUnsafe
 ids=np.flatnonzero(ok)
 if not len(ids):return None
 i=int(ids[np.argmin(dist[ids])]);return {'topFace':i,'distanceM':float(dist[i]),'point':(q+dist[i]*d).tolist()}
vertexCandidates=np.flatnonzero(brole>=.999);vertexChecks={}
for i in vertexCandidates:
 q=P[i];nm=N[i]/np.linalg.norm(N[i]);neck=zoneClearance(q);hem=clearance(q)
 if neck>=margin and hem>=margin:
  hit=ray(q,nm)
  if hit:vertexChecks[int(i)]={'neckSleeveZoneDistanceM':neck,'hemRingDistanceM':hem,'hit':hit}
faceCandidates=[i for i,f in enumerate(BF)if all(int(v)in vertexChecks for v in f)];bary=np.array([[1/3]*3,[.5,.5,0],[0,.5,.5],[.5,0,.5]]);accepted={}
for fi in faceCandidates:
 f=BF[fi];checks=[];ok=True
 for bc in bary:
  q=bc@P[f];nm=bc@N[f];nm/=np.linalg.norm(nm);neck=zoneClearance(q);hem=clearance(q);hit=ray(q,nm)if neck>=margin and hem>=margin else None
  if hit is None:ok=False;break
  checks.append({'barycentric':bc.tolist(),'neckSleeveZoneDistanceM':neck,'hemRingDistanceM':hem,'hit':hit})
 if ok:accepted[fi]=checks
# Keep the anatomically central connected component; landmarks identify the intended band, not a two-face patch.
edgeFaces=collections.defaultdict(list)
for f in accepted:
 for a,b in [(0,1),(1,2),(2,0)]:edgeFaces[tuple(sorted([int(BF[f,a]),int(BF[f,b])]))].append(f)
adj={f:set()for f in accepted}
for fs in edgeFaces.values():
 for f in fs:adj[f].update(fs)
assert 610 in accepted and 657 in accepted,'Landmarks not admitted; report scope failure without relaxing bounds'
seen={610};stack=[610]
while stack:
 f=stack.pop()
 for n in adj[f]-seen:seen.add(n);stack.append(n)
assert 657 in seen,'Requested two torso points are not in one admitted central band'
faces=sorted(seen);active=set(faces);bound=[]
for edge,fs in edgeFaces.items():
 if sum(f in active for f in fs)==1:bound.append(list(edge))
vertices=np.unique(BF[faces]);detail={str(f):{'vertices':BF[f].tolist(),'vertexSamples':[vertexChecks[int(v)]for v in BF[f]],'interiorSamples':accepted[f]}for f in faces}
report={'schema':'zbgs-outfit-body-coverage-candidate.1','id':'m1a-uniform-top-central-torso-coverage-risk-v1','status':'source-only-candidate; disabled until action validation','newFitNotRestoredMask':True,'avatarSha256':bsha,'topId':'m1-uniform-top','topSha256':tsha,'bodyMesh':'Body.baked','bodyMeshIndex':0,'bodyPrimitive':0,'bodyMaterial':'F00_001_01_Body_00_SKIN','bodyIndexAccessorSha256':hashlib.sha256(br(bp['indices']).tobytes()).hexdigest(),'bodyIndexComponentType':bd['accessors'][bp['indices']]['componentType'],'bodyFaceCount':len(BF),'selectedFaceIds':faces,'selectedTriangles':BF[faces].tolist(),'selectedVertices':vertices.tolist(),'sourceBoundaryEdges':bound,'originalBodyAndTopModified':False,'restorePolicy':'keep untouched body geometry; select render indices only for this exact equipped top; unequip/body preview restores complete original indices; collision/diagnostic body remains full','method':{'bodyAllowedBones':sorted(allowed),'minBodyAllowedWeight':.999,'topBoundaryExcludedBones':sorted(forbidden),'topBoundaryWeightThreshold':.01,'topExcludedBoundaryFaceIds':np.flatnonzero(np.any(unsafe[TF],axis=1)).tolist(),'boundaryDistanceMethod':'exact point-to-triangle for entire excluded clothing zones; point-to-segment for actual hem perimeter','boundaryMarginM':margin,'realHemCapFaces':capFaces.tolist(),'realHemRingWeldVertices':ring.tolist(),'realHemRingSegments':segments.tolist(),'outwardRayMinM':.0001,'outwardRayMaxM':.03,'outwardNormalDotMin':.15,'samplesPerFace':7,'componentSeedFaces':[610,657],'reasonForSemanticBoundary':'Top is a closed shell. Exclude entire neck/head/shoulder/upper-arm weighted clothing zones instead of claiming nonexistent open topology edges. Actual20-point hem perimeter comes from original cap fan.','notYSlab':True},'summary':{'selectedFaces':len(faces),'selectedVertices':len(vertices),'bounds':[P[vertices].min(0).tolist(),P[vertices].max(0).tolist()],'bodyFacesExcludedBySemantic':int(np.count_nonzero(np.any(brole[BF]<.999,axis=1))),'sourceSafeVertices':len(vertexChecks),'sourceSafeFacesAllComponents':len(accepted)},'pending':['full stand/walk/run/turn/sit-rise/dance source material coverage at actual body/top final matrices','actual motion must keep every selected body face fully covered at neckline/cuff/hem;25mm is source selection allowance, not an animated acceptance threshold','normal direction, back/side oblique views and all exposed-skin openings','top switching/unequip/body preview restores full original body','same instance identity and independent second actor','no arbitrary new body/top/variant inherits coverage','finite seven-point rest sampling is not a continuous triangle containment proof'], 'sourceSelectionSamples':detail}
(O/'source-selection-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');fit={k:v for k,v in report.items()if k!='sourceSelectionSamples'};fit['sourceSelectionReport']='source-selection-report.json';fit['sourceSelectionReportSha256']=hashlib.sha256((O/'source-selection-report.json').read_bytes()).hexdigest();(O/'coverage-fit.json').write_text(json.dumps(fit,indent=2)+'\n',encoding='utf-8');print(json.dumps({'summary':report['summary'],'indexSha':report['bodyIndexAccessorSha256'],'landmarks':all(f in faces for f in [610,657]),'maxDistance':max(h['hit']['distanceM']for f in detail.values()for h in f['vertexSamples']+f['interiorSamples'])}))
