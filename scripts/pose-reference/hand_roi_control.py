"""Six-frame controlled IMAGE-mode Hands probe; raw VIDEO results remain untouched."""
import argparse,json,hashlib
from pathlib import Path
import av,cv2,numpy as np
from PIL import Image,ImageDraw
import mediapipe as mp
from mediapipe.tasks.python import vision
from extract import points,overlay
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'analysis/dance-reference-v1';OUT=ROOT/'evidence/dance-video-pose-v1';WORK=LOCAL/'hand-roi-control';WORK.mkdir(exist_ok=True)
SAMPLES=[29,119,299,479,599,719]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def get_frame(container,index):
    stream=container.streams.video[0];container.seek(index*1001,stream=stream)
    for frame in container.decode(stream):
        if frame.pts==index*1001:return frame.to_ndarray(format='bgr24')
        if frame.pts>index*1001:break
    raise ValueError('Exact source PTS not found')
def pack(h):return [{'normalized':points(a),'world_meters_predicted':points(b),'handedness':[{'category_name':c.category_name,'score':c.score,'index':c.index} for c in cats]} for a,b,cats in zip(h.hand_landmarks,h.hand_world_landmarks,h.handedness)]
def prepare():
    sequence=json.loads((LOCAL/'results/sequence.json').read_text(encoding='utf-8'));rows=[];sheet=Image.new('RGB',(1152,6*384),'#101820');draw=ImageDraw.Draw(sheet)
    with av.open(str(LOCAL/'5359146-original.mp4')) as c:
        for row,index in enumerate(SAMPLES):
            bgr=get_frame(c,index);cv2.imwrite(str(WORK/f'source-{index:03d}.png'),bgr);source=sequence['frames'][index];rois=[]
            thumb=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB));thumb.thumbnail((640,360));sheet.paste(thumb,(0,row*384));draw.text((2,row*384+361),f'Original frame {index} / {source["source_seconds"]:.6f}s',fill='white')
            for side,point_index in [('left',15),('right',16)]:
                p=source['poses'][0]['normalized'][point_index];cx=p['x']*3840;cy=p['y']*2160;size=512;x=max(0,min(3840-size,round(cx-size/2)));y=max(0,min(2160-size,round(cy-size/2)));roi=bgr[y:y+size,x:x+size];file=WORK/f'roi-{index:03d}-{side}.png';cv2.imwrite(str(file),roi)
                thumb=Image.fromarray(cv2.cvtColor(roi,cv2.COLOR_BGR2RGB));thumb.thumbnail((256,256));col=640+(0 if side=='left' else 256);sheet.paste(thumb,(col,row*384));draw.text((col,row*384+258),f'{side} wrist ROI 512px',fill='white');draw.text((col,row*384+276),f'x={x}, y={y}',fill='white')
                rois.append({'pose_named_side':side,'source_pose_wrist_index':point_index,'source_pose_wrist_visibility':p['visibility'],'original_rect_xywh':[x,y,size,size],'native_file':str(file.relative_to(ROOT)),'native_sha256':sha(file),'native_to_source_scale_xy':[1,1],'source_pixel_mapping':'original_x = rect.x + roi_normalized_x * rect.width; same for y','is_mirrored':False})
            rows.append({'source_frame_index':index,'pts':source['pts'],'time_base':source['time_base'],'source_seconds':source['source_seconds'],'source_decoded_png':str((WORK/f'source-{index:03d}.png').relative_to(ROOT)),'raw_video_hand_count':len(source['hands']),'rois':rois})
    sheet.save(WORK/'pre-inference-inspection.jpg',quality=94)
    (OUT/'hand-roi-inputs.json').write_text(json.dumps({'samples':rows,'selection':'Six fixed frames across beginning/middle/end. Inspect originals/ROIs before running. One ROI per raw body wrist, no manual recentering to improve a result. Some hands may be occluded and must be rejected in review.','crop_side_native_pixels':512,'source_sha256':sha(LOCAL/'5359146-original.mp4')},indent=2),encoding='utf-8')
def infer():
    spec=json.loads((OUT/'hand-roi-inputs.json').read_text(encoding='utf-8'));rows=[];sheet=Image.new('RGB',(768,12*280),'#101820');draw=ImageDraw.Draw(sheet);tile=0
    model=ROOT/'analysis/mediapipe-reference/models/hand_landmarker.task';base=mp.tasks.BaseOptions(model_asset_path=str(model),delegate=mp.tasks.BaseOptions.Delegate.CPU)
    with vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=base,running_mode=vision.RunningMode.IMAGE,num_hands=2,min_hand_detection_confidence=.5,min_hand_presence_confidence=.5,min_tracking_confidence=.5)) as task:
        def detect(bgr):return pack(task.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB))))
        for row in spec['samples']:
            source=cv2.imread(str(ROOT/row['source_decoded_png']));full=cv2.resize(source,(1280,720),interpolation=cv2.INTER_AREA);full_hands=detect(full);result={'source_frame_index':row['source_frame_index'],'source_seconds':row['source_seconds'],'full_1280_image_hands':full_hands,'raw_video_hand_count_reference_only':row['raw_video_hand_count'],'rois':[]}
            for roi in row['rois']:
                native=cv2.imread(str(ROOT/roi['native_file']));low=cv2.resize(native,(171,171),interpolation=cv2.INTER_AREA);a=detect(native);b=detect(low);x,y,w,h=roi['original_rect_xywh']
                for hands in [a,b]:
                    for hand in hands:hand['mapped_original_pixels']=[{'x':x+p['x']*w,'y':y+p['y']*h} for p in hand['normalized']]
                result['rois'].append({'input':roi,'native_512_hands':a,'same_fov_low_171_hands':b,'same_fov_low_mapping':'171x171 represents exactly the same original 512x512 ROI; mapping uses the original rect, not integer 3x assumption','native_count':len(a),'low_count':len(b)})
                for col,(arr,label) in enumerate([(native,'native source ROI'),(overlay(native,{'poses':[],'hands':a},'native 512px'),f'native detect: {len(a)}'),(overlay(cv2.resize(low,(512,512)),{'poses':[],'hands':b},'same FOV 171px -> displayed 512px'),f'low pixel detect: {len(b)}')]):
                    image=Image.fromarray(cv2.cvtColor(arr,cv2.COLOR_BGR2RGB));image.thumbnail((256,256));sheet.paste(image,(col*256,tile*280));draw.text((col*256+2,tile*280+258),f'{row["source_frame_index"]} {roi["pose_named_side"]} | {label}',fill='white')
                tile+=1
            rows.append(result)
    summary={'mode':'IMAGE for every compared condition; existing VIDEO counts are context only, not a controlled baseline','model_sha256':sha(model),'mediapipe':mp.__version__,'thresholds_unchanged':.5,'comparisons':rows,'causal_scope':'Full image vs ROI changes framing/context and apparent hand scale. Native vs 171px same-FOV ROI isolates available pixel detail more closely. Detection count alone is not keypoint accuracy. No full-sequence ROI run is authorized by a mere count increase.'}
    (OUT/'hand-roi-results.raw.json').write_text(json.dumps(summary,indent=2),encoding='utf-8');sheet.save(WORK/'comparison.jpg',quality=94)
    print(json.dumps([{'frame':r['source_frame_index'],'full':len(r['full_1280_image_hands']),'roi':[(q['input']['pose_named_side'],q['native_count'],q['low_count']) for q in r['rois']]} for r in rows],indent=2))
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('stage',choices=['prepare','infer']);args=ap.parse_args();prepare() if args.stage=='prepare' else infer()
