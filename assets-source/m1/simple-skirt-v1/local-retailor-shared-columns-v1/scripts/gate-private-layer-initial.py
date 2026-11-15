"""Actual private-palette capture gate; no source/raw-pose substitution or cloth."""
from pathlib import Path
import gzip,json,struct,time
import numpy as np
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'private-layer-initial'
assert not(O/'actual-geometry-gate.json').exists()
capture=json.loads(gzip.decompress((O/'capture.json.gz').read_bytes()));b=(S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);buf=b[28+n:]
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]);w={'VEC3':3,'SCALAR':1}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
source=np.concatenate([read(p['attributes']['POSITION'])for p in doc['meshes'][0]['primitives']]);weld=[];lookup={}
for p in np.round(source,7):key=tuple(p);lookup.setdefault(key,len(lookup));weld.append(lookup[key])
tree=lambda p,t:BVHTree.FromPolygons(np.asarray(p).tolist(),np.asarray(t).tolist(),all_triangles=True)
def point_tri(p,t):
 a=t[:,0];u=t[:,1]-a;v=t[:,2]-a;q=p-a;uu=(u*u).sum(1);uv=(u*v).sum(1);vv=(v*v).sum(1);qu=(q*u).sum(1);qv=(q*v).sum(1);den=uu*vv-uv*uv;good=abs(den)>1e-24;inv=np.divide(1,den,out=np.zeros_like(den),where=good);alpha=(qu*vv-qv*uv)*inv;beta=(qv*uu-qu*uv)*inv;projected=a+alpha[:,None]*u+beta[:,None]*v;dist=((p-projected)**2).sum(1);dist[~(good&(alpha>=0)&(beta>=0)&(alpha+beta<=1))]=np.inf
 for i,j in [(0,1),(1,2),(2,0)]:
  delta=t[:,j]-t[:,i];fraction=np.divide(((p-t[:,i])*delta).sum(1),(delta*delta).sum(1),out=np.zeros(len(p)),where=(delta*delta).sum(1)>1e-24);q=t[:,i]+np.clip(fraction,0,1)[:,None]*delta;dist=np.minimum(dist,((p-q)**2).sum(1))
 return dist
def seg_seg(a,b,c,d):
 u=b-a;v=d-c;w=a-c;A=(u*u).sum(1);B=(u*v).sum(1);C=(v*v).sum(1);D=(u*w).sum(1);E=(v*w).sum(1);den=A*C-B*B;s=np.clip(np.divide(B*E-C*D,den,out=np.zeros(len(a)),where=den>1e-24),0,1);t=(B*s+E)/np.maximum(C,1e-24);low=t<0;high=t>1;s[low]=np.clip(-D[low]/np.maximum(A[low],1e-24),0,1);s[high]=np.clip((B[high]-D[high])/np.maximum(A[high],1e-24),0,1);t=np.clip(t,0,1);delta=w+s[:,None]*u-t[:,None]*v;return(delta*delta).sum(1)
def near_minimum(a,b,range=.003):
 lo=b.min(1);hi=b.max(1);pairs=[]
 for i,t in enumerate(a):
  js=np.flatnonzero(np.all(hi>=t.min(0)-range,axis=1)&np.all(lo<=t.max(0)+range,axis=1));pairs.extend((i,int(j))for j in js)
 if not pairs:return{'candidatePairs':0,'lowerBoundMetres':range}
 ix=np.array(pairs);aa=a[ix[:,0]];bb=b[ix[:,1]];values=[]
 for k in [0,1,2]:values.extend([point_tri(aa[:,k],bb),point_tri(bb[:,k],aa)])
 for i,j in [(0,1),(1,2),(2,0)]:
  for k,l in [(0,1),(1,2),(2,0)]:values.append(seg_seg(aa[:,i],aa[:,j],bb[:,k],bb[:,l]))
 distances=np.sqrt(np.min(values,axis=0));index=int(distances.argmin());return{'candidatePairs':len(pairs),'distanceMetres':float(distances[index]),'skirtFace':int(ix[index,0]),'otherFace':int(ix[index,1]),'searchRangeMetres':range,'globalIfBelowSearchRange':bool(distances[index]<range)}
rows=[];start=time.monotonic()
for frame in capture['frames']:
 p=[];faces=[];offset=0
 for m in frame['skirt']:
  pts=np.array(m['positions']).reshape(-1,3);p.extend(pts);faces.extend(np.array(m['triangles']).reshape(-1,3)+offset);offset+=len(pts)
 p=np.array(p);faces=np.array(faces);ct=tree(p,faces);contacts=[]
 for mesh in frame['colliders']:
  q=np.array(mesh['positions']).reshape(-1,3);f=np.array(mesh['triangles']).reshape(-1,3);pairs=ct.overlap(tree(q,f));row={'name':mesh['name'],'count':len(pairs),'pairs':pairs,'actualVisible':mesh['visible']}
  if frame['label']=='standing':row['initialExactNearMinimum']=near_minimum(p[faces],q[f]);row['original2mmGapGate']='failed-crossing'if pairs else'failed-gap'if row['initialExactNearMinimum'].get('distanceMetres',.003)<.002 else'no-under2mm-pair'
  contacts.append(row)
 for box in frame['chair']:
  lo=box['min'];hi=box['max'];q=np.array([[x,y,z,1]for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]])@np.array(box['matrixWorld']).reshape(4,4);f=[[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];pairs=ct.overlap(tree(q[:,:3],f));contacts.append({'name':box['name'],'count':len(pairs),'pairs':pairs,'chair':True})
 wt=np.array(weld)[faces];selfpairs=[(a,b)for a,b in ct.overlap(ct)if a<b and not(set(wt[a])&set(wt[b]))];rows.append({'label':frame['label'],'contacts':contacts,'selfPairs':selfpairs,'selfCount':len(selfpairs)})
edges=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0);length=np.linalg.norm(source[edges[:,0]]-source[edges[:,1]],axis=1);free=edges.min(1)>=182
result={'build':capture['identity']['runtimeBuild']['shortId'],'basis':'ACTUAL final visible two-primitives with private helpers and newly fitted hands','seconds':time.monotonic()-start,'rows':rows,'sourceEdgesMetres':{'allMinP50P95Max':np.quantile(length,[0,.5,.95,1]).tolist(),'freeMinP50P95Max':np.quantile(length[free],[0,.5,.95,1]).tolist()},'status':'not-cloth-admitted','limits':['No simulation; old raw helper gate remains separate.','2mm original static reserve retained; old faces253/494 do not index this topology and8.5mm patch has NOT been remapped/verified.','Near triangle distance uses exact vertex-face and edge-edge distances for nonintersecting pairs; crossing handled separately.']}
(O/'actual-geometry-gate.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'seconds':result['seconds'],'rows':[{'label':r['label'],'contacts':[(c['name'],c['count'],c.get('initialExactNearMinimum'))for c in r['contacts']],'self':r['selfCount']}for r in rows]},indent=2))
