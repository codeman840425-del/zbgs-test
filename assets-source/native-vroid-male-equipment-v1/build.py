"""Exact male primitive extraction and target79-bone fit; no geometry conversion."""
from pathlib import Path
import argparse, copy, hashlib, importlib.util, json, struct, sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
TARGET='assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'
ORIGINAL='assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
TARGET_SHA='7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'
PINS={TARGET:TARGET_SHA,ORIGINAL:'a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da',
 'assets-source/native-vroid-male-preflight-v1/generated/extraction-input.json':'0d3397a4ad4347d331dc801fb71e3342238d902d88fbbc4887e83109e3b44bb5',
 'assets-source/native-vroid-male-unmasked-base-v1/generated/manifest.json':'7f11fdee6e0d76ae563e67005f5613e2e8b6840291ff86f5bf3af2c3f32c226c'}
sha=lambda b:hashlib.sha256(b).hexdigest()
encoded=lambda x:(json.dumps(x,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode()

def plan():
    for path,pin in PINS.items():assert sha((ROOT/path).read_bytes())==pin,path
    spec=importlib.util.spec_from_file_location('sealed_native_binding_reader',ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py')
    rb=importlib.util.module_from_spec(spec);spec.loader.exec_module(rb)
    target,original=[rb.a.reader.GLB(ROOT/p) for p in [TARGET,ORIGINAL]]
    source,binary=target.doc,target.bin
    assert source['accessors']==original.doc['accessors']
    assert all(target.acc(i).tobytes()==original.acc(i).tobytes() for i in range(len(source['accessors'])))
    for key in ['nodes','skins','meshes','materials','textures','samplers','extensions']:
        assert source[key]==original.doc[key],key
    bones,world,names=rb.skeleton(target)
    assert len(set(names))==len(names)
    selections=json.loads((ROOT/'assets-source/native-vroid-male-preflight-v1/generated/extraction-input.json').read_bytes())
    human={v['node']:k for k,v in source['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    files,items,readbacks={ },[],[]
    floor=None
    for selected in selections['items']:
        ni,mi,pi,si=[selected[k] for k in ['node','mesh','primitive','skin']]
        assert source['nodes'][ni]=={'name':'Body','mesh':mi,'skin':si}
        primitive=source['meshes'][mi]['primitives'][pi]
        assert primitive['attributes']==selected['attributes'] and primitive['indices']==selected['indexAccessor']
        material=source['materials'][primitive['material']]
        assert material['name']==selected['materialName'] and not primitive.get('targets')
        skin=source['skins'][si]
        assert len(skin['joints'])==79
        standalone,bufferviews,accessors,textures,images=bytearray(),[],[],[],[]
        vm,am,tm,im={},{},{},{}
        def view(old):
            if old not in vm:
                v=copy.deepcopy(source['bufferViews'][old]);assert v['buffer']==0
                raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
                standalone.extend(b'\0'*(-len(standalone)%4));v['byteOffset']=len(standalone);standalone.extend(raw)
                vm[old]=len(bufferviews);bufferviews.append(v)
            return vm[old]
        def accessor(old):
            if old not in am:
                a=copy.deepcopy(source['accessors'][old]);assert not a.get('sparse')
                a['bufferView']=view(a['bufferView']);am[old]=len(accessors);accessors.append(a)
            return am[old]
        def image(old):
            if old not in im:
                i=copy.deepcopy(source['images'][old]);assert 'uri' not in i
                i['bufferView']=view(i['bufferView']);im[old]=len(images);images.append(i)
            return im[old]
        def texture(old):
            if old not in tm:
                t=copy.deepcopy(source['textures'][old]);assert not t.get('extensions')
                t['source']=image(t['source']);tm[old]=len(textures);textures.append(t)
            return tm[old]
        def remap_textures(v):
            if isinstance(v,dict):
                for k,x in v.items():
                    if 'texture' in k.lower() and isinstance(x,dict) and 'index' in x:x['index']=texture(x['index'])
                    else:remap_textures(x)
            elif isinstance(v,list):
                for x in v:remap_textures(x)
        p=copy.deepcopy(primitive);p['attributes']={k:accessor(v) for k,v in p['attributes'].items()}
        p['indices']=accessor(p['indices']);p['material']=0
        own_skin=copy.deepcopy(skin);own_skin['inverseBindMatrices']=accessor(skin['inverseBindMatrices'])
        own_material=copy.deepcopy(material);remap_textures(own_material)
        nodes=copy.deepcopy(source['nodes'])
        for node in nodes:node.pop('mesh',None);node.pop('skin',None)
        nodes[ni].update(mesh=0,skin=0)
        doc=dict(asset={'version':'2.0','generator':'native-vroid-male-equipment-v1 exact original primitive extraction'},
            scene=source.get('scene',0),scenes=copy.deepcopy(source['scenes']),nodes=nodes,skins=[own_skin],
            meshes=[{'name':'NativeMale-'+selected['slot'],'primitives':[p]}],materials=[own_material],textures=textures,images=images,
            samplers=copy.deepcopy(source.get('samplers',[])),accessors=accessors,bufferViews=bufferviews,buffers=[{'byteLength':len(standalone)}],
            extras={'sourceAvatarSha256':TARGET_SHA,'originalGarmentSourceSha256':PINS[ORIGINAL],
                    'sourceMesh':mi,'sourcePrimitive':pi,'scope':'CPU exact extraction; original avatar owns spring simulation'})
        extensions=set()
        def scan(v):
            if isinstance(v,dict):
                extensions.update(v.get('extensions',{}))
                for x in v.values():scan(x)
            elif isinstance(v,list):
                for x in v:scan(x)
        scan(doc);doc['extensionsUsed']=sorted(extensions)
        doc['extensionsRequired']=[x for x in source.get('extensionsRequired',[]) if x in extensions]
        js=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
        standalone.extend(b'\0'*(-len(standalone)%4))
        raw=struct.pack('<4sII',b'glTF',2,28+len(js)+len(standalone))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(standalone),b'BIN\0')+standalone
        role='shorts' if selected['slot']=='bottom' else selected['slot']
        ident='native-unmasked-7586-'+role+'-v1';name=ident+'.glb';files[name]=raw
        bindings=[dict(sourceBone=names[n],targetRawBone=names[n],humanoidSemantic=human.get(n),inverseBindMatrix=matrix.tolist()) for n,matrix in zip(skin['joints'],target.acc(skin['inverseBindMatrices']))]
        items.append(dict(id=ident,name='原生男性 · '+role,slot=selected['slot'],url=name,sha256=sha(raw),bytes=len(raw),
            compatibleAvatarSha256=TARGET_SHA,preserveOriginalBody=True,requiresRawSkeleton=True,bindings=bindings,
            sourceLicense={'status':'internal-study-only','sourceVRMMeta':source['extensions']['VRMC_vrm']['meta']},
            limits=['Exact original male piece only; original79bone avatar provides auxiliary bones/springs',
                    'CPU source/adapter evidence only; no visual, contact or factory admission']))
        actual=rb.primitive(target,world,names,material['name'])
        used=sorted(set(np.array(actual['jointNames'])[actual['attrs']['JOINTS_0'][actual['ids']].astype(int)][actual['attrs']['WEIGHTS_0'][actual['ids']]>0].tolist()))
        readbacks.append(dict(id=ident,slot=selected['slot'],sourceNode=ni,sourceMesh=mi,sourcePrimitive=pi,sourceSkin=si,
            materialName=material['name'],sourceAttributes=primitive['attributes'],sourceIndices=primitive['indices'],
            accessorMap=am,bufferViewMap=vm,textureMap=tm,imageMap=im,referencedVertices=len(actual['ids']),
            triangles=len(actual['tri']),attributeRows=len(actual['attrs']['POSITION']),usedBones=used,
            originalA18aAttributesAndIndicesExact=True,targetBindingsConstructed=79,
            meshWorldRest=world[ni].tolist(),sourceParentRestAndIBM='Exact because target all nodes/skins and decoded accessors independently equal a18a'))
        if role=='shoes':
            xyz=actual['rest'];ids=actual['ids'];y=float(xyz[ids,1].min());low=ids[xyz[ids,1]==y]
            faces=np.flatnonzero(np.isin(actual['tri'],low).any(1))
            floor=dict(schema='male-native-shoe-floor-measurement-v1',sourceFloorY=y,
                source='actual Shoes referenced rest skin world vertices in metres; minimum on indexed piecewise-linear triangles',
                avatarSha256=TARGET_SHA,lowestVertexIds=low.tolist(),lowestWorldXYZ=xyz[low].tolist(),incidentTriangleIds=faces.tolist(),
                unusedSharedAccessorRowsExcluded=True,limitations=['Rest measurement only; no animated contact or floor admission'])
    files['equipment.json']=encoded(dict(schema='zbgs-equipment-v1',id='native-unmasked-7586-equipment-v1',status='CPU-source-fit-not-factory-admitted',items=items))
    files['extraction.json']=encoded(dict(schema='male-native-exact-equipment-extraction-v1',targetAvatar=dict(path=TARGET,sha256=TARGET_SHA),
        originalGarmentSource=dict(path=ORIGINAL,sha256=PINS[ORIGINAL]),items=readbacks,
        sourceImagesMaterialsNormalsUVIndicesWeightsIBMUnchanged=True,geometryConverted=False,
        notes=['All original nodes retained but only selected garment primitive exported',
               'No duplicate VRMC spring manager in garment GLB; target original79bone VRM owns springs']))
    files['floor-measurement.json']=encoded(floor)
    return files

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=BASE/'generated');args=p.parse_args()
    files=plan();assert files==plan(),'Repeated in-memory plan differs'
    output=args.out.resolve();assert not output.exists(),'Fresh output directory required'
    output.mkdir(parents=True)
    for name,data in files.items():
        with (output/name).open('xb') as f:f.write(data)
    print(json.dumps({'files':{name:{'bytes':len(data),'sha256':sha(data)} for name,data in files.items()}}))

if __name__=='__main__':main()
