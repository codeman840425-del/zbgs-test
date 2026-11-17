from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):p=Path(p);return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def main():
 r=json.loads((ROOT/'evidence/native-vroid-waist-factory-equipment-v1/result.json').read_bytes());assert r['sourceSha256']=='cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5'
 write('closure.json',dict(schema='native-vroid-waist-factory-equipment-closure-v1',status=r['status'],sourceSha256=r['sourceSha256'],items=3,buildCheck=True,restWalkSitCpuReadback=True,weightNormalizationDriftPreserved=True,fitAccepted=False,runtimeAccepted=False,visualAccepted=False,gpuOperations=0,toolVersions={'python':platform.python_version(),'numpy':np.__version__,'pillow':pillow_version}))
 rows=[ref(x) for x in sorted(BASE.rglob('*')) if x.is_file() and x.name!='package-files.json']; rows.append(ref(ROOT/'scripts/native-vroid-equipment-extract.py'));rows.append(ref(ROOT/'evidence/native-vroid-waist-factory-equipment-v1/result.json'));write('package-files.json',dict(schema='native-vroid-waist-factory-equipment-package-v1',files=rows));print(json.dumps({'closure':ref(BASE/'closure.json'),'package':ref(BASE/'package-files.json'),'files':len(rows)}))
if __name__=='__main__':main()
