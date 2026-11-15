"""Fit fixed time offsets from recorded events, without retiming or video editing."""
import gzip, hashlib, json
from pathlib import Path
import av
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'evidence/real-video-pose-v1'
RECORD=ROOT/'evidence/video-motion-room-5d848494cce5'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
result={'schema':'event-time-alignment-v1','build':'5d848494cce5','selected_source_manifest':'dvids-squat-source.json','scope':'Pipeline v1 only; wrist/palm, foot spacing/contact and naturalness not accepted','method':{'equation':'media_seconds = common_action_seconds + offset_seconds','fit':'median(record_t_ms / 1000 - motion.dance.time), slope fixed at 1; no time scaling','selection':{'mode':'dance','dance_id':'video-squat-dvids-v1','minimum_dance_mix':.999,'action_seconds_interval_inclusive':[1,7]},'record_clock_origin':'q.start = performance.now() immediately before MediaRecorder.start; trace t = RAF timestamp - q.start','clock_source_script':'scripts/qa-video-motion-room.cjs','record_clock_source_sha256':sha(ROOT/'scripts/qa-video-motion-room.cjs'),'start_pts_policy':'MediaRecorder first decoded frame PTS is 0; trace epoch to first captured frame was not separately instrumented. Assume common start for event alignment, with about one encoded-frame start uncertainty.','not_calibration':True},'source':{'id':'source','media':'source-clip-1x.mp4','offset_seconds':0,'sha256':sha(OUT/'source-clip-1x.mp4')},'overlay':{'id':'overlay','media':'overlay-clip-1x.mp4','offset_seconds':0,'sha256':sha(OUT/'overlay-clip-1x.mp4')},'recordings':[],'browser_sync':{'playback_rate':1,'seek_correction_threshold_seconds':.08,'meaning':'Browser auxiliary comparison, not frame-accurate synchronized capture. All original media are retained.'}}
durations=[]
for body in ['female','male']:
    trace=RECORD/(body+'.trace.json.gz');video=RECORD/(body+'.webm');data=json.loads(gzip.decompress(trace.read_bytes()))
    selected=[r for r in data['frames'] if r['mode']=='dance' and r['motion']['dance']['id']=='video-squat-dvids-v1' and r['motion']['danceMix']>=.999 and 1<=r['motion']['dance']['time']<=7]
    if len(selected)<100:raise ValueError('Insufficient fully blended middle samples: '+body)
    x=np.array([r['motion']['dance']['time'] for r in selected]);y=np.array([r['t']/1000 for r in selected]);offset=float(np.median(y-x));residual=y-x-offset
    slope,intercept=np.polyfit(x,y,1)
    duration=float(selected[0]['motion']['dance']['duration']);durations.append(duration)
    with av.open(str(video)) as container:
        stream=container.streams.video[0];pts=np.array([float(f.pts*f.time_base) for f in container.decode(stream)])
    delta=np.diff(pts);middle_delta=delta[(pts[:-1]>=offset+1)&(pts[1:]<=offset+7)]
    worst=int(delta.argmax())
    result['recordings'].append({'id':body,'media':'../video-motion-room-5d848494cce5/'+body+'.webm','trace':'../video-motion-room-5d848494cce5/'+body+'.trace.json.gz','media_sha256':sha(video),'trace_sha256':sha(trace),'offset_seconds':offset,'fit_samples':len(selected),'fit_action_seconds_first_last':[float(x[0]),float(x[-1])],'fit_record_seconds_first_last':[float(y[0]),float(y[-1])],'minimum_selected_mix':min(r['motion']['danceMix'] for r in selected),'fixed_slope_residual_seconds':{'median':float(np.median(residual)),'absolute_p95':float(np.percentile(np.abs(residual),95)),'absolute_max':float(np.abs(residual).max()),'rmse':float(np.sqrt(np.mean(residual**2)))},'diagnostic_free_slope_not_applied':{'slope':float(slope),'intercept':float(intercept)},'media_timing':{'decoded_frames':len(pts),'first_pts_seconds':float(pts[0]),'last_pts_seconds':float(pts[-1]),'median_interval_seconds':float(np.median(delta)),'maximum_interval_seconds':float(delta.max()),'largest_interval_pts_seconds':[float(pts[worst]),float(pts[worst+1])],'middle_maximum_interval_seconds':float(middle_delta.max()),'start_origin_uncertainty_nominal_seconds':float(np.median(delta)),'uncertainty_is_estimate_not_proven_bound':True},'blend_boundary':'Offsets fitted only after mix>=0.999. Early common time still includes runtime blend-in; aligned timestamps do not make that pose equal to unblended source.'})
result['common_action_seconds_interval']=[0,min(durations)]
result['precision_limits']=['Fit residual measures trace clock relation only, not image matching or pose quality.','First PTS/record-start relation is not calibrated; about one actual encoded-frame interval is an estimate, not a strict upper bound.','Variable captured-frame gaps and source 1001/30000s sampling limit visible pose matching independently of fit residual.','Browser seeks and scheduling introduce separate timing error; UI displays offset-corrected drift and uses position correction at fixed 1x.']
(OUT/'alignment.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'interval':result['common_action_seconds_interval'],'fits':[{k:r[k] for k in ['id','offset_seconds','fit_samples','fixed_slope_residual_seconds']} for r in result['recordings']]},indent=2))
