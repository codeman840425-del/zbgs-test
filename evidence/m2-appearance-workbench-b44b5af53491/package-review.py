"""Add compact engineering review artifacts; never alter original captures."""
import argparse, gzip, hashlib, json, pathlib, subprocess, tempfile
from PIL import Image, ImageDraw
import imageio_ffmpeg

p=argparse.ArgumentParser();p.add_argument('--decode',action='store_true');args=p.parse_args()
root=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
report=json.loads((root/'report.json').read_text(encoding='utf-8'))
summary={'build':report['build'],'scope':'Actual 1600x1000 normal 1x original dance recording windows, intentional pause included; not a device performance test','movies':[],'review':'pending engineering frame review, not continuous human 1x approval'}
for body in ['female','male']:
 tracefile=root/(body+'-dance-trace.json');data=tracefile.read_bytes();r=json.loads(data)['rows'];valid=[x for x in r if x['t']>=0];dt=sorted(x['dt'] for x in valid[1:] if x['dt'] is not None)
 rows={'body':body,'file':body+'-original-30s-1x.webm','sha256':sha((root/(body+'-original-30s-1x.webm')).read_bytes()),'frames':len(r),'rawFirstT':r[0]['t'],'rawLastT':r[-1]['t'],'negativeTCount':sum(x['t']<0 for x in r),'wallSeconds':valid[-1]['t']-valid[0]['t'],'simSeconds':valid[-1]['simulationTime']-valid[0]['simulationTime'],'maxDanceClock':max(x['dance']['time'] for x in r),'frameMs':{'p50':dt[int((len(dt)-1)*.5)]*1000,'p95':dt[int((len(dt)-1)*.95)]*1000,'p99':dt[int((len(dt)-1)*.99)]*1000,'max':max(dt)*1000,'over33_333ms':sum(x>1/30 for x in dt),'over50ms':sum(x>.05 for x in dt)},'traceRawSha256':sha(data)}
 encoded=gzip.compress(data,compresslevel=1,mtime=0);gz=tracefile.with_suffix('.json.gz');gz.write_bytes(encoded);assert gzip.decompress(encoded)==data;rows['traceGzipSha256']=sha(encoded);rows['camera']=valid[0]['camera'];summary['movies'].append(rows)
 if args.decode:
  out=root/(body+'-review-2fps');out.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='workbench-review-')as temp:
   subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-v','error','-i',str(root/rows['file']),'-vf','fps=2,crop=1194:870:24:88',str(pathlib.Path(temp)/'%05d.jpg')],check=True)
   files=sorted(pathlib.Path(temp).glob('*.jpg'));sheets=[]
   for start in range(0,len(files),12):
    canvas=Image.new('RGB',(1620,1680),'#eee');draw=ImageDraw.Draw(canvas)
    for j,f in enumerate(files[start:start+12]):
     im=Image.open(f);im.thumbnail((536,390));x=(j%3)*540;y=(j//3)*420;canvas.paste(im,(x,y+25));draw.text((x+6,y+6),f'{body} video {(start+j)/2:.1f}s',fill='black')
    name=f'{start//12:03d}.jpg';canvas.save(out/name,quality=90);sheets.append(name)
   (out/'manifest.json').write_text(json.dumps({'video':rows['file'],'fps':2,'frames':len(files),'sheets':sheets,'crop':[24,88,1194,870],'scope':'Only UI margins cropped from review sheets; original 1600x1000 movie retained. Full game viewport including feet. Complete duration sampled, not all frames or continuous human viewing.'},indent=2),encoding='utf-8')
(root/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')

html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>外观工作台 · b44 验收</title><style>body{font:16px/1.6 system-ui;background:#f5f3ed;color:#243b33;max-width:1500px;margin:auto;padding:24px}button,select{font:inherit;padding:10px;min-height:44px}img,video{width:100%;background:#ddd;border-radius:12px}section{margin:28px 0}p{max-width:1000px}.note{padding:16px;background:#fff2dd}a{color:#226652}</style><h1>外观工作台 · 固定 b44b5af53491</h1><p class="note">这页保留旧固定版的实际验收。深肤色偏橙，待新版修正；短发耳侧碎发接触仍属候选细节。30 秒原舞动作未重制，已知手臂及服装问题保留。本页不代表普通电脑性能或用户最终观感验收。</p><section><h2>正常 1× 完整原舞</h2><p>原尺寸 1600 × 1000，包含加载、镜头准备与一次主动暂停/恢复；可全屏观看。选择角色不会叠放或拼接影片。</p><select id="movie"><option value="female">女性</option><option value="male">男性</option></select><video id="film" controls preload="metadata" src="female-original-30s-1x.webm"></video></section><section><h2>原发型 / 齐颈短发近景</h2><p>同一原女性，正侧背真实相机截图。静图不代替转头或说话连续验收。</p><select id="style"><option value="original">原发型</option><option value="female-bob-v1">齐颈短发</option></select><select id="direction"><option value="front">正面</option><option value="side">侧面</option><option value="back">背面</option></select><img id="hair" alt="同人物发型近景" src="female-original-face-front.png"></section><section><h2>既有身体 / 容貌变化</h2><p>穿着相同风格衣物的同镜头截图，变化幅度有限；不夸大体型差异。所有原图均保留。</p><select id="body"><option value="female">女性原版</option><option value="m1a-jaw-v1">女性下颌</option><option value="m1a-waisthip-v1">女性腰胯</option><option value="male">男性原版</option><option value="m2-male-jaw-v1">男性下颌</option></select><select id="framing"><option value="face">脸部</option><option value="half">半身</option></select><select id="bodydirection"><option value="front">正面</option><option value="side">侧面</option></select><img id="shape" alt="既有容貌与体型候选" src="female-compare-face-front.png"></section><p><a href="RESULT.md">范围与失败记录</a> · <a href="summary.json">录像时钟摘要</a> · <a href="report.json">实际操作日志</a> · <a href="rapid-corrected/report.json">快速切换纠正检查</a></p><script>const q=id=>document.getElementById(id);q('movie').onchange=()=>{q('film').pause();q('film').src=q('movie').value+'-original-30s-1x.webm';};for(const id of ['style','direction'])q(id).onchange=()=>q('hair').src='female-'+q('style').value+'-face-'+q('direction').value+'.png';for(const id of ['body','framing','bodydirection'])q(id).onchange=()=>q('shape').src=q('body').value+'-compare-'+q('framing').value+'-'+q('bodydirection').value+'.png';</script></html>'''
(root/'index.html').write_text(html,encoding='utf-8')
print(json.dumps(summary,indent=2))
