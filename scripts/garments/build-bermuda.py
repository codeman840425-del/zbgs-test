"""Deterministically build a separately loadable skinned bermuda garment.
Python 3 + numpy + scipy. Input is immutable fixed-SHA VRM, never modified.
"""
import argparse, collections, hashlib, json, math, pathlib, struct
import numpy as np
from scipy.spatial import cKDTree
ROOT=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--spec',default='assets-source/garments/athletic-bermuda-v1.json');parser.add_argument('--output-dir',default='prototype/public/assets/garments');parser.add_argument('--report',default='assets-source/garments/build-report.json');args=parser.parse_args()
spec=json.loads((ROOT/args.spec).read_text(encoding='utf-8-sig'))
source=(ROOT/spec['sourceAvatar']).read_bytes();assert hashlib.sha256(source).hexdigest()==spec['sourceSha256'],'Wrong avatar: do not silently fit another body'
n=struct.unpack_from('<I',source,12)[0];src=json.loads(source[20:20+n]);binary=source[28+n:]
formats={5121:'B',5123:'H',5125:'I',5126:'f'};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def accessor(i):
 a=src['accessors'][i];v=src['bufferViews'][a['bufferView']];fmt='<'+formats[a['componentType']]*sizes[a['type']];return np.array([struct.unpack_from(fmt,binary,v.get('byteOffset',0)+a.get('byteOffset',0)+k*v.get('byteStride',struct.calcsize(fmt)))for k in range(a['count'])])
def weight(ids,values):return{int(i):float(w)for i,w in zip(ids,values)if w>1e-8}
def blend(a,b,t):
 out={k:a.get(k,0)*(1-t)+b.get(k,0)*t for k in a.keys()|b.keys()};out=dict(sorted(out.items(),key=lambda kv:(-kv[1],kv[0]))[:4]);total=sum(out.values());return{k:v/total for k,v in out.items()if v>1e-8}
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
p=src['meshes'][spec['sourceMesh']]['primitives'][spec['sourcePrimitive']];assert src['materials'][p['material']]['name']=='Bottoms_01_CLOTH'
raw=accessor(p['attributes']['POSITION']);rawnormal=accessor(p['attributes']['NORMAL']);rawj=accessor(p['attributes']['JOINTS_0']);raww=accessor(p['attributes']['WEIGHTS_0']);rawids=accessor(p['indices']).reshape(-1)
# Weld actual source seams by rest-space position, preserving the fitted crotch.
keys={};groups=[];remap=[]
for i,v in enumerate(raw):
 key=tuple(np.round(v,6))
 if key not in keys:keys[key]=len(groups);groups.append([])
 groups[keys[key]].append(i);remap.append(keys[key])
verts=[];weights=[]
for group in groups:
 pos=np.mean(raw[group],axis=0);normal=np.mean(rawnormal[group],axis=0);normal/=max(np.linalg.norm(normal),1e-12)
 fade=smooth((pos[1]-spec['waistClearanceTransitionY'][0])/(spec['waistClearanceTransitionY'][1]-spec['waistClearanceTransitionY'][0]))
 clearance=spec['shellClearanceM']*(1-fade)+spec['upperWaistClearanceM']*fade
 offset=pos+normal*clearance
 if abs(pos[0])>.0001 and pos[1]<.79:offset[0]=math.copysign(max(spec['innerLegHalfGapM'],abs(offset[0])),pos[0])
 verts.append(offset);w={}
 for i in group:
  for j,x in weight(rawj[i],raww[i]).items():w[j]=w.get(j,0)+x/len(group)
 weights.append(blend(w,{},0))
triangles=[tuple(remap[i]for i in rawids[k:k+3])for k in range(0,len(rawids),3)]
for _ in range(spec['upperSubdivisionPasses']):
 midpoint={};refined=[]
 def mid(a,b):
  key=tuple(sorted((a,b)))
  if key not in midpoint:midpoint[key]=len(verts);verts.append((verts[a]+verts[b])/2);weights.append(blend(weights[a],weights[b],.5))
  return midpoint[key]
 for a,b,c in triangles:
  ab,bc,ca=mid(a,b),mid(b,c),mid(c,a);refined.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
 triangles=refined
# Exactly two 24-edge hem loops; a new source must pass the topology gate.
counts=collections.Counter();directed={}
for tri in triangles:
 for a,b in zip(tri,tri[1:]+tri[:1]):key=tuple(sorted((a,b)));counts[key]+=1;directed[key]=(a,b)
next_edge={a:b for e,c in counts.items()if c==1 for a,b in [directed[e]]};loops=[];seen=set()
for start in sorted(next_edge):
 if start in seen:continue
 loop=[];at=start
 while at not in seen:seen.add(at);loop.append(at);at=next_edge[at]
 assert at==start,'Non-manifold source hem';loops.append(loop)
assert len(loops)==2 and all(len(x)==24 for x in loops),'Source no longer has two expected open leg hems'
body=src['meshes'][0]['primitives'][0];bodyv=accessor(body['attributes']['POSITION']);bodyj=accessor(body['attributes']['JOINTS_0']);bodyw=accessor(body['attributes']['WEIGHTS_0']);trees={}
for sign in [-1,1]:
 selected=np.where((bodyv[:,1]>.39)&(bodyv[:,1]<.83)&(bodyv[:,0]*sign>.001))[0];trees[sign]=(cKDTree(bodyv[selected]),selected)
def body_weights(point,sign):
 tree,indices=trees[sign];distance,near=tree.query(point,k=spec['bodyWeightNearestVertices']);scores=1/np.maximum(distance,.002)**2;scores/=scores.sum();out={}
 for i,f in zip(indices[near],scores):
  for j,w in weight(bodyj[i],bodyw[i]).items():out[j]=out.get(j,0)+w*f
 return blend(out,{},0)
sections=[triangles,[],[]];ring_groups=[]
def append_ring(points,ws):
 ids=list(range(len(verts),len(verts)+len(points)));verts.extend(points);weights.extend(ws);return ids

def stitch(a,b,material):
 for k in range(len(a)):
  q=(k+1)%len(a);sections[material].extend([(a[q],a[k],b[k]),(a[q],b[k],b[q])])
for loop in loops:
 start=np.array([verts[i]for i in loop]);sign=1 if np.mean(start[:,0])>0 else -1
 centre=np.mean(start,axis=0);rest=[weights[i]for i in loop];rings=[loop];previous=loop
 for r in range(1,spec['extensionRings']+1):
  t=r/spec['extensionRings'];radial=1+(spec['hemRadialScale']-1)*smooth(t)+spec['easeBulge']*math.sin(math.pi*t)
  points=[];ws=[]
  for k,point in enumerate(start):
   v=point.copy();v[0]=centre[0]+(point[0]-centre[0])*radial;v[2]=centre[2]+(point[2]-centre[2])*radial
   v[1]=point[1]*(1-t)+spec['hemHeightM']*t
   theta=math.atan2(point[2]-centre[2],point[0]-centre[0]);crease=spec['creaseDepthM']*math.sin(theta*3+2*t)*math.sin(math.pi*t)
   v[0]+=math.cos(theta)*crease;v[2]+=math.sin(theta)*crease
   points.append(v);ws.append(blend(rest[k],body_weights(v,sign),smooth((t-.05)/.7)))
  current=append_ring(points,ws);stitch(previous,current,1 if t>.9 else 0);rings.append(current);previous=current
 # An actual 3 mm hem thickness and 18 mm folded inner return, not a flat ring decal.
 hem=np.array([verts[i]for i in previous]);hws=[weights[i]for i in previous]
 for up in [0,spec['cuffHeightM']]:
  points=[]
  for v in hem:
   point=v.copy();out=point[[0,2]]-centre[[0,2]];out/=np.linalg.norm(out);point[[0,2]]-=out*spec['cuffThicknessM'];point[1]+=up;points.append(point)
  current=append_ring(points,hws);stitch(previous,current,1);previous=current
 # Separate narrow outer side-tape surface, sharing interpolated garment skinning.
 outer=int(np.argmax(start[:,0]*sign));tape=[]
 for ring in rings[:-1]:
  band=[]
  for side in [-1,1]:
   x=outer+side*spec['sideTapeHalfSegments'];low=math.floor(x);f=x-low;a=ring[low%len(ring)];b=ring[(low+1)%len(ring)];point=verts[a]*(1-f)+verts[b]*f;point=point.copy();point[0]+=sign*spec['sideTapeOffsetM'];band.append(len(verts));verts.append(point);weights.append(blend(weights[a],weights[b],f))
  tape.append(band)
 for a,b in zip(tape,tape[1:]):sections[2].extend([(a[0],a[1],b[0]),(a[1],b[1],b[0])])
 ring_groups.append({'side':'left'if sign>0 else 'right','ringCount':len(rings),'hemEdges':len(loop)})
V=np.array(verts,dtype=np.float32);normals=np.zeros_like(V,dtype=np.float64)
for section in sections:
 for a,b,c in section:
  n=np.cross(V[b]-V[a],V[c]-V[a]);normals[a]+=n;normals[b]+=n;normals[c]+=n
normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
# Export only weighted joints but retain their original ancestor hierarchy.
used=sorted({j for w in weights for j,x in w.items()if x>1e-8});joint_remap={j:i for i,j in enumerate(used)};source_skin=src['skins'][spec['sourceSkin']]
parents={c:i for i,n in enumerate(src['nodes'])for c in n.get('children',[])};needed=set(source_skin['joints'][j]for j in used)
for i in list(needed):
 while i in parents:i=parents[i];needed.add(i)
node_ids={old:i+1 for i,old in enumerate(sorted(needed))};nodes=[{'name':'AthleticBermuda','mesh':0,'skin':0}]
for old in sorted(needed):
 node={k:v for k,v in src['nodes'][old].items()if k in ['name','translation','rotation','scale','matrix']};children=[node_ids[c]for c in src['nodes'][old].get('children',[])if c in needed]
 if children:node['children']=children
 nodes.append(node)
J=np.zeros((len(V),4),dtype=np.uint16);W=np.zeros((len(V),4),dtype=np.float32)
for i,w in enumerate(weights):
 for k,(joint,value)in enumerate(sorted(w.items(),key=lambda kv:(-kv[1],kv[0]))):J[i,k]=joint_remap[joint];W[i,k]=value
W/=W.sum(axis=1,keepdims=True)
ibm=accessor(source_skin['inverseBindMatrices'])[used].astype(np.float32)
blob=bytearray();views=[];accessors=[]
def write(array,component,typ,target=None):
 while len(blob)%4:blob.append(0)
 offset=len(blob);data=array.tobytes();blob.extend(data);view={'buffer':0,'byteOffset':offset,'byteLength':len(data)}
 if target:view['target']=target
 vi=len(views);views.append(view);a={'bufferView':vi,'componentType':component,'count':len(array),'type':typ}
 if typ=='VEC3'and component==5126:a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
 ai=len(accessors);accessors.append(a);return ai
attrs={'POSITION':write(V,5126,'VEC3',34962),'NORMAL':write(normals.astype(np.float32),5126,'VEC3',34962),'JOINTS_0':write(J,5123,'VEC4',34962),'WEIGHTS_0':write(W,5126,'VEC4',34962)}
primitives=[{'attributes':attrs,'indices':write(np.array(section,dtype=np.uint32).reshape(-1,1),5125,'SCALAR',34963),'material':i}for i,section in enumerate(sections)]
ibma=write(ibm,5126,'MAT4');meta=src['extensions']['VRMC_vrm']['meta'];meta={k:v for k,v in meta.items()if k!='thumbnailImage'}
human=src['extensions']['VRMC_vrm']['humanoid']['humanBones'];semantic={v['node']:k for k,v in human.items()}
bindings=[{'sourceBone':src['nodes'][source_skin['joints'][j]]['name'],'targetRawBone':src['nodes'][source_skin['joints'][j]]['name'],'humanoidSemantic':semantic.get(source_skin['joints'][j]),'inverseBindMatrix':ibm[i].tolist()}for i,j in enumerate(used)]
materials=[{'name':f'Bermuda_{key}','pbrMetallicRoughness':{'baseColorFactor':spec['material'][key],'metallicFactor':0,'roughnessFactor':spec['material']['roughness']},'doubleSided':True}for key in ['cloth','cuff','tape']]
out={'asset':{'version':'2.0','generator':'zbgs deterministic garment builder v1','copyright':'(c) 2022 pixiv Inc.; modified garment pattern by zbgs project'},'scene':0,'scenes':[{'nodes':[0]+[node_ids[i]for i in sorted(needed)if parents.get(i)not in needed]}],'nodes':nodes,'skins':[{'joints':[node_ids[source_skin['joints'][j]]for j in used],'inverseBindMatrices':ibma}],'meshes':[{'name':'AthleticBermuda','primitives':primitives}],'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors,'extras':{'garmentId':spec['id'],'sourceAvatarSha256':spec['sourceSha256'],'sourceLicense':meta,'modification':spec['method'],'limits':spec['adaptation']}}
json_bytes=json.dumps(out,ensure_ascii=False,separators=(',',':')).encode();json_bytes+=b' '*((-len(json_bytes))%4);blob+=b'\0'*((-len(blob))%4);glb=struct.pack('<4sII',b'glTF',2,12+8+len(json_bytes)+8+len(blob))+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(blob),b'BIN\0')+blob
folder=ROOT/args.output_dir;folder.mkdir(parents=True,exist_ok=True);target=folder/(spec['id']+'.glb');target.write_bytes(glb)
entry={'id':spec['id'],'name':spec['name'],'slot':'bottoms-overlay','url':target.name,'sha256':hashlib.sha256(glb).hexdigest(),'bytes':len(glb),'compatibleAvatarSha256':spec['sourceSha256'],'preserveOriginalMeshes':True,'requiresRawSkeleton':True,'bindings':bindings,'limits':[spec['adaptation'],'Skinned fitted garment, no independent cloth simulation or arbitrary body fitting','Original body, shorts and shirt must remain visible for acceptance; no mesh deletion policy'],'sourceLicense':meta}
(folder/'equipment.json').write_text(json.dumps({'schema':'zbgs-equipment-v1','items':[entry]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'id':spec['id'],'sourceSha256':spec['sourceSha256'],'outputSha256':entry['sha256'],'bytes':len(glb),'vertices':len(V),'triangles':sum(len(s)for s in sections),'weightedJoints':len(used),'multiBoneVertices':int(np.count_nonzero(np.count_nonzero(W>.001,axis=1)>1)),'maxWeightSumError':float(np.max(np.abs(W.sum(axis=1)-1))),'bounds':[V.min(axis=0).tolist(),V.max(axis=0).tolist()],'rings':ring_groups,'materials':[m['name']for m in materials],'sourceMeta':meta}
(ROOT/args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
