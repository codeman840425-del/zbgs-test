"""Build and stage exact native-authored iris textures; never recolor pixels."""
import argparse,hashlib,json,os,struct,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets-source/native-vroid-iris-study-v1'
PINS={
 'manifest.json':'714c0448c4aa4bade52a13c68115ea384b652c5710f44e4345cb48900465b9b8',
 'cpu-readback/source-iris.png':'9bdd32f2f6032e78dff1918bfc8e1cc9e631f9813de4c6c821d14e54bea3f510',
 'cpu-readback/iris-green.png':'9ae7830f3840c8bcc17047fe974eabf9090140c84b275a182ef75b6192076c2d',
}
TARGET='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
TARGET_PATH=ROOT/'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'
BASE='/assets/native-iris-palette-v1/'
digest=lambda b:hashlib.sha256(b).hexdigest()

def resources():
 data={name:(SOURCE/name).read_bytes() for name in PINS}
 for name,b in data.items():
  if digest(b)!=PINS[name]:raise ValueError('Native source identity mismatch: '+name)
 source=json.loads(data['manifest.json']);target=TARGET_PATH.read_bytes()
 if digest(target)!=TARGET:raise ValueError('Wrong target VRM')
 if struct.unpack_from('<III',target)!=(0x46546c67,2,len(target)):raise ValueError('Invalid target GLB')
 chunks={};offset=12
 while offset<len(target):
  size,kind=struct.unpack_from('<II',target,offset);chunks[kind]=target[offset+8:offset+8+size];offset+=8+size
 doc=json.loads(chunks[0x4e4f534a]);binary=chunks[0x004e4942]
 material=doc['materials'][source['consumer']['materialIndex']]
 if material!=source['consumer']['material']:raise ValueError('Target iris material differs')
 index=material['pbrMetallicRoughness']['baseColorTexture']['index']
 if material['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index']!=index:raise ValueError('Different shade source')
 texture=doc['textures'][index];view=doc['bufferViews'][doc['images'][texture['source']]['bufferView']]
 original=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
 if original!=data['cpu-readback/source-iris.png']:raise ValueError('Target original iris bytes differ')
 for name in ['cpu-readback/source-iris.png','cpu-readback/iris-green.png']:
  b=data[name]
  if b[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack_from('>II',b,16)!=(1024,512):raise ValueError('Image dimensions differ')
 sampler=doc['samplers'][texture['sampler']]
 if sampler!={'magFilter':9729,'minFilter':9729,'wrapS':10497,'wrapT':10497}:raise ValueError('Unexpected sampler')
 manifest={'schema':'native-facial-palette-v1','id':'native-male-iris-palette-v1','version':1,
  'avatarSha256':TARGET,'sourceManifestSha256':PINS['manifest.json'],
  'iris':{'materialName':material['name'],'width':1024,'height':512,'texCoord':0,
   'source':{'url':BASE+'source-iris.png','sha256':PINS['cpu-readback/source-iris.png']},
   'colors':{'green':{'color':source['targetHex'],'url':BASE+'iris-green.png','sha256':PINS['cpu-readback/iris-green.png']}},
   'sampler':{**sampler,'flipY':False,'colorSpace':'srgb'},'alphaMode':'BLEND'}}
 return {'manifest.json':(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode(),
  'source-iris.png':data['cpu-readback/source-iris.png'],'iris-green.png':data['cpu-readback/iris-green.png']}

def stage(destination):
 data=resources()
 for name,b in data.items():
  p=destination/name
  if p.exists() and p.read_bytes()!=b:raise ValueError('Existing output differs: '+str(p))
 destination.mkdir(parents=True,exist_ok=True)
 for name,b in data.items():
  p=destination/name
  if not p.exists():
   with tempfile.NamedTemporaryFile(dir=destination,delete=False) as f:f.write(b);temp=Path(f.name)
   try:
    try:os.link(temp,p)
    except FileExistsError:
     if p.read_bytes()!=b:raise ValueError('Concurrent output differs: '+str(p))
   finally:temp.unlink()
  if p.read_bytes()!=b:raise ValueError('Readback differs: '+name)
 return {'schema':'native-iris-staging-receipt-v1','target':TARGET,'destination':str(destination),
  'files':[{'name':n,'sha256':digest(b),'bytes':len(b)} for n,b in data.items()],
  'scope':'Exact native authored color textures; no pixel recoloring, runtime/visual acceptance separate'}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--destination',type=Path,default=ROOT/'prototype/public/assets/native-iris-palette-v1');a=p.parse_args()
 print(json.dumps(stage(a.destination),ensure_ascii=False))
