"""Recompute compact 269 integrated report from immutable archived JSON/video bytes."""
import pathlib,json,gzip,math,collections,subprocess,re
import imageio_ffmpeg
import argparse
parser=argparse.ArgumentParser();parser.add_argument("--video-dir",default="video");parser.add_argument("--summary",default="summary.json");args=parser.parse_args()
R=pathlib.Path(__file__).resolve().parents[1]/'evidence/hand-joint-269a73423c97'
def read(p):
 p=R/p
 return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_text(encoding='utf-8'))
def stats(a):
 a=sorted(a);n=len(a)
 return dict(n=n,mean=sum(a)/n,p50=a[math.ceil(n*.5)-1],p95=a[math.ceil(n*.95)-1],p99=a[math.ceil(n*.99)-1],max=a[-1],over16_667=sum(x>1000/60 for x in a),over33_333=sum(x>1000/30 for x in a))
out=dict(build='269a73423c97',videos={},cost={},geometry={})
for mode in ['legacy','actual']:
 d=read(f'{args.video_dir}/{mode}.json.gz');f=d['frames'];a=[x for x in f if x['t']>=1000]
 assert d['identity']['runtimeBuild']['shortId']==out['build']==d['finalIdentity']['runtimeBuild']['shortId']
 wall=(a[-1]['t']-a[0]['t'])/1000;sim=a[-1]['simulatedSeconds']-a[0]['simulatedSeconds']
 probe=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(R/f'{args.video_dir}/{mode}.webm'),'-map','0:v:0','-c','copy','-f','null','-','-progress','pipe:1','-nostats'],capture_output=True,text=True,check=True)
 ends=re.findall(r'out_time_us=(\d+)',probe.stdout);framecounts=re.findall(r'frame=(\d+)',probe.stdout)
 out['videos'][mode]=dict(rawFrames=len(f),rawFirst=[{k:x[k] for k in ['t','frameMs','simulatedSeconds']} for x in f[:3]],encodedLastPacketEndSeconds=int(ends[-1])/1e6,encodedFrames=int(framecounts[-1]),ongoingAfter1000Ms=dict(startMs=a[0]['t'],endMs=a[-1]['t'],wallSeconds=wall,simulatedSeconds=sim,simWallRatio=sim/wall,frameMs=stats([x['frameMs'] for x in a if x['frameMs'] is not None])),cameraConstant=len({json.dumps(x['camera'],sort_keys=True)for x in f})==1,camera=f[0]['camera'],playbackRates=sorted(set(x['playbackRate']for x in f)),events=d['events'],errors=d['errors'])
 for phase,v in read(f'cost/{mode}/summary.json')['reports'][0]['phases'].items():
  out['cost'].setdefault(mode,{})[phase]={k:v[k] for k in ['frameMs','steps','simulateMs','fitLastStepMs','fitAllStepsMs','renderSubmitMs','sampleMs']}
 p=f'functional/hand-surface-{mode}-'+('1794706924640/report.json' if mode=='actual' else '1794706973140/report.json.gz')
 d=read(p);out['geometry'][mode]={x['id']:x['regions'] for x in d['reports']}
d=read('functional/joint-live-surface-actual-1794707153400/beta-base-female-m1.json.gz')
out['postLive']=dict(samples=len(d['rows']),stages=dict(collections.Counter(x['stage']for x in d['rows'])),measurementStages=sorted(set(x['measurementStage']for x in d['rows'])),maxHits=d['maxHits'])
p=read('cost/profile/summary.json')['reports'][0]['phases']['seated'];out['profileSeated']=dict(meanSteps=p['steps']['mean'],internal=p['internal'])
out['limits']=['Single serial short cost run per condition on RTX4090 developer machine; not ordinary target PC acceptance.','Cost dynamics off; normal videos dynamics on; do not compare them as same load.','First rAF timestamp predates recorder setup; raw retained. Ongoing window begins at t>=1000ms.','4fps complete-duration sheets are sampled engineering review, not complete real-time visual acceptance.','Actual skin gate finite noncoplanar triangle/edge intersections with alpha samples at30Hz, not CCD or solid/GPU proof.','Original video report isolated label was inherited from QA; initial/final269 identity proves integrated build.','No new269 source-pose270 equivalence run; earlier isolated evidence is not relabelled.']
(R/args.summary).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'videos':out['videos'],'postLive':out['postLive']},indent=2))
