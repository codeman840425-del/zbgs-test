"""Small offline skeleton comparison; source imagery is not copied into evidence."""
import argparse,json,hashlib,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/dance-video-pose-v1/motionbert-turn-v1'
inp=json.loads((OUT/'inputs.json').read_text());pred=json.loads((OUT/'predictions.raw.json').read_text());diag=json.loads((OUT/'diagnostics.json').read_text())
conditions={'mediapipe_raw':np.array(inp['raw_mediapipe_predicted_world_meters_mapped17'])}|{k:np.array(v) for k,v in pred['outputs'].items()}
samples=[146,147,153,171,172,173,174,201]
edges=[(0,1),(1,2),(2,3),(0,4),(4,5),(5,6),(0,7),(7,8),(8,9),(9,10),(8,11),(11,12),(12,13),(8,14),(14,15),(15,16)]
im=Image.new('RGB',(1500,len(samples)*300+50),'#111923');d=ImageDraw.Draw(im);d.font=ImageFont.load_default(size=14)
for col,(name,p) in enumerate(conditions.items()):
 d.text((col*500+8,8),name+' / XY front | ZY side',fill='white')
 scale=diag['conditions'][name]['median_leg_native']
 for row,frame in enumerate(samples):
  k=frame-138;pts=(p[k]-p[k,0])/scale
  y=row*300+50
  d.line([(col*500,y),(col*500+500,y)],fill='#45505b')
  d.text((col*500+8,y+5),f'frame {frame}  heading {diag["conditions"][name]["heading_deg"][k]:.1f} deg',fill='white')
  for view,horizontal in enumerate([0,2]):
   xy=[(col*500+125+view*250+q[horizontal]*108,y+120+q[1]*108) for q in pts]
   for a,b in edges:
    color='#5dd2ff' if b in [4,5,6,11,12,13] else '#ffae66' if b in [1,2,3,14,15,16] else '#e2e5ed'
    d.line([xy[a],xy[b]],fill=color,width=3)
   for j,(x,z) in enumerate(xy):d.ellipse((x-3,z-3,x+3,z+3),fill='white')
   d.text((col*500+25+view*250,y+277),'hip centered / median leg=1',fill='#b6bec9')
im.save(OUT/'skeleton-comparison.png')
print(OUT/'skeleton-comparison.png')

ap=argparse.ArgumentParser();ap.add_argument('--video',action='store_true');args=ap.parse_args()
if args.video:
 import imageio_ffmpeg
 movie=OUT/'three-condition-skeleton-1x.mp4'
 cmd=[imageio_ffmpeg.get_ffmpeg_exe(),'-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1500x600','-framerate','24000/1001','-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-video_track_timescale','24000',str(movie)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for k in range(73):
  pic=Image.new('RGB',(1500,600),'#111923');d=ImageDraw.Draw(pic);d.font=ImageFont.load_default(size=15)
  d.text((10,10),f'Source frame {138+k} / {inp["frames"][k]["source_seconds"]:.6f}s | 1x original 24000/1001 fps | Left cyan, right orange',fill='white')
  d.text((10,30),'Three unfiltered predictions, fixed camera axes. Hip-centered and median-leg normalized for diagnostics, NOT world motion or target animation.',fill='#bec6cf')
  for col,(name,p) in enumerate(conditions.items()):
   r=diag['conditions'][name];pts=(p[k]-p[k,0])/r['median_leg_native']
   d.text((col*500+10,65),name,fill='white');d.text((col*500+10,88),f'heading {r["heading_deg"][k]:.1f} deg',fill='white')
   for view,horizontal in enumerate([0,2]):
    xy=[(col*500+125+view*250+q[horizontal]*180,300+q[1]*180) for q in pts]
    d.text((col*500+25+view*250,115),'XY front' if view==0 else 'ZY side',fill='white')
    for a,b in edges:
     color='#5dd2ff' if b in [4,5,6,11,12,13] else '#ffae66' if b in [1,2,3,14,15,16] else '#e2e5ed'
     d.line([xy[a],xy[b]],fill=color,width=4)
    for j,(x,z) in enumerate(xy):d.ellipse((x-4,z-4,x+4,z+4),fill='white')
   d.line([(col*500,50),(col*500,600)],fill='#45505b')
  proc.stdin.write(pic.tobytes())
 proc.stdin.close();code=proc.wait();assert code==0
 timing={'file':movie.name,'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'fps':'24000/1001','frames':73,'source_start_frame':138,'source_end_frame':210,'time_policy':'Encoded PTS k*1001 at time_base1/24000 maps to original PTS(138+k)*1001. Last sample3.003s; container display duration includes last frame period,3.0447083333s. No speed change/interpolation.', 'mapping':[{'source_frame_index':f['source_frame_index'],'source_pts':f['pts'],'source_time_base':f['time_base'],'movie_expected_pts':k*1001,'movie_time_base':'1/24000'} for k,f in enumerate(inp['frames'])],'decoded_validation':'pending'}
 (OUT/'movie-timing.json').write_text(json.dumps(timing,indent=2),encoding='utf-8')
 print(movie)
