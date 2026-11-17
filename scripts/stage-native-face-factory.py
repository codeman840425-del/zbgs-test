"""Exact native face staging. Reuses the established pinned-source publication policy."""
from pathlib import Path
import argparse, hashlib, json, os, tempfile
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'prototype/public/assets/native-face-factory-v2'
BODY_SHA='cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce'
PREFIX='assets-source/native-vroid-face-factory-equipment-v1/'
FILES={
 'generated/female-geometry-face-unmasked.vrm':('assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm',BODY_SHA),
 'equipment.json':(PREFIX+'equipment.json','fad086771438070cb504c676d57d8679fc0a4237249e21b875f308a198911a8d'),
 'native-vroid-face-geometry-top-v1.glb':(PREFIX+'native-vroid-face-geometry-top-v1.glb','12bb9600c329b191862f04c13883f518b3b9538ebcafe7392ec58df909d54042'),
 'native-vroid-face-geometry-shorts-v1.glb':(PREFIX+'native-vroid-face-geometry-shorts-v1.glb','b8725064bf99bc9ae45d6af5200e81baba9a95d1497e57149cd47e7481103f4d'),
 'native-vroid-face-geometry-shoes-v1.glb':(PREFIX+'native-vroid-face-geometry-shoes-v1.glb','b92422c1ba7c018b04f80195d248f1ad46306a7fe7839ce2b44a9a1fbf26f3bc'),
 'manifest.json':('assets-source/native-vroid-face-body-texture-fit-v1/manifest.json','9fed8d43beef7149650d84dd6455bfae0a83029bb4a82899118ac93abd56d6a5'),
 'native-tops-body.png':('assets-source/native-vroid-face-body-texture-fit-v1/native-tops-body.png','dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c'),
}
sha=lambda b:hashlib.sha256(b).hexdigest()
def plan(source_root=ROOT):
 resources={}
 for target,(source,expected) in FILES.items():
  data=(source_root/source).read_bytes()
  if sha(data)!=expected:raise ValueError('Source identity mismatch: '+source)
  resources[target]=data
 eq=json.loads(resources['equipment.json']);cov=json.loads(resources['manifest.json'])
 if eq['schema']!='zbgs-equipment-v1' or len(eq['items'])!=3:raise ValueError('Expected exact three-piece equipment set')
 entries={e['id']:e for e in eq['items']}
 if len(entries)!=3 or cov['schema']!='native-body-texture-coverage-v1' or cov['avatarSha256']!=BODY_SHA:raise ValueError('Invalid source/coverage identity')
 if set(entries)!={e['id'] for e in cov['equipment']} or len(cov['equipment'])!=3:raise ValueError('Coverage set mismatch')
 for rule in cov['equipment']:
  e=entries[rule['id']];url=e['url']
  if url not in resources or not url.endswith('.glb'):raise ValueError('URL outside pinned plan: '+url)
  if e['compatibleAvatarSha256']!=BODY_SHA or rule['compatibleAvatarSha256']!=BODY_SHA:raise ValueError('Wrong body identity: '+e['id'])
  if e['sha256']!=sha(resources[url]) or e['bytes']!=len(resources[url]):raise ValueError('Resource differs: '+e['id'])
  if rule['sha256']!=e['sha256'] or rule['slot']!=e['slot'] or rule['covered']!=(e['slot']=='top'):raise ValueError('Invalid coverage: '+e['id'])
 mask=cov['covered']['url']
 if mask not in resources or sha(resources[mask])!=cov['covered']['sha256']:raise ValueError('Missing/incorrect mask')
 manifest=dict(schema='native-face-factory-staging-v2',bodyType='native-female-face-v1',avatarSha256=BODY_SHA,status='pinned-production-input-not-visual-acceptance',sources=[dict(source=FILES[n][0],url='/assets/native-face-factory-v2/'+n,sha256=sha(b),bytes=len(b)) for n,b in resources.items()],sourceBytesPreserved=True,license='Original metadata preserved; internal technical candidate; source package retains authoring provenance')
 resources['staging-manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
 return resources

def stage(destination=DEST,source_root=ROOT,check=False):
 resources=plan(source_root)
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
