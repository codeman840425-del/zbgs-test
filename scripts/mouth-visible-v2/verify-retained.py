"""Verify the Git-retained mouth source package without rewriting its frozen manifest."""
from pathlib import Path
import argparse,json,hashlib
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);args=parser.parse_args();ROOT=args.root.resolve();BASE=ROOT/'assets-source/mouth-visible-v2'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def retained(path):
 p=Path(path);base=Path('assets-source/mouth-visible-v2')
 if not p.is_relative_to(base):return True
 rel=p.relative_to(base)
 if rel.parts[0]=='fresh-check':return p.suffix=='.json'
 if rel.parts[0]=='generated':return p.name not in ['addon-export.vrm','addon-repeat-export.vrm','repeat-export.vrm']
 return True
receipt=json.loads((BASE/'retained-manifest.json').read_text(encoding='utf-8'));pin=receipt['frozenFullManifest'];fullpath=ROOT/pin['path'];assert sha(fullpath)==pin['sha256']=='d76516a8aada756657c7b68e9e236ad99e0305b12e161d6a4f44eb88224bf610','Frozen original manifest differs';full=json.loads(fullpath.read_text(encoding='utf-8'))
# Derive the allowed omission set from the original receipt. A missing editable,
# canonical final, script, dependency or numeric report cannot be reclassified.
expected=[r for r in full['files']if retained(r['path'])];omitted=[r for r in full['files']if not retained(r['path'])]
assert receipt['files']==expected,'Retained list must match the fixed policy and frozen records'
assert receipt['reconstructibleFiles']==omitted,'Omission list mismatch'
assert receipt['dependencies']==full['dependencies'],'Original dependency pins changed'
for row in receipt['files']+receipt['dependencies']+receipt['additionalFiles']:
 path=(ROOT/row['path']).resolve();assert path.is_relative_to(ROOT),row['path'];assert path.is_file(),f'Missing retained file: {row["path"]}';assert path.stat().st_size==row['bytes']and sha(path)==row['sha256'],f'Hash/size mismatch: {row["path"]}'
missing=[r['path']for r in omitted if not (ROOT/r['path']).is_file()]
print(json.dumps({'schema':'mouth-retained-verification-v2','passed':True,'frozenFullManifestSha256':pin['sha256'],'retainedOriginalFilesVerified':len(expected),'dependenciesVerified':len(full['dependencies']),'additionalFilesVerified':len(receipt['additionalFiles']),'reconstructibleFilesNotRequired':len(omitted),'reconstructibleFilesAbsent':len(missing),'missingReconstructiblePaths':missing,'fullLocalVerificationPerformed':False},indent=2))
