"""Analyze recorded rAF/actual raw-foot traces; never equate smooth timing to smooth poses."""
import json, math, statistics, sys
from pathlib import Path

source=Path(sys.argv[1])
data=json.loads(source.read_text(encoding='utf-8'))
reports=[]
for run in data['reports']:
    samples=run['samples']; intervals=sorted(run['frames']); steps=[]; phase_errors=[]
    for index,(a,b) in enumerate(zip(samples,samples[1:]),1):
        if min(a['gait'],b['gait'])<.99: continue
        dt=(b['t']-a['t'])/1000
        if dt<=0: continue
        for side in (0,1):
            displacement=math.dist(a['feet'][side]['raw'],b['feet'][side]['raw'])
            steps.append({'sample':index,'side':side,'stepMeters':displacement,'speedMetersPerSecond':displacement/dt,
                'frameMs':dt*1000,'phase':b['phase'],'supportChanged':a['feet'][side]['contact']!=b['feet'][side]['contact'],
                'hipStepMeters':math.dist(a['hip'],b['hip'])})
        phase_delta=(b['phase']-a['phase'])%1
        expected=(b['distance']-a['distance'])/run['snapshot']['motion']['stride']
        phase_errors.append(abs(phase_delta-expected))
    worst=sorted(steps,key=lambda s:s['speedMetersPerSecond'],reverse=True)[:8]
    switches=[s for s in steps if s['supportChanged']]
    teleports=[s for s in steps if s['frameMs']<=20 and s['stepMeters']>.1]
    reports.append({'name':run['name'],'build':run['build']['shortId'],'samples':len(samples),
        'frameMs':{'p50':statistics.median(intervals),'p95':intervals[int(.95*len(intervals))],'max':max(intervals),'over50':sum(v>50 for v in intervals)},
        'cycles':sum(max(0,b['distance']-a['distance'])/run['snapshot']['motion']['stride'] for a,b in zip(samples,samples[1:])),
        'cycleMethod':'positive traveled gait distance / stride; excludes artificial modulo cycle at blend-in phase alignment',
        'maxPhaseDistanceError':max(phase_errors,default=0),'worst':worst,
        'supportTransitions':len(switches),'maxTransitionStepMeters':max((s['stepMeters'] for s in switches),default=0),
        'teleportCount':len(teleports),'largeTeleportGatePassed':not teleports,
        'limitation':'100mm within <=20ms is a large-jump regression gate, not a visual smoothness or sole-sliding certification.'})
out=source.with_name('continuity-summary.json');out.write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
print(json.dumps([{k:r[k] for k in ['name','build','cycles','frameMs','maxTransitionStepMeters','teleportCount']} for r in reports],indent=2))
if any(r['teleportCount'] for r in reports) and '--allow-failure' not in sys.argv: sys.exit(1)
