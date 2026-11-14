import json, math, pathlib, statistics
root=pathlib.Path(__file__).resolve().parents[1]
folder=root/'output/playwright/gait-trace'
def sub(a,b):return [x-y for x,y in zip(a,b)]
def length(a):return math.sqrt(sum(v*v for v in a))
report=[]
for file in sorted(folder.glob('*.json')):
 if file.name=='summary.json':continue
 data=json.loads(file.read_text(encoding='utf8'));r=data['records'];worst=None;changes=[];hip=[];phaseError=[]
 for prev,cur in zip(r,r[1:]):
  phaseError.append(abs(((cur['phase']-prev['phase'])%1)-cur['metrics']['phaseDelta']))
  hip.append(length(sub(cur['metrics']['hipCorrection'],prev['metrics']['hipCorrection'])))
  for i,side in enumerate(['left','right']):
   residual=sub(cur['corrected'][side]['points'][2],cur['raw'][side]['points'][2]);old=sub(prev['corrected'][side]['points'][2],prev['raw'][side]['points'][2])
   change=length(sub(residual,old));changes.append(change)
   if worst is None or change>worst['metres']:
    worst={'metres':change,'side':side,'phase':cur['phase'],'previousPhase':prev['phase'],'frameMs':cur['frameMs'],'contactBefore':prev['metrics']['feet'][i]['contact'],'contactAfter':cur['metrics']['feet'][i]['contact'],'kindBefore':prev['metrics']['feet'][i].get('contactPoint'),'kindAfter':cur['metrics']['feet'][i].get('contactPoint'),'footBefore':prev['metrics']['feet'][i],'footAfter':cur['metrics']['feet'][i]}
 timings=sorted(x['frameMs']for x in r)
 contacts=[(x['metrics']['feet'][i],x.get('shoes',{}).get(side),x['metrics'].get('supportSurfaceDelta',[0,0,0]))for x in r[1:]for i,side in enumerate(['left','right'])if x['metrics']['feet'][i]['contact']]
 stableShoeSteps=[]
 for previous,current in zip(r,r[1:]):
  for i,side in enumerate(['left','right']):
   a=previous['metrics']['feet'][i];b=current['metrics']['feet'][i];s=current.get('shoes',{}).get(side)
   if s and a['contact'] and b['contact'] and a['contactPoint']==b['contactPoint']:
    surface=current['metrics'].get('supportSurfaceDelta',[0,0,0]);stableShoeSteps.append(math.hypot(s['delta'][0]-surface[0],s['delta'][2]-surface[2]))
 shoe=[(s,surface)for f,s,surface in contacts if s]
 report.append({'scenario':file.stem,'frames':len(r),'stride':data['stride'],'frameMs':{'mean':statistics.mean(timings),'p99':timings[int(len(timings)*.99)],'max':max(timings),'over16_67':sum(t>16.67 for t in timings),'over33_33':sum(t>33.33 for t in timings)},'maxPhaseError':max(phaseError),'maxHipCorrectionStep':max(hip),'worstFootCorrectionStep':worst,'p99FootCorrectionStep':sorted(changes)[int(len(changes)*.99)],'contactFraction':len(contacts)/(2*(len(r)-1)),'maxPatchSlip':max((f['slip']for f,s,surface in contacts),default=0),'maxPatchTravel':max((f['contactTravel']for f,s,surface in contacts),default=0),'actualShoe':{'minY':min((s['y']for s,surface in shoe),default=None),'maxY':max((s['y']for s,surface in shoe),default=None),'maxHorizontalVertexStep':max((math.hypot(s['delta'][0]-surface[0],s['delta'][2]-surface[2])for s,surface in shoe),default=None)}})
 report[-1]['actualShoe']['maxContinuousSupportVertexStep']=max(stableShoeSteps,default=None)
(folder/'summary.json').write_text(json.dumps(report,indent=2),encoding='utf8')
for x in report:print(json.dumps({**x,'worstFootCorrectionStep':{k:v for k,v in x['worstFootCorrectionStep'].items()if k not in ['footBefore','footAfter']}}))
