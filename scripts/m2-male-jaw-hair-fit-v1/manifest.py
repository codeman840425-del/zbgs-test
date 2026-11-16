from pathlib import Path
import argparse,json,hashlib,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'evidence/m2-male-jaw-hair-fit-v1/manifest.json'
ap=argparse.ArgumentParser();ap.add_argument('--verify',action='store_true');args=ap.parse_args()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if args.verify:
    report=json.loads(OUT.read_text(encoding='utf8'))
    for row in report['retainedFiles']+report['inputFiles']:
        p=ROOT/row['path'];assert p.stat().st_size==row['bytes']and sha(p)==row['sha256'],row['path']
    print(json.dumps({'retainedVerified':len(report['retainedFiles']),'inputsVerified':len(report['inputFiles']),'freshRequired':False}))
else:
    rows=[]
    for folder in ['assets-source/m2-male-jaw-hair-fit-v1','scripts/m2-male-jaw-hair-fit-v1','prototype/public/assets/m2-male-jaw-hair-fit-v1','evidence/m2-male-jaw-hair-fit-v1']:
        for p in sorted((ROOT/folder).rglob('*')):
            if not p.is_file()or p==OUT or 'fresh'in p.parts or '__pycache__'in p.parts or p.name=='reexport-repeat.glb':continue
            rows.append({'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
    pins=json.loads((ROOT/'assets-source/m2-male-jaw-hair-fit-v1/source-pins.json').read_text(encoding='utf8'))
    assert all(r['bytes']<90_000_000 for r in rows)
    result={'baseline':'026ab20','python':sys.version,'numpy':np.__version__,'blender':'4.5.9 LTS / 8bf95cbd38d1','retainedFiles':rows,'inputFiles':pins['files'],'maxRetainedBytes':max(r['bytes']for r in rows),'retainedTotalBytes':sum(r['bytes']for r in rows),'ignoredRebuildable':['assets-source/m2-male-jaw-hair-fit-v1/fresh/','assets-source/m2-male-jaw-hair-fit-v1/reexport-repeat.glb'],'visualOrRuntimeAcceptance':False}
    OUT.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps({'retained':len(rows),'maxBytes':result['maxRetainedBytes'],'totalBytes':result['retainedTotalBytes']}))
