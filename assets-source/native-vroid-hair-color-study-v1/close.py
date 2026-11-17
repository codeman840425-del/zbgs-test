from pathlib import Path
import hashlib,json,platform
import numpy as np
from PIL import __version__ as pillow_version
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def ref(p):
 p=Path(p);return dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(p),bytes=p.stat().st_size)
def write(name,value):
 with (BASE/name).open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
def main():
 cycle=json.loads((BASE/'native-cycle.json').read_bytes());result=json.loads((BASE/'cpu-readback/result.json').read_bytes());cold=json.loads((BASE/'cold-reopen-readback.json').read_bytes())
 assert cycle['failure'] is None and result['status']=='failed-hair-export-not-represented-brow-exported' and cycle['restored']['ready'] and not cycle['restored']['dirty']
 for x in [cycle['source'],cycle['entry']]+cycle['generated']:assert sha(ROOT/x['path'])==x['sha256']
 for x in (BASE/'records').glob('*.json'):
  if x.name.endswith('.json'):
   r=json.loads(x.read_bytes())
   if not r['ok']:
    assert x.name in {'03-hair-materials.json','08-hair-before.json','13-hair-after.json','19-hair-reopened.json'} and r['failures']==['content[0][0].textures[0].layers: error','content[0][0].textures[1].layers: error'],x
 m=dict(schema='native-hair-brow-color-study-v1',id='native-male-hair-brown-brow-v1',version=1,status=result['status'],sourceEditable=cycle['source'],nativeEditable=ref(BASE/'generated/male-hair-brown-brow.vroid'),nativeVrm=result['candidate'],targetColors=cycle['targetColors'],browExported=True,hairExported=False,changedImageIds=result['changedImageIds'],extractedImages=result['extractedImages'],runtimeAccepted=False,sourceProducedOnly=True,oldHairSetRuleReusable=False,licenseMeta=result['candidate'].get('meta',result.get('candidateMeta')))
 write('manifest.json',m)
 deps=[ROOT/'assets-source/vroid-bridge-study-v1/call.py',ROOT/'scripts/m2-male-face-v1/glb.py',ROOT/'assets-source/native-vroid-color-preflight-v1/result.json',ROOT/'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/mcp_server/vroid_mcp.py']
 write('closure.json',dict(schema='native-hair-brow-color-study-closure-v1',status=result['status'],nativeSeconds=cycle['wallSeconds'],exportSeconds=json.loads((BASE/'records/22-export-vrm1.json').read_bytes())['wallSeconds'],sourceBytes=result['source']['bytes'],candidateBytes=result['candidate']['bytes'],browExported=True,hairExported=False,allAccessorsExact=result['allAccessorsExact'],expressionsExact=result['expressionsExact'],nonTargetImagesExact=all(x['encodedExact'] for x in result['images'] if x['role']=='non-target'),windowReleased=True,originalsUnchanged=True,runtimeAccepted=False,independentAudit=False,dependencies=[ref(x) for x in deps],toolVersions={'python':platform.python_version(),'numpy':np.__version__,'pillow':pillow_version},failure=result['failures']))
 rows=[ref(x) for x in sorted(BASE.rglob('*')) if x.is_file() and x.name!='package-files.json']
 write('package-files.json',dict(schema='native-hair-brow-color-study-package-v1',files=rows))
 print(json.dumps({'manifest':ref(BASE/'manifest.json'),'closure':ref(BASE/'closure.json'),'package':ref(BASE/'package-files.json'),'files':len(rows)}))
if __name__=='__main__':main()
