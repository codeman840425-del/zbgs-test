"""One human-annotated 73-frame support cleanup. Fixed budget, no threshold scan.
All changes are explicit derived data; no detector output or source mutation.
"""
from pathlib import Path
import copy, hashlib, json
import numpy as np
from scipy.interpolate import BSpline
from scipy.optimize import minimize, LinearConstraint
from scipy.spatial.transform import Rotation as R

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/video-dance-target-v2'
OUT=ROOT/'assets-source/video-dance-support-v3';OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
observations=read(ROOT/'assets-source/video-dance-twist-study-v1/support-observations.json')
known={'apparent_contact','apparent_contact_pivot','apparent_forefoot_contact_heel_raised'}
frames=np.arange(138,211);flight=((frames>=141)&(frames<=144))|(frames>=207)
# 1 takeoff segment coefficient; 12 cubic basis coefficients over the middle.
# First/last two B-spline coefficients are fixed zero: correction and derivative
# vanish at protected flight boundaries. No coefficient per bad source frame.
knots=np.r_[np.repeat(144.,4),np.linspace(144,207,14)[1:-1],np.repeat(207.,4)]
full=BSpline.design_matrix(np.clip(frames,144,207),knots,3).toarray()
central=full[:,2:-2];central[(frames<=144)|(frames>=207)]=0
u=np.clip((frames-138)/3,0,1);start=1-3*u*u+2*u*u*u
B=np.column_stack((start,central));nb=B.shape[1];assert np.max(abs(B[flight]))==0
D1=np.diff(B,axis=0);D2=np.diff(B,n=2,axis=0)
config={'schema':'human-reviewed-support-cleanup.1','scopeFrames':[138,210],
 'manualObservationFile':'assets-source/video-dance-twist-study-v1/support-observations.json',
 'manualObservationSha256':sha(ROOT/'assets-source/video-dance-twist-study-v1/support-observations.json'),
 'automaticContactLabelsUsed':False,'protectedFlightFrames':frames[flight].tolist(),
 'parameterization':'RootY and two ankleY finite cubic spline corrections; one takeoff ease-out coefficient plus12 central cubic coefficients per channel; zero correction/derivative at144 and207.',
 'basisCoefficientsPerChannel':nb,'centralKnotVector':knots.tolist(),
 'weights':{'support':100,'rootDisplacement':.2,'ankleDisplacement':.3,'firstDifference':1,'secondDifference':100},
 'virtualSoleClearanceM':.002,'reachMarginM':.001,'coefficientBoundM':.20,
 'fixedSkinLinearizationPasses':4,'optimizer':'SLSQP quadratic linear constraints; maxiter250 ftol1e-11; fixed parameters, no scan',
 'ankleXZ':'Original each-frame XZ, not stationary support anchors; pivot/slide not solved',
 'footOrientation':'Original world foot/toe orientation preserved, level fallback; no fabricated measured roll',
 'unknownPolicy':'No support attraction. Virtual nonpenetration and reach constraints only; not a detected contact claim',
 'failureGates':{'supportHeightMaxM':.010,'minimumSoleYAfterRuntimeLiftM':-.002,'legLengthErrorM':1e-5,'maximumChangedLegLocalStepDeg':45,'phaseSeamRootVelocityChangeMPerS':.5,'protectedFlightAssetDifference':0},
 'notes':'Physical plausibility and visual quality still require actual character replay. Contact constraints are human-authored hypotheses. Contact drift/XZ friction not recovered.'}
(OUT/'fixed-cleanup.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
variants=[];summaries=[]

def unit(v):
 n=np.linalg.norm(v)
 if n<1e-10:raise ValueError('degenerate bone')
 return v/n
def swing(a,b):
 a=unit(a);b=unit(b);q=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)]
 if np.linalg.norm(q)<1e-8:raise ValueError('antipodal IK swing unresolved')
 return R.from_quat(q)

for body in ('female','male'):
 source=BASE/f'{body}-dance-normalized-v2.json';old=read(source);asset=copy.deepcopy(old)
 rig=read(ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json');bones=rig['normalizedBones'];ref=read(BASE/f'{body}-world-reference.json')
 names=ref['names'];idx={s:i for i,s in enumerate(names)};W0=np.array(ref['world']);times=np.array(ref['times'])
 parent=np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T
 rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()}
 q0={t['name'].split('.')[0]:np.array(t['values']).reshape(73,4) for t in old['clip']['tracks'] if t['name'].endswith('.quaternion')}
 pos0=np.array(next(t['values'] for t in old['clip']['tracks'] if t['name']=='hips.position')).reshape(73,3)
 feet={};patch={};support={};labels={}
 for side in ('left','right'):
  vv=rig['footwear']['skinSamples'][side];groups={}
  for i,v in enumerate(vv):
   for inf in v['influences']:
    if inf['weight']>0:
     s=inf['semantic'];groups.setdefault(s,[]).append((i,inf['weight'],np.linalg.inv(rest[s])@np.r_[v['world'],1]))
  feet[side]=(len(vv),groups)
  region=[i for i,v in enumerate(vv) if v['world'][2]>=rig['lengths'][side]['ankleRest'][2]+.015]
  low=min(vv[i]['world'][1] for i in region);patch[side]=[i for i in region if vv[i]['world'][1]<low+.012]
  labels[side]=[next(o[side] for o in observations['observations'] if o['frames'][0]<=f<=o['frames'][1]) for f in frames]
  support[side]=np.array([x in known for x in labels[side]])
 def skin(W):
  result={}
  for side,(count,groups) in feet.items():
   v=np.zeros((73,count,3))
   for s,group in groups.items():
    for i,weight,p in group:v[:,i]+=weight*np.einsum('fij,j->fi',W[:,idx[s]],p)[:,:3]
   result[side]=v
  return result
 def heights(S):
  minima={s:v[:,:,1].min(axis=1) for s,v in S.items()};contact={}
  for side,v in S.items():
   ys=v[:,patch[side],1];lo=ys.min(axis=1);wt=np.exp(-(ys-lo[:,None])/.001);toe=(ys*wt).sum(axis=1)/wt.sum(axis=1)
   contact[side]=np.where(np.array(['forefoot' in l for l in labels[side]]),toe,minima[side])
  return minima,contact
 min0,contact0=heights(skin(W0))
 reach={}
 for side in ('left','right'):
  hip=W0[:,idx[side+'UpperLeg'],:3,3];ankle=W0[:,idx[side+'Foot'],:3,3]
  a=rig['lengths'][side]['thigh'];b=rig['lengths'][side]['calf'];xz=((ankle[:,[0,2]]-hip[:,[0,2]])**2).sum(axis=1)
  reach[side]=ankle[:,1]+np.sqrt((a+b)**2-xz)-hip[:,1]-.001
 def solve_geometry(coeff):
  corrections=[B@coeff[i*nb:(i+1)*nb] for i in range(3)]
  q={s:v.copy() for s,v in q0.items()};pos=pos0.copy();pos+=np.einsum('ij,fj->fi',np.linalg.inv(parent[:3,:3]),np.column_stack((np.zeros(73),corrections[0],np.zeros(73))))
  allworld=[];actualReach=[]
  for k in range(73):
   if flight[k]:allworld.append(W0[k].copy());continue
   world={}
   def update():
    world.clear()
    def calc(s):
     if s in world:return world[s]
     m=np.eye(4);m[:3,:3]=R.from_quat(q[s][k]).as_matrix();m[:3,3]=pos[k] if s=='hips' else bones[s]['localPosition']
     p=bones[s]['parentSemantic'];world[s]=(calc(p) if p else parent)@m;return world[s]
    for s in names:calc(s)
   def setw(s,rotation):
    p=bones[s]['parentSemantic'];pr=world[p] if p else parent
    val=(R.from_matrix(pr[:3,:3]).inv()*rotation).as_quat()
    if val@q0[s][k]<0:val=-val
    q[s][k]=val;update()
   update()
   for ci,side in enumerate(('left','right'),1):
    upper,lower,foot,toe=[side+s for s in ('UpperLeg','LowerLeg','Foot','Toes')]
    H=world[upper][:3,3].copy();A=W0[k,idx[foot],:3,3].copy();A[1]+=corrections[ci][k]
    d=np.linalg.norm(A-H);a=rig['lengths'][side]['thigh'];b=rig['lengths'][side]['calf']
    actualReach.append({'sourceFrame':int(frames[k]),'side':side,'reachExcess':max(0.,d-a-b),'underReach':max(0.,abs(a-b)-d)})
    if not abs(a-b)+1e-7<d<a+b+1e-7:raise ValueError(f'unreachable {body} {frames[k]} {side}: {d} vs {a+b}')
    direction=unit(A-H);oldBend=W0[k,idx[lower],:3,3]-W0[k,idx[upper],:3,3]
    bend=oldBend-direction*(oldBend@direction)
    if np.linalg.norm(bend)<1e-6:raise ValueError('ambiguous original knee plane')
    bend=unit(bend);along=(a*a-b*b+d*d)/(2*d);K=H+direction*along+bend*np.sqrt(max(0,a*a-along*along))
    setw(upper,swing(world[lower][:3,3]-H,K-H)*R.from_matrix(world[upper][:3,:3]))
    setw(lower,swing(world[foot][:3,3]-world[lower][:3,3],A-K)*R.from_matrix(world[lower][:3,:3]))
    setw(foot,R.from_matrix(W0[k,idx[foot],:3,:3]));setw(toe,R.from_matrix(W0[k,idx[toe],:3,:3]))
   allworld.append(np.stack([world[s].copy() for s in names]))
  return np.array(allworld),q,pos,corrections,actualReach
 # Fixed four skin-linearization passes; all parameters above unchanged.
 coeff=np.zeros(3*nb);biasMin={s:np.zeros(73) for s in feet};biasContact={s:np.zeros(73) for s in feet};passes=[]
 for iteration in range(4):
  Aobj=[];yobj=[];C=[];lower=[];upper=[]
  for ci in range(3):
   for mat,w in ((B,.2 if ci==0 else .3),(D1,1),(D2,100)):
    block=np.zeros((len(mat),3*nb));block[:,ci*nb:(ci+1)*nb]=mat*np.sqrt(w);Aobj.append(block);yobj.append(np.zeros(len(mat)))
  for ci,side in enumerate(('left','right'),1):
   active=~flight;mask=support[side]
   block=np.zeros((mask.sum(),3*nb));block[:,ci*nb:(ci+1)*nb]=B[mask]*10
   Aobj.append(block);yobj.append((.002-contact0[side][mask]-biasContact[side][mask])*10)
   block=np.zeros((active.sum(),3*nb));block[:,ci*nb:(ci+1)*nb]=B[active]
   C.append(block);lower.extend((.002-min0[side][active]-biasMin[side][active]).tolist());upper.extend([np.inf]*active.sum())
   block=np.zeros((active.sum(),3*nb));block[:,:nb]=B[active];block[:,ci*nb:(ci+1)*nb]=-B[active]
   C.append(block);lower.extend([-np.inf]*active.sum());upper.extend(reach[side][active].tolist())
  Aobj=np.concatenate(Aobj);yobj=np.concatenate(yobj);C=np.concatenate(C);Q=Aobj.T@Aobj;lin=Aobj.T@yobj
  res=minimize(lambda c:float(c@Q@c-2*lin@c),coeff,jac=lambda c:2*(Q@c-lin),method='SLSQP',bounds=[(-.2,.2)]*(3*nb),constraints=LinearConstraint(C,np.array(lower),np.array(upper)),options={'maxiter':250,'ftol':1e-11})
  coeff=res.x
  W,q,pos,corr,reachAudit=solve_geometry(coeff);mins,contact=heights(skin(W))
  for ci,side in enumerate(('left','right'),1):
   biasMin[side]=mins[side]-min0[side]-corr[ci];biasContact[side]=contact[side]-contact0[side]-corr[ci]
  passes.append({'pass':iteration+1,'success':bool(res.success),'message':str(res.message),'iterations':int(res.nit),'minimumSoleY':min(float(v.min()) for v in mins.values()),'maxSupportHeight':max(float(abs(contact[s][support[s]]).max()) for s in feet)})
 # Derived motion uses unchanged keys for every protected source flight frame.
 changed=[]
 for tr in asset['clip']['tracks']:
  name,prop=tr['name'].split('.');values=pos if prop=='position' else q[name]
  if not np.array_equal(np.array(tr['values']).reshape(73,-1),values):changed.append(tr['name']);tr['values']=values.reshape(-1).tolist()
 asset['id']='video-dance-support-v3';asset['clip']['name']='Video_Dance_Support_Once_v3'
 asset['adaptationParentSha256']=sha(source)
 asset['contactAssumption']='Explicit human-reviewed support hypotheses, finite rootY/ankleY splines plus fixed-length leg IK; unknown intervals virtual nonpenetration only. Source-flight keys protected, no measured foot roll or contact forces.'
 asset['cleanupConfigSha256']=sha(OUT/'fixed-cleanup.json')
 path=OUT/f'{body}-dance-support-v3.json';path.write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8')
 variants.append({'avatarSha256':asset['avatarSha256'],'file':path.name,'sha256':sha(path),'bytes':path.stat().st_size})
 rows=[];localsteps={};worldsteps={};maxChanges={}
 for s in names:
  newrot=R.from_quat(q[s]);oldrot=R.from_quat(q0[s]);localsteps[s]=float(np.rad2deg((newrot[1:]*newrot[:-1].inv()).magnitude()).max());maxChanges[s]=float(np.rad2deg((newrot*oldrot.inv()).magnitude()).max())
  wr=R.from_matrix(W[:,idx[s],:3,:3]);worldsteps[s]=float(np.rad2deg((wr[1:]*wr[:-1].inv()).magnitude()).max())
 for k,f in enumerate(frames):
  rows.append({'sourceFrame':int(f),'sourcePTS':int(f*1001),'timeBase':'1/24000','clipTime':float(times[k]),'flightProtected':bool(flight[k]),'rootDeltaY':float(corr[0][k]),'feet':{s:{'observation':labels[s][k],'supportHypothesis':bool(support[s][k]),'ankleDeltaY':float(corr[ci][k]),'soleMinimumY':float(mins[s][k]),'selectedContactHeight':float(contact[s][k]),'beforeSoleMinimumY':float(min0[s][k])} for ci,s in enumerate(('left','right'),1)}})
 lengthError=max(float(abs(np.linalg.norm(W[:,idx[s],:3,3]-W[:,idx[b['parentSemantic']],:3,3],axis=1)-np.linalg.norm(rest[s][:3,3]-rest[b['parentSemantic']][:3,3])).max()) for s,b in bones.items() if b['parentSemantic'])
 legnames=[s+x for s in ('left','right') for x in ('UpperLeg','LowerLeg','Foot','Toes')]
 seamIndices=[i for i in range(72) if flight[i]!=flight[i+1]];rootSeam=max(abs(np.diff(corr[0])[seamIndices]/np.diff(times)[seamIndices]))
 report={'body':body,'parentSha256':sha(source),'changedTracks':changed,'fixedPasses':passes,'basisCoefficients':coeff.reshape(3,nb).tolist(),'rootDeltaYRange':[float(min(corr[0])),float(max(corr[0]))],'flightWorldMatrixMaxDifference':float(abs(W[flight]-W0[flight]).max()),'flightLocalKeysExact':bool(np.array_equal(pos[flight],pos0[flight]) and all(np.array_equal(q[s][flight],q0[s][flight]) for s in names)),'rootXZMaxDifference':float(abs(pos[:,[0,2]]-pos0[:,[0,2]]).max()),'hipsQuaternionExact':bool(np.array_equal(q['hips'],q0['hips'])),'targetLengthMaxErrorM':lengthError,'localMaxStepDeg':localsteps,'worldMaxStepDeg':worldsteps,'localMaximumChangeFromV2Deg':maxChanges,'rootCorrectionMaxVelocityMPerS':float(abs(np.diff(corr[0])/np.diff(times)).max()),'rootCorrectionMaxAccelerationMPerS2':float(abs(np.diff(corr[0],n=2)/(times[1]-times[0])**2).max()),'phaseSeamRootVelocityChangeMPerS':float(rootSeam),'knownSupportHeightMaxM':max(float(abs(contact[s][support[s]]).max()) for s in feet),'allSoleMinimumY':min(float(v.min()) for v in mins.values()),'finite':bool(np.isfinite(W).all()),'reachAudit':reachAudit,'rows':rows,'status':'UNVERIFIED candidate; actual VRM shoe replay and runtime121 lift not yet checked; flat-foot fallback does not reproduce observed raised heel'}
 report['preliminaryFailures']=[]
 if not all(p['success'] for p in passes):report['preliminaryFailures'].append('optimizer did not converge in fixed budget')
 if report['knownSupportHeightMaxM']>.010:report['preliminaryFailures'].append('known support residual exceeds10mm')
 if max(localsteps[s] for s in legnames)>45:report['preliminaryFailures'].append('changed leg local step exceeds45deg')
 if rootSeam>.5:report['preliminaryFailures'].append('phase seam root correction velocity exceeds0.5m/s')
 if lengthError>1e-5:report['preliminaryFailures'].append('bone length changed')
 if not report['flightLocalKeysExact']:report['preliminaryFailures'].append('protected flight changed')
 (OUT/f'{body}-cleanup-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 (OUT/f'{body}-world-reference.json').write_text(json.dumps({'names':names,'times':times.tolist(),'world':W.tolist()},separators=(',',':')),encoding='utf-8')
 np.savez_compressed(OUT/f'{body}-world.npz',world=W,times=times,names=names)
 summaries.append({k:report[k] for k in ('body','changedTracks','fixedPasses','rootDeltaYRange','flightLocalKeysExact','targetLengthMaxErrorM','rootXZMaxDifference','knownSupportHeightMaxM','allSoleMinimumY','phaseSeamRootVelocityChangeMPerS','preliminaryFailures')})
entry=read(BASE/'dance-imports.entry.json');entry['id']='video-dance-support-v3';entry['clip']='Video_Dance_Support_Once_v3';entry['variants']=variants;entry['origin']+='; human-reviewed support cleanup study, fixed rootY/ankleY splines and leg IK; not automatic contact recovery'
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
(OUT/'summary.json').write_text(json.dumps(summaries,indent=2),encoding='utf-8')
print(json.dumps(summaries,indent=2))
