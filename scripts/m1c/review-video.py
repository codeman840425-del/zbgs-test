"""Decode the complete recorded timeline, report timestamps and create review sheets.
Source videos remain untouched. This is review aid, not replacement for the movies.
"""
import cv2,pathlib,json,sys
from PIL import Image,ImageDraw
folder=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'output/playwright/m1c-live/1791ba8f0563');reports=[]
for movie in folder.glob('*.webm'):
 cap=cv2.VideoCapture(str(movie));samples=[];count=0;nextTime=0;last=0;gaps=[]
 while True:
  ok,frame=cap.read()
  if not ok:break
  t=cap.get(cv2.CAP_PROP_POS_MSEC)/1000
  if count:gaps.append(t-last)
  last=t;count+=1
  if t>=nextTime:
   image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));image.thumbnail((640,480));samples.append((t,image));nextTime+=.25
 cap.release()
 for n in range(0,len(samples),8):
  canvas=Image.new('RGB',(1280,4*505),'#ffffff');draw=ImageDraw.Draw(canvas)
  for i,(t,image)in enumerate(samples[n:n+8]):
   x=i%2*640;y=i//2*505;canvas.paste(image,(x,y+25));draw.text((x+8,y+6),f'{movie.stem} video t={t:.3f}s',fill='black')
  canvas.save(folder/f'{movie.stem}-timeline-{n//8:02d}.jpg',quality=93)
 reports.append({'movie':movie.name,'decodedFrames':count,'lastFrameSeconds':last,'maxTimestampGap':max(gaps)if gaps else None,'reviewIntervalSeconds':.25,'sheets':(len(samples)+7)//8})
(folder/'decoded-video-summary.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf8');print(json.dumps(reports,indent=2))
