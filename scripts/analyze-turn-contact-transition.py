"""Analyze actual same-contact jumps and classify IK clamp intervals.
python scripts/analyze-turn-contact-transition.py <fps.json> <evidence.json>
"""
import json, math, sys
from pathlib import Path
data=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));results=[]
def qangle(a,b):
    return 2*math.acos(min(1,abs(sum(x*y for x,y in zip(a,b))))) if a and b else None
for scenario in data['results']:
    rows=scenario['rows'];best=(0,None,None);blocks=[];active=[[],[]]
    for k,row in enumerate(rows):
        for i,foot in enumerate(row['feet']):
            if foot['reachClamp']:active[i].append({'t':row['t'],'dt':row['dt'],'contact':foot['contact'],'contactPoint':foot['contactPoint'],'turning':row['turning'],'moving':row['moving']})
            elif active[i]:blocks.append({'side':foot['side'],'frames':active[i]});active[i]=[]
            if k:
                old=rows[k-1]['feet'][i];kind=foot['contactPoint']
                if foot['contact'] and old['contact'] and kind==old['contactPoint'] and kind in ['toe','heel']:
                    value=math.dist(foot['soles'][kind],old['soles'][kind])
                    if value>best[0]:best=(value,k,i)
    for i,block in enumerate(active):
        if block:blocks.append({'side':rows[-1]['feet'][i]['side'],'frames':block})
    value,k,i=best
    if k is None:continue
    before=rows[k-1];after=rows[k];a=before['feet'][i];b=after['feet'][i]
    diagnosis={'ankleWorldQuaternionDeltaRadians':qangle(a['worldQuaternion'],b['worldQuaternion']),'normalizedToeLocalDelta':qangle(a['normalizedToeLocalQuaternion'],b['normalizedToeLocalQuaternion']),'rawToeLocalDelta':qangle(a['rawToeLocalQuaternion'],b['rawToeLocalQuaternion']),'normalizedToeWorldQuaternionDeltaRadians':qangle(a['normalizedToeWorldQuaternion'],b['normalizedToeWorldQuaternion']),'rootYawDelta':after['yaw']-before['yaw'],'ankleDelta':math.dist(a['raw'],b['raw']),'anchorDelta':math.dist(a['supportAnchor'],b['supportAnchor']),'rawToeOriginDelta':math.dist(a['rawToeWorld'],b['rawToeWorld']),'sourceSupportActualDelta':math.dist(a['supportActual'],b['supportActual']),'sourceWalkPhaseBefore':before['walkPhase'],'sourceWalkPhaseAfter':after['walkPhase']}
    classified=[{**x,'seconds':sum(f['dt'] for f in x['frames']),'supportFrames':sum(f['contact'] for f in x['frames']),'swingFrames':sum(not f['contact'] for f in x['frames'])}for x in blocks]
    results.append({'name':scenario['name'],'maxContactTravel':value,'side':b['side'],'rotationDiagnosis':diagnosis,'rows':rows[max(0,k-2):k+3],'clampBlocks':classified})
Path(sys.argv[2]).write_text(json.dumps({'scope':'Actual fixed trace analysis, no new simulation','input':sys.argv[1],'results':results},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'name':x['name'],'maxContactTravel':x['maxContactTravel'],'rotationDiagnosis':x['rotationDiagnosis'],'clampBlocks':[{k:v for k,v in b.items() if k!='frames'}for b in x['clampBlocks']]}for x in results],indent=2))
