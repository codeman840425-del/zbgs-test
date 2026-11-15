"""Target-only normalized local tracks. Existing runtime controller unchanged."""
import pathlib,json,hashlib,numpy as np
from scipy.spatial.transform import Rotation as R
from scipy.optimize import minimize
from glb_source import GLB
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-target-adaptation-v1';BASE=ROOT/'assets-source/video-motion-v2'
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
cfg=json.loads((OUT/'squat-input-config.json').read_text());p=np.load(ROOT/'assets-source/video-motion-v1/processed.npz');pts=p['filteredCanonical'];times=p['times'];n=len(times)
g=GLB((BASE/'video-squat-dvids-wrists-v2.glb').read_bytes());sw,sq,st=g.evaluate('Video_Squat_DVIDS_Wrists_Once_v2',times);sr,_,_=g.evaluate(None,np.array([0.]))
rig={'pelvis':'hips','spine_01':'spine','spine_02':'chest','spine_03':'upperChest','neck_01':'neck','Head':'head'}
for s,side in [('l','left'),('r','right')]:
 for src,tgt in [('clavicle','Shoulder'),('upperarm','UpperArm'),('lowerarm','LowerArm'),('hand','Hand'),('thigh','UpperLeg'),('calf','LowerLeg'),('foot','Foot'),('ball','Toes')]:rig[src+'_'+s]=side+tgt
 for f,t in [('index','Index'),('middle','Middle'),('ring','Ring'),('pinky','Little'),('thumb','Thumb')]:
  for j in range(1,4):rig[f'{f}_0{j}_{s}']=side+t+(['Metacarpal','Proximal','Distal']if f=='thumb'else['Proximal','Intermediate','Distal'])[j-1]
unit=lambda v:v/max(np.linalg.norm(v),1e-12)
def align(a,b):
 a=unit(a);b=unit(b);v=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)];assert np.linalg.norm(v)>1e-8;return R.from_quat(v)
results=[]
for target in cfg['targetInputs']:
 body=target['body'];rp=OUT/target['normalizedRigFile'];r=json.loads(rp.read_text());bones=r['normalizedBones'];names=list(bones);idx={s:i for i,s in enumerate(names)};parents={s:b['parentSemantic']for s,b in bones.items()};rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()}
 q={s:np.tile(b['localQuaternion'],(n,1)) for s,b in bones.items()};local={s:np.tile(b['localPosition'],(n,1))for s,b in bones.items()}
 for src,s in rig.items():
  if s not in bones:continue
  i=g.byname[src];parentRest=R.from_matrix(sr[0,g.parents[i],:3,:3]);invRest=R.from_matrix(sr[0,i,:3,:3]).inv();v=(parentRest*R.from_quat(sq[i])*invRest).as_quat();v[:,[0,2]]*=-1
  q[s]=(R.from_quat(v)*R.from_quat(bones[s]['localQuaternion'])).as_quat()
 world={};rootParent=np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T
 def update(k):
  world.clear()
  def calc(s):
   if s in world:return world[s]
   m=np.eye(4);m[:3,:3]=R.from_quat(q[s][k]).as_matrix();m[:3,3]=local[s][k];world[s]=(calc(parents[s])if parents[s]else rootParent)@m;return world[s]
  for s in names:calc(s)
 def setw(k,s,rotation):
  parent=world[parents[s]]if parents[s]else rootParent;q[s][k]=(R.from_matrix(parent[:3,:3]).inv()*rotation).as_quat();update(k)
 anchors={};orient={};yawRows={}
 for side,heel,toe,sign in [('left',29,31,1),('right',30,32,-1)]:
  fw=np.median(pts[:30,toe]-pts[:30,heel],axis=0);desiredYaw=np.arctan2(fw[0],fw[2]);rf=rest[side+'Toes'][:3,3]-rest[side+'Foot'][:3,3];restYaw=np.arctan2(rf[0],rf[2]);yaw=desiredYaw-restYaw;delta=R.from_rotvec([0,yaw,0]);orient[side]=delta;yawRows[side]={'predictedInitialToeYawRadians':float(desiredYaw),'restToeYawRadians':float(restYaw),'appliedYawRadians':float(yaw)}
  foot=rest[side+'Foot'][:3,3];relative=np.array([s['world']for s in r['footwear']['skinSamples'][side]])-foot
  floorOffset=-float(delta.apply(relative)[:,1].min());anchors[side]=np.array([sign*target['proposedAnkleWidthMetres']/2,floorOffset,0.])
 audit=[];worldAll=[];sourceBodyDelta=[]
 for k in range(n):
  update(k);hips=world['hips'][:3,3].copy();roots=[]
  for side,hip,knee,ank in [('left',23,25,27),('right',24,26,28)]:
   off=world[side+'UpperLeg'][:3,3]-hips;L=r['lengths'][side];roots.append(anchors[side]-L['thigh']*unit(pts[k,knee]-pts[k,hip])-L['calf']*unit(pts[k,ank]-pts[k,knee])-off)
  proposed=np.mean(roots,axis=0);offsets={side:world[side+'UpperLeg'][:3,3]-hips for side in ['left','right']}
  constraints=[{'type':'ineq','fun':lambda x,s=s:(r['lengths'][s]['thigh']+r['lengths'][s]['calf']-1e-5)**2-np.sum((anchors[s]-x-offsets[s])**2)}for s in ['left','right']]
  solution=minimize(lambda x:np.sum((x-proposed)**2),proposed,method='SLSQP',constraints=constraints,options={'maxiter':40,'ftol':1e-12})
  assert solution.success,('Root reach solve failed',body,k,solution.message)
  wanted=solution.x;local['hips'][k]=(np.linalg.inv(rootParent)@np.r_[wanted,1])[:3];update(k);per={}
  for side,hip,kn,an in [('left',23,25,27),('right',24,26,28)]:
   up,lo,fo=[side+x for x in ['UpperLeg','LowerLeg','Foot']];start=world[up][:3,3].copy();goal=anchors[side];di=goal-start;dist=np.linalg.norm(di);di=unit(di);a,b=[r['lengths'][side][x]for x in ['thigh','calf']];dd=np.clip(dist,abs(a-b)+1e-6,a+b-1e-6);pole=pts[k,kn]-pts[k,hip];pole-=di*(pole@di);pole=unit(pole);along=(a*a+dd*dd-b*b)/(2*dd);height=np.sqrt(max(0,a*a-along*along));kne=start+di*along+pole*height
   setw(k,up,align(world[lo][:3,3]-start,kne-start)*R.from_matrix(world[up][:3,:3]));setw(k,lo,align(world[fo][:3,3]-world[lo][:3,3],goal-world[lo][:3,3])*R.from_matrix(world[lo][:3,:3]))
   for s in [fo,side+'Toes']:setw(k,s,orient[side]*R.from_matrix(rest[s][:3,:3]))
   per[side]={'reachExcess':max(0,float(dist-a-b)),'ankleError':float(np.linalg.norm(world[fo][:3,3]-goal)),'kneeFlexionDeg':float(np.rad2deg(np.pi-np.arccos(np.clip((a*a+b*b-dd*dd)/(2*a*b),-1,1)))),'kneeWorld':world[lo][:3,3].tolist(),'poleCanonical':pole.tolist()}
  audit.append({'time':float(times[k]),'hipsWorld':world['hips'][:3,3].tolist(),'proposedHipsWorld':proposed.tolist(),'rootReachProjectionMetres':float(np.linalg.norm(wanted-proposed)),'rootConstraintSolveIterations':int(solution.nit),'legs':per});worldAll.append(np.stack([world[s].copy()for s in names]))
 worldAll=np.array(worldAll);skinReports={}
 for side in ['left','right']:
  verts=r['footwear']['skinSamples'][side];skin=np.zeros((n,len(verts),3))
  for vi,v in enumerate(verts):
   for inf in v['influences']:
    weight=inf['weight'];s=inf['semantic']
    if weight<=0:continue
    nr=rest[s];rawrest=np.array(bones[s]['rawWorldMatrix']).reshape(4,4).T
    # Normalized and raw rest orientations are equal for these pinned rigs;
    # include their exact offset so the rule does not silently assume it.
    matrices=worldAll[:,idx[s]]@np.linalg.inv(nr)@rawrest
    localRest=np.linalg.inv(rawrest)@np.r_[v['world'],1]
    skin[:,vi]+=weight*np.einsum('fij,j->fi',matrices,localRest)[:,:3]
  low=skin[:,:,1].min(axis=1);bottomIndices=np.argsort(np.array([v['world'][1]for v in verts]))[:12];travel=np.linalg.norm(np.diff(skin[:,bottomIndices],axis=0),axis=2)
  skinReports[side]={'minimumShoeY':float(low.min()),'maximumLowestShoeY':float(low.max()),'bottom12MaxFrameTravel':float(travel.max()),'bottom12P95FrameTravel':float(np.quantile(travel,.95)),'sameFootVertexCount':len(verts)}
 tracks=[]
 for s in names:
  vals=q[s].copy()
  for k in range(1,n):
   if vals[k]@vals[k-1]<0:vals[k]*=-1
  tracks.append({'name':s+'.quaternion','type':'quaternion','times':times.tolist(),'values':vals.reshape(-1).tolist()})
 tracks.append({'name':'hips.position','type':'vector','times':times.tolist(),'values':local['hips'].reshape(-1).tolist()})
 payload={'schema':'normalized-vrm-motion.1','id':'video-squat-target-v1','coordinateSpace':'three-vrm-3.5.5-normalized-local-absolute','avatarSha256':r['avatarSha256'],'sourceClipSha256':hashfile(BASE/'video-squat-dvids-wrists-v2.glb'),'normalizedRigSha256':hashfile(rp),'footwearSha256':r['footwear']['sha256'],'basis':'normalized-local-absolute-after-rotateVRM0','rootPolicy':'local-displacement','contactAssumption':'stationary-squat-only; source relative stance prediction, fixed heel/toe orientation per support','clip':{'name':'Video_Squat_Target_Once_v1','duration':float(times[-1]),'tracks':tracks}}
 file=OUT/(body+'-squat-normalized.json');file.write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
 report={'body':body,'sha256':hashfile(file),'duration':float(times[-1]),'frames':n,'trackCount':len(tracks),'ankleTargetsWorld':{s:v.tolist()for s,v in anchors.items()},'initialToeYaw':yawRows,'hipRangeMinMax':[worldAll[:,idx['hips'],:3,3].min(axis=0).tolist(),worldAll[:,idx['hips'],:3,3].max(axis=0).tolist()],'maxReachExcess':max(a['legs'][s]['reachExcess']for a in audit for s in ['left','right']),'maxAnkleError':max(a['legs'][s]['ankleError']for a in audit for s in ['left','right']),'maxKneeFrameTravel':max(float(np.linalg.norm(np.diff(worldAll[:,idx[s+'LowerLeg'],:3,3],axis=0),axis=1).max())for s in ['left','right']),'skin':skinReports,'finite':bool(np.isfinite(worldAll).all()),'status':'offline-target-candidate; skin/body/garment full visual acceptance pending'}
 report['checks']={'finite':report['finite'],'reachUnder1mm':report['maxReachExcess']<.001,'ankleErrorUnder1mm':report['maxAnkleError']<.001,'soleNoPenetrationOver2mm':min(s['minimumShoeY']for s in skinReports.values())>=-.002,'soleNoHoverOver2mm':max(s['maximumLowestShoeY']for s in skinReports.values())<=.002}
 report['maxRootReachProjectionMetres']=max(x['rootReachProjectionMetres']for x in audit)
 (OUT/(body+'-fit-report.json')).write_text(json.dumps(report,indent=2),encoding='utf-8');(OUT/(body+'-frame-audit.json')).write_text(json.dumps(audit,indent=2),encoding='utf-8');np.savez_compressed(OUT/(body+'-world.npz'),world=worldAll,times=times,names=names);results.append(report)
 (OUT/(body+'-world-reference.json')).write_text(json.dumps({'names':names,'times':times.tolist(),'world':worldAll.tolist()},separators=(',',':')),encoding='utf-8')
entry={'id':'video-squat-target-v1','format':'normalized-vrm-motion.1','clip':'Video_Squat_Target_Once_v1','duration':float(times[-1]),'playback':'once-then-idle','rootPolicy':'local-displacement','heldPropsAllowed':False,'space':{'kind':'local-footprint','radiusTargetM':1.1,'navigationAllowedDuringPlayback':False},'origin':'DVIDS squat; offline fit to exact normalized VRM/footwear; stationary support assumption, not calibrated capture','variants':[{'avatarSha256':cfg['targetInputs'][i]['avatarSha256'],'file':body+'-squat-normalized.json','sha256':results[i]['sha256'],'bytes':(OUT/(body+'-squat-normalized.json')).stat().st_size}for i,body in enumerate(['female','male'])]}
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8');print(json.dumps(results,indent=2))
