from pathlib import Path
import argparse,hashlib,json,importlib.util,io
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
AV=ROOT/'assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm';AS='cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce';DONOR=ROOT/'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm';DS='843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef';MASK_SOURCE=ROOT/'assets-source/native-vroid-body-texture-fit-v1/native-tops-body.png';MS='dc375769e28d015bc70c3cef6be1dec3794b5b2430a9bf173d60584105f68a8c'
sp=importlib.util.spec_from_file_location('g',ROOT/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
def body_png(g):
 rows=[(i,x) for i,x in enumerate(g.doc['materials']) if '_Body_' in x['name'] and '_SKIN' in x['name']];assert len(rows)==1;mi,mat=rows[0];ti=mat['pbrMetallicRoughness']['baseColorTexture']['index'];shade=mat['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index'];assert ti==shade;ii=g.doc['textures'][ti]['source'];assert ii==11;v=g.doc['bufferViews'][g.doc['images'][ii]['bufferView']];png=g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];return mi,ii,png
def put(name,value,check):
 data=json.dumps(value,ensure_ascii=False,indent=2).replace('\n','\r\n').encode() + b'\r\n';p=BASE/name
 if p.exists():
  if p.read_bytes()!=data:raise ValueError('existing output differs: '+name)
  return
 if check:raise FileNotFoundError('check missing output: '+name)
 p.write_bytes(data)
def main(check=False):
 assert sha(AV.read_bytes())==AS and sha(DONOR.read_bytes())==DS and sha(MASK_SOURCE.read_bytes())==MS
 mask=MASK_SOURCE.read_bytes();g=m.GLB(AV);donor=m.GLB(DONOR);mi,ii,full=body_png(g);dmi,dii,donorPNG=body_png(donor);a=np.asarray(Image.open(io.BytesIO(full)).convert('RGBA'));b=np.asarray(Image.open(io.BytesIO(donorPNG)).convert('RGBA'));assert a.shape==b.shape==(2048,2048,4) and np.array_equal(a[:,:,:3],b[:,:,:3]) and (a[:,:,3]==255).all()
 assert mask== (BASE/'native-tops-body.png').read_bytes();shoes=m.GLB(ROOT/'assets-source/native-vroid-face-factory-equipment-v1/native-vroid-face-geometry-shoes-v1.glb');parts=[]
 for mesh in shoes.doc['meshes']:
  for p in mesh['primitives']:
   ids=np.unique(shoes.acc(p['indices']));parts.append(shoes.acc(p['attributes']['POSITION'])[ids])
 xyz=np.concatenate(parts);floor=float(xyz[:,1].min());runtimeFloor=-8.449510756150829e-7
 items=[{'id':'native-vroid-face-geometry-top-v1','slot':'top','sha256':'12bb9600c329b191862f04c13883f518b3b9538ebcafe7392ec58df909d54042','covered':True,'required':True,'compatibleAvatarSha256':AS},{'id':'native-vroid-face-geometry-shorts-v1','slot':'bottom','sha256':'b8725064bf99bc9ae45d6af5200e81baba9a95d1497e57149cd47e7481103f4d','covered':False,'required':True,'compatibleAvatarSha256':AS},{'id':'native-vroid-face-geometry-shoes-v1','slot':'shoes','sha256':'b92422c1ba7c018b04f80195d248f1ad46306a7fe7839ce2b44a9a1fbf26f3bc','covered':False,'required':True,'compatibleAvatarSha256':AS}]
 put('manifest.json',dict(schema='native-body-texture-coverage-v1',id='native-vroid-face-geometry-body-texture-fit-v1',avatarSha256=AS,materialName=g.doc['materials'][mi]['name'],width=2048,height=2048,alphaTest=.5,basePngSha256=sha(full),covered={'url':'native-tops-body.png','sha256':MS},rgbPreserved=True,equipment=items,sourceMaskLineage={'oldMaskPath':str(MASK_SOURCE.relative_to(ROOT)).replace('\\','/'),'oldMaskSha256':MS,'reuseReason':'Face Body image11 base/shade consumer, UV, RGB and dimensions verified; old native alpha mask copied byte-exact'},scope='Face-derived body only; exact old mask bytes reused, no triangle approximation'),check)
 put('pixel-readback.json',dict(schema='native-vroid-face-body-texture-fit-pixels-v1',avatarSha256=AS,fullBodyPngSha256=sha(full),fullBodyRGBExactDonor=True,fullBodyAlphaAll255=True,maskPngSha256=MS,maskBytesExact=True,maskChanged=False,bodyMaterial=mi,bodyImage=ii,baseShadeTextureIndexExact=True,sourceFloorYRaw=floor,sourceFloorYDefinition='minimum of actual indexed shoes POSITION vertices',runtimeRestFloorY=runtimeFloor,sourceFloorY=floor,limitations=['Face-derived normal/face geometry do not prove garment visual coverage','No runtime/game/visual acceptance']),check)
 put('profile-candidate.json',dict(schema='native-vroid-face-factory-profile-candidate-v1',status='data-only-not-registered',profile=dict(id='native-vroid-face-geometry-unmasked-v1',label='原生女性 Face 派生 · 皮肤接缝',url='../native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm',sha256=AS,manifestUrl='manifest.json',sourceFloorY=floor,sourceFloorYRaw=floor,runtimeRestFloorY=runtimeFloor,ids={'top':'native-vroid-face-geometry-top-v1','shorts':'native-vroid-face-geometry-shorts-v1','shoes':'native-vroid-face-geometry-shoes-v1'},defaultOutfit={'index':0,'role':'shorts','equipmentRoles':['top','shorts','shoes'],'bottomRole':'shorts'},fitStatus='CPU source/body mask seam only; equipment rest readback passed with normalization drift; runtime/visual pending'),pending=['new body face close-up and expressions','coverage/runtime same-room chain','motion/contact and recipe restore']),check)
 print(json.dumps({'status':'check' if check else 'built','avatar':AS,'mask':MS,'sourceFloorYRaw':floor,'runtimeRestFloorY':runtimeFloor}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');main(p.parse_args().check)
