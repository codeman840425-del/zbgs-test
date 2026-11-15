"""Local re-tailoring preflight. Actual four selected frames; no solve/model edit."""
from pathlib import Path
import ast,json,gzip,struct,hashlib,time
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'local-retailor-v1';O.mkdir(exist_ok=True)
assert not (O/'space-report.json').exists(),'Refuse overwrite'
def reuse(path,names):
 t=ast.parse(path.read_text(encoding='utf-8-sig'));exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),globals())
reuse(R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py',['load'])
reuse(R/'scripts/m1-assets/simple-skirt/gate-top-fit-v1.py',['asset','posed'])
tp=R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb';sp=S/'two-quad-thirds-v1/m1-sixfold-skirt-two-quad-thirds-v1.glb';cp=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz'
top=asset(tp);skirt=asset(sp);cap=json.loads(gzip.decompress(cp.read_bytes()));F=top['F'];P=top['P'];domain=P[:,1]<.98;movable=P[:,1]<.975;af=np.any(domain[F],axis=1);mixed=np.any(movable[F],axis=1)&~np.all(movable[F],axis=1);boundary=np.unique(F[mixed][~movable[F[mixed]]]);fixedInside=np.flatnonzero(domain&~movable)
edges=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0);bedges=np.array([e for e in edges if all(x in set(boundary.tolist())for x in e)],dtype=int)
# Source seam is first20 vertices of lower primitive; stored explicit, not guessed by proximity.
seam=np.arange(skirt['counts'][0],skirt['counts'][0]+20);ref=np.linalg.inv(skirt['inv'][skirt['names'].index('J_Bip_C_Hips')]);rows=[];out={};tree=lambda p,f:BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True)
for no in [1,29,35,60]:
 fr=cap['frames'][no-1];T=posed(top,fr);K=posed(skirt,fr,True);body=next(m for m in fr['colliders']if m['name']=='Bodybaked');B=np.array(body['positions']).reshape(-1,3);BF=np.array(body['triangles']).reshape(-1,3);bt=tree(B,BF);tt=tree(T,F);kt=tree(K,skirt['F'][:120]);h=np.array(fr['bones']['J_Bip_C_Hips']).reshape(4,4).T;hinv=np.linalg.inv(h);local=lambda p:(np.c_[p,np.ones(len(p))]@hinv.T)[:,:3]
 witnesses=[]
 for i in boundary:
  q,n,f,d=bt.find_nearest(T[i]);witnesses.append({'topVertex':int(i),'bodyFace':f,'distanceM':float(d),'signedNormalM':float(np.dot(T[i]-q,n)),'world':T[i].tolist()})
 segments=[]
 for e in bedges:
  delta=T[e[1]]-T[e[0]];l=np.linalg.norm(delta);hit,n,f,d=bt.ray_cast(T[e[0]],delta/l,l)
  if hit is not None:segments.append({'topEdge':e.tolist(),'bodyFace':f,'hitWorld':list(hit)})
 # Interior-facing skin nearest is diagnostic, not finite solid penetration depth.
 near=[]
 for i in np.flatnonzero(domain):
  q,n,f,d=bt.find_nearest(T[i]);near.append({'topVertex':int(i),'bodyFace':f,'distanceM':float(d),'signedNormalM':float(np.dot(T[i]-q,n)),'world':T[i].tolist()})
 chair=[]
 for box in fr['chair']:
  lo=np.array(box['min']);hi=np.array(box['max']);mat=np.array(box['matrixWorld']).reshape(4,4).T;inv=np.linalg.inv(mat);bl=(np.c_[B,np.ones(len(B))]@inv.T)[:,:3];valid=(bl[:,0]>=lo[0])&(bl[:,0]<=hi[0])&(bl[:,2]>=lo[2])&(bl[:,2]<=hi[2]);above=valid&(bl[:,1]>=hi[1]);ids=np.flatnonzero(above);diff=bl[ids,1]-hi[1];k=np.argsort(diff)[:10];chair.append({'name':box['name'],'localMin':lo.tolist(),'localMax':hi.tolist(),'matrixWorld':box['matrixWorld'],'nearestBodyVerticesAbovePlane':[{'bodyVertex':int(ids[j]),'localVerticalGapM':float(diff[j])}for j in k],'limitation':'Projected body vertex sample to seat plane, not full triangle minimum or proof of room for cloth.'})
 row={'frame':no,'actionSeconds':fr.get('actionSeconds'),'fixedBoundarySamples':witnesses,'fixedBoundarySegmentBodyHits':segments,'originalDomainBodyPairs':[(int(i),int(j))for i,j in tt.overlap(bt)if af[i]],'originalDomainFixedYokePairs':[(int(i),int(j))for i,j in tt.overlap(kt)if af[i]],'originalHemNearestBodySamples':near,'seamWorld':K[seam].tolist(),'seamHipLocal':local(K[seam]).tolist(),'topBoundaryHipLocal':local(T[boundary]).tolist(),'hipsWorld':h.tolist(),'chairSupport':chair};rows.append(row);out.update({f'frame{no}_body':B,f'frame{no}_top':T,f'frame{no}_skirt':K})
report={'status':'measurement-only-no-source-produced','inputs':[{'path':str(p.relative_to(R)).replace(chr(92),'/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in [tp,sp,cp]],'maxTopEditableSourceY':.98,'fixedTransitionSourceYAtLeast':.975,'domainVertices':np.flatnonzero(domain).tolist(),'movableVertices':np.flatnonzero(movable).tolist(),'fixedInsideDomain':fixedInside.tolist(),'interfaceVertices':boundary.tolist(),'interfaceEdges':bedges.tolist(),'sourceDomainBounds':[P[domain].min(0).tolist(),P[domain].max(0).tolist()],'rows':rows,'limits':['Nearest signed normal is only local diagnostic, not global signed solid distance.','All captured body triangles retained; the source top has known remote intersections.','No new top contour/skirt panel was generated. Pattern lengths must be recorded against actual new panel curves before production.','Chair vertex-plane gap is not full surface clearance.','Historical58394 input, not a new current-runtime acceptance.']}
np.savez_compressed(O/'four-pose-inputs.npz',**out,topFaces=F,skirtFaces=skirt['F'],bodyFaces=BF,topSource=P,skirtSource=skirt['P'],interface=boundary,seam=seam)
(O/'space-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'domain':int(domain.sum()),'movable':int(movable.sum()),'interface':boundary.tolist(),'frames':[{'frame':r['frame'],'boundaryMin':min(w['distanceM']for w in r['fixedBoundarySamples']),'boundarySignedMin':min(w['signedNormalM']for w in r['fixedBoundarySamples']),'boundaryHits':len(r['fixedBoundarySegmentBodyHits']),'localCross':len(r['originalDomainBodyPairs'])}for r in rows]}))
