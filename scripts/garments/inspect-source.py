import json,struct,collections
from pathlib import Path
D=Path('prototype/public/assets/avatar.vrm').read_bytes();l=struct.unpack_from('<I',D,12)[0];J=json.loads(D[20:20+l]);B=D[28+l:];types={5126:'f',5123:'H',5125:'I',5121:'B'};size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def acc(i):
 a=J['accessors'][i];v=J['bufferViews'][a['bufferView']];fmt='<'+types[a['componentType']]*size[a['type']];return[struct.unpack_from(fmt,B,v.get('byteOffset',0)+a.get('byteOffset',0)+k*v.get('byteStride',struct.calcsize(fmt)))for k in range(a['count'])]
p=J['meshes'][0]['primitives'][1];V=acc(p['attributes']['POSITION']);I=[x[0]for x in acc(p['indices'])];keys={};remap=[];P=[]
for v in V:
 k=tuple(round(x,6)for x in v)
 if k not in keys:keys[k]=len(P);P.append(v)
 remap.append(keys[k])
E=collections.Counter()
for i in range(0,len(I),3):
 t=[remap[z]for z in I[i:i+3]]
 for a,b in zip(t,t[1:]+t[:1]):E[tuple(sorted([a,b]))]+=1
boundary=[e for e,n in E.items()if n==1];adj=collections.defaultdict(list)
for a,b in boundary:adj[a].append(b);adj[b].append(a)
components=[];seen=set()
for a in adj:
 if a in seen:continue
 stack=[a];out=[]
 while stack:
  x=stack.pop()
  if x in seen:continue
  seen.add(x);out.append(x);stack.extend(adj[x])
 components.append(out)
print('shorts nodes',J['nodes'][0]);print('welded',len(P),'triangles',len(I)//3,'boundary',len(boundary),'degrees',collections.Counter(len(x)for x in adj.values()))
for c in components:print('loop',len(c),'min',[min(P[i][q]for i in c)for q in range(3)],'max',[max(P[i][q]for i in c)for q in range(3)])
print('used bones',[(i,J['nodes'][n]['name'])for i,n in enumerate(J['skins'][0]['joints'])]);Path('assets-source/garments/shorts-topology-audit.json').write_text(json.dumps({'originalVertices':len(V),'weldedVertices':len(P),'triangles':len(I)//3,'boundaryEdges':len(boundary),'components':[[list(P[i])for i in c]for c in components]},indent=2))
