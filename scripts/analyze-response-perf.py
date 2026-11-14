import json,math,pathlib,statistics,sys
folder=pathlib.Path(__file__).resolve().parents[1]/'output/playwright/response-perf'/(sys.argv[1]if len(sys.argv)>1 else '6e6a4fc03f64')
d=json.loads((folder/'observations.json').read_text(encoding='utf8'))
def angle(a):return math.atan2(math.sin(a),math.cos(a))
def stat(xs):
 xs=sorted(xs)
 return {'n':len(xs),'mean':statistics.mean(xs),'p50':xs[len(xs)//2],'p95':xs[int(len(xs)*.95)],'p99':xs[int(len(xs)*.99)],'max':max(xs)}if xs else None
response=[]
for trial in d['trials']:
 commands=[e for e in trial['events']if e['kind']=='walk-command']
 for i,cmd in enumerate(commands):
  pointer=next((e for e in reversed(trial['events'])if e['kind']=='pointerup'and e['t']<=cmd['t']),None)
  t0=pointer['t']if pointer else cmd['t'];cut=commands[i+1]['t']if i+1<len(commands)else math.inf
  frames=[f for f in trial['trace']if cmd['t']<=f['t']<cut]
  heading=math.atan2(cmd['x']-cmd['position'][0],cmd['z']-cmd['position'][2]);initialAngle=abs(angle(heading-cmd['yaw']))
  move=next((f for f in frames if math.dist(f['position'],cmd['position'])>.001),None)
  rotate=next((f for f in frames if abs(angle(f['yaw']-cmd['yaw']))>.001),None)
  aligned=next((f for f in frames if abs(angle(heading-f['yaw']))<.03),None)
  target=next((f for f in frames if f['target']and math.dist(f['target'],[cmd['x'],cmd['z']])<.03),None)
  turnFrames=[f for f in frames if f.get('pathTurn')=='turn'];turnEnd=next((f for f in frames if turnFrames and f['t']>turnFrames[0]['t']and f.get('pathTurn')is None),None)
  response.append({'scenario':trial['label'],'repeat':trial.get('repeat'),'command':i,'inputTime':t0,'clicked':[cmd['x'],cmd['z']],'initialAngleDegrees':initialAngle*180/math.pi,'pointerToCommandMs':cmd['t']-t0,'pointerToTargetStateMs':target['t']-t0 if target else None,'pointerToRootMove1mmMs':move['t']-t0 if move else None,'pointerToYawChange0_001radMs':rotate['t']-t0 if rotate else None,'pointerToHeadingWithin0_03radMs':aligned['t']-t0 if aligned else None,'turnTimeMs':aligned['t']-rotate['t']if aligned and rotate else None,'superseded':cut<math.inf,'observedMs':frames[-1]['t']-t0 if frames else 0})
  response[-1]['pointerToTurnStateFinishedMs']=turnEnd['t']-t0 if turnEnd else None
perf=[]
for p in d['perf']:
 if not p['frames']:continue
 frames=p['frames'];fields=['frameInterval','update','simulate','motion','avatarIncludingVrm','vrm','garment','simulationOther','renderSubmit']
 perf.append({k:p[k]for k in ['name','outfit','dynamics','walk']}|{'cpuRate':p.get('cpu',1),'statistics':{key:stat([f.get(key,0)for f in frames if f.get(key)is not None])for key in fields},'framesOver16_67':sum(f.get('frameInterval',0)>16.67 for f in frames if f.get('frameInterval')is not None),'framesOver33_33':sum(f.get('frameInterval',0)>33.33 for f in frames if f.get('frameInterval')is not None),'renderer':p['snapshot']['renderer']})
 perf[-1]['simulateCallsPerFrame']=stat([f.get('simulateCalls',0)for f in frames]);perf[-1]['simulatedSeconds']=sum(f.get('simulatedSeconds',0)for f in frames);perf[-1]['sampleWallMs']=p.get('sampleWallMs');perf[-1]['simulationWallRatio']=perf[-1]['simulatedSeconds']/(p['sampleWallMs']/1000)if p.get('sampleWallMs')else None
summary={'meta':d['meta'],'errors':d['errors'],'responses':response,'performance':perf,'limitations':d['limitations']}
(folder/'summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps({'responses':response,'performance':[{'name':p['name'],'cpuRate':p['cpuRate'],'meanMs':{k:round(v['mean'],3)for k,v in p['statistics'].items()},'frameP99':p['statistics']['frameInterval']['p99'],'frameMax':p['statistics']['frameInterval']['max']}for p in perf]},indent=2,ensure_ascii=False))
