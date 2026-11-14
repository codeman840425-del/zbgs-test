"""Compact fixed shorts evidence; raw output and previous failures untouched."""
import gzip,hashlib,json,pathlib,shutil,sys
ROOT=pathlib.Path(__file__).resolve().parents[2];build=sys.argv[1]
p=ROOT/'output/playwright/m1b-shorts'/build;r=json.loads((p/'report.json').read_text(encoding='utf8'));out=ROOT/'evidence'/('m1b-shorts-'+build);out.mkdir(parents=True,exist_ok=True)
summary={'build':build,'initialGate':r['initialGate'],'finalGate':r.get('finalGate'),'errors':r['errors'],'uiSelections':[x['outfit']for x in r['selection']],'chairs':[],'limitations':['Actual vertex/local-box contact samples, not swept triangle collision proof','Movie combines accelerated seat probes before ~6s and a normal1x chain thereafter','Camera follows heading in front/side views; not fixed-world turn acceptance','No target-device performance claim'],'visualReview':json.loads((p/'visual-review.json').read_text(encoding='utf8')) if (p/'visual-review.json').exists() else {'status':'pending','note':'Packaging and video decoding do not prove visual review'}}
for c in r['chairs']:
 samples=[f['seat']for f in c['frames']]+[c['seated']]+[f['seat']for f in c['stand']['frames']]+[c['stand']['seat']]
 hits=[(m['role'],n,h['vertices'])for s in samples for m in s['meshes']for n,h in m['collisions'].items()if h['vertices']]
 gaps={role:min(m['minPelvisLocalGap']for m in c['seated']['meshes']if m['role']==role and m.get('minPelvisLocalGap')is not None)for role in ['body','pants']}
 summary['chairs'].append({'name':c['chair']['name'],'sampleCount':len(samples),'timedOut':c['timedOut'],'standCompleted':c['stand']['completed'],'interiorVertexEvents':len(hits),'seatedGapMeters':gaps})
summary['milestones']=[{'label':x['label'],'wallTimeSeconds':x['t']/1000,'mode':x['state']['mode']}for x in r['milestones']]
if r.get('resetRegression'):
 summary['resetFeet']=[{k:f[k]for k in ['side','target','actual','slip','reachClamp']}for f in r['resetRegression']['state']['motion']['feet']]
 summary['peakRunMix']=max(s['state']['motion'].get('runMix',0)for s in r['normalTrace']);summary['peakSpeedMetersPerSecond']=max(s['state']['speed']for s in r['normalTrace'])
decoded=p/'video-decoded.json'
if not decoded.exists():decoded=p/'decoded-video-summary.json'
summary['decodedVideo']=json.loads(decoded.read_text(encoding='utf8'))
(p/'compact-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for name in ['compact-summary.json','shorts-review.webm','selection-2-2.png','reset-regression.png','normal-seated-side.png','shorts-dance-6.png']:
 if (p/name).exists():shutil.copy2(p/name,out/name)
with (out/'report.json.gz').open('wb')as f:
 with gzip.GzipFile(filename='',mode='wb',fileobj=f,mtime=0)as g:g.write((p/'report.json').read_bytes())
files=[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}for f in sorted(out.iterdir())if f.name!='sha256.json']
(out/'sha256.json').write_text(json.dumps({'build':build,'source':'output/playwright/m1b-shorts/'+build,'files':files},indent=2)+'\n',encoding='utf8');print(out)
