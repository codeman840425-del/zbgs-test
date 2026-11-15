"""Archive only named 44/08 evidence, losslessly; never changes source reports/videos.
Fresh checkout: --verify validates both stored and decoded hashes without output/.
"""
from pathlib import Path
import argparse,gzip,hashlib,json,shutil
P=Path(__file__).resolve().parents[1];R=P.parents[1];D=P/'evidence'
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def verify(index):
 for e in index['files']:
  p=D/e['archivePath'];assert digest(p)==e['archiveSHA256'],str(p)
  h=hashlib.sha256();size=0
  with (gzip.open(p,'rb') if e['encoding']=='gzip' else p.open('rb')) as f:
   for b in iter(lambda:f.read(1024*1024),b''):h.update(b);size+=len(b)
  assert h.hexdigest()==e['originalSHA256'] and size==e['originalBytes'],str(p)
 return {'files':len(index['files']),'originalBytes':sum(e['originalBytes']for e in index['files']),'archiveBytes':sum(e['archiveBytes']for e in index['files']),'verified':True}
a=argparse.ArgumentParser();a.add_argument('--verify',action='store_true');args=a.parse_args()
if args.verify:
 print(json.dumps(verify(json.loads((D/'index.json').read_text()))));raise SystemExit
base44=R/'output/playwright/hand-contact-44cd801ea417';base08=R/'output/playwright/hand-contact-08e4b038a9aa';files=[]
for folder,names in [('', ['joint-source-pose-report.json']),('hand-surface-actual-1794705634055',['beta-base-female-m1.json','report.json']),('joint-normal-video-room-dynamics-1794705995192',['actual.webm','legacy.webm','actual.json','legacy.json','report.json','recording-attempt-1794706014670.json']),('joint-source-pose-actual',['authored.json']),('joint-source-pose-legacy',['authored.json']),('unrecorded-perf-actual-outfit1',['room-authored.json','summary.json']),('unrecorded-perf-legacy-outfit1',['room-authored.json','summary.json']),('internal-profile-actual-outfit1',['room-authored.json','summary.json'])]:
 for name in names:files.append(('44cd801ea417',base44,base44/folder/name))
for folder in ['hand-surface-actual-1794706398383','hand-surface-legacy-1794706495619']:
 for name in ['beta-base-female-m1.json','m1a-jaw-v1.json','m1a-waisthip-v1.json','report.json']:files.append(('08e4b038a9aa',base08,base08/folder/name))
if (D/'index.json').exists():
 print(json.dumps(verify(json.loads((D/'index.json').read_text()))));raise SystemExit
for _,_,s in files:assert s.is_file(),str(s)
index={'scope':'Complete selected original 44/08 videos and raw reports. No edits, pruning, frame dropping or re-encoding. Historical isolated evidence, not integrated 269 runtime acceptance.','compression':'JSON gzip level1, mtime0, empty embedded filename; videos byte-copy','files':[]}
for build,base,s in files:
 encoding='gzip' if s.suffix=='.json' else 'identity';rel=Path(build)/s.relative_to(base);rel=Path(str(rel)+'.gz') if encoding=='gzip' else rel;target=D/rel;target.parent.mkdir(parents=True,exist_ok=True);assert not target.exists(),str(target)
 if encoding=='gzip':
  with s.open('rb') as inp,target.open('wb') as out,gzip.GzipFile(filename='',fileobj=out,mode='wb',compresslevel=1,mtime=0) as zipped:shutil.copyfileobj(inp,zipped,1024*1024)
 else:shutil.copyfile(s,target)
 index['files'].append({'build':build,'sourcePath':s.relative_to(R).as_posix(),'archivePath':rel.as_posix(),'encoding':encoding,'originalBytes':s.stat().st_size,'originalSHA256':digest(s),'archiveBytes':target.stat().st_size,'archiveSHA256':digest(target)})
summary=verify(index);index['summary']=summary;(D/'index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8');print(json.dumps(summary))
