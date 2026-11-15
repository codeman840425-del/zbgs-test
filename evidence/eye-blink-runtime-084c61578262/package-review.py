from pathlib import Path
import json,gzip,subprocess,tempfile,re
from PIL import Image,ImageDraw
import imageio_ffmpeg
root=Path(__file__).resolve().parent
r=json.loads((root/'report.json').read_text(encoding='utf-8'))
folder=root/'review';folder.mkdir(exist_ok=True)
review={'build':r['build'],'staticSheets':[],'movies':[],'limits':'2fps whole-time sampled engineering review is not continuous human naturalness acceptance. Dense peak location uses estimated video/trace offset, not exact synchronization.'}
files=sorted(root.glob('*-legacy-*.png'))
for k in range(0,len(files),4):
 canvas=Image.new('RGB',(1600,1440),'#eee');d=ImageDraw.Draw(canvas)
 for j,f in enumerate(files[k:k+4]):
  for col,p in enumerate([f,root/f.name.replace('-legacy-','-fixed-')]):
   im=Image.open(p).convert('RGB').crop((300,190,880,535));im.thumbnail((790,320));x=col*800;y=j*360;canvas.paste(im,(x+(800-im.width)//2,y+32));d.text((x+5,y+8),p.stem,fill='black')
 name=f'review/static-{k//4:02d}.jpg';canvas.save(root/name,quality=95);review['staticSheets'].append(name)
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
for movie in r['movies']:
 stem=Path(movie['file']).stem
 trace=json.loads((root/movie['trace']).read_text(encoding='utf-8'))
 with tempfile.TemporaryDirectory() as temp:
  # Sequentially decode the complete original; never random seek into WebM.
  proc=subprocess.run([ffmpeg,'-threads','2','-i',str(root/movie['file']),'-vf','fps=25','-q:v','3',str(Path(temp)/'%05d.jpg')],capture_output=True,check=True)
  frames=sorted(Path(temp).glob('*.jpg'));duration=len(frames)/25;offset=duration-trace['rows'][-1]['t'];sheets=[]
  def sheet(selected,name,cols=4):
   canvas=Image.new('RGB',(1920,400*((len(selected)+cols-1)//cols)),'#eee');d=ImageDraw.Draw(canvas)
   for j,i in enumerate(selected):
    im=Image.open(frames[i]).convert('RGB').crop((260,185,970,800));im.thumbnail((475,365));x=j%cols*480;y=j//cols*400;canvas.paste(im,(x+(480-im.width)//2,y+30));d.text((x+5,y+8),f'{stem} video {i/25:.2f}s',fill='black')
   canvas.save(root/name,quality=94);return name
  sampled=list(range(0,len(frames),12))
  for k in range(0,len(sampled),12):sheets.append(sheet(sampled[k:k+12],f'review/{stem}-whole-{k//12:02d}.jpg'))
  dense=[]
  for mode in ['legacy','fixed']:
   rows=[x for x in trace['rows'] if x['t']>=0 and x['segment']==mode];peak=next(x for x in rows if x['expressions']['blink']>.9);offset=1.2;center=round((peak['t']+offset)*25)
   indices=[i for i in range(center-15,center+16) if 0<=i<len(frames)]
   name=sheet(indices,f'review/{stem}-{mode}-peak.jpg');dense.append({'mode':mode,'tracePeak':peak,'approxVideoOffset':offset,'sheet':name})
  review['movies'].append({**movie,'decodedFrames25fps':len(frames),'resampledDuration':duration,'wholeTimeSheets':sheets,'dense':dense})
for f in ['report.json']+[m['trace'] for m in r['movies']]:(root/(f+'.gz')).write_bytes(gzip.compress((root/f).read_bytes(),mtime=0))
(root/'review-summary.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf-8')
sheets=review['staticSheets']+[f for m in review['movies'] for f in m['wholeTimeSheets']]+[x['sheet']for m in review['movies']for x in m['dense']]
def opts(files):return ''.join(f'<option value="{x}">{x}</option>'for x in files)
movies=[m['file']for m in r['movies']];stills=[p.name for p in sorted(root.glob('*.png'))]
page=f'''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>084 睫毛叠加对照</title><style>body{{max-width:1600px;margin:auto;padding:20px;background:#f5f1ea;color:#253a36;font:16px/1.6 system-ui}}select{{min-height:44px;max-width:100%;font:inherit}}img,video{{display:block;width:100%}}section{{margin:30px 0}}</style><h1>084c61578262 · happy + blink 睫毛叠加修正候选</h1><p>同版本 legacy / fixed。正常片依次旧规则讲话至少3次眨眼、恢复中性、新规则讲话至少3次眨眼、恢复中性。含原生加载画面，未剪接改速。原女性与男性，眼端点none/+1%各一片；单眼组合不在修复范围。</p><section><h2>完整正常1×影片</h2><select id="movies">{opts(movies)}</select><video id="v" controls preload="metadata" src="{movies[0]}"></video></section><section><h2>原尺寸同姿正常材质</h2><select id="stills">{opts(stills)}</select><img id="im" src="{stills[0]}"></section><section><h2>同姿对照、全时段抽帧与眨眼附近密集帧</h2><p>抽帧不是连续人类观感验收。密集区间使用video/trace近似偏移，不能把视频帧标成精确数值权重时刻。</p><select id="sheets">{opts(sheets)}</select><img id="sh" src="{sheets[0]}"></section><a href="RESULT.md">结果与限制</a> · <a href="report.json">实际记录</a> · <a href="review-summary.json">时序与密集帧索引</a><script>movies.onchange=()=>{{v.pause();v.src=movies.value}};stills.onchange=()=>im.src=stills.value;sheets.onchange=()=>sh.src=sheets.value;</script></html>'''
(root/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'staticSheets':len(review['staticSheets']),'wholeSheets':sum(len(x['wholeTimeSheets'])for x in review['movies']),'denseSheets':sum(len(x['dense'])for x in review['movies'])}))
