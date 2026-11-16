import argparse,json,subprocess,math
from pathlib import Path
from PIL import Image,ImageDraw
import imageio_ffmpeg
p=argparse.ArgumentParser();p.add_argument('evidence');a=p.parse_args();r=Path(a.evidence);out=r/'live-review';out.mkdir();rows=[]
for item in json.loads((r/'live-1/report.json').read_text())['cases']:
 name=item['body'];frames=out/name;frames.mkdir()
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-threads','2','-i',str(r/'live-1'/item['video']),'-vf','fps=2','-q:v','3','-threads','2',str(frames/'%03d.jpg')],check=True)
 files=sorted(frames.glob('*.jpg'));sheets=[]
 for page in range(math.ceil(len(files)/20)):
  batch=files[page*20:(page+1)*20];sheet=Image.new('RGB',(1600,math.ceil(len(batch)/4)*274),'#eee');d=ImageDraw.Draw(sheet)
  for j,f in enumerate(batch):
   x=j%4*400;y=j//4*274;im=Image.open(f).convert('RGB');sheet.paste(im.resize((400,250)),(x,y));d.text((x+6,y+253),f'{name} video t~{(page*20+j)/2:.1f}s',fill='black')
  fn=f'{name}-sheet-{page+1}.jpg';sheet.save(out/fn,quality=93);sheets.append(fn)
 rows.append({'body':name,'sheets':sheets,'frames':len(files),'sampleHz':2,'note':'Entire original video, including initial UI loading/setup; labels are decoded video time, not simulation time. Original continuous video remains authoritative.'})
(out/'report.json').write_text(json.dumps({'build':'fe5c528d9437','cases':rows},indent=2),encoding='utf-8');print(json.dumps(rows,indent=2))
