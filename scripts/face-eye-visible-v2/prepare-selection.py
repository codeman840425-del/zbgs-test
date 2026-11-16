"""Freeze one fixed +5% aperture candidate from prior read-only measurements."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-visible-v2';BASE.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
studyPath=ROOT/'assets-source/face-eye-parameters-v1/measurements.json';study=json.loads(studyPath.read_text(encoding='utf-8'));selections={};bodies={}
for sex,b in study['bodies'].items():
 source=b['source'];assert sha(ROOT/source['sourceVRM'])==source['sourceVRMSha256']and sha(ROOT/source['sourceBlend'])==source['sourceBlendSha256'];g=GLB(ROOT/source['sourceVRM']);mesh=g.doc['meshes'][b['faceMeshIndex']];p=g.acc(mesh['primitives'][0]['attributes']['POSITION']).astype(float);count=len(p);scale=np.ones(count);center=np.zeros(count);weights=np.zeros(count);sideSign=np.zeros(count,dtype=int);layerIDs={}
 def assign(i,w,c,s):
  if w<=0:return
  value=1+.05*w
  if scale[i]!=1:assert abs(scale[i]-value)<1e-12 and abs(center[i]-c)<1e-12
  scale[i]=value;center[i]=c;weights[i]=w;sideSign[i]=s
 for side,detail in b['sides'].items():
  sign=int(side);cx=detail['apertureCornerMidpoint'][0]
  for key,d in detail['skinTransitionGeodesicDistancesM'].items():
   t=float(d)/.008;assign(int(key),1-t*t*(3-2*t),cx,sign)
  for lname,rel in detail['layerRelations'].items():
   if not any(v in lname for v in ['EyeWhite','FaceEyeline','FaceEyelash']):continue
   assert set(b['layers'][lname]['bindings'])=={'J_Bip_C_Head'}
   for i in rel['sideVertices']:assign(i,1.,cx,sign)
 for pr in mesh['primitives']:
  name=g.doc['materials'][pr['material']]['name'];ids=np.unique(g.acc(pr['indices']));layerIDs[name]=ids.tolist()
  if any(v in name for v in ['EyeWhite','FaceEyeline','FaceEyelash']):
   tri=g.acc(pr['indices']).reshape(-1,3);assert np.all(np.min(sideSign[tri],axis=1)==np.max(sideSign[tri],axis=1))
  elif name!=source['skinMaterial']:assert np.all(scale[ids]==1),name
 selected=np.flatnonzero(scale!=1);protected=np.flatnonzero(scale==1);assert np.all(center[protected]==0)
 tri=np.concatenate([g.acc(pr['indices']).reshape(-1,3)for pr in mesh['primitives']]);normalDomain=np.unique(tri[np.any(np.isin(tri,selected),axis=1)])
 pairs=[pair for s in b['sides'].values()for name,layer in s['layerRelations'].items()if 'EyeWhite'in name for pair in layer['ringExactPairsBelow1um']]
 assert len(pairs)==48
 for a,c in pairs:assert scale[a]==scale[c] and center[a]==center[c] and weights[a]==1
 intersections={};refs={}
 for kind,relative in [('mouth',f'assets-source/mouth-visible-v2/{sex}-mouth-width.recipe.json'),('brow',f'assets-source/face-brow-visible-v2/{sex}-brow.recipe.json'),('nose',f'assets-source/face-nose-visible-v2/{sex}-nose.recipe.json')]:
  path=ROOT/relative;recipe=json.loads(path.read_text(encoding='utf-8'));assert recipe['baseAvatarSha256']==source['sourceVRMSha256'];refs[kind]={'path':relative,'sha256':sha(path)}
  if kind=='mouth':active=np.flatnonzero(np.array(recipe['weights'])>0)
  elif kind=='brow':active=np.flatnonzero((np.linalg.norm(recipe['heightVectors'],axis=1)+np.linalg.norm(recipe['spacingVectors'],axis=1))>0)
  else:active=np.array(recipe['changedVertices'])
  normals=np.unique(tri[np.any(np.isin(tri,active),axis=1)]);intersections[kind]={'positionVertexIntersection':np.intersect1d(active,selected).tolist(),'normalNeighborhoodIntersection':np.intersect1d(normals,normalDomain).tolist()}
  assert not intersections[kind]['positionVertexIntersection']
 predictedX=center+(p[:,0]-center)*scale;predictedShift=np.abs(predictedX-p[:,0])
 selections[sex]={'source':source,'faceMeshIndex':b['faceMeshIndex'],'sourcePosition':p.tolist(),'xScale':scale.tolist(),'centerX':center.tolist(),'weights':weights.tolist(),'sideSign':sideSign.tolist(),'selectedVertices':selected.tolist(),'protectedVertices':protected.tolist(),'normalNeighborhoodVertices':normalDomain.tolist(),'skinWhitePairs':pairs,'layerVertexIDs':layerIDs,'sides':b['sides'],'parameterIntersections':intersections,'existingRecipes':refs,'proposedMaxBasisShiftM':float(predictedShift.max()),'expectedSelectedVertices':len(selected),'expectedBasisActuallyChangedVertices':int((predictedShift>1e-8).sum())}
 bodies[sex]={**source,'expectedPositionCount':count,'expectedSelectedVertices':len(selected),'expectedBasisActuallyChangedVertices':int((predictedShift>1e-8).sum())}
 print(sex,'selected',len(selected),'actualBasis',int((predictedShift>1e-8).sum()),'normalDomain',len(normalDomain),'maxShiftMm',predictedShift.max()*1000,'intersections',intersections)
selection={'schema':'eye-source-selection-v1','readOnlyStudySha256':sha(studyPath),'factor':1.05,'bodies':selections}
(BASE/'selection.json').write_text(json.dumps(selection,indent=2)+'\n',encoding='utf-8')
spec={'schema':'face-eye-fixed-source-sample-v1','sampleId':'aperture-width105-v2','parameter':'eyeApertureWidthFactor','endpoint':1.05,'default':1.,'rangeStatus':'Only original and fixed 1.05 endpoint; no continuous or signed range admission.','readOnlyStudyPath':studyPath.relative_to(ROOT).as_posix(),'readOnlyStudySha256':sha(studyPath),'selectionSha256':sha(BASE/'selection.json'),'toolchain':{'blender':'4.5.9','vrmAddon':[4,10,5]},'selectionRule':'Per-side original aperture midpoint fixed. Head skin ring+8mm graph fade and complete same-side White/Eyeline/Eyelash use fixed affine X coefficients. No nearest-point root binding. Iris/Highlight/Extra/Brow and other sources preserved.','normalPipeline':'Raw native exports retained; final independently recalculates each absolute shape on complete Face adjacency and replaces only affected triangle vertex normals; other original authored normals preserved.','bodies':bodies}
(BASE/'spec.json').write_text(json.dumps(spec,indent=2)+'\n',encoding='utf-8')
