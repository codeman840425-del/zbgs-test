"""One authored seated-hem lift: finite body support, original weights, fixed upper edge."""
from pathlib import Path
import ast,struct,gzip,json,hashlib
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'top-hem-corrective-v1';O.mkdir(exist_ok=True)
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed']);a=asset(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');cp=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz';cap=json.loads(gzip.decompress(cp.read_bytes()));fr=cap['frames'][59];P=posed(a,fr);F=a['F'];ids=np.flatnonzero(a['P'][:,1]<.98);index={int(v):i for i,v in enumerate(ids)};af=np.flatnonzero(np.any(np.isin(F,ids),axis=1));body=next(m for m in fr['colliders']if m['name']=='Bodybaked');BP=np.array(body['positions']).reshape(-1,3);BF=np.array(body['triangles']).reshape(-1,3);bt=BVHTree.FromPolygons(BP.tolist(),BF.tolist(),all_triangles=True);topTree=BVHTree.FromPolygons(P.tolist(),F.tolist(),all_triangles=True);crossed={i for i,j in topTree.overlap(bt)if i in af};A=[];rhs=[];records=[];unsupported=[];direction=np.array([0.,1.,0.]);barys=np.array([[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]])
for fi in af:
 for sample,bary in enumerate(barys):
  p=bary@P[F[fi]];near,no,face,dist=bt.find_nearest(p);signed=float(np.dot(p-near,no));offset=0.;hitRecord=None
  if signed>=.0024:continue
  if signed>=0:
   ny=float(np.dot(no,direction))
   if ny>0.15:hitRecord={'exitDistance':0.,'normalY':ny,'bodyFace':face,'requiredLift':(.0024-signed)/ny}
  else:
   for _ in range(12):
    hit,hn,hf,dis=bt.ray_cast(p+direction*offset,direction,.06-offset)
    if hit is None:break
    ny=float(np.dot(hn,direction))
    if ny>0.15:hitRecord={'exitDistance':float(offset+dis),'normalY':ny,'bodyFace':hf,'requiredLift':float(offset+dis+.0024/ny)};break
    offset+=dis+1e-6
    if offset>=.06:break
  rec={'topFace':int(fi),'sample':sample,'barycentric':bary.tolist(),'oldSigned':signed,'world':p.tolist(),'nearestBodyFace':face}
  if hitRecord is None:
   if signed<0:unsupported.append(rec)
   continue
  rec.update(hitRecord);records.append(rec);row=np.zeros(len(ids))
  for v,c in zip(F[fi],bary):
   if int(v)in index:row[index[int(v)]]+=c
  A.append(row);rhs.append(hitRecord['requiredLift'])
edges=np.unique(np.sort(np.concatenate([F[af][:,[0,1]],F[af][:,[1,2]],F[af][:,[2,0]]]),axis=1),axis=0);E=np.zeros((len(edges),len(ids)))
for i,(a0,b0)in enumerate(edges):
 if int(a0)in index:E[i,index[int(a0)]]+=1
 if int(b0)in index:E[i,index[int(b0)]]-=1
edgeOriginal=P[edges[:,0]]-P[edges[:,1]];length=np.linalg.norm(edgeOriginal,axis=1);tri=P[F[af]];base=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);area2=np.linalg.norm(base,axis=1);norm=base/area2[:,None];normalC=np.zeros((len(af),len(ids)))
for k,fi in enumerate(af):
 for corner in range(3):
  v=int(F[fi,corner])
  if v not in index:continue
  delta=np.zeros((3,3));delta[corner]=direction
  dc=np.cross(delta[1]-delta[0],tri[k,2]-tri[k,0])+np.cross(tri[k,1]-tri[k,0],delta[2]-delta[0]);normalC[k,index[v]]=dc@norm[k]
upper=np.full(len(ids),.05);upper[a['P'][ids,1]>=.975]=0
np.savez_compressed(O/'author-constraints.npz',source=a['P'],posed=P,faces=F,ids=ids,affectedFaces=af,A=np.array(A),rhs=np.array(rhs),E=E,edgeOriginal=edgeOriginal,edgeLength=length,normalC=normalC,area2=area2,upper=upper)
report={'sourceSha256':a['sha'],'captureSha256':hashlib.sha256(cp.read_bytes()).hexdigest(),'frame':60,'authorIntent':'Lift lower hem over measured seated thigh support, smooth within original band, original weights and standingBasis unchanged','domainIds':ids.tolist(),'affectedFaces':af.tolist(),'originalLocalCrossingFaces':sorted(crossed),'supportConstraints':records,'unsupportedNegativeSamples':unsupported,'worldDisplacementLimitMetres':.05,'materialEdgeRatioLimit':1.25,'orientationProjectedAreaMinimumFraction':.2,'staticTargetClearanceMetres':.0024,'fixedUpperYAtLeast':.975,'firstStageOnly':True};(O/'author-preparation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'constraints':len(A),'unsupported':len(unsupported),'requiredLiftMinMax':[float(np.min(rhs)),float(np.max(rhs))],'fixedVertices':int(np.sum(upper==0))}))
