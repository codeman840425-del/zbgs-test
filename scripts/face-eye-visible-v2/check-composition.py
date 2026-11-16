"""Bounded four-domain endpoint composition on all authored shapes + fixed live weights.
Array-only source contract screen, not game/gaze/render acceptance.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import json,sys,hashlib,ast
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-visible-v2'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
tree=ast.parse(Path(__file__).with_name('audit.py').read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='quality'],type_ignores=[]),'audit-quality-only','exec'))
rows=[];dependencies=[];failures=[]
for sex in ['female','male']:
 paths={k:ROOT/f'assets-source/{pkg}/{sex}-{suffix}.recipe.json'for k,pkg,suffix in [('mouth','mouth-visible-v2','mouth-width'),('brow','face-brow-visible-v2','brow'),('nose','face-nose-visible-v2','nose'),('eye','face-eye-visible-v2','eye')]};R={k:json.loads(p.read_text(encoding='utf-8'))for k,p in paths.items()};dependencies.extend({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)}for p in paths.values());g=GLB(ROOT/f'prototype/public/assets/foundation/base-{sex}-roundtrip.vrm');m=g.doc['meshes'][1];p=m['primitives'][0];pos=g.acc(p['attributes']['POSITION']).astype(float);tri=np.concatenate([g.acc(pr['indices']).reshape(-1,3)for pr in m['primitives']]);names=m['extras']['targetNames'];deltas=[g.acc(t['POSITION']).astype(float)for t in p['targets']]
 def shape(suffix):return deltas[next(i for i,n in enumerate(names)if n.endswith('_Fcl_'+suffix))]
 targetids=np.unique(np.concatenate([g.acc(pr['indices']).reshape(-1)for pr in m['primitives']if any(k in g.doc['materials'][pr['material']]['name']for k in ['Face_00_SKIN','EyeWhite','FaceEyeline','FaceEyelash'])]));eyejoy=shape('EYE_Joy').copy();mask=np.ones(len(pos),dtype=bool);mask[targetids]=False;eyejoy[mask]=0
 shapes=[('Basis',pos)]+[(n,pos+d)for n,d in zip(names,deltas)]
 # Fixed original runtime event previously exposed existing Joy+blink overlap.
 # Compatibility applies -happy*blink EYE_Joy only to the four targeted roles.
 for label,correct in [('live-legacy-h.65-b.999-aa.512',False),('live-fixed-h.65-b.999-aa.512',True)]:
  q=pos+.65*shape('ALL_Joy')+.999*shape('EYE_Close')+.512*shape('MTH_A')
  if correct:q-=.65*.999*eyejoy
  shapes.append((label,q))
 def operation(q,key,amount):
  r=R[key];n=q.copy()
  if key=='mouth':n[:,0]=r['centerX']+(q[:,0]-r['centerX'])*(1+amount*np.array(r['weights']))
  elif key=='brow':n+=.003*(np.array(r['heightVectors'])+np.array(r['spacingVectors']))
  elif key=='nose':n+=np.array(r['translationVectors'])
  else:n[:,0]=np.array(r['centerX'])+(q[:,0]-np.array(r['centerX']))*np.array(r['xScale'])
  return n
 for amount in [-.12,.12]:
  results=[]
  for name,q in shapes:
   n=q.copy()
   for key in ['mouth','brow','nose','eye']:n=operation(n,key,amount)
   reverse=q.copy()
   for key in ['eye','nose','brow','mouth']:reverse=operation(reverse,key,amount)
   commute=float(np.abs(n-reverse).max());geom=quality(q,n,tri);mouthpairs=np.array(R['mouth']['mouthBoundaryPairs']);eyepairs=np.array(R['eye']['skinWhitePairs']);mgap=float(np.linalg.norm(n[mouthpairs[:,0]]-n[mouthpairs[:,1]],axis=1).max());egap=float(np.linalg.norm(n[eyepairs[:,0]]-n[eyepairs[:,1]],axis=1).max())
   if geom['newDegenerateTriangles']or geom['newNormalReversals']or commute>1e-10 or mgap>1e-7 or egap>1e-7:failures.append({'sex':sex,'mouth':amount,'shape':name,'quality':geom,'commuteErrorM':commute,'mouthGapM':mgap,'eyeGapM':egap})
   results.append({'name':name,'commuteErrorM':commute,'mouthSeamMaxM':mgap,'eyeWhiteSeamMaxM':egap,**geom})
  rows.append({'sex':sex,'mouth':amount,'brow':[.003,.003],'nose':.002,'eyeFactor':1.05,'shapes':results})
r={'scope':'Two combined geometric endpoint states per original body; authored absolute shapes plus one fixed legacy/corrected live mixture. Not arbitrary expression, normal rendering, gaze, or visual admission.','scriptSha256':sha(Path(__file__)),'runtimeCompatibilitySource':{'path':'prototype/src/eye-blink-compatibility.js','sha256':sha(ROOT/'prototype/src/eye-blink-compatibility.js')},'dependencies':dependencies,'rows':rows,'failures':failures,'arrayCompositionPassed':not failures,'runtimeAdmitted':False};(BASE/'composition-check.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'cases':len(rows),'shapes':sum(len(x['shapes'])for x in rows),'failures':failures,'maximumGeometryNormalChangeDegrees':max(s['maxTriangleNormalChangeDegrees']for x in rows for s in x['shapes'])},indent=2));assert not failures
