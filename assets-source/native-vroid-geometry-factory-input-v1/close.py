from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):p=Path(p);return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def main():
 r=json.loads((BASE/'readback.json').read_bytes());assert r['status']=='three-skin-derived-inputs-ready'
 write('closure.json',dict(schema='native-vroid-geometry-factory-input-closure-v1',status=r['status'],outputCount=3,allAccessorsExact=all(x['allAccessorsExact'] for x in r['cases']),donorBodyPNGExact=all(x['donorBodyPNGExact'] for x in r['cases']),equipmentFitsGenerated=False,runtimeAccepted=False,visualAccepted=False,sourceMutation=False,gpuOperations=0,dependencies=[ref(ROOT/'assets-source/native-vroid-geometry-production-v1/readback.py'),ref(ROOT/'assets-source/native-vroid-unmasked-base-v1/build.py')],toolVersions={'python':platform.python_version(),'numpy':np.__version__,'pillow':pillow_version}))
 rows=[ref(x) for x in sorted(BASE.rglob('*')) if x.is_file() and x.name!='package-files.json'];write('package-files.json',dict(schema='native-vroid-geometry-factory-input-package-v1',files=rows));print(json.dumps({'closure':ref(BASE/'closure.json'),'package':ref(BASE/'package-files.json'),'files':len(rows)}))
if __name__=='__main__':main()
