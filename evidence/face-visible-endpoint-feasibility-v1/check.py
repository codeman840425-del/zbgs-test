"""One arithmetic feasibility batch on original F/M. No model/recipe production."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib,ast,io
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
alphaPath=ROOT/'scripts/face-eye-sample-v1/screen-occlusion.py';rayPath=ROOT/'evidence/eye-expression-overlap-study-v1/diagnose.py'
for path,names in [(alphaPath,['Alpha','transmit']),(rayPath,['skin_depth'])]:
 tree=ast.parse(path.read_text(encoding='utf-8'));exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))and n.name in names],type_ignores=[]),str(path),'exec'))
spec=json.loads((ROOT/'assets-source/face-parameters-v1/spec.json').read_text(encoding='utf-8'));deps=[Path(__file__),alphaPath,rayPath];rows=[]
bary=np.array([[1-u-v,u,v]for u in [.071828,.271828,.471828,.671828]for v in [.113141,.313141,.513141,.713141]if u+v<.95])
for sex,src in spec['bodies'].items():
 path=ROOT/src['sourceVRM'];assert sha(path)==src['sourceVRMSha256'];deps.append(path);g=GLB(path);mesh=g.doc['meshes'][1];pr=mesh['primitives'][0];pos=g.acc(pr['attributes']['POSITION']).astype(float);tri=np.concatenate([g.acc(p['indices']).reshape(-1,3)for p in mesh['primitives']]);edges=np.unique(np.sort(np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]),axis=1),axis=0);names=mesh['extras']['targetNames'];shapes=[pos]+[pos+g.acc(t['POSITION'])for t in pr['targets']];recipes={}
 for key,folder,file in [('mouth','face-parameters-v1',f'{sex}-mouth-width.recipe.json'),('brow','face-brow-parameters-v1',f'{sex}-brow.recipe.json'),('nose','face-nose-parameters-v1',f'{sex}-nose.recipe.json'),('eye','face-eye-sample-v1',f'{sex}-eye.recipe.json')]:
  p=ROOT/'assets-source'/folder/file;d=json.loads(p.read_text(encoding='utf-8'));assert d['baseAvatarSha256']==sha(path);recipes[key]=d;deps.append(p)
 def transform(q,key):
  n=q.copy()
  if key.startswith('mouth'):
   amount=.12 if key=='mouth+12%'else -.12;r=recipes['mouth'];n[:,0]=r['centerX']+(q[:,0]-r['centerX'])*(1+amount*np.array(r['weights']))
  elif key=='brow+3mm+3mm':
   r=recipes['brow'];n+=.003*(np.array(r['heightVectors'])+np.array(r['spacingVectors']))
  elif key=='nose+2mm':n+=4*np.array(recipes['nose']['translationVectors'])
  elif key=='eye+5%':
   r=recipes['eye'];s=1+5*(np.array(r['xScale'])-1);c=np.array(r['centerX']);n[:,0]=c+(q[:,0]-c)*s
  return n
 def quality(old,new):
  a=old[tri];b=new[tri];na=np.cross(a[:,1]-a[:,0],a[:,2]-a[:,0]);nb=np.cross(b[:,1]-b[:,0],b[:,2]-b[:,0]);aa=np.linalg.norm(na,axis=1);ab=np.linalg.norm(nb,axis=1);valid=aa>1e-12;dot=np.sum(na*nb,axis=1);la=np.linalg.norm(old[edges[:,1]]-old[edges[:,0]],axis=1);lb=np.linalg.norm(new[edges[:,1]]-new[edges[:,0]],axis=1);ratio=lb[la>1e-7]/la[la>1e-7]
  return {'newDegenerate':int((valid&(ab<=1e-12)).sum()),'newNormalReversals':int((valid&(dot<=0)).sum()),'edgeMin':float(ratio.min()),'edgeMax':float(ratio.max()),'triangleNormalMaxDeg':float(np.degrees(np.arccos(np.clip(dot[valid]/np.maximum(aa[valid]*ab[valid],1e-30),-1,1))).max())}
 for key in ['mouth-12%','mouth+12%','brow+3mm+3mm','nose+2mm','eye+5%']:
  out=transform(pos,key);geom=[{'shape':name,**quality(q,transform(q,key))}for name,q in zip(['Basis']+names,shapes)];changed=np.flatnonzero(np.linalg.norm(out-pos,axis=1)>1e-8);r={'sex':sex,'candidate':key,'basisChanged':len(changed),'basisMaxDisplacementM':float(np.linalg.norm(out-pos,axis=1).max()),'maxShapeDisplacementM':max(float(np.linalg.norm(transform(q,key)-q,axis=1).max())for q in shapes),'shapes':geom,'newDegenerate':sum(x['newDegenerate']for x in geom),'newNormalReversals':sum(x['newNormalReversals']for x in geom),'edgeMin':min(x['edgeMin']for x in geom),'edgeMax':max(x['edgeMax']for x in geom),'maxTriangleNormalDeg':max(x['triangleNormalMaxDeg']for x in geom),'shapeFailures':[x for x in geom if x['newDegenerate']or x['newNormalReversals']]}
  if key.startswith('mouth'):
   pairs=np.array(recipes['mouth']['mouthBoundaryPairs']);r['mouthSeamMaxM']=max(float(np.linalg.norm(transform(q,key)[pairs[:,0]]-transform(q,key)[pairs[:,1]],axis=1).max())for q in shapes);r['mouthRingWidthBeforeM']=float(np.ptp(pos[pairs[:,0],0]));r['mouthRingWidthAfterM']=float(np.ptp(out[pairs[:,0],0]))
  if key=='eye+5%':
   pairs=np.array(recipes['eye']['skinWhitePairs']);r['eyeSkinWhiteSeamMaxM']=max(float(np.linalg.norm(transform(q,key)[pairs[:,0]]-transform(q,key)[pairs[:,1]],axis=1).max())for q in shapes);protected=[]
   for p in mesh['primitives']:
    if any(k in g.doc['materials'][p['material']]['name']for k in ['EyeIris','EyeHighlight']):protected.extend(np.unique(g.acc(p['indices'])).tolist())
   r['irisHighlightMaxChangeM']=max(float(np.linalg.norm((transform(q,key)-q)[protected],axis=1).max())for q in shapes)
  rows.append(r)
 # Fixed front-ray screen of brow candidate and full-blink eye candidate.
 alpha=Alpha(g);skin=next(p for p in mesh['primitives']if g.doc['materials'][p['material']]['name'].endswith('SKIN'));skintri=g.acc(skin['indices']).reshape(-1,3);brow=next(p for p in mesh['primitives']if 'FaceBrow'in g.doc['materials'][p['material']]['name']);bt=g.acc(brow['indices']).reshape(-1,3);uv=g.acc(brow['attributes']['TEXCOORD_0']);mask=alpha.sample(brow['material'],np.einsum('bv,tvc->tbc',bary,uv[bt]).reshape(-1,2))>=.5;q=np.einsum('bv,tvc->tbc',bary,pos[bt]).reshape(-1,3)[mask];newq=np.einsum('bv,tvc->tbc',bary,transform(pos,'brow+3mm+3mm')[bt]).reshape(-1,3)[mask];d0,_=skin_depth(pos,skintri,q);d1,_=skin_depth(pos,skintri,newq)
 rows[-3]['browAlphaScreen']={'sampleCount':len(q),'originalBehindSkinCount':int((d0>1e-6).sum()),'candidateBehindSkinCount':int((d1>1e-6).sum()),'originalFrontGapMaxM':float(max(0,-d0[np.isfinite(d0)].min())),'candidateFrontGapMaxM':float(max(0,-d1[np.isfinite(d1)].min())),'noHitOriginal':int((~np.isfinite(d0)).sum()),'noHitCandidate':int((~np.isfinite(d1)).sum())}
 ti=next(i for i,n in enumerate(names)if n.endswith('EYE_Close'));q=shapes[ti+1];eyeRows=[]
 for p in mesh['primitives']:
  name=g.doc['materials'][p['material']]['name']
  if not any(k in name for k in ['EyeIris','EyeHighlight']):continue
  it=g.acc(p['indices']).reshape(-1,3);uv=g.acc(p['attributes']['TEXCOORD_0']);mask=alpha.sample(p['material'],np.einsum('bv,tvc->tbc',bary,uv[it]).reshape(-1,2))>=.5;points=np.einsum('bv,tvc->tbc',bary,q[it]).reshape(-1,3)[mask];a=transmit(g,1,q,points,alpha);b=transmit(g,1,transform(q,'eye+5%'),points,alpha);eyeRows.append({'material':name,'samples':len(points),'originalVisibleAboveHalf':int((a>.5).sum()),'candidateVisibleAboveHalf':int((b>.5).sum()),'newVisibleAboveHalf':int(((a<=.5)&(b>.5)).sum())})
 rows[-1]['fullBlinkScreen']=eyeRows
r={'scope':'Read-only arithmetic one fixed amplitude per existing domain; original F/M only, no generated Blender/VRM/recipe or runtime admission.','candidates':['mouth +/-12%','brow combined +3mm height/+3mm per-side spacing','nose tip +2mm same existing mask','eye aperture +5% same mask, iris fixed'],'limits':['No visual/GPU acceptance; screen is sparse source-front rays, not actual camera pixels.','All original absolute shapes checked separately, not all simultaneous expression mixtures.','No threshold/parameter scan, no new topology or source masks.','Skin/eyes/bones unchanged except explicitly transformed selected source points; relative morph semantics differ for affine vs translations.'],'results':rows,'dependencies':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)}for p in deps]};(OUT/'report.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps([{k:v for k,v in x.items()if k not in ['shapes','shapeFailures']}for x in rows],indent=2))
