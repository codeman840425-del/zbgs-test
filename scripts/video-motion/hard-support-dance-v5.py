"""One whole-segment hard-contact feasibility solve, not a detector/parameter scan."""
from pathlib import Path
import copy,hashlib,json
import numpy as np
from scipy import sparse
from scipy.optimize import minimize,Bounds,LinearConstraint
from scipy.spatial.transform import Rotation as R,Slerp
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/video-dance-forefoot-v4';OUT=ROOT/'assets-source/video-dance-hard-support-v5';OUT.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
N=289;sourceFrames=138+np.arange(N)/4;flight=((sourceFrames>=141)&(sourceFrames<=144))|((sourceFrames>=207)&(sourceFrames<=210))
supportIntervals={'left':[[138,138],[153,164],[171,176]],'right':[[138,138],[148,164],[171,176],[200,205]]}
forefootIntervals={'left':[[153,164]],'right':[[204,205]]}
mask=lambda intervals:np.array([any(a<=f<=b for a,b in intervals) for f in sourceFrames])
support={s:mask(v) for s,v in supportIntervals.items()};forefoot={s:mask(v) for s,v in forefootIntervals.items()}
config={'schema':'whole-segment-hard-contact.1','parent':'video-dance-forefoot-v4','originalSourceFrames':[138,210],'originalFrameCount':73,'derivedSolveSamples':N,'subdivisionsPerOriginalInterval':4,
 'samplingMeaning':'Uniform action-constraint solve/export grid, NOT new video frames/detections or increased source framerate. All73 originalPTS remain; rational derived times are identified separately.',
 'supportIntervals':supportIntervals,'forefootIntervals':forefootIntervals,'flightIntervals':[[141,144],[207,210]],
 'unknownPolicy':'No contact label. Whole-shoe nonpenetration and fixed-length reach only.',
 'preserved':'V4 world foot orientations, original rootXZ/hips turn, all upper-body local tracks; original flight curve protected at every derived point, not just8 original frames.',
 'hardContact':'Selected actual shoe region minimumY=0, toe region for explicitly authored forefoot and whole sole otherwise. No soft contact cost.',
 'variables':'One rootY and two ankleY corrections at each uniform action sample; known-support ankles fixed by actual skin geometry iteration; all flight corrections fixed0. No manual per-frame editing or event relabelling.',
 'objective':'Minimize sum of squared second differences of the three correction trajectories, with fixed1e-8 squared-displacement numerical regularization. Contact stays an equality; objective weights are never searched.',
 'solver':'SciPy trust-constr sparse quadratic/linear problem, maxiter250 gtol1e-9 xtol1e-11 barrier_tol1e-10, four fixed actual-skin linearization passes per body',
 'maximumCorrectionM':.20,'reachMarginM':.001,'fixedSkinPasses':4,
 'gates':{'solverConstraintViolationM':1e-6,'allKnownSupportDenseAbsoluteHeightM':.001,'unknownDenseMinimumHeightM':-.001,'protectedFlightCurvePositionErrorM':1e-5,'changedLegLocalOriginalIntervalAngleDeg':45,'finiteAndBoneLengthM':1e-5},
 'stopPolicy':'Do not relax ground/flight or rescan parameters after failure. Preserve logs and derived candidate if finite; actual VRM/dense interpolation and real viewing remain necessary.'}
(OUT/'fixed-problem.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
D2=sparse.diags([np.ones(N-2),-2*np.ones(N-2),np.ones(N-2)],[0,1,2],shape=(N-2,N),format='csc');Q=sparse.block_diag([D2.T@D2+sparse.eye(N)*1e-8]*3,format='csc')
reports=[];variants=[]
def unit(v):
 length=np.linalg.norm(v)
 if length<1e-10:raise ValueError('degenerate IK bone')
 return v/length
def swing(a,b):
 a=unit(a);b=unit(b);q=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)]
 if np.linalg.norm(q)<1e-8:raise ValueError('antipodal direction unresolved')
 return R.from_quat(q)
for body in ('female','male'):
 old=read(BASE/f'{body}-dance-forefoot-v4.json');rig=read(ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json');bones=rig['normalizedBones'];names=list(bones);idx={s:i for i,s in enumerate(names)}
 oldTimes=np.array(old['clip']['tracks'][0]['times']);times=np.interp(sourceFrames,np.arange(138,211),oldTimes);times[::4]=oldTimes
 q0={t['name'].split('.')[0]:Slerp(oldTimes,R.from_quat(np.array(t['values']).reshape(73,4)))(times).as_quat() for t in old['clip']['tracks'] if t['name'].endswith('.quaternion')}
 for tr in old['clip']['tracks']:
  if tr['name'].endswith('.quaternion'):q0[tr['name'].split('.')[0]][::4]=np.array(tr['values']).reshape(73,4)
 oldPos=np.array(next(t['values'] for t in old['clip']['tracks'] if t['name']=='hips.position')).reshape(73,3);pos0=np.column_stack([np.interp(times,oldTimes,oldPos[:,a]) for a in range(3)]);pos0[::4]=oldPos
 rootParent=np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T;rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()};ww={}
 def baseworld(s):
  if s in ww:return ww[s]
  local=np.tile(np.eye(4),(N,1,1));local[:,:3,:3]=R.from_quat(q0[s]).as_matrix();local[:,:3,3]=pos0 if s=='hips' else bones[s]['localPosition'];p=bones[s]['parentSemantic'];ww[s]=(baseworld(p) if p else rootParent)@local;return ww[s]
 W0=np.stack([baseworld(s) for s in names],axis=1)
 groups={};regions={}
 for side in ('left','right'):
  vv=rig['footwear']['skinSamples'][side];groups[side]=[]
  for i,v in enumerate(vv):
   for inf in v['influences']:
    if inf['weight']>0:groups[side].append((i,idx[inf['semantic']],inf['weight'],np.linalg.inv(rest[inf['semantic']])@np.r_[v['world'],1]))
  regions[side]=[i for i,v in enumerate(vv) if v['world'][2]>=rig['lengths'][side]['ankleRest'][2]+.015]
 def skin_heights(W):
  mins={};contact={}
  for side,group in groups.items():
   pts=np.zeros((N,len(rig['footwear']['skinSamples'][side]),3))
   for i,si,weight,p in group:pts[:,i]+=weight*np.einsum('fij,j->fi',W[:,si],p)[:,:3]
   mins[side]=pts[:,:,1].min(axis=1);toe=pts[:,regions[side],1].min(axis=1);contact[side]=np.where(forefoot[side],toe,mins[side])
  return mins,contact
 min0,contact0=skin_heights(W0);reach={}
 for side in ('left','right'):
  H=W0[:,idx[side+'UpperLeg'],:3,3];A=W0[:,idx[side+'Foot'],:3,3];L=rig['lengths'][side]['thigh']+rig['lengths'][side]['calf'];xz=((A[:,[0,2]]-H[:,[0,2]])**2).sum(axis=1)
  reach[side]=A[:,1]+np.sqrt(np.maximum(0,L*L-xz))-H[:,1]-.001
 def geometry(c):
  dy=c.reshape(3,N);W=W0.copy();W[:,:,:,3]+=np.column_stack((np.zeros(N),dy[0],np.zeros(N),np.zeros(N)))[:,None,:]
  q={s:v.copy() for s,v in q0.items()};pos=pos0+np.einsum('ij,fj->fi',np.linalg.inv(rootParent[:3,:3]),np.column_stack((np.zeros(N),dy[0],np.zeros(N))))
  maxReach=0.
  for k in range(N):
   if flight[k]:W[k]=W0[k];continue
   for ci,side in enumerate(('left','right'),1):
    upper,lower,foot,toe=[side+x for x in ('UpperLeg','LowerLeg','Foot','Toes')];H=W[k,idx[upper],:3,3].copy();A=W0[k,idx[foot],:3,3].copy();A[1]+=dy[ci,k]
    d=np.linalg.norm(A-H);a=rig['lengths'][side]['thigh'];b=rig['lengths'][side]['calf'];maxReach=max(maxReach,d-a-b,abs(a-b)-d)
    if not abs(a-b)+1e-8<d<a+b+1e-7:raise ValueError(f'{body} source{sourceFrames[k]} {side} unreachable {d} versus{a+b}')
    direction=unit(A-H);bend=W0[k,idx[lower],:3,3]-W0[k,idx[upper],:3,3];bend=unit(bend-direction*(bend@direction));along=(a*a-b*b+d*d)/(2*d);K=H+direction*along+bend*np.sqrt(max(0,a*a-along*along))
    ur=swing(W0[k,idx[lower],:3,3]-W0[k,idx[upper],:3,3],K-H)*R.from_matrix(W0[k,idx[upper],:3,:3]);lr=swing(W0[k,idx[foot],:3,3]-W0[k,idx[lower],:3,3],A-K)*R.from_matrix(W0[k,idx[lower],:3,:3])
    W[k,idx[upper],:3,:3]=ur.as_matrix();W[k,idx[lower],:3,:3]=lr.as_matrix();W[k,idx[lower],:3,3]=K;W[k,idx[foot],:3,3]=A;W[k,idx[toe],:3,3]=W0[k,idx[toe],:3,3]+[0,dy[ci,k],0]
    for bone in (upper,lower,foot):
     p=bones[bone]['parentSemantic'];val=(R.from_matrix(W[k,idx[p],:3,:3]).inv()*R.from_matrix(W[k,idx[bone],:3,:3])).as_quat()
     if val@q0[bone][k]<0:val=-val
     q[bone][k]=val
  return W,q,pos,maxReach
 c=np.zeros(3*N);biasMin={s:np.zeros(N) for s in groups};biasContact={s:np.zeros(N) for s in groups};passes=[];failure=None
 try:
  for iteration in range(4):
   fixedMask=np.zeros(3*N,dtype=bool);fixedValues=np.zeros(3*N)
   for ci in range(3):fixedMask[ci*N:(ci+1)*N]=flight
   lo=np.full(3*N,-.2);hi=np.full(3*N,.2)
   for ci,side in enumerate(('left','right'),1):
    known=support[side];offset=ci*N;fixedMask[offset:offset+N]|=known;fixedValues[offset:offset+N][known]=-contact0[side][known]-biasContact[side][known]
    unknown=~known&~flight;lo[offset:offset+N][unknown]=np.maximum(-.2,-min0[side][unknown]-biasMin[side][unknown])
   if np.any(abs(fixedValues[fixedMask])>.2):raise ValueError('hard support exceeds fixed20cm correction budget')
   free=np.flatnonzero(~fixedMask);fixed=np.flatnonzero(fixedMask);Qff=Q[free][:,free];linear=np.asarray(Q[free][:,fixed]@fixedValues[fixed]).ravel()
   rr=[];cc=[];vv=[];upper=[];row=0
   for ci,side in enumerate(('left','right'),1):
    for k in np.flatnonzero(~flight):rr.extend([row,row]);cc.extend([k,ci*N+k]);vv.extend([1.,-1.]);upper.append(reach[side][k]);row+=1
   C=sparse.csc_matrix((vv,(rr,cc)),shape=(row,3*N));u=np.array(upper)-C[:,fixed]@fixedValues[fixed];Cfree=C[:,free]
   initial=np.clip(c[free],lo[free],hi[free]);res=minimize(lambda x:float(x@(Qff@x)+2*linear@x),initial,jac=lambda x:2*(Qff@x+linear),hess=lambda x:2*Qff,
    method='trust-constr',bounds=Bounds(lo[free],hi[free]),constraints=LinearConstraint(Cfree,-np.inf,u),options={'maxiter':250,'gtol':1e-9,'xtol':1e-11,'barrier_tol':1e-10,'sparse_jacobian':True,'verbose':0})
   c=fixedValues.copy();c[free]=res.x
   passes.append({'pass':iteration+1,'success':bool(res.success),'message':str(res.message),'iterations':int(res.nit),'optimality':float(res.optimality),'constraintViolation':float(res.constr_violation),'objective':float(res.fun),'freeVariables':len(free)})
   if not res.success or res.constr_violation>1e-6:raise ValueError('fixed-budget hard QP failed; no relaxation/retry')
   W,q,pos,maxReach=geometry(c);mins,contact=skin_heights(W)
   for ci,side in enumerate(('left','right'),1):biasMin[side]=mins[side]-min0[side]-c[ci*N:(ci+1)*N];biasContact[side]=contact[side]-contact0[side]-c[ci*N:(ci+1)*N]
   passes[-1].update({'actualKnownContactAbsoluteMax':max(float(abs(contact[s][support[s]]).max()) for s in groups),'actualNonFlightSoleMinimum':min(float(mins[s][~flight].min()) for s in groups),'maxReachExcess':maxReach})
 except Exception as e:failure=str(e)
 if failure:
  report={'body':body,'status':'FAILED fixed-budget feasibility; no valid motion exported','reason':failure,'passes':passes};reports.append(report);(OUT/f'{body}-failure.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report));break
 asset=copy.deepcopy(old);changed=[]
 for tr in asset['clip']['tracks']:
  name,prop=tr['name'].split('.')
  if prop=='position' or name in [s+b for s in ('left','right') for b in ('UpperLeg','LowerLeg','Foot')]:
   tr['times']=times.tolist();tr['values']=(pos if prop=='position' else q[name]).reshape(-1).tolist();changed.append(tr['name'])
 asset['id']='video-dance-hard-support-v5';asset['clip']['name']='Video_Dance_Hard_Support_Once_v5';asset['adaptationParentSha256']=sha(BASE/f'{body}-dance-forefoot-v4.json');asset['hardConstraintProblemSha256']=sha(OUT/'fixed-problem.json');asset['contactAssumption']='Manual whole-segment hard support, unknown only nonpenetration; uniform289 ACTION solve samples, original73 sourcePTS preserved; no new detections/video frames.'
 path=OUT/f'{body}-dance-hard-support-v5.json';path.write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8');variants.append({'avatarSha256':asset['avatarSha256'],'file':path.name,'sha256':sha(path),'bytes':path.stat().st_size})
 rows=[]
 for k,f in enumerate(sourceFrames):rows.append({'sourceFrameFraction':float(f),'sourcePTSAtTimeBase1over96000':int((138*4+k)*1001),'originalSourceFrame':int(f) if k%4==0 else None,'derivedInterpolationNotVideoFrame':bool(k%4),'clipTime':float(times[k]),'protectedFlight':bool(flight[k]),'rootDeltaY':float(c[k]),'feet':{s:{'support':bool(support[s][k]),'forefoot':bool(forefoot[s][k]),'ankleDeltaY':float(c[(ci+1)*N+k]),'minimumY':float(mins[s][k]),'selectedContactHeight':float(contact[s][k])} for ci,s in enumerate(('left','right'))}})
 localSteps={};sourceIntervalSteps={}
 for s in [s+b for s in ('left','right') for b in ('UpperLeg','LowerLeg','Foot')]:
  rot=R.from_quat(q[s]);localSteps[s]=float(np.rad2deg((rot[1:]*rot[:-1].inv()).magnitude()).max());original=rot[::4];sourceIntervalSteps[s]=float(np.rad2deg((original[1:]*original[:-1].inv()).magnitude()).max())
 lengthError=max(float(abs(np.linalg.norm(W[:,idx[s],:3,3]-W[:,idx[b['parentSemantic']],:3,3],axis=1)-np.linalg.norm(rest[s][:3,3]-rest[b['parentSemantic']][:3,3])).max()) for s,b in bones.items() if b['parentSemantic'])
 report={'body':body,'status':'QP complete; actual VRM/dense interpolation pending, not accepted','passes':passes,'changedTracks':changed,'rootDeltaYRange':[float(c[:N].min()),float(c[:N].max())],'allKnownSupportAbsoluteMax':max(float(abs(contact[s][support[s]]).max()) for s in groups),'nonFlightSoleMinimum':min(float(mins[s][~flight].min()) for s in groups),'flightWorldMatrixMaxErrorAtAllDerivedPoints':float(abs(W[flight]-W0[flight]).max()),'rootXZMaximumError':float(abs(pos[:,[0,2]]-pos0[:,[0,2]]).max()),'originalTrackTimeSubsequenceExact':bool(np.array_equal(times[::4],oldTimes)),'fixedBoneLengthMaxErrorM':lengthError,'localMaxDerivedStepDeg':localSteps,'localMaxOriginalIntervalStepDeg':sourceIntervalSteps,'rows':rows,'preliminaryFailures':[]}
 if report['allKnownSupportAbsoluteMax']>.001:report['preliminaryFailures'].append('actual hard support not met within1mm after fixed skin passes')
 if report['nonFlightSoleMinimum']<-.001:report['preliminaryFailures'].append('actual nonpenetration not met within1mm')
 if max(sourceIntervalSteps.values())>45:report['preliminaryFailures'].append('changed leg local original-interval step exceeds45deg')
 reports.append(report);(OUT/f'{body}-hard-support-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');(OUT/f'{body}-world-reference.json').write_text(json.dumps({'names':names,'times':times.tolist(),'world':W.tolist()},separators=(',',':')),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='rows'},indent=2))
if len(variants)==2:
 entry=read(BASE/'dance-imports.entry.json');entry.update({'id':'video-dance-hard-support-v5','clip':'Video_Dance_Hard_Support_Once_v5','variants':variants});entry['origin']+='; whole-segment hard support manual event constraints, uniform derived solve grid; not accepted until actual verification';(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
(OUT/'summary.json').write_text(json.dumps([{k:v for k,v in r.items() if k not in ('rows',)} for r in reports],indent=2),encoding='utf-8')
