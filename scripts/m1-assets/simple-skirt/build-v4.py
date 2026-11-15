"""Preserve the original qualified120-face waist and stitch one new lower skirt.
No controller, body, shared source or pose response edits. Isolated output only.
"""
from pathlib import Path
import argparse,collections,copy,hashlib,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1'
parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/generated-v4');args=parser.parse_args();O=(R/args.out).resolve()
assert R.name=='m1-simple-skirt-worktree' and O.is_relative_to(R) and not O.exists()
T=json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/topology.json').read_text(encoding='utf-8'))
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);binary=bytearray(b[28+n:])
 def read(i):
  a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 p=d['meshes'][0]['primitives'][0]
 return b,d,binary,{k:read(i)for k,i in p['attributes'].items()},read(p['indices']).reshape(-1,3)
source,doc,binary,old,old_faces=load(R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-skirt-open-waist.glb')
assert hashlib.sha256(source).hexdigest()=='a5de096be20211ea9a875434893fff6c9d37b25b58cacc27c9bd8d7b8c772d66'
lower_bytes,lower_doc,_,lower,lower_faces=load(S/'generated-v3/m1-sixfold-skirt-v3.glb')
assert hashlib.sha256(lower_bytes).hexdigest()=='6ba760182b8f7ad8246f49fccf8821ab0a4742a53b65af9844dc08cdfc478a72'
weld=np.array(T['position']);wf=np.array(T['triangles']);mapping=np.array(T['renderToWeld']);edges=T['boundaryEdges'];remaining=set(i for e in edges for i in e);components=[]
while remaining:
 comp=set();queue=[next(iter(remaining))]
 while queue:
  i=queue.pop()
  if i in comp:continue
  comp.add(i);remaining.discard(i)
  for a,b in edges:
   if a==i:queue.append(b)
   if b==i:queue.append(a)
 components.append(comp)
waist=max(components,key=lambda c:weld[list(c),1].mean());neighbors=[set()for _ in weld]
for tri in wf:
 for a,b in zip(tri,np.roll(tri,-1)):neighbors[a].add(b);neighbors[b].add(a)
level={i:0 for i in waist};queue=collections.deque(waist)
while queue:
 i=queue.popleft()
 for j in neighbors[i]:
  if j not in level:level[j]=level[i]+1;queue.append(j)
kept_faces=[i for i,f in enumerate(wf)if max(level[int(v)]for v in f)<=3];assert len(kept_faces)==120
original_used=np.unique(old_faces[kept_faces]);remap={int(v):i for i,v in enumerate(original_used)}
upper={k:a[original_used].copy()for k,a in old.items()};upper_faces=np.array([[remap[int(v)]for v in f]for f in old_faces[kept_faces]],dtype=np.uint32)
ring=[i for i,l in level.items()if l==3];assert len(ring)==20
center=weld[list(waist)][:,[0,2]].mean(0);angles=np.mod(np.arctan2(weld[ring,2]-center[1],weld[ring,0]-center[0]),2*np.pi);order=np.argsort(angles);ring=np.array(ring)[order];angles=angles[order]
# One exact original vertex per weld on the true retained boundary.
ring_render=[int(next(v for v in original_used if mapping[v]==i))for i in ring]
low={k:list(a[ring_render].copy())for k,a in old.items()};indices=[];weight_losses=[]
def dense(js,ws):
 d=np.zeros(len(doc['skins'][0]['joints']))
 for j,w in zip(js,ws):d[j]+=w
 return d
boundary_weights=np.array([dense(old['JOINTS_0'][i],old['WEIGHTS_0'][i])for i in ring_render])
new_rows=list(range(7,17)) # Existing v3 actual observed rows below source ring3, plus inner hem.
for row_number,source_row in enumerate(new_rows):
 for column in range(121):
  index=source_row*121+column;theta=column/120*2*np.pi;end=int(np.searchsorted(angles,theta))%20;start=(end-1)%20;lo=angles[start];hi=angles[end]
  if hi<=lo:hi+=2*np.pi
  angle=theta+(2*np.pi if theta<lo else 0);fraction=(angle-lo)/(hi-lo)
  boundary=(1-fraction)*boundary_weights[start]+fraction*boundary_weights[end];authored=dense(lower['JOINTS_0'][index],lower['WEIGHTS_0'][index]);mix=min(1,(row_number+1)/3)
  desired=(1-mix)*boundary+mix*authored;js=np.argsort(-desired)[:4];loss=1-float(desired[js].sum());ws=desired[js]/desired[js].sum();weight_losses.append(loss)
  for k in low:
   value=lower[k][index].copy()
   if k=='JOINTS_0':value=js.astype(np.uint16)
   if k=='WEIGHTS_0':value=ws.astype(np.float32)
   low[k].append(value)
# Angular zipper: retained20-edge loop joins first120-segment row, no gap/overlap patch.
top_order=np.argsort(angles);bottom_angles=np.arange(120)/120*2*np.pi
events=sorted([(float(a),0,i)for i,a in enumerate(angles)]+[(float(a),1,i)for i,a in enumerate(bottom_angles)])
top_index=19;bottom_index=119
for angle,kind,index in events:
 if kind==0:
  indices.append([top_index,index,20+bottom_index]);top_index=index
 else:
  indices.append([top_index,20+index,20+bottom_index]);bottom_index=index
# A duplicate UV seam vertex at column120 shares geometry/weights with column0.
for row in range(len(new_rows)-1):
 for column in range(120):
  a=20+row*121+column;b=a+1;c=a+121;d=c+1;indices.extend([[a,b,d],[a,d,c]])
low={k:np.array(v)for k,v in low.items()};indices=np.array(indices,dtype=np.uint32)
# Boundary normals remain exact to the preserved original; only new lower normals update.
normals=np.zeros_like(low['POSITION'],dtype=float);p=low['POSITION'].astype(float);cross=np.cross(p[indices[:,1]]-p[indices[:,0]],p[indices[:,2]]-p[indices[:,0]])
for k in range(3):np.add.at(normals,indices[:,k],cross)
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-20);normals[:20]=old['NORMAL'][ring_render];low['NORMAL']=normals.astype(np.float32)
def write(a,component,kind):
 dt={5123:'<u2',5125:'<u4',5126:'<f4'}[component];a=np.asarray(a,dtype=dt);binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(a.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes});item={'bufferView':vi,'componentType':component,'count':len(a),'type':kind}
 if kind=='VEC3':item.update(min=a.min(0).tolist(),max=a.max(0).tolist())
 ai=len(doc['accessors']);doc['accessors'].append(item);return ai
def primitive(attributes,faces,material):
 a={k:write(v,5123 if k=='JOINTS_0'else 5126,'VEC2'if k=='TEXCOORD_0'else'VEC4'if k in ['JOINTS_0','WEIGHTS_0']else'VEC3')for k,v in attributes.items()}
 return {'attributes':a,'indices':write(faces.reshape(-1,1),5125,'SCALAR'),'material':material}
new_material=copy.deepcopy(lower_doc['materials'][0]);new_material['name']='SixfoldLower_Navy_Cloth';doc['materials'].append(new_material)
ident='m1-sixfold-skirt-v4';doc['meshes']=[{'name':ident,'primitives':[primitive(upper,upper_faces,0),primitive(low,indices,len(doc['materials'])-1)]}]
for n in doc['nodes']:
 if 'mesh'in n:n['name']=ident
doc['extras']={'method':'Preserve exact120-face original waist, stitch independently authored sixfold lower panels','sourceSha256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','fitId':'female-027bed-sixfold-v4','notAccepted':True,'sourceLicense':'See existing original uniform provenance; no new blanket license declaration'}
doc['buffers']=[{'byteLength':len(binary)}];jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary+=b'\0'*(-len(binary)%4);out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(binary),b'BIN\0')+binary
O.mkdir();(O/(ident+'.glb')).write_bytes(out)
assert all(np.array_equal(upper[k],old[k][original_used])for k in old)
report={'id':ident,'sha256':hashlib.sha256(out).hexdigest(),'bytes':len(out),'vertices':len(upper['POSITION'])+len(low['POSITION']),'triangles':len(upper_faces)+len(indices),'preservedOriginalFaces':kept_faces,'preservedOriginalRenderVertices':original_used.tolist(),'boundaryOriginalWeldedIds':ring.tolist(),'boundaryOriginalRenderIds':ring_render,'allPreservedAttributesExact':True,'seamBoundaryAttributesExact':all(np.array_equal(low[k][:20],old[k][ring_render])for k in old),'newLowerWeightMaximumDiscardedFraction':max(weight_losses),'weightTransition':'First3 lower rows blend original boundary skin with previous authored lower weights; boundary itself exact','primitives':[{'role':'retained-original-waist','faces':len(upper_faces)},{'role':'new-lower-with-real-seam','faces':len(indices)}],'status':'source-only-awaiting-standing-gate-and-GPU-diagnostic','poseResponse':'Not authored yet; no sitting-control claim'}
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
entry=copy.deepcopy(next(i for i in json.loads((R/'prototype/public/assets/m1/equipment.json').read_text(encoding='utf-8'))['items']if i['id']=='m1-uniform-skirt'));entry.update(id=ident,name='六宽褶裙 v4 诊断样件',fitId='female-027bed-sixfold-v4',url=ident+'.glb',sha256=report['sha256'],bytes=len(out),method=doc['extras']['method'],stats={'vertices':report['vertices'],'triangles':report['triangles'],'multiBoneVertices':int(sum(np.count_nonzero(w) >1 for a in [upper,low]for w in a['WEIGHTS_0'])),'joints':len(doc['skins'][0]['joints'])});entry['limits']=['Diagnostic only; four-pose admission pending','Sitting garment response is not authored','Exact female027bed body identity only'];(O/'equipment-entry.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in report.items()if 'Original'not in k and 'boundary'not in k},indent=2))
