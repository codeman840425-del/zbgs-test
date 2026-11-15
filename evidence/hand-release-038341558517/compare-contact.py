from pathlib import Path
import json,gzip,math,hashlib
E=Path(__file__).resolve().parent;OLD=E.parent/'hand-release-0b749501e377/contact/actual-surfaces.json.gz';NEW=E/'contact/actual-surfaces.json.gz'
load=lambda p:json.loads(gzip.decompress(p.read_bytes()))
a,b=load(OLD),load(NEW)
assert a['build']=='0b749501e377' and b['build']=='038341558517'
assert not a['scenarioFailure'] and not b['scenarioFailure']
assert len(a['timeline'])==len(b['timeline'])==2441
maxima={k:{'value':0,'at':None}for k in ['time','root','jogPhase','actualWristPosition','actualWristQuaternionComponents']}
stageDeltas={};local=[];largestStepIncrease={'millimeters':0};phaseMax=0;previous=None
def record(key,value,at):
 if value>maxima[key]['value']:maxima[key]={'value':value,'at':at}
for x,y in zip(a['timeline'],b['timeline']):
 at={'tick':x['tick'],'oldTime':x['t'],'newTime':y['t'],'oldStage':x['stage'],'newStage':y['stage']}
 record('time',abs(x['t']-y['t']),at);record('root',math.dist(x['root'],y['root']),at);record('jogPhase',abs(x['jogPhase']-y['jogPhase']),at)
 phaseMax=max(phaseMax,abs(x['phase']-y['phase']))
 for p,q in zip(x['wrists'],y['wrists']):
  assert p['side']==q['side']
  record('actualWristPosition',math.dist(p['position'],q['position']),{**at,'side':p['side']})
  record('actualWristQuaternionComponents',max(abs(u-v)for u,v in zip(p['quaternion'],q['quaternion'])),{**at,'side':p['side']})
  stageDeltas[x['stage']]=max(stageDeltas.get(x['stage'],0),math.dist(p['position'],q['position']))
  if previous:
   px,py=previous;oldStep=math.dist(px['wrists'][0 if p['side']=='left' else 1]['position'],p['position']);newStep=math.dist(py['wrists'][0 if p['side']=='left' else 1]['position'],q['position'])
   if (newStep-oldStep)*1000>largestStepIncrease['millimeters']:largestStepIncrease={'millimeters':(newStep-oldStep)*1000,'oldStepMillimeters':oldStep*1000,'newStepMillimeters':newStep*1000,'at':{**at,'side':p['side']}}
 if 1326<=x['tick']<=1330:
  def compact(h):return {k:h.get(k)for k in ['side','authoredWrist','initialTarget','target','actual','garmentProjection','contactReleaseSeed','lapContact','lapAxis','lapUp']}
  local.append({'at':at,'oldContacts':[compact(h)for h in x['handContacts']],'newContacts':[compact(h)for h in y['handContacts']]})
 previous=(x,y)
rows=[]
assert len(a['rows'])==len(b['rows'])==4
for x,y in zip(a['rows'],b['rows']):
 assert x['stage']==y['stage']
 rows.append({'stage':y['stage'],'oldTime':x['t'],'newTime':y['t'],'oldPairs':len(x['hits']),'newPairs':len(y['hits']),'measurementStage':y['measurementStage']})
report=json.loads((E/'contact/report.json').read_text())
result={'baseline':a['build'],'candidate':b['build'],'steps':len(b['timeline']),'maxima':maxima,'actualWristMaxByStage':stageDeltas,'localRiseDifference':local,'fourActualSurfaceGates':rows,'pageErrors':report['errors'],'scenarioFailure':b['scenarioFailure'],'surfaceGatePassed':not report['errors'] and all(r['newPairs']==0 for r in rows),'strictPoseIdentityPassed':all(v['value']==0 for v in maxima.values()),'passed':not report['errors'] and all(v['value']==0 for v in maxima.values()) and all(r['newPairs']==0 for r in rows),'comparisonPolicy':'Compare actual time/root/jogPhase/raw wrist positions and quaternion components only. requested/mode semantic labels at finished frames are not used as equivalence gates. No thresholds relaxed. Strict pose inequality is distinct from the four-surface contact gate. Four actual surfaces after controller/live/equipment; not full continuous or generic garment acceptance.','inputs':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in [OLD,NEW]]}
(E/'contact-comparison.json').write_text(json.dumps(result,indent=2))
result['phaseMaxDifference']=phaseMax;result['largestActualWristStepIncrease']=largestStepIncrease
(E/'contact-comparison.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
assert result['passed'],'Evidence retained: final candidate differs or contact failed'
