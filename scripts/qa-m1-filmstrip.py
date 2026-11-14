"""Review aid only: sample the complete normal-speed recording, retaining time labels.
Not a replacement for watching the linked video or a claim of all-frame inspection.
"""
import argparse, json, pathlib, subprocess, tempfile
from PIL import Image, ImageDraw
import imageio_ffmpeg
p=argparse.ArgumentParser();p.add_argument('folder');p.add_argument('--fps',type=float,default=2);args=p.parse_args()
folder=pathlib.Path(args.folder);out=folder/'review';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='m1-review-') as temp:
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(folder/'same-camera-chain.webm'),'-vf',f'fps={args.fps}',str(pathlib.Path(temp)/'%05d.jpg')],check=True)
    frames=sorted(pathlib.Path(temp).glob('*.jpg'));sheets=[]
    for start in range(0,len(frames),20):
        canvas=Image.new('RGB',(1000,1280),'#eee');draw=ImageDraw.Draw(canvas)
        for j,f in enumerate(frames[start:start+20]):
            im=Image.open(f);crop=im.crop((400,200,850,890));crop.thumbnail((196,295))
            x=(j%5)*200;y=(j//5)*320;canvas.paste(crop,(x,y+20));draw.text((x+4,y+2),f'{(start+j)/args.fps:.2f}s',fill='black')
        name=f'chain-{start//20:02d}.jpg';canvas.save(out/name,quality=90);sheets.append(name)
    (out/'manifest.json').write_text(json.dumps({'samplingFps':args.fps,'frames':len(frames),'sheets':sheets,'limit':'Complete duration sampled, not all-frame visual acceptance'},indent=2),encoding='utf8')
print(out,len(sheets),'sheets')
