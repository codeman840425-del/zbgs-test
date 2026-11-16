"""Package author-byte manifest; read-only verification option."""
from pathlib import Path
import json,sys,hashlib,platform
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/mouth-visible-v2';OUT=BASE/'manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--verify'in sys.argv:
 m=json.loads(OUT.read_text(encoding='utf-8'))
 for r in m['files']+m['dependencies']:assert sha(ROOT/r['path'])==r['sha256'],r['path']
 print(json.dumps({'filesVerified':len(m['files']),'dependenciesVerified':len(m['dependencies'])}));sys.exit()
spec=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));deps={ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'scripts/face-parameters-v1/build.py',ROOT/'scripts/m2-male-jaw-mouth-v1/normal_core.py'}
for sex,src in spec['bodies'].items():
 for k in ['sourceBlend','sourceVRM']:
  p=ROOT/src[k];assert sha(p)==src[k+'Sha256'];deps.add(p)
 for pkg,suffix in [('face-parameters-v1','mouth-width'),('face-brow-parameters-v1','brow'),('face-nose-parameters-v1','nose'),('face-eye-sample-v1','eye')]:deps.add(ROOT/f'assets-source/{pkg}/{sex}-{suffix}.recipe.json')
files=sorted(p for folder in [BASE,ROOT/'scripts/mouth-visible-v2']for p in folder.rglob('*')if p.is_file()and p!=OUT and '__pycache__'not in p.parts)
entry=lambda p:{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
r={'schema':'mouth-visible-source-package-v2','scope':'Original F/M mouth +/-12%, one fixed 24mm transition, protected disconnected mouth interior. No runtime/visual admission.','python':platform.python_version(),'files':[entry(p)for p in files],'dependencies':[entry(p)for p in sorted(deps)],'runtimeAdmitted':False};OUT.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'files':len(files),'bytes':sum(x['bytes']for x in r['files'])}))
