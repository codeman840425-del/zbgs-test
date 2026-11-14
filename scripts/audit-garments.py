"""Read-only source-asset/material inventory; writes diagnostic output only."""
import base64
import hashlib
import json
import pathlib
import struct

ROOT=pathlib.Path(__file__).resolve().parent.parent
data=(ROOT/'prototype/public/assets/avatar.vrm').read_bytes()
assert hashlib.sha256(data).hexdigest()=='12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2'
length=struct.unpack_from('<I',data,12)[0]
gltf=json.loads(data[20:20+length])
materials=[]
for i,m in enumerate(gltf['materials']):
    materials.append({'index':i,'name':m.get('name'),'alphaMode':m.get('alphaMode','OPAQUE'),'alphaCutoff':m.get('alphaCutoff'),'doubleSided':m.get('doubleSided',False),'baseColorTexture':m.get('pbrMetallicRoughness',{}).get('baseColorTexture'), 'mtoon':m.get('extensions',{}).get('VRMC_materials_mtoon')})
meshes=[]
for i,m in enumerate(gltf['meshes']):
    meshes.append({'index':i,'name':m.get('name'),'nodes':[n.get('name') for n in gltf['nodes'] if n.get('mesh')==i],'primitives':[{'index':k,'material':materials[p['material']]['name'],'vertexCount':gltf['accessors'][p['attributes']['POSITION']]['count'],'positionBounds':[gltf['accessors'][p['attributes']['POSITION']].get('min'),gltf['accessors'][p['attributes']['POSITION']].get('max')],'attributes':list(p['attributes'])} for k,p in enumerate(m['primitives'])]})
report={'sourceSha256':hashlib.sha256(data).hexdigest(),'materials':materials,'meshes':meshes,'imageCount':len(gltf.get('images',[]))}
out=ROOT/'output/garment-audit';out.mkdir(parents=True,exist_ok=True)
(out/'source-inventory.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
# Keep the exact installed source used to reason about outline generation/shader behavior.
bundle=(ROOT/'prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js').read_text(encoding='utf-8')
source_map=json.loads(base64.b64decode(bundle.split('sourceMappingURL=data:application/json;base64,')[1]))
for name,content in zip(source_map['sources'],source_map['sourcesContent']):
    if name.endswith(('MToonMaterialLoaderPlugin.ts','mtoon.vert','mtoon.frag')):
        (out/pathlib.Path(name).name).write_text(content,encoding='utf-8')
print(json.dumps({'materials':[{'name':x['name'],'alphaMode':x['alphaMode'],'doubleSided':x['doubleSided'],'outline':x['mtoon'].get('outlineWidthMode'),'outlineFactor':x['mtoon'].get('outlineWidthFactor')} for x in materials],'meshes':meshes},indent=2))
