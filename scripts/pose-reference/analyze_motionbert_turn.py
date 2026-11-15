"""Offline diagnostics, no metric or animation-acceptance claim."""
import hashlib,json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/dance-video-pose-v1/motionbert-turn-v1'
inp=json.loads((OUT/'inputs.json').read_text());pred=json.loads((OUT/'predictions.raw.json').read_text())
names=inp['joint_names'];frames=np.array([f['source_frame_index'] for f in inp['frames']])
conditions={'mediapipe_raw':np.array(inp['raw_mediapipe_predicted_world_meters_mapped17'])}|{k:np.array(v) for k,v in pred['outputs'].items()}
edges=[(0,1),(1,2),(2,3),(0,4),(4,5),(5,6),(0,7),(7,8),(8,9),(9,10),(8,11),(11,12),(12,13),(8,14),(14,15),(15,16)]
report={'frames':frames.tolist(),'time_policy':'Original73 samples138..210, PTS/time_base in inputs and predictions retained; no interpolation.',
 'comparison_units':'MediaPipe native values are predicted meters; MotionBERT native values are normalized model coordinates, NOT meters. Cross-model displacement uses dimensionless fraction of each sequence median hip-knee-ankle length. Hip-centered for local discontinuity; raw root displacement separately reported.',
 'heading':'atan2(lateral.z,lateral.x), lateral=(leftShoulder-rightShoulder)+(leftHip-rightHip); unwrapped degrees. Same camera-axis arithmetic for both models, not a calibrated physical heading or independently validated depth sign.',
 'conditions':{}}
for name,p in conditions.items():
    centered=p-p[:,0:1,:]
    lengths=np.array([np.linalg.norm(p[:,a]-p[:,b],axis=1) for a,b in edges]).T
    leg=float(np.median(np.r_[np.linalg.norm(p[:,1]-p[:,2],axis=1)+np.linalg.norm(p[:,2]-p[:,3],axis=1),np.linalg.norm(p[:,4]-p[:,5],axis=1)+np.linalg.norm(p[:,5]-p[:,6],axis=1)]))
    step=np.linalg.norm(np.diff(centered,axis=0),axis=-1);native_step=np.linalg.norm(np.diff(p,axis=0),axis=-1)
    lat=(p[:,11]-p[:,14])+(p[:,4]-p[:,1]);h=np.rad2deg(np.unwrap(np.arctan2(lat[:,2],lat[:,0])))
    top=np.dstack(np.unravel_index(np.argsort(step.ravel())[-8:][::-1],step.shape))[0]
    detail={'native_units':'predicted_meters' if name=='mediapipe_raw' else 'normalized_model_coordinates','median_leg_native':leg,
      'bones':{f'{names[a]}--{names[b]}':{'min_native':float(lengths[:,i].min()),'max_native':float(lengths[:,i].max()),'median_native':float(np.median(lengths[:,i])),'max_min_ratio':float(lengths[:,i].max()/lengths[:,i].min()),'coefficient_of_variation':float(lengths[:,i].std()/lengths[:,i].mean())} for i,(a,b) in enumerate(edges)},
      'heading_deg':h.tolist(),'heading_net_deg':float(h[-1]-h[0]),'heading_max_abs_step_deg':float(abs(np.diff(h)).max()),
      'root_native_min_max':[p[:,0].min(axis=0).tolist(),p[:,0].max(axis=0).tolist()],
      'root_max_step_native':float(np.linalg.norm(np.diff(p[:,0],axis=0),axis=1).max()),
      'max_centered_step_leg_fraction':float(step.max()/leg),'max_uncentered_step_native':float(native_step.max()),
      'top_centered_steps':[{'from_frame':int(frames[i]),'to_frame':int(frames[i+1]),'joint':names[j],'native':float(step[i,j]),'leg_fraction':float(step[i,j]/leg)} for i,j in top],
      'boundaries':{}}
    for a,b in [(146,147),(171,172),(172,173),(173,174)]:
        i=int(np.where(frames==a)[0][0]);detail['boundaries'][f'{a}_{b}']={'heading_step_deg':float(h[i+1]-h[i]),'max_centered_leg_fraction':float(step[i].max()/leg),'left_wrist_centered_leg_fraction':float(step[i,13]/leg),'right_wrist_centered_leg_fraction':float(step[i,16]/leg),'nose_centered_leg_fraction':float(step[i,9]/leg),'centered_native_by_joint':dict(zip(names,step[i].tolist()))}
    report['conditions'][name]=detail
    directions={}
    for a,b in edges:
        v=p[:,b]-p[:,a];lens=np.linalg.norm(v,axis=1)
        unit=v/np.maximum(lens[:,None],1e-12)
        angles=np.rad2deg(np.arccos(np.clip(np.sum(unit[1:]*unit[:-1],axis=1),-1,1)))
        k=int(angles.argmax());m=int(lens.argmin())
        directions[f'{names[a]}--{names[b]}']={'max_direction_step_deg':float(angles[k]),'max_step_frames':[int(frames[k]),int(frames[k+1])],'direction_steps_deg':angles.tolist(),'min_length_leg_fraction':float(lens[m]/leg),'min_length_frame':int(frames[m]),'exact_zero_length_frames':frames[lens<1e-12].tolist()}
    detail['bone_direction_diagnostics']=directions
report['limitations']=['No ground-truth 3D, global root trajectory, camera calibration, floor or contact inference.','H36M17 has no toes/heels/palms/fingers; feet/contact and wrist twist cannot be accepted.','Temporal continuity can produce the wrong facing smoothly; compare original rear-facing169..175 source images.','Head proxy, visibility confidence and 2D bilateral correction are explicit adapter assumptions.','No targetVRM retargeting or animation export in this experiment.']
(OUT/'diagnostics.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
manifest=json.loads((OUT/'restore-manifest.json').read_text());manifest['adapter_script_sha256']=hashlib.sha256((ROOT/'scripts/pose-reference/motionbert_turn.py').read_bytes()).hexdigest();manifest['analysis_script_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(OUT/'restore-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
for name,r in report['conditions'].items():
 print(name,json.dumps({k:r[k] for k in ['heading_net_deg','heading_max_abs_step_deg','median_leg_native','max_centered_step_leg_fraction']}))
 print('critical',json.dumps({k:{q:v[q] for q in ['heading_step_deg','max_centered_leg_fraction','left_wrist_centered_leg_fraction']} for k,v in r['boundaries'].items()}))
