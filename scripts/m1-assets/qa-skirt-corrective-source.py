"""Bounded read-only source topology audit; no Blender/browser or product edits."""
import collections, hashlib, json, pathlib, struct
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT/'prototype/public/assets/m1/m1-uniform-skirt.glb'
OUT=ROOT/'experiments/skirt-offline-corrective'
raw=SOURCE.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def acc(i):
    a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
    dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
    w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    return np.ndarray((a['count'],w),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()

primitive=doc['meshes'][0]['primitives'][0];p=acc(primitive['attributes']['POSITION']);tri=acc(primitive['indices']).reshape(-1,3)
used=np.unique(tri);keys={};weld=[];mapping=[]
for v in p:
    key=tuple(np.round(v.astype(float),6))
    if key not in keys:keys[key]=len(weld);weld.append(v.astype(float))
    mapping.append(keys[key])
mapping=np.array(mapping);weld=np.array(weld);faces=mapping[tri]
edges=collections.Counter(tuple(sorted((int(a),int(b))))for t in faces for a,b in zip(t,np.roll(t,-1)))
adj=[set()for _ in weld]
for a,b in edges:adj[a].add(b);adj[b].add(a)
remaining=set(range(len(weld)));components=[]
while remaining:
    todo=[remaining.pop()];group=[]
    while todo:
        a=todo.pop();group.append(a)
        for b in adj[a]&remaining:remaining.remove(b);todo.append(b)
    components.append(group)
boundary=[e for e,count in edges.items()if count==1]
normal=np.cross(weld[faces[:,1]]-weld[faces[:,0]],weld[faces[:,2]]-weld[faces[:,0]])
area=np.linalg.norm(normal,axis=1)/2
edgefaces=collections.defaultdict(list)
for f,t in enumerate(faces):
    for a,b in zip(t,np.roll(t,-1)):edgefaces[tuple(sorted((int(a),int(b))))].append(f)
unit=normal/np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-15)
dihedral=[float(np.degrees(np.arccos(np.clip(unit[fs[0]]@unit[fs[1]],-1,1))))for fs in edgefaces.values()if len(fs)==2]
skin=doc['skins'][0];names=[doc['nodes'][i]['name']for i in skin['joints']]
j=acc(primitive['attributes']['JOINTS_0']).astype(int);w=acc(primitive['attributes']['WEIGHTS_0'])
hip=names.index('J_Bip_C_Hips');inverse=acc(skin['inverseBindMatrices'])[hip].reshape(4,4).T
hipLocal=(np.column_stack([weld,np.ones(len(weld))])@inverse.T)[:,:3]
weighted={name:{'vertexCount':int(np.count_nonzero(np.sum(np.where(j==k,w,0),axis=1)>.001)),'maxWeight':float(np.max(np.sum(np.where(j==k,w,0),axis=1)))}for k,name in enumerate(names)}
report={'status':'source-audit-only-not-a-shaped-candidate','source':str(SOURCE.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest(),'sourceVertices':len(p),'indexedVertices':len(used),'weldedVertices':len(weld),'triangles':len(tri),'components':[len(c)for c in components],'boundaryEdges':len(boundary),'nonManifoldEdges':sum(n>2 for n in edges.values()),'degenerateFaces':int(np.count_nonzero(area<1e-12)),'hipLocalBounds':[hipLocal.min(0).tolist(),hipLocal.max(0).tolist()],'sourceSharpDihedral':{'p50':float(np.percentile(dihedral,50)),'p95':float(np.percentile(dihedral,95)),'max':max(dihedral)},'sourceWeightedBones':weighted,'proposedPinBand':{'coordinate':'hips bind local +Y','fullyPinnedAbove':.09,'transitionStarts':.065,'fullPinWeldedVertices':int(np.count_nonzero(hipLocal[:,1]>=.09))},'limits':['Position welding must retain UV loop coordinates; original render vertex index map preserved.','Topology numbers do not prove cloth quality or motion contact.','No source asset, body, material or production runtime modified.']}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'source-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
(OUT/'source-topology.json').write_text(json.dumps({'sha256':report['sha256'],'position':weld.tolist(),'triangles':faces.tolist(),'renderToWeld':mapping.tolist(),'hipLocalPosition':hipLocal.tolist(),'uv':acc(primitive['attributes']['TEXCOORD_0']).tolist(),'renderTriangles':tri.tolist(),'boundaryEdges':boundary},separators=(',',':')),encoding='utf8')
print(json.dumps(report,indent=2))
