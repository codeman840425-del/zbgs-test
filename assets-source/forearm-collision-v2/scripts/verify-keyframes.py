"""Portable replay of retained actual skin/waist and causal pole evidence.
Checks stored frames, not a fresh browser acceptance or all270-frame rerun.
"""
import json,pathlib,numpy as np
O=pathlib.Path(__file__).resolve().parents[1];summaries=[]
for p in sorted((O/'evidence').glob('*-keyframes.json')):
 if p.name=='source-arm-keyframes.json':continue
 d=json.loads(p.read_text());fixture=d['fixture'];faces=np.array(fixture['bodyTriangles']);source_faces=fixture['bodyOriginalFaces'];roles=fixture.get('faceRoles');ids=sorted(set(roles['forearm']+roles['hands']))if roles else list(range(len(faces)));results=[]
 for f in d['frames']:
  if 'body'not in f:continue
  tri=np.array(f['body'])[faces[ids]];a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;hits=[]
  for aa,bb in fixture['fixedWaistEdges']:
   start=np.array(f['pins'][str(aa)]);direction=np.array(f['pins'][str(bb)])-start;h=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,h);valid=abs(det)>1e-12;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=start-a;u=inv*np.einsum('ij,ij->i',s,h);q=np.cross(s,e1);v=inv*(q@direction);t=inv*np.einsum('ij,ij->i',e2,q);mask=valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7)&(t>1e-7)&(t<1-1e-7)
   hits.extend({'edge':[aa,bb],'face':source_faces[ids[int(k)]]}for k in np.flatnonzero(mask))
  expected=2 if d['mode']=='legacy'and f['frame']==77 else 0
  assert len(hits)==expected,(p.name,f['frame'],hits)
  results.append({'frame':f['frame'],'hits':hits})
 summaries.append({'input':p.name,'replayedActualSkinFrames':len(results),'known77':next(x for x in results if x['frame']==77)})
legacy=json.loads((O/'evidence/e29f6b5bc9d6-legacy-keyframes.json').read_text());f=next(f for f in legacy['frames']if f['frame']==77);h=next(h for h in f['handContacts']if h['side']=='left');a,b=h['iterationTrace'][:2];upper=np.array(h['authoredUpper']);out=np.array([0,.5,1]);out/=np.linalg.norm(out);axis=np.array(b['target'])-upper;axis/=np.linalg.norm(axis);bend=np.array(a['elbow'])+out*a['forearmCorrection']-upper;bend-=axis*np.dot(bend,axis);assert np.linalg.norm(bend)<.005
authored=json.loads((O/'evidence/c9f074519f18-authored-keyframes.json').read_text());assert all(h['authoredSitTarget']for f in authored['frames']if 76<=f['frame']<=188 for h in f['handContacts'])
hands=[next(h for h in next(f for f in authored['frames']if f['frame']==n)['handContacts']if h['side']=='right')for n in [187,188]];prev,now=hands
step188={'actualElbowStep':float(np.linalg.norm(np.array(now['finalElbow'])-prev['finalElbow'])),'authoredElbowStep':float(np.linalg.norm(np.array(now['authoredElbow'])-prev['authoredElbow'])),'correctionVectorChange':float(np.linalg.norm((np.array(now['finalElbow'])-now['authoredElbow'])-(np.array(prev['finalElbow'])-prev['authoredElbow']))),'finalResidual':now['remainingClearance'],'firstIterationForearm':[h['iterationTrace'][0]['forearmCorrection']for h in hands],'firstIterationPalm':[h['iterationTrace'][0]['palmCorrection']for h in hands]}
print(json.dumps({'passed':True,'fixedWaistReplays':summaries,'legacy77PoleFallbackLength':float(np.linalg.norm(bend)),'c9Rise188':step188,'limits':'Retained critical actual frames only. Full270-frame hands/legs results remain separately reported; no fresh animation/rendering here.'},indent=2))
