import json,pathlib,hashlib
root=pathlib.Path('evidence/face-normal-reserve-gpu-v1'); result={'scope':'Offline postcheck only, no browser rerun. Both original failed reports/executed scripts preserved. Camera world coordinates adapt to body; inspection.asset must change identity. Only invariant user settings compared.','runs':[]}
for name,dist in [('body-switch-baseline-a7','experiments/face-neighborhood-source/prototype/dist'),('body-switch-reserve-4f','experiments/face-normal-reserve-measure-source/dist')]:
 d=root/name; raw=json.loads((d/'raw.json').read_text(encoding='utf-8')); report=json.loads((d/'report.json').read_text(encoding='utf-8')); initial=raw['snapshots'][0]; checks=[]
 for row in report['switches']:
  s=row['snapshots'][-1]
  tests={'sameDocument':s['sameDocument'],'paused':s['state']['paused'],'visibleFocus':s['visibility']=='visible' and s['focus'],'framesVisibleFocus':row['allFramesNativeVisibleFocused'],'trustedUI':row['request']['trusted']}
  for k in ['outfit','simulationTime','position']:tests[k]=s['state'][k]==initial['state'][k]
  tests['cameraMode']=s['state']['camera']['mode']==initial['state']['camera']['mode']
  for k in ['corrections','bodyMode','dynamics','flags']:tests['inspection.'+k]=s['state']['inspection'][k]==initial['state']['inspection'][k]
  for k in ['hairStyle','hairColor','skinTone','eyeColor','lipColor']:tests[k]=s['appearance'].get(k)==initial['appearance'].get(k)
  checks.append({'body':s['body'],'checks':tests,'allPass':all(tests.values())})
 summary=[]
 for row in report['switches']:
  summary.append({k:row[k] for k in ['requestToCommitObservedMs','commitInterval','requestToUiSettledMs','requestToFirstDrawEndMs','frames','renders','gl','longtasks'] }|{'body':row['request']['body'],'firstDrawMs':row['firstDraw']['end']-row['firstDraw']['start'],'resources':[{'body':s['body'],'memory':s['memory'],'programCount':len(s['programs']),'usedTimes':sum(p['usedTimes'] for p in s['programs'])} for s in row['snapshots']]})
 files=[{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size} for f in pathlib.Path(dist,'assets').glob('*.js')]
 result['runs'].append({'name':name,'build':report['build'],'originalStatus':report['status'],'originalError':report['error'].split('\n')[0],'pageErrors':report['errors'],'postchecks':checks,'switches':summary,'bundleIdentity':files,'evidenceHashes':{f:hashlib.sha256((d/f).read_bytes()).hexdigest() for f in ['report.json','raw.json','executed-script.cjs']}})
(root/'body-switch-comparison.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps([{'name':r['name'],'checks':[c['allPass'] for c in r['postchecks']],'switches':[{'body':s['body'],'commit':s['requestToCommitObservedMs'],'ui':s['requestToUiSettledMs'],'firstEnd':s['requestToFirstDrawEndMs'],'raf':s['frames']['max'],'render':s['firstDrawMs'],'gl':s['gl'],'longtasks':[x['duration'] for x in s['longtasks']]} for s in r['switches']]} for r in result['runs']],indent=2))
