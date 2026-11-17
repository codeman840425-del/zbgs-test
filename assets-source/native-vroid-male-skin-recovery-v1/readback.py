"""Male source/native Tops removal readback, no edit/export/editor calls."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
sys.dont_write_bytecode = True
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
OUT=ROOT/'evidence/native-vroid-male-skin-recovery-v1/readback'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('sealed_native_readback',ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery/readback.py')
rb=importlib.util.module_from_spec(spec)
spec.loader.exec_module(rb)

def main():
    assert not OUT.exists()
    source=ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'
    target=BASE/'generated/male-tops-removed.vrm'
    assert sha(source)=='a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da'
    cycle=json.loads((BASE/'native-cycle.json').read_bytes())
    donor=next(row for row in cycle['generated'] if row['path'].endswith('.vrm'))
    assert sha(target)==donor['sha256']
    gb,ga=rb.a.reader.GLB(source),rb.a.reader.GLB(target)
    sb,wb,nb=rb.skeleton(gb)
    sa,wa,na=rb.skeleton(ga)
    common=sorted(set(sb)&set(sa))
    removed=sorted(set(sb)-set(sa))
    arrays={}
    records={}
    primitives={}
    for kind,token in [('body','_Body_'),('bottoms','_Bottoms_'),('shoes','_Shoes_')]:
        found=[m['name'] for m in gb.doc['materials'] if token in m['name']]
        assert len(found)==1
        b=rb.primitive(gb,wb,nb,found[0])
        a=rb.primitive(ga,wa,na,found[0])
        primitives[kind]=(b,a)
        # Non-body prefix avoids the original female-specific band path.
        records[kind]=rb.compare(b,a,arrays,'male_'+kind)
    b,a=primitives['body']
    keys=sorted(set(b['keyed'])&set(a['keyed']))
    old=np.array([b['keyed'][k][1] for k in keys])
    new=np.array([a['keyed'][k][1] for k in keys])
    rgba0,tx0=rb.sample_rgba(b,old)
    rgba1,tx1=rb.sample_rgba(a,new)
    hidden0=rgba0[:,:,3]<tx0['cutoff']
    hidden1=rgba1[:,:,3]<tx1['cutoff']
    xyz=np.einsum('bi,tij->tbj',rb.a.BARY,a['rest'][new])
    visible=~hidden0&~hidden1
    bands=json.loads((ROOT/'assets-source/native-vroid-male-preflight-v1/generated/male-result.json').read_bytes())['measurementBandsY']
    alpha=dict(beforeTexture=tx0,afterTexture=tx1,samples=int(hidden0.size),
        beforeBelow=int(hidden0.sum()),afterBelow=int(hidden1.sum()),
        recoveredSamples=int((hidden0&~hidden1).sum()),newlyHiddenSamples=int((~hidden0&hidden1).sum()),
        remainingHiddenSamples=int((hidden0&hidden1).sum()),
        allSampleRGBMaxAbs=float(np.abs(rgba0[:,:,:3]-rgba1[:,:,:3]).max()),
        visibleBeforeAndAfterRGBMaxAbs=float(np.abs(rgba0[:,:,:3]-rgba1[:,:,:3])[visible].max()),
        bands={name:dict(beforeBelow=int((hidden0&((xyz[:,:,1]>=lo)&(xyz[:,:,1]<=hi))).sum()),
                        afterBelow=int((hidden1&((xyz[:,:,1]>=lo)&(xyz[:,:,1]<=hi))).sum())) for name,(lo,hi) in bands.items()},
        limitation='Seven bilinear level-zero probes per exact matched triangle; not GPU coverage or anatomical ownership')
    arrays.update(bodyOriginalRGBA=rgba0,bodyResultRGBA=rgba1,bodySampleXYZ=xyz)
    def image(g,p):
        mat=p['meta']['materialJSON']
        info=mat['pbrMetallicRoughness']['baseColorTexture']
        shade=mat['extensions']['VRMC_materials_mtoon']['shadeMultiplyTexture']
        assert info['index']==shade['index'], 'Base/shade differ; cannot select one PNG'
        texture=g.doc['textures'][info['index']]
        index=texture['source']
        im=g.doc['images'][index]
        assert im['mimeType']=='image/png' and 'uri' not in im
        v=g.doc['bufferViews'][im['bufferView']]
        return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']],index
    png0,image0=image(gb,b)
    png1,image1=image(ga,a)
    from PIL import Image
    import io
    pixels0=np.array(Image.open(io.BytesIO(png0)).convert('RGBA'))
    pixels1=np.array(Image.open(io.BytesIO(png1)).convert('RGBA'))
    assert pixels0.shape==pixels1.shape
    # Compare visible source pixels only; previously hidden RGB is not a promise.
    full_visible=(pixels0[:,:,3]>=128)&(pixels1[:,:,3]>=128)
    pixel_summary=dict(shape=list(pixels0.shape),beforeImage=image0,afterImage=image1,
        sourcePNG=hashlib.sha256(png0).hexdigest(),nativeRestoredPNG=hashlib.sha256(png1).hexdigest(),
        visibleBeforeAndAfterRGBMaxAbs=int(np.abs(pixels0[:,:,:3].astype(int)-pixels1[:,:,:3].astype(int))[full_visible].max()),
        alphaIncreasedPixels=int((pixels1[:,:,3]>pixels0[:,:,3]).sum()),
        alphaDecreasedPixels=int((pixels1[:,:,3]<pixels0[:,:,3]).sum()),
        alphaChangedPixels=int((pixels1[:,:,3]!=pixels0[:,:,3]).sum()))
    spring=gb.doc.get('extensions',{}).get('VRMC_springBone',{})
    removed_springs=[]
    for i,s in enumerate(spring.get('springs',[])):
        names=[nb[j['node']] for j in s['joints']]
        if set(names)&set(removed):
            removed_springs.append(dict(index=i,names=names,source=s,
                sharedNonRemovedJoints=sorted(set(names)-set(removed))))
    common_ibm=[]
    all_removed_used={kind:sorted({lane['bone'] for row in p['meta']['referencedBindings'] for lane in row['lanes'] if lane['weight']>0}&set(removed)) for kind,(p,_) in primitives.items()}
    for name in common:
        matrices=[]
        for g,names in [(gb,nb),(ga,na)]:
            matches=[g.acc(s['inverseBindMatrices'])[s['joints'].index(names.index(name))] for s in g.doc['skins'] if names.index(name) in s['joints']]
            assert matches and all(np.array_equal(matches[0],m) for m in matches)
            matrices.append(matches[0])
        delta=float(np.max(np.abs(matrices[0]-matrices[1])))
        if delta:common_ibm.append(dict(name=name,maxAbs=delta))
    failures=[]
    for kind,r in records.items():
        if r['ambiguousCorrespondence'] or r['sourceOnlyTriangleKeys'] or r['resultOnlyTriangleKeys']:
            failures.append(kind+': exact triangle/UV correspondence differs')
        if not all(r.get('commonReferencedAttributeExact',{}).values()) or not r.get('commonActiveJointLaneBoneNamesExact'):
            failures.append(kind+': referenced author attributes/active bones differ')
    if any(all_removed_used.values()):failures.append('Removed joints are actively used by retained surfaces')
    if alpha['newlyHiddenSamples']:failures.append('Newly hidden sampled Body skin')
    if pixel_summary['visibleBeforeAndAfterRGBMaxAbs']:failures.append('Previously visible Body RGB changed')
    result=dict(schema='male-native-skin-recovery-readback-v1',status='native-PNG-reuse-supported-preserve-original79-bones' if not failures else 'failed-reuse-preconditions',
        source=dict(path=source.relative_to(ROOT).as_posix(),sha256=sha(source)),
        result=dict(path=target.relative_to(ROOT).as_posix(),sha256=sha(target)),
        sourceNodes=len(gb.doc['nodes']),resultNodes=len(ga.doc['nodes']),
        sourceSkinJointCounts=[len(s['joints']) for s in gb.doc['skins']],resultSkinJointCounts=[len(s['joints']) for s in ga.doc['skins']],
        skeleton=dict(removed=removed,added=sorted(set(sa)-set(sb)),
            changedParent=[n for n in common if sb[n]['parentName']!=sa[n]['parentName']],
            commonWorldMaxAbs=max([float(np.max(np.abs(np.array(sb[n]['worldMatrix'])-sa[n]['worldMatrix']))) for n in common]),
            commonSourceNodesExact=all(sb[n]['sourceNode']==sa[n]['sourceNode'] for n in common),
            changedCommonLocalTRS=[n for n in common if {k:sb[n]['sourceNode'].get(k) for k in ['translation','rotation','scale','matrix']}!={k:sa[n]['sourceNode'].get(k) for k in ['translation','rotation','scale','matrix']}],
            commonIBMDifferences=common_ibm,removedPositiveWeightUsage=all_removed_used,removedSpringReferences=removed_springs),
        primitives=records,alpha=alpha,pixels=pixel_summary,
        metaBefore=gb.doc['extensions']['VRMC_vrm']['meta'],metaAfter=ga.doc['extensions']['VRMC_vrm']['meta'],
        failures=failures,scope='CPU native donor validation only; original79-bone derivative not generated here',
        limitations=['No new merged editable .vroid; two source derivation remains explicit',
                    'No complete-coverage/visual/pose/factory/cloth or license admission',
                    'Donor removal may remove auxiliary spring architecture; do not replace original VRM with donor',
                    'Seven bilinear samples cannot classify every residual hidden pixel as clothing',
                    'No reassigning existing equipment compatibility SHA'])
    OUT.mkdir(parents=True)
    np.savez_compressed(OUT/'arrays.npz',**arrays)
    png_path=BASE/'generated/native-restored-male-body.png'
    with png_path.open('xb') as f:f.write(png1)
    result['nativePNG']=dict(path=png_path.relative_to(ROOT).as_posix(),sha256=sha(png_path),bytes=len(png1),sourceImageBytesCopiedExact=True)
    result['arrays']=dict(path=(OUT/'arrays.npz').relative_to(ROOT).as_posix(),sha256=sha(OUT/'arrays.npz'))
    result['consumedHelpers']=[dict(path=Path(p).relative_to(ROOT).as_posix(),sha256=sha(Path(p))) for p in [__file__,rb.__file__,rb.a.__file__,rb.a.reader.__file__]]
    with (OUT/'result.json').open('xb') as f:f.write((json.dumps(rb.a.clean(result),ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
    print(json.dumps(rb.a.clean({k:result[k] for k in ['status','sourceNodes','resultNodes','sourceSkinJointCounts','resultSkinJointCounts','skeleton','alpha','pixels','failures','nativePNG']}),ensure_ascii=False))

if __name__=='__main__':main()
