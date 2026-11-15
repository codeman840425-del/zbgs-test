"""Full-duration room-view review aid; not a substitute for the normal-speed film."""
import argparse,json,pathlib,subprocess,tempfile
from PIL import Image,ImageDraw
import imageio_ffmpeg
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('--fps',type=float,default=2);p.add_argument('--output');args=p.parse_args()
video=pathlib.Path(args.video);out=pathlib.Path(args.output)if args.output else video.parent/(video.stem+'-review');out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='room-frames-')as tmp:
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(video),'-vf',f'fps={args.fps}',str(pathlib.Path(tmp)/'%06d.jpg')],check=True)
 frames=sorted(pathlib.Path(tmp).glob('*.jpg'));sheets=[]
 for start in range(0,len(frames),12):
  canvas=Image.new('RGB',(1440,1140),'#eee');draw=ImageDraw.Draw(canvas)
  for j,file in enumerate(frames[start:start+12]):
   im=Image.open(file);im.thumbnail((478,350));x=(j%3)*480;y=(j//3)*285
   # Fit complete captured image, never crop away a limb or garment.
   im.thumbnail((478,260));canvas.paste(im,(x,y+23));draw.text((x+4,y+3),f'{(start+j)/args.fps:.2f}s',fill='black')
  name=f'{start//12:03d}.jpg';canvas.save(out/name,quality=91);sheets.append(name)
 (out/'manifest.json').write_text(json.dumps({'video':str(video),'samplingFPS':args.fps,'frames':len(frames),'sheets':sheets,'limit':'Complete duration sampled; not all-frame or normal-speed visual acceptance'},indent=2))
 print(json.dumps({'folder':str(out),'frames':len(frames),'sheets':len(sheets)}))
