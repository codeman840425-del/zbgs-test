from pathlib import Path
import sys,importlib.util,hashlib,json,copy,io
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[2];O=Path(__file__).resolve().parent;h=lambda b:hashlib.sha256(b).hexdigest()
s=importlib.util.spec_from_file_location('g',R/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
av=R/'assets-source/native-vroid-geometry-factory-input-v1/generated/female-geometry-face-unmasked.vrm';old=R/'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm'
g=m.GLB(av);don=m.GLB(old);assert h(av.read_bytes())=='cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce'
E=R/'assets-source/native-vroid-face-factory-equipment-v1';T=R/'assets-source/native-vroid-face-body-texture-fit-v1'
cat=json.loads((E/'equipment.json').read_text(encoding='utf8'));ex=json.loads((E/'extraction.json').read_text(encoding='utf8'))
def image(gl,i):
 v=gl.doc['bufferViews'][gl.doc['images'][i]['bufferView']];return gl.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def eq(a,b):return a.shape==b.shape and a.dtype==b.dtype and a.tobytes()==b.tobytes()
def restore(v,rev):
 if isinstance(v,list):
  for x in v:restore(x,rev)
 elif isinstance(v,dict):
  for k,x in v.items():
   if 'texture' in k.lower()and isinstance(x,dict)and 'index'in x:x['index']=rev[x['index']]
   else:restore(x,rev)
items=[]
for entry,row in zip(cat['items'],ex['records']):
 p=E/entry['url'];b=m.GLB(p);assert h(p.read_bytes())==entry['sha256'];assert entry['compatibleAvatarSha256']==h(av.read_bytes())
 src=g.doc['meshes'][row['sourceMesh']]['primitives'][row['sourcePrimitive']];dst=b.doc['meshes'][0]['primitives'][0]
 for k,i in src['attributes'].items():assert eq(g.acc(i),b.acc(dst['attributes'][k]))
 assert eq(g.acc(src['indices']),b.acc(dst['indices']))
 sk=g.doc['skins'][row['sourceSkin']];bk=b.doc['skins'][0];assert sk['joints']==bk['joints'];assert eq(g.acc(sk['inverseBindMatrices']),b.acc(bk['inverseBindMatrices']))
 for i,n in enumerate(b.doc['nodes']):
  x,y=copy.deepcopy(n),copy.deepcopy(g.doc['nodes'][i])
  for d in [x,y]:d.pop('mesh',None);d.pop('skin',None)
  assert x==y
 ibm=g.acc(sk['inverseBindMatrices'])
 for j,bind in enumerate(entry['bindings']):
  assert bind['sourceBone']==bind['targetRawBone']==g.doc['nodes'][sk['joints'][j]]['name'];assert np.array_equal(ibm[j].astype(float),bind['inverseBindMatrix'])
 mat=copy.deepcopy(b.doc['materials'][0]);restore(mat,{v:int(k)for k,v in row['maps']['textures'].items()});assert mat==g.doc['materials'][src['material']]
 for oldi,newi in row['maps']['images'].items():assert image(g,int(oldi))==image(b,newi)
 assert b.doc['samplers']==g.doc['samplers']
 ids=np.unique(b.acc(dst['indices']));xyz=b.acc(dst['attributes']['POSITION'])
 items.append({'id':entry['id'],'slot':entry['slot'],'sha256':entry['sha256'],'allAttributesIndicesIBMExact':True,'restNodesExact':True,'bindings':len(entry['bindings']),'materialAndImagesExact':True,'referencedVertices':len(ids),'rawReferencedMinY':float(xyz[ids,1].min()),'rawAllSharedRowsMinY':float(xyz[:,1].min())})
def body(gl):return next(p for mesh in gl.doc['meshes']for p in mesh['primitives']if '_Body_'in gl.doc['materials'][p['material']]['name']and '_SKIN'in gl.doc['materials'][p['material']]['name'])
bp,op=body(g),body(don);ids=np.unique(g.acc(bp['indices']));assert eq(g.acc(bp['indices']),don.acc(op['indices']))
for key in ['POSITION','TEXCOORD_0','JOINTS_0','WEIGHTS_0']:assert eq(g.acc(bp['attributes'][key])[ids],don.acc(op['attributes'][key])[ids])
assert g.doc['materials'][bp['material']]==don.doc['materials'][op['material']]
bm=g.doc['materials'][bp['material']];ti=bm['pbrMetallicRoughness']['baseColorTexture']['index'];assert bm['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index']==ti;ii=g.doc['textures'][ti]['source'];assert ii==11
full=image(g,ii);assert full==image(don,11);mask=(T/'native-tops-body.png').read_bytes();assert mask==(R/'assets-source/native-vroid-body-texture-fit-v1/native-tops-body.png').read_bytes()
a=np.asarray(Image.open(io.BytesIO(full)).convert('RGBA'));b=np.asarray(Image.open(io.BytesIO(mask)).convert('RGBA'));assert np.array_equal(a[:,:,:3],b[:,:,:3]);assert np.all(a[:,:,3]==255)
out={'schema':'native-face-factory-source-independent-v1','avatarSha256':h(av.read_bytes()),'equipmentManifestSha256':h((E/'equipment.json').read_bytes()),'items':items,'body':{'image':ii,'material':bm['name'],'baseShadeSameTexture':True,'sourceAndMaskRGBExact':True,'oldCompletePNGExact':True,'oldMaskBytesExact':True,'actualBodyPositionUVIndicesJointsWeightsExact':True,'bodyNormalMayChange':True,'fullPngSHA':h(full),'maskedPngSHA':h(mask),'alphaChangedPixels':int(np.count_nonzero(a[:,:,3]!=b[:,:,3]))},'scope':'Exact raw source and extracted bindings/material data; no motion/contact/game acceptance'}
with(O/'source-result.json').open('x',encoding='utf8')as f:json.dump(out,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps(out,ensure_ascii=False))
