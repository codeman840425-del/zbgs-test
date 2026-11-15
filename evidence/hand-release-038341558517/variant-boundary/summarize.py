from pathlib import Path
import json,gzip,hashlib
E=Path(__file__).resolve().parent;ROOT=E.parents[2];rows=[]
for name in ['jaw','waisthip']:
 c=json.loads((E/name/'contact/report.json').read_text(encoding='utf8'))
 r=json.loads((E/name/'refresh/report.json').read_text(encoding='utf8'))
 s=json.loads(gzip.decompress((E/name/'contact/actual-surfaces.json.gz').read_bytes()))
 assert c['build']==r['build']=='038341558517' and c['passed'] and not c['errors'] and not r['errors']
 fit=c['assetCombination']['outfit']['equipment']
 assert fit['bodyCoverage'] is None and fit['items']['skirt']['verticesAcrossPrimitives']==742
 assert c['assetCombination']['sha256']==c['assetCombination']['handBodySHA']
 assert all(x['passed']for x in r['taskChecks'])
 assert len(r['refreshChecks'])==4 and all(x['firstDelta']==0 and x['repeatDelta']==0 and x['allClocksUnchanged']for x in r['refreshChecks'])
 rows.append({'body':c['assetCombination']['body'],'bodySHA':c['assetCombination']['sha256'],'skirtId':fit['items']['skirt']['id'],'fitId':fit['skirtDynamics']['fitId'],'bodyCoverage':fit['bodyCoverage'],'actualSourceHandFaceCount':sum(m['faces']for m in c['selectedMeshes']),'timelineSteps':len(s['timeline']),'actualGates':[{'time':x['t'],'stage':x['stage'],'pairs':len(x['hits']),'measurementStage':x['measurementStage']}for x in s['rows']],'refresh':[{'stage':x['stage'],'firstDelta':x['firstDelta'],'repeatDelta':x['repeatDelta'],'allClocksUnchanged':x['allClocksUnchanged']}for x in r['refreshChecks']],'taskChecksPassed':len(r['taskChecks']),'riseOffDelta':r['riseOffDelta'],'danceOffDelta':r['danceOffDelta'],'riseColdRepeatDelta':r['riseColdRepeatDelta'],'danceColdRepeatDelta':r['danceColdRepeatDelta'],'pageErrors':[]})
(E/'summary.json').write_text(json.dumps({'build':'038341558517','rows':rows,'scope':'Own current variant equipment/calibration only. No original-female coverage or open-waist transfer. Four full semantic hand-skin snapshots, not whole garment acceptance.'},indent=2))
files=[p for p in E.rglob('*')if p.is_file() and p.name!='manifest.json']
files += [ROOT/'scripts'/n for n in ['qa-hand-scope-variants.cjs','qa-refresh-boundary-variants.cjs','qa-refresh-boundary.cjs']]
(E/'manifest.json').write_text(json.dumps({'build':'038341558517','files':[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in files]},indent=2))
print(json.dumps(rows,indent=2))
