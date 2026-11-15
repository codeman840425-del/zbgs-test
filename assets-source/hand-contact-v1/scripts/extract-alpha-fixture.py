"""Exact embedded source PNG pixels for offline proof/reference comparison."""
from pathlib import Path
import struct,json,io,base64,hashlib
from PIL import Image
R=Path(__file__).resolve().parents[3];P=Path(__file__).resolve().parents[1]
source=R/'prototype/public/assets/m1/m1-uniform-skirt.glb';raw=source.read_bytes()
size=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+size]);start=20+size
bin_size=struct.unpack_from('<I',raw,start)[0];binary=raw[start+8:start+8+bin_size]
material=j['materials'][0];texture=material['pbrMetallicRoughness']['baseColorTexture']['index'];image=j['images'][j['textures'][texture]['source']];view=j['bufferViews'][image['bufferView']]
image_bytes=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
im=Image.open(io.BytesIO(image_bytes)).convert('RGBA')
out=P/'evidence/alpha-texture.json';out.write_text(json.dumps({'source':str(source.relative_to(R)),'sourceSHA256':hashlib.sha256(raw).hexdigest(),'embeddedImageSHA256':hashlib.sha256(image_bytes).hexdigest(),'width':im.width,'height':im.height,'flip':False,'cutoff':material.get('alphaCutoff',.5),'rgbaBase64':base64.b64encode(im.tobytes()).decode(),'notes':'GLTFLoader flipY=false; exact decoded PNG RGBA for offline reference. Browser fixture later uses actual Canvas alpha snapshot.'}),encoding='utf8')
print(json.dumps({'out':str(out),'width':im.width,'height':im.height,'mode':material.get('alphaMode')}))
