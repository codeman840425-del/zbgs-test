"""Archive selected fixed-build evidence verbatim; raw JSON compressed losslessly.
No conversion of old evidence to a new build label. Original media stay intact.
"""
import argparse,gzip,hashlib,json,pathlib,shutil
p=argparse.ArgumentParser();p.add_argument('build');a=p.parse_args();root=pathlib.Path(__file__).resolve().parents[1]
assert len(a.build)==12 and all(c in '0123456789abcdef'for c in a.build)
src=root/'output/playwright/m1'/a.build;dst=root/'evidence'/('fixed-'+a.build);dst.mkdir(parents=True,exist_ok=True)
selected=[]
for f in src.rglob('*'):
 if not f.is_file():continue
 rel=f.relative_to(src)
 if any(x.startswith('review')or x.endswith('-review')for x in rel.parts):continue
 if f.suffix not in ['.json','.png','.webm','.html']:continue
 # Preserve the deliberately rejected baseline oracle attempts too, but avoid
 # redundant browser video UUID copies when a human-named copy exists.
 if f.suffix=='.webm' and len(f.stem)==32 and all(c in '0123456789abcdef'for c in f.stem):continue
 data=f.read_bytes();sha=hashlib.sha256(data).hexdigest();compressed=f.suffix=='.json'and len(data)>250000
 target=dst/rel;target=target.with_suffix(target.suffix+'.gz')if compressed else target
 payload=gzip.compress(data,mtime=0)if compressed else data;target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists()and target.read_bytes()!=payload:raise RuntimeError('Refuse changing existing evidence '+str(target))
 if not target.exists():target.write_bytes(payload)
 selected.append({'source':str(f.relative_to(root)).replace('\\','/'),'file':str(target.relative_to(dst)).replace('\\','/'),'sourceBytes':len(data),'sourceSHA256':sha,'archivedBytes':len(payload),'archivedSHA256':hashlib.sha256(payload).hexdigest(),'gzip':compressed})
(dst/'manifest.json').write_text(json.dumps({'build':a.build,'method':'Original bytes; JSON optionally gzip lossless; no claim of visual approval','files':selected},indent=2),encoding='utf8')
print(json.dumps({'folder':str(dst),'files':len(selected),'bytes':sum(x['archivedBytes']for x in selected)}))
