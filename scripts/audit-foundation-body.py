"""Inspect actual original skin triangles at central torso/pelvis rays, not height totals."""
import hashlib,json,pathlib,struct
ROOT=pathlib.Path(__file__).resolve().parents[1]
d=(ROOT/'prototype/public/assets/foundation/base-female.vrm').read_bytes()
n=struct.unpack_from('<I',d,12)[0];j=json.loads(d[20:20+n]);binary=d[28+n:]
formats={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def accessor(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];fmt='<'+formats[a['componentType']]*sizes[a['type']];stride=v.get('byteStride',struct.calcsize(fmt));start=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from(fmt,binary,start+k*stride) for k in range(a['count'])]
p=j['meshes'][1]['primitives'][0]
assert 'Body_00_SKIN' in j['materials'][p['material']]['name']
assert all(pr['attributes']['POSITION']==p['attributes']['POSITION'] for pr in j['meshes'][1]['primitives'] if 'Body_00_SKIN' in j['materials'][pr['material']]['name'])
vertices=accessor(p['attributes']['POSITION']);ids=[v[0] for pr in j['meshes'][1]['primitives'] if 'Body_00_SKIN' in j['materials'][pr['material']]['name'] for v in accessor(pr['indices'])];triangles=[ids[i:i+3] for i in range(0,len(ids),3)]
def probe(x,y):
 hits=[]
 for ti,ii in enumerate(triangles):
  a,b,c=[vertices[i] for i in ii];det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(det)<1e-12:continue
  u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det
  v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det;w=1-u-v
  if min(u,v,w)>=-1e-8:hits.append({'triangle':ti,'z':u*a[2]+v*b[2]+w*c[2]})
 return {'x':x,'y':y,'hits':hits,'distinctZ':sorted(set(round(h['z'],6) for h in hits))}
rays=[probe(x,y) for y in [.75,.8,.85,.9,.95,1,1.05,1.1,1.15,1.2,1.25,1.3] for x in [-.08,0,.08]]
report={'sourceSha256':hashlib.sha256(d).hexdigest(),'mesh':'Body.baked primitives 0-3 / F00_001_01_Body_00_SKIN','vertexCount':len(vertices),'triangleCount':len(triangles),'method':'Infinite Z-axis rays through fixed central rest-space X/Y; barycentric triangle-plane intersection. Tests actual triangle coverage, excludes arms outside |x|<=0.08. No hit means no surface at the ray; anatomical interpretation is needed (the gap between legs is expected).','rays':rays}
out=ROOT/'assets-source/foundation/surface-audit';out.mkdir(parents=True,exist_ok=True)
(out/'geometry.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Body triangles:',len(triangles))
for y in sorted(set(r['y'] for r in rays)):print(y,[(r['x'],len(r['distinctZ'])) for r in rays if r['y']==y])
