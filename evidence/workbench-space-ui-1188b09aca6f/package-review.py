from pathlib import Path
import json,hashlib,gzip,subprocess,tempfile
from PIL import Image,ImageDraw
import imageio_ffmpeg
root=Path(__file__).resolve().parent
raw=(root/'workbench-tour-trace.json').read_bytes();t=json.loads(raw);rows=[x for x in t['rows'] if x['t']>=0];dt=sorted(x['dt']*1000 for x in rows[1:] if x['dt'] is not None)
pct=lambda f:dt[min(len(dt)-1,int((len(dt)-1)*f))]
summary={'build':'1188b09aca6f','rows':len(rows),'rawFirst':t['rows'][0],'rawLast':t['rows'][-1],'negativeInitialSamples':sum(x['t']<0 for x in t['rows']),'wall':rows[-1]['t']-rows[0]['t'],'sim':rows[-1]['sim']-rows[0]['sim'],'frameMs':{'p50':pct(.5),'p95':pct(.95),'p99':pct(.99),'max':max(dt),'over33':sum(v>33.333333 for v in dt),'over50':sum(v>50 for v in dt)},'scope':'Headless development-machine recording, hot body replacement/loading included; not animation-speed or target-PC benchmark.','sheets':[]}
summary['simWallRatio']=summary['sim']/summary['wall']
summary['longFrames']=[x for x in rows[1:] if x['dt']>.05]
(root/'workbench-tour-trace.json.gz').write_bytes(gzip.compress(raw,mtime=0))
folder=root/'review-2fps';folder.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as temp:
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-v','error','-i',str(root/'workbench-tour-1x.webm'),'-vf','fps=2',str(Path(temp)/'%05d.jpg')],check=True)
 frames=sorted(Path(temp).glob('*.jpg'));summary['sampleFrames']=len(frames)
 for start in range(0,len(frames),6):
  canvas=Image.new('RGB',(1600,1590),'#eee');draw=ImageDraw.Draw(canvas)
  for j,f in enumerate(frames[start:start+6]):
   im=Image.open(f);im.thumbnail((800,500));x=j%2*800;y=j//2*530;canvas.paste(im,(x,y+30));draw.text((x+8,y+7),f'video {(start+j)/2:.1f}s / UI full frame',fill='black')
  file=f'review-2fps/{start//6:03d}.jpg';canvas.save(root/file,quality=92);summary['sheets'].append(file)
(root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
options=''.join(f'<option value="{f}">{f}</option>' for f in summary['sheets'])
page='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>工作台键盘修复与操作展示</title><style>body{max-width:1600px;margin:auto;padding:20px;font:16px/1.6 system-ui;background:#f6f3ed;color:#243b33}select{font:inherit;min-height:44px;padding:10px}video,img{width:100%;display:block}section{margin:25px 0}</style><h1>1188b09aca6f · 工作台键盘修复</h1><p>7组定向检查通过、0页面错误。聚焦几何折叠标题按空格现在正常展开/折叠，不再误暂停；房间焦点仍可空格暂停/继续，长按不反复切换。</p><section><h2>完整正常1×操作片</h2><video controls preload="metadata" src="workbench-tour-1x.webm"></video><p>1600×1000原始录像，保留加载与实际UI切换；男女按钮、各组下颌样件同页切换、男性新发型、三页签与常驻镜头。未重录舞蹈或改动作。</p></section><section><h2>完整时段2fps工程抽审</h2><select id="sheet">OPTIONS</select><img id="image" src="review-2fps/000.jpg"><p>抽帧不等同连续人工验收；记录含热替换等待，不以sim/wall当动作速度结论，亦非普通电脑性能证明。</p></section><p><a href="RESULT.md">结果与限制</a> · <a href="report.json">检查日志</a> · <a href="keyboard-events.json">原生键盘事件</a> · <a href="summary.json">录像窗口数据</a></p><script>document.getElementById(\'sheet\').onchange=e=>document.getElementById(\'image\').src=e.target.value;</script></html>'.replace('OPTIONS',options)
(root/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in ['rawFirst','rawLast','longFrames']},indent=2))
