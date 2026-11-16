import argparse,json,hashlib
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('worktree');ap.add_argument('--write',action='store_true');a=ap.parse_args();w=Path(a.worktree);p=w/'evidence/m2-character-presets-a-v1'
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
if a.write:
 retained=[];repro=[]
 for f in sorted(p.rglob('*')):
  if not f.is_file() or f.name=='manifest.json':continue
  rel=f.relative_to(p);item={'path':rel.as_posix(),'bytes':f.stat().st_size,'sha256':sha(f)}
  if rel.parts[:2]==('live-3','raw-video') or (rel.parts[0]=='live-review' and len(rel.parts)>2):repro.append(item)
  else:retained.append(item)
 m={'schema':'character-selection-a-evidence-v1','runtimeSource':'026ab2013ee94a6eb72cbe5f5e8c347c49b65431','build':'0fb420e5b124','selectionCount':1,'retainedFiles':retained,'reconstructibleOrDuplicateFiles':repro,'scripts':[{'path':f.relative_to(w).as_posix(),'sha256':sha(f)}for f in sorted((w/'scripts/m2-character-presets-a-v1').glob('*'))if f.is_file()]}
 (p/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
else:m=json.loads((p/'manifest.json').read_text(encoding='utf-8'))
for r in m['retainedFiles']:
 f=p/r['path'];assert f.stat().st_size==r['bytes'] and sha(f)==r['sha256'],r['path']
for r in m['scripts']:assert sha(w/r['path'])==r['sha256'],r['path']
print('Verified',len(m['retainedFiles']),'retained files and',len(m['scripts']),'scripts; optional decoded duplicates:',len(m['reconstructibleOrDuplicateFiles']))
