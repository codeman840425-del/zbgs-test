from pathlib import Path
import json, hashlib, gzip, subprocess, tempfile, html
from PIL import Image, ImageDraw
import imageio_ffmpeg
root=Path(__file__).resolve().parent
r=json.loads((root/'report.json').read_text(encoding='utf-8'))
summary={'build':r['build'],'scope':'Development machine headless recording-window data only, screenshots/setup may stall recording. Not target-PC performance or continuous human naturalness acceptance.','movies':[]}
for m in r['movies']:
 name=m['file']; stem=Path(name).stem; raw=(root/m['trace']).read_bytes(); data=json.loads(raw); rows=[x for x in data['rows'] if x['t']>=0]; dt=sorted(x['dt']*1000 for x in rows if x['dt'] is not None)
 pct=lambda p:dt[min(len(dt)-1,int((len(dt)-1)*p))]
 wall=rows[-1]['t']-rows[0]['t']; sim=rows[-1]['sim']-rows[0]['sim']
 props={kind:{'onSamples':sum(x['live']['accessories'][kind]['status']=='on' for x in rows),'last':rows[-1]['live']['accessories'][kind],'errors':list(set(x['live']['accessories'][kind]['error'] for x in rows if x['live']['accessories'][kind]['error']))} for kind in ['mic','glasses']}
 assert all(v['onSamples']>0 and v['last']['requested']==False and not v['errors'] for v in props.values())
 (root/(m['trace']+'.gz')).write_bytes(gzip.compress(raw,compresslevel=6,mtime=0))
 item={'file':name,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest(),'trace':m['trace'],'samples':len(data['rows']),'negativeTCount':sum(x['t']<0 for x in data['rows']),'rawFirstT':data['rows'][0]['t'],'rawLastT':data['rows'][-1]['t'],'wallSeconds':wall,'simSeconds':sim,'simWallRatio':sim/wall,'frameMs':{'p50':pct(.5),'p95':pct(.95),'p99':pct(.99),'max':max(dt),'over33':sum(v>33 for v in dt),'over50':sum(v>50 for v in dt)},'widthValues':sorted(set(x['face']['mouthWidth'] for x in rows)),'geometryIdentity':rows[-1]['face']['geometryIdentity'],'props':props,'expressionMax':{k:max(x['expressions'][k] for x in rows) for k in ['aa','happy','blink']}}
 out=root/(stem+'-review-2fps');out.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='workbench-v9-review-') as temp:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-v','error','-i',str(root/name),'-vf','fps=2,crop=1200:816:20:142',str(Path(temp)/'%05d.jpg')],check=True)
  frames=sorted(Path(temp).glob('*.jpg')); sheets=[]
  for start in range(0,len(frames),12):
   canvas=Image.new('RGB',(1620,1600),'#eee');draw=ImageDraw.Draw(canvas)
   for j,p in enumerate(frames[start:start+12]):
    im=Image.open(p);im.thumbnail((536,365));x=(j%3)*540;y=(j//3)*400;canvas.paste(im,(x,y+25));draw.text((x+5,y+5),f'{stem} video {(start+j)/2:.1f}s',fill='black')
   fn=f'{start//12:03d}.jpg';canvas.save(out/fn,quality=91);sheets.append(fn)
  item['review']={'samplingFPS':2,'frames':len(frames),'sheets':[out.name+'/'+s for s in sheets]}
 summary['movies'].append(item)
(root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
shots=[]
sheetpaths=[s for m in summary['movies'] for s in m['review']['sheets']]
options=lambda names:''.join(f'<option value="{html.escape(n)}">{html.escape(n)}</option>' for n in names)
page='''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v11 草稿修复与嘴宽回读</title><style>body{max-width:1560px;margin:auto;padding:20px;font:16px/1.6 system-ui;background:#f6f3ed;color:#243b33}select,button{font:inherit;min-height:44px;padding:10px}img,video{display:block;width:100%;background:#eee;border-radius:12px}section{margin:28px 0}.note{background:#fff3d9;padding:15px}</style><h1>48843b9c7cc4 · 草稿修复与嘴宽回读</h1><p class="note">v11定向7项通过、0页面错误：新的API发色与同值裤装意图不再被旧草稿覆盖。嘴宽±4%仅首样，非完整五官系统；首次冷态编辑耗时仍有明确限制。</p><section><h2>完整原片正常1×（可全屏）</h2><select id="movie">MOVIES</select><video id="film" src="female-mouth-1x.webm" controls preload="metadata"></video><p>保留加载/准备。近景包含真实UI操作和中性截图停留，不剪接/改速；讲话为程序口型演示而非音频唇同步。</p></section><section><h2>全时段2fps工程抽审</h2><select id="sheet">SHEETS</select><img id="review" src="FIRSTSHEET"><p>抽帧不等同连续人工自然度验收。录像帧时间仅开发机此次窗口，不代表普通电脑达标。</p></section><p><a href="RESULT.md">结果和边界</a> · <a href="report.json">实际检查原日志</a> · <a href="summary.json">时钟/道具/表情采样</a></p><script>const q=id=>document.getElementById(id);q('movie').onchange=()=>{q('film').pause();q('film').src=q('movie').value};q('sheet').onchange=()=>q('review').src=q('sheet').value;</script></html>'''.replace('MOVIES',options([m['file'] for m in r['movies']])).replace('SHOTS',options(shots)).replace('SHEETS',options(sheetpaths)).replace('FIRSTSHEET',sheetpaths[0])
(root/'index.html').write_text(page,encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
