"""Exact native face staging. Reuses the established pinned-source publication policy."""
from pathlib import Path
import argparse, hashlib, json, os, tempfile
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'prototype/public/assets/native-face-factory-v2'
DEFAULT_SPEC=json.loads((ROOT/'scripts/production/native-import/face.json').read_text(encoding='utf-8'))
BODY_SHA=DEFAULT_SPEC['bodySha256']
FILES=DEFAULT_SPEC['files']
sha=lambda b:hashlib.sha256(b).hexdigest()
def plan(source_root=ROOT,spec=None):
 spec=DEFAULT_SPEC if spec is None else spec
 sources=spec.get('files',FILES);body_sha=spec.get('bodySha256',BODY_SHA)
 url_root=spec.get('urlRoot','/assets/native-face-factory-v2/')
 if not url_root.startswith('/assets/') or not url_root.endswith('/'):raise ValueError('Invalid factory URL root')
 resources={}
 for target,(source,expected) in sources.items():
  if Path(target).is_absolute() or '..' in Path(target).parts or Path(source).is_absolute() or '..' in Path(source).parts:raise ValueError('Resource path must stay inside package')
  data=(source_root/source).read_bytes()
  if sha(data)!=expected:raise ValueError('Source identity mismatch: '+source)
  resources[target]=data
 eq=json.loads(resources['equipment.json']);cov=json.loads(resources['manifest.json'])
 if eq['schema']!='zbgs-equipment-v1' or len(eq['items'])!=3:raise ValueError('Expected exact three-piece equipment set')
 entries={e['id']:e for e in eq['items']}
 if len(entries)!=3 or cov['schema']!='native-body-texture-coverage-v1' or cov['avatarSha256']!=body_sha:raise ValueError('Invalid source/coverage identity')
 if set(entries)!={e['id'] for e in cov['equipment']} or len(cov['equipment'])!=3:raise ValueError('Coverage set mismatch')
 for rule in cov['equipment']:
  e=entries[rule['id']];url=e['url']
  if url not in resources or not url.endswith('.glb'):raise ValueError('URL outside pinned plan: '+url)
  if e['compatibleAvatarSha256']!=body_sha or rule['compatibleAvatarSha256']!=body_sha:raise ValueError('Wrong body identity: '+e['id'])
  if e['sha256']!=sha(resources[url]) or e['bytes']!=len(resources[url]):raise ValueError('Resource differs: '+e['id'])
  if rule['sha256']!=e['sha256'] or rule['slot']!=e['slot'] or rule['covered']!=(e['slot']=='top'):raise ValueError('Invalid coverage: '+e['id'])
 mask=cov['covered']['url']
 if mask not in resources or sha(resources[mask])!=cov['covered']['sha256']:raise ValueError('Missing/incorrect mask')
 manifest=dict(schema=spec.get('schema','native-face-factory-staging-v2'),bodyType=spec.get('bodyType','native-female-face-v1'),avatarSha256=body_sha,status='pinned-production-input-not-visual-acceptance',sources=[dict(source=sources[n][0],url=url_root+n,sha256=sha(b),bytes=len(b)) for n,b in resources.items()],sourceBytesPreserved=True,license='Original metadata preserved; internal technical candidate; source package retains authoring provenance')
 resources['staging-manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
 return resources

def stage(destination=DEST,source_root=ROOT,check=False,spec=None):
 resources=plan(source_root,spec)
 for n,b in resources.items():
  target=destination/n
  if target.exists() and (not target.is_file() or target.read_bytes()!=b):raise ValueError('Refusing different staged output: '+str(target))
  if check and not target.exists():raise ValueError('Staged output missing: '+str(target))
 if not check:
  for n,b in resources.items():
   target=destination/n
   if target.exists():continue
   target.parent.mkdir(parents=True,exist_ok=True)
   with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as f:temporary=Path(f.name);f.write(b)
   try:
    try:os.link(temporary,target)
    except FileExistsError:
     if target.read_bytes()!=b:raise ValueError('Concurrent output differs: '+str(target))
   finally:temporary.unlink()
 return dict(passed=True,files=len(resources),sourceBytesPreserved=True,manifestSha256=sha(resources['staging-manifest.json']),checkedOnly=check)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();print(json.dumps(stage(check=args.check)))
