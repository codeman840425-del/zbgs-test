"""Offline actual geometry/texture/alpha depth view, not game GPU or normal movie."""
from pathlib import Path
import gzip, hashlib, io, json, struct, sys
import numpy as np
from PIL import Image, ImageDraw
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/(sys.argv[sys.argv.index('--candidate-dir')+1] if '--candidate-dir'in sys.argv else 'generated')
capture=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()))
generated=json.loads(gzip.decompress((O/'four-pose-geometry.json.gz').read_bytes()))
open_top='--open-top'in sys.argv
if open_top:
 removed=set(json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'))['removedOriginalFaces'])
 for frame in capture['frames']:
  for mesh in frame['colliders']:
   if mesh['name']=='m1-uniform-top_1':
    mesh['originalTriangles']=mesh['triangles'];faces=np.array(mesh['triangles']).reshape(-1,3);mesh['triangles']=[tri for i,tri in enumerate(faces.tolist())if i not in removed]
materials={};hashes={};candidate_uv=None
for rel in ['prototype/public/assets/foundation/base-female-roundtrip.vrm','prototype/public/assets/m1/m1-uniform-top.glb','prototype/public/assets/m1/m1-uniform-shoes.glb','prototype/public/assets/m1/m1-uniform-skirt.glb',str((O/(json.loads((O/'build-report.json').read_text(encoding='utf-8'))['id']+'.glb')).relative_to(R))]:
 b=(R/rel).read_bytes();hashes[rel]=hashlib.sha256(b).hexdigest();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 for m in d.get('materials',[]):
  p=m.get('pbrMetallicRoughness',{});tex=p.get('baseColorTexture');pixels=None
  if tex:
   image=d['images'][d['textures'][tex['index']]['source']];v=d['bufferViews'][image['bufferView']];pixels=np.asarray(Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGBA'))
  materials[m['name']]={'pixels':pixels,'factor':np.array(p.get('baseColorFactor',[1,1,1,1])),'cutoff':m.get('alphaCutoff',.5)if m.get('alphaMode')=='MASK'else .01}
 if 'sixfold'in rel:
  a=d['accessors'][d['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']];v=d['bufferViews'][a['bufferView']];candidate_uv=np.frombuffer(binary,dtype='<f4',count=a['count']*2,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,2)
W,H=640,800;focal=H/(2*np.tan(np.deg2rad(36)/2));views=[];exposure=[]
def crossing(a,b):
 result=[]
 for first,other in [(a,b),(b,a)]:
  for i in range(3):
   p,q=first[i],first[(i+1)%3];direction=q-p;e1=other[1]-other[0];e2=other[2]-other[0];h=np.cross(direction,e2);det=e1@h
   if abs(det)<1e-12:continue
   s=p-other[0];u=s@h/det;v=direction@np.cross(s,e1)/det;t=e2@np.cross(s,e1)/det
   if u>=-1e-7 and v>=-1e-7 and u+v<=1+1e-7 and 1e-6<t<1-1e-6:result.append(p+direction*t)
 if len(result)>1:result.append((result[0]+result[-1])*.5)
 return result
def opaque(meta,triangle,point):
 positions=np.array(meta['positions']).reshape(-1,3);a,b,c=positions[triangle];v0=b-a;v1=c-a;v2=point-a;d00=v0@v0;d01=v0@v1;d11=v1@v1;den=d00*d11-d01*d01
 if abs(den)<1e-20:return False
 v=(d11*(v2@v0)-d01*(v2@v1))/den;w=(d00*(v2@v1)-d01*(v2@v0))/den;u=1-v-w
 mat=materials[meta['materials'][0]['name']];texture=mat['pixels'];alpha=mat['factor'][3]
 if texture is not None:
  uv=np.array(meta['uv']).reshape(-1,2);coord=np.array([u,v,w])@uv[triangle];h,ww=texture.shape[:2];x=int(np.clip(coord[0]*ww,0,ww-1));y=int(np.clip(coord[1]*h,0,h-1));alpha*=texture[y,x,3]/255
 return alpha>=max(.01,mat['cutoff'])
root=np.array(capture['frames'][0]['rootWorld'])[12:15];target=root+np.array([0,.82,0])
for name,offset in [('front',np.array([.3,.65,3.6])),('side',np.array([3.6,.65,.3]))]:
 eye=target+offset;forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
 def project(points):
  v=points-eye;z=v@forward;return np.c_[W/2+(v@right)*focal/z,H/2-(v@up)*focal/z,z]
 def raster(meta,rgb,depth):
  points=np.array(meta['positions']).reshape(-1,3);p=project(points);faces=np.array(meta['triangles']).reshape(-1,3);uv=np.array(meta.get('uv')or np.zeros((len(points),2))).reshape(-1,2);mat=materials[meta['materials'][0]['name']];texture=mat['pixels'];factor=mat['factor']
  for tri in faces:
   t=p[tri]
   if t[:,2].min()<=.05:continue
   x0=max(0,int(np.floor(t[:,0].min())));x1=min(W-1,int(np.ceil(t[:,0].max())));y0=max(0,int(np.floor(t[:,1].min())));y1=min(H-1,int(np.ceil(t[:,1].max())))
   if x1<x0 or y1<y0:continue
   xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5);a,b,c=t[:,:2];den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
   if abs(den)<1e-9:continue
   w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1;inside=(w0>=0)&(w1>=0)&(w2>=0)
   invz=w0/t[0,2]+w1/t[1,2]+w2/t[2,2];z=1/invz;region=depth[y0:y1+1,x0:x1+1];mask=inside&(z<region)
   if not mask.any():continue
   if texture is not None:
    us=(w0*uv[tri[0],0]/t[0,2]+w1*uv[tri[1],0]/t[1,2]+w2*uv[tri[2],0]/t[2,2])/invz;vs=(w0*uv[tri[0],1]/t[0,2]+w1*uv[tri[1],1]/t[1,2]+w2*uv[tri[2],1]/t[2,2])/invz;th,tw=texture.shape[:2];xs=np.clip((us*tw).astype(int),0,tw-1);ys=np.clip((vs*th).astype(int),0,th-1);rgba=texture[ys,xs]/255*factor
   else:rgba=np.broadcast_to(factor,xx.shape+(4,))
   mask&=rgba[:,:,3]>=max(.01,mat['cutoff']);region[mask]=z[mask]
   # Same simple geometric key light on both versions, not a MToon reproduction.
   n=np.cross(points[tri[1]]-points[tri[0]],points[tri[2]]-points[tri[0]]);n/=max(np.linalg.norm(n),1e-12);shade=.65+.35*abs(float(n@np.array([.3,.7,.65])/np.linalg.norm([.3,.7,.65])))
   rgb[y0:y1+1,x0:x1+1][mask]=np.clip(rgba[:,:,:3][mask]*255*shade,0,255).astype('u1')
 for i,frame in enumerate(capture['frames'][:len(generated['poses'])]):
  for kind in ['original','candidate']:
   rgb=np.full((H,W,3),238,dtype='u1');depth=np.full((H,W),np.inf)
   for m in frame['colliders']:raster(m,rgb,depth)
   if kind=='original':raster(frame['displayedSkirt'],rgb,depth)
   else:raster({'positions':generated['poses'][i],'triangles':generated['triangles'],'uv':candidate_uv.tolist(),'materials':[{'name':'Sixfold_Navy_Cloth'}]},rgb,depth)
   # Chair surfaces are retained and depth-tested, not hidden for the comparison.
   materials['chair']={'pixels':None,'factor':np.array([.58,.67,.77,1]),'cutoff':.01}
   for box in frame['chair']:
    lo=np.array(box['min']);hi=np.array(box['max']);p=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]]);p=(p@np.array(box['matrixWorld']).reshape(4,4))[:,:3]
    f=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]]
    raster({'positions':p.tolist(),'triangles':f,'uv':None,'materials':[{'name':'chair'}]},rgb,depth)
   image=Image.fromarray(rgb);draw=ImageDraw.Draw(image);draw.text((10,10),f'OFFLINE actual269 {frame["label"]} {name} | {kind}',fill='black');draw.text((10,26),'Full body/top/chair | texture-alpha depth | NOT GPU/movie',fill='black')
   if open_top:draw.text((10,42),'Existing open-top source; no other source point changes',fill='black')
   filename=('open-top-'if open_top else '')+f'{frame["label"]}-{name}-{kind}.png';image.save(O/filename);views.append(filename)
   if open_top and kind=='candidate':
    check=json.loads((O/'open-top-gate.json').read_text(encoding='utf-8'));rows=[];overlay=image.copy();mark=ImageDraw.Draw(overlay);cp=np.array(generated['poses'][i]);cf=np.array(generated['triangles']);cm={'positions':cp.tolist(),'uv':candidate_uv.tolist(),'materials':[{'name':'Sixfold_Navy_Cloth'}]}
    for mesh_name,pairs in [('Bodybaked',check['unchangedBodyPairs']),('m1-uniform-top_1',check['topPairsMappedToOriginalFaces'])]:
     mesh=next(m for m in frame['colliders']if m['name']==mesh_name);mp=np.array(mesh['positions']).reshape(-1,3);mf=np.array(mesh.get('originalTriangles',mesh['triangles'])).reshape(-1,3)
     for a,b in pairs:
      points=crossing(cp[cf[a]],mp[mf[b]]);eligible=[point for point in points if opaque(cm,cf[a],point)and opaque(mesh,mf[b],point)];seen=[]
      for point in eligible:
       screen=project(np.array([point]))[0];x,y=int(round(screen[0])),int(round(screen[1]));visible=0<=x<W and 0<=y<H and screen[2]<=depth[y,x]+.001;seen.append(bool(visible))
       if visible:mark.ellipse((x-2,y-2,x+2,y+2),fill='red'if mesh_name=='m1-uniform-top_1'else 'orange')
      rows.append({'mesh':mesh_name,'candidateFace':a,'originalColliderFace':b,'finiteSamples':len(points),'alphaEligibleSamples':len(eligible),'potentiallyExposedWithin1mm':any(seen)})
    overlay.save(O/('open-top-'+f'{frame["label"]}-{name}-crossings.png'));exposure.append({'view':name,'pose':frame['label'],'pairs':rows})
(O/(('open-top-'if open_top else '')+'offline-view-report.json')).write_text(json.dumps({'views':views,'sourceHashes':hashes,'size':[W,H],'fov':36,'target':target.tolist(),'exposure':exposure,'limits':['Offline finite texture/alpha/depth view, no game MToon or room lighting.','Actual old-skirt hand layer captured; candidate has not refit hands.','Same camera/body/chair for original and candidate; not a continuous or normal-speed claim.','Intersection endpoint/midpoint alpha+1mm depth visibility is diagnostic; not full continuous pixel coverage or severity.']},indent=2)+'\n',encoding='utf-8')
print('Wrote',len(views),'same-pose offline views')
