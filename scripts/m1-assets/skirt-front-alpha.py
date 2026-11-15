"""Extract actual glTF alpha channels for the offline triangle probe."""
import base64,hashlib,io,json,struct,zlib
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/m1/seated-front-v1'
sources=['prototype/public/assets/foundation/base-female-roundtrip.vrm','prototype/public/assets/m1/m1-uniform-top.glb','prototype/public/assets/m1/m1-uniform-skirt.glb']
result={'schema':'actual-gltf-alpha-v1','sources':{},'materials':{}}
for name in sources:
 raw=(ROOT/name).read_bytes();length=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+length]);binary=raw[28+length:]
 result['sources'][name]=hashlib.sha256(raw).hexdigest()
 for m in d['materials']:
  info=m.get('pbrMetallicRoughness',{}).get('baseColorTexture')
  if not info:continue
  assert not info.get('extensions'), 'Texture transform requires explicit handling'
  t=d['textures'][info['index']];image=d['images'][t['source']];view=d['bufferViews'][image['bufferView']]
  b=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
  im=Image.open(io.BytesIO(b)).convert('RGBA');a=im.getchannel('A').tobytes()
  result['materials'][m['name']]={'width':im.width,'height':im.height,'zlibAlphaBase64':base64.b64encode(zlib.compress(a)).decode(),
   'alphaCutoff':m.get('alphaCutoff',.5) if m.get('alphaMode')=='MASK' else 0,
   'baseAlpha':m.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])[3],
   'sampler':d.get('samplers',[{}])[t.get('sampler',0)] if d.get('samplers') else {},
   'textureSha256':hashlib.sha256(b).hexdigest()}
(OUT/'alpha-input.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('Actual material alpha maps:',len(result['materials']))
