from pathlib import Path
import json,hashlib,platform
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-eye-parameters-v1';SCRIPTS=ROOT/'scripts/face-eye-parameters-v1'
def row(p):return {'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
r=json.loads((BASE/'measurements.json').read_text());refs=[ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'assets-source/foundation/source.json',ROOT/'assets-source/foundation-male/source.json']
for sex,b in r['bodies'].items():refs.extend([ROOT/b['source']['sourceVRM'],ROOT/b['source']['sourceBlend'],ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json',ROOT/f'assets-source/face-nose-parameters-v1/{sex}-nose.recipe.json'])
files=[p for d in [BASE,SCRIPTS]for p in d.rglob('*')if p.is_file()and p.name!='manifest.json'and '__pycache__'not in p.parts]
result={'scope':'Read-only eye source feasibility and minimal proposal; no edited model or runtime admission.','python':platform.python_version(),'files':[row(p)for p in sorted(files)],'references':[row(p)for p in refs]}
(BASE/'manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in files)}))
