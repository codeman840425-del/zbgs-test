from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):p=Path(p);return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def write(n,v):
 with (BASE/n).open('xb') as f:f.write((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def main():
 cycle=json.loads((BASE/'native-cycle.json').read_bytes());result=json.loads((BASE/'result.json').read_bytes());assert result['status']=='failed-base-color-not-represented' and cycle['failure'] is None and cycle['restored']['ready'] and not cycle['restored']['dirty']
 for x in [cycle['source'],cycle['entry']]+cycle['generated']:assert sha(ROOT/x['path'])==x['sha256']
 write('manifest.json',dict(schema='native-hair-base-color-study-v1',id='native-male-hair-base-brown-v1',version=1,status=result['status'],sourceEditable=cycle['source'],nativeEditable=ref(BASE/'generated/male-hair-base-brown.vroid'),nativeVrm=result['candidate'],baseKey=cycle['baseKey'],targetRGBA=cycle['targetRGBA'],hairExported=False,runtimeAccepted=False,licenseBoundary='Original VRM metadata preserved'))
 write('closure.json',dict(schema='native-hair-base-color-study-closure-v1',status=result['status'],nativeSeconds=cycle['wallSeconds'],sourceBytes=result['source']['bytes'],candidateBytes=result['candidate']['bytes'],all139AccessorsExact=result['all139AccessorsExact'],allImagesEncodedExact=result['allImagesEncodedExact'],coldReopenExact=result['coldReopenExact'],windowReleased=True,originalsUnchanged=True,runtimeAccepted=False,independentAudit=False,toolSources=[ref(ROOT/'assets-source/native-vroid-appearance-producer-v1/official-source/Hair.cs'),ref(ROOT/'assets-source/vroid-bridge-study-v1/call.py')],toolVersions={'python':platform.python_version(),'numpy':np.__version__,'pillow':pillow_version}))
 rows=[ref(x) for x in sorted(BASE.rglob('*')) if x.is_file() and x.name!='package-files.json'];write('package-files.json',dict(schema='native-hair-base-color-study-package-v1',files=rows));print(json.dumps({'manifest':ref(BASE/'manifest.json'),'closure':ref(BASE/'closure.json'),'package':ref(BASE/'package-files.json'),'files':len(rows)}))
if __name__=='__main__':main()
