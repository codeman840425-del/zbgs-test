"""Fixed old-operator peak and expanded-domain boundary evidence; no parameter scan."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,heapq
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/mouth-visible-v2'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
inspection=json.loads((BASE/'inspection.json').read_text(encoding='utf-8'));rows=[]
for rec in inspection['results']:
 sex=rec['sex'];old=GLB(ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm');new=GLB(BASE/f'generated/{sex}-mouth-width-112-v2/avatar.vrm');r=json.loads((BASE/f'{sex}-mouth-width.recipe.json').read_text(encoding='utf-8'));m=old.doc['meshes'][1];p=m['primitives'][0];np0=new.doc['meshes'][1]['primitives'][0];pos=old.acc(p['attributes']['POSITION']).astype(float);qnew=new.acc(np0['attributes']['POSITION']).astype(float);peak=rec['worstOriginal8mmPlus12'][0];ti=m['extras']['targetNames'].index(peak['shape']);q=pos+old.acc(p['targets'][ti]['POSITION']);n=qnew+new.acc(np0['targets'][ti]['POSITION']);ids=np.array(peak['vertices']);a=np.cross(q[ids[1]]-q[ids[0]],q[ids[2]]-q[ids[0]]);b=np.cross(n[ids[1]]-n[ids[0]],n[ids[2]]-n[ids[0]]);angle=float(np.degrees(np.arccos(np.clip(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)),-1,1))))
 skin=next(p for p in m['primitives']if old.doc['materials'][p['material']]['name'].endswith('SKIN'));tri=old.acc(skin['indices']).reshape(-1,3);adj={int(i):{}for i in np.unique(tri)}
 for t in tri:
  for a in t:
   for b in t:
    if a!=b:adj[int(a)][int(b)]=float(np.linalg.norm(pos[a]-pos[b]))
 ring=[a for a,b in r['mouthBoundaryPairs']];d={i:0. for i in ring};queue=[(0.,i)for i in ring];heapq.heapify(queue)
 while queue:
  v,i=heapq.heappop(queue)
  if v!=d[i]:continue
  for j,L in adj[i].items():
   nv=v+L
   if nv<.04 and nv<d.get(j,1):d[j]=nv;heapq.heappush(queue,(nv,j))
 distances=[]
 for folder,suffix,key in [('face-nose-parameters-v1','nose','translationVectors'),('face-eye-sample-v1','eye','xScale')]:
  z=json.loads((ROOT/f'assets-source/{folder}/{sex}-{suffix}.recipe.json').read_text(encoding='utf-8'));v=np.array(z[key]);other=np.flatnonzero(np.linalg.norm(v,axis=1)>0)if v.ndim==2 else np.flatnonzero(abs(v-1)>1e-12);values=[d[i]for i in other if i in d];distances.append({'domain':suffix,'nearestWithin40mmM':min(values)if values else None,'within24mmCount':sum(x<.024 for x in values)})
 rows.append({'sex':sex,'oldOperatorPeak':peak,'sameTriangleNewOperatorAngleDeg':angle,'sameTriangleNewWeights':np.array(r['weights'])[ids].tolist(),'sameTriangleNewAreaMm2':float(np.linalg.norm(np.cross(n[ids[1]]-n[ids[0]],n[ids[2]]-n[ids[0]]))*.5e6),'domainDistances':distances})
(BASE/'transition-diagnosis.json').write_text(json.dumps({'choice':'One 24mm smooth geodesic fade, selected by 3x parameter amplitude versus old 8mm. This is not a proof of bounded strain in every expression.','results':rows},indent=2)+'\n',encoding='utf-8');print(json.dumps([{'sex':x['sex'],'oldAngle':x['oldOperatorPeak']['angleDeg'],'sameTriangleNewAngle':x['sameTriangleNewOperatorAngleDeg'],'newWeights':x['sameTriangleNewWeights'],'distances':x['domainDistances']}for x in rows],indent=2))
