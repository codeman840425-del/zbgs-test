"""Data-level regression, deliberately not a game/visual acceptance test."""
from pathlib import Path
import json,hashlib,subprocess,sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/appearance-color-v1'
sha=lambda b:hashlib.sha256(b).hexdigest()
names=['runtime-manifest.json','manifest.json','female-iris-mask.png','male-iris-mask.png','female-outer-lip-mask.png','male-outer-lip-mask.png']
before={n:sha((OUT/n).read_bytes())for n in names}
subprocess.run([sys.executable,str(ROOT/'scripts/appearance-color-v1/build-masks.py')],cwd=ROOT,check=True)
after={n:sha((OUT/n).read_bytes())for n in names};assert before==after
tests=[]
for sex in ['female','male']:
 for part,source,swatch in [('iris','iris','iris-green-swatch'),('outer-lip','face','lip-rose-swatch')]:
  a=np.array(Image.open(OUT/(sex+'-'+source+'.png')).convert('RGBA'));b=np.array(Image.open(OUT/(sex+'-'+swatch+'.png')).convert('RGBA'));m=np.array(Image.open(OUT/(sex+'-'+part+'-mask.png')))
  assert np.array_equal(a[:,:,3],b[:,:,3])
  assert np.array_equal(a[m==0],b[m==0])
  if part=='iris':
   for x in [256,768]:assert m[256,x]==0
  tests.append({'sex':sex,'part':part,'alphaExact':True,'allMaskZeroPixelsExact':True,'pupilCentreProtected':True if part=='iris' else None})
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
for v in manifest['bodies'].values():
 assert all(all(c.values())for c in v['exactReferenceChecks'].values());assert v['uvMorphAbsent'];assert v['materialValueBindings']==[]
report={'deterministicRebuild':True,'hashes':after,'pixelTests':tests,'allFiveBodiesUvTextureAndIndicesExactToOwnReference':True,'noRelatedExpressionMaterialBinds':True,'limits':'No rendered animation test; no physical/geometry or visual quality claim.'}
(OUT/'check-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
