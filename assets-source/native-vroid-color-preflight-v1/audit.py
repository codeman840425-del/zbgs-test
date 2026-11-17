"""Read sealed native avatars and producer sources; no native/editor/GPU calls."""
from pathlib import Path
import hashlib,importlib.util,io,json,sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
CASES=[('female','assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm','843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'),
       ('male','assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm','7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81')]
ROLES={'hair':'_HAIR','brow':'_FaceBrow_','faceSkin':'_Face_','bodySkin':'_Body_','iris':'_EyeIris_','eyeHighlight':'_EyeHighlight_','eyeWhite':'_EyeWhite_','mouthInside':'_FaceMouth_'}

def write(name,value):
    with (BASE/name).open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    sp=importlib.util.spec_from_file_location('original_glb_reader',ROOT/'scripts/m2-male-face-v1/glb.py')
    reader=importlib.util.module_from_spec(sp);sp.loader.exec_module(reader)
    cases=[]
    for sex,relative,pin in CASES:
        path=ROOT/relative;assert sha(path.read_bytes())==pin
        g=reader.GLB(path);d=g.doc
        selected={role:[i for i,m in enumerate(d['materials']) if token in m['name']] for role,token in ROLES.items()}
        assert all(selected.values())
        indices={i for group in selected.values() for i in group}
        cache={}
        def image(index):
            if index not in cache:
                info=d['images'][index];assert 'uri' not in info
                v=d['bufferViews'][info['bufferView']]
                raw=g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
                pixels=np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA'))
                visible=pixels[:,:,3]>0;rgb=pixels[:,:,:3]
                cache[index]=dict(index=index,mimeType=info['mimeType'],encodedSha256=sha(raw),encodedBytes=len(raw),
                    dimensions=[pixels.shape[1],pixels.shape[0]],rgbaPixelSha256=sha(pixels.tobytes()),rgbPixelSha256=sha(rgb.tobytes()),
                    alpha=dict(zero=int((pixels[:,:,3]==0).sum()),partial=int(((pixels[:,:,3]>0)&(pixels[:,:,3]<255)).sum()),full=int((pixels[:,:,3]==255).sum())),
                    wholeImageVisiblePureBlackPixels=int(((rgb==0).all(2)&visible).sum()),wholeImageVisiblePureWhitePixels=int(((rgb==255).all(2)&visible).sum()),
                    note='Whole image counts only, not pupil/highlight anatomical masks or actual covered texels')
            return cache[index]
        rows=[]
        for index in sorted(indices):
            m=d['materials'][index];slots=[]
            def textures(v,route):
                if isinstance(v,dict):
                    for k,x in v.items():
                        if 'texture' in k.lower() and isinstance(x,dict) and 'index' in x:
                            t=d['textures'][x['index']]
                            slots.append(dict(path=route+[k],texture=x['index'],image=t['source'],
                                texCoord=x.get('texCoord',0),transform=x.get('extensions',{}).get('KHR_texture_transform',{}),
                                sampler=d.get('samplers',[])[t['sampler']] if 'sampler' in t else {},imageData=image(t['source'])))
                        else:textures(x,route+[k])
                elif isinstance(v,list):
                    for i,x in enumerate(v):textures(x,route+[i])
            textures(m,[])
            consumers=[]
            for ni,n in enumerate(d['nodes']):
                if 'mesh' not in n:continue
                for pi,p in enumerate(d['meshes'][n['mesh']]['primitives']):
                    if p['material']!=index:continue
                    ids=np.unique(g.acc(p['indices']))
                    uv=p['attributes'].get('TEXCOORD_0')
                    consumers.append(dict(node=ni,mesh=n['mesh'],primitive=pi,referencedVertices=len(ids),
                        triangles=g.acc(p['indices']).size//3,positionAccessor=p['attributes']['POSITION'],indexAccessor=p['indices'],
                        uvAccessor=uv,uvSHA256=sha(g.acc(uv).tobytes()) if uv is not None else None,
                        morphTargets=len(p.get('targets',[])),indexSHA256=sha(g.acc(p['indices']).tobytes())))
            rows.append(dict(index=index,name=m['name'],roles=[role for role,group in selected.items() if index in group],
                materialJSON=m,textureSlots=slots,primitiveConsumers=consumers,
                imageConsumers={str(slot['image']):[other['name'] for other in d['materials'] if any(t.get('source')==slot['image'] and other.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')==j for j,t in enumerate(d['textures']))] for slot in slots}))
        expr=d['extensions']['VRMC_vrm'].get('expressions',{})
        expression_summary=[]
        for group,values in expr.items():
            for name,e in values.items():
                expression_summary.append(dict(group=group,name=name,morphBinds=len(e.get('morphTargetBinds',[])),
                    materialColorBinds=e.get('materialColorBinds',[]),textureTransformBinds=e.get('textureTransformBinds',[])))
        cases.append(dict(sex=sex,avatar=dict(path=relative,sha256=pin,bytes=path.stat().st_size),
            derivedFromTwoNativeSources=True,singleMergedEditableVroidExists=False,
            nodes=len(d['nodes']),skinJointCounts=[len(s['joints']) for s in d['skins']],
            roles=selected,materials=rows,dedicatedLipMaterialExists=any('_Lip_' in m['name'] for m in d['materials']),
            expressionBindings=expression_summary,sourceMeta=d['extensions']['VRMC_vrm']['meta'],
            morphRoleInterpretation='Source expression deformation channels move these surfaces; they are not color-production controls'))
    observed=json.loads((ROOT/'assets-source/native-vroid-appearance-producer-v1/color-recipe-template.json').read_bytes())
    author_root='assets-source/vroid-expression-study-v1/private-tools/upstream/'
    refs=['assets-source/native-vroid-appearance-producer-v1/readback.json',
          'assets-source/native-vroid-appearance-producer-v1/color-recipe-template.json',
          'assets-source/native-vroid-hairset-study-v1/closure.json',
          'assets-source/vroid-expression-study-v1/prepared/source-receipt.json',
          'assets-source/vroid-expression-study-v1/README.md',
          'assets-source/native-vroid-appearance-producer-v1/official-source/Hair.cs',
          'assets-source/native-vroid-appearance-producer-v1/official-source/VRoidApi.cs',
          'experiments/tools/vroid-mcp-bridge-0.15.0/package/VRoidMcp-v0.15.0/docs/AGENT_REFERENCE_EN.md',
          author_root+'agent/advanced_materials.js',author_root+'agent/color_state.js',author_root+'agent/parameters.js',
          author_root+'vroid_mcp/makeup_tools.py','prototype/src/appearance-color-policy.js',
          'prototype/src/character-appearance.js','prototype/src/facial-palette-contract.js']
    write('source-inventory.json',dict(schema='native-color-source-inventory-v1',cases=cases,
        existingObservedNativeColors=observed['observedColors'],
        sourceReferences=[dict(path=p,sha256=sha((ROOT/p).read_bytes()),bytes=(ROOT/p).stat().st_size) for p in refs],
        nativeCalls=0,sourceOrRuntimeEdited=False,newArtAssetsGenerated=False))
    print(json.dumps({'cases':len(cases),'materialRolesPerCase':{c['sex']:len(c['materials']) for c in cases},'nativeCalls':0}))

if __name__=='__main__':main()
