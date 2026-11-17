"""CPU/source-only comparison. No new PNG, VRM, runtime mutation or editor call."""
from pathlib import Path
import sys,hashlib,importlib.util,io,json
import numpy as np
from PIL import Image
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location('glb',ROOT/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
cases=[('original','assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm','78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3'),
 ('unmasked','assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm','843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'),
 ('sleeveBaseline','evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-baseline.vrm','88a34746c9563112e7c75231345c1a9efba14b9628720b1c281aecbd91ab224a'),
 ('sleeve56','evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-reused.vrm','6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634')]
sha=lambda b:hashlib.sha256(b).hexdigest()
rows=[];data={}
for name,relative,pin in cases:
    path=ROOT/relative;assert sha(path.read_bytes())==pin
    g=m.GLB(path);d=g.doc
    mi=next(i for i,x in enumerate(d['materials']) if '_Body_'in x['name'] and '_SKIN'in x['name'])
    material=d['materials'][mi];info=material['pbrMetallicRoughness']['baseColorTexture'];ti=info['index'];tex=d['textures'][ti];im=d['images'][tex['source']];v=d['bufferViews'][im['bufferView']]
    png=g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];pixels=np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))
    ps=[p for mesh in d['meshes'] for p in mesh['primitives'] if p['material']==mi];assert len(ps)==1;p=ps[0]
    indices=g.acc(p['indices']).reshape(-1,3);uv=g.acc(p['attributes']['TEXCOORD_0'])[indices];pos=g.acc(p['attributes']['POSITION'])[indices]
    data[name]=(pixels,indices,uv,pos)
    rows.append(dict(name=name,path=relative,avatarSha256=pin,bodyMaterial=mi,image=tex['source'],pngSha256=sha(png),rgbaSha256=sha(pixels.tobytes()),rgbSha256=sha(pixels[:,:,:3].tobytes()),alphaSha256=sha(pixels[:,:,3].tobytes()),dimensions=list(pixels.shape),sampler=d['samplers'][tex['sampler']],baseInfo=info,shadeInfo=material['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture'],alphaMode=material.get('alphaMode'),alphaCutoff=material.get('alphaCutoff'),triangles=len(indices)))
original=data['original'];unmasked=data['unmasked'];comparisons={}
for name in ['unmasked','sleeveBaseline','sleeve56']:
    x=data[name];comparisons[name]=dict(bodyIndexExact=bool(np.array_equal(original[1],x[1])),bodyUVByTriangleExact=bool(np.array_equal(original[2],x[2])),bodyPositionByTriangleExact=bool(np.array_equal(original[3],x[3])),RGBExact=bool(np.array_equal(original[0][:,:,:3],x[0][:,:,:3])),alphaExact=bool(np.array_equal(original[0][:,:,3],x[0][:,:,3])),RGBAExact=bool(np.array_equal(original[0],x[0])))
proof=unmasked[0].copy();proof[:,:,3]=original[0][:,:,3]
assert np.array_equal(proof,original[0])
result=dict(schema='native-body-skinmask-pixel-reuse-proof-v1',sources=rows,comparisonsToOriginal=comparisons,CPUAlphaRecombineMatchesNativeRGBAExact=True,
 limitations=['In-memory byte equality only; no browser PNG decode/upload/shader/shadow test','Matching Body image/UV does not grant modified garment geometry/bind fit','No runtime compositing/texture switch implemented and no pixels exported'])
with (OUT/'pixel-proof.json').open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'comparisons':comparisons,'CPUAlphaRecombineMatchesNativeRGBAExact':True}))
