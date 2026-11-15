"""Current source-package author bytes and read-only verify."""
from pathlib import Path
import json,sys,hashlib,platform
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-male-jaw-mouth-v1';OUT=BASE/'manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--verify'in sys.argv:
 m=json.loads(OUT.read_text())
 for r in m['files']+m['dependencies']:assert sha(ROOT/r['path'])==r['sha256'],r['path']
 print(json.dumps({'filesVerified':len(m['files']),'dependenciesVerified':len(m['dependencies'])}));sys.exit()
spec=json.loads((BASE/'spec.json').read_text());deps={ROOT/spec['reuseAudit']['path'],ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'assets-source/face-parameters-v1/male-mouth-width.recipe.json',ROOT/'assets-source/face-parameters-v1/generated/male-mouth-width-104-v1/mapping.json.gz',ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm'}
for src in spec['bodies'].values():
 for k in ['sourceBlend','sourceVRM']:
  p=ROOT/src[k];assert sha(p)==src[k+'Sha256'];deps.add(p)
files=sorted(p for folder in [BASE,ROOT/'scripts/m2-male-jaw-mouth-v1']for p in folder.rglob('*')if p.is_file()and p!=OUT and '__pycache__'not in p.parts)
entry=lambda p:{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
r={'schema':'jaw-mouth-source-package-v1','scope':'One fixed +4% endpoint on existing male jaw parent. No runtime or visual admission.','python':platform.python_version(),'files':[entry(p)for p in files],'dependencies':[entry(p)for p in sorted(deps)],'runtimeAdmitted':False};OUT.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'files':len(files),'bytes':sum(x['bytes']for x in r['files'])}))
