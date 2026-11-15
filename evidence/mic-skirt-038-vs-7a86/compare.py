from pathlib import Path
import json,gzip,math,hashlib
E=Path(__file__).resolve().parent
load=lambda p:json.loads(gzip.decompress(p.read_bytes()))
a=load(E/'baseline-normalized/trace.json.gz');b=load(E/'candidate/trace.json.gz')
assert len(a['frames'])==len(b['frames'])
stages={};maxRoot=maxTime=maxPhase=0;previous=None
def record(s,key,value,at):
 if key not in s or value>s[key]['value']:s[key]={'value':value,'at':at}
for x,y in zip(a['frames'],b['frames']):
 assert (x['stage'],x['stageTick'],x['stepIndex'])==(y['stage'],y['stageTick'],y['stepIndex'])
 s=stages.setdefault(y['stage'],{'frames':0});s['frames']+=1;at={'time':y['time'],'stageTick':y['stageTick']}
 maxRoot=max(maxRoot,math.dist(x['root'],y['root']));maxTime=max(maxTime,abs(x['time']-y['time']));maxPhase=max(maxPhase,abs(x['jogPhase']-y['jogPhase']))
 for i,side in enumerate(['left','right']):
  record(s,side+'WristPositionDifferenceMeters',math.dist(x['wrists'][i]['p'],y['wrists'][i]['p']),at)
  if previous:
   ox,oy=previous;oldStep=math.dist(ox['wrists'][i]['p'],x['wrists'][i]['p']);newStep=math.dist(oy['wrists'][i]['p'],y['wrists'][i]['p'])
   record(s,side+'OldMaxStep',oldStep,at);record(s,side+'NewMaxStep',newStep,at);record(s,side+'LargestStepIncrease',newStep-oldStep,at)
 if x['mic'] and y['mic']:
  record(s,'tipPositionDifferenceMeters',math.dist(x['mic']['tip'],y['mic']['tip']),at)
  for key in ['aimDegrees','mouthDistance','gripOriginError','gripAngularError']:
   record(s,key+'Difference',abs(x['mic'][key]-y['mic'][key]),at)
  for tag,row in [('old',x),('new',y)]:
   record(s,tag+'AimDegrees',row['mic']['aimDegrees'],at);record(s,tag+'MouthDistance',row['mic']['mouthDistance'],at)
 record(s,'liveHoldWeightDifference',abs((x['live']['arm']or{}).get('weight',0)-(y['live']['arm']or{}).get('weight',0)),at)
 previous=(x,y)
keyFrames=[]
for name,ticks in [('standing-talk',[1,60,120]),('run-carry',[1,96,240,384]),('stopped-talk',[120]),('unequip-recover',[1,6,12,30,60,120]),('settled-no-mic',[30])]:
 for tick in ticks:
  ix=next(i for i,x in enumerate(a['frames'])if x['stage']==name and x['stageTick']==tick)
  def compact(x):return {k:x[k]for k in ['time','stage','stageTick','mode','action','root','speed','runMix','wrists','preLive','wristBendDegrees','handContacts','mic','live']}
  keyFrames.append({'stage':name,'stageTick':tick,'old':compact(a['frames'][ix]),'new':compact(b['frames'][ix])})
result={'oldBuild':a['build'],'newBuild':b['build'],'steps':len(a['frames']),'timeDifference':maxTime,'rootDifference':maxRoot,'jogPhaseDifference':maxPhase,'stages':stages,'keyFrames':keyFrames,'taskFinalStates':{'old':[(t['task']['requestId'],t['task']['state'])for t in a['tasks']if t['type']=='completed'],'new':[(t['task']['requestId'],t['task']['state'])for t in b['tasks']if t['type']=='completed']},'final':{'old':a['final'],'new':b['final']},'scope':'Final raw wrist/grip/mouth geometry only, no hand-skin/skirt collision assertion. Angular grip errors normalize quaternion operands before angleTo.'}
(E/'comparison.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:result[k]for k in ['oldBuild','newBuild','steps','timeDifference','rootDifference','jogPhaseDifference','stages','taskFinalStates']},indent=2))
