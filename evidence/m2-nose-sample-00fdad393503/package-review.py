from pathlib import Path
import json, subprocess, tempfile, gzip, hashlib, html
from PIL import Image,ImageDraw
import imageio_ffmpeg
root=Path(__file__).resolve().parent
r=json.loads((root/'report.json').read_text(encoding='utf-8'))
summary={'build':r['build'],'movies':[],'samePosePairs':[],'scope':'2fps full-interval engineering review only; recording frame data not target-device benchmark.'}
for m in r['movies']:
 stem=Path(m['file']).stem
 data=json.loads((root/m['trace']).read_text(encoding='utf-8'))
 (root/(m['trace']+'.gz')).write_bytes(gzip.compress((root/m['trace']).read_bytes(),mtime=0))
 folder=root/(stem+'-review-2fps');folder.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory() as temp:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-v','error','-i',str(root/m['file']),'-vf','fps=2,crop=1200:816:20:142',str(Path(temp)/'%05d.jpg')],check=True)
  frames=sorted(Path(temp).glob('*.jpg'));sheets=[]
  for start in range(0,len(frames),12):
   canvas=Image.new('RGB',(1620,1600),'#eee');draw=ImageDraw.Draw(canvas)
   for j,f in enumerate(frames[start:start+12]):
    im=Image.open(f);im.thumbnail((536,365));x=j%3*540;y=j//3*400;canvas.paste(im,(x,y+25));draw.text((x+5,y+5),f'{stem} video {(start+j)/2:.1f}s',fill='black')
   filename=folder/f'{start//12:03d}.jpg';canvas.save(filename,quality=91);sheets.append(filename.relative_to(root).as_posix())
  summary['movies'].append({**m,'sampleFrames':len(frames),'sheets':sheets})
for body in ['female','male']:
 for kind,directions in [('', ['front','side','diagonal45']),('glasses-',['front','side'])]:
  for direction in directions:
   canvas=Image.new('RGB',(2400,856),'#eee');draw=ImageDraw.Draw(canvas)
   for j,nose in enumerate(['none','tip-forward05-v1']):
    im=Image.open(root/f'{body}-{kind}{nose}-{direction}.png')
    if im.size==(1600,1000): im=im.crop((20,142,1220,958))
    im.thumbnail((1200,816));canvas.paste(im,(j*1200,40));draw.text((j*1200+10,10),f'{body} {kind}{direction} {nose} / exact same pose & camera',fill='black')
   file=f'{body}-{kind}{direction}-pair.jpg';canvas.save(root/file,quality=94);summary['samePosePairs'].append(file)
(root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
options=lambda names:''.join(f'<option value="{html.escape(s)}">{html.escape(s)}</option>' for s in names)
sheets=[s for m in summary['movies'] for s in m['sheets']]
page='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>鼻尖单端点样件回读</title><style>body{max-width:1600px;margin:auto;padding:20px;font:16px/1.6 system-ui;background:#f6f3ed;color:#243b33}select,button{font:inherit;min-height:44px;padding:10px}img,video{display:block;width:100%;background:#eee;border-radius:12px}section{margin:26px 0}.note{background:#fff3d9;padding:15px}</style><h1>00fdad393503 · 原男女鼻尖单端点样件</h1><p class="note">唯一鼻尖端点：向前 +0.5mm，非任意鼻部编辑；可与已有眉位组合及嘴宽±4%共存。13项定向技术检查通过；视觉请观看原片，勿从技术门推定自然度。</p><section><h2>同姿原位 / 新鼻尖</h2><select id="pair">PAIRS</select><img id="photo" src="FIRSTPAIR"><p>逐值核对暂停时间、实际骨矩阵、相机外参。45°为诊断单帧视角。本批静图从首张即暂停同一姿态；眼镜图与无眼镜图属于不同暂停段，仅各自原/新鼻尖同姿对比。</p></section><section><h2>完整正常 1× 近景</h2><select id="movie">MOVIES</select><video id="film" src="female-nose-1x.webm" controls preload="metadata"></video><p>保留加载准备和真实UI编辑；无发、原鼻/新鼻、嘴宽与眉位、讲话/微笑/自动眨眼/视线，未剪接或改速。讲话不是音频唇同步。</p></section><section><h2>完整时段 2fps 工程抽审</h2><select id="sheet">SHEETS</select><img id="review" src="FIRSTSHEET"><p>抽帧不等同连续人工自然度验收；录像帧时间仅开发机此次窗口，不代表普通电脑达标。</p></section><p><a href="RESULT.md">结论和限制</a> · <a href="report.json">实际检查</a> · <a href="summary.json">时间采样</a></p><script>const q=id=>document.getElementById(id);q(\'pair\').onchange=()=>q(\'photo\').src=q(\'pair\').value;q(\'movie\').onchange=()=>{q(\'film\').pause();q(\'film\').src=q(\'movie\').value};q(\'sheet\').onchange=()=>q(\'review\').src=q(\'sheet\').value;</script></html>'.replace('PAIRS',options(summary['samePosePairs'])).replace('FIRSTPAIR',summary['samePosePairs'][0]).replace('MOVIES',options([m['file'] for m in r['movies']])).replace('SHEETS',options(sheets)).replace('FIRSTSHEET',sheets[0])
(root/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'pairs':summary['samePosePairs'],'movies':[{'file':m['file'],'sheets':m['sheets'],'frames':m['sampleFrames'],'clock':{k:v for k,v in m['summary'].items() if k not in ['rawFirst','rawLast']}} for m in summary['movies']]},indent=2))
