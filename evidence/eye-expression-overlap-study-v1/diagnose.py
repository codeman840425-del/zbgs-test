"""Original-source fixed expression overlap diagnosis. No model/runtime writes."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib,ast,io,gzip
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
helper=ROOT/'scripts/face-eye-sample-v1/screen-occlusion.py'
# Reuse only the frozen texture-alpha class; do NOT execute that file's audit.
tree=ast.parse(helper.read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.ClassDef)and n.name=='Alpha'],type_ignores=[]),str(helper),'exec'))
spec=json.loads((ROOT/'assets-source/face-eye-sample-v1/spec.json').read_text())
evidence=ROOT/'evidence/m2-eye-combined-844e273263a7/report.json';live=json.loads(evidence.read_text());actual=live['checks'][0]['result'];b=.998971;h=.65;a=.511979
cases={'neutral':(0,0,0),'happy':(h,0,0),'blink':(0,b,0),'mixed-half':(h,.5,a),'mixed-peak':(h,b,a),'mixed-peak-no-aa':(h,b,0),'proposed-crossfade-peak':(h*(1-b),b,a)}
bary=np.array([[1-u-v,u,v]for u in [.071828,.271828,.471828,.671828]for v in [.113141,.313141,.513141,.713141]if u+v<.95])
def skin_depth(pos,tri,q):
 front=np.full(len(q),np.inf);hitid=np.full(len(q),-1)
 for j,ids in enumerate(tri):
  t=pos[ids];v=t[1,:2]-t[0,:2];w=t[2,:2]-t[0,:2];det=v[0]*w[1]-v[1]*w[0]
  if det>=-1e-15:continue
  idx=np.flatnonzero((q[:,0]>=t[:,0].min())&(q[:,0]<=t[:,0].max())&(q[:,1]>=t[:,1].min())&(q[:,1]<=t[:,1].max()))
  if not len(idx):continue
  d=q[idx,:2]-t[0,:2];vv=(d[:,0]*w[1]-d[:,1]*w[0])/det;ww=(v[0]*d[:,1]-v[1]*d[:,0])/det;uu=1-vv-ww;z=uu*t[0,2]+vv*t[1,2]+ww*t[2,2];take=(uu>1e-10)&(vv>1e-10)&(ww>1e-10)&(z<front[idx]);front[idx[take]]=z[take];hitid[idx[take]]=j
 return q[:,2]-front,hitid
rows=[];raw=[];bodies=[]
for sex,s in spec['bodies'].items():
 path=ROOT/s['sourceVRM'];assert sha(path)==s['sourceVRMSha256'];g=GLB(path);m=g.doc['meshes'][1];p=m['primitives'][0];base=g.acc(p['attributes']['POSITION']).astype(float);names=m['extras']['targetNames'];groups={v['presetName']:v for v in g.doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']};indices={k:groups[v]['binds'][0]['index']for k,v in [('happy','joy'),('blink','blink'),('aa','a')]};delta={k:g.acc(p['targets'][i]['POSITION']).astype(float)for k,i in indices.items()};skin=next(p for p in m['primitives']if g.doc['materials'][p['material']]['name'].endswith('SKIN'));skintri=g.acc(skin['indices']).reshape(-1,3);sampler=Alpha(g);layers=[]
 for pr in m['primitives']:
  mat=g.doc['materials'][pr['material']]['name'];ids=np.unique(g.acc(pr['indices']));dj=delta['happy'][ids];db=delta['blink'][ids];both=(np.linalg.norm(dj,axis=1)>1e-8)&(np.linalg.norm(db,axis=1)>1e-8);cos=(dj[both]*db[both]).sum(1)/np.maximum(np.linalg.norm(dj[both],axis=1)*np.linalg.norm(db[both],axis=1),1e-30)
  layers.append({'material':mat,'count':len(ids),'happyMoved':int((np.linalg.norm(dj,axis=1)>1e-8).sum()),'blinkMoved':int((np.linalg.norm(db,axis=1)>1e-8).sum()),'bothMoved':int(both.sum()),'bothSameHemisphere':int((cos>0).sum()),'bothCosineMedian':float(np.median(cos))if len(cos)else None,'happyMaxM':float(np.linalg.norm(dj,axis=1).max()),'blinkMaxM':float(np.linalg.norm(db,axis=1).max()),'aaMaxM':float(np.linalg.norm(delta['aa'][ids],axis=1).max())})
  if not any(k in mat for k in ['FaceEyeline','FaceEyelash']):continue
  tri=g.acc(pr['indices']).reshape(-1,3);uv=g.acc(pr['attributes']['TEXCOORD_0']);sampleuv=np.einsum('bv,tvc->tbc',bary,uv[tri]).reshape(-1,2);visible=sampler.sample(pr['material'],sampleuv)>=.5;ref=np.einsum('bv,tvc->tbc',bary,base[tri]).reshape(-1,3)[visible]
  # Central original 60% of each layer's same-side span, not inferred lash roots.
  central=np.zeros(len(ref),bool)
  for side in [ref[:,0]<0,ref[:,0]>=0]:
   x=ref[side,0];lo,hi=x.min(),x.max();central|=side&(ref[:,0]>lo+.2*(hi-lo))&(ref[:,0]<hi-.2*(hi-lo))
  for name,(hh,bb,aa)in cases.items():
   pos=base+hh*delta['happy']+bb*delta['blink']+aa*delta['aa'];q=np.einsum('bv,tvc->tbc',bary,pos[tri]).reshape(-1,3)[visible];depth,hit=skin_depth(pos,skintri,q);has=np.isfinite(depth);occluded=depth>1e-6
   for region,mask in [('all',np.ones(len(q),bool)),('central60',central)]:
    d=depth[mask&has];rows.append({'sex':sex,'material':mat,'case':name,'region':region,'sampleCount':int(mask.sum()),'frontSkinIntersectionCount':int((mask&has).sum()),'behindSkinCount':int((mask&occluded).sum()),'behindSkinMaxM':float(max(0,d.max()))if len(d)else None,'signedDepthMedianM':float(np.median(d))if len(d)else None})
   # Complete mapped triangle samples retained; None means no front skin triangle.
   raw.append({'sex':sex,'material':mat,'case':name,'positions':q.tolist(),'centralMask':central.tolist(),'signedDepthM':[float(d)if np.isfinite(d)else None for d in depth],'skinTriangle':hit.tolist()})
  # Actual vertex displacement vectors, no invented semantic root matches.
  score=np.linalg.norm(h*delta['happy'][ids]+b*delta['blink'][ids],axis=1);key=ids[np.argsort(score)[-6:]]
  layers[-1]['largestCombinedVertices']=[{'index':int(i),'basis':base[i].tolist(),'happyDelta':delta['happy'][i].tolist(),'blinkDelta':delta['blink'][i].tolist(),'aaDelta':delta['aa'][i].tolist(),'combinedPosition':(base[i]+h*delta['happy'][i]+b*delta['blink'][i]+a*delta['aa'][i]).tolist()}for i in key]
 if sex=='female':
  for r in actual:
   inf=np.array(r['actual']['influences'][0]['values']);expected=np.zeros(len(names));expected[indices['happy']]=r['happy'];expected[indices['blink']]=r['blink'];expected[indices['aa']]=r['aa'];assert np.array_equal(inf,expected)
 bodies.append({'sex':sex,'sourcePath':s['sourceVRM'],'sourceSha256':sha(path),'groups':{k:groups[k]for k in ['joy','blink','a']},'indices':indices,'targetNames':{k:names[i]for k,i in indices.items()},'layers':layers,'femaleRecordedInfluencesMatch':True if sex=='female'else None})
deps=[Path(__file__),helper,evidence,ROOT/'prototype/src/live-presentation.js',ROOT/'prototype/node_modules/@pixiv/three-vrm-core/lib/three-vrm-core.module.js',ROOT/'scripts/m2-male-face-v1/glb.py']
report={'scope':'Original-source exact weighted morph geometry only, no endpoint or runtime changes. Female observed same-camera evidence external; male source mechanism only, not new viewing.','weights':cases,'formula':'Basis + happy*ALL_Joy + blink*EYE_Close + aa*MTH_A. No normalization across expressions.','sampleRule':'Fixed 10 barycentric points per original Eyeline/Eyelash triangle; original bilinear texture alpha>=.5. Rays from negative Z to front-facing opaque Face_SKIN. signed depth>1um means behind skin at same XY. Central60 is source same-side layer x middle60%, not transparent root correspondence.','limits':['Source frontal rays are not original screenshot camera. Only skin occlusion tested, no MToon/sorting/outline/lighting reproduction.','Counts are sparse sample points, not pixels or area. Male actual combined screenshot remains untested.','Proposed whole-happy crossfade is one analytic control counterfactual, not a tuned weight scan or implemented fix.'],'bodies':bodies,'rows':rows,'identities':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)}for p in deps]}
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
with (OUT/'samples.json.gz').open('wb')as f:
 with gzip.GzipFile(fileobj=f,mode='wb',mtime=0)as z:z.write(json.dumps(raw,separators=(',',':')).encode())
print(json.dumps([r for r in rows if r['region']=='central60'],indent=2))
