"""Make source/overlay 1x previews from original PTS and inspect temporal data."""
import json,hashlib
from pathlib import Path
from fractions import Fraction
import av, cv2, numpy as np
from PIL import Image,ImageDraw
from extract import overlay,dump,POSE_NAMES
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'evidence/real-video-pose-v1'
data=json.loads((OUT/'results/sequence.json').read_text(encoding='utf-8'));rows=data['frames'];by_index={r['source_frame_index']:r for r in rows}
source=OUT/'dvids-squat-original.mp4'
times=np.array([r['source_seconds'] for r in rows]);world=np.array([[[p[k] for k in ['x','y','z']] for p in r['poses'][0]['world_meters_predicted']] for r in rows]);norm=np.array([[[p[k] for k in ['x','y','z']] for p in r['poses'][0]['normalized']] for r in rows]);vis=np.array([[p['visibility'] for p in r['poses'][0]['normalized']] for r in rows])
summary={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sequence_sha256':hashlib.sha256((OUT/'results/sequence.json').read_bytes()).hexdigest(),'frames':len(rows),'source_frame_range':[rows[0]['source_frame_index'],rows[-1]['source_frame_index']],'source_seconds_first_last':[times[0],times[-1]],'source_pts_first_last':[rows[0]['pts'],rows[-1]['pts']],'time_base':rows[0]['time_base'],'delta_seconds_min_max':[float(np.diff(times).min()),float(np.diff(times).max())],'pose_detected_frames':sum(bool(r['poses']) for r in rows),'hands_count_histogram':{str(n):sum(len(r['hands'])==n for r in rows) for n in [0,1,2]},'normalized_xy_max_single_frame_displacement':float(np.linalg.norm(np.diff(norm[:,:,:2],axis=0),axis=2).max()),'predicted_world_max_single_frame_displacement_m':float(np.linalg.norm(np.diff(world,axis=0),axis=2).max()),'joint_visibility_lt_0_5_frames':{name:int((vis[:,i]<.5).sum()) for i,name in enumerate(POSE_NAMES)},'cautions':['VIDEO official tracking used; tracking IDs/quality not returned and no ground truth identity validation','No smoothing, interpolation, IK, foot locking, bone rotations or skin binding applied','Single view predicted world pelvis is centered per frame, so it does not preserve global root displacement','No audio in previews; no spatial crop; original per-frame timing retained']}
with av.open(str(source)) as original:
    stream=original.streams.video[0];rate=stream.average_rate;timebase=stream.time_base
    outputs=[av.open(str(OUT/name),'w') for name in ['source-clip-1x.mp4','overlay-clip-1x.mp4']]
    encoders=[]
    for c in outputs:
        e=c.add_stream('libx264',rate=rate);e.width=stream.width;e.height=stream.height;e.pix_fmt='yuv420p';e.time_base=timebase;e.options={'crf':'20','preset':'fast','threads':'2'};encoders.append(e)
    contact=Image.new('RGB',(1280,8*200));draw=ImageDraw.Draw(contact);i=0
    for index,frame in enumerate(original.decode(stream)):
        if index>rows[-1]['source_frame_index']:break
        if index not in by_index:continue
        row=by_index[index];bgr=frame.to_ndarray(format='bgr24');marked=overlay(bgr,row,f'Original PTS {row["source_seconds"]:.3f}s | 1x | pose predicted')
        for arr,c,e in zip([bgr,marked],outputs,encoders):
            outframe=av.VideoFrame.from_ndarray(arr,format='bgr24');outframe.pts=frame.pts-rows[0]['pts'];outframe.time_base=frame.time_base
            for packet in e.encode(outframe):c.mux(packet)
        if i%8==0:
            image=Image.fromarray(cv2.cvtColor(marked,cv2.COLOR_BGR2RGB));image.thumbnail((320,180));tile=i//8;x=(tile%4)*320;y=(tile//4)*200;contact.paste(image,(x,y));draw.text((x,y+180),f'{row["source_seconds"]:.3f}s',fill='white')
        i+=1
    for c,e in zip(outputs,encoders):
        for packet in e.encode():c.mux(packet)
        c.close()
    contact.save(OUT/'results/continuous-contact.jpg')
delta=np.linalg.norm(np.diff(world,axis=0),axis=2);ix=np.unravel_index(delta.argmax(),delta.shape)
summary['max_world_step_detail']={'joint':POSE_NAMES[ix[1]],'from_source_seconds':rows[ix[0]]['source_seconds'],'to_source_seconds':rows[ix[0]+1]['source_seconds'],'meters':float(delta[ix])}
summary['segment_length_m_min_max']={name:[float(np.linalg.norm(world[:,a]-world[:,b],axis=1).min()),float(np.linalg.norm(world[:,a]-world[:,b],axis=1).max())] for name,a,b in [('left_upper_arm',11,13),('right_upper_arm',12,14),('left_forearm',13,15),('right_forearm',14,16),('left_thigh',23,25),('right_thigh',24,26),('left_shin',25,27),('right_shin',26,28)]}
summary['previews']={}
for name in ['source-clip-1x.mp4','overlay-clip-1x.mp4']:
    with av.open(str(OUT/name)) as c:pts=[float(f.pts*f.time_base) for f in c.decode(video=0)]
    expected=times-times[0];summary['previews'][name]={'frames':len(pts),'max_pts_error_seconds':float(np.max(np.abs(np.array(pts)-expected))),'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest()}
dump(OUT/'temporal-summary.json',summary)
print(json.dumps({k:v for k,v in summary.items() if k!='joint_visibility_lt_0_5_frames'},indent=2))
