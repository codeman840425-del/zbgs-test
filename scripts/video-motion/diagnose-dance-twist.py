"""Diagnose frozen v1 rotations; one-step transport is a diagnostic, not an exported fix."""
import hashlib,json,pathlib
import numpy as np
from scipy.spatial.transform import Rotation as R
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/video-dance-target-v1';OUT=ROOT/'assets-source/video-dance-twist-study-v1';OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def angle(a,b):return float(np.rad2deg(np.arccos(np.clip(a@b,-1,1))))
def swing(a,b):
 q=np.r_[np.cross(a,b),1+np.clip(a@b,-1,1)]
 if np.linalg.norm(q)<1e-8:raise ValueError('Antipodal transport direction; no silent choice')
 return R.from_quat(q)
reports=[]
for body in ['female','male']:
 data=np.load(BASE/f'{body}-world.npz');world=data['world'];names=list(data['names']);indices={s:i for i,s in enumerate(names)}
 rig=json.loads((ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json').read_text());asset=json.loads((BASE/f'{body}-dance-normalized.json').read_text());tracks={t['name']:np.array(t['values']).reshape(73,-1) for t in asset['clip']['tracks']}
 i=indices['leftLowerArm'];j=indices['leftHand'];pi=indices['leftUpperArm'];dirs=world[:,j,:3,3]-world[:,i,:3,3];dirs/=np.linalg.norm(dirs,axis=1)[:,None]
 parent=R.from_matrix(world[:,pi,:3,:3]);wr=R.from_matrix(world[:,i,:3,:3]);local=R.from_quat(tracks['leftLowerArm.quaternion']);localdirs=parent.inv().apply(dirs)
 rest=np.array(rig['normalizedBones']['leftHand']['localPosition']);rest/=np.linalg.norm(rest)
 rows=[]
 for k in range(1,73):
  # Carry previous local orientation with its parent, then swing minimally to new direction.
  transportedLocal=swing(localdirs[k-1],localdirs[k])*local[k-1]
  transportedWorld=parent[k]*transportedLocal
  remainder=wr[k]*transportedWorld.inv();rv=remainder.as_rotvec()
  rows.append({'source_frames':[137+k,138+k],
   'world_direction_step_deg':angle(dirs[k-1],dirs[k]),
   'parent_world_rotation_step_deg':float(np.rad2deg((parent[k]*parent[k-1].inv()).magnitude())),
   'forearm_world_rotation_step_deg':float(np.rad2deg((wr[k]*wr[k-1].inv()).magnitude())),
   'forearm_local_rotation_step_deg':float(np.rad2deg((local[k]*local[k-1].inv()).magnitude())),
   'parent_relative_direction_step_deg':angle(localdirs[k-1],localdirs[k]),
   'rest_axis_dot_parent_relative_direction_before_after':[float(rest@localdirs[k-1]),float(rest@localdirs[k])],
   'rest_axis_to_desired_angle_before_after_deg':[angle(rest,localdirs[k-1]),angle(rest,localdirs[k])],
   'local_rotation_vectors_before_after_deg':[np.rad2deg(local[k-1].as_rotvec()).tolist(),np.rad2deg(local[k].as_rotvec()).tolist()],
   'one_step_parent_aware_transport':{'world_rotation_step_deg':float(np.rad2deg((transportedWorld*wr[k-1].inv()).magnitude())),
    'direction_error':float(np.linalg.norm(transportedWorld.apply(rest)-dirs[k])),
    'remaining_original_twist_deg':float(np.rad2deg(rv@dirs[k])),
    'twist_axis_perpendicular_residual':float(np.linalg.norm(rv-dirs[k]*(rv@dirs[k]))),
    'remainder_fixes_current_direction_error':float(np.linalg.norm(remainder.apply(dirs[k])-dirs[k]))}})
 reports.append({'body':body,'frozen_asset_sha256':sha(BASE/f'{body}-dance-normalized.json'),'critical':next(x for x in rows if x['source_frames']==[207,208]),'all_steps':rows})
result={'reports':reports,'conclusion':'At207/208 the frozen adapter produces large axial roll although forearm direction changes much less and parent world orientation barely changes. Each frame shortest-rest swing approaches the opposite rest axis; its selected swing axis changes strongly. This is evidence of representation/roll ambiguity in the adapter, not a parent flip or an86deg source direction step.',
 'candidate_proposal':'One bounded parent-relative continuous swing transport: initialize first local quaternion from frozenv1; next local quaternion = shortestSwing(previous_parent_relative_bone_direction,current_parent_relative_bone_direction) * previous_local_quaternion. Keep torso/parent/root/length/PTS and all other tracks unchanged. Neutral hand remains local and inherits transported forearm. No world-lock or invented measured palm twist. Not yet generated/approved as an animation.',
 'limitations':['One-step counterfactual only, not cumulative transport replay or visual acceptance.','Source17.1deg directional change remains and is not ground-truth validated.','Short-axis near-antipodal sensitivity is established; exact rest-antipode is not reached.','No contact/root/ground changes.','Raw model and frozenv1 asset bytes unchanged.']}
(OUT/'twist-diagnostic.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps([r['critical'] for r in reports],indent=2))
