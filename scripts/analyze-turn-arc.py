"""Reconstruct the turn arc from captured actual targets; no browser required.
Usage: python scripts/analyze-turn-arc.py <fps-30.json> <output.json>
This analyzes the same first swing of the walk +/-180 reproduction. It does
not evaluate or replace the product's motion code.
"""
import json, math, sys
from pathlib import Path

data=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
result=[]
wrap=lambda x:math.atan2(math.sin(x),math.cos(x))
for name in ['walk--180deg','walk-180deg']:
    scenario=next(x for x in data['results'] if x['name']==name)
    rows=scenario['rows']; side=1
    start=next(k for k,x in enumerate(rows) if x['turning'] and x['planner']['active'])
    if start==0:raise ValueError('Missing preceding actual swing-from sample')
    origin=rows[start]['position']; previous_raw=rows[start-1]['feet'][side]['raw']
    from_angle=math.atan2(previous_raw[0]-origin[0],previous_raw[2]-origin[2])
    peak=max(range(1,len(rows)),key=lambda j:math.dist(rows[j]['feet'][side]['raw'],rows[j-1]['feet'][side]['raw']))
    pair=[]
    for row in rows[peak-1:peak+1]:
        foot=row['feet'][side]; placement=row['planner']['feet'][side]
        if not placement['swing'] or placement['blend']<=0:raise ValueError('Peak not within the expected first swing; inspect independently')
        theta=math.atan2(foot['target'][0]-origin[0],foot['target'][2]-origin[2])
        arc=wrap(theta-from_angle)/placement['blend']
        pair.append({'t':row['t'],'phase':row['planner']['progress'],'stepId':row['planner']['stepId'],'blend':placement['blend'],'targetAngle':theta,'reconstructedArc':arc,'radius':math.hypot(foot['target'][0]-origin[0],foot['target'][2]-origin[2]),'target':foot['target'],'raw':foot['raw']})
    if pair[0]['stepId']!=pair[1]['stepId']:raise ValueError('Not same phrase')
    result.append({'name':name,'swingStartTime':rows[start]['t'],'swingFromPreviousRaw':previous_raw,'root':origin,'fromAngle':from_angle,'pair':pair,'arcDifference':pair[1]['reconstructedArc']-pair[0]['reconstructedArc'],'rawJump':math.dist(pair[0]['raw'],pair[1]['raw'])})
Path(sys.argv[2]).write_text(json.dumps({'scope':'Inverse calculation from actual fixed-room targets; no new simulation','input':sys.argv[1],'results':result},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'name':x['name'],'arcDifference':x['arcDifference'],'rawJump':x['rawJump']}for x in result],indent=2))
