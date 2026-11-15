"""Inspect actual bind-space radial body/top/source layers; do not generate assets."""
from pathlib import Path
import json, struct, hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'experiments/m1-simple-skirt-worktree';S=R/'assets-source/m1/simple-skirt-v1'
def glb(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 def a(i):
  q=d['accessors'][i];v=d['bufferViews'][q['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[q['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[q['type']]
  return np.ndarray((q['count'],w),dt,binary,offset=v.get('byteOffset',0)+q.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 return d,a,hashlib.sha256(b).hexdigest()
def primitive(d,a,p):return {'p':a(p['attributes']['POSITION']),'f':a(p['indices']).reshape(-1,3),'j':a(p['attributes']['JOINTS_0']),'w':a(p['attributes']['WEIGHTS_0'])}
def ray(mesh,origin,direction):
 t=mesh['p'][mesh['f']];e1=t[:,1]-t[:,0];e2=t[:,2]-t[:,0];h=np.cross(direction,e2);det=np.einsum('ij,ij->i',e1,h);safe=np.where(abs(det)>1e-12,det,1);s=origin-t[:,0];u=np.einsum('ij,ij->i',s,h)/safe;q=np.cross(s,e1);v=q@direction/safe;dist=np.einsum('ij,ij->i',e2,q)/safe
 ids=np.flatnonzero((abs(det)>1e-12)&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(dist>0))
 return sorted([{'face':int(i),'distance':float(dist[i]),'barycentric':[float(1-u[i]-v[i]),float(u[i]),float(v[i])]}for i in ids],key=lambda x:x['distance'])
def inspect():
 v,va,vsha=glb(S/'generated-v4/m1-sixfold-skirt-v4.glb');assert vsha=='cdd2d206650aa7375b335e42b8cea93dcebea9c9269e360124d198964240c885';low=primitive(v,va,v['meshes'][0]['primitives'][1])
 b,ba,bsha=glb(ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm');bp=next(p for m in b['meshes']for p in m['primitives']if b['materials'][p['material']]['name']=='F00_001_01_Body_00_SKIN');body=primitive(b,ba,bp)
 t,ta,tsha=glb(ROOT/'prototype/public/assets/m1/m1-uniform-top.glb');top=primitive(t,ta,t['meshes'][0]['primitives'][0]);caps=set(json.loads((ROOT/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text())['removedOriginalFaces']);top['f']=top['f'][[i for i in range(len(top['f']))if i not in caps]]
 o,oa,osha=glb(ROOT/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb');old=primitive(o,oa,o['meshes'][0]['primitives'][0]);center=low['p'][:20][:,[0,2]].mean(0);rows=[]
 for i in range(20,504):
  p=low['p'][i];origin=np.array([center[0],p[1],center[1]]);delta=p-origin;radius=np.linalg.norm(delta);direction=delta/radius;bh=ray(body,origin,direction);th=ray(top,origin,direction);oh=ray(old,origin,direction)
  br=bh[0]['distance']if bh else None;tr=th[0]['distance']if th else None;nearest=min(oh,key=lambda x:abs(x['distance']-radius))if oh else None
  rows.append({'lowVertex':i,'row':(i-20)//121,'sourcePosition':p.tolist(),'radius':float(radius),'bodyRadius':br,'topRadius':tr,'gap':tr-br if br is not None and tr is not None else None,'source':nearest,'bodyHits':len(bh),'topHits':len(th)})
 result={'v4Sha256':vsha,'bodySha256':bsha,'topSha256':tsha,'sourceSha256':osha,'centerXZ':center.tolist(),'scope':'Bind-space radial intersections, full Body skin and cap-excluded top. No alpha exemption, no source movement, not posed admission.','vertices':rows}
 return result,low,old,body,top,v,va
if __name__=='__main__':
 result,*_=inspect();rows=result['vertices'];gaps=[x['gap']for x in rows if x['gap']is not None];result['summary']={'samples':len(rows),'noBody':sum(x['bodyRadius']is None for x in rows),'noTop':sum(x['topRadius']is None for x in rows),'noSource':sum(x['source']is None for x in rows),'nonPositiveGaps':sum(x<=0 for x in gaps),'minGap':min(gaps),'maxGap':max(gaps),'sourceOutsideTop':sum(x['source']is not None and x['topRadius']is not None and x['source']['distance']>=x['topRadius']for x in rows)}
 (ROOT/'evidence/simple-skirt-v4-layer-space.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result['summary'],indent=2))
