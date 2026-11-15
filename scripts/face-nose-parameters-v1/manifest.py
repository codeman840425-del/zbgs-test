from pathlib import Path
import json,hashlib,platform
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/face-nose-parameters-v1';SCRIPTS=ROOT/'scripts/face-nose-parameters-v1'
def row(p):return {'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
report=json.loads((BASE/'measurements.json').read_text());refs=[]
for sex,b in report['bodies'].items():
 refs.extend([ROOT/b['source']['sourceVRM'],ROOT/b['source']['sourceBlend'],ROOT/b['sourceMapping']['path'],ROOT/f'assets-source/face-parameters-v1/{sex}-mouth-width.recipe.json'])
refs.extend([ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'prototype/src/live-presentation.js',ROOT/'assets-source/acc01-temple-fit-v1/README.md',ROOT/'assets-source/foundation/source.json',ROOT/'assets-source/foundation-male/source.json',ROOT/'experiments/tools/vrm-addon/VRM_Addon_for_Blender-release/exporter/vrm0_exporter.py'])
files=[p for d in [BASE,SCRIPTS]for p in d.rglob('*')if p.is_file()and p.name!='manifest.json'and '__pycache__'not in p.parts]
result={'status':'Fixed +0.5mm endpoint per sex; native/final/repeated/fresh exported bytes verified. No runtime or visual acceptance.','python':platform.python_version(),'files':[row(p)for p in sorted(files)],'references':[row(p)for p in refs]}
(BASE/'manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in files)}))
