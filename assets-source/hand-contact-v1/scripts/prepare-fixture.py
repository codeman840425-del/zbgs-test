"""Small source/real-pose fixture. Does not run a browser or touch runtime."""
from pathlib import Path
import importlib.util,json,hashlib,numpy as np
R=Path(__file__).resolve().parents[3];O=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source',R/'scripts/m1-assets/build-forearm-collision-profile.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
s=g.load('female');assert s['sha']=='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
groups={};selected_faces=set()
for side in ['left','right']:
 names=['palm','thumb','index','middle','ring','little'];scores=[]
 for name in names:
  semantics=[side+'Hand'] if name=='palm' else [side+name.title()+suffix for suffix in ['Metacarpal','Proximal','Intermediate','Distal']]
  joints=[s['skin']['joints'].index(s['humanoid'][n])for n in semantics if n in s['humanoid']]
  scores.append(np.where(np.isin(s['j'],joints),s['w'],0).sum(axis=1))
 scores=np.array(scores).T;total=scores.sum(axis=1);faces=np.flatnonzero(total[s['tri']].mean(axis=1)>=.25);selected_faces.update(faces.tolist());ids=np.unique(s['tri'][faces]);labels=scores.argmax(axis=1)
 for i,name in enumerate(names):groups[side+':'+name]=ids[labels[ids]==i].tolist()
capture=R/'output/playwright/forearm-175a487d5ea3/authored.json';c=json.loads(capture.read_text(encoding='utf8'));assert c['identity']['runtimeBuild']['shortId']=='175a487d5ea3'
idmap={v:i for i,v in enumerate(c['fixture']['bodySourceIds'])};missing=sorted(set(sum(groups.values(),[]))-idmap.keys())
if missing:raise RuntimeError('Real-pose fixture lacks selected hand vertices: '+str(missing[:20]))
indices=[0,59,76,119,179,184,187,190,193,196,199,209,239,269]
poses=[]
for i in indices:
 f=c['frames'][i];poses.append({'frame':f['frame'],'sitProgress':f['sitProgress'],'groups':{name:[{'index':j,'world':f['body'][idmap[j]]}for j in ids]for name,ids in groups.items()}})
known=R/'output/playwright/m1/175a487d5ea3/variant-seat-arms-1794702194076/beta-base-female-m1.json';a=json.loads(known.read_text(encoding='utf8'));hits=[h for row in a['rows']for h in row['hits']];hitfaces=sorted({h['skinFace']for h in hits});unselected=sorted(set(hitfaces)-selected_faces)
report={'sourceSHA256':s['sha'],'source':'prototype/public/assets/foundation/base-female-roundtrip.vrm','selectionRule':'actual skin faces average semantic Hand/finger weight >=.25; group each vertex by largest per-finger/palm weight','groups':{k:len(v)for k,v in groups.items()},'selectedFaceCount':len(selected_faces),'knownIntersectionSource':str(known.relative_to(R)),'knownHitFrames':sum(bool(x['hits'])for x in a['rows']),'knownHitFaceCount':len(hitfaces),'knownHitFacesNotSelected':unselected,'actualPoseSource':str(capture.relative_to(R)),'actualPoseSourceSHA256':hashlib.sha256(capture.read_bytes()).hexdigest(),'actualPoseCount':len(poses),'limits':['Selected source faces include known failing hands; this does not prove contour intersection coverage or correction success.','14 real captured source-preserving poses from a separate 270frame trajectory; not the exact100sample failure trajectory.','Actual final post-IK skin/cloth triangle gate and normal playback/cost remain pending.']}
(O/'evidence').mkdir(exist_ok=True);(O/'evidence/source-selection.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');(O/'evidence/actual-pose-fixture.json').write_text(json.dumps({'report':report,'poses':poses},separators=(',',':')),encoding='utf8');print(json.dumps(report,indent=2))
