import json,subprocess,tempfile
from pathlib import Path
from PIL import Image,ImageDraw
import imageio_ffmpeg
p=Path('evidence/visible-face-trial-205b-v1');out=p/'live-review';out.mkdir(exist_ok=False)
r=json.loads((p/'report.json').read_text(encoding='utf-8'));records=[]
for m in r['movies']:
 with tempfile.TemporaryDirectory() as tmp:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-threads','2','-sseof','-13','-i',str(p/m['file']),'-vf','fps=2,crop=700:700:260:200,scale=420:420','-threads','2',str(Path(tmp)/'%03d.png')],check=True)
  frames=sorted(Path(tmp).glob('*.png'))
  for start in range(0,len(frames),9):
   sheet=Image.new('RGB',(1260,1350),'#eee');d=ImageDraw.Draw(sheet)
   for j,f in enumerate(frames[start:start+9]):
    x=j%3*420;y=j//3*450;d.text((x+5,y+5),f"{m['body']} last13s sample {(start+j)*.5:.1f}s",fill='black');sheet.paste(Image.open(f),(x,y+28))
   name=f"{m['body']}-{start//9}.jpg";sheet.save(out/name,quality=92);records.append(name)
(out/'review.json').write_text(json.dumps({'build':r['build'],'scope':'Last 13 seconds, 2fps crop of actual native 1x video, engineering sampled review not continuous human acceptance','files':records},indent=2),encoding='utf-8')
print(records)
