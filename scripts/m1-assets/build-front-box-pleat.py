"""One isolated source pattern sample; never writes production assets or solver.
Normative editable input: parameters + original GLB + this script.
"""
from pathlib import Path
import json,struct,copy,hashlib,collections,gzip
import numpy as np
R=Path(__file__).resolve().parents[2];O=R/'assets-source/m1/front-box-pleat-v1';O.mkdir(exist_ok=True)
P=O/'parameters.json'
if not P.exists():
 P.write_text(json.dumps({'schema':'m1.source-front-box-pleat.1','id':'m1-front-box-pleat-v1','source':'prototype/public/assets/m1/m1-uniform-skirt.glb','sourceSha256':'065305626976c59b370d082baa6fd1e2aed8c262490e04e39543345170eb8d8d','bodySha256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','seamWeldedIds':[76,64,62,60,58,54,55],'pinThresholdHipY':.09,'outerOverlapEachSideMetres':.012,'outerLayerSpacingMetres':.0015,'underlayHalfWidthMetres':.028,'underlayInsetMetres':.006,'underlayColumns':[-1,0,1],'limits':['Single unaccepted source sample; no pose compensation','Preserves original waist cap, pins, back and all body geometry','Current pointwise solver may still force hard folds; no predicted visual pass']},indent=2)+'\n',encoding='utf-8')
cfg=json.loads(P.read_text(encoding='utf-8'));raw=(R/cfg['source']).read_bytes();sha=lambda b:hashlib.sha256(b).hexdigest();assert sha(raw)==cfg['sourceSha256']
n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 return np.ndarray((a['count'],w),dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
prim=doc['meshes'][0]['primitives'][0];attrs={k:read(i)for k,i in prim['attributes'].items()};oldtri=read(prim['indices']).reshape(-1,3);topologyBundle=R/'assets-source/m1/seated-front-v1/input';topologyRecord=json.loads((topologyBundle/'manifest.json').read_text(encoding='utf-8'))['files']['source-topology.json'];topologyBytes=gzip.decompress((topologyBundle/'source-topology.json.gz').read_bytes());assert sha(topologyBytes)==topologyRecord['sha256'];topo=json.loads(topologyBytes)
assert topo['sha256']==sha(raw);mp=np.array(topo['renderToWeld']);hp=np.array(topo['hipLocalPosition']);rp=hp[mp];seam=cfg['seamWeldedIds'];edges={tuple(sorted((int(a),int(b))))for t in np.array(topo['triangles'])for a,b in zip(t,np.roll(t,-1))};assert all(tuple(sorted(e))in edges for e in zip(seam,seam[1:]));assert hp[seam[0],1]>=cfg['pinThresholdHipY']
skin=doc['skins'][0];names=[doc['nodes'][i]['name']for i in skin['joints']];inv=read(skin['inverseBindMatrices'])[names.index('J_Bip_C_Hips')].reshape(4,4).T;bind=np.linalg.inv(inv)
assert np.max(np.abs((np.c_[attrs['POSITION'],np.ones(len(mp))]@inv.T)[:,:3]-rp))<1e-6
out={k:list(v.copy())for k,v in attrs.items()};positions=list(rp.copy());origins=[{'sourceRender':i,'kind':'original'}for i in range(len(mp))];faces=oldtri.tolist();seamSet=set(seam[1:]);duplicate={};changed=[]
depth=max(hp[seam[0],1]-hp[seam[-1],1],1e-8)
def amount(p):
 t=np.clip((hp[seam[0],1]-p[1])/depth,0,1);return float(t*t*(3-2*t))
# Split by adjacent face side; duplicated coincident vertices are moved apart,
# so the existing position-based solver cannot silently weld the seam back.
for f,t in enumerate(oldtri):
 if rp[t,2].mean()>=-.06 or rp[t,0].mean()<=0:continue
 for c,i in enumerate(t):
  if mp[i]not in seamSet:continue
  if int(i)not in duplicate:
   q=len(positions);duplicate[int(i)]=q
   for k in out:out[k].append(attrs[k][i].copy())
   positions.append(rp[i].copy());origins.append({'sourceRender':int(i),'kind':'split-right-edge'})
  faces[f][c]=duplicate[int(i)]
for i in range(len(mp)):
 if mp[i]not in seamSet:continue
 weight=amount(rp[i]);positions[i][0]+=cfg['outerOverlapEachSideMetres']*weight;positions[i][2]-=cfg['outerLayerSpacingMetres']*weight;changed.append(i)
for i,q in duplicate.items():
 weight=amount(rp[i]);positions[q][0]-=cfg['outerOverlapEachSideMetres']*weight;positions[q][2]-=cfg['outerLayerSpacingMetres']*2*weight;changed.append(q)
front=[(f,t)for f,t in enumerate(oldtri)if np.all(rp[t,2]<-.06)]
def sample(x,y):
 options=[]
 for f,t in front:
  v=rp[t];a=np.vstack([v[:,:2].T,np.ones(3)])
  if abs(np.linalg.det(a))<1e-12:continue
  b=np.linalg.solve(a,np.array([x,y,1.]));
  if b.min()>=-1e-6 and b.max()<=1+1e-6:options.append((float(b@v[:,2]),f,t,b))
 assert options,('No original front triangle for underlay sample',x,y)
 return min(options,key=lambda q:q[0])
underlay=[];underlayStart=len(faces);underlaySamples=[]
for row,weld in enumerate(seam):
 ids=[];y=hp[weld,1]
 for col,factor in enumerate(cfg['underlayColumns']):
  if row==0:
   # Same exact existing three real pin vertices; a sewn top edge, not a loose patch.
   anchor=[205,76,77][col];i=int(np.flatnonzero(mp==anchor)[0]);ids.append(i);continue
  # Avoid points outside the slightly uneven source hem: keep bottom row at
  # source y of inner central hem, then match actual source sampled surface.
  targetY=max(float(y),-.184)
  z,f,t,b=sample(factor*cfg['underlayHalfWidthMetres'],targetY)
  local=b@rp[t];local[2]+=cfg['underlayInsetMetres']*amount(local)
  q=len(positions);positions.append(local);ids.append(q);underlaySamples.append({'renderVertex':q,'sourceFace':int(f),'barycentric':b.tolist()})
  for k in out:
   if k in ['JOINTS_0','WEIGHTS_0']:continue
   out[k].append((b@attrs[k][t]).astype(attrs[k].dtype))
  weights=collections.Counter()
  for idx,v in zip(t,b):
   for j,w in zip(attrs['JOINTS_0'][idx],attrs['WEIGHTS_0'][idx]):weights[int(j)]+=float(v*w)
  selected=sorted(((j,w)for j,w in weights.items()if w>1e-9),key=lambda p:(-p[1],p[0]))[:4];total=sum(w for j,w in selected);assert total>0, 'No source skin weights'
  out['JOINTS_0'].append(np.array([j for j,w in selected]+[0]*(4-len(selected)),dtype=attrs['JOINTS_0'].dtype));out['WEIGHTS_0'].append(np.array([w/total for j,w in selected]+[0]*(4-len(selected)),dtype=attrs['WEIGHTS_0'].dtype));origins.append({'kind':'real-underlay','sourceFace':int(f),'barycentric':b.tolist(),'weightRetainedBeforeNormalize':total})
 underlay.append(ids)
for upper,lower in zip(underlay,underlay[1:]):
 for c in range(len(upper)-1):faces.extend([[upper[c],lower[c],lower[c+1]],[upper[c],lower[c+1],upper[c+1]]])
positions=np.array(positions);faces=np.array(faces,dtype=read(prim['indices']).dtype)
for k in out:out[k]=np.asarray(out[k],dtype=attrs[k].dtype)
newP=(np.c_[positions,np.ones(len(positions))]@bind.T)[:,:3].astype('<f4');out['POSITION']=newP
# Area normals only around the actual edited panel/underlay, preserve all other original shading.
normalSum=np.zeros_like(newP,dtype='f8');affected=set(changed)|set(range(len(mp),len(positions)))
for f,t in enumerate(faces):
 p=newP[t];normal=np.cross(p[1]-p[0],p[2]-p[0]);assert np.linalg.norm(normal)>1e-10,('Degenerate face',f)
 for i in t:normalSum[i]+=normal
 if f>=underlayStart or any(i in affected for i in t):affected.update(int(i)for i in t)
for i in affected:
 length=np.linalg.norm(normalSum[i])
 if length<=1e-12:
  assert i not in faces, ('Referenced zero normal',i);continue
 out['NORMAL'][i]=normalSum[i]/length
pins=np.flatnonzero(rp[:,1]>=cfg['pinThresholdHipY']);back=np.flatnonzero(rp[:,2]>=0)
assert np.array_equal(out['POSITION'][pins],attrs['POSITION'][pins]);assert np.array_equal(out['POSITION'][back],attrs['POSITION'][back]);assert np.array_equal(out['WEIGHTS_0'][:len(mp)],attrs['WEIGHTS_0']);assert np.max(np.abs(out['WEIGHTS_0'].sum(1)-1))<1e-6
# Append buffers: original materials, image bytes, joints, nodes and IBM retained verbatim.
result=copy.deepcopy(doc);blob=bytearray(binary[:doc['buffers'][0]['byteLength']])
def append(array,old):
 blob.extend(b'\0'*(-len(blob)%4));view=len(result['bufferViews']);result['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':array.nbytes});blob.extend(array.tobytes());a={k:copy.deepcopy(v)for k,v in doc['accessors'][old].items()if k not in ['bufferView','byteOffset','count','min','max']};a.update(bufferView=view,count=len(array))
 if a['type']=='VEC3':a.update(min=array.min(0).tolist(),max=array.max(0).tolist())
 index=len(result['accessors']);result['accessors'].append(a);return index
q=result['meshes'][0]['primitives'][0];q['attributes']={k:append(a,prim['attributes'][k])for k,a in out.items()};q['indices']=append(faces.reshape(-1,1),prim['indices']);result['nodes'][0]['name']=cfg['id'];result['meshes'][0]['name']=cfg['id'];result['buffers'][0]['byteLength']=len(blob);result['asset']['generator']='zbgs isolated editable front-box-pleat-v1'
result.setdefault('extras',{})['patternEdit']={'sourceSha256':sha(raw),'parametersSha256':sha(P.read_bytes()),'method':'Existing front centre edge split, graduated overlapping outer panels, actual weighted/UV-mapped inset cloth sewn to existing waist pins','notAccepted':['standing contacts','visual appearance','sitting','runtime integration']}
jb=json.dumps(result,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*(-len(jb)%4);blob+=b'\0'*(-len(blob)%4);export=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob;(O/(cfg['id']+'.glb')).write_bytes(export)
item=next(i for i in json.loads((R/'prototype/public/assets/m1/equipment.json').read_text(encoding='utf-8'))['items']if i['id']=='m1-uniform-skirt');item=copy.deepcopy(item);item.update(id=cfg['id'],name='前开箱褶隔离失败门样件',url=cfg['id']+'.glb',sha256=sha(export),bytes=len(export),styleId='front-overlap-box-pleat-v1',fitId='female-027bed-front-box-pleat-v1',method=result['extras']['patternEdit']['method']);item['stats'].update(vertices=len(positions),triangles=len(faces),multiBoneVertices=int(np.count_nonzero(np.count_nonzero(out['WEIGHTS_0']>.001,axis=1)>1)));item['limits']+=['Isolated pattern candidate; source/bind gate is not a runtime or visual acceptance']
(O/'equipment.json').write_text(json.dumps({'schema':'zbgs-equipment-v1','items':[item]},indent=2)+'\n',encoding='utf-8')
lookup={};mapping=[];weld=[]
for v in positions:
 key=tuple(np.round(v,6))
 if key not in lookup:lookup[key]=len(weld);weld.append(v.tolist())
 mapping.append(lookup[key])
(O/'topology.json').write_text(json.dumps({'sha256':sha(export),'renderToWeld':mapping,'hipLocalPosition':weld,'renderTriangles':faces.tolist(),'uv':out['TEXCOORD_0'].tolist(),'underlayFaceStart':underlayStart,'originalVertexCount':len(mp),'origins':origins},separators=(',',':')),encoding='utf-8')
report={'sourceSha256':sha(raw),'outputSha256':sha(export),'parametersSha256':sha(P.read_bytes()),'vertices':[len(mp),len(positions)],'triangles':[len(oldtri),len(faces)],'splitOriginalRenderVertices':duplicate,'seamOriginalWeldedIndices':seam,'preservedPinRenderVertices':pins.tolist(),'preservedBackRenderVertices':back.tolist(),'originalUVWeightArraysExact':True,'skinAndBindMatricesExact':True,'originalBodyUntouched':True,'underlaySamples':underlaySamples,'allFinite':all(np.all(np.isfinite(v))for v in out.values()),'maxWeightSumError':float(np.abs(out['WEIGHTS_0'].sum(1)-1).max()),'maxInterpolatedWeightDropped':max(1-x.get('weightRetainedBeforeNormalize',1) for x in origins),'gate':'source-export-only-not-standing-contact-pass'}
report['weightTransferGate']='reject-four-influence-loss-over-one-percent' if report['maxInterpolatedWeightDropped']>.01 else 'within-one-percent-transfer-loss'
(O/'build-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
with (O/'editable-pattern.obj').open('w',encoding='utf-8')as f:
 f.write('# Actual weighted GLB is normative; OBJ is editable pattern preview, no bones\n')
 for p in newP:f.write('v '+' '.join(map(str,p))+'\n')
 for uv in out['TEXCOORD_0']:f.write('vt '+' '.join(map(str,uv))+'\n')
 for tri in faces:f.write('f '+' '.join(f'{i+1}/{i+1}'for i in tri)+'\n')
assert sha((R/cfg['source']).read_bytes())==cfg['sourceSha256'];print(json.dumps({k:report[k]for k in ['outputSha256','vertices','triangles','maxWeightSumError','gate']}))
