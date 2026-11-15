from pathlib import Path
import sys,json,hashlib,io
import numpy as np
from PIL import Image
sys.path.insert(0,'scripts/m2-male-face-v1');from glb import GLB
out=Path('assets-source/appearance-color-v1')
for sex in ['female','male']:
 g=GLB(Path('prototype/public/assets/foundation')/('base-'+sex+'-roundtrip.vrm'));report=[]
 for mi,m in enumerate(g.doc['meshes']):
  for pi,p in enumerate(m['primitives']):
   mat=g.doc['materials'][p['material']];name=mat['name']
   if 'EyeIris' not in name and 'FaceMouth' not in name and not ('Face_' in name and 'SKIN' in name):continue
   ti=mat['pbrMetallicRoughness']['baseColorTexture']['index'];im=g.doc['images'][g.doc['textures'][ti]['source']];v=g.doc['bufferViews'][im['bufferView']];raw=g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];im=Image.open(io.BytesIO(raw));f=out/(sex+'-'+('iris' if 'EyeIris' in name else 'mouth' if 'FaceMouth' in name else 'face')+'.png');im.save(f)
   idx=g.acc(p['indices']).ravel();verts=g.acc(p['attributes']['POSITION']);uv=g.acc(p['attributes']['TEXCOORD_0']);report.append({'name':name,'mesh':mi,'primitive':pi,'image':str(f),'size':im.size,'imageSha':hashlib.sha256(raw).hexdigest(),'indexSha':hashlib.sha256(idx.tobytes()).hexdigest(),'uvSha':hashlib.sha256(uv.tobytes()).hexdigest(),'targets':len(p.get('targets',[])),'bounds':[verts[idx].min(0).tolist(),verts[idx].max(0).tolist()],'uvBounds':[uv[idx].min(0).tolist(),uv[idx].max(0).tolist()]})
 print(sex,json.dumps(report));(out/(sex+'-initial.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
