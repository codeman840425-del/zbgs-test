"""Copy one exact native Body PNG and seal its finite equipment-state contract."""
from pathlib import Path
import hashlib,importlib.util,io,json,sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sp=importlib.util.spec_from_file_location('glb',ROOT/'scripts/m2-male-face-v1/glb.py');m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(name,value):
    with (OUT/name).open('x',encoding='utf-8') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')
def body_png(relative,pin):
    path=ROOT/relative;assert sha(path.read_bytes())==pin
    g=m.GLB(path);d=g.doc
    mat=next(x for x in d['materials'] if '_Body_'in x['name'] and '_SKIN'in x['name'])
    t=mat['pbrMetallicRoughness']['baseColorTexture'];s=mat['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']
    assert t['index']==s['index'] and t.get('texCoord',0)==s.get('texCoord',0) and t.get('extensions',{})==s.get('extensions',{})
    im=d['images'][d['textures'][t['index']]['source']];view=d['bufferViews'][im['bufferView']]
    png=g.bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    return png,np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))
def main():
    source='assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm';sourcePin='78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3'
    target='assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm';targetPin='843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'
    masked,pixels=body_png(source,sourcePin);base,full=body_png(target,targetPin)
    assert pixels.shape==full.shape==(2048,2048,4) and np.array_equal(pixels[:,:,:3],full[:,:,:3]) and (full[:,:,3]==255).all()
    alteredPath='evidence/vroid-customitem-study-v1/native-single-top-v1/customitem-study-reused.vrm'
    alteredPin='6a32481ef8caef06b3f3fe52528e0330b6e83334e0d9b41fa66caf7b7f5ec634'
    altered,ap=body_png(alteredPath,alteredPin);assert altered==masked
    with (OUT/'native-tops-body.png').open('xb') as f:f.write(masked)
    equipmentPath=ROOT/'assets-source/native-vroid-factory-fit-v1/equipment.json'
    assert sha(equipmentPath.read_bytes())=='f6088ae94008425061d9e7305eb311dc79399e9bed3b25541cd073bc6dc557d4'
    entries=json.loads(equipmentPath.read_text(encoding='utf-8'))['items']
    rules=[dict(id=e['id'],sha256=e['sha256'],slot=e['slot'],covered=e['slot']=='top',required=True) for e in entries]
    rules.append(dict(id='native-unmasked-843ac-sleeve56-top-v1',sha256='75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7',slot='top',covered=True,required=False,
        condition='Only enabled when a real matching new-avatar catalog entry is supplied; this mask contract does not grant geometry/bind fit'))
    manifest=dict(schema='native-body-texture-coverage-v1',avatarSha256=targetPin,materialName='N00_000_00_Body_00_SKIN (Instance)',width=2048,height=2048,alphaTest=.5,
        basePngSha256=sha(base),covered=dict(url='native-tops-body.png',sha256=sha(masked)),rgbPreserved=True,equipment=rules,
        source=dict(path=source,sha256=sourcePin),sameMaskModifiedSleeveSource=dict(path=alteredPath,sha256=alteredPin),
        scope='Two native RGBA states only. No arbitrary mask combination, shader edit or expanded asset license.')
    write('manifest.json',manifest)
    write('pixel-readback.json',dict(schema='native-body-texture-fit-pixels-v1',targetAvatarSha256=targetPin,maskedPNGsha256=sha(masked),basePNGsha256=sha(base),originalRGBExact=True,modifiedSleevePNGBytesExact=True,
        copiedPNGBytesExact=(OUT/'native-tops-body.png').read_bytes()==masked,baseAlphaAll255=True,maskedAlphaZero=int((pixels[:,:,3]==0).sum()),maskedAlphaPartial=int(((pixels[:,:,3]>0)&(pixels[:,:,3]<255)).sum()),
        rgbPixelSha256=sha(full[:,:,:3].tobytes()),sameRGBAll4194304Texels=True,garmentCompatibilityGranted=False,scriptSha256=sha(Path(__file__).read_bytes())))
    print(json.dumps({'pngSHA':sha(masked),'manifestSHA':sha((OUT/'manifest.json').read_bytes()),'equipmentRules':len(rules),'optionalSleeveRequiresRealNewAvatarEntry':True}))
if __name__=='__main__':main()
