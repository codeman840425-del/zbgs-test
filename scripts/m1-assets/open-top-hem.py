"""Remove independently verified internal top hem cap, not visible sidewalls.
Keeps tie primitive and original source bytes untouched. No Blender/runtime.
"""
import collections,copy,hashlib,json,pathlib,struct
import numpy as np
R=pathlib.Path(__file__).resolve().parents[2];S=R/'prototype/public/assets/m1/m1-uniform-top.glb';O=R/'assets-source/m1/offline-corrective/open-waist-v1';O.mkdir(parents=True,exist_ok=True)
raw=S.read_bytes();sha=hashlib.sha256(raw).hexdigest();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);binary=raw[28+n:]
assert sha=='27bcfe020828ad2603f618fabf7f21cf1b09f66035c8ecd740e78cfc3650b9d6','Source top changed; requalify exact cap selection'
def acc(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
p=d['meshes'][0]['primitives'][0];a={k:acc(i)for k,i in p['attributes'].items()};tri=acc(p['indices']).reshape(-1,3);pos=a['POSITION']
keys={};mp=[];wp=[]
for v in pos:
 key=tuple(np.round(v.astype(float),6))
 if key not in keys:keys[key]=len(wp);wp.append(v)
 mp.append(keys[key])
mp=np.array(mp);wp=np.array(wp);wt=mp[tri];center=int(mp[536]);faces=np.flatnonzero(np.any(wt==center,axis=1));expected=[748,753,755,757,768,772,774,788,804,811,821,827,829,847,1183,1187,1223,1242,1267,1280]
assert faces.tolist()==expected,'Changed source: recheck hem fan before editing'
ring=sorted(int(x)for x in set(wt[faces].ravel())-{center});assert len(ring)==20
degree=collections.Counter(i for f in wt[faces]for i in f if i!=center);assert all(x==2 for x in degree.values())
kept=np.delete(tri,faces,axis=0);used=np.unique(kept);remap=np.full(len(pos),-1);remap[used]=np.arange(len(used));newtri=remap[kept]
doc=copy.deepcopy(d);blob=bytearray(binary[:d['buffers'][0]['byteLength']])
def append(array,old):
 blob.extend(b'\0'*(-len(blob)%4));view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':array.nbytes});blob.extend(array.tobytes());item={k:copy.deepcopy(v)for k,v in d['accessors'][old].items()if k not in ['bufferView','byteOffset','count','min','max']};item.update(bufferView=view,count=len(array))
 if item['type']=='VEC3':item.update(min=array.min(0).tolist(),max=array.max(0).tolist())
 i=len(doc['accessors']);doc['accessors'].append(item);return i
q=doc['meshes'][0]['primitives'][0];q['attributes']={k:append(v[used],p['attributes'][k])for k,v in a.items()};q['indices']=append(newtri.astype(acc(p['indices']).dtype).reshape(-1,1),p['indices']);doc['buffers'][0]['byteLength']=len(blob)
doc['asset']['generator']='zbgs isolated top hem opening; surviving sidewall/tie/skin exact';doc.setdefault('extras',{})['isolatedTopologyEdit']={'sourceSha256':sha,'removedOriginalTriangleIndices':faces.tolist(),'reason':'Verified internal 20-face hem fan crossing body/overlapping skirt; preserve visible sidewall, rim thickness and tie'}
jb=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*(-len(jb)%4);blob+=b'\0'*(-len(blob)%4);out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob
(O/'m1-uniform-top-open-hem.glb').write_bytes(out)
nn=struct.unpack_from('<I',out,12)[0];rd=json.loads(out[20:20+nn]);rb=out[28+nn:];rp=rd['meshes'][0]['primitives'][0]
for k,v in a.items():
 ai=rd['accessors'][rp['attributes'][k]];bv=rd['bufferViews'][ai['bufferView']];actual=np.frombuffer(rb,dtype=v.dtype,count=v[used].size,offset=bv['byteOffset']).reshape(v[used].shape);assert np.array_equal(actual,v[used]),k
assert rd['skins']==d['skins'] and rd['nodes']==d['nodes'] and rd['materials']==d['materials'] and rd['meshes'][0]['primitives'][1]==d['meshes'][0]['primitives'][1]
skin=d['skins'][0];names=[d['nodes'][i]['name']for i in skin['joints']];inverse=acc(skin['inverseBindMatrices'])[names.index('J_Bip_C_Hips')].reshape(4,4).T;hip=(np.c_[wp,np.ones(len(wp))]@inverse.T)[:,:3]
report={'schema':'m1.isolated-top-hem-opening.1','source':str(S.relative_to(R)),'sourceSha256':sha,'resultSha256':hashlib.sha256(out).hexdigest(),'removedOriginalFaces':faces.tolist(),'removedOriginalRenderTriangles':tri[faces].tolist(),'removedOriginalWeldedTriangles':wt[faces].tolist(),'hemCenterOriginalWeldedIndex':center,'hemCenterOriginalRenderIndices':np.flatnonzero(mp==center).tolist(),'hemCenterHipLocal':hip[center].tolist(),'hemRingOriginalWeldedIndices':ring,'hemRingHipLocal':hip[ring].tolist(),'resultRenderVertexToOriginal':used.tolist(),'resultTopTriangles':len(newtri),'resultTopVertices':len(used),'survivingAttributesExact':list(a),'skinNodesMaterialsTieExact':True,'originalSourceUnchanged':hashlib.sha256(S.read_bytes()).hexdigest()==sha,'limits':['Only source topology opening','No body/sidewall/tie removal','No cloth or runtime acceptance']}
(O/'top-edit.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:report[k]for k in ['sourceSha256','resultSha256','resultTopTriangles','resultTopVertices','originalSourceUnchanged']}))
