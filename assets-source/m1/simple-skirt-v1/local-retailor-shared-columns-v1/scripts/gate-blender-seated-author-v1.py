"""Single standard author full original geometry gate; no edits or second author pass."""
from pathlib import Path
import ast,struct,json,gzip,hashlib
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'blender-seated-author-v1'
assert not(O/'geometry-gate.json').exists()
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
def load(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);buf=raw[28+n:];types={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 def view(index,count,width,dt,off=0):
  v=d['bufferViews'][index];dt=np.dtype(dt);return np.ndarray((count,width),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+off,strides=(v.get('byteStride',width*dt.itemsize),dt.itemsize)).copy()
 def read(i):
  a=d['accessors'][i];w=widths[a['type']];result=view(a['bufferView'],a['count'],w,types[a['componentType']],a.get('byteOffset',0))if 'bufferView'in a else np.zeros((a['count'],w),dtype=types[a['componentType']])
  if 'sparse'in a:
   sp=a['sparse'];si=sp['indices'];sv=sp['values'];ids=view(si['bufferView'],sp['count'],1,types[si['componentType']],si.get('byteOffset',0)).reshape(-1);vals=view(sv['bufferView'],sp['count'],w,types[a['componentType']],sv.get('byteOffset',0));result[ids]=vals
  return result
 return raw,d,read
reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed','tree']);reuse(R/'scripts/m1-assets/simple-skirt/gate-private-layer-initial.py',['point_tri','seg_seg','near_minimum'])
source=asset(S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb');path=O/'m1-sixfold-skirt-seated-author-v1.glb';candidate=asset(path);raw,d,read=load(path);cap=json.loads(gzip.decompress((S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()));fr=cap['frames'][59];morph=np.concatenate([read(p['targets'][0]['POSITION'])for p in d['meshes'][0]['primitives']]);morphNormal=np.concatenate([read(p['targets'][0]['NORMAL'])for p in d['meshes'][0]['primitives']]);cp=candidate['P'].copy();candidate['P']=cp+morph;Q=posed(candidate,fr,True);candidate['P']=cp;Q0=posed(candidate,fr,True);stages=np.load(O/'author-stages.npz');target=stages['final'];P=source['P'];F=source['F'];mapping=[];used=set()
for i,p in enumerate(cp):
 ds=np.linalg.norm(P-p,axis=1);choices=np.flatnonzero(ds<2e-6);choices=[j for j in choices if int(j)not in used];assert choices,(i,float(ds.min()));j=int(choices[0]);used.add(j);mapping.append(j)
mapping=np.array(mapping);assert len(used)==len(P);faceMap={}
for i,f in enumerate(F):faceMap.setdefault(tuple(sorted(f)),[]).append(i)
lineage=[]
for f in candidate['F']:
 key=tuple(sorted(mapping[f]));assert key in faceMap and faceMap[key];lineage.append(faceMap[key].pop(0))
replay=float(np.linalg.norm(Q-target[mapping],axis=1).max());assert replay<3e-6,replay
world=np.empty_like(Q);world[mapping]=Q;basisWorld=np.empty_like(Q0);basisWorld[mapping]=Q0;np.savez_compressed(O/'actual-export-replay.npz',world=world,basisWorld=basisWorld,faces=F,candidateVertexToSource=mapping,candidateFaceToSource=np.array(lineage));ct=tree(world,F);contacts=[]
topPath=S/'top-hem-corrective-v1/m1-uniform-top-open-hem-seated-corrective-v1.glb';top=asset(topPath);tb,td,tr=load(topPath);top['P']=top['P']+np.concatenate([tr(p['targets'][0]['POSITION'])for p in td['meshes'][0]['primitives']]);topWorld=posed(top,fr)
for name,pts,faces in [('Bodybaked',np.array(fr['colliders'][0]['positions']).reshape(-1,3),np.array(fr['colliders'][0]['triangles']).reshape(-1,3)),('ExperimentalTopCorrective',topWorld,top['F'])]:
 pairs=sorted(ct.overlap(tree(pts,faces)));near={'distanceMetres':0.}if pairs else near_minimum(world[F],pts[faces],range=.003);contacts.append({'name':name,'count':len(pairs),'pairs':pairs,'min':near})
for box in fr['chair']:
 lo=box['min'];hi=box['max'];pts=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);bf=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=sorted(ct.overlap(tree(pts[:,:3],bf)));contacts.append({'name':box['name'],'count':len(pairs),'pairs':pairs})
lookup={};w=[]
for p in np.round(P,7):lookup.setdefault(tuple(p),len(lookup));w.append(lookup[tuple(p)])
wf=np.array(w)[F];selfpairs=[(i,j)for i,j in ct.overlap(ct)if i<j and not(set(wf[i])&set(wf[j]))];edges=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0);length=lambda p:np.linalg.norm(p[edges[:,0]]-p[edges[:,1]],axis=1);area=lambda p:np.linalg.norm(np.cross(p[F[:,1]]-p[F[:,0]],p[F[:,2]]-p[F[:,0]]),axis=1)*.5;er=length(world)/length(P);ar=area(world)/area(P);worst=int(er.argmax());fixed=stages['fixed'];result={'status':'rejected'if any(c['count']for c in contacts)or selfpairs or er.max()>1.25 or area(world).min()<1e-12 else'single-pose-source-gate-only','sourceSha256':source['sha'],'candidateSha256':candidate['sha'],'topInputSha256':hashlib.sha256(tb).hexdigest(),'topInputStillRejected2p4mmAndPants':True,'frame':60,'contacts':contacts,'selfPairs':selfpairs,'selfCount':len(selfpairs),'sourceEdgeRatioMinMax':[float(er.min()),float(er.max())],'sourceAreaRatioMinMax':[float(ar.min()),float(ar.max())],'worstEdge':{'render':edges[worst].tolist(),'sourceLengthMetres':float(length(P)[worst]),'targetLengthMetres':float(length(world)[worst])},'minimumTriangleAreaM2':float(area(world).min()),'fixedTargetResidualMetres':float(np.linalg.norm(world[fixed]-stages['originalSeated'][fixed],axis=1).max()),'standardExportTargetReplayMaxMetres':replay,'standardExportBasisReplayMaxMetres':float(np.linalg.norm(basisWorld-stages['originalSeated'],axis=1).max()),'morphNormalPresent':True,'morphNormalMaximumDelta':float(np.linalg.norm(morphNormal,axis=1).max()),'exportVertexFaceCounts':[len(cp),len(candidate['F'])],'limits':['No nativecloth, no repeated author parameters, no runtime driver','Complete original renderfaces including inner return checked; no collision face exclusions','Normals are exported by standard BlenderglTF with shape keys; material shading still needs actualGPU view','Whole contact gate unchanged; topinput carries its independent prior failure','3D face normal rotations can represent intended folds, not automatically classified as flipped; degeneracy/self/material reported']};(O/'geometry-gate.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');(O/'export-lineage.json').write_text(json.dumps({'candidateVertexToSource':mapping.tolist(),'candidateFaceToSource':lineage},indent=2)+'\n',encoding='utf-8');print(json.dumps({k:result[k]for k in ['status','selfCount','sourceEdgeRatioMinMax','sourceAreaRatioMinMax','worstEdge','fixedTargetResidualMetres','standardExportTargetReplayMaxMetres','standardExportBasisReplayMaxMetres']}));print([(c['name'],c['count'])for c in contacts])
