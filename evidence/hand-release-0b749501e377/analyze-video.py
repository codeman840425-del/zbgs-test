from pathlib import Path
import json,gzip,math,hashlib,subprocess
from PIL import Image,ImageDraw
import imageio_ffmpeg
E=Path(__file__).resolve().parent; ROOT=E.parents[1]
OLD=ROOT/'experiments/hand-scope-worktree-1/evidence'
versions=[('7a86',OLD/'snap-normal-baseline'),('c182',OLD/'snap-normal-candidate'),('0b749',E/'snap-normal')]
results=[]
for label,folder in versions:
 for view in ['room','fixed-diagnostic-close']:
  j=json.loads(gzip.decompress((folder/(view+'.json.gz')).read_bytes()));steps=j['steps'];vals=[]
  for a,b in zip(steps,steps[1:]):
   if not .10<=b['sim']-j['trigger']<=.27:continue
   p=a['wrists'][0];q=b['wrists'][0];dt=b['sim']-a['sim']
   vals.append({'sim':b['sim'],'sinceSit':b['sim']-j['trigger'],'dt':dt,'actualStepMm':math.dist(p['p'],q['p'])*1000,'projectionBeforeMm':None if p['projection'] is None else p['projection']*1000,'projectionAfterMm':None if q['projection'] is None else q['projection']*1000,'projectionDecreaseMm':max(0,(p['projection'] or 0)-(q['projection'] or 0))*1000})
  results.append({'label':label,'build':j['build'],'view':view,'errors':j['errors'],'wall':j['wall'],'sim':j['sim'],'ratio':j['ratio'],'trigger':j['trigger'],'localWindowAfterSit':[.10,.27],'maxActualWristStep':max(vals,key=lambda x:x['actualStepMm']),'maxScalarProjectionDecrease':max(vals,key=lambda x:x['projectionDecreaseMm']),'limit':'Independent actual clocks; unequal dt/phase. Not fixed-pose error or direct performance benchmark.'})
out=E/'snap-normal/review';out.mkdir(exist_ok=True)
frames=out/'critical-frames';frames.mkdir(exist_ok=True)
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-y','-i',str(E/'snap-normal/fixed-diagnostic-close.webm'),'-vf','select=between(t\\,0.68\\,0.96)','-vsync','0',str(frames/'%03d.png')],check=True)
allframes=[]
for label,folder in versions:
 d=frames if label=='0b749' else folder/'critical-frames'
 allframes.append((label,sorted(d.glob('*.png'))))
for start in range(0,min(len(v)for _,v in allframes),6):
 sheet=Image.new('RGB',(1800,930),'#eee');draw=ImageDraw.Draw(sheet)
 for row,(label,files) in enumerate(allframes):
  for col,file in enumerate(files[start:start+6]):
   im=Image.open(file).crop((450,320,750,610));x=col*300;y=row*310
   sheet.paste(im,(x,y+20));draw.text((x+3,y+3),f'{label} decoded #{start+col+1}',fill='black')
 sheet.save(out/f'three-way-{start//6:02}.jpg',quality=94)
related=json.loads((E/'related-video/report.json').read_text())
assert related['build']=='0b749501e377' and not related['errors'] and related['failure'] is None
history=[{'type':r['type'],'kind':r.get('task',{}).get('kind'),'state':r.get('task',{}).get('state'),'reason':r.get('task',{}).get('reason')}for r in related['tasks']]
summary={'threeVersionActualClock':results,'related':{k:related[k]for k in ['build','errors','failure','wallSeconds','simSeconds','simWallRatio']},'taskHistory':history,'criticalFrameCount':[{'label':a,'count':len(b)}for a,b in allframes],'scope':'New0b normal recordings only; no skin gate rerun, no source change. Exact17 consecutive frames are diagnostic crop, not 1x visual acceptance.'}
(E/'VIDEO-SUMMARY.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
