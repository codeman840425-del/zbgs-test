import os
os.environ['OPENBLAS_NUM_THREADS']='1'
import json,gzip,pathlib,collections,hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
P=pathlib.Path(__file__).resolve().parent

def region(ws):
 totals=collections.defaultdict(float)
 for a in ws:
  s=a['semantic'] or ''
  if s in ['hips','spine','chest','upperChest','neck']:k='torso'
  elif s.startswith(('left','right')) and any(x in s for x in ['UpperArm','LowerArm','Hand','Thumb','Index','Middle','Ring','Little']):
   side='left' if s.startswith('left') else 'right';part='upper' if 'UpperArm' in s else 'forearm' if 'LowerArm' in s else 'hand';k=side+'-'+part
  else:k='other'
  totals[k]+=a['w']
 k=max(totals,key=totals.get)
 return k if totals[k]>.5 else 'mixed'
def hit(a,b,c,d,e):
 direction=b-a;e1=d-c;e2=e-c;h=direction.cross(e2);det=e1.dot(h)
 if abs(det)<1e-12:return None
 inv=1/det;s=a-c;u=inv*s.dot(h)
 if u<1e-7 or u>1-1e-7:return None
 q=s.cross(e1);v=inv*direction.dot(q)
 if v<1e-7 or u+v>1-1e-7:return None
 t=inv*e2.dot(q)
 if t<1e-7 or t>1-1e-7:return None
 return list(a+direction*t)
def cross(a,b):
 out=[]
 for i in range(3):
  p=hit(a[i],a[(i+1)%3],*b)
  if p:out.append(p)
  p=hit(b[i],b[(i+1)%3],*a)
  if p:out.append(p)
 return out
report={'scope':'Actual final world skin finite noncoplanar triangle edge crossings. Region by dominant >50% semantic vertex weights; face majority. Mixed shoulders excluded from arm-vs-torso attribution. Counts not visual severity or closed-volume penetration. No alpha texture filtering; material IDs retained. Adjacent shared body triangles excluded.','bodies':{}}
for sex in ['female-original','female-adapted','male-original','male-adapted']:
 buf=(P/f'{sex}-actual.json.gz').read_bytes();d=json.loads(gzip.decompress(buf));desc=d['descriptors'];meta=[]
 for m in desc:
  regs=[region(w) for w in m['weights']];faces=[m['indices'][i:i+3] for i in range(0,len(m['indices']),3)];visible={tuple(sorted(m['displayIndices'][i:i+3])) for i in range(0,len(m['displayIndices']),3)}
  groups=collections.defaultdict(list)
  for f,ix in enumerate(faces):
   r=collections.Counter(regs[i] for i in ix).most_common(1)[0]
   if r[1]>=2 and r[0]!='mixed':groups[r[0]].append(f)
  meta.append({'name':m['name'],'role':m['role'],'faces':faces,'groups':groups,'visible':visible})
 out=[]
 for row in d['rows']:
  positions={m['name']:[Vector(p)for p in m['positions']] for m in row['meshes']};cache={}
  def meshgroup(mi,regions):
   key=(mi,tuple(regions))
   if key not in cache:
    m=meta[mi];fs=[f for r in regions for f in m['groups'].get(r,[])];faces=[m['faces'][f]for f in fs];ps=positions[m['name']];cache[key]=(BVHTree.FromPolygons(ps,faces,all_triangles=True),fs,ps)
   return cache[key]
  pairs=[]
  tests=[]
  for side in ['left','right']:
   for part in ['upper','forearm','hand']:
    for j in range(len(meta)):tests.append((side+'-'+part,0,[side+'-'+part],j,['torso']))
  tests.append(('arm-arm',0,['left-upper','left-forearm','left-hand'],0,['right-upper','right-forearm','right-hand']))
  for label,ai,ar,bi,br in tests:
   ta,fa,pa=meshgroup(ai,ar);tb,fb,pb=meshgroup(bi,br)
   if not ta or not tb:continue
   for ia,ib in ta.overlap(tb):
    af,bf=fa[ia],fb[ib];ax,bx=meta[ai]['faces'][af],meta[bi]['faces'][bf]
    if ai==bi and set(ax)&set(bx):continue
    pts=cross([pa[k]for k in ax],[pb[k]for k in bx])
    if pts:pairs.append({'armRegion':label,'armMesh':meta[ai]['name'],'armFace':af,'armIndices':ax,'armVisible':tuple(sorted(ax))in meta[ai]['visible'],'otherMesh':meta[bi]['name'],'otherFace':bf,'otherVisible':tuple(sorted(bx))in meta[bi]['visible'],'witnesses':pts})
  counts=dict(collections.Counter(p['armRegion']+' vs '+p['otherMesh']for p in pairs));out.append({'time':row['clock'],'requestedTime':row['requestedTime'],'counts':counts,'pairs':pairs});print(sex,row['requestedTime'],counts,flush=True)
 report['bodies'][sex]={'captureSha256':hashlib.sha256(buf).hexdigest(),'rows':out}
(P/'skin-crossings.json').write_text(json.dumps(report,indent=2),encoding='utf8')
