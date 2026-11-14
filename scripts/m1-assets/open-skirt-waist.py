"""Deterministic isolated source edit: remove verified waist-hole cap only.
No Blender, controller, body/top edit, or production overwrite.
"""
import collections,copy,hashlib,json,pathlib,struct
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2]
S=R/'prototype/public/assets/m1/m1-uniform-skirt.glb'
O=R/'assets-source/m1/offline-corrective/open-waist-v1';O.mkdir(parents=True,exist_ok=True)
raw=S.read_bytes();sha=hashlib.sha256(raw).hexdigest()
assert sha=='065305626976c59b370d082baa6fd1e2aed8c262490e04e39543345170eb8d8d'
n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
p=d['meshes'][0]['primitives'][0];attrs={k:acc(i)for k,i in p['attributes'].items()};tri=acc(p['indices']).reshape(-1,3)
keys={};weld=[];mp=[]
for v in attrs['POSITION']:
 key=tuple(np.round(v.astype(float),6))
 if key not in keys:keys[key]=len(weld);weld.append(v)
 mp.append(keys[key])
mp=np.array(mp);weld=np.array(weld);wt=mp[tri]
cap=np.flatnonzero(np.any(wt==2,axis=1));assert cap.tolist()==list(range(20))
ring=sorted(int(i)for i in set(wt[cap].ravel())-{2});assert len(ring)==20
ringEdges=[tuple(sorted(set(t)-{2}))for t in wt[cap]];degree=collections.Counter(i for e in ringEdges for i in e)
assert len(ringEdges)==20 and all(n==2 for n in degree.values()),'Not a single closed waist fan'
skin=d['skins'][0];names=[d['nodes'][i]['name']for i in skin['joints']];inv=acc(skin['inverseBindMatrices'])[names.index('J_Bip_C_Hips')].reshape(4,4).T
hip=(np.c_[weld,np.ones(len(weld))]@inv.T)[:,:3];assert hip[ring,1].min()>.12 and hip[ring,1].max()<.15
kept=np.delete(tri,cap,axis=0);used=np.unique(kept);remap=np.full(len(mp),-1);remap[used]=np.arange(len(used));newtri=remap[kept]
result=copy.deepcopy(d);blob=bytearray(binary[:d['buffers'][0]['byteLength']])
def append(array,old):
 blob.extend(b'\0'*(-len(blob)%4));view=len(result['bufferViews']);result['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':array.nbytes});blob.extend(array.tobytes())
 a={k:copy.deepcopy(v)for k,v in d['accessors'][old].items()if k not in ['bufferView','byteOffset','count','min','max']};a.update(bufferView=view,count=len(array))
 if a['type']=='VEC3':a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
 i=len(result['accessors']);result['accessors'].append(a);return i
q=result['meshes'][0]['primitives'][0]
q['attributes']={k:append(a[used],p['attributes'][k])for k,a in attrs.items()};q['indices']=append(newtri.astype(acc(p['indices']).dtype).reshape(-1,1),p['indices'])
result['buffers'][0]['byteLength']=len(blob);result['asset']['generator']='zbgs isolated open-waist-v1; source attributes unchanged on surviving vertices'
result.setdefault('extras',{})['isolatedTopologyEdit']={'sourceSha256':sha,'removedOriginalTriangleIndices':cap.tolist(),'reason':'Open anatomical waist hole: verified 20-face radial cap crossed body and full pins','notAccepted':['cloth','seated folds','walking','dancing','runtime integration']}
jb=json.dumps(result,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*(-len(jb)%4);blob+=b'\0'*(-len(blob)%4)
out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(O/'m1-uniform-skirt-open-waist.glb').write_bytes(out)
# Readable face edit and vertex correspondence allow reimport/editor roundtrip.
report={'schema':'m1.isolated-waist-opening.1','source':str(S.relative_to(R)),'sourceSha256':sha,'resultSha256':hashlib.sha256(out).hexdigest(),'removedOriginalFaces':cap.tolist(),'removedOriginalRenderTriangles':tri[cap].tolist(),'removedOriginalWeldedTriangles':wt[cap].tolist(),'waistCenterOriginalWeldedIndex':2,'waistCenterHipLocal':hip[2].tolist(),'waistRingOriginalWeldedIndices':ring,'waistRingHipLocal':hip[ring].tolist(),'resultRenderVertexToOriginal':used.tolist(),'originalTriangles':len(tri),'resultTriangles':len(newtri),'originalRenderVertices':len(mp),'resultRenderVertices':len(used),'preserved':['all surviving POSITION/NORMAL/UV/JOINTS/WEIGHTS byte-values','original material and embedded image','skin and inverse bind matrices','body and top source files'],'limits':['Topology opening only; no cloth/sitting acceptance','Unused original binary buffers remain for exact preservation; not a runtime payload optimization']}
(O/'edit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
# New independent topology; no orphan cap center is passed into cloth.
ks={};wm=[];wp=[]
for v in attrs['POSITION'][used]:
 key=tuple(np.round(v.astype(float),6))
 if key not in ks:ks[key]=len(wp);wp.append(v.tolist())
 wm.append(ks[key])
wf=np.array(wm)[newtri];edges=collections.Counter(tuple(sorted((int(a),int(b))))for t in wf for a,b in zip(t,np.roll(t,-1)))
h=(np.c_[wp,np.ones(len(wp))]@inv.T)[:,:3]
topology={'sha256':report['resultSha256'],'position':wp,'triangles':wf.tolist(),'renderToWeld':wm,'hipLocalPosition':h.tolist(),'uv':attrs['TEXCOORD_0'][used].tolist(),'renderTriangles':newtri.tolist(),'boundaryEdges':[e for e,n in edges.items()if n==1],'originalRenderVertexIndices':used.tolist()}
(O/'topology.json').write_text(json.dumps(topology,separators=(',',':')),encoding='utf8')
assert all(n<=2 for n in edges.values());assert len(wp)==380
# Verify the exported bytes, not just the arrays passed to the writer.
nn=struct.unpack_from('<I',out,12)[0];rd=json.loads(out[20:20+nn]);rb=out[28+nn:];rp=rd['meshes'][0]['primitives'][0]
for name,old in attrs.items():
 ai=rd['accessors'][rp['attributes'][name]];bv=rd['bufferViews'][ai['bufferView']];actual=np.frombuffer(rb,dtype=old.dtype,count=old[used].size,offset=bv['byteOffset']).reshape(old[used].shape)
 assert np.array_equal(actual,old[used]),f'Export roundtrip changed {name}'
assert rd['skins']==d['skins'] and rd['nodes']==d['nodes'] and rd['materials']==d['materials']
assert hashlib.sha256(S.read_bytes()).hexdigest()==sha
(O/'verification.json').write_text(json.dumps({'status':'passed-source-edit-roundtrip-only','resultSha256':report['resultSha256'],'survivingAttributesExact':list(attrs),'skinNodesMaterialsExact':True,'originalSourceSHAUnchanged':True,'trianglesRemovedOnly':20,'nonManifoldEdges':0,'runtimeOrClothAccepted':False},indent=2),encoding='utf8')
print(json.dumps({'output':str(O),'sha256':report['resultSha256'],'triangles':len(newtri),'renderVertices':len(used),'weldedVertices':len(wp),'boundaryEdges':len(topology['boundaryEdges'])}))
