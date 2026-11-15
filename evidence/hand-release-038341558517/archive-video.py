from pathlib import Path
import gzip,json,hashlib,re
E=Path(__file__).resolve().parent;ROOT=E.parents[1];BUILD='038341558517'
rows=[]
for view in ['room','fixed-diagnostic-close']:
 j=json.loads(gzip.decompress((E/'snap-normal'/f'{view}.json.gz').read_bytes()))
 assert j['build']==BUILD and not j['errors']
 assert j['events'][0]['kind']=='run-completed-action-sit'
 rows.append({'view':view,'build':j['build'],**{k:j[k]for k in ['wall','sim','ratio','trigger']},'frames':len(j['frames']),'event':j['events'][0]})
r=json.loads((E/'related-video/report.json').read_text())
assert r['build']==BUILD and not r['errors'] and r['failure'] is None
completed=[e['task']['kind']for e in r['tasks']if e['type']=='completed']
assert completed==['sit','idle','turn','walk','dance']
summary={'build':BUILD,'exactTransition':rows,'related':{k:r[k]for k in ['build','errors','failure','wallSeconds','simSeconds','simWallRatio']},'completedRequests':completed,'scope':'Normal1x rerecord of final integrated build, same scripts and cameras; no repeated skin or new matrix; no target-PC/performance acceptance.'}
(E/'VIDEO-SUMMARY.json').write_text(json.dumps(summary,indent=2))
files=[p for p in E.rglob('*')if p.is_file() and p.name!='video-manifest.json']
files += [ROOT/'experiments/hand-scope-worktree-1'/p for p in ['qa-snap-video.cjs','qa-related-video.cjs','qa-hand-scope.cjs']]
files += [ROOT/'scripts/qa-refresh-boundary-male.cjs',ROOT/'scripts/qa-refresh-boundary.cjs',ROOT/'scripts/qa-room-filmstrip.py']
files += [ROOT/'scripts/qa-hand-scope-variants.cjs',ROOT/'scripts/qa-refresh-boundary-variants.cjs']
files += [ROOT/'scripts/qa-hand-release-state-isolation.cjs']
manifest={'build':BUILD,'files':[{'file':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in files]}
(E/'video-manifest.json').write_text(json.dumps(manifest,indent=2))
refs=re.findall(r'(?:src|href)="([^"]+)"',(E/'video-index.html').read_text(encoding='utf8'))
assert all((E/r).exists() for r in refs)
print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in files),'summary':summary},indent=2))
