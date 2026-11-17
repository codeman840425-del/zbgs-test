"""One deterministic CPU derivative: original VRM + exact native-restored Body PNG.
No raster edits, mesh/bone edits, native tool calls or runtime registration.
"""
from pathlib import Path
import copy,hashlib,importlib.util,io,json,struct,sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
DONOR=ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vrm'
PINS={SOURCE:'78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3',DONOR:'188d6e2b423d5baeae11e5dffbed88b8508edaed08eda6d8177cf07ee330bcec'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(path,data):
    with path.open('x',encoding='utf-8') as f:json.dump(data,f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n')
def load(path):
    raw=path.read_bytes();assert sha(raw)==PINS[path]
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    size,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON'
    n,kind=struct.unpack_from('<I4s',raw,20+size);assert kind==b'BIN\0'
    assert len(raw)==28+size+n
    doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
    assert len(doc['buffers'])==1 and 'uri' not in doc['buffers'][0]
    return doc,binary
def png(doc,binary,index):
    image=doc['images'][index];assert image['mimeType']=='image/png' and 'uri' not in image
    v=doc['bufferViews'][image['bufferView']];assert v['buffer']==0
    return binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def body(doc):
    matches=[(i,m) for i,m in enumerate(doc['materials']) if '_Body_'in m['name'] and '_SKIN'in m['name']];assert len(matches)==1
    mi,m=matches[0];base=m['pbrMetallicRoughness']['baseColorTexture']['index'];shade=m['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index']
    assert base==shade,'Base/shade do not share the same texture; stop instead of guessing'
    return mi,base,doc['textures'][base]['source']
def texture_references(doc):
    refs=[]
    def visit(value,path):
        if isinstance(value,dict):
            for k,v in value.items():
                if 'texture'in k.lower() and isinstance(v,dict) and 'index'in v:refs.append(dict(path=path+[k],texture=v['index']))
                visit(v,path+[k])
        elif isinstance(value,list):
            for i,v in enumerate(value):visit(v,path+[i])
    visit(doc,[])
    return refs
def main():
    generated=OUT/'generated';generated.mkdir(exist_ok=False)
    source,binary=load(SOURCE);donor,donorBinary=load(DONOR)
    material,texture,image=body(source);dmat,dtex,dimage=body(donor)
    oldPNG,newPNG=png(source,binary,image),png(donor,donorBinary,dimage)
    original=np.asarray(Image.open(io.BytesIO(oldPNG)).convert('RGBA'))
    restored=np.asarray(Image.open(io.BytesIO(newPNG)).convert('RGBA'))
    textures=[i for i,t in enumerate(source['textures']) if t.get('source')==image]
    references=[r for r in texture_references(source) if r['texture']in textures]
    expected=[['materials',material,'pbrMetallicRoughness','baseColorTexture'],['materials',material,'extensions','VRMC_materials_mtoon','shadeMultiplyTexture']]
    consumers=[dict(mesh=mi,primitive=pi) for mi,m in enumerate(source['meshes']) for pi,p in enumerate(m['primitives']) if p['material']==material]
    preflight=dict(schema='native-unmasked-body-image-preflight-v1',sourceSha256=PINS[SOURCE],donorSha256=PINS[DONOR],sourceBodyMaterial=material,sourceImage=image,sourceTextures=textures,references=references,materialConsumers=consumers,donorBodyMaterial=dmat,donorImage=dimage,
        originalPNGsha256=sha(oldPNG),nativeRestoredPNGsha256=sha(newPNG),imageDimensions=list(original.shape),sameDimensions=original.shape==restored.shape,
        decodedRGBExact=bool(np.array_equal(original[:,:,:3],restored[:,:,:3])),restoredAlphaAll255=bool((restored[:,:,3]==255).all()))
    write(OUT/'preflight.json',preflight)
    assert textures==[texture] and sorted(repr(r['path']) for r in references)==sorted(map(repr,expected)),'Unexpected image consumers'
    assert consumers==[{'mesh':1,'primitive':0}]
    assert source['extensions']['VRMC_vrm']['meta'].get('thumbnailImage')!=image
    assert all(not t.get('extensions') for t in source['textures']),'Alternative texture sources need explicit audit'
    assert preflight['sameDimensions'] and preflight['decodedRGBExact'] and preflight['restoredAlphaAll255']
    # Preserve original BIN in full, including its obsolete image bytes. Only add one new view.
    doc=copy.deepcopy(source);blob=bytearray(binary);blob.extend(b'\0'*(-len(blob)%4));offset=len(blob)
    blob.extend(newPNG);newView=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(newPNG)))
    oldView=doc['images'][image]['bufferView'];doc['images'][image]['bufferView']=newView
    doc['buffers'][0]['byteLength']=len(blob);blob.extend(b'\0'*(-len(blob)%4))
    encoded=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8');encoded+=b' '*(-len(encoded)%4)
    raw=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(blob))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    target=generated/'female-native-unmasked-130-v1.vrm'
    with target.open('xb') as f:f.write(raw)
    with (generated/'native-restored-body.png').open('xb') as f:f.write(newPNG)
    # Independent parse of written artifact; exact allowed JSON delta and original-byte prefix.
    saved=target.read_bytes();jsize=struct.unpack_from('<I',saved,12)[0];actual=json.loads(saved[20:20+jsize]);actualBIN=saved[28+jsize:]
    normalized=copy.deepcopy(actual);assert normalized['bufferViews'].pop()==dict(buffer=0,byteOffset=offset,byteLength=len(newPNG))
    normalized['images'][image]['bufferView']=oldView;normalized['buffers'][0]['byteLength']=source['buffers'][0]['byteLength']
    assert normalized==source and actualBIN[:len(binary)]==binary
    assert png(actual,actualBIN,image)==newPNG
    # Every original bufferView, including all accessor/morph/IBM data, remains byte exact.
    for v in source['bufferViews']:
        start=v.get('byteOffset',0);end=start+v['byteLength'];assert actualBIN[start:end]==binary[start:end]
    unchangedImages=[i for i in range(len(source['images'])) if i!=image]
    for i in unchangedImages:assert png(source,binary,i)==png(actual,actualBIN,i)
    spec=importlib.util.spec_from_file_location('existing_glb',ROOT/'scripts/m2-male-face-v1/glb.py')
    reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
    g0,g1=reader.GLB(SOURCE),reader.GLB(target)
    for i in range(len(source['accessors'])):assert np.array_equal(g0.acc(i),g1.acc(i)),i
    provenance=[]
    for p in [ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vroid',ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/generated/female-tops-removed.vroid']:
        provenance.append(dict(path=str(p),sha256=sha(p.read_bytes())))
    report=dict(schema='native-vroid-unmasked-base-readback-v1',id='native-vroid-unmasked-female-130-v1',status='cpu-asset-derivation-verified-not-factory-admitted',avatar=dict(path=str(target),sha256=sha(saved),bytes=len(saved)),
        inputs=[dict(path=str(p),sha256=pin) for p,pin in PINS.items()],editableSources=provenance,scriptSha256=sha(Path(__file__).read_bytes()),
        actualJsonChanges=['images['+str(image)+'].bufferView','bufferViews append one native PNG view','buffers[0].byteLength'],
        originalBINPrefixExact=True,originalBufferViewsExact=len(source['bufferViews']),allDecodedAccessorsExact=len(source['accessors']),nonTargetImagesExact=unchangedImages,
        nodes=len(actual['nodes']),skinJointCounts=[len(s['joints']) for s in actual['skins']],morphTargetCountsByPrimitive=[[len(p.get('targets',[])) for p in m['primitives']] for m in actual['meshes']],
        allNonTargetJSONExact=True,allNodesSkinsIBMHumanoidExpressionsSpringMaterialsTexturesSamplersExact=True,
        nativePNG=dict(path=str(generated/'native-restored-body.png'),sha256=sha(newPNG),copiedBytesExact=True,baseShadeSharedTexture=texture,materialConsumers=consumers),
        preservedMeta=actual['extensions']['VRMC_vrm']['meta'],
        pending=['No new equipment manifest created; old compatibleAvatarSha256 is intentionally still rejected','Only existing three original equipment specimens are candidates for later exact rebind readback','Body coverage for clothing and actual basic/dressed visual/motion tests pending','No generic auxiliary-bone attachment capability or eight-body production claim'],
        scope='Standard asset offline derivative with two sealed native sources, not a new native VRoid export or editable merged .vroid; no pixel invention, weight editing, source mutation, controller change, GPU or menu registration')
    write(OUT/'readback.json',report)
    for p,pin in PINS.items():assert sha(p.read_bytes())==pin
    print(json.dumps({'avatar':report['avatar'],'accessors':report['allDecodedAccessorsExact'],'imageConsumers':references,'nodes':report['nodes'],'skinJointCounts':report['skinJointCounts']}))
if __name__=='__main__':main()
