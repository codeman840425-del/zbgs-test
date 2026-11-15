from pathlib import Path
import json,hashlib,platform
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-brow-parameters-v1';SCRIPTS=ROOT/'scripts/face-brow-parameters-v1'
def row(p):return {'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
files=[p for d in [BASE,SCRIPTS]for p in d.rglob('*')if p.is_file()and p.name!='manifest.json'and '__pycache__'not in p.parts]
spec=json.loads((BASE/'spec.json').read_text());refs=[ROOT/b[k]for b in spec['bodies'].values()for k in ['sourceBlend','sourceVRM']]+[ROOT/'assets-source/foundation/source.json',ROOT/'assets-source/foundation-male/source.json']+[ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json'for sex in spec['bodies']]
result={'status':'One combined source endpoint per sex; no runtime or visual acceptance, no full parameter-range admission.','python':platform.python_version(),'files':[row(p)for p in sorted(files)],'references':[row(p)for p in refs]}
(BASE/'manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in files)}))
