"""Offline actual WebAudio recording/clock review. No browser or device playback."""
from pathlib import Path
import av, cv2, json, statistics, sys
import numpy as np
from PIL import Image, ImageDraw

folder=Path(sys.argv[1]);report=json.loads((folder/'report.json').read_text(encoding='utf-8'))
samples=report['data']['samples'];versions=[]
for version in sorted({s['version'] for s in samples if s['sourceActive']}):
    group=[s for s in samples if s['version']==version and s['sourceActive']]
    drift=[s['observed']['driftSeconds'] for s in group]
    versions.append({'version':version,'samples':len(group),'minDriftSeconds':min(drift),
        'medianDriftSeconds':statistics.median(drift),'maxDriftSeconds':max(drift),
        'firstContextTime':group[0]['contextTime'],'firstDanceClock':group[0]['dance']['time']})
zero=[s for s in samples if s['sourceActive'] and s['version']==1 and s['contextTime']==0]
audio=av.open(str(folder/'internal-graph-audio.webm'));blocks=[];rate=None
for frame in audio.decode(audio=0):
    data=frame.to_ndarray().astype(np.float64);rate=frame.sample_rate
    # Opus decoder yields planar normalized floats; reject silent integer assumptions.
    assert frame.format.name in ['fltp','flt'], frame.format.name
    blocks.append(data.mean(axis=0))
audio.close();pcm=np.concatenate(blocks)
window=round(rate*.01);rms=[float(np.sqrt(np.mean(pcm[i:i+window]**2)))for i in range(0,len(pcm),window)]
bursts=[];active=False
for i,value in enumerate(rms+[0]):
    if value>.002 and not active:start=i*.01;active=True
    if value<=.002 and active:bursts.append({'startSeconds':start,'endSeconds':i*.01});active=False
cap=cv2.VideoCapture(str(folder/'playback-review.webm'));frames=0;last=0;next_time=0;images=[]
while True:
    ok,frame=cap.read()
    if not ok:break
    frames+=1;last=cap.get(cv2.CAP_PROP_POS_MSEC)/1000
    if last>=next_time:
        image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));image.thumbnail((360,275));images.append((last,image));next_time+=.5
cap.release()
for offset in range(0,len(images),12):
    sheet=Image.new('RGB',(1440,900),'white');draw=ImageDraw.Draw(sheet)
    for i,(time,image) in enumerate(images[offset:offset+12]):
        x=i%4*360;y=i//4*300;draw.text((x+5,y+3),f'{time:.2f}s',fill='black');sheet.paste(image,(x,y+22))
    sheet.save(folder/f'playback-timeline-{offset//12:02}.jpg',quality=90)
result={'build':report['initialGate']['runtimeBuild']['shortId'],'transportVersions':versions,
    'startupZeroClockSamples':len(zero),'startupZeroClockObservedSpanMs':zero[-1]['wallMs']-zero[0]['wallMs'] if zero else 0,
    'audioDecoded':{'samples':len(pcm),'sampleRate':rate,'durationSeconds':len(pcm)/rate,'peak':float(np.abs(pcm).max()),'rms':float(np.sqrt(np.mean(pcm**2))),'nonSilentBursts10msThreshold002':bursts},
    'movieDecoded':{'frames':frames,'durationSeconds':last,'sampleStepSeconds':.5,'sheets':(len(images)+11)//12},
    'limitations':['Decoded internal graph signal, not speaker recording or listening','Clock drift is independently clocked source-position estimate, not acoustic latency','RMS burst onset bin size 10ms; recorder timeline not calibrated to video timeline']}
(folder/'offline-review.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
