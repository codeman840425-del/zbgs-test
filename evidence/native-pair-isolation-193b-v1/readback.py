from pathlib import Path
import hashlib,json,math
p=Path(__file__).resolve().parent
read=lambda f:json.loads(f.read_text(encoding='utf8'))
r=read(p/'rerun-v2/report.json');s=read(p/'rerun-v2/samples.json')
finite=lambda a:all(math.isfinite(v) for b in a['bones'].values() for v in b['p']+b['q'])
checks={
 'fixedExpectedBuild':r['build']=='193bbbf64323',
 'sourceVRMHashesExact':r['load']['hashes']=={'female':'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef','male':'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'},
 'noSharedActualResources':all(v==0 for v in r['load']['shared'].values()) and all(r['load']['counts']['textures'][k]>0 for k in ['a','b']),
 'pausedMutationsIndependent':r['pausedIsolation']['aUnchanged'] and r['pausedIsolation']['bUnchanged'],
 'finiteSampledBones':all(finite(x['a']) and (not x['b'] or finite(x['b'])) for x in s),
 'allSampledRate1':all(x['rate']==1 for x in s),
 'bodyMapsNotShared':all(not x['b'] or not ({m['map'] for m in x['a']['maps']} & {m['map'] for m in x['b']['maps']}) for x in s),
 'secondSeatRejected':r['seatConflict']['b']['task']['reason']=='seat-unavailable',
 'femaleReachedSitAtCheckpoint':any(x['a']['action']=='sit' and x['a']['sitProgress']==1 for x in r['checkpoints']),
 'peerDisposeLeavesAExact':r['disposal']['before']==r['disposal']['after'] and not r['disposal']['mainDisposes'],
 'continuesAfterPeerDispose':any(x['b'] is None and x['a']['action']=='stand' for x in s) and any(x['b'] is None and x['a']['action']=='walk' for x in s) and s[-1]['a']['action']=='idle',
 'noBrowserErrors':not r['errors'],'noPrimaryResourceDisposes':not r['mainDisposes'],
 'resourcesReleased':all(r['resourcesReleased'].values()),
}
assert all(checks.values()),checks
pair=[x for x in s if x['b']]
report={'status':'representative-isolation-observed-suite-tail-assertion-failed','checks':checks,'rawSuiteStatus':r['status'],'rawSuiteError':r['error'],
 'rawReportSHA':hashlib.sha256((p/'rerun-v2/report.json').read_bytes()).hexdigest(),'samplesSHA':hashlib.sha256((p/'rerun-v2/samples.json').read_bytes()).hexdigest(),
 'samples':len(s),'pairSamples':len(pair),'resourceCounts':r['load']['counts'],'observedSeconds':r['recording']['milliseconds']/1000,
 'developmentMachineOnlyFrameMs':{'pairLastRolling':pair[-1]['frameMs'],'singleAfterDispose':s[-1]['frameMs']},
 'limits':['Raw failures preserved; final dance assertion failed after chosen walk destination. No third recording or location sweep.',
 'First near-chair dance request explicitly rejected as insufficient-dance-space. Second dance task reason not captured, so no claim of identical cause.',
 'Six representative normalized bones sampled; no full contact/self-collision or face quality acceptance.',
 'Separate actors have no actor-actor avoidance claim; one chair reservation conflict only.',
 'Frame timings from this development-machine browser; no ordinary-PC acceptance.']}
(p/'readback-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'status':report['status'],'checks':checks,'pairSamples':len(pair),'frames':report['developmentMachineOnlyFrameMs']}))
