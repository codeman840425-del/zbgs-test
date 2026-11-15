"""One authorized parent-relative continuous swing comparison, left forearm only."""
import copy,hashlib,json,pathlib
import numpy as np
from scipy.spatial.transform import Rotation as R
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/video-dance-target-v1';OUT=ROOT/'assets-source/video-dance-target-v2';OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def swing(a,b):
 q=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)]
 if np.linalg.norm(q)<1e-8:raise ValueError('Exact antipodal transport not resolved; reject')
 return R.from_quat(q)
reports=[];variants=[]
for body in ['female','male']:
 source=BASE/f'{body}-dance-normalized.json';a=json.loads(source.read_text());asset=copy.deepcopy(a)
 rig=json.loads((ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json').read_text());bones=rig['normalizedBones'];data=np.load(BASE/f'{body}-world.npz');oldworld=data['world'];names=list(data['names']);idx={s:i for i,s in enumerate(names)}
 targetTrack=next(t for t in asset['clip']['tracks'] if t['name']=='leftLowerArm.quaternion');qold=np.array(targetTrack['values']).reshape(73,4)
 parent=R.from_matrix(oldworld[:,idx['leftUpperArm'],:3,:3]);d=oldworld[:,idx['leftHand'],:3,3]-oldworld[:,idx['leftLowerArm'],:3,3];d/=np.linalg.norm(d,axis=1)[:,None];localdir=parent.inv().apply(d)
 restaxis=np.array(bones['leftHand']['localPosition']);restaxis/=np.linalg.norm(restaxis)
 qnew=[R.from_quat(qold[0])]
 for k in range(1,73):qnew.append(swing(localdir[k-1],localdir[k])*qnew[-1])
 qnew=R.concatenate(qnew);q=qnew.as_quat();q[0]=qold[0]
 for k in range(1,73):
  if q[k]@q[k-1]<0:q[k]*=-1
 assert np.max(np.linalg.norm(qnew.apply(restaxis)-localdir,axis=1))<1e-10
 targetTrack['values']=q.reshape(-1).tolist()
 assert targetTrack['values'][:4]==next(t for t in a['clip']['tracks'] if t['name']=='leftLowerArm.quaternion')['values'][:4]
 unchanged=[]
 for old,new in zip(a['clip']['tracks'],asset['clip']['tracks']):
  if old['name']!='leftLowerArm.quaternion':assert old==new;unchanged.append(old['name'])
  else:assert old['times']==new['times']
 asset['id']='video-dance-target-v2';asset['clip']['name']='Video_Dance_Target_Once_v2';asset['adaptationParentSha256']=sha(source)
 asset['twistAssumption']='Left forearm parent-relative continuous shortest-swing transport from exactv1 first frame. Unobserved twist continuity choice, not measured human pronation/supination; neutral local hand inherits. All54 other tracks unchanged.'
 tracks={t['name']:np.array(t['values']).reshape(73,-1) for t in asset['clip']['tracks']};rootParent=np.array(bones['hips']['actualParentWorldMatrix']).reshape(4,4).T
 matrices=[]
 for k in range(73):
  world={}
  def calc(s):
   if s in world:return world[s]
   b=bones[s];m=np.eye(4);m[:3,:3]=R.from_quat(tracks[s+'.quaternion'][k]).as_matrix();m[:3,3]=tracks['hips.position'][k] if s=='hips' else b['localPosition']
   world[s]=(calc(b['parentSemantic']) if b['parentSemantic'] else rootParent)@m;return world[s]
  matrices.append(np.stack([calc(s) for s in names]))
 world=np.array(matrices);wr=R.from_matrix(world[:,idx['leftLowerArm'],:3,:3]);wr0=R.from_matrix(oldworld[:,idx['leftLowerArm'],:3,:3])
 newdir=world[:,idx['leftHand'],:3,3]-world[:,idx['leftLowerArm'],:3,3];newdir/=np.linalg.norm(newdir,axis=1)[:,None]
 newAngles=np.rad2deg((wr[1:]*wr[:-1].inv()).magnitude());localAngles=np.rad2deg((qnew[1:]*qnew[:-1].inv()).magnitude());oldAngles=np.rad2deg((wr0[1:]*wr0[:-1].inv()).magnitude())
 bodyUnchanged=[s for s in names if not s.startswith('left') or s in ['leftShoulder','leftUpperArm','leftUpperLeg','leftLowerLeg','leftFoot','leftToes']]
 bodyMatrixError=max(float(abs(world[:,idx[s]]-oldworld[:,idx[s]]).max()) for s in bodyUnchanged)
 rest={s:np.array(b['worldMatrix']).reshape(4,4).T for s,b in bones.items()}
 lengthError=max(float(abs(np.linalg.norm(world[:,idx[s],:3,3]-world[:,idx[b['parentSemantic']],:3,3],axis=1)-np.linalg.norm(rest[s][:3,3]-rest[b['parentSemantic']][:3,3])).max()) for s,b in bones.items() if b['parentSemantic'])
 report={'body':body,'v1AssetSha256':sha(source),'changedTrack':'leftLowerArm.quaternion','unchangedTracksCount':len(unchanged),'unchangedTrackNames':unchanged,'firstFrameLocalQuaternionExact':True,'ptsAndTrackTimesUnchanged':True,'rootLegTorsoOtherArmWorldMatrixMaxDifference':bodyMatrixError,'targetBoneLengthMaxErrorM':lengthError,'leftForearmWorldDirectionMaxDifference':float(np.linalg.norm(newdir-d,axis=1).max()),'leftHandOriginMaxDifferenceM':float(np.linalg.norm(world[:,idx['leftHand'],:3,3]-oldworld[:,idx['leftHand'],:3,3],axis=1).max()),'critical207_208':{'worldRotationV1Deg':float(oldAngles[69]),'worldRotationV2Deg':float(newAngles[69]),'localRotationV2Deg':float(localAngles[69])},'leftForearmWorldMaxStepV1Deg':float(oldAngles.max()),'leftForearmWorldMaxStepV2Deg':float(newAngles.max()),'leftForearmLocalMaxStepV2Deg':float(localAngles.max()),'sourceFrameOfWorldMaxStepV2':[int(newAngles.argmax()+138),int(newAngles.argmax()+139)],'handFingerEffect':'Hand/finger local tracks exact unchanged, but descendant world orientations and fingertip positions change with transported forearm; expected and must visually review.','contactEffect':'Allroot/leg/foot world matrices unchanged. Frozenv1 floor defects and runtime groundLift remain; no contact fix.'}
 file=OUT/f'{body}-dance-normalized-v2.json';file.write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8');variants.append({'avatarSha256':asset['avatarSha256'],'file':file.name,'sha256':sha(file),'bytes':file.stat().st_size})
 (OUT/f'{body}-transport-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');reports.append(report)
 np.savez_compressed(OUT/f'{body}-world.npz',world=world,times=data['times'],names=names)
 (OUT/f'{body}-world-reference.json').write_text(json.dumps({'names':names,'times':data['times'].tolist(),'world':world.tolist()},separators=(',',':')),encoding='utf-8')
entry=json.loads((BASE/'dance-imports.entry.json').read_text());entry['id']='video-dance-target-v2';entry['clip']='Video_Dance_Target_Once_v2';entry['origin']+='; leftforearm continuous parent-relative swing transport, unobserved twist fallback';entry['variants']=variants
(OUT/'dance-imports.entry.json').write_text(json.dumps(entry,indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['body','unchangedTracksCount','rootLegTorsoOtherArmWorldMatrixMaxDifference','leftForearmWorldDirectionMaxDifference','targetBoneLengthMaxErrorM','critical207_208','leftForearmWorldMaxStepV2Deg','leftForearmLocalMaxStepV2Deg']} for r in reports],indent=2))
