"""Bounded structural cross-check; no Blender/runtime imports or GPU."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
paths=['prototype/public/assets/foundation/base-male-roundtrip.vrm','assets-source/mouth-visible-v2/generated/male-mouth-width-88-v2/addon-export.vrm','assets-source/mouth-quantization-v1/candidate/avatar.vrm']
gs=[GLB(ROOT/p) for p in paths]
for k in ['meshes','skins','nodes','materials','textures','images']:
 assert len({len(g.doc[k]) for g in gs})==1,k
for ms in zip(*(g.doc['meshes'] for g in gs)):
 assert len({len(m['primitives']) for m in ms})==1
 for ps in zip(*(m['primitives'] for m in ms)):
  assert len({len(p.get('targets',[])) for p in ps})==1
  assert len({tuple(sorted(p['attributes'])) for p in ps})==1
mi=next(i for i,m in enumerate(gs[0].doc['meshes']) if m['name'].startswith('Face'))
for g in gs:
 m=g.doc['meshes'][mi];assert len(m['extras']['targetNames'])==54
 for p in m['primitives']:
  assert len(p['targets'])==54
  for key in ['POSITION','NORMAL']:
   assert p['attributes'][key]==m['primitives'][0]['attributes'][key]
   assert np.isfinite(g.acc(p['attributes'][key])).all()
  for i,t in enumerate(p['targets']):
   assert t['POSITION']==m['primitives'][0]['targets'][i]['POSITION']
   for a in t.values():assert np.isfinite(g.acc(a)).all()
result={'passed':True,'files':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in paths],'facePrimitiveCount':len(gs[0].doc['meshes'][mi]['primitives']),'absoluteShapes':55,'checks':['structure counts equal (no zip truncation)','all face primitives share POSITION/NORMAL as expected','54 relative shapes plus Basis finite'],'scope':'Structural supplement to separately reviewed 55-shape decoded normal/position audit; not new visual or runtime admission'}
Path(__file__).with_name('report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('PASS',result['facePrimitiveCount'],'primitives',result['absoluteShapes'],'absolute shapes')
