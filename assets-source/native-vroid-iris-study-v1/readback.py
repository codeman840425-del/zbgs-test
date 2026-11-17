"""Compare exact native source and one exported iris edit; extract encoded PNGs."""
from pathlib import Path
import copy,hashlib,importlib.util,io,json,sys,time
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
READER=ROOT/'scripts/m2-male-face-v1/glb.py'
sp=importlib.util.spec_from_file_location('original_glb_reader',READER)
reader=importlib.util.module_from_spec(sp);sp.loader.exec_module(reader)
SOURCE=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
SOURCE_SHA='a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'

def image(g,index):
    info=g.doc['images'][index];assert 'uri' not in info
    v=g.doc['bufferViews'][info['bufferView']]
    return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]

def extract(g):
    matches=[(i,m) for i,m in enumerate(g.doc['materials']) if '_EyeIris_' in m['name']]
    assert len(matches)==1
    mi,m=matches[0];ti=m['pbrMetallicRoughness']['baseColorTexture']['index'];texture=g.doc['textures'][ti]
    ii=texture['source'];raw=image(g,ii)
    consumers=[]
    for ni,n in enumerate(g.doc['nodes']):
        if 'mesh' not in n:continue
        for pi,p in enumerate(g.doc['meshes'][n['mesh']]['primitives']):
            if p['material']!=mi:continue
            consumers.append(dict(node=ni,mesh=n['mesh'],primitive=pi,material=mi,indexAccessor=p['indices'],attributes=p['attributes'],morphTargetCount=len(p.get('targets',[]))))
    return raw,dict(materialIndex=mi,materialName=m['name'],material=m,textureIndex=ti,imageIndex=ii,texture=texture,sampler=g.doc.get('samplers',[])[texture['sampler']] if 'sampler' in texture else None,consumers=consumers)

def write(path,value):
    with path.open('xb') as f:f.write((json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())

def main():
    started=time.monotonic();out=BASE/'cpu-readback';assert not out.exists()
    cycle=json.loads((BASE/'native-cycle.json').read_bytes());assert cycle['failure'] is None
    candidate=BASE/'generated/male-iris-green.vrm'
    pin=next(x for x in cycle['generated'] if x['path'].endswith('.vrm'))
    assert sha(SOURCE.read_bytes())==SOURCE_SHA and sha(candidate.read_bytes())==pin['sha256']
    g0,g1=reader.GLB(SOURCE),reader.GLB(candidate);d0,d1=g0.doc,g1.doc
    failures=[]
    assert len(d0['accessors'])==len(d1['accessors'])
    accessor_rows=[]
    for i,(a,b) in enumerate(zip(d0['accessors'],d1['accessors'])):
        equal=g0.acc(i).dtype==g1.acc(i).dtype and g0.acc(i).shape==g1.acc(i).shape and g0.acc(i).tobytes()==g1.acc(i).tobytes()
        accessor_rows.append(dict(index=i,decodedExact=equal,sourceSHA256=sha(g0.acc(i).tobytes()),candidateSHA256=sha(g1.acc(i).tobytes())))
        if not equal:failures.append('accessor '+str(i)+' differs')
    static_keys=['nodes','meshes','skins','scenes','scene','materials','textures','samplers','animations','extensionsUsed','extensionsRequired','asset']
    identity={k:d0.get(k)==d1.get(k) for k in static_keys}
    if not all(identity.values()):failures.extend('JSON '+k+' differs' for k,v in identity.items() if not v)
    e0,e1=copy.deepcopy(d0['extensions']),copy.deepcopy(d1['extensions'])
    # Thumbnail is an expected export preview; compare all other metadata and extensions.
    e0['VRMC_vrm']['meta'].pop('thumbnailImage',None);e1['VRMC_vrm']['meta'].pop('thumbnailImage',None)
    extension_exact=e0==e1
    if not extension_exact:failures.append('Non-thumbnail extensions differ')
    r0,entry0=extract(g0);r1,entry1=extract(g1)
    assert entry0==entry1
    p0=np.asarray(Image.open(io.BytesIO(r0)).convert('RGBA'));p1=np.asarray(Image.open(io.BytesIO(r1)).convert('RGBA'))
    assert p0.shape==p1.shape
    changed=np.any(p0!=p1,axis=2);visible=p0[:,:,3]>0
    pure_black=np.all(p0[:,:,:3]==0,axis=2)&visible
    pure_white=np.all(p0[:,:,:3]==255,axis=2)&visible
    # A shared fixed source-darkness threshold is a diagnostic, not an anatomical pupil mask.
    dark0=(p0[:,:,:3].max(2)<=32)&visible;dark1=(p1[:,:,:3].max(2)<=32)&visible
    pixel=dict(dimensions=[p0.shape[1],p0.shape[0]],sourceRGBA_SHA256=sha(p0.tobytes()),candidateRGBA_SHA256=sha(p1.tobytes()),changedPixels=int(changed.sum()),visiblePixels=int(visible.sum()),alphaExact=bool(np.array_equal(p0[:,:,3],p1[:,:,3])),sourcePureBlackVisiblePixels=int(pure_black.sum()),sourcePureBlackPixelsExact=bool(np.array_equal(p0[pure_black],p1[pure_black])),sourcePureWhiteVisiblePixels=int(pure_white.sum()),sourcePureWhitePixelsExact=bool(np.array_equal(p0[pure_white],p1[pure_white])),fixedThresholdDarkRegion=dict(thresholdMaxRGB=32,sourcePixels=int(dark0.sum()),candidatePixels=int(dark1.sum()),intersection=int((dark0&dark1).sum()),union=int((dark0|dark1).sum()),symmetricDifference=int((dark0!=dark1).sum()),notAnatomicalMask=True))
    if not pixel['alphaExact'] or not changed.any():failures.append('Iris edit absent or alpha changed')
    if not pixel['sourcePureBlackPixelsExact'] or not pixel['sourcePureWhitePixelsExact']:failures.append('Source pure black/white iris changed')
    thumbnails={d0['extensions']['VRMC_vrm']['meta'].get('thumbnailImage'),d1['extensions']['VRMC_vrm']['meta'].get('thumbnailImage')}
    images=[];assert len(d0['images'])==len(d1['images'])
    for i in range(len(d0['images'])):
        a,b=image(g0,i),image(g1,i)
        x=np.asarray(Image.open(io.BytesIO(a)).convert('RGBA'));y=np.asarray(Image.open(io.BytesIO(b)).convert('RGBA'))
        row=dict(index=i,sourceSHA256=sha(a),candidateSHA256=sha(b),encodedExact=a==b,pixelsExact=bool(np.array_equal(x,y)),role='iris' if i==entry0['imageIndex'] else 'export-thumbnail' if i in thumbnails else 'non-target')
        images.append(row)
        if row['role']=='non-target' and not row['encodedExact']:failures.append('Non-target image '+str(i)+' differs')
    eye_protection=[]
    for i,m in enumerate(d0['materials']):
        if not any(t in m['name'] for t in ['_EyeWhite_','_EyeHighlight_']):continue
        ii=d0['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
        eye_protection.append(dict(material=i,name=m['name'],image=ii,encodedExact=image(g0,ii)==image(g1,ii)))
    out.mkdir()
    for name,raw in [('source-iris.png',r0),('iris-green.png',r1)]:
        with (out/name).open('xb') as f:f.write(raw)
    again,again_entry=extract(reader.GLB(candidate))
    assert r1==again and entry1==again_entry
    write(out/'iris-material.json',dict(schema='native-iris-image-consumers-v1',sourceAvatar=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA),candidateAvatar=pin,source=entry0,candidate=entry1,extractedImage=dict(path=(out/'iris-green.png').relative_to(ROOT).as_posix(),sha256=sha(r1),bytes=len(r1)),repeatExtractionByteExact=True,geometryOrTargetAdmission=False))
    report=dict(schema='native-paired-iris-export-readback-v1',status='native-color-source-produced-runtime-pending' if not failures else 'failed-requires-review',source=dict(path=SOURCE.relative_to(ROOT).as_posix(),sha256=SOURCE_SHA,bytes=SOURCE.stat().st_size),candidate=pin,targetRGBA=cycle['targetRGBA'],targetHex=cycle['targetHex'],allAccessorsExact=all(r['decodedExact'] for r in accessor_rows),accessors=accessor_rows,jsonIdentity=identity,nonThumbnailExtensionsExact=extension_exact,sourceMeta=d0['extensions']['VRMC_vrm']['meta'],candidateMeta=d1['extensions']['VRMC_vrm']['meta'],images=images,irisPixels=pixel,eyeWhiteAndHighlight=eye_protection,nodes=len(d1['nodes']),skinJointCounts=[len(s['joints']) for s in d1['skins']],expressions=d1['extensions']['VRMC_vrm']['expressions'],repeatExtractionByteExact=True,helper=dict(path=READER.relative_to(ROOT).as_posix(),sha256=sha(READER.read_bytes())),wallSeconds=time.monotonic()-started,failures=failures,limits=['No game/runtime/visual acceptance','Dark-threshold region is not anatomical pupil segmentation','Native candidate retains masked Body, not new7586 full skin','Any new color source needs explicit resources/fit/recipe identity; no old admission inheritance','No native editor or solver called by readback'])
    write(out/'result.json',report)
    print(json.dumps({k:report[k] for k in ['status','allAccessorsExact','jsonIdentity','nonThumbnailExtensionsExact','irisPixels','wallSeconds','failures']},ensure_ascii=False))

if __name__=='__main__':main()
