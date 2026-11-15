"""Offline analysis only; reruns never launch a browser or modify raw capture."""
import json, hashlib, collections
from pathlib import Path
P=Path(__file__).resolve().parent
report=json.loads((P/'report.json').read_text())
d=json.loads((P/'body-switch.cpuprofile').read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((P/'body-switch.cpuprofile').read_bytes())==report['profileSha256']
texts={}
for b in report['bundles']:
 data=(P/b['file']).read_bytes();assert sha(data)==b['sha256'];texts[b['url']]=data.decode()
nodes={n['id']:n for n in d['nodes']}
parents={c:n['id'] for n in d['nodes'] for c in n.get('children',[])}
paths={}
for n in nodes:
 path=[];k=n
 while k is not None:path.append(k);k=parents.get(k)
 paths[n]=path
selfus=collections.Counter();incus=collections.Counter()
for n,t in zip(d['samples'],d['timeDeltas']):
 selfus[n]+=t
 for k in paths[n]:incus[k]+=t
motionurl=next(u for u in texts if '/motion-source-' in u)
mainurl=next(u for u in texts if '/main-' in u)
loaderline=texts[motionurl].splitlines()[4224]
lo=loaderline.index('class ih extends cn');hi=loaderline.index('var Ea=',lo)
assert 'loadAnimation(e)' in loaderline[lo:hi] and 'class wE' in loaderline[lo:hi]
def match(name,url,line,col):
 return {i for i,n in nodes.items() if n['callFrame']['functionName']==name and n['callFrame'].get('url')==url and n['callFrame']['lineNumber']==line and n['callFrame']['columnNumber']==col}
def record(ids):
 return {'nodeIds':sorted(ids),'selfMs':sum(selfus[i] for i in ids)/1000,'inclusiveUnionMs':sum(t for n,t in zip(d['samples'],d['timeDeltas']) if any(i in ids for i in paths[n]))/1000}
groups={
 'createMotion':match('ks',mainurl,87,111930),
 'loadRetargetedMotions_resumed_sync_stack':match('HA',motionurl,5157,65097),
 'danceEntries_async_callback':match('',motionurl,5157,66192),
 'normalized_motion_validation_and_parse':match('BA',motionurl,5157,62676),
 'GLTFLoader_parse_entry_all_assets':match('parse',motionurl,4224,89859),
 'GLTFParser_loadAnimation_entry_all_assets':match('loadAnimation',motionurl,4224,126564),
 'GLTFLoader_class_and_helpers_all_assets':{i for i,n in nodes.items() if n['callFrame'].get('url')==motionurl and n['callFrame']['lineNumber']==4224 and lo<=n['callFrame']['columnNumber']<hi},
 'getProgramInfoLog':{i for i,n in nodes.items() if n['callFrame']['functionName']=='getProgramInfoLog'},
}
envelope=groups['GLTFLoader_class_and_helpers_all_assets']|groups['loadRetargetedMotions_resumed_sync_stack']|groups['danceEntries_async_callback']
groups['loose_observed_source_and_all_GLTF_envelope']=envelope
symbols=[]
for key in ['createMotion','loadRetargetedMotions_resumed_sync_stack','danceEntries_async_callback','normalized_motion_validation_and_parse','GLTFLoader_parse_entry_all_assets','GLTFParser_loadAnimation_entry_all_assets']:
 for i in sorted(groups[key]):
  f=nodes[i]['callFrame'];line=texts[f['url']].splitlines()[f['lineNumber']];col=f['columnNumber']
  symbols.append({'role':key,'id':i,'bundle':Path(f['url']).name,'name':f['functionName'],'line0':f['lineNumber'],'column0':col,'context':line[max(0,col-30):col+200]})
rows=[]
for i in sorted(nodes,key=lambda i:incus[i],reverse=True):
 f=nodes[i]['callFrame'];u=f.get('url','')
 rows.append({'id':i,'selfMs':selfus[i]/1000,'inclusiveMs':incus[i]/1000,'name':f['functionName'],'bundle':Path(u).name if u.startswith('http') else ('<data-url>' if u else ''),'line0':f['lineNumber'],'column0':f['columnNumber']})
out={'build':report['build'],'profileSha256':report['profileSha256'],'bundleHashes':report['bundles'],'profileWallMs':(d['endTime']-d['startTime'])/1000,'sampledMs':sum(d['timeDeltas'])/1000,'commandWallMs':report['commandMs'],'samplingIntervalUs':1000,'groups':{k:record(v) for k,v in groups.items()},'symbolEvidence':symbols,'loaderRange':{'line0':4224,'columnStart':lo,'columnEndExclusive':hi},'limitations':['Inclusive values are unions of sampled synchronous stack ancestry, not async stage wall time.','Sampling extends 900ms after command; render/idle are not restricted to the command.','GLTF parser async callbacks lose originating resource identity; body, outfit and motion are mixed.','Retarget loop is inline in HA; its precise exclusive phase cannot be isolated.','The loose envelope includes uncacheable target validation, retargeting and body/outfit loading; it excludes unlinked native/worker/network work and is not a proven total cache saving bound.'],'allNodeCosts':rows}
(P/'analysis.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'commandMs':out['commandWallMs'],'profileWallMs':out['profileWallMs'],'groups':out['groups']},indent=2))
