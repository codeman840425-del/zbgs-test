"""Read-only source measurements. Produces evidence, never a proxy/animation asset."""
from pathlib import Path
import importlib.util, json, hashlib, struct, math
import numpy as np
R=Path(__file__).resolve().parents[3];P=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('arm',R/'scripts/m1-assets/build-forearm-collision-profile.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
groups=['palm','thumb','index','middle','ring','little'];bodies=[]
for sex in ['female','male']:
 s=m.load(sex);rows=[]
 for side in ['left','right']:
  ids=s['skin']['joints'];wrist=np.linalg.inv(s['ibm'][ids.index(s['humanoid'][side+'Hand'])])[:3,3];end=np.linalg.inv(s['ibm'][ids.index(s['humanoid'][side+'MiddleDistal'])])[:3,3]
  axis=end-wrist;length=float(np.linalg.norm(axis));axis/=length
  scores=[]
  for name in groups:
   sem=[side+'Hand']if name=='palm'else[side+name.title()+p for p in ['Metacarpal','Proximal','Intermediate','Distal']]
   joints=[ids.index(s['humanoid'][n])for n in sem if n in s['humanoid']]
   scores.append(np.where(np.isin(s['j'],joints),s['w'],0).sum(axis=1))
  scores=np.array(scores).T;total=scores.sum(axis=1);faces=np.flatnonzero(total[s['tri']].mean(axis=1)>=.25);selected=np.unique(s['tri'][faces]);labels=scores.argmax(axis=1)
  p=s['pos'][selected]-wrist;along=p@axis;rad=np.linalg.norm(p-along[:,None]*axis,axis=1)
  rows.append({'side':side,'selectedVertices':len(selected),'mixedNonHandVertices':int(np.count_nonzero(total[selected]<1-1e-5)),'wristToMiddleDistalM':length,'maxAxisRadialM':float(rad.max()),'outsideRadius16mmVertices':int(np.count_nonzero(rad>.016)),'beyondDistalEndpointVertices':int(np.count_nonzero(along>length)), 'groups':{name:{'vertices':int(np.count_nonzero(labels[selected]==i)),'maxAxisRadialM':float(rad[labels[selected]==i].max())}for i,name in enumerate(groups)}})
 bodies.append({'sex':sex,'bodySHA256':s['sha'],'hands':rows})
src=R/'prototype/public/assets/motion/UAL1_Standard.glb';raw=src.read_bytes();size=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+size]);binary=raw[28+size:]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];w={'VEC4':4,'SCALAR':1}[a['type']];assert a['componentType']==5126
 return np.ndarray((a['count'],w),dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*4),4)).astype(float)
clips=[];first={}
for name in ['Idle_Loop','Sitting_Enter','Sitting_Idle_Loop','Sitting_Exit','Sitting_Talking_Loop','Idle_Talking_Loop']:
 a=next(a for a in j['animations']if a['name']==name);tracks=[];first[name]={}
 for c in a['channels']:
  n=j['nodes'][c['target']['node']]['name']
  if c['target']['path']!='rotation' or n not in {f'{f}_0{i}_{side}' for f in ['thumb','index','middle','ring','pinky']for i in [1,2,3]for side in ['l','r']}:continue
  q=acc(a['samplers'][c['sampler']]['output']);q/=np.linalg.norm(q,axis=1)[:,None];angles=2*np.arccos(np.clip(abs(q@q[0]),0,1))*180/math.pi
  tracks.append({'bone':n,'samples':len(q),'maxAngleFromFirstDeg':float(angles.max())});first[name][n]=q[0]
 clips.append({'name':name,'fingerTracks':len(tracks),'tracksVaryingOver001deg':sum(t['maxAngleFromFirstDeg']>.01 for t in tracks),'maxFingerAngleFromFirstDeg':max(t['maxAngleFromFirstDeg']for t in tracks),'tracks':tracks})
transitions=[]
for a,b in [('Idle_Loop','Sitting_Enter'),('Sitting_Enter','Sitting_Idle_Loop'),('Sitting_Idle_Loop','Sitting_Exit'),('Sitting_Exit','Idle_Loop')]:
 vals={n:float(2*np.arccos(np.clip(abs(q@first[b][n]),0,1))*180/math.pi)for n,q in first[a].items()}
 transitions.append({'fromFirst':a,'toFirst':b,'maxFingerAngleDeg':max(vals.values()),'differentTracksOver001deg':sum(x>.01 for x in vals.values())})
failure=R/'output/playwright/m1/175a487d5ea3/variant-seat-arms-1794702194076/beta-base-female-m1.json';failed=json.loads(failure.read_text(encoding='utf8'));regions={};face_regions={}
for row in failed['rows']:
 for hit in row['hits']:
  weights=hit['skinWeights'];bone=max(weights,key=weights.get);key=next((n for n in ['Thumb','Index','Middle','Ring','Little']if n in bone),'palm')
  regions[key]=regions.get(key,0)+1;face_regions.setdefault(key,set()).add(hit['skinFace'])
known={'source':str(failure.relative_to(R)),'hitFrames':sum(bool(r['hits'])for r in failed['rows']),'pairEventsByDominantFinger':regions,'uniqueFacesByDominantFinger':{k:len(v)for k,v in face_regions.items()},'firstHit':next({'t':r['t'],'stage':r['stage'],'sitProgress':r['sitProgress'],'hit':r['hits'][0]}for r in failed['rows']if r['hits'])}
result={'status':'read-only evidence; no alternative generated','bodies':bodies,'motionSourceSHA256':hashlib.sha256(raw).hexdigest(),'clips':clips,'firstPoseDifferences':transitions,'knownActualFailures':known,'limits':['Bind radial distance is not a posed skin intersection proof. Legacy five rails are not even a solid 16mm capsule.','Source local quaternion variation preserves its angle under the retarget rest-world conjugation; crossclip fades and live grip can change the shape even when individual clips are constant.','No recommendation to make a wrist-local static proxy valid for all hand poses.']}
(P/'evidence/hand-alternative-source-readonly.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps({'bodies':bodies,'clips':[{k:v for k,v in c.items()if k!='tracks'}for c in clips],'firstPoseDifferences':transitions},indent=2))
