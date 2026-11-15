"""Small official Tasks experiment. Does not infer bone rotations or fill missing joints."""
import argparse, hashlib, json, platform, time
from pathlib import Path
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision

HERE = Path(__file__).resolve().parents[2] / 'analysis/mediapipe-reference'
POSE_NAMES = 'nose left_eye_inner left_eye left_eye_outer right_eye_inner right_eye right_eye_outer left_ear right_ear mouth_left mouth_right left_shoulder right_shoulder left_elbow right_elbow left_wrist right_wrist left_pinky right_pinky left_index right_index left_thumb right_thumb left_hip right_hip left_knee right_knee left_ankle right_ankle left_heel right_heel left_foot_index right_foot_index'.split()
POSE_EDGES = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,29),(29,31),(28,30),(30,32),(15,17),(15,19),(15,21),(16,18),(16,20),(16,22),(0,9),(0,10)]
HAND_EDGES = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),(13,17),(0,17),(17,18),(18,19),(19,20)]

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p, data): Path(p).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')
def points(items):
    return [{k:getattr(p,k,None) for k in ['x','y','z','visibility','presence']} for p in items]
def result(p, h):
    return {'poses':[{'normalized':points(a),'world_meters_predicted':points(b)} for a,b in zip(p.pose_landmarks,p.pose_world_landmarks)],
            'hands':[{'normalized':points(a),'world_meters_predicted':points(b),'handedness':[{'category_name':c.category_name,'score':c.score,'index':c.index} for c in cats]} for a,b,cats in zip(h.hand_landmarks,h.hand_world_landmarks,h.handedness)]}
def overlay(bgr, data, title):
    out=bgr.copy(); height,width=out.shape[:2]
    for category,edges,col in [('poses',POSE_EDGES,(30,210,40)),('hands',HAND_EDGES,(0,170,255))]:
        for item in data[category]:
            pts=item['normalized']
            def pixel(p):return (round(p['x']*width),round(p['y']*height))
            for a,b in edges:
                if category=='poses' and min(pts[a]['visibility'] or 0,pts[b]['visibility'] or 0)<.5:continue
                cv2.line(out,pixel(pts[a]),pixel(pts[b]),col,2)
            for i,p in enumerate(pts):
                if 0<=p['x']<=1 and 0<=p['y']<=1:
                    color=col if category=='hands' or (p['visibility'] or 0)>=.5 else (100,100,220)
                    cv2.circle(out,pixel(p),3,color,-1)
                    cv2.putText(out,str(i),pixel(p),cv2.FONT_HERSHEY_SIMPLEX,.32,color,1)
    cv2.rectangle(out,(0,0),(width,48),(20,20,20),-1)
    cv2.putText(out,title,(10,20),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1)
    cv2.putText(out,'Green: pose; orange: hand; red: low visibility (not ground truth)',(10,40),cv2.FONT_HERSHEY_SIMPLEX,.43,(255,255,255),1)
    return out
def main():
    ap=argparse.ArgumentParser();ap.add_argument('inputs',nargs='+');ap.add_argument('--out',required=True);ap.add_argument('--video',action='store_true');ap.add_argument('--start',type=float,default=0);ap.add_argument('--end',type=float,default=10);args=ap.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    mode=vision.RunningMode.VIDEO if args.video else vision.RunningMode.IMAGE
    base=lambda name: mp.tasks.BaseOptions(model_asset_path=str(HERE/'models'/name),delegate=mp.tasks.BaseOptions.Delegate.CPU)
    metadata={'mediapipe':mp.__version__,'python':platform.python_version(),'delegate':'CPU','mode':mode.name,'models':{p.name:sha(p) for p in (HERE/'models').glob('*.task')},'thresholds':{'detection':.5,'presence':.5,'tracking':.5},'pose_names':POSE_NAMES,'semantics':{'normalized':'x/y relative image width/height; z is predicted relative depth, not metric image depth','world':'model-predicted meters, pose hip-centered and hand hand-centered; no calibrated camera/global trajectory','pose_visibility':'raw returned likelihood visible, not a measured position accuracy','pose_presence':'raw returned landmark presence','hand_visibility_presence':'null means API does not supply per-joint confidence; handedness score is classification, not keypoint confidence','tracking':'VIDEO mode uses official tracking; no identity guarantee or independent accuracy validation'},'inputs':[]}
    started=time.perf_counter()
    with vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=base('pose_landmarker_full.task'),running_mode=mode,num_poses=1)) as pose, vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=base('hand_landmarker.task'),running_mode=mode,num_hands=2)) as hands:
        for filename in args.inputs:
            source=Path(filename);info={'path':str(source),'sha256':sha(source)};metadata['inputs'].append(info)
            if not args.video:
                bgr=cv2.imread(str(source));rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB);img=mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb)
                data=result(pose.detect(img),hands.detect(img));data['input']=info;data['size_wh']=[bgr.shape[1],bgr.shape[0]]
                dump(out/(source.stem+'.json'),data);cv2.imwrite(str(out/(source.stem+'-overlay.jpg')),overlay(bgr,data,f'{source.name}: {len(data["poses"])} pose, {len(data["hands"])} hands'))
                print(source.name,len(data['poses']),'pose',len(data['hands']),'hands',flush=True)
            else:
                import av
                frames=[];last_ts=-1;first_t=None
                with av.open(str(source)) as container:
                    stream=container.streams.video[0];info.update({'time_base':str(stream.time_base),'average_rate':str(stream.average_rate),'requested_interval_seconds':[args.start,args.end],'spatial_crop':None,'rescale':None})
                    for source_index,frame in enumerate(container.decode(stream)):
                        if frame.pts is None:raise ValueError('Missing PTS: refusing guessed frame timing')
                        t=float(frame.pts*frame.time_base)
                        if t<args.start:continue
                        if t>=args.end:break
                        if first_t is None:first_t=t
                        ts=round(t*1000)
                        if ts<=last_ts:raise ValueError('PTS quantization not strictly increasing: refusing retime')
                        last_ts=ts;bgr=frame.to_ndarray(format='bgr24');rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB);img=mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb)
                        data=result(pose.detect_for_video(img,ts),hands.detect_for_video(img,ts))
                        data.update({'source_frame_index':source_index,'pts':frame.pts,'time_base':str(frame.time_base),'source_seconds':t,'clip_seconds':t-first_t,'mediapipe_timestamp_ms':ts})
                        frames.append(data)
                        if len(frames)==1 or len(frames)%30==0:cv2.imwrite(str(out/f'frame-{source_index:05d}.jpg'),overlay(bgr,data,f'Original PTS {t:.3f}s; clip {t-first_t:.3f}s'))
                    info['actual_first_source_seconds']=first_t
                dump(out/'sequence.json',{'metadata':metadata,'frames':frames})
                print('frames',len(frames),'pose detected',sum(bool(x['poses']) for x in frames),flush=True)
    metadata['elapsed_seconds']=time.perf_counter()-started;dump(out/'run.json',metadata)
if __name__=='__main__':main()
