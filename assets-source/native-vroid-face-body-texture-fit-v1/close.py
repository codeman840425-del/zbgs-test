from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):p=Path(p);return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def main():
 check=json.loads((BASE/'cpu-check.json').read_bytes());assert check['status']=='admission-blocked-new-avatar-identity'
 write('closure.json',dict(schema='native-vroid-face-body-texture-fit-closure-v1',status=check['status'],maskBytesExact=True,sourceFloorY=-7.442453409112204e-08,coverageTransactionCommitted=False,failClosedChecks=check['passed'],runtimeAccepted=False,visualAccepted=False,gpuOperations=0,toolVersions={'python':platform.python_version(),'numpy':np.__version__,'pillow':pillow_version}))
 rows=[ref(x) for x in sorted(BASE.rglob('*')) if x.is_file() and x.name!='package-files.json'];write('package-files.json',dict(schema='native-vroid-face-body-texture-fit-package-v1',files=rows));print(json.dumps({'closure':ref(BASE/'closure.json'),'package':ref(BASE/'package-files.json'),'files':len(rows)}))
if __name__=='__main__':main()
