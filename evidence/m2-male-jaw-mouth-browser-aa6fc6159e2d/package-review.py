from pathlib import Path
import json,gzip,tempfile,subprocess
from PIL import Image,ImageDraw
import imageio_ffmpeg
p=Path(__file__).resolve().parent;r=json.loads((p/'report.json').read_text(encoding='utf-8'));o=p/'review';o.mkdir(exist_ok=True);sheets=[]
for exp in ['neutral','aa','happyblink']:
 canvas=Image.new('RGB',(1600,1160),'#eee');d=ImageDraw.Draw(canvas)
 for row,side in enumerate(['front','side']):
  for col,value in enumerate(['0','0.04']):
   f=p/f'jaw-mouth{value}-{exp}-{side}.png';im=Image.open(f);im.thumbnail((800,540));x=col*800;y=row*580;canvas.paste(im,(x,y+30));d.text((x+5,y+8),f.stem,fill='black')
 name=f'review/pair-{exp}.jpg';canvas.save(p/name,quality=94);sheets.append(name)
ff=imageio_ffmpeg.get_ffmpeg_exe();m=r['movies'][0];whole=[]
with tempfile.TemporaryDirectory() as t:
 subprocess.run([ff,'-threads','2','-i',str(p/m['file']),'-vf','fps=2,scale=800:500','-q:v','3',str(Path(t)/'%04d.jpg')],capture_output=True,check=True)
 frames=sorted(Path(t).glob('*.jpg'))
 for k in range(0,len(frames),8):
  canvas=Image.new('RGB',(1600,2120),'#eee');d=ImageDraw.Draw(canvas)
  for j,f in enumerate(frames[k:k+8]):
   x=j%2*800;y=j//2*530;canvas.paste(Image.open(f),(x,y+30));d.text((x+5,y+8),f'aa6 video {(k+j)/2:.1f}s',fill='black')
  name=f'review/video-{k//8:02d}.jpg';canvas.save(p/name,quality=93);whole.append(name)
(p/'review-summary.json').write_text(json.dumps({'build':r['build'],'staticSheets':sheets,'wholeSheets':whole,'wholeTimeFrames':len(frames),'samplingFPS':2,'limits':'Sequential whole-file sampled image review, not continuous human viewing.'},indent=2),encoding='utf-8')
for f in ['report.json','live-trace.json']:(p/(f+'.gz')).write_bytes(gzip.compress((p/f).read_bytes(),mtime=0))
def opts(a):return ''.join('<option>'+s+'</option>'for s in a)
images=[x.name for x in p.glob('*.png')]
(p/'index.html').write_text(f'''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>aa6 男性下颌嘴宽端点</title><style>body{{max-width:1600px;margin:auto;background:#f5f1ea;padding:20px;font:17px/1.6 system-ui}}select{{min-height:44px;font:inherit;max-width:100%}}img,video{{display:block;width:100%}}section{{margin:30px 0}}</style><h1>aa6fc6159e2d · 男性下颌样件嘴宽 +4%</h1><p>最终可重建固定版；旧5d完整表情证据独立保留，未换标。仅原位/+4%两个值；眉鼻眼未适配。静态原/新同骨同相机；微小嘴宽变化不是自由捏脸。</p><section><h2>实际连续1×讲话、注视、短裤走停、重置</h2><video controls src="{m['file']}"></video></section><section><h2>同姿原位/+4%</h2><select id="s">{opts(sheets)}</select><img id="si" src="{sheets[0]}"></section><section><h2>全时段2fps工程抽审</h2><select id="v">{opts(whole)}</select><img id="vi" src="{whole[0]}"></section><section><h2>原尺寸图</h2><select id="i">{opts(images)}</select><img id="ii" src="{images[0]}"></section><p><a href="male-jaw-mouth04-export.json" download>实际导出本样件配方</a> · <a href="RESULT.md">范围与限制</a></p><script>s.onchange=()=>si.src=s.value;v.onchange=()=>vi.src=v.value;i.onchange=()=>ii.src=i.value;</script></html>''',encoding='utf-8');print(len(frames),len(whole))
