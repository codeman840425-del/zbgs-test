"""Actual captured geometry lower bounds, not a proposed animation correction.
python scripts/analyze-turn-reach.py <fps.json> <evidence.json>
"""
import json, math, sys
from pathlib import Path

data=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));results=[]
for scenario in data['results']:
    best=(0,None,None)
    for k,row in enumerate(scenario['rows']):
        for i,foot in enumerate(row['feet']):
            support=foot['soles'][foot['contactPoint']] if foot['contactPoint'] in ['heel','toe'] else foot['raw']
            error=math.dist(support,foot['supportAnchor']) if foot['contact'] else 0
            if error>best[0]:best=(error,k,i)
    error,k,i=best
    if k is None:continue
    row=scenario['rows'][k];foot=row['feet'][i];bone=row['boneLengths'][i]
    reach=bone['upper']+bone['lower']-.001;hip=foot['normalizedUpperLeg'];target=foot['target']
    horizontal=math.hypot(hip[0]-target[0],hip[2]-target[2]);vertical=hip[1]-target[1]
    drop=max(0,vertical-math.sqrt(reach**2-horizontal**2)) if horizontal<reach else None
    shift=max(0,horizontal-math.sqrt(reach**2-vertical**2)) if abs(vertical)<reach else None
    direction=[(target[0]-hip[0])/horizontal,0,(target[2]-hip[2])/horizontal] if horizontal else [0,0,0]
    vector=[v*shift for v in direction] if shift is not None else None
    average=sum(b['upper']+b['lower'] for b in row['boneLengths'])/2
    legs=[]
    for j,f in enumerate(row['feet']):
        p=f['normalizedUpperLeg'];b=row['boneLengths'][j]
        legs.append({'side':f['side'],'contact':f['contact'],'contactPoint':f['contactPoint'],'reach':b['upper']+b['lower']-.001,'originalDistance':math.dist(p,f['target']),'distanceAfterVerticalOnly':math.dist([p[0],p[1]-drop,p[2]],f['target']) if drop is not None else None,'distanceAfterHorizontalOnly':math.dist([p[t]+vector[t] for t in range(3)],f['target']) if vector else None})
    results.append({'name':scenario['name'],'peakSupportResidual':error,'time':row['t'],'side':foot['side'],'phase':row['walkPhase'],'runMix':row['runMix'],'reach':reach,'distance':math.dist(hip,target),'horizontal':horizontal,'vertical':vertical,'adaptiveHipDrop':row['adaptiveHipDrop'],'legAverage':average,'adaptiveCap':average*.12,'capDifference':row['adaptiveHipDrop']-average*.12,'requiredAdditionalVerticalDrop':drop,'requiredAdditionalHorizontalShift':shift,'calculatedHipShift':vector,'dropWithoutExistingAdaptive':row['adaptiveHipDrop']+drop if drop is not None else None,'twoLegsAtPeak':legs,'upperLegRawMinusNormalized':[foot['rawUpperLeg'][t]-hip[t]for t in range(3)],'row':row})
report={'scope':'Geometric lower bound at peak support residual; not a full-body correction or visual acceptance','input':sys.argv[1],'results':results}
Path(sys.argv[2]).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps([{k:v for k,v in x.items() if k not in ['row','twoLegsAtPeak']} for x in results],indent=2))
