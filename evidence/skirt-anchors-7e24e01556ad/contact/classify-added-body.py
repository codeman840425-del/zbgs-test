"""Offline classification of recorded actual final surfaces. No resimulation."""
from pathlib import Path
import json,gzip,hashlib,struct,math,collections
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
OLD=ROOT/'evidence/front-skirt-a491efde53fb/contact/actual-surfaces.json.gz'
NEW=OUT/'actual-surfaces.json.gz'
SRC=ROOT/'prototype/public/assets/m1/m1-uniform-skirt.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads(gzip.decompress(OLD.read_bytes()));new=json.loads(gzip.decompress(NEW.read_bytes()))
b=SRC.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);blob=b[28+n:]
def acc(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']];size=struct.calcsize(fmt);dim={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0);return [struct.unpack_from('<'+fmt*dim,blob,off+j*v.get('byteStride',size*dim))for j in range(a['count'])]
node=next(x for x in g['nodes']if 'mesh'in x and 'skin'in x);skin=g['skins'][node['skin']];hip=next(i for i,j in enumerate(skin['joints'])if 'Hips'in g['nodes'][j]['name']);inv=acc(skin['inverseBindMatrices'])[hip];pr=g['meshes'][node['mesh']]['primitives'][0];pos=acc(pr['attributes']['POSITION']);ix=[r[0]for r in acc(pr['indices'])];faces=[ix[i:i+3]for i in range(0,len(ix),3)]
fixed=[inv[1]*p[0]+inv[5]*p[1]+inv[9]*p[2]+inv[13]>=.09 for p in pos]
classes={i:('all-fixed'if all(fixed[v]for v in f)else'all-free'if not any(fixed[v]for v in f)else'mixed')for i,f in enumerate(faces)}
sub=lambda a,b:[x-y for x,y in zip(a,b)]
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
cross=lambda a,b:[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
dist=lambda a,b:math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
def intersect(a,b,t):
 d=sub(b,a);e1=sub(t[1],t[0]);e2=sub(t[2],t[0]);p=cross(d,e2);det=dot(e1,p)
 if abs(det)<1e-12:return None
 s=sub(a,t[0]);u=dot(s,p)/det
 if u< -1e-7 or u>1+1e-7:return None
 q=cross(s,e1);v=dot(d,q)/det
 if v< -1e-7 or u+v>1+1e-7:return None
 fraction=dot(e2,q)/det
 return [a[k]+d[k]*fraction for k in range(3)]if 1e-6<fraction<1-1e-6 else None
def line(a,b):
 pts=[]
 for t,u in [(a,b),(b,a)]:
  for k in range(3):
   p=intersect(t[k],t[(k+1)%3],u)
   if p is not None and all(dist(p,q)>1e-9 for q in pts):pts.append(p)
 if len(pts)<2:return {'length':0,'points':pts,'underresolved':True}
 p,q=max(((p,q)for p in pts for q in pts),key=lambda pq:dist(*pq));return {'length':dist(p,q),'points':[p,q],'midpoint':[(x+y)/2 for x,y in zip(p,q)]}
def region(bone):
 if any(s in bone for s in ['Hand','Thumb','Index','Middle','Ring','Little']):return 'hand-fingers'
 if 'LowerArm'in bone:return 'forearm'
 if 'UpperArm'in bone:return 'upper-arm'
 if any(s in bone for s in ['Hips','Spine','Chest']):return 'torso-pelvis'
 if 'UpperLeg'in bone:return 'thigh'
 if any(s in bone for s in ['LowerLeg','Foot','Toe']):return 'lower-leg-foot'
 return 'other'
key=lambda h:(h['mesh'],h['skinFace'],h['skirtFace'])
assert len(old['rows'])==len(new['rows'])
events=[];summaries={};max_body_delta=0
for row,(o,n)in enumerate(zip(old['rows'],new['rows'])):
 assert o['stage']==n['stage']and abs(o['t']-n['t'])<1e-10 and dist(o['root'],n['root'])==0
 assert abs(o['jogPhase']-n['jogPhase'])<1e-10 and abs(o['sitProgress']-n['sitProgress'])<1e-10
 oh={key(h)for h in o['hits']if h['role']=='body'};nh={key(h)for h in n['hits']if h['role']=='body'}
 old_body={(h['mesh'],h['skinFace']):h['skinPoints']for h in o['hits']if h['role']=='body'}
 old_skirt={}
 for h in o['hits']:
  for i,p in zip(faces[h['skirtFace']],h['skirtPoints']):old_skirt[i]=p
 s=summaries.setdefault(n['stage'],{'added':0,'removed':0,'net':0,'byRegionAndTriangle':{},'maxLine':None,'bodyPoseCompared':0,'bodyPoseMissing':0,'maxBodyVertexDelta':0})
 s['removed']+=len(oh-nh)
 for h in n['hits']:
  if h['role']!='body'or key(h)in oh:continue
  dominant=max(h['skinWeights'],key=h['skinWeights'].get);r=region(dominant);cl=classes[h['skirtFace']];ln=line(h['skinPoints'],h['skirtPoints'])
  prior=old_body.get((h['mesh'],h['skinFace']));delta=max(map(dist,prior,h['skinPoints']))if prior else None
  ds=[{'vertex':i,'fixed':fixed[i],'delta':dist(old_skirt[i],p)if i in old_skirt else None}for i,p in zip(faces[h['skirtFace']],h['skirtPoints'])]
  event={'row':row,'stage':n['stage'],'t':n['t'],'root':n['root'],'jogPhase':n['jogPhase'],'sitProgress':n['sitProgress'],'mesh':h['mesh'],'skinFace':h['skinFace'],'dominantBone':dominant,'dominantWeight':h['skinWeights'][dominant],'bodyRegion':r,'skirtFace':h['skirtFace'],'skirtVertices':faces[h['skirtFace']],'skirtClass':cl,'line':ln,'bodyVertexDeltaFromOld':delta,'skirtVertexDeltasFromOld':ds,'skinPoints':h['skinPoints'],'skirtPoints':h['skirtPoints']}
  events.append(event);s['added']+=1;group=s['byRegionAndTriangle'].setdefault(r+'/'+cl,{'events':0,'maxLineLength':0,'maxLineEvent':None});group['events']+=1
  ref={k:event[k]for k in ['row','t','skinFace','dominantBone','skirtFace','skirtClass','line']}
  if ln['length']>group['maxLineLength']:group['maxLineLength']=ln['length'];group['maxLineEvent']=ref
  if s['maxLine']is None or ln['length']>s['maxLine']['line']['length']:s['maxLine']=ref
  s['bodyPoseCompared'if delta is not None else'bodyPoseMissing']+=1
  if delta is not None:s['maxBodyVertexDelta']=max(s['maxBodyVertexDelta'],delta);max_body_delta=max(max_body_delta,delta)
for s in summaries.values():s['net']=s['added']-s['removed']
added_faces=sorted({e['skirtFace']for e in events});coords=collections.Counter(tuple(pos[i])for face in added_faces for i in faces[face]);center,frequency=coords.most_common(1)[0]
fan={'faceIds':added_faces,'uniqueRestCoordinates':len(coords),'sharedCenterRest':center,'centerTriangleOccurrences':frequency,'allFacesContainCenter':all(center in [tuple(pos[i])for i in faces[f]]for f in added_faces),'hipsBindCenter':[sum(inv[k+4*j]*center[j]for j in range(3))+inv[k+12]for k in range(3)],'restYRange':[min(p[1]for p in coords),max(p[1]for p in coords)],'effectiveMeaning':'20 triangles close a waist opening with a center fan; they are not the skirt sidewall.'}
result={'oldBuild':old['build'],'newBuild':new['build'],'inputs':{str(p.relative_to(ROOT)):sha(p)for p in [OLD,NEW,SRC]},'scriptSHA':sha(Path(__file__)),'matchedPoses':len(new['rows']),'sourceFixedVertexCount':sum(fixed),'sourceTriangleClasses':dict(collections.Counter(classes.values())),'stages':summaries,'addedEvents':events,'maxComparedBodyVertexDelta':max_body_delta,'limitations':['Input hits already passed the original actual material-alpha gate; reported full geometric intersection line is not re-clipped by texture alpha and is not penetration depth.','All-fixed triangles consist solely of actual source-skinned vertices by the tested fixed-anchor implementation; mixed and all-free triangles cannot be called inherent source-skin intersections.','Old capture stores only hit triangles: unavailable old vertex/body coordinates remain null, never assumed unchanged.','Same controller phase/root does not alone prove same body skin; compared body positions are explicitly recorded.','No new GPU capture, visual acceptance, continuous collision or self-intersection test.']}
result['addedSourceTopology']=fan
result['bodyDominantBones']=dict(collections.Counter(e['dominantBone']for e in events))
(OUT/'added-body-classification.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({'matchedPoses':result['matchedPoses'],'sourceTriangleClasses':result['sourceTriangleClasses'],'stages':{k:{x:s[x]for x in ['added','removed','net','byRegionAndTriangle','maxBodyVertexDelta','bodyPoseMissing']}for k,s in summaries.items()}},indent=2))
