"""Decode every movie frame; .25s scene contact sheets are review aids only."""
from pathlib import Path
import cv2,json,sys
from PIL import Image,ImageDraw
folder=Path(sys.argv[1]);report=json.loads((folder/'report.json').read_text(encoding='utf-8'));review=[]
for case in report['cases']:
    d=folder/case['config']['name'];cap=cv2.VideoCapture(str(d/'greeting-review.webm'));count=0;samples=[];nextt=0;lastt=0
    while True:
        ok,frame=cap.read()
        if not ok:break
        t=cap.get(cv2.CAP_PROP_POS_MSEC)/1000;count+=1;lastt=t
        if t>=nextt:
            image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).crop((30,100,1065,956));image.thumbnail((345,285));samples.append((t,image));nextt+=.25
    cap.release()
    for n in range(0,len(samples),15):
        sheet=Image.new('RGB',(1725,930),'#ffffff');draw=ImageDraw.Draw(sheet)
        for k,(t,image) in enumerate(samples[n:n+15]):
            x=k%5*345;y=k//5*310;draw.text((x+5,y+4),f'{case["config"]["name"]} t={t:.2f}s',fill='black');sheet.paste(image,(x,y+24))
        sheet.save(d/f'full-review-{n//15:02}.jpg',quality=91)
    review.append({'case':case['config']['name'],'checks':len(case['checks']),'allPassed':all(c['passed']for c in case['checks']),'decodedFrames':count,'durationSeconds':lastt,'sampleStep':.25,'sheets':(len(samples)+14)//15,'errors':case['errors']})
(folder/'review-summary.json').write_text(json.dumps(review,indent=2),encoding='utf-8');print(json.dumps(review,indent=2))
