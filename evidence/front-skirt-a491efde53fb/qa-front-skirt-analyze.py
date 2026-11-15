"""Summarize sparse actual mesh geometry; does not replace watching complete motion."""
import argparse,pathlib,json,gzip,math
p=argparse.ArgumentParser();p.add_argument('directory');args=p.parse_args();out=pathlib.Path(args.directory);reports=[]
def pct(v,p):return sorted(v)[min(len(v)-1,int((len(v)-1)*p))]
for f in sorted(out.glob('*.json.gz')):
 d=json.loads(gzip.decompress(f.read_bytes()));rows=[]
 for a,b in zip(d['geometry'],d['geometry'][1:]):
  if min(a['speed'],b['speed'])<min(float(d['ui']['value'])*.9,1.8):continue
  for va,vb in zip(a['vertices'],b['vertices']):
   x,y=va['normal'],vb['normal'];den=math.sqrt(sum(v*v for v in x)*sum(v*v for v in y));angle=math.degrees(math.acos(max(-1,min(1,sum(i*j for i,j in zip(x,y))/den))))if den else 0
   rows.append({'id':vb['id'],'t':b['t'],'phase':b['jogPhase'],'dt':b['t']-a['t'],'displayStepM':math.dist(va['display'],vb['display']),'sourceStepM':math.dist(va['source'],vb['source']),'normalAngleDegrees':angle,'coverageA':va.get('coverage'),'coverageB':vb.get('coverage'),'bendA':a['garment']['bend'],'bendB':b['garment']['bend']})
 rows.sort(key=lambda r:r['displayStepM'],reverse=True);fr=d['frames'];g=d['geometry'];raf=[x['frameMs']for x in fr if x['frameMs']is not None];sample=[x['sampleMs']for x in g];wall=(fr[-1]['t']-fr[0]['t'])/1000;sim=fr[-1]['sim']-fr[0]['sim']
 reports.append({'file':f.name,'build':d['build'],'ui':d['ui'],'failure':d['failure'],'wallSeconds':wall,'simulationSeconds':sim,'simWallRatio':sim/wall,'rafMs':{'P95':pct(raf,.95),'max':max(raf)},'sampleMs':{'P95':pct(sample,.95),'max':max(sample)},'actualMaxSpeed':max(x['speed']for x in fr),'runMixMovingRange':[min(x['runMix']for x in fr if x['speed']>.1),max(x['runMix']for x in fr if x['speed']>.1)],'maxEdgeStretch':max(x['garment']['maxEdgeStretch']for x in g),'maxPanelCorrection':max(x['garment']['maxPanelCorrection']for x in g),'maxNormalAngle':max(x['normalAngleDegrees']for x in rows),'largest':rows[:20]})
(out/'analysis.json').write_text(json.dumps({'scope':'Sparse front-lower actual position/normal sampling <=60Hz; no full triangle contact proof','reports':reports},indent=2),encoding='utf-8')
for r in reports:print(r['file'],r['largest'][0]['displayStepM'],r['largest'][0]['sourceStepM'],'edge',r['maxEdgeStretch'],'normal',r['maxNormalAngle'])
