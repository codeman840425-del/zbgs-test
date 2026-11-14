"""Sequential ffmpeg QA crops; no random seeking, browser, or invented frames."""
import argparse,json,math,pathlib,subprocess,tempfile
import numpy as np
from PIL import Image,ImageDraw
import imageio_ffmpeg
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('--start',type=float,required=True);p.add_argument('--end',type=float,required=True);p.add_argument('--fps',type=int,default=12);p.add_argument('--output',required=True);a=p.parse_args()
video=pathlib.Path(a.video);out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='m1c-detail-')as temp:
    command=[imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-threads','1','-i',str(video),'-vf',f"fps={a.fps},select='between(t,{a.start},{a.end})'",'-fps_mode','passthrough',str(pathlib.Path(temp)/'%05d.png')]
    subprocess.run(command,check=True)
    files=sorted(pathlib.Path(temp).glob('*.png'));rows=[];sheets=[]
    for i,file in enumerate(files):
        time=math.ceil(a.start*a.fps)/a.fps+i/a.fps;im=Image.open(file).convert('RGB');rgb=np.asarray(im);mask=(rgb[:,:,0]<80)&(rgb[:,:,1]>90)&(rgb[:,:,2]>90)
        ys,xs=np.where(mask);assert len(xs)>5,'Cannot locate distinctive cyan hair for diagnostic crop'
        cx=int(np.median(xs));cy=int(np.percentile(ys,5));box=(max(0,cx-140),max(0,cy-85),min(im.width,cx+140),min(im.height,cy+235))
        crop=im.crop(box);crop.thumbnail((360,400));rows.append({'time':time,'box':box,'fullFrame':f'frame-{i:04d}.png'})
        # Retain full pixels for every dense sample, so crops never replace evidence.
        im.save(out/f'frame-{i:04d}.png')
        if i%12==0:sheet=Image.new('RGB',(1440,1320),'#eee');draw=ImageDraw.Draw(sheet)
        x=i%4*360;y=(i%12)//4*440;sheet.paste(crop,(x+(360-crop.width)//2,y+34));draw.text((x+5,y+3),f'{time:.3f}s | crop, same room camera',fill='black')
        if i%12==11 or i==len(files)-1:
            name=f'sheet-{i//12:03d}.jpg';sheet.save(out/name,quality=93);sheets.append(name)
    (out/'manifest.json').write_text(json.dumps({'video':str(video),'command':command,'samplingFPS':a.fps,'start':a.start,'end':a.end,'samples':rows,'sheets':sheets,'limit':'Sequential full decode then sampled original-pixel crop. Not normal-speed watching, not all frames, no interpolation. Nominal timestamps quantized to sample rate.'},indent=2),encoding='utf8')
    print(json.dumps({'out':str(out),'frames':len(files),'sheets':len(sheets)}))
