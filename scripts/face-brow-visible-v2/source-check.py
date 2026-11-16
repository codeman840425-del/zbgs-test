"""Source-only 2D projection clearance, all authored absolute shapes. No GPU."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib,io
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/face-brow-visible-v2';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sources=json.loads((ROOT/'assets-source/face-parameters-v1/spec.json').read_text(encoding='utf-8'))['bodies']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def clearances(positions,queries,tri):
 # Front is -Z; project onto the actual source Face_SKIN triangles at the
 # query X/Y, choosing the closest Z surface within 30mm of the brow.
 t=positions[tri];a=t[:,0];e=t[:,1]-a;f=t[:,2]-a
 det=e[:,0]*f[:,1]-e[:,1]*f[:,0];valid=np.abs(det)>1e-12
 answer=[]
 for q in queries:
  d=q-a;u=np.divide(d[:,0]*f[:,1]-d[:,1]*f[:,0],det,out=np.zeros_like(det),where=valid);v=np.divide(e[:,0]*d[:,1]-e[:,1]*d[:,0],det,out=np.zeros_like(det),where=valid)
  z=a[:,2]+u*e[:,2]+v*f[:,2];hit=valid&(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)&(np.abs(z-q[2])<.03)
  gaps=z[hit]-q[2];answer.append(float(gaps[np.argmin(np.abs(gaps))]) if len(gaps) else None)
 return answer

report={'method':'Projection along source glTF Z onto Face_SKIN; signed gap skinZ-browZ positive in front. Finite vertex+triangle-centroid checks, not full continuous collision or simultaneous expression blend proof.','candidate':{'browHeightM':.003,'browHalfSpacingM':.003},'bodies':{}}
for sex,source in sources.items():
 p=ROOT/source['sourceVRM'];assert sha(p)==source['sourceVRMSha256'];g=GLB(p);mi=next(i for i,m in enumerate(g.doc['meshes']) if m['name'].startswith('Face'));m=g.doc['meshes'][mi]
 brow=next(p for p in m['primitives'] if '_FaceBrow_' in g.doc['materials'][p['material']]['name']);skin=next(p for p in m['primitives'] if '_Face_00_SKIN' in g.doc['materials'][p['material']]['name'])
 pos=g.acc(brow['attributes']['POSITION']).astype(float);btri=g.acc(brow['indices']).reshape(-1,3);stri=g.acc(skin['indices']).reshape(-1,3);ids=np.unique(btri);center=(pos[ids,0].min()+pos[ids,0].max())/2
 side=np.sign(pos[:,0]-center);assert np.all(side[btri].min(1)==side[btri].max(1))
 delta=np.zeros_like(pos);delta[ids,0]=side[ids]*.003;delta[ids,1]=.003
 material=g.doc['materials'][brow['material']];texture=g.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']];im=g.doc['images'][texture['source']];bv=g.doc['bufferViews'][im['bufferView']];imagebytes=g.bin[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']];rgba=np.array(Image.open(io.BytesIO(imagebytes)).convert('RGBA'))
 uv=g.acc(brow['attributes']['TEXCOORD_0']);sampleuv=np.concatenate([uv[ids],uv[btri].mean(1)]);h,w=rgba.shape[:2];xy=np.clip(sampleuv,0,1)*[w-1,h-1];lower=np.floor(xy).astype(int);upper=np.minimum(lower+1,[w-1,h-1]);t=xy-lower
 alpha=((1-t[:,0])*(1-t[:,1])*rgba[lower[:,1],lower[:,0],3]+t[:,0]*(1-t[:,1])*rgba[lower[:,1],upper[:,0],3]+(1-t[:,0])*t[:,1]*rgba[upper[:,1],lower[:,0],3]+t[:,0]*t[:,1]*rgba[upper[:,1],upper[:,0],3])/255
 opaque=alpha>=.5
 names=['Basis']+m['extras']['targetNames'];shapeRows=[]
 for k,name in enumerate(names):
  points=pos if k==0 else pos+g.acc(brow['targets'][k-1]['POSITION'])
  sp=g.acc(skin['attributes']['POSITION']).astype(float)
  if k:sp+=g.acc(skin['targets'][k-1]['POSITION'])
  oldq=np.concatenate([points[ids],points[btri].mean(1)]);new=points+delta;newq=np.concatenate([new[ids],new[btri].mean(1)])
  old=clearances(sp,oldq,stri);newgap=clearances(sp,newq,stri);common=[(a,b)for a,b in zip(old,newgap)if a is not None and b is not None]
  def stats(v):
   x=np.array([a for a in v if a is not None]);return {'tested':len(v),'missing':sum(a is None for a in v),'minM':float(x.min()),'maxM':float(x.max()),'behindSkinBeyond10um':int((x<-.00001).sum())}
  shapeRows.append({'name':name,'old':stats(old),'candidate':stats(newgap),'alphaAtLeastHalf':{'old':stats([a for a,keep in zip(old,opaque)if keep]),'candidate':stats([a for a,keep in zip(newgap,opaque)if keep])},'maxGapChangeM':max(abs(a-b)for a,b in common),'newBehindSkinBeyond10um':sum(a>=-.00001 and b<-.00001 for a,b in common),'newMissingSamples':sum(a is not None and b is None for a,b in zip(old,newgap)),'oldMissingSampleIndices':[i for i,a in enumerate(old)if a is None],'candidateMissingSampleIndices':[i for i,a in enumerate(newgap)if a is None]})
 joints=g.acc(brow['attributes']['JOINTS_0'])[ids];weights=g.acc(brow['attributes']['WEIGHTS_0'])[ids];node=next(n for n in g.doc['nodes']if n.get('mesh')==mi);jointNodes=g.doc['skins'][node['skin']]['joints']
 body={'source':source,'faceMeshIndex':mi,'material':g.doc['materials'][brow['material']]['name'],'vertices':len(ids),'triangles':len(btri),'boundsGlTF':[pos[ids].min(0).tolist(),pos[ids].max(0).tolist()],'centerX':center,'perSideBounds':{str(s):[pos[ids[side[ids]==s]].min(0).tolist(),pos[ids[side[ids]==s]].max(0).tolist()]for s in [-1,1]},'jointPositiveCounts':{g.doc['nodes'][jointNodes[int(k)]]['name']:int(np.any((joints==k)&(weights>0),axis=1).sum())for k in np.unique(joints[weights>0])},'shapeChecks':shapeRows,'verticesBySide':{str(s):ids[side[ids]==s].tolist()for s in [-1,1]},'allShapesNoMissing':all(r['candidate']['missing']==0 for r in shapeRows),'newPenetrationSamples':sum(r['newBehindSkinBeyond10um']for r in shapeRows),'maxCandidateGapM':max(r['candidate']['maxM']for r in shapeRows)}
 body['browSurface']={'alphaMode':material['alphaMode'],'doubleSided':material['doubleSided'],'textureSha256':hashlib.sha256(imagebytes).hexdigest(),'textureDimensions':[w,h],'sampleAlphaAtLeastHalf':int(opaque.sum()),'alphaSampling':'Bilinear at existing vertex/triangle-centroid UVs, glTF top-left origin; alpha>=0.5 is a reporting subset, not a change to BLEND rendering.'}
 report['bodies'][sex]=body
 print(sex,json.dumps({k:body[k]for k in ['vertices','triangles','boundsGlTF','jointPositiveCounts','allShapesNoMissing','newPenetrationSamples','maxCandidateGapM']}))
(OUT/'source-inspection.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
