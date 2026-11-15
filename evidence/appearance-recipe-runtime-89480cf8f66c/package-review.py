from pathlib import Path
import json,gzip,hashlib,subprocess,tempfile,html
from PIL import Image,ImageDraw
import imageio_ffmpeg
p=Path(__file__).resolve().parent;r=json.loads((p/'report.json').read_text(encoding='utf-8'));out=p/'review';out.mkdir(exist_ok=True);summary={'build':r['build'],'sampling':'2fps full sequential decode; engineering image review, not continuous human acceptance','movies':[]}
for m in r['movies']:
 with tempfile.TemporaryDirectory() as t:
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-threads','2','-i',str(p/m['file']),'-vf','fps=2,scale=800:500','-q:v','3',str(Path(t)/'%04d.jpg')],capture_output=True,check=True)
  frames=sorted(Path(t).glob('*.jpg'));sheets=[]
  for k in range(0,len(frames),8):
   canvas=Image.new('RGB',(1600,2120),'#eee');d=ImageDraw.Draw(canvas)
   for j,f in enumerate(frames[k:k+8]):
    x=j%2*800;y=j//2*530;canvas.paste(Image.open(f),(x,y+30));d.text((x+5,y+6),f'{m["file"]} video {(k+j)/2:.1f}s',fill='black')
   name='review/'+Path(m['file']).stem+f'-{k//8:02d}.jpg';canvas.save(p/name,quality=92);sheets.append(name)
  summary['movies'].append({**m,'sampleFrames':len(frames),'sheets':sheets})
for f in ['report.json','female-trace.json','male-trace.json']:(p/(f+'.gz')).write_bytes(gzip.compress((p/f).read_bytes(),mtime=0))
(p/'review-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
stills=[f.relative_to(p).as_posix()for f in sorted((p/'settled-stills').glob('*.png'))];movies=[m['file']for m in r['movies']];sheets=[f for m in summary['movies']for f in m['sheets']]
def options(seq):return ''.join(f'<option>{html.escape(x)}</option>'for x in seq)
page=f'''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>894 外观配方文件与代表造型</title><style>body{{max-width:1600px;margin:auto;padding:20px;background:#f5f1ea;color:#233d36;font:17px/1.65 system-ui}}video,img{{display:block;width:100%}}select,button{{min-height:44px;font:inherit;max-width:100%}}section{{margin:32px 0}}</style><h1>89480cf8f66c · 配方文件与代表造型</h1><p>原男女各一套默认/代表造型。同姿图使用真实暂停和完成后的相机外参。新短发与配色差异不能当作几何捏脸；这里没有新资产，也没有修改面部数值。</p><p><a href="representative-female.json" download>下载女性代表配方</a> · <a href="representative-male.json" download>下载男性代表配方</a>。先在工作台选对应原女性/男性，再“读取配方”；文件不含资源、账户或动作。</p><section><h2>原尺寸连续正常1×记录</h2><p>包含真实控件操作、静态暂停对照、文件读取/下载和约8秒讲话眨眼；不是整段一直讲话，未剪接改速。</p><select id="mv">{options(movies)}</select><video id="vid" controls preload="metadata" src="{movies[0]}"></video></section><section><h2>同姿前后与实际布局</h2><select id="ss">{options(stills)}</select><img id="im" src="{stills[0]}"></section><section><h2>完整时段2fps工程抽审</h2><p>抽帧不替代连续观感验收；原片保留可全屏观看。</p><select id="ts">{options(sheets)}</select><img id="sheet" src="{sheets[0]}"></section><a href="RESULT.md">结果与限制</a> · <a href="report.json">实际测试日志</a><script>mv.onchange=()=>{{vid.pause();vid.src=mv.value}};ss.onchange=()=>im.src=ss.value;ts.onchange=()=>sheet.src=ts.value;</script></html>'''
(p/'index.html').write_text(page,encoding='utf-8');print(json.dumps({'movies':[(m['file'],m['sampleFrames'],len(m['sheets']))for m in summary['movies']]}))
