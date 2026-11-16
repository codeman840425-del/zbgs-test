"""Read-only review of A live logs; phase marker can precede the actual UI event."""
from pathlib import Path
import json,hashlib,sys
p=Path(sys.argv[1]);out=Path(sys.argv[2]);assert not out.exists()
load=lambda f:json.loads(f.read_text(encoding='utf-8'))
r=load(p/'report.json');rows=[]
for c in r['cases']:
 f=p/c['trace'];t=load(f);xs=t['rows'];aa=[x['aa'] for x in xs if x['phase']=='mouth-A']
 assert aa and abs(max(aa)-.65)<1e-6
 assert t['sameDocument'] and t['sameActor'] and t['finalRecipe']==t['recipe']
 assert all(not x['paused'] and x['visibility']=='visible' and x['focus'] and x['blinkCompatibility'] for x in xs)
 assert abs((xs[-1]['sim']-xs[0]['sim'])-c['simulationSeconds'])<1e-12
 video=p/c['video'];assert hashlib.sha256(video.read_bytes()).hexdigest()==c['videoSha256']
 rows.append({'id':c['id'],'wallSeconds':c['wallSeconds'],'simulationSeconds':c['simulationSeconds'],'ratio':c['simulationWallRatio'],'frames':len(xs),'blinkMax':max(x['blink'] for x in xs),'aaMouthPhaseMinMax':[min(aa),max(aa)],'happyMax':max(x['happy'] for x in xs),'video':str(video),'videoSHA256':c['videoSha256'],'traceSHA256':hashlib.sha256(f.read_bytes()).hexdigest()})
out.write_text(json.dumps({'build':r['build'],'source':str(p),'errors':r['errors'],'rows':rows,'limits':'Stored visible/focused playback logs; phase start precedes UI application so aa min may be0. Not continuous video viewing, target performance, or greeting-completion proof.'},indent=2),encoding='utf-8')
print('Reviewed',len(rows),'actual videos and logs')
