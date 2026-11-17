"""Independent file readback: no import of the male builder or female helpers."""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import sys
sys.dont_write_bytecode=True
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'


def verify(directory):
    spec=importlib.util.spec_from_file_location('independent_original_glb_reader',ROOT/'scripts/m2-male-face-v1/glb.py')
    reader=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    source=reader.GLB(SOURCE)
    path=directory/'male-native-unmasked-79-v1.vrm'
    actual=reader.GLB(path)
    assert sha(SOURCE.read_bytes())=='a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'
    d0,d1=source.doc,actual.doc
    found=[i for i,m in enumerate(d0['materials']) if '_Body_' in m['name'] and '_SKIN' in m['name']]
    assert len(found)==1
    material=found[0]
    texture=d0['materials'][material]['pbrMetallicRoughness']['baseColorTexture']['index']
    assert d0['materials'][material]['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']['index']==texture
    image=d0['textures'][texture]['source']
    normalized=copy.deepcopy(d1)
    assert len(normalized['bufferViews'])==len(d0['bufferViews'])+1
    added=normalized['bufferViews'].pop()
    assert d1['images'][image]['bufferView']==len(d0['bufferViews'])
    normalized['images'][image]['bufferView']=d0['images'][image]['bufferView']
    normalized['buffers'][0]['byteLength']=d0['buffers'][0]['byteLength']
    assert normalized==d0, 'Non-target JSON changed'
    assert actual.bin[:len(source.bin)]==source.bin, 'Original BIN prefix changed'
    rows=[]
    for i in range(len(d0['accessors'])):
        before,after=source.acc(i),actual.acc(i)
        assert before.dtype==after.dtype and before.shape==after.shape and before.tobytes()==after.tobytes(),i
        rows.append(dict(accessor=i,bytes=before.nbytes,sha256=sha(before.tobytes())))
    def image_bytes(g,index):
        info=g.doc['images'][index]
        assert 'uri' not in info
        view=g.doc['bufferViews'][info['bufferView']]
        return g.bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    images=[]
    for i in range(len(d0['images'])):
        before,after=image_bytes(source,i),image_bytes(actual,i)
        if i!=image:assert before==after,i
        images.append(dict(index=i,targetBody=i==image,beforeSha256=sha(before),afterSha256=sha(after),sameBytes=before==after))
    native=(ROOT/'assets-source/native-vroid-male-skin-recovery-v1/generated/native-restored-male-body.png').read_bytes()
    assert sha(native)=='cfd1860d2d6c04e33b5636c029dac535a69e35eacf30f6f4d66729a4fc2e1368'
    assert image_bytes(actual,image)==native==(directory/'native-restored-body.png').read_bytes()
    for v in d0['bufferViews']:
        start=v.get('byteOffset',0)
        assert source.bin[start:start+v['byteLength']]==actual.bin[start:start+v['byteLength']]
    assert added['buffer']==0 and added['byteLength']==len(native)
    manifest=json.loads((directory/'manifest.json').read_bytes())
    assert manifest['avatar']['sha256']==sha(path.read_bytes()) and manifest['avatar']['bytes']==path.stat().st_size
    assert manifest['sourceMeta']==d0['extensions']['VRMC_vrm']['meta']
    return dict(schema='male-unmasked-independent-container-readback-v1',status='non-target-data-and-native-PNG-verified-not-factory',
        avatar=manifest['avatar'],originalBINPrefixExact=True,nonTargetJSONExact=True,
        originalBufferViewsExact=len(d0['bufferViews']),decodedAccessorsExact=rows,images=images,
        nodes=len(d1['nodes']),skinJointCounts=[len(s['joints']) for s in d1['skins']],
        allNodesSkinsIBMHumanoidExpressionsSpringMaterialsUVTexturesExact=True,
        geometryAndMorphByteIdentity=True,metaExact=True,nativePNGExact=True,
        method='Fresh independent reader; invert only three permitted JSON differences and compare full source JSON/BIN/accessors/images',
        builderImported=False,factoryRun=False,gpuRun=False)


if __name__=='__main__':
    directory=Path(sys.argv[1]) if len(sys.argv)>1 else BASE/'generated'
    output=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'evidence/native-vroid-male-unmasked-base-v1/independent-readback.json'
    result=verify(directory)
    with output.open('xb') as f:f.write((json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
    print(json.dumps({k:result[k] for k in ['status','avatar','nodes','skinJointCounts','originalBufferViewsExact']}))
