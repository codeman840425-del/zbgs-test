"""One direction-only73-frame target study. No squat anchors, runtime edits, or raw fixes."""
import hashlib,json,pathlib
import numpy as np
from scipy.spatial.transform import Rotation as R

ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-target-v1';OUT.mkdir(parents=True,exist_ok=True)
BASE=ROOT/'evidence/dance-video-pose-v1/motionbert-turn-v1';RIGS=ROOT/'assets-source/video-target-adaptation-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=json.loads((BASE/'inputs.json').read_text());pred=json.loads((BASE/'predictions.raw.json').read_text())
condition='swap_172_173_2d';points=np.array(pred['outputs'][condition])*[1,-1,-1]
times=np.array([f['source_seconds'] for f in inputs['frames']]);times-=times[0];n=len(times);assert n==73
def unit(v):
 length=np.linalg.norm(v)
 if length<1e-8:raise ValueError('Degenerate direction; no hidden fill')
 return v/length
def basis(lateral,up):
 x=unit(lateral);y=unit(up-x*(up@x));z=unit(np.cross(x,y));return np.column_stack((x,y,z))
def align(a,b):
 a=unit(a);b=unit(b);v=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)]
 if np.linalg.norm(v)<1e-8:
  axis=np.eye(3)[np.argmin(abs(a))];return R.from_rotvec(unit(np.cross(a,axis))*np.pi)
 return R.from_quat(v)
sourceHipBasis=[basis(p[4]-p[1],p[8]-p[0]) for p in points]
sourceChestBasis=[basis(p[11]-p[14],p[8]-p[0]) for p in points]
xy=np.array([[[p['x']*3840,p['y']*2160] for p in f['raw_normalized_33']] for f in inputs['frames']])
hipsXY=(xy[:,23]+xy[:,24])/2;neckXY=(xy[:,11]+xy[:,12])/2
sourceTorsoPixels=float(np.median(np.linalg.norm(neckXY-hipsXY,axis=1)))
reports=[];variants=[];calibrations=[]
for body in ['female','male']:
 rp=RIGS/f'{body}-normalized-rig.json';rig=json.loads(rp.read_text());bones=rig['normalizedBones'];names=list(bones);idx={s:i for i,s in enumerate(names)}
 assert sha(ROOT/('prototype/public'+rig['source']))==rig['avatarSha256']
 rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()};parents={s:b['parentSemantic'] for s,b in bones.items()}
 rootParent=np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T
 targetHipBasis=basis(rest['leftUpperLeg'][:3,3]-rest['rightUpperLeg'][:3,3],rest['neck'][:3,3]-rest['hips'][:3,3])
 targetChestBasis=basis(rest['leftUpperArm'][:3,3]-rest['rightUpperArm'][:3,3],rest['neck'][:3,3]-rest['hips'][:3,3])
 torsoM=float(np.linalg.norm(rest['neck'][:3,3]-rest['hips'][:3,3]));scale=torsoM/sourceTorsoPixels
 q={s:np.tile(np.array(b['localQuaternion'],dtype=float),(n,1)) for s,b in bones.items()};local={s:np.tile(np.array(b['localPosition'],dtype=float),(n,1)) for s,b in bones.items()}
 world={}
 def update(k):
  world.clear()
  def calc(s):
   if s in world:return world[s]
   m=np.eye(4);m[:3,:3]=R.from_quat(q[s][k]).as_matrix();m[:3,3]=local[s][k]
   world[s]=(calc(parents[s]) if parents[s] else rootParent)@m;return world[s]
  for s in names:calc(s)
 def setw(k,s,rot):
  parent=world[parents[s]] if parents[s] else rootParent
  q[s][k]=(R.from_matrix(parent[:3,:3]).inv()*rot).as_quat();update(k)
 allworld=[];rows=[]
 for k,p in enumerate(points):
  desired=rest['hips'][:3,3]+np.array([(hipsXY[k,0]-hipsXY[0,0])*scale,-(hipsXY[k,1]-hipsXY[0,1])*scale,0.])
  local['hips'][k]=(np.linalg.inv(rootParent)@np.r_[desired,1])[:3];update(k)
  hipDelta=R.from_matrix(sourceHipBasis[k]@targetHipBasis.T);chestDelta=R.from_matrix(sourceChestBasis[k]@targetChestBasis.T)
  setw(k,'hips',hipDelta*R.from_matrix(rest['hips'][:3,:3]))
  setw(k,'upperChest',chestDelta*R.from_matrix(rest['upperChest'][:3,:3]))
  residual={}
  for side,h,kn,ank,sh,el,wr in [('left',4,5,6,11,12,13),('right',1,2,3,14,15,16)]:
   for bone,child,a,b in [(side+'UpperLeg',side+'LowerLeg',h,kn),(side+'LowerLeg',side+'Foot',kn,ank),(side+'UpperArm',side+'LowerArm',sh,el),(side+'LowerArm',side+'Hand',el,wr)]:
    target=unit(p[b]-p[a]);current=world[child][:3,3]-world[bone][:3,3]
    setw(k,bone,align(current,target)*R.from_matrix(world[bone][:3,:3]))
    fitted=unit(world[child][:3,3]-world[bone][:3,3]);residual[bone]=float(np.rad2deg(np.arccos(np.clip(fitted@target,-1,1))))
   # Missing foot/toe yaw uses pelvis heading; no planted foot/world anchor.
   forward=sourceHipBasis[k][:,2];yaw=np.arctan2(forward[0],forward[2]);rot=R.from_rotvec([0.,yaw,0.])
   for bone in [side+'Foot',side+'Toes']:setw(k,bone,rot*R.from_matrix(rest[bone][:3,:3]))
  rows.append({'sourceFrame':int(inputs['frames'][k]['source_frame_index']),'time':float(times[k]),'directionResidualDeg':residual})
  allworld.append(np.stack([world[s].copy() for s in names]))
 allworld=np.array(allworld)
 def skin_world(w):
  result={}
  for side in ['left','right']:
   verts=rig['footwear']['skinSamples'][side];skin=np.zeros((n,len(verts),3))
   for vi,v in enumerate(verts):
    for inf in v['influences']:
     if inf['weight']<=0:continue
     s=inf['semantic'];rawrest=np.array(bones[s]['rawWorldMatrix']).reshape(4,4).T
     matrices=w[:,idx[s]]@np.linalg.inv(rest[s])@rawrest
     skin[:,vi]+=inf['weight']*np.einsum('fij,j->fi',matrices,np.linalg.inv(rawrest)@np.r_[v['world'],1])[:,:3]
   result[side]=skin
  return result
 firstSkin=skin_world(allworld);heightOffset=-min(v[0,:,1].min() for v in firstSkin.values())
 # One initial placement offset only, same for all frames; not a per-frame floor correction.
 allworld[:,:,:,3]+=np.array([0.,heightOffset,0.,0.])[None,None,:]
 localOffset=np.linalg.inv(rootParent[:3,:3])@np.array([0.,heightOffset,0.]);local['hips']+=localOffset
 skins=skin_world(allworld)
 skinReport={side:{'lowestYByFrame':a[:,:,1].min(axis=1).tolist(),'minimumY':float(a[:,:,1].min()),'maximumPerFrameLowestY':float(a[:,:,1].min(axis=1).max()),'maxBottomSampleFrameTravel':float(np.linalg.norm(np.diff(a,axis=0),axis=2).max())} for side,a in skins.items()}
 tracks=[];qsteps={}
 for s in names:
  vals=q[s].copy()
  for k in range(1,n):
   if vals[k]@vals[k-1]<0:vals[k]*=-1
  qsteps[s]=float(np.rad2deg(2*np.arccos(np.clip(abs(np.sum(vals[1:]*vals[:-1],axis=1)),0,1))).max())
  tracks.append({'name':s+'.quaternion','type':'quaternion','times':times.tolist(),'values':vals.reshape(-1).tolist()})
 tracks.append({'name':'hips.position','type':'vector','times':times.tolist(),'values':local['hips'].reshape(-1).tolist()})
 payload={'schema':'normalized-vrm-motion.1','id':'video-dance-target-v1','coordinateSpace':'three-vrm-3.5.5-normalized-local-absolute','avatarSha256':rig['avatarSha256'],'sourceClipSha256':sha(BASE/'predictions.raw.json'),'normalizedRigSha256':sha(rp),'footwearSha256':rig['footwear']['sha256'],'basis':'normalized-local-absolute-after-rotateVRM0','rootPolicy':'local-displacement','contactAssumption':'unknown; no fixed anchors; source2D XY projection and one first-frame placement offset, rootdepth unknown','clip':{'name':'Video_Dance_Target_Once_v1','duration':float(times[-1]),'tracks':tracks}}
 file=OUT/f'{body}-dance-normalized.json';file.write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
 variants.append({'avatarSha256':rig['avatarSha256'],'file':file.name,'sha256':sha(file),'bytes':file.stat().st_size})
 # World bone length check includes every parent/child, independent of source lengths.
 error=max(float(abs(np.linalg.norm(allworld[:,idx[s],:3,3]-allworld[:,idx[parents[s]],:3,3],axis=1)-np.linalg.norm(rest[s][:3,3]-rest[parents[s]][:3,3])).max()) for s in names if parents[s])
 report={'body':body,'frames':n,'duration':float(times[-1]),'rigSha256':sha(rp),'fixedTargetLengthMaximumErrorM':error,'directionResidualMaxDeg':max(max(r['directionResidualDeg'].values()) for r in rows),'root2DProjectionScaleMetresPerPixel':scale,'rootDepthRecovered':False,'firstFrameOnlyUniformPlacementYOffsetM':float(heightOffset),'hipsRangeMinMax':[allworld[:,idx['hips'],:3,3].min(axis=0).tolist(),allworld[:,idx['hips'],:3,3].max(axis=0).tolist()],'localQuaternionMaxStepDeg':qsteps,'skin':skinReport,'finite':bool(np.isfinite(allworld).all()),'fallbacks':{'head_neck_hands_fingers':'Target neutral LOCAL rotation inherited from animated parent. No world locking; sourcehead proxy not used for head orientation.','foot_toe':'Level pitch/roll with pelvis-derived yaw; missing heel/toe evidence. Not fixed-foot contact.'},'status':'one fixed-bone direction candidate; shoe floor, contact, twist and visual acceptance not passed'}
 (OUT/f'{body}-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');reports.append(report)
 (OUT/f'{body}-frame-audit.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
 np.savez_compressed(OUT/f'{body}-world.npz',world=allworld,times=times,names=names)
 (OUT/f'{body}-world-reference.json').write_text(json.dumps({'names':names,'times':times.tolist(),'world':allworld.tolist()},separators=(',',':')),encoding='utf-8')
 calibrations.append({'body':body,'sourceCameraToStudyWorldDiagonal':[1,-1,-1],'targetRestHipBasis':targetHipBasis.tolist(),'targetRestChestBasis':targetChestBasis.tolist(),'actualHipsParentWorldMatrix':rootParent.tolist(),'sourceFrame138HipBasis':sourceHipBasis[0].tolist(),'sourceFrame138ChestBasis':sourceChestBasis[0].tolist(),'basisDeterminants':[float(np.linalg.det(targetHipBasis)),float(np.linalg.det(sourceHipBasis[0]))],'rule':'Right-handed camera-to-study mapping; sourceleft/right labels retained. Target rest lateral=left-right, up=hips-to-neck, forward=cross(lateral,up). World delta applied to actual rest rotation and converted through actual parent inverse. No second VRM0 axisflip at runtime. Camera physical extrinsics are not measured.'})
entry={'id':'video-dance-target-v1','format':'normalized-vrm-motion.1','clip':'Video_Dance_Target_Once_v1','duration':float(times[-1]),'playback':'once-then-idle','rootPolicy':'local-displacement','heldPropsAllowed':False,'space':{'kind':'local-footprint','radiusTargetM':1.5,'navigationAllowedDuringPlayback':False},'origin':'Pexels5359146 MotionBERT73-frame temporal pose; fixed targetbone direction study, unknown rootdepth/contact','variants':variants}
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
(OUT/'basis-calibration.json').write_text(json.dumps(calibrations,indent=2),encoding='utf-8')
(OUT/'input-provenance.json').write_text(json.dumps({'source':'evidence/dance-video-pose-v1/source.json','condition':condition,'inputsSha256':sha(BASE/'inputs.json'),'predictionSha256':sha(BASE/'predictions.raw.json'),'originalFrameTimes':pred['frame_times'],'targetTimes':times.tolist(),'sourceTorsoPixels':sourceTorsoPixels,'noFilteringApplied':True,'noSquatAnchors':True,'rootApproximation':'Source2D hipcenter XY displacement times fixed targettorso/source projectedtorso ratio. No rootdepth movement inferred. One first-frame ground placement only.'},indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['body','frames','duration','fixedTargetLengthMaximumErrorM','directionResidualMaxDeg','firstFrameOnlyUniformPlacementYOffsetM','hipsRangeMinMax','finite']}|{'shoeMinY':min(s['minimumY'] for s in r['skin'].values()),'shoeMaxLowestY':max(s['maximumPerFrameLowestY'] for s in r['skin'].values())} for r in reports],indent=2))
