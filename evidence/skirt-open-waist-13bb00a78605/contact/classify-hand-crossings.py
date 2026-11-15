"""Read three stored final-surface samples, without browser or resimulation."""
from pathlib import Path
import json,gzip,hashlib,math,collections,struct
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
INPUT=OUT/'actual-surfaces.json.gz';data=json.loads(gzip.decompress(INPUT.read_bytes()))
SRC=ROOT/'experiments/rebuild-skirt-13bb-6b7fe0b/prototype'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sub=lambda a,b:[x-y for x,y in zip(a,b)]
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
cross=lambda a,b:[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
length=lambda a:math.sqrt(dot(a,a))
distance=lambda a,b:length(sub(a,b))
def edge(a,b,t):
 d=sub(b,a);e1=sub(t[1],t[0]);e2=sub(t[2],t[0]);p=cross(d,e2);det=dot(e1,p)
 if abs(det)<1e-12:return None
 s=sub(a,t[0]);u=dot(s,p)/det
 if u< -1e-7 or u>1+1e-7:return None
 q=cross(s,e1);v=dot(d,q)/det
 if v< -1e-7 or u+v>1+1e-7:return None
 z=dot(e2,q)/det
 if not 1e-6<z<1-1e-6:return None
 return {'point':[a[k]+d[k]*z for k in range(3)],'triangleBarycentric':[1-u-v,u,v],'segmentFraction':z}
def plane(points,tri):
 n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));size=length(n)
 return [dot(sub(p,tri[0]),n)/size for p in points]if size else [0,0,0]
def geometry(h):
 a=h['skinPoints'];b=h['skirtPoints'];hits=[]
 for kind,t,u in [('body-edge',a,b),('skirt-edge',b,a)]:
  for k in range(3):
   x=edge(t[k],t[(k+1)%3],u)
   if x and all(distance(x['point'],y['point'])>1e-9 for y in hits):hits.append({'kind':kind,'edge':k,**x})
 points=[x['point']for x in hits];pair=max(((p,q)for p in points for q in points),key=lambda pq:distance(*pq))if points else ([],[])
 span=distance(*pair)if points else 0;da=plane(a,b);db=plane(b,a)
 return {'lineLength':span,'lineEndpoints':pair,'edgeHits':hits,'bodySignedDistancesToSkirtPlane':da,'skirtSignedDistancesToBodyPlane':db,'robustFiniteCrossing':span>1e-4 and min(da)<-1e-5 and max(da)>1e-5 and min(db)<-1e-5 and max(db)>1e-5}
rows=[]
for stage,time in [('approach-sit',4.608333333333352),('technical-dance',13.10833333333323),('final',20.24166666666616)]:
 rowIndex,r=min(((i,x)for i,x in enumerate(data['rows'])if x['stage']==stage),key=lambda ix:abs(ix[1]['t']-time));assert abs(r['t']-time)<1e-10
 events=[]
 for h in r['hits']:
  if h['role']!='body':continue
  bone=max(h['skinWeights'],key=h['skinWeights'].get)
  events.append({**h,'dominantBone':bone,'geometry':geometry(h)})
 ordered=sorted(events,key=lambda x:x['geometry']['lineLength']);maxEvent=ordered[-1]if ordered else None
 rows.append({'row':rowIndex,**{k:r.get(k)for k in ['stage','t','mode','sitProgress','phase','jogPhase','runMix','root','measurementStage','handContacts','liveState']},'bodyPairs':len(events),'regions':dict(collections.Counter(e['region']for e in events)),'dominantBones':dict(collections.Counter(e['dominantBone']for e in events)),'skirtFaces':dict(collections.Counter(e['skirtFace']for e in events)),'robustFiniteCrossingCount':sum(e['geometry']['robustFiniteCrossing']for e in events),'lineLengthMedian':ordered[len(ordered)//2]['geometry']['lineLength']if ordered else 0,'lineLengthMax':maxEvent['geometry']['lineLength']if maxEvent else 0,'maximum':maxEvent,'events':events})
entry=next(x for x in json.loads((SRC/'public/assets/m1/equipment.json').read_text(encoding='utf8'))['items']if x['id']=='m1-uniform-skirt-open-waist-v1');garment=SRC/'public/assets/m1'/entry['url'];assert sha(garment)==entry['sha256']
b=garment.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);blob=b[28+n:]
def acc(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];size=struct.calcsize(fmt);dim={'SCALAR':1,'VEC3':3,'MAT4':16}[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0);return [struct.unpack_from('<'+fmt*dim,blob,off+j*v.get('byteStride',size*dim))for j in range(a['count'])]
node=next(x for x in g['nodes']if 'mesh'in x and 'skin'in x);skin=g['skins'][node['skin']];hi=next(i for i,j in enumerate(skin['joints'])if 'Hips'in g['nodes'][j]['name']);inv=acc(skin['inverseBindMatrices'])[hi];pr=g['meshes'][node['mesh']]['primitives'][0];pos=acc(pr['attributes']['POSITION']);index=[v[0]for v in acc(pr['indices'])];faceMetadata=[]
for f in sorted({e['skirtFace']for r in rows for e in r['events']}):
 ids=index[f*3:f*3+3];p=[pos[i]for i in ids];q=[[sum(inv[k+4*j]*v[j]for j in range(3))+inv[k+12]for k in range(3)]for v in p];normal=cross(sub(q[1],q[0]),sub(q[2],q[0]));normal=[x/length(normal)for x in normal];faceMetadata.append({'face':f,'sourceIndices':ids,'restPositions':p,'hipsBindPositions':q,'allFree':all(v[1]<.09 for v in q),'restNormal':normal,'material':g['materials'][pr['material']].get('name')})
result={'build':data['build'],'sourceSnapshots':{str(p.relative_to(ROOT)):sha(p)for p in [INPUT,SRC/'src/motion.js',SRC/'src/main.js',SRC/'src/foundation-avatar.js',SRC/'src/foundation-profiles.js',garment]},'sourceGarmentFaces':faceMetadata,'scriptSHA':sha(Path(__file__)),'rows':rows,'limits':['Only original 13bb stored samples; not relabelled 7a86.','Finite triangle edge crossings retain original tolerance. Additional robust diagnostic needs line>0.1mm and both triangles to straddle the other plane by >0.01mm; this is not a changed collision gate.','Geometric crossing line length and signed infinite-plane distances are not solid penetration depth.','Original records already passed material-alpha hit test; line endpoints here are geometric and not re-clipped to alpha.','No GPU, continuous video inspection, new pose evaluation or controller change.']}
(OUT/'hand-crossing-classification.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps([{k:r[k]for k in ['row','stage','t','mode','sitProgress','handContacts','bodyPairs','regions','robustFiniteCrossingCount','lineLengthMedian','lineLengthMax']}for r in rows],indent=2))
