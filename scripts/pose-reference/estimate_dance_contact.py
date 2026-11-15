"""One predeclared contact-rule experiment on73frames. No observation labels are read."""
import gzip,hashlib,json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-contact-study-v1';OUT.mkdir(parents=True,exist_ok=True)
SPEC={
 'scope_frames':[138,210], 'runs':1,
 'body_length':'median2D hip-knee-ankle length over both legs, original pixels',
 'image_floor_proxy':'95th percentile of all heel/toe imageY within73frames; one shared horizontal image baseline, not measured ground plane',
 'mb_floor_proxy':'95th percentile of both ankles modelY; separate model units, not physical floor',
 'coordinate_filter':'3-sample coordinate median, centered; repeated endpoints. Derived features only; raw unchanged.',
 'min_landmark_visibility_presence':0.65,
 'image_air_gap_leg_fraction':0.04, 'model_air_gap_leg_fraction':0.025,
 'image_contact_band_leg_fraction':0.025,'model_contact_band_leg_fraction':0.04,
 'stable_point_speed_leg_per_second':0.18,'stable_model_ankle_speed_leg_per_second':0.25,
 'pivot_heel_raise_leg_fraction':0.015,'pivot_speed_excess_leg_per_second':0.04,
 'identity_assignment_margin_leg_fraction':0.05,
 'minimum_air_run_frames':2,
 'confidence_policy':'Scores are capped rule evidence strengths, not calibrated probabilities; airborne .65, forefoot pivot .60, flat support .60, unknown0.',
 'no_manual_labels':'Do not read support-observations.json or hard-code its intervals in this estimator.',
 'no_motion_mutation':'No root/foot/clip edits, no contact IK, no frame removal. Any disagreement with manual observations is retained for a separate validator.',
}
(OUT/'fixed-rule.json').write_text(json.dumps(SPEC,indent=2),encoding='utf-8')
snapshot=ROOT/'evidence/dance-video-pose-v1/sequence.raw.json.gz';raw=gzip.decompress(snapshot.read_bytes());frames=json.loads(raw)['frames'][138:211]
mbpath=ROOT/'evidence/dance-video-pose-v1/motionbert-turn-v1/predictions.raw.json';mbdata=json.loads(mbpath.read_text());mb=np.array(mbdata['outputs']['raw_2d'])
# raw_2d condition avoids importing the explicit172/173 input-label correction.
xy=np.array([[[p['x']*3840,p['y']*2160] for p in f['poses'][0]['normalized']] for f in frames]);conf=np.array([[min(p['visibility'],p['presence']) for p in f['poses'][0]['normalized']] for f in frames])
times=np.array([f['source_seconds'] for f in frames]);n=len(times);assert n==73
def med3(a):return np.median(np.stack([np.concatenate([a[:1],a[:-1]]),a,np.concatenate([a[1:],a[-1:]])]),axis=0)
fxy=med3(xy);fmb=med3(mb)
leg=float(np.median(np.concatenate([np.linalg.norm(fxy[:,h]-fxy[:,k],axis=1)+np.linalg.norm(fxy[:,k]-fxy[:,a],axis=1) for h,k,a in [(23,25,27),(24,26,28)]])))
mbleg=float(np.median(np.concatenate([np.linalg.norm(fmb[:,h]-fmb[:,k],axis=1)+np.linalg.norm(fmb[:,k]-fmb[:,a],axis=1) for h,k,a in [(4,5,6),(1,2,3)]])))
floor=float(np.quantile(fxy[:,[29,30,31,32],1],.95));mbfloor=float(np.quantile(fmb[:,[6,3],1],.95))
speed=np.linalg.norm(np.gradient(fxy,times,axis=0),axis=-1)/leg;mbspeed=np.linalg.norm(np.gradient(fmb,times,axis=0),axis=-1)/mbleg
mbpix=fmb[:,:,:2]*1080+[1920,1080]
direct=np.linalg.norm(fxy[:,27]-mbpix[:,6],axis=1)+np.linalg.norm(fxy[:,28]-mbpix[:,3],axis=1)
cross=np.linalg.norm(fxy[:,27]-mbpix[:,3],axis=1)+np.linalg.norm(fxy[:,28]-mbpix[:,6],axis=1)
identity_ok=(cross-direct)/leg>SPEC['identity_assignment_margin_leg_fraction']
rows=[]
for k,f in enumerate(frames):
 feet={}
 for side,ank,heel,toe,ma in [('left',27,29,31,6),('right',28,30,32,3)]:
  gapheel=(floor-fxy[k,heel,1])/leg;gaptoe=(floor-fxy[k,toe,1])/leg;gapmin=min(gapheel,gaptoe);mbgap=(mbfloor-fmb[k,ma,1])/mbleg
  c=float(min(conf[k,[ank,heel,toe]]));valid=c>=SPEC['min_landmark_visibility_presence']
  imageair=gapmin>SPEC['image_air_gap_leg_fraction'];modelair=mbgap>SPEC['model_air_gap_leg_fraction']
  toeclose=abs(gaptoe)<=SPEC['image_contact_band_leg_fraction'];heelclose=abs(gapheel)<=SPEC['image_contact_band_leg_fraction']
  toepivot=toeclose and speed[k,toe]<=SPEC['stable_point_speed_leg_per_second'] and (gapheel>SPEC['pivot_heel_raise_leg_fraction'] or speed[k,heel]>speed[k,toe]+SPEC['pivot_speed_excess_leg_per_second'])
  flat=toeclose and heelclose and max(speed[k,toe],speed[k,heel])<=SPEC['stable_point_speed_leg_per_second'] and abs(mbgap)<=SPEC['model_contact_band_leg_fraction'] and mbspeed[k,ma]<=SPEC['stable_model_ankle_speed_leg_per_second']
  state='unknown';strength=0.;reason='insufficient_agreement_or_moving_support'
  if valid and imageair and modelair:state='airborne_candidate';strength=.65;reason='image_and_model_gap_agree'
  elif valid and identity_ok[k] and toepivot and abs(mbgap)<=SPEC['model_contact_band_leg_fraction']:state='forefoot_pivot_candidate';strength=.60;reason='toe_near_baseline_stable_heel_raised_or_moving'
  elif valid and identity_ok[k] and flat:state='flat_support_candidate';strength=.60;reason='heel_toe_near_baseline_low_speed_model_agrees'
  elif not valid:reason='landmark_visibility_or_presence_low'
  feet[side]={'state':state,'evidence_strength':strength,'is_physical_ground_truth':False,'anatomical_identity':'consistent_with_model' if identity_ok[k] else 'unknown','reason':reason,'features':{'confidence_min':c,'heel_gap_leg':float(gapheel),'toe_gap_leg':float(gaptoe),'model_ankle_gap_leg':float(mbgap),'heel_speed_leg_s':float(speed[k,heel]),'toe_speed_leg_s':float(speed[k,toe]),'model_ankle_speed_leg_s':float(mbspeed[k,ma]),'image_air':bool(imageair),'model_air':bool(modelair)}}
 rows.append({k2:f[k2] for k2 in ['source_frame_index','pts','time_base','source_seconds']}|{'identity_direct_cost_leg':float(direct[k]/leg),'identity_cross_cost_leg':float(cross[k]/leg),'feet':feet})
# Reject isolated one-frame air events without replacing their coordinates or labels.
for side in ['left','right']:
 flags=np.array([r['feet'][side]['state']=='airborne_candidate' for r in rows]);starts=np.flatnonzero(flags & ~np.r_[False,flags[:-1]])
 for start in starts:
  end=start
  while end+1<n and flags[end+1]:end+=1
  if end-start+1<SPEC['minimum_air_run_frames']:
   for k in range(start,end+1):rows[k]['feet'][side].update(state='unknown',evidence_strength=0.,reason='isolated_air_evidence_rejected')
for row in rows:
 states=[v['state'] for v in row['feet'].values()]
 row['whole_body']='bilateral_airborne_candidate' if all(s=='airborne_candidate' for s in states) else 'support_candidate' if any(s in ['flat_support_candidate','forefoot_pivot_candidate'] for s in states) else 'unknown'
result={'source_sha256':hashlib.sha256(raw).hexdigest(),'motionbert_raw_prediction_sha256':hashlib.sha256(mbpath.read_bytes()).hexdigest(),'motionbert_condition':'raw_2d','fixed_rule_sha256':hashlib.sha256((OUT/'fixed-rule.json').read_bytes()).hexdigest(),'calibration':{'image_leg_pixels':leg,'image_floor_proxy_y':floor,'model_leg_units':mbleg,'model_floor_proxy_y':mbfloor},'frames':rows,'limits':['Shared horizontal2D lower-envelope baseline ignores perspective/depth and is not a measured floor.','MotionBERT has no toe/heel or physical root calibration; agreement is not independent ground truth.','Raw ankle/heel/toe identity may flip or be occluded; no manual identity correction here.','Pivot candidates are not constant world-space foot anchors.','No result authorizes rootheight/contact adaptation until independent validation.']}
(OUT/'contact-estimates.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
summary={s:sum(r['whole_body']==s for r in rows) for s in sorted(set(r['whole_body'] for r in rows))};print(json.dumps({'calibration':result['calibration'],'whole_body_counts':summary,'bilateral_airborne_frames':[r['source_frame_index'] for r in rows if r['whole_body']=='bilateral_airborne_candidate']},indent=2))
