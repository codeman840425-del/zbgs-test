"""Report raw extraction quality without deleting or repairing uncertain frames."""
import gzip,hashlib,json,shutil
from collections import Counter
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'analysis/dance-reference-v1';OUT=ROOT/'evidence/dance-video-pose-v1'
raw=LOCAL/'results/sequence.json';data=json.loads(raw.read_text(encoding='utf-8'));frames=data['frames'];names=data['metadata']['pose_names']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
snapshot=OUT/'sequence.raw.json.gz';snapshot.write_bytes(gzip.compress(raw.read_bytes(),compresslevel=9,mtime=0))
if len(frames)!=720:raise ValueError('Expected 720 selected frames')
expected=json.loads((OUT/'source-frame-times.json').read_text(encoding='utf-8'));selected=[r for r in expected if r['selected']]
if any(f['source_frame_index']!=r['index'] or f['pts']!=r['pts'] or f['time_base']!=r['time_base'] for f,r in zip(frames,selected)):raise ValueError('Source PTS mismatch')
flags=[];visibility={name:0 for name in names};missing=[];duplicates=[]
important=[11,12,13,14,15,16,23,24,25,26,27,28]
for frame in frames:
    issues=[]
    if not frame['poses']:missing.append(frame['source_frame_index']);issues.append({'kind':'pose_missing'})
    else:
        points=frame['poses'][0]['normalized']
        if len(points)!=33:raise ValueError('Wrong landmark count')
        low=[]
        for i,p in enumerate(points):
            if p['visibility'] is not None and p['visibility']<.5:
                visibility[names[i]]+=1
                if i in important:low.append(names[i])
        if low:issues.append({'kind':'low_body_visibility_not_ground_truth_failure','joints':low})
    if len(frame['hands'])<2:issues.append({'kind':'fewer_than_two_detected_hands','detected':len(frame['hands'])})
    labels=[h['handedness'][0]['category_name'] for h in frame['hands'] if h['handedness']]
    if len(labels)!=len(set(labels)):duplicates.append(frame['source_frame_index']);issues.append({'kind':'duplicate_handedness_labels','labels':labels})
    for hand in frame['hands']:
        if len(hand['normalized'])!=21:raise ValueError('Wrong hand landmark count')
    if issues:flags.append({'source_frame_index':frame['source_frame_index'],'source_seconds':frame['source_seconds'],'issues':issues})
adjacent=[]
for a,b in zip(frames,frames[1:]):
    if a['poses'] and b['poses']:
        aw=np.array([[p[k] for k in ['x','y','z']] for p in a['poses'][0]['world_meters_predicted']]);bw=np.array([[p[k] for k in ['x','y','z']] for p in b['poses'][0]['world_meters_predicted']]);delta=np.linalg.norm(bw-aw,axis=1);i=int(delta.argmax());adjacent.append({'from_frame':a['source_frame_index'],'to_frame':b['source_frame_index'],'source_seconds':b['source_seconds'],'joint':names[i],'world_meters':float(delta[i])})
max_jump=max(adjacent,key=lambda r:r['world_meters']) if adjacent else None
segments={}
for name,a,b in [('left_thigh',23,25),('right_thigh',24,26),('left_shin',25,27),('right_shin',26,28),('left_upper_arm',11,13),('right_upper_arm',12,14),('left_forearm',13,15),('right_forearm',14,16)]:
    lengths=[]
    for frame in frames:
        if frame['poses']:
            w=frame['poses'][0]['world_meters_predicted'];lengths.append(float(np.linalg.norm([w[a][k]-w[b][k] for k in ['x','y','z']])))
    segments[name]={'min':min(lengths),'max':max(lengths),'median':float(np.median(lengths))} if lengths else None
summary={'raw_sequence_local_path':str(raw.relative_to(ROOT)),'raw_sequence_sha256':sha(raw),'raw_snapshot':{'path':str(snapshot.relative_to(ROOT)),'sha256':sha(snapshot),'bytes':snapshot.stat().st_size,'gzip_mtime':0,'content':'Exact unfiltered sequence.json bytes; includes raw pose/hand scores and original PTS. No filtered sequence exists in this stage.'},'source_manifest':'source.json','frames':len(frames),'source_pts_preserved_all_frames':True,'requested_interval_seconds':[0,30],'actual_first_last_source_seconds':[frames[0]['source_seconds'],frames[-1]['source_seconds']],'end_boundary_note':'Last selected source sample is 29.9882916667s, not 30s; do not stretch time. Next 9 original frames are retained but not inferred/context in this run.','pose_missing_frames':missing,'pose_detected_frames':len(frames)-len(missing),'hand_count_histogram':dict(Counter(len(f['hands']) for f in frames)),'duplicate_handedness_frames':duplicates,'body_visibility_lt_0_5_count':visibility,'max_adjacent_predicted_world_jump':max_jump,'predicted_segment_lengths_m':segments,'quality_flag_frames':len(flags),'identity_and_sides':'One visible source performer; raw model joint names and handedness retained. VIDEO has no exported track identity ID. No auto relabel/mirroring; short turns and crossing limbs require review.','limitations':['Quality flags are diagnostic, not verified pose-error truth.','Single-view world positions lack global root trajectory and reliable bone twist.','Hands per-joint scores remain null if API does not supply them; handedness is not point confidence.','No smoothing, gap fill, IK, fixed-bone retarget, editable animation or VRM acceptance in this detection stage.','Source video, image contact sheets and overlays remain ignored local analysis. Exact raw keypoints are backed up separately as gzip in evidence.']}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'quality-flags.json').write_text(json.dumps(flags,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(LOCAL/'results/run.json',OUT/'run.json')
manifest={str(p.relative_to(ROOT)):sha(p) for p in [ROOT/'scripts/pose-reference/extract.py',ROOT/'scripts/pose-reference/prepare_dance.py',ROOT/'scripts/pose-reference/summarize_dance.py',ROOT/'scripts/pose-reference/requirements.lock.txt',ROOT/'scripts/pose-reference/model-sources.json']}
(OUT/'tooling-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({k:summary[k] for k in ['frames','pose_detected_frames','hand_count_histogram','quality_flag_frames','max_adjacent_predicted_world_jump']},indent=2))
