"""Offline same-pose/same-camera texture/depth diagnostic, NOT a game screenshot.
Actual175 full meshes + candidate through unchanged solver, no hidden body/top.
Run only outside performance windows. No browser, asset regeneration or rendering edits.
"""
from pathlib import Path
import json,struct,io,hashlib,gzip,sys
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[2];O=R/'assets-source/m1/front-box-pleat-v1';CAP=Path(sys.argv[1]) if len(sys.argv)>1 else R/'experiments/skirt-offline-corrective/front-input-175a487d5ea3'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));cap=read(CAP/'capture.json');new=read(O/'standing-derived-input/capture.json');compare=read(O/'standing-contact-comparison.json')
W,H=1000,930;camera=json.loads(gzip.decompress((R/'evidence/skirt-front-17bdb176154c/original/report.json.gz').read_bytes()))['runs'][1]['setup']['camera'];eye=np.array(camera['position']);target=np.array(camera['target']);forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward);focal=H/(2*np.tan(np.deg2rad(36)/2))
materials={};sourceHashes={}
for rel in ['prototype/public/assets/foundation/base-female-roundtrip.vrm','prototype/public/assets/m1/m1-uniform-top.glb','prototype/public/assets/m1/m1-uniform-shoes.glb','prototype/public/assets/m1/m1-uniform-skirt.glb']:
 raw=(R/rel).read_bytes();sourceHashes[rel]=hashlib.sha256(raw).hexdigest();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);b=raw[28+n:]
 for m in d.get('materials',[]):
  p=m.get('pbrMetallicRoughness',{});tex=p.get('baseColorTexture');pixels=None
  if tex:
   image=d['images'][d['textures'][tex['index']]['source']];v=d['bufferViews'][image['bufferView']];pixels=np.asarray(Image.open(io.BytesIO(b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGBA'))
  materials[m['name']]={'pixels':pixels,'factor':np.array(p.get('baseColorFactor',[1,1,1,1])),'cutoff':m.get('alphaCutoff',.5)if m.get('alphaMode')=='MASK'else .01}
body=np.fromfile(CAP/'colliders.f32',dtype='<f4').reshape(len(cap['frames']),-1,3);oldSkirt=np.fromfile(CAP/'displayed.f32',dtype='<f4').reshape(len(cap['frames']),-1,3);newSkirt=np.fromfile(O/'standing-derived-input/displayed.f32',dtype='<f4').reshape(60,-1,3)
meshes=[];offset=0
for m in cap['topology']['colliders']:
 meshes.append((m,offset));offset+=m['vertexCount']
assert offset==body.shape[1]
def project(points):
 v=points-eye;z=v@forward;return np.c_[W/2+(v@right)*focal/z,H/2-(v@up)*focal/z,z]
def raster(meta,points,rgb,depth,owners,meshId):
 p=project(points);uv=np.array(meta['uv']).reshape(-1,2);mat=materials[meta['materials'][0]['name']];texture=mat['pixels'];factor=mat['factor'];faces=np.array(meta['triangles']).reshape(-1,3)
 for face,tri in enumerate(faces):
  t=p[tri];
  if t[:,2].min()<=.05:continue
  x0=max(0,int(np.floor(t[:,0].min())));x1=min(W-1,int(np.ceil(t[:,0].max())));y0=max(0,int(np.floor(t[:,1].min())));y1=min(H-1,int(np.ceil(t[:,1].max())))
  if x1<x0 or y1<y0:continue
  xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5);a,b,c=t[:,:2];den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<1e-9:continue
  w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1;inside=(w0>=0)&(w1>=0)&(w2>=0)
  invz=w0/t[0,2]+w1/t[1,2]+w2/t[2,2];z=1/invz;region=depth[y0:y1+1,x0:x1+1];mask=inside&(z<region)
  if not np.any(mask):continue
  us=(w0*uv[tri[0],0]/t[0,2]+w1*uv[tri[1],0]/t[1,2]+w2*uv[tri[2],0]/t[2,2])/invz;vs=(w0*uv[tri[0],1]/t[0,2]+w1*uv[tri[1],1]/t[1,2]+w2*uv[tri[2],1]/t[2,2])/invz
  if texture is not None:
   th,tw=texture.shape[:2];xs=np.clip((us*tw).astype(int),0,tw-1);ys=np.clip((vs*th).astype(int),0,th-1);rgba=texture[ys,xs]/255*factor
  else:rgba=np.broadcast_to(factor,xx.shape+(4,))
  mask&=rgba[:,:,3]>=max(.01,mat['cutoff']);region[mask]=z[mask];rgb[y0:y1+1,x0:x1+1][mask]=np.clip(rgba[:,:,:3][mask]*255,0,255).astype('u1');owners[y0:y1+1,x0:x1+1][mask]=[meshId,face]
def intersections(a,b):
 result=[]
 for first,other in [(a,b),(b,a)]:
  for i in range(3):
   p,q=first[i],first[(i+1)%3];direction=q-p;e1=other[1]-other[0];e2=other[2]-other[0];h=np.cross(direction,e2);det=e1@h
   if abs(det)<1e-12:continue
   s=p-other[0];u=s@h/det;v=direction@np.cross(s,e1)/det;t=e2@np.cross(s,e1)/det
   if u>=-1e-7 and v>=-1e-7 and u+v<=1+1e-7 and 1e-6<t<1-1e-6:result.append(p+direction*t)
 return result
caps=set(read(R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json')['removedOriginalFaces'])
reports=[]
for frame in sorted(set([0, max(range(60),key=lambda i:len(compare['records'][i]['newPairs']))])):
 for label,meta,skirt in [('original',cap['topology']['displayed'],oldSkirt),('candidate',new['topology']['displayed'],newSkirt)]:
  rgb=np.full((H,W,3),238,dtype='u1');depth=np.full((H,W),np.inf);owners=np.full((H,W,2),-1,dtype='i4');allMeshes={}
  for mid,(m,start)in enumerate(meshes):
   pts=body[frame,start:start+m['vertexCount']];raster(m,pts,rgb,depth,owners,mid);allMeshes[m['name']]=(m,pts,mid)
  raster(meta,skirt[frame],rgb,depth,owners,len(meshes));image=Image.fromarray(rgb);draw=ImageDraw.Draw(image);draw.text((12,12),f'OFFLINE texture/depth diagnostic | {label} | actual175 frame {frame+1}',fill='black');draw.text((12,30),'36deg same camera / all body+top retained / not GPU game screenshot',fill='black');name=f'{label}-frame{frame+1:03d}.png';image.save(O/name)
  if label=='candidate':
   overlay=image.copy();draw=ImageDraw.Draw(overlay);rows=[];tri=np.array(meta['triangles']).reshape(-1,3)
   for pair in compare['records'][frame]['newPairs']:
    skirtFace,mesh,face=pair.split(':');skirtFace,face=int(skirtFace),int(face);m,pts,mid=allMeshes[mesh];other=np.array(m['triangles']).reshape(-1,3)[face];crossings=intersections(skirt[frame,tri[skirtFace]],pts[other]);visibility=[]
    for point in crossings:
     screen=project(np.array([point]))[0];x,y=int(round(screen[0])),int(round(screen[1]));visible=0<=x<W and 0<=y<H and screen[2]<=depth[y,x]+.001
     visibility.append(bool(visible))
     if 0<=x<W and 0<=y<H:draw.ellipse((x-2,y-2,x+2,y+2),fill='red'if visible else '#d49600')
    rows.append({'pair':pair,'edgeCrossings':len(crossings),'anyDepthExposedWithin1mm':any(visibility),'topInternalCap':face in caps,'topFaceWorldVertices':pts[other].tolist(),'note':'geometry depth diagnostic; crossing-specific alpha not re-evaluated here'})
   overlay.save(O/f'candidate-frame{frame+1:03d}-crossings.png');reports.append({'frame':frame+1,'pairs':rows,'newTopFacesVisiblePixelCounts':{face:int(np.count_nonzero((owners[:,:,0]==allMeshes['m1-uniform-top_1'][2])&(owners[:,:,1]==int(face))))for face in sorted(set(p.split(':')[2]for p in compare['records'][frame]['newPairs']))}})
result={'camera':camera,'fovDegrees':36,'size':[W,H],'sourceHashes':sourceHashes,'sampledFrames':reports,'limits':['Offline texture/nearest-alpha z-buffer, no MToon outline/scene lighting/room; not game playback.','Exact same camera and actual standing pose for both assets; no garment/body hiding.','Exposure test tolerance1mm is diagnostic, not a contact pass or intentional-layer determination.','Finite edge hits may include alpha-masked secondary segments; original alpha-filtered pair gate retained.']}
(O/'static-view-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'frames':[r['frame']for r in reports],'output':str(O)}))
