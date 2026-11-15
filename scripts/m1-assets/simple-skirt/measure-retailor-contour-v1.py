"""Measure one inherited hem contour's required exits, not a new candidate or optimizer."""
from pathlib import Path
import ast,struct,gzip,json,hashlib
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'local-retailor-v1'
assert not (O/'hem-contour-space.json').exists()
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load']);reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed'])
a=asset(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb');P=a['P'];F=a['F'];cp=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz';cap=json.loads(gzip.decompress(cp.read_bytes()));lookup={};w=[];first=[]
for i,p in enumerate(np.round(P,7)):
 k=tuple(p)
 if k not in lookup:lookup[k]=len(lookup);first.append(i)
 w.append(lookup[k])
WF=np.array(w)[F];E=np.sort(np.concatenate([WF[:,[0,1]],WF[:,[1,2]],WF[:,[2,0]]]),axis=1);edges,n=np.unique(E,axis=0,return_counts=True);hem=np.array([e for e in edges[n==1]if all(P[first[j],1]<.975 for j in e)]);ids=np.unique(np.array(first)[hem]);srcEdges=np.array(first)[hem];hi=a['names'].index('J_Bip_C_Hips');rows=[]
for no in [1,29,35,60]:
 fr=cap['frames'][no-1];H=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T@a['inv'][hi];inv=np.linalg.inv(H);body=next(m for m in fr['colliders']if m['name']=='Bodybaked');B=(np.c_[np.array(body['positions']).reshape(-1,3),np.ones(len(body['positions'])//3)]@inv.T)[:,:3];BF=np.array(body['triangles']).reshape(-1,3);bt=BVHTree.FromPolygons(B.tolist(),BF.tolist(),all_triangles=True);samples=[]
 for vi in ids:
  p=P[vi];q,n,f,d=bt.find_nearest(p);signed=float(np.dot(p-q,n));r={'vertex':int(vi),'source':p.tolist(),'nearestSignedM':signed,'nearestDistanceM':float(d),'bodyFace':f,'rays':{}}
  for label,direction,limit in [('up',np.array([0.,1.,0.]),max(0.,.975-p[1])),('outward',np.array([p[0],0.,p[2]])/max(np.linalg.norm(p[[0,2]]),1e-12),.08)]:
   pos=p.copy();done=0.;hits=[]
   for _ in range(20):
    hit,normal,face,dist=bt.ray_cast(pos,direction,max(0.,limit-done))
    if hit is None:break
    along=float(np.dot(normal,direction));hits.append({'distanceM':done+float(dist),'bodyFace':face,'outwardNormalCosine':along})
    done+=float(dist)+1e-6;pos=p+direction*done
    if done>=limit:break
   exits=[v for v in hits if v['outwardNormalCosine']>1e-4]
   needed=max([v['distanceM']+.0024/v['outwardNormalCosine']for v in exits],default=0.)
   # Only a local ray witness. A clear endpoint does not prove adjacent new triangles clear.
   r['rays'][label]={'limitM':float(limit),'hits':hits,'lastExitPlusReserveM':needed,'withinBound':bool(needed<=limit),'endpoint':(p+direction*needed).tolist(),'originalAlreadyLocallyOutside':signed>=.0024}
  samples.append(r)
 rows.append({'frame':no,'samples':samples})
report={'status':'diagnostic-contour-only','sourceSha256':a['sha'],'captureSha256':hashlib.sha256(cp.read_bytes()).hexdigest(),'hemVertices':ids.tolist(),'hemEdges':srcEdges.tolist(),'sourceHemLengthM':float(np.linalg.norm(P[srcEdges[:,0]]-P[srcEdges[:,1]],axis=1).sum()),'sourceHemYRangeM':[float(P[ids,1].min()),float(P[ids,1].max())],'sourceHemSourceBounds':[P[ids].min(0).tolist(),P[ids].max(0).tolist()],'rows':rows,'limits':['Up rays preserve old hem xz; outward rays preserve y. These are two diagnostic construction directions, not a parameter sweep or proof of global minimal movement.','All body faces including hands remain. Individual tangent-ray reserve may exceed the fixed domain; not interpreted as true minimum fit change.','Old hem positions are evaluated in hips frame because the local source is Hips-bound. Weights checked in summary; no new weights made.','No triangle/pattern length acceptance, no new asset, no runtime or nativecloth.']}
report['allHemHipsWeightMin']=float(np.min(np.sum(a['W'][ids]*(a['J'][ids]==hi),axis=1)))
(O/'hem-contour-space.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'hemVertices':len(ids),'hemEdges':len(hem),'sourceHemY':report['sourceHemYRangeM'],'lengthM':report['sourceHemLengthM'],'hipsWeightMin':report['allHemHipsWeightMin'],'frames':[{'frame':r['frame'],'insideVertices':sum(s['nearestSignedM']<0 for s in r['samples']),'maxRequiredUpM':max(s['rays']['up']['lastExitPlusReserveM']for s in r['samples']),'upExceedsDomain':sum(not s['rays']['up']['withinBound']for s in r['samples']),'maxRequiredOutwardM':max(s['rays']['outward']['lastExitPlusReserveM']for s in r['samples'])}for r in rows]}))
