"""Decode source-only lower-body contact sheets; no automatic contact truth labels."""
import gzip,hashlib,json
from pathlib import Path
import av,cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'analysis/dance-reference-v1/support-138-210';LOCAL.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'assets-source/video-dance-twist-study-v1';OUT.mkdir(parents=True,exist_ok=True)
raw=json.loads(gzip.decompress((ROOT/'evidence/dance-video-pose-v1/sequence.raw.json.gz').read_bytes()))
fr=raw['frames'][138:211];pts=np.array([[[p['x']*3840,p['y']*2160] for p in f['poses'][0]['normalized'][23:33]] for f in fr])
x0=max(0,int(pts[:,:,0].min()-120));x1=min(3840,int(pts[:,:,0].max()+120));y0=max(0,int(pts[:,:,1].min()-80));y1=min(2160,int(pts[:,:,1].max()+100))
images={};source=ROOT/'analysis/dance-reference-v1/5359146-original.mp4'
with av.open(str(source)) as c:
 st=c.streams.video[0];c.seek(138*1001,stream=st)
 for f in c.decode(st):
  i=f.pts//1001
  if i<138:continue
  if i>210:break
  assert f.pts==i*1001
  b=f.to_ndarray(format='bgr24');images[i]=Image.fromarray(cv2.cvtColor(b[y0:y1,x0:x1],cv2.COLOR_BGR2RGB))
assert len(images)==73
files=[]
for sheet in range(3):
 chosen=list(range(138,211))[sheet*25:(sheet+1)*25];canvas=Image.new('RGB',(1800,1920),'#111923');d=ImageDraw.Draw(canvas);d.font=ImageFont.load_default(size=16)
 for k,i in enumerate(chosen):
  im=images[i].copy();im.thumbnail((360,360));x=k%5*360;y=k//5*384;canvas.paste(im,(x,y));d.text((x+3,y+361),f'{i} / {i*1001/24000:.6f}s',fill='white')
 p=LOCAL/f'lower-body-{sheet}.jpg';canvas.save(p,quality=95);files.append({'path':str(p.relative_to(ROOT)),'frames':chosen,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
for i in [138,146,147,153,171,172,180,190,201,207,208,210]:images[i].save(LOCAL/f'crop-{i}.png')
(OUT/'support-source-review-inputs.json').write_text(json.dumps({'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_frame_range':[138,210],'count':73,'source_pts':'frame_index*1001','time_base':'1/24000','fixed_crop_xyxy':[x0,y0,x1,y1],'crop_policy':'Bounding union of raw body lower-half points across all73frames plus margins. Same crop every frame; no frame-dependent repositioning. Semantic side jumps do not change the bounding union.','files':files,'annotations':'Manual visual observations will be separate. These images alone do not measure ground force or physical contact.'},indent=2),encoding='utf-8')
print(json.dumps({'crop':[x0,y0,x1,y1],'files':[x['path'] for x in files]},indent=2))
