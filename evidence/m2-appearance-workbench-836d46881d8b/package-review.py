from pathlib import Path
import json,hashlib,gzip,subprocess,tempfile,html
from PIL import Image,ImageDraw
import imageio_ffmpeg
root=Path('evidence/m2-appearance-workbench-836d46881d8b')
r=json.loads((root/'report.json').read_text(encoding='utf-8'))
summary={'build':r['build'],'scope':'Recording-window statistics only; development Chrome headless, not ordinary-PC performance. Startup and setup before trace remain in native video.','movies':[]}
for movie in r['movies']:
 name=movie['file'];stem=Path(name).stem
 data=json.loads((root/movie['trace']).read_text(encoding='utf-8'));rows=data['rows'];valid=[x for x in rows if x['t']>=0];dts=sorted(x['dt']*1000 for x in valid if x['dt'] is not None)
 def pct(p):return dts[min(len(dts)-1,int((len(dts)-1)*p))]
 wall=valid[-1]['t']-valid[0]['t'];sim=valid[-1]['sim']-valid[0]['sim']
 result={'file':name,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest(),'trace':movie['trace'],'samples':len(rows),'rawFirstT':rows[0]['t'],'rawLastT':rows[-1]['t'],'negativeTCount':sum(x['t']<0 for x in rows),'wallSeconds':wall,'simSeconds':sim,'simWallRatio':sim/wall,'maxDanceTime':max(x['dance']['time']for x in rows),'frameMs':{'p50':pct(.5),'p95':pct(.95),'p99':pct(.99),'max':max(dts),'over33':sum(x>33 for x in dts),'over50':sum(x>50 for x in dts)},'appearanceFirst':rows[0]['appearance'],'appearanceLast':rows[-1]['appearance'],'maxBlink':max(x['expression']['blink']for x in rows),'maxAa':max(x['expression']['aa']for x in rows)}
 (root/(movie['trace']+'.gz')).write_bytes(gzip.compress((root/movie['trace']).read_bytes(),compresslevel=6,mtime=0));summary['movies'].append(result)
 out=root/(stem+'-review-2fps');out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='v8-review-')as tmp:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-v','error','-i',str(root/name),'-vf','fps=2,crop=1200:816:20:142',str(Path(tmp)/'%05d.jpg')],check=True)
  frames=sorted(Path(tmp).glob('*.jpg'));sheets=[]
  for start in range(0,len(frames),12):
   canvas=Image.new('RGB',(1620,1600),'#eee');draw=ImageDraw.Draw(canvas)
   for j,f in enumerate(frames[start:start+12]):
    im=Image.open(f);im.thumbnail((536,365));x=(j%3)*540;y=(j//3)*400;canvas.paste(im,(x,y+25));draw.text((x+5,y+5),f'{stem} video {(start+j)/2:.1f}s',fill='black')
   filename=f'{start//12:03d}.jpg';canvas.save(out/filename,quality=91);sheets.append(filename)
  (out/'manifest.json').write_text(json.dumps({'video':name,'frames':len(frames),'samplingFPS':2,'sheets':sheets,'crop':[20,142,1200,816],'limit':'Game viewport crop for review; full native video unchanged. Sampled review is not continuous 1x human acceptance.'},indent=2),encoding='utf-8')
(root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
options=''.join(f'<option value="{html.escape(m["file"])}">{html.escape(m["file"])}</option>'for m in r['movies'])
shots=''.join(f'<option value="{html.escape(s["file"])}">{html.escape(s["file"])}</option>'for s in r['shots'])
page='''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>工作台 v8 · 实际观察</title><style>body{max-width:1560px;margin:auto;padding:20px;font:16px/1.6 system-ui;background:#f6f3ed;color:#243b33}select,button{font:inherit;padding:10px;min-height:44px}img,video{display:block;width:100%;background:#ddd;border-radius:12px}section{margin:26px 0}.note{padding:16px;background:#fff4d9}a{color:#226c57}</style><h1>工作台 v8 · 836d46881d8b</h1><p class="note">男女独立选择、同页样件切换、镜头和播放工具常驻。这里的男女新发型、蓝/紫虹膜、唇色和完整30秒舞均来自同一固定版本。保留原舞与衣物的既有问题，不替代自然度验收或普通电脑性能测试。</p><section><h2>完整原尺寸正常 1× · 可全屏</h2><select id="movie">OPTIONS</select><video id="film" src="female-near-1x.webm" controls preload="metadata" playsinline></video><p>原片包含加载、配色准备和末尾站立，未剪接/改速。近景中的镜头切换为实际按钮操作。</p></section><section><h2>实际界面与近景</h2><select id="shot">SHOTS</select><img id="picture" src="layout-1366-appearance.png" alt="实际固定版截图"></section><p><a href="RESULT.md">结果与限制</a> · <a href="summary.json">时钟和帧间隔</a> · <a href="report.json">原始操作日志</a></p><script>const q=id=>document.getElementById(id);q('movie').onchange=()=>{q('film').pause();q('film').src=q('movie').value;};q('shot').onchange=()=>q('picture').src=q('shot').value;</script></html>'''.replace('OPTIONS',options).replace('SHOTS',shots)
(root/'index.html').write_text(page,encoding='utf-8');print(json.dumps(summary,ensure_ascii=False,indent=2))
