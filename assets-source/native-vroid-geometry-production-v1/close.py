from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):p=Path(p);return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def main():
 r=json.loads((BASE/'cpu-readback/result.json').read_bytes());s=json.loads((BASE/'records/93-status-restored.json').read_bytes());assert r['status']=='two-native-geometry-derivatives-readback' and s['ok']
 write('manifest.json',dict(schema='native-vroid-geometry-production-v1',status=r['status'],sourceVroid=r['sourceFemaleVroid'],baseline=r['baseline'],candidates=[dict(id=x['id'],kind=x['kind'],resource=x['candidate'],status=x['status']) for x in r['cases']],runtimeAccepted=False,fitAccepted=False,visualAccepted=False,licenseMeta='Preserved from native source'))
 deps=[ROOT/'assets-source/vroid-bridge-study-v1/call.py',ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'evidence/native-geometry-reuse-review-v1/REVIEW.md']
 write('closure.json',dict(schema='native-vroid-geometry-production-closure-v1',status=r['status'],baselineBytes=r['baseline']['bytes'],faceBytes=next(x['candidate']['bytes'] for x in r['cases'] if x['kind']=='face'),waistBytes=next(x['candidate']['bytes'] for x in r['cases'] if x['kind']=='waist'),sourceRestored=True,desktopInput=False,gpuOperations=0,runtimeAccepted=False,fitAccepted=False,visualAccepted=False,dependencies=[ref(x) for x in deps],toolVersions={'python':platform.python_version(),'numpy':np.__version__,'pillow':pillow_version}))
 rows=[ref(x) for x in sorted(BASE.rglob('*')) if x.is_file() and x.name!='package-files.json'];write('package-files.json',dict(schema='native-vroid-geometry-production-package-files-v1',files=rows));print(json.dumps({'manifest':ref(BASE/'manifest.json'),'closure':ref(BASE/'closure.json'),'package':ref(BASE/'package-files.json'),'files':len(rows)}))
if __name__=='__main__':main()
