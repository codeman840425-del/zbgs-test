import json,pathlib,numpy as np,sys
from scipy.spatial import cKDTree
R=pathlib.Path(__file__).resolve().parents[3];O=pathlib.Path(sys.argv[1]);assert O.is_dir(),'Supply actual capture directory'
def hand_leg_pairs(points,faces,roles):
 hands=points[faces[roles['hands']]];legs=points[faces[roles['legs']]]
 hc=hands.mean(1);lc=legs.mean(1);hr=np.linalg.norm(hands-hc[:,None,:],axis=2).max(1);lr=np.linalg.norm(legs-lc[:,None,:],axis=2).max(1)
 neighbors=cKDTree(lc).query_ball_point(hc,hr+lr.max()+1e-7);pairs=np.array([(i,j)for i,js in enumerate(neighbors)for j in js],dtype=int)
 if not len(pairs):return []
 a=hands[pairs[:,0]];b=legs[pairs[:,1]];keep=np.all(a.max(1)>=b.min(1)-1e-7,axis=1)&np.all(b.max(1)>=a.min(1)-1e-7,axis=1);pairs=pairs[keep];a=a[keep];b=b[keep];hit=np.zeros(len(a),dtype=bool)
 for triangles,other in [(a,b),(b,a)]:
  e1=other[:,1]-other[:,0];e2=other[:,2]-other[:,0]
  for k in range(3):
   start=triangles[:,k];dire=triangles[:,(k+1)%3]-start;h=np.cross(dire,e2);det=np.einsum('ij,ij->i',e1,h);valid=abs(det)>1e-12;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=start-other[:,0];u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*np.einsum('ij,ij->i',q,dire);t=inv*np.einsum('ij,ij->i',e2,q)
   hit|=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>1e-7)&(t<1-1e-7)
 return [[roles['hands'][i],roles['legs'][j]]for i,j in pairs[hit]]
result=[]
modes=['lap','authored']if(O/'authored.json').exists()else['legacy','calibrated']
for mode in modes:
 d=json.loads((O/(mode+'.json')).read_text(encoding='utf8'));fixture=d['fixture'];faces=np.array(fixture['bodyTriangles']);records=[]
 for f in d['frames']:
  points=np.array(f['body']);waist_indices=sorted(set(fixture['faceRoles']['forearm']+fixture['faceRoles']['hands']))if'faceRoles'in fixture else list(range(len(faces)))
  tri=points[faces[waist_indices]];a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;hits=[]
  for aa,bb in fixture['fixedWaistEdges']:
   start=np.array(f['pins'][str(aa)]);end=np.array(f['pins'][str(bb)]);direction=end-start
   h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h);valid=abs(det)>1e-12;inv=np.divide(1,det,out=np.zeros_like(det),where=valid)
   s=start-a;u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);t=inv*np.einsum('ij,ij->i',e2,q)
   use=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>1e-7)&(t<1-1e-7)
   hits += [{'edge':[aa,bb],'bodyFace':fixture['bodyOriginalFaces'][waist_indices[int(k)]],'at':float(t[k])}for k in np.flatnonzero(use)]
  hand_leg=hand_leg_pairs(points,faces,fixture['faceRoles'])if'faceRoles'in fixture else None
  records.append({'frame':f['frame'],'sitProgress':f['sitProgress'],'mode':f['mode'],'hits':hits,'handLegPairs':[[fixture['bodyOriginalFaces'][i],fixture['bodyOriginalFaces'][j]]for i,j in hand_leg]if hand_leg is not None else None})
 dt=np.array([f['simulateMs']for f in d['frames']]);hand=np.array([max([h.get('fitElapsedMs',0)for h in f['handContacts']]or[0])for f in d['frames']]);res=np.array([max([h.get('remainingClearance',0)for h in f['handContacts']]or[0])for f in d['frames']]);jumps=[]
 for before,after in zip(d['frames'][:-1],d['frames'][1:]):
  for x,y in zip(before['handContacts'],after['handContacts']):
   if 'finalElbow'in x and 'finalElbow'in y:
    jumps.append({'frame':after['frame'],'side':y['side'],'elbowStep':float(np.linalg.norm(np.array(y['finalElbow'])-x['finalElbow'])),'wristStep':float(np.linalg.norm(np.array(y['finalWrist'])-x['finalWrist']))})
 stats=lambda x:{'mean':float(np.mean(x)),'p95':float(np.percentile(x,95)),'p99':float(np.percentile(x,99)),'max':float(max(x))}
 result.append({'mode':mode,'build':d['identity']['runtimeBuild']['shortId'],'pageerrors':d['errors'],'frames':len(records),'contactFrames':[x['frame']for x in records if x['hits']],'contactPairs':sum(len(x['hits'])for x in records),'handLegContactFrames':[x['frame']for x in records if x['handLegPairs']],'handLegPairs':sum(len(x['handLegPairs']or[])for x in records)if'faceRoles'in fixture else 'unmeasured','frame76to78':records[75:78],'lastSitProgress':d['frames'][-1]['sitProgress'],'maxSitProgress':max(f['sitProgress']for f in d['frames']),'simulateMs':stats(dt),'handFitElapsedMs':stats(hand),'finalResidual':stats(res),'maxElbowStep':max(jumps,key=lambda x:x['elbowStep']) if jumps else None,'maxWristStep':max(jumps,key=lambda x:x['wristStep'])if jumps else None,'records':records})
out={'method':'Actual current skinned forearm triangles (both sides) vs all40 fixed fitted-waist edges; finite segment-triangle crossing, not proximity. Fixed waist is proposed source boundary, not runtime projected cloth. 270frames30Hz offline simulation, timing excludes QA vertex export but is not rAF/normal-speed/target-PC benchmark.','results':result,'limitations':['No whole-body garment acceptance','Current shared baseline differs from ca72 capture; historical frame index is same schedule but source controller may have changed','No fresh normal-speed video; observed screenshots are sampled poses only']}
(O/'analysis.json').write_text(json.dumps(out,indent=2));print(json.dumps([{k:v for k,v in x.items()if k!='records'}for x in result],indent=2))
