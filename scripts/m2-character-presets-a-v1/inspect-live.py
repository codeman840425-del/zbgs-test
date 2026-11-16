import json,subprocess,argparse
from pathlib import Path
from PIL import Image,ImageDraw
import imageio_ffmpeg
ap=argparse.ArgumentParser();ap.add_argument('evidence');args=ap.parse_args();root=Path(args.evidence);out=root/'live-review';out.mkdir(exist_ok=False)
r=json.loads((root/'live-3/report.json').read_text(encoding='utf-8'));results=[]
for row in r['cases']:
 name=row['id'];frames=out/name;frames.mkdir()
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-threads','2','-sseof','-18','-i',str(root/'live-3'/row['video']),'-vf','fps=2','-frames:v','36','-threads','2',str(frames/'%03d.png')],check=True)
 files=sorted(frames.glob('*.png'));sheet=Image.new('RGB',(1800,1944),'#eee');d=ImageDraw.Draw(sheet)
 for i,p in enumerate(files):
  image=Image.open(p).convert('RGB');x=i%6*300;y=i//6*324;sheet.paste(image.crop((350,230,900,780)).resize((300,300)),(x,y));d.text((x+5,y+303),f'{name} tail18 sample {i+1:02d}',fill='black')
 sheet.save(out/(name+'-expression-sheet.jpg'),quality=94)
 # Last3s includes the wave; keep full frames to avoid cropping away hands.
 wave=Image.new('RGB',(1600,1024),'#eee');wd=ImageDraw.Draw(wave)
 for j,i in enumerate([max(0,len(files)-6),max(0,len(files)-2)]):
  im=Image.open(files[i]).convert('RGB').resize((800,500));wave.paste(im,(j*800,24));wd.text((j*800+8,5),f'{name} wave full-frame sample {i+1}',fill='black')
 wave.save(out/(name+'-wave-full.jpg'),quality=94)
 results.append({'id':name,'expression':name+'-expression-sheet.jpg','wave':name+'-wave-full.jpg','fullFrames':name,'sampling':'last18 seconds at2fps; entire recorded live interval about17.45s, with small setup margin; crop is diagnostic only'})
(out/'report.json').write_text(json.dumps({'build':r['build'],'scope':'Sampled engineering inspection, not continuous perceptual acceptance','cases':results},indent=2),encoding='utf-8')
print('six expression sheets and six full-frame wave pairs ready')
