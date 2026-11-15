from pathlib import Path
import json,gzip,subprocess,tempfile,html
from PIL import Image,ImageDraw
import imageio_ffmpeg
root=Path(__file__).resolve().parent
r=json.loads((root/'report.json').read_text(encoding='utf-8'))
summary={'build':r['build'],'pairs':[],'sheets':[],'movies':[]}
folder=root/'review';folder.mkdir(exist_ok=True)
for body in ['female','male']:
 originals=sorted(root.glob(body+'-none-*.png'))
 for start in range(0,len(originals),4):
  canvas=Image.new('RGB',(1600,1520),'#eee');draw=ImageDraw.Draw(canvas)
  for row,f in enumerate(originals[start:start+4]):
   other=root/f.name.replace('-none-','-aperture-width101-v1-')
   for col,p in enumerate([f,other]):
    im=Image.open(p).convert('RGB');im=im.crop((300,150,900,600));im.thumbnail((800,340))
    x=col*800;y=row*380;canvas.paste(im,(x+(800-im.width)//2,y+35));draw.text((x+8,y+8),p.stem,fill='black')
   summary['pairs'].append({'original':f.name,'candidate':other.name})
  file=f'review/{body}-pairs-{start//4:02d}.jpg';canvas.save(root/file,quality=94);summary['sheets'].append(file)
for movie in r['movies']:
 body=movie['file'].split('-')[0]
 with tempfile.TemporaryDirectory() as temp:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-v','error','-i',str(root/movie['file']),'-vf','fps=2',str(Path(temp)/'%05d.jpg')],check=True)
  frames=sorted(Path(temp).glob('*.jpg'));sheets=[]
  for start in range(0,len(frames),8):
   canvas=Image.new('RGB',(1600,1400),'#eee');draw=ImageDraw.Draw(canvas)
   for j,f in enumerate(frames[start:start+8]):
    im=Image.open(f).convert('RGB').crop((20,142,1220,958));im.thumbnail((800,315));x=j%2*800;y=j//2*350;canvas.paste(im,(x+(800-im.width)//2,y+30));draw.text((x+8,y+7),f'{body} video {(start+j)/2:.1f}s',fill='black')
   file=f'review/{body}-video-{start//8:02d}.jpg';canvas.save(root/file,quality=93);sheets.append(file)
  summary['movies'].append({**movie,'sampleFrames':len(frames),'sheets':sheets});summary['sheets']+=sheets
for file in ['report.json','female-eye-1x-trace.json','male-eye-1x-trace.json']:
 (root/(file+'.gz')).write_bytes(gzip.compress((root/file).read_bytes(),mtime=0))
(root/'review-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
options=''.join(f'<option value="{f}">{f}</option>'for f in summary['sheets'])
stills=''.join(f'<option value="{p.name}">{p.name}</option>'for p in sorted(root.glob('*.png')))
page='''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>眼裂宽+1%单端点</title><style>body{max-width:1600px;margin:auto;padding:20px;font:16px/1.6 system-ui;background:#f6f3ed;color:#243b33}select{min-height:44px;max-width:100%;font:inherit}img,video{width:100%;display:block}section{margin:30px 0}</style><h1>844e273263a7 · 眼裂宽+1%单端点待验</h1><p>原男女、两态有限范围；静态闭眼/注视是明确诊断，影片用真实自动眨眼与讲话。技术检查不替代观感验收。</p><section><h2>完整原速影片</h2><select id="movie"><option value="female-eye-1x.webm">女性</option><option value="male-eye-1x.webm">男性</option></select><video id="video" controls preload="metadata" src="female-eye-1x.webm"></video></section><section><h2>正常材质原尺寸同姿图</h2><select id="still">STILLS</select><img id="stillImage" src="FIRSTSTILL"></section><section><h2>旧新局部对照及全时段2fps抽审</h2><select id="sheet">SHEETS</select><img id="sheetImage" src="FIRSTSHEET"><p>静图裁剪仅供查看，完整PNG保留；2fps抽帧不是连续人类验收，不能排除瞬间闪变。</p></section><p><a href="RESULT.md">结论与限制</a> · <a href="report.json">原始实际记录</a> · <a href="review-summary.json">影片时钟/图索引</a></p><script>movie.onchange=()=>{video.pause();video.src=movie.value};still.onchange=()=>stillImage.src=still.value;sheet.onchange=()=>sheetImage.src=sheet.value;</script></html>'''
page=page.replace('STILLS',stills).replace('FIRSTSTILL',sorted(root.glob('*.png'))[0].name).replace('SHEETS',options).replace('FIRSTSHEET',summary['sheets'][0])
(root/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'pairs':len(summary['pairs']),'sheets':len(summary['sheets']),'frames':[m['sampleFrames']for m in summary['movies']]},indent=2))
