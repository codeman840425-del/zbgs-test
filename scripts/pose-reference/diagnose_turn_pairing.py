"""Compare unchanged raw coordinates under two label assignments; do not repair motion."""
import gzip,json,hashlib
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/dance-video-pose-v1';snapshot=OUT/'sequence.raw.json.gz'
raw=gzip.decompress(snapshot.read_bytes());data=json.loads(raw);frames=data['frames']
PAIRS={'shoulders':[11,12],'hips':[23,24],'wrists':[15,16],'knees':[25,26],'ankles':[27,28]}
def points(frame,space):return np.array([[q[k] for k in (['x','y'] if space=='normalized' else ['x','y','z'])] for q in frame['poses'][0][space]])
def compare(a,b):
    result={}
    for space in ['normalized','world_meters_predicted']:
        x=points(a,space);y=points(b,space);group={}
        for name,(left,right) in PAIRS.items():
            original=y[[left,right]]-x[[left,right]];swapped=y[[right,left]]-x[[left,right]]
            group[name]={'original_left_right_distance':np.linalg.norm(original,axis=1).tolist(),'swapped_left_right_distance':np.linalg.norm(swapped,axis=1).tolist(),'original_rms_distance':float(np.sqrt(np.mean(np.sum(original**2,axis=1)))),'swapped_rms_distance':float(np.sqrt(np.mean(np.sum(swapped**2,axis=1)))),'swapped_delta_left_right':swapped.tolist()}
        result[space]=group
    return result
report={'raw_sequence_sha256':hashlib.sha256(raw).hexdigest(),'critical_frame_pair':[171,172],'critical_seconds':[frames[i]['source_seconds'] for i in [171,172]],'units':{'normalized':'Euclidean x/y fractions of original image width/height; axes have different pixel dimensions','world_meters_predicted':'Euclidean model predicted meters'},'mapping':'Only swap candidate frame B labels within shoulder/hip/wrist/knee/ankle pairs; leave coordinates unchanged. No correction applied to raw snapshot.','critical':compare(frames[171],frames[172]),'candidate_boundaries':[]}
for i in range(1,len(frames)):
    if not frames[i-1]['poses'] or not frames[i]['poses']:continue
    groups=compare(frames[i-1],frames[i])['normalized'];original=np.mean([v['original_rms_distance'] for v in groups.values()]);swapped=np.mean([v['swapped_rms_distance'] for v in groups.values()])
    if original>.04 and swapped<original*.5:report['candidate_boundaries'].append({'frames':[i-1,i],'source_seconds':[frames[i-1]['source_seconds'],frames[i]['source_seconds']],'original_xy_mean_group_rms':float(original),'swapped_xy_mean_group_rms':float(swapped),'review_window_frames':[max(0,i-3),min(len(frames)-1,i+3)],'classification':'Diagnostic candidate only; not ground-truth swap segment or authorized relabeling'})
report['candidate_rule']='Mean group RMS 2D original >0.04 and swapped < 0.5*original; 5 bilateral groups. Candidate windows are +/-3 frames around boundary, not a claimed correction interval.'
report['nose_z_before_after_m']=[frames[i]['poses'][0]['world_meters_predicted'][0]['z'] for i in [171,172]]
report['conclusion']='Swapping labels greatly reduces 2D jumps but leaves shoulder RMS 0.221m and wrist RMS 0.364m in predicted 3D. Nose z reverses sign and is unaffected by swapping bilateral labels. Thus label swap alone is insufficient; remaining depth/orientation discontinuity must be reviewed. Raw coordinates and confidence remain unchanged.'
(OUT/'critical-turn-pairing.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'critical':report['critical'],'candidates':report['candidate_boundaries']},indent=2))
