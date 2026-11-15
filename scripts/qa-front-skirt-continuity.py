"""Exact old drape branch on captured inputs; continuous-input boundary diagnostic, not a solver fix."""
import json,math,pathlib
P=pathlib.Path('evidence/front-skirt-f7bdc3be3de4-coverage-full')
def add(a,b):return [x+y for x,y in zip(a,b)]
def sub(a,b):return [x-y for x,y in zip(a,b)]
def mul(a,k):return[x*k for x in a]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def norm(a):return math.sqrt(dot(a,a))
def unit(a):return mul(a,1/norm(a)) if norm(a) else [0,0,0]
def lerp(a,b,t):return add(a,mul(sub(b,a),t))
def interpolate(a,b,t):return {'p':lerp(a['p'],b['p'],t),'drape':a['drape']+(b['drape']-a['drape'])*t,'legs':[{'a':lerp(x['a'],y['a'],t),'b':lerp(x['b'],y['b'],t),'radius':x['radius']}for x,y in zip(a['legs'],b['legs'])]}
def evaluate(q,anatomical=False):
 p=q['p'];surfaces=[];details=[];across=sub(q['legs'][1]['a'],q['legs'][0]['a'])
 for leg in q['legs']:
  axis=sub(leg['b'],leg['a']);axis2=dot(axis,axis)
  h=unit(sub(across,mul(axis,dot(across,axis)/axis2))) if anatomical else unit([axis[2],0,-axis[0]])
  t=max(0,min(1,dot(sub(p,leg['a']),axis)/axis2));near=add(leg['a'],mul(axis,t));lat=abs(dot(sub(p,near),h));radius=leg['radius'];margin=radius*1.1-lat
  sy=near[1]+math.sqrt(max(0,radius*radius-lat*lat))+.004
  if margin>0:surfaces.append(sy)
  details.append({'margin':margin,'lateral':lat,'horizontal':h,'horizontalLength':math.hypot(axis[0],axis[2]),'nearY':near[1],'surfaceIfEligible':sy})
 surface=max(surfaces) if surfaces else None
 return {'y':p[1]+(surface-p[1])*q['drape'] if surface is not None else p[1],'beforeY':p[1],'surface':surface,'drape':q['drape'],'legs':details}
def run():
 d=json.loads((P/'predicate-input.json').read_text());events=[]
 for i,(a,b)in enumerate(zip(d['rows'],d['rows'][1:])):
  ea,eb=evaluate(a),evaluate(b)
  for k in range(2):
   if (ea['legs'][k]['margin']>0)==(eb['legs'][k]['margin']>0):continue
   lo,hi=0.,1.
   for _ in range(60):
    mid=(lo+hi)/2;em=evaluate(interpolate(a,b,mid))
    if (em['legs'][k]['margin']>0)==(ea['legs'][k]['margin']>0):lo=mid
    else:hi=mid
   t=(lo+hi)/2;qa,qb=interpolate(a,b,t-1e-8),interpolate(a,b,t+1e-8);x,y=evaluate(qa),evaluate(qb)
   inputDelta=max(norm(sub(qa['p'],qb['p'])),*[norm(sub(qa['legs'][j][n],qb['legs'][j][n]))for j in range(2)for n in ['a','b']])
   events.append({'frameIndex':i,'times':[a['t'],b['t']],'phases':[a['phase'],b['phase']],'leg':k,'t':t,'maxContinuousInputDeltaM':inputDelta,'branchJumpM':abs(y['y']-x['y']),'before':x,'after':y,'anatomicalBefore':evaluate(qa,True),'anatomicalAfter':evaluate(qb,True),'endpointY':[ea['y'],eb['y']]})
 events.sort(key=lambda e:e['branchJumpM'],reverse=True)
 result={'identity':d['identity'],'definition':'Linearly interpolate captured guide position, thigh endpoints and drape. Bisection finds exact coverage boundary. Evaluate same continuous input family +/-1e-8 interpolation units. Preserves actual radii and original predicate; no runtime edits. This isolates pre-collision drape operator, not full final mesh. Anatomical projection is diagnostic only.','events':events}
 (P/'predicate-continuity.json').write_text(json.dumps(result,indent=2));print(json.dumps(events[:1],indent=2))
if __name__=='__main__':run()
