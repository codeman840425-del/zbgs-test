"""Author-byte manifest and read-only verifier, including frozen study checks."""
from pathlib import Path
import hashlib,json,sys,platform
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-sample-v1';OUT=BASE/'manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--verify'in sys.argv:
 m=json.loads(OUT.read_text())
 for r in m['files']+m['dependencies']:assert sha(ROOT/r['path'])==r['sha256'],r['path']
 print(json.dumps({'verifiedFiles':len(m['files']),'verifiedDependencies':len(m['dependencies'])}));sys.exit()
old=ROOT/'assets-source/face-eye-parameters-v1/manifest.json';study=json.loads(old.read_text())
for r in study['files']:assert sha(ROOT/r['path'])==r['sha256'],r['path']
spec=json.loads((BASE/'spec.json').read_text());selection=json.loads((BASE/'selection.json').read_text());deps={old,ROOT/'scripts/m2-male-face-v1/glb.py'}
for body in spec['bodies'].values():
 for key in ['sourceBlend','sourceVRM']:
  p=ROOT/body[key];assert sha(p)==body[key+'Sha256'];deps.add(p)
for r in study['files']:deps.add(ROOT/r['path'])
files=sorted(p for folder in [BASE,ROOT/'scripts/face-eye-sample-v1']for p in folder.rglob('*')if p.is_file()and p!=OUT and '__pycache__'not in p.parts)
entry=lambda p:{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
m={'schema':'eye-source-sample-package-v1','scope':'Only original and +1% aperture endpoint source risk samples. No runtime admission.','python':platform.python_version(),'sourceStudyUnchanged':True,'files':[entry(p)for p in files],'dependencies':[entry(p)for p in sorted(deps)],'runtimeAdmitted':False}
OUT.write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8');print(json.dumps({'files':len(files),'bytes':sum(r['bytes']for r in m['files']),'studyUnchanged':True}))
