"""One fixed event-authored foot-roll candidate; all v3 root/leg tracks frozen."""
from pathlib import Path
import copy,hashlib,json,math
import numpy as np
from scipy.optimize import brentq
from scipy.interpolate import CubicHermiteSpline
from scipy.spatial.transform import Rotation as R
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/video-dance-support-v3';OUT=ROOT/'assets-source/video-dance-forefoot-v4';OUT.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sourceReview=ROOT/'analysis/dance-reference-v1/support-v3-review/source-native-204-207.jpg'
config={'schema':'manual-support-event-roll.1','parent':'video-dance-support-v3','sourceFrames':[138,210],
 'manualObservationFile':'assets-source/video-dance-twist-study-v1/support-observations.json',
 'manualObservationSha256':sha(ROOT/'assets-source/video-dance-twist-study-v1/support-observations.json'),
 'newManualRefinement':{'frames':[204,205],'side':'right','label':'apparent_forefoot_support_heel_rising','basis':'Native source204–207 visual review shows right toe/edge near floor and rising heel before206 uncertain takeoff; this is a human-authored fitting hypothesis, not inferred auto contact.','privateReviewImage':str(sourceReview.relative_to(ROOT)),'privateReviewSha256':sha(sourceReview)},
 'events':{'left':{'forefootContact':[153,164],'transitionIn':[148,153],'transitionOut':[164,171]},'right':{'forefootContact':[204,205],'transitionIn':[200,204],'transitionOut':[205,207]}},
 'unknownIntervals':'Transitions create no contact label. Existing uncertain206 remains uncertain, even though roll is interpolated there.',
 'protectedFlight':[[141,144],[207,210]],'rootLegAnkleXYZ':'All v3 original tracks unchanged; only foot local quaternions may change; toes inherit foot rotation with unchanged local track.',
 'geometry':'Each authored forefoot frame independently solves actual toe-patch minimumY=0 with fixed calf skin influence, about ankle lateral axis. One bracket0..60deg root, not a parameter scan. Whole-shoe nonpenetration checked afterward; no per-frame root rescue.',
 'transitions':'Unique cubic Hermite between event endpoints, zero angle/derivative at outer boundaries; inner derivatives are first/last finite difference of solved support angles. No spline coefficient or weight optimization.',
 'gatePolicy':{'existingV3SupportResidualM':.010,'existingV3ChangedLocalQuaternionStepDeg':45,'additionalRollCorrectionStepDeg':15,'additionalRollCorrectionSecondDifferenceDeg':15,'afterRuntimeLiftDenseMinimumM':-.002},
 'gateMeaning':'Finite engineering comparison bounds, not biomechanical limits. Even below angle bounds does not prove natural foot motion.',
 'failurePolicy':'Preserve failure without changing events, bracket, weights, v3 tracks or flight; no further patch in this candidate.'}
(OUT/'event-config.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
variants=[];summaries=[];frames=np.arange(138,211);dt=1001/24000
for body in ('female','male'):
 old=read(BASE/f'{body}-dance-support-v3.json');asset=copy.deepcopy(old);rig=read(ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json');ref=read(BASE/f'{body}-world-reference.json')
 bones=rig['normalizedBones'];names=ref['names'];idx={s:i for i,s in enumerate(names)};W0=np.array(ref['world']);W=W0.copy();rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()}
 oldq={t['name'].split('.')[0]:np.array(t['values']).reshape(73,4) for t in old['clip']['tracks'] if t['name'].endswith('.quaternion')};newq={s:q.copy() for s,q in oldq.items()}
 sideReports={};angleTracks={};rows=[]
 for side in ('left','right'):
  foot,toe=side+'Foot',side+'Toes';verts=rig['footwear']['skinSamples'][side];footZ=rig['lengths'][side]['ankleRest'][2]
  regions={kind:[i for i,v in enumerate(verts) if (v['world'][2]<=footZ+.015 if kind=='heel' else v['world'][2]>=footZ+.015)] for kind in ('heel','toe')}
  patches={kind:[i for i in inds if verts[i]['world'][1]<min(verts[j]['world'][1] for j in inds)+.012] for kind,inds in regions.items()}
  influenceMatrices={s:np.linalg.inv(rest[s]) for s in bones}
  def evaluation(k,theta,keep=False):
   m=W0[k].copy();ankle=m[idx[foot],:3,3].copy();forward=(m[idx[foot],:3,:3]@rest[foot][:3,:3].T)@np.array([0.,0.,1.]);axis=np.cross([0.,1.,0.],forward);axis/=np.linalg.norm(axis);delta=R.from_rotvec(axis*theta).as_matrix()
   for name in (foot,toe):m[idx[name],:3,:3]=delta@m[idx[name],:3,:3];m[idx[name],:3,3]=ankle+delta@(m[idx[name],:3,3]-ankle)
   vv=[]
   for v in verts:
    p=np.zeros(3)
    for inf in v['influences']:
     if inf['weight']>0:
      s=inf['semantic'];p+=inf['weight']*(m[idx[s]]@influenceMatrices[s]@np.r_[v['world'],1])[:3]
    vv.append(p)
   vv=np.array(vv);result={'minimumY':float(vv[:,1].min())}
   for kind,inds in patches.items():
    y=vv[inds,1];weight=np.exp(-(y-y.min())/.001);result[kind+'MinimumY']=float(y.min());result[kind+'SoftMinY']=float(y@weight/weight.sum())
   if keep:
    for name in (foot,toe):W[k,idx[name]]=m[idx[name]]
    parent=bones[foot]['parentSemantic'];q=(R.from_matrix(m[idx[parent],:3,:3]).inv()*R.from_matrix(m[idx[foot],:3,:3])).as_quat()
    if q@oldq[foot][k]<0:q=-q
    newq[foot][k]=q
   return result
  event=config['events'][side];lo,hi=event['forefootContact'];angles=np.zeros(73);solves=[]
  for frame in range(lo,hi+1):
   k=frame-138;a,b=0.,math.radians(60);ya,yb=evaluation(k,a)['toeMinimumY'],evaluation(k,b)['toeMinimumY']
   if ya*yb>0:raise ValueError(f'{body} {side} {frame}: no toe contact root in fixed bracket')
   theta=brentq(lambda t:evaluation(k,t)['toeMinimumY'],a,b,xtol=1e-11);angles[k]=theta;solves.append({'sourceFrame':frame,'angleDeg':math.degrees(theta),'before':evaluation(k,0),'after':evaluation(k,theta)})
  firstSlope=(angles[lo+1-138]-angles[lo-138])/dt;lastSlope=(angles[hi-138]-angles[hi-1-138])/dt
  for pair,aa,bb,va,vb in ((event['transitionIn'],0,angles[lo-138],0,firstSlope),(event['transitionOut'],angles[hi-138],0,lastSlope,0)):
   x0,x1=pair;curve=CubicHermiteSpline([x0*dt,x1*dt],[aa,bb],[va,vb]);inside=(frames>x0)&(frames<x1);angles[inside]=curve(frames[inside]*dt)
  angleTracks[side]=angles
  for k,theta in enumerate(angles):
   if theta!=0:evaluation(k,theta,True)
  values=[evaluation(k,float(t)) for k,t in enumerate(angles)]
  newrot=R.from_quat(newq[foot]);oldrot=R.from_quat(oldq[foot]);steps=np.rad2deg((newrot[1:]*newrot[:-1].inv()).magnitude());worldrot=R.from_matrix(W[:,idx[foot],:3,:3]);worldsteps=np.rad2deg((worldrot[1:]*worldrot[:-1].inv()).magnitude())
  sideReports[side]={'solves':solves,'byFrame':values,'anglesDeg':np.rad2deg(angles).tolist(),'correctionAngleRangeDeg':[float(np.rad2deg(angles.min())),float(np.rad2deg(angles.max()))],'maxCorrectionStepDeg':float(np.rad2deg(abs(np.diff(angles))).max()),'maxCorrectionSecondDifferenceDeg':float(np.rad2deg(abs(np.diff(angles,n=2))).max()),'maxLocalQuaternionStepDeg':float(steps.max()),'maxWorldQuaternionStepDeg':float(worldsteps.max()),'localQuaternionStepByFrameDeg':steps.tolist(),'worldQuaternionStepByFrameDeg':worldsteps.tolist(),'maxAdditionalLocalAngleFromV3Deg':float(np.rad2deg((newrot*oldrot.inv()).magnitude()).max())}
 changed=[]
 for tr in asset['clip']['tracks']:
  if tr['name'] in ('leftFoot.quaternion','rightFoot.quaternion'):
   tr['values']=newq[tr['name'].split('.')[0]].reshape(-1).tolist();changed.append(tr['name'])
 asset['id']='video-dance-forefoot-v4';asset['clip']['name']='Video_Dance_Forefoot_Once_v4';asset['adaptationParentSha256']=sha(BASE/f'{body}-dance-support-v3.json');asset['forefootEventConfigSha256']=sha(OUT/'event-config.json');asset['contactAssumption']='Manual forefoot event constraints with exact target-shoe toe contact roots, fixed Hermite transitions; v3 root/leg/ankleXYZ and original flight retained. Unknown transition intervals stay unknown; no new automatic detection.'
 path=OUT/f'{body}-dance-forefoot-v4.json';path.write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8');variants.append({'avatarSha256':asset['avatarSha256'],'file':path.name,'sha256':sha(path),'bytes':path.stat().st_size})
 protected=((frames>=141)&(frames<=144))|(frames>=207)
 unchanged=[t['name'] for t,o in zip(asset['clip']['tracks'],old['clip']['tracks']) if t==o];assert len(unchanged)==53
 legs=[n for n in names if 'Leg' in n or n=='hips' or n.endswith('Foot')]
 invariant={'unchangedTrackCount':len(unchanged),'unchangedTrackNames':unchanged,'rootAndLegTracksExact':True,'flightLocalFootKeysExact':all(np.array_equal(newq[s+'Foot'][protected],oldq[s+'Foot'][protected]) for s in ('left','right')),'flightWorldMatrixMaxDifference':float(abs(W[protected]-W0[protected]).max()),'rootLegAndAnklePositionMaxDifference':max(float(abs(W[:,idx[n],:3,3]-W0[:,idx[n],:3,3]).max()) for n in legs),'onlyFootToeWorldMatricesChanged':all(np.array_equal(W[:,idx[n]],W0[:,idx[n]]) for n in names if n not in ('leftFoot','leftToes','rightFoot','rightToes'))}
 failures=[]
 for s,r in sideReports.items():
  if r['maxCorrectionStepDeg']>15:failures.append(s+' roll correction step >15deg')
  if r['maxCorrectionSecondDifferenceDeg']>15:failures.append(s+' roll correction second difference >15deg')
  if r['maxLocalQuaternionStepDeg']>45:failures.append(s+' local quaternion step >45deg')
  if min(v['minimumY'] for v in r['byFrame'])<-.002:failures.append(s+' shoe source-key penetration >2mm (before runtime lift)')
 report={'body':body,'changedTracks':changed,'invariants':invariant,'sides':sideReports,'preliminaryFailures':failures,'status':'Frozen single candidate; requires actual VRM/Mixer dense interpolation check; no GPU recording requested yet.','sourceFrames':frames.tolist(),'sourcePTS':(frames*1001).tolist(),'timeBase':'1/24000','trackTimes':ref['times']}
 (OUT/f'{body}-forefoot-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 (OUT/f'{body}-world-reference.json').write_text(json.dumps({'names':names,'times':ref['times'],'world':W.tolist()},separators=(',',':')),encoding='utf-8')
 summaries.append({'body':body,'invariants':invariant,'preliminaryFailures':failures,'sideSummary':{s:{k:r[k] for k in ('correctionAngleRangeDeg','maxCorrectionStepDeg','maxCorrectionSecondDifferenceDeg','maxLocalQuaternionStepDeg','maxWorldQuaternionStepDeg')} for s,r in sideReports.items()}})
entry=read(BASE/'dance-imports.entry.json');entry['id']='video-dance-forefoot-v4';entry['clip']='Video_Dance_Forefoot_Once_v4';entry['variants']=variants;entry['origin']+='; manual forefoot event roll, fixed v3 root/legs/flight; candidate may fail'
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8');(OUT/'summary.json').write_text(json.dumps(summaries,indent=2),encoding='utf-8');print(json.dumps(summaries,indent=2))
