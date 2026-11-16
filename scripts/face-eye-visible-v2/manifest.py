"""Retained source package and reconstructible-output hash receipt.
--verify checks retained files/dependencies; --verify-full additionally requires
the raw/repeat/fresh binary outputs. Neither option hides missing retained files.
"""
from pathlib import Path
import json,sys,hashlib,platform
ROOT=Path(__file__).resolve().parents[2];PACKAGE=Path(__file__).parent.name;BASE=ROOT/'assets-source'/PACKAGE;OUT=BASE/'manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--verify'in sys.argv or '--verify-full'in sys.argv:
 m=json.loads(OUT.read_text(encoding='utf-8'));full='--verify-full'in sys.argv;rows=m['files']+m['dependencies']+(m['reconstructibleFiles']if full else [])
 for r in rows:assert sha(ROOT/r['path'])==r['sha256'],r['path']
 print(json.dumps({'package':PACKAGE,'retainedVerified':len(m['files']),'dependenciesVerified':len(m['dependencies']),'reconstructibleVerified':len(m['reconstructibleFiles'])if full else 0,'explicitlyNotRequiredForRetainedCheck':0 if full else len(m['reconstructibleFiles'])}));sys.exit()
assert not OUT.exists(),'Frozen manifest exists; use --verify/--verify-full. Do not replace execution receipt.'
spec=json.loads((BASE/'spec.json').read_text(encoding='utf-8'));deps={ROOT/'scripts/m2-male-face-v1/glb.py'}
for src in spec['bodies'].values():
 for k in ['sourceBlend','sourceVRM']:
  p=ROOT/src[k];assert sha(p)==src[k+'Sha256'];deps.add(p)
 if 'sourceMapRecipe'in src:
  p=ROOT/src['sourceMapRecipe'];assert sha(p)==src['sourceMapRecipeSha256'];deps.add(p)
if 'readOnlyStudyPath'in spec:
 p=ROOT/spec['readOnlyStudyPath'];assert sha(p)==spec['readOnlyStudySha256'];deps.add(p)
if PACKAGE=='face-brow-visible-v2':deps.add(ROOT/'assets-source/face-parameters-v1/spec.json')
for sex in spec['bodies']:
 deps.add(ROOT/f'assets-source/mouth-visible-v2/{sex}-mouth-width.recipe.json')
 if PACKAGE=='face-eye-visible-v2':
  deps.update(ROOT/f'assets-source/{pkg}/{sex}-{key}.recipe.json'for pkg,key in [('face-brow-visible-v2','brow'),('face-nose-visible-v2','nose')])
def retain(p):
 if not p.is_relative_to(BASE):return True
 rel=p.relative_to(BASE)
 if rel.parts[0]=='fresh-check':return p.suffix=='.json'
 if rel.parts[0]=='generated':return p.name not in ['addon-export.vrm','addon-repeat-export.vrm','repeat-export.vrm']
 return True
paths=sorted(p for folder in [BASE,ROOT/'scripts'/PACKAGE]for p in folder.rglob('*')if p.is_file()and p!=OUT and '__pycache__'not in p.parts)
entry=lambda p:{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
kept=[entry(p)for p in paths if retain(p)];rebuild=[entry(p)for p in paths if not retain(p)]
r={'schema':'bounded-visible-face-source-package-v2','package':PACKAGE,'scope':'Retain canonical editable sources, final exports, recipes and complete numeric evidence. Raw/repeat/fresh binary outputs recorded separately and rebuildable. Source checks are not game/visual admission.','python':platform.python_version(),'files':kept,'reconstructibleFiles':rebuild,'dependencies':[entry(p)for p in sorted(deps)],'retainedBytes':sum(x['bytes']for x in kept),'reconstructibleBytes':sum(x['bytes']for x in rebuild),'filesOver90MB':[x for x in kept+rebuild if x['bytes']>90000000],'runtimeAdmitted':False};OUT.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'package':PACKAGE,'retainedBytes':r['retainedBytes'],'reconstructibleBytes':r['reconstructibleBytes'],'filesOver90MB':r['filesOver90MB']}))
