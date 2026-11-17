"""Male original79-bone VRM plus exact native recovered Body PNG, CPU only."""
from pathlib import Path
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import struct
import sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
SOURCE='assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
DONOR='assets-source/native-vroid-male-skin-recovery-v1/generated/male-tops-removed.vrm'
PNG='assets-source/native-vroid-male-skin-recovery-v1/generated/native-restored-male-body.png'
VRM_NAME='male-native-unmasked-79-v1.vrm'
IDENT='native-vroid-unmasked-male-79-v1'
PINS={
    SOURCE:'a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da',
    DONOR:'dc7cf29714793106f3bdb01c5f44284af1b248c6046eb453e08fa5d78e60c84c',
    PNG:'cfd1860d2d6c04e33b5636c029dac535a69e35eacf30f6f4d66729a4fc2e1368',
    'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid':'c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a',
    'assets-source/native-vroid-male-skin-recovery-v1/generated/male-tops-removed.vroid':'2ae919989e43f68b05e2c0813408910511d22027ddeb604d3ae88a9ad5660cb6',
    'assets-source/native-vroid-male-skin-recovery-v1/closure.json':'73efc80f1f5dfbb28836a480c44414c04d9994266db2c7ef8c121c92b4c5171e',
    'evidence/native-vroid-male-skin-recovery-v1/readback/result.json':'5568715ddd73bacd9b823a340aeda1f37a1149991feee254c17c7f9fcff80de2',
    'assets-source/native-vroid-unmasked-base-v1/build.py':'2f82abc59ecabde3b9dad941559c8d19aa510e7cb21aafa0de0e54e97b7a1c6d',
}
sha=lambda data:hashlib.sha256(data).hexdigest()
encode=lambda value:(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')


def load(path):
    raw=path.read_bytes()
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)), 'Invalid GLB header'
    length,kind=struct.unpack_from('<I4s',raw,12)
    assert kind==b'JSON'
    size,kind=struct.unpack_from('<I4s',raw,20+length)
    assert kind==b'BIN\0' and len(raw)==28+length+size
    doc=json.loads(raw[20:20+length])
    assert len(doc['buffers'])==1 and 'uri' not in doc['buffers'][0]
    return doc,raw[28+length:]


def plan(source_path):
    inputs=[]
    # The selectable input path tests wrong-source rejection; identity remains fixed.
    for relative,expected in PINS.items():
        path=source_path if relative==SOURCE else ROOT/relative
        data=path.read_bytes()
        assert sha(data)==expected, 'Input identity mismatch: '+relative
        inputs.append(dict(path=relative,sha256=expected,bytes=len(data)))
    module=importlib.util.spec_from_file_location('sealed_female_png_helpers',ROOT/'assets-source/native-vroid-unmasked-base-v1/build.py')
    helpers=importlib.util.module_from_spec(module)
    module.loader.exec_module(helpers)
    source,binary=load(source_path)
    donor,donor_binary=load(ROOT/DONOR)
    material,texture,image=helpers.body(source)
    _,_,donor_image=helpers.body(donor)
    original_png=helpers.png(source,binary,image)
    native_png=helpers.png(donor,donor_binary,donor_image)
    assert native_png==(ROOT/PNG).read_bytes(), 'Donor image bytes differ from pinned native PNG'
    pixels0=np.asarray(Image.open(io.BytesIO(original_png)).convert('RGBA'))
    pixels1=np.asarray(Image.open(io.BytesIO(native_png)).convert('RGBA'))
    assert pixels0.shape==pixels1.shape and np.array_equal(pixels0[:,:,:3],pixels1[:,:,:3]), 'Body RGB changed'
    assert (pixels1[:,:,3]==255).all(), 'Native Body image is not fully opaque'
    textures=[i for i,t in enumerate(source['textures']) if t.get('source')==image]
    references=[r for r in helpers.texture_references(source) if r['texture'] in textures]
    expected_paths=[['materials',material,'pbrMetallicRoughness','baseColorTexture'],
                    ['materials',material,'extensions','VRMC_materials_mtoon','shadeMultiplyTexture']]
    assert textures==[texture] and sorted(map(lambda r:repr(r['path']),references))==sorted(map(repr,expected_paths)), 'Unexpected Body image consumer'
    consumers=[dict(mesh=i,primitive=j) for i,m in enumerate(source['meshes']) for j,p in enumerate(m['primitives']) if p['material']==material]
    assert consumers==[dict(mesh=1,primitive=0)]
    assert source['extensions']['VRMC_vrm']['meta'].get('thumbnailImage')!=image
    assert all(not t.get('extensions') for t in source['textures'])
    assert len(source['nodes'])==91 and [len(s['joints']) for s in source['skins']]==[79,79]
    doc=copy.deepcopy(source)
    blob=bytearray(binary)
    blob.extend(b'\0'*(-len(blob)%4))
    offset=len(blob)
    blob.extend(native_png)
    doc['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=len(native_png)))
    doc['images'][image]['bufferView']=len(doc['bufferViews'])-1
    doc['buffers'][0]['byteLength']=len(blob)
    blob.extend(b'\0'*(-len(blob)%4))
    json_bytes=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    json_bytes+=b' '*(-len(json_bytes)%4)
    vrm=struct.pack('<4sII',b'glTF',2,28+len(json_bytes)+len(blob))+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    manifest=dict(schema='native-vroid-male-unmasked-source-v1',id=IDENT,version=1,
        status='CPU-source-derivative-not-factory-admitted',
        avatar=dict(path='assets-source/native-vroid-male-unmasked-base-v1/generated/'+VRM_NAME,sha256=sha(vrm),bytes=len(vrm)),
        nativePNG=dict(path='assets-source/native-vroid-male-unmasked-base-v1/generated/native-restored-body.png',sha256=sha(native_png),bytes=len(native_png)),
        inputs=inputs,bodyMaterial=dict(index=material,name=source['materials'][material]['name']),
        originalNodes=91,originalSkinJointCounts=[79,79],sourceMeta=source['extensions']['VRMC_vrm']['meta'],
        singleMergedEditableSourceExists=False,runtimeAccepted=False,
        limitations=['Two exact native editable sources; no merged native .vroid',
                    'Original equipment still needs exact new avatar compatibility readback',
                    'Body texture coverage, factory, pose, expression, visual and license admission not performed'])
    preflight=dict(schema='male-unmasked-body-image-plan-v1',bodyMaterial=material,image=image,texture=texture,
        references=references,materialConsumers=consumers,sourcePNGsha256=sha(original_png),nativePNGsha256=sha(native_png),
        decodedImageShape=list(pixels0.shape),decodedRGBExact=True,nativeAlphaAll255=True,
        addedBufferView=doc['bufferViews'][-1],originalBINPrefixBytes=len(binary),
        sourceBodyImageOldBufferView=source['images'][image]['bufferView'])
    return {VRM_NAME:vrm,'native-restored-body.png':native_png,'manifest.json':encode(manifest),'preflight.json':encode(preflight)}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,default=BASE/'generated')
    parser.add_argument('--source',type=Path,default=ROOT/SOURCE)
    args=parser.parse_args()
    files=plan(args.source.resolve())
    assert files==plan(args.source.resolve()), 'Repeated in-memory build differs'
    output=args.out.resolve()
    assert not output.exists(), 'Fresh output directory required'
    output.mkdir(parents=True)
    for name,data in files.items():
        with (output/name).open('xb') as f:f.write(data)
    print(json.dumps({'status':'generated-not-factory-admitted','files':{name:dict(bytes=len(data),sha256=sha(data)) for name,data in files.items()}}))


if __name__=='__main__':main()
