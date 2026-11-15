"""Read-only separation of bind-space correctness and changed waist weights."""
from pathlib import Path
import gzip,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1'
def load(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=b[28+n:]
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dtype=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  return np.ndarray((a['count'],w),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()
 prim=d['meshes'][0]['primitives'][0];skin=d['skins'][0]
 return d,read(prim['attributes']['POSITION']),read(prim['attributes']['JOINTS_0']),read(prim['attributes']['WEIGHTS_0']),read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
d,p,j,w,ib=load(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb');nodes=d['nodes'];parents={c:i for i,n in enumerate(nodes)for c in n.get('children',[])}
def matrix(i):
 n=nodes[i]
 if 'matrix'in n:m=np.array(n['matrix']).reshape(4,4).T
 else:
  x,y,z,q=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*q,2*x*z+2*y*q],[2*x*y+2*z*q,1-2*x*x-2*z*z,2*y*z-2*x*q],[2*x*z-2*y*q,2*y*z+2*x*q,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
 return matrix(parents[i])@m if i in parents else m
skin=d['skins'][0];names=[nodes[i]['name']for i in skin['joints']]
rest_error={name:float(abs(matrix(n)@ib[k]-np.eye(4)).max())for k,(name,n)in enumerate(zip(names,skin['joints']))}
top=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/topology.json').read_text(encoding='utf-8'));edges=top['boundaryEdges'];remaining=set(i for edge in edges for i in edge);components=[]
while remaining:
 comp=set();todo=[next(iter(remaining))]
 while todo:
  i=todo.pop()
  if i in comp:continue
  comp.add(i);remaining.discard(i)
  for edge in edges:
   if i in edge:todo.extend(j for j in edge if j not in comp)
 components.append(sorted(comp))
mapping=np.array(top['renderToWeld']);source_positions=np.array(top['position']);waist=max(components,key=lambda c:source_positions[c,1].mean());ids=[int(np.flatnonzero(mapping==i)[0])for i in waist];assert len(ids)==20
capture=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()));rows=[]
hips=names.index('J_Bip_C_Hips')
for frame in capture['frames']:
 palette=np.array([np.array(frame['bones'][n]).reshape(4,4).T for n in names])@ib
 points=np.c_[p[ids],np.ones(20)]@np.array(frame['sourceBind']).reshape(4,4)
 original=np.zeros((20,4))
 for k in range(4):original+=np.einsum('nij,nj->ni',palette[j[ids,k]],points)*w[ids,k,None]
 hips_only=points@palette[hips].T;difference=np.linalg.norm(original[:,:3]-hips_only[:,:3],axis=1)
 rows.append({'pose':frame['label'],'same20SourceWaistPointsNewHipsOnlyVsOriginalWeightsMaximumMetres':float(difference.max()),'meanMetres':float(difference.mean()),'originalWeightedWorld':original[:,:3].tolist(),'hipsOnlyWorld':hips_only[:,:3].tolist()})
out={'sourceRestBindMaximumErrors':rest_error,'sourceRestBindMaximum':max(rest_error.values()),'sameInheritedSkinUsedInCandidates':True,'waistWeightDiagnostic':rows,'limits':['Comparison changes weights on identical source points only; not an alternate garment export or admission.','Quantifies one remaining fit risk, does not attribute every body/top crossing to weights.','Candidates retain original skeleton/inverse binds but intentionally authored different weights.']}
(S/'bind-and-waist-weight-diagnosis.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8');print(json.dumps(out,indent=2))
