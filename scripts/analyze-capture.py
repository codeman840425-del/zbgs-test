"""Measure recorded frame intervals separately from application rAF intervals."""
import argparse,json,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',default='ffmpeg');p.add_argument('--finalize',action='store_true');p.add_argument('--folder',default='output/playwright/canvas-walk');args=p.parse_args()
root=Path(__file__).resolve().parents[1];folder=root/args.folder
report=json.loads((folder/'report.json').read_text(encoding='utf-8'))
def stats(values):
 s=sorted(values)
 return {'samples':len(s),'p99Ms':s[int(len(s)*.99)],'maxMs':s[-1],
         'over33_4ms':sum(x>33.4 for x in s),'over50ms':sum(x>50 for x in s)}
results=[]
for clip in report['reports']:
 if args.finalize:
  src=folder/(clip['name']+'.webm');raw=folder/(clip['name']+'.capture.webm')
  if not raw.exists(): src.rename(raw)
  # Stream copy only: add duration/seek metadata, preserve original capture.
  subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-i',str(raw),'-c','copy','-y',str(src)],check=True)
 proc=subprocess.run([args.ffmpeg,'-hide_banner','-i',str(folder/(clip['name']+'.webm')),'-vf','showinfo','-an','-f','null','-'],capture_output=True,text=True,encoding='utf-8',errors='replace',check=True)
 times=[float(t) for t in re.findall(r'pts_time:([0-9.]+)',proc.stderr)]
 results.append({'name':clip['name'],'build':clip['build']['shortId'],'raf':stats(clip['frames']),
   'encodedFrames':len(times),'encodedIntervals':stats([(b-a)*1000 for a,b in zip(times,times[1:])]),
   'duration':times[-1]-times[0]})
(folder/'timing-summary.json').write_text(json.dumps({'results':results,'note':'No interpolation. Encoded gaps include capture/encoder effects; rAF intervals are measured separately, not GPU time.'},indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
