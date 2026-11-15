"""Bounded CPU ray/alpha screening, NOT WebGL or visual acceptance."""
import os
os.environ['OPENBLAS_NUM_THREADS']='1'
from pathlib import Path
import sys,json,hashlib,io,gzip
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-sample-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

class Alpha:
 def __init__(self,g):self.g=g;self.cache={}
 def sample(self,mi,uv):
  m=self.g.doc['materials'][mi];mode=m.get('alphaMode','OPAQUE')
  if mode=='OPAQUE':return np.ones(len(uv))
  p=m.get('pbrMetallicRoughness',{});a=np.full(len(uv),p.get('baseColorFactor',[1]*4)[3],dtype=float)
  if 'baseColorTexture'in p:
   ti=p['baseColorTexture']['index'];t=self.g.doc['textures'][ti]
   if ti not in self.cache:
    im=self.g.doc['images'][t['source']];v=self.g.doc['bufferViews'][im['bufferView']];b=v.get('byteOffset',0);self.cache[ti]=np.asarray(Image.open(io.BytesIO(self.g.bin[b:b+v['byteLength']])).convert('RGBA'))[:,:,3]/255.
   tex=self.cache[ti];h,w=tex.shape;s=self.g.doc.get('samplers',[])[t['sampler']]if 'sampler'in t else {};u=uv.copy()
   for k,key in enumerate(['wrapS','wrapT']):
    modew=s.get(key,10497)
    if modew==10497:u[:,k]%=1
    elif modew==33071:u[:,k]=np.clip(u[:,k],0,1)
    elif modew==33648:u[:,k]=1-np.abs(u[:,k]%2-1)
    else:raise ValueError(modew)
   xy=u*[w,h]-.5;x=np.floor(xy[:,0]).astype(int);y=np.floor(xy[:,1]).astype(int);fx=xy[:,0]-x;fy=xy[:,1]-y
   def ix(q,n,key):return q%n if s.get(key,10497)==10497 else np.clip(q,0,n-1)
   x0=ix(x,w,'wrapS');x1=ix(x+1,w,'wrapS');y0=ix(y,h,'wrapT');y1=ix(y+1,h,'wrapT')
   a*=tex[y0,x0]*(1-fx)*(1-fy)+tex[y0,x1]*fx*(1-fy)+tex[y1,x0]*(1-fx)*fy+tex[y1,x1]*fx*fy
  if mode=='MASK':a=(a>=m.get('alphaCutoff',.5)).astype(float)
  return a

def transmit(g,mi,pos,q,alpha):
 trans=np.ones(len(q));mesh=g.doc['meshes'][mi]
 for p in mesh['primitives']:
  mat=g.doc['materials'][p['material']]
  if any(k in mat['name']for k in ['EyeIris','EyeHighlight']):continue
  uv=g.acc(p['attributes']['TEXCOORD_0'])
  for ids in g.acc(p['indices']).reshape(-1,3):
   t=pos[ids];a=t[1,:2]-t[0,:2];b=t[2,:2]-t[0,:2];det=a[0]*b[1]-a[1]*b[0]
   if abs(det)<1e-15 or (not mat.get('doubleSided',False)and det>=0):continue
   mask=(trans>1e-12)&(q[:,0]>=t[:,0].min())&(q[:,0]<=t[:,0].max())&(q[:,1]>=t[:,1].min())&(q[:,1]<=t[:,1].max());idx=np.flatnonzero(mask)
   if not len(idx):continue
   d=q[idx,:2]-t[0,:2];v=(d[:,0]*b[1]-d[:,1]*b[0])/det;w=(a[0]*d[:,1]-a[1]*d[:,0])/det;u=1-v-w;z=u*t[0,2]+v*t[1,2]+w*t[2,2];hit=(u>1e-10)&(v>1e-10)&(w>1e-10)&(z<q[idx,2]-1e-6)
   if hit.any():
    bary=np.column_stack([u[hit],v[hit],w[hit]]);trans[idx[hit]]*=1-alpha.sample(p['material'],bary@uv[ids])
 return trans

spec=json.loads((BASE/'spec.json').read_text());rows=[];raw=[]
# Ten fixed interior barycentric points per triangle; identical original/candidate.
bary=np.array([[1-u-v,u,v]for u in [.071828,.271828,.471828,.671828]for v in [.113141,.313141,.513141,.713141]if u+v<.95])
for sex,src in spec['bodies'].items():
 old=GLB(ROOT/src['sourceVRM']);folder=BASE/'generated'/f'{sex}-eye-{spec["sampleId"]}';new=GLB(folder/'avatar.vrm');mi=1;om=old.doc['meshes'][mi];op=om['primitives'][0];np0=new.doc['meshes'][mi]['primitives'][0];p0=old.acc(op['attributes']['POSITION']).astype(float);p1=new.acc(np0['attributes']['POSITION']).astype(float);alpha=Alpha(old);targets=om['extras']['targetNames'];cases=[('open',None,0)]+[(kind+str(weight),next(i for i,n in enumerate(targets)if n.endswith(suffix)),weight)for kind,suffix in [('full','EYE_Close'),('left','EYE_Close_L'),('right','EYE_Close_R')]for weight in [.5,1.]]
 for label,ti,weight in cases:
  q0=p0+(old.acc(op['targets'][ti]['POSITION'])*weight if ti is not None else 0);q1=p1+(new.acc(np0['targets'][ti]['POSITION'])*weight if ti is not None else 0)
  for p in om['primitives']:
   material=old.doc['materials'][p['material']]['name']
   if not any(k in material for k in ['EyeIris','EyeHighlight']):continue
   tris=old.acc(p['indices']).reshape(-1,3);uv=old.acc(p['attributes']['TEXCOORD_0']);points=np.einsum('bv,tvc->tbc',bary,q0[tris]).reshape(-1,3);texuv=np.einsum('bv,tvc->tbc',bary,uv[tris]).reshape(-1,2);mask=alpha.sample(p['material'],texuv)>=.5;points=points[mask];a=transmit(old,mi,q0,points,alpha);b=transmit(new,mi,q1,points,alpha)
   for side,sm in [('negativeX',points[:,0]<0),('positiveX',points[:,0]>=0)]:
    aa=a[sm];bb=b[sm];r={'sex':sex,'case':label,'material':material,'side':side,'sampleCount':int(sm.sum()),'originalTransmittanceSum':float(aa.sum()),'candidateTransmittanceSum':float(bb.sum()),'originalVisibleCountAboveHalf':int((aa>.5).sum()),'candidateVisibleCountAboveHalf':int((bb>.5).sum()),'newVisibleAboveHalf':int(((aa<=.5)&(bb>.5)).sum()),'largestTransmittanceIncrease':float((bb-aa).max())if len(aa)else 0};rows.append(r)
   raw.append({'sex':sex,'case':label,'material':material,'positions':points.tolist(),'originalTransmittance':a.tolist(),'candidateTransmittance':b.tolist()})
 print(sex+' screened',flush=True)
report={'schema':'eye-cpu-occlusion-screen-v1','scriptSha256':sha(Path(__file__)),'method':'Fixed original Iris/Highlight barycentric surface samples with original alpha >= .5. Front orthographic rays from negative Z; glTF winding/doubleSided culling, UV bilinear alpha, OPAQUE/MASK/BLEND. Product transmittance of front Head-layer intersections; fixed 1 um depth exclusion. Original/candidate share identical points.','barycentricSamples':bary.tolist(),'limits':['Not image pixels or area coverage; sparse surface point counts only.','No MToon shader, texture mipmap/derivatives, WebGL precision/sorting, lighting, gaze rotation or perspective. Strict triangle interiors exclude edge hits.','No source geometry or ratio tuned from screening. Browser near-view half/full/single blink and gaze still required.'],'rows':rows,'fullBlinkNewVisibleAboveHalf':sum(r['newVisibleAboveHalf']for r in rows if r['case']=='full1.0'),'runtimeAdmitted':False}
(BASE/'occlusion-screen.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
with (BASE/'occlusion-screen-samples.json.gz').open('wb')as f:
 with gzip.GzipFile(fileobj=f,mode='wb',mtime=0)as z:z.write(json.dumps(raw,separators=(',',':')).encode())
print(json.dumps({'rows':len(rows),'fullBlinkNewVisibleAboveHalf':report['fullBlinkNewVisibleAboveHalf']}))
