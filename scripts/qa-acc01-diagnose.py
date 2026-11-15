"""Read-only actual269 glasses/skin diagnosis. Finite triangle segments, not CCD."""
import pathlib,json,gzip,sys,time
import numpy as np
import struct,io,hashlib
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];folder=pathlib.Path(sys.argv[1]);start=time.monotonic()
# Same noncoplanar finite segment math as qa-layer-rest-triangles.py, no source-side execution.
s=(ROOT/'scripts/m1-assets/qa-layer-rest-triangles.py').read_text(encoding='utf-8');exec(s[s.index('def bary('):s.index('colliders=[]')])
def apply(p,m):return (np.c_[p,np.ones(len(p))]@m.T)[:,:3]
alphaProof=[]
for body in ['female','male']:
 source=ROOT/f'prototype/public/assets/foundation/base-{body}-roundtrip.vrm';raw=source.read_bytes();length=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+length]);binary=raw[28+length:];mat=next(m for m in g['materials']if 'Body'in m['name']and 'SKIN'in m['name']);im=g['images'][g['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];view=g['bufferViews'][im['bufferView']];pixels=np.array(Image.open(io.BytesIO(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGBA'))
 assert np.all(pixels[:,:,3]==255)
 alphaProof.append({'body':body,'actualBodySHA256':hashlib.sha256(raw).hexdigest(),'texturePixels':int(pixels.shape[0]*pixels.shape[1]),'minimumAlpha':255})
reports=[]
for file in sorted(folder.glob('*.json.gz')):
 d=json.loads(gzip.decompress(file.read_bytes()));inv=np.linalg.inv(np.array(d['glassesMatrix']).reshape(4,4).T);scale=np.linalg.norm(np.array(d['glassesMatrix'])[:3]);skin=[]
 for m in d['meshes']:
  if m['role']=='skin':
   p=apply(np.array(m['positions']),inv);skin.extend(p[np.array(m['triangles'])])
 skin=np.array(skin);rows=[]
 for m in d['meshes']:
  if m['role']!='glasses':continue
  p=apply(np.array(m['positions']),inv);tri=p[np.array(m['triangles'])];result=check(tri,skin)
  rows.append({'mesh':m['name'],'pairCount':len(result['pairs']),'sumSegmentsWorldM':sum(x['length']for x in result['pairs'])*scale,'coplanar':result['coplanarAABBUnresolved'],'pairs':result['pairs']})
 paths=[]
 for sign in [-1,1]:
  points=np.array([[sign*.059,0,0],[sign*.062,0,-.025],[sign*.060,-.001,-.105],[sign*.055,-.012,-.117]])
  if len(sys.argv)>2:
   profile=json.loads((pathlib.Path(sys.argv[2])/('female.json'if file.name.startswith('female')else 'male.json')).read_text(encoding='utf-8'));control=next(x for x in profile['controls']if x['mesh']=='Temple'+str(sign));points=np.array([r['targetCenter']for r in control['rings']])
  for seg in range(3):
   for step in range(21):
    p=points[seg]*(1-step/20)+points[seg+1]*step/20
    t=skin[:,:,1:];a=t[:,0];u=t[:,1]-a;v=t[:,2]-a;q=p[1:]-a;den=u[:,0]*v[:,1]-u[:,1]*v[:,0];ok=np.abs(den)>1e-14
    b=np.zeros(len(t));c=b.copy();b[ok]=(q[ok,0]*v[ok,1]-q[ok,1]*v[ok,0])/den[ok];c[ok]=(u[ok,0]*q[ok,1]-u[ok,1]*q[ok,0])/den[ok];ok&=(b>=-1e-8)&(c>=-1e-8)&(b+c<=1+1e-8)
    x=skin[:,0,0]+b*(skin[:,1,0]-skin[:,0,0])+c*(skin[:,2,0]-skin[:,0,0]);hit=x[ok]*sign;hit=hit[hit>0]
    if len(hit):paths.append({'side':sign,'segment':seg,'t':step/20,'point':p.tolist(),'skinSideX':float(hit.max()),'centerInsetWorldM':float((hit.max()-p[0]*sign)*scale)})
 report={'input':file.name,'scale':scale,'pairsByMesh':rows,'templeCenterlineSections':paths,'maxCenterInsetWorldM':max((x['centerInsetWorldM']for x in paths),default=0)};reports.append(report)
 print(file.stem,[(x['mesh'],x['pairCount'],round(x['sumSegmentsWorldM']*1000,2))for x in rows], 'maxcenterinsetmm',report['maxCenterInsetWorldM']*1000)
(folder/'triangle-diagnosis.json').write_text(json.dumps({'seconds':time.monotonic()-start,'alphaProof':alphaProof,'centerlineProfileDirectory':sys.argv[2]if len(sys.argv)>2 else None,'scope':'actual posed Face and Body SKIN; exact F/M body baseColor images all4194304 alpha255 pixels verified; hair occlusion inspected in GPU images; ray sections measure lateral envelope, not signed distance/solid containment','reports':reports},indent=2),encoding='utf-8')
