from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
import json,hashlib,html
p=Path(__file__).resolve().parent
old=p/'poses-460';new=p/'poses-0fb';out=p/'review-0fb';out.mkdir(exist_ok=True)
rows=[]
for f in sorted(old.glob('*.png')):
 a=Image.open(f).convert('RGB');b=Image.open(new/f.name).convert('RGB');d=ImageChops.difference(a,b);h=d.histogram();mask=d.convert('L').point(lambda x:255 if x else 0)
 # Exact changed-pixel count must not use grayscale conversion (1-channel deltas may round to0).
 channels=d.split();binary=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]).point(lambda x:255 if x else 0)
 row={'file':f.name,'exact':d.getbbox() is None,'bbox':d.getbbox(),'changedPixels':binary.histogram()[255],'changedChannels':sum(v for i,v in enumerate(h) if i%256),'maxChannelDelta':max(i%256 for i,v in enumerate(h) if v),'size':a.size};rows.append(row)
 if row['changedPixels']:d.point(lambda x:min(255,x*8)).save(out/(f.stem+'-diff-x8.png'))
(p/'pixel-comparison-0fb.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
for sex in ['female','male']:
 files=[r['file'] for r in rows if r['file'].startswith(sex)]
 for part in range(4):
  sheet=Image.new('RGB',(960,1660),'#eeeeee');dr=ImageDraw.Draw(sheet)
  for row,name in enumerate(files[part*3:part*3+3]):
   dr.text((10,row*550+5),name+' | left460 / right0fb',fill='black')
   for col,base in enumerate([old,new]):
    im=Image.open(base/name).crop((300,90,880,720));im.thumbnail((475,515));sheet.paste(im,(col*480,row*550+30))
  sheet.save(out/f'{sex}-{part+1}.jpg',quality=94)
options=''.join(f'<option value="{html.escape(r["file"])}">{html.escape(r["file"])} ({r["changedPixels"]} px, max {r["maxChannelDelta"]})</option>' for r in rows)
(p/'index-0fb.html').write_text('''<!doctype html><meta charset="utf-8"><title>Face compact 同姿对照</title><style>body{font:18px system-ui;background:#171b22;color:#eee;margin:20px}button,select{font:inherit;padding:12px}img{width:100%;max-width:1200px;display:block;margin-top:12px}p{max-width:1100px}</style><h1>460 / 0fb 同姿静态对照</h1><p>相同骨姿、时钟、光照、相机、表达权重；不代表正常动画或自然度验收。原男性眼线高幅差异已消除；24对中18对像素完全相同，6对少量通道差1。保留实际微差，不称逐像素全部通过。</p><select id="pick">'''+options+'''</select> <button onclick="show('poses-460')">公开460</button> <button onclick="show('poses-0fb')">候选0fb</button><p id="label"></p><img id="image"><script>let base='poses-460';function show(b){base=b;label.textContent=b;image.src=b+'/'+pick.value}pick.onchange=()=>show(base);show(base)</script>''',encoding='utf-8')
print(json.dumps({'pairs':len(rows),'exact':sum(r['exact'] for r in rows),'maxPixels':max(r['changedPixels'] for r in rows)},indent=2))
