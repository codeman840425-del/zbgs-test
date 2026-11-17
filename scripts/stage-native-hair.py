"""Publish exact independent native hair bytes; repeat staging is a no-op."""
import argparse, hashlib, json, os, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets-source/native-vroid-hair-equipment-v1/generated'
DEST=ROOT/'prototype/public/assets/native-hairset001-v1'
FILES={
 'hair.glb':'cfa965e68d4f11ca1a93096edb43f5b7657862f10c40b9d88f5b0fd404ae5a02',
 'fit.json':'c4b5f72aca522712256578cc30928ee80453945728e84e50411bed9954b0fb79',
 'manifest.json':'7e74eebe4d634eae8b2455715899d53e4ba25a677fc0f3de8841a1a4c5766046',
}
def stage(destination):
 raw={name:(SOURCE/name).read_bytes() for name in FILES}
 for name,blob in raw.items():
  if hashlib.sha256(blob).hexdigest()!=FILES[name]:raise ValueError('Source identity mismatch: '+name)
 manifest=json.loads(raw['manifest.json']);fit=json.loads(raw['fit.json'])
 if manifest['sha256']!=FILES['hair.glb'] or manifest['fit']['sha256']!=FILES['fit.json'] or fit['assetSha256']!=FILES['hair.glb']:
  raise ValueError('Source dependency identity mismatch')
 for name,blob in raw.items():
  target=destination/name
  if target.exists() and target.read_bytes()!=blob:raise ValueError('Existing output differs: '+str(target))
 destination.mkdir(parents=True,exist_ok=True)
 for name,blob in raw.items():
  target=destination/name
  if not target.exists():
   with tempfile.NamedTemporaryFile(dir=destination,delete=False) as stream:
    stream.write(blob);temp=Path(stream.name)
   try:
    try:os.link(temp,target)
    except FileExistsError:
     if target.read_bytes()!=blob:raise ValueError('Concurrent output differs: '+str(target))
   finally:temp.unlink()
  if target.read_bytes()!=blob:raise ValueError('Output readback differs: '+name)
 return {'files':FILES,'destination':str(destination),'unchangedSourceBytes':True,'scope':'Exact asset staging, not visual or dynamic acceptance'}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--destination',type=Path,default=DEST);args=p.parse_args()
 print(json.dumps(stage(args.destination),ensure_ascii=False))
