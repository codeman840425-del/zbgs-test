"""Re-read actual new avatar and existing three GLBs; no geometry copies or edits."""
import sys,hashlib,importlib.util,json
from pathlib import Path
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'assets-source/native-vroid-body-audit-v1/skin-mask-recovery'))
import readback as rb
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,value):
    with (OUT/name).open('x',encoding='utf-8') as f:json.dump(value,f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n')
AVATAR=ROOT/'assets-source/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm'
PIN='843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'
def main():
    assert sha(AVATAR)==PIN
    oldmanifest=ROOT/'assets-source/native-vroid-equipment-v1/equipment.json'
    oldmanifestHash=sha(oldmanifest);assert oldmanifestHash=='4e99582371927ac8f3036d7865aad5785ae3e6d0f7dd9d5632f11f5bf9fa856a'
    old=json.loads(oldmanifest.read_text(encoding='utf-8'))
    avatar=rb.a.reader.GLB(AVATAR);d=avatar.doc;avBones,world,names=rb.skeleton(avatar)
    assert len(names)==len(set(names))
    lookup={n:i for i,n in enumerate(names)};hum={v['node']:k for k,v in d['extensions']['VRMC_vrm']['humanoid']['humanBones'].items()}
    ibms={}
    for skin in d['skins']:
        raw=avatar.acc(skin['inverseBindMatrices'])
        for node,matrix in zip(skin['joints'],raw):
            name=names[node]
            if name in ibms:assert np.array_equal(ibms[name],matrix)
            ibms[name]=matrix
    items=[];rows=[];ids={};floor=None
    for entry in old['items']:
        resource=oldmanifest.parent/entry['url'];assert sha(resource)==entry['sha256'] and resource.stat().st_size==entry['bytes']
        gear=rb.a.reader.GLB(resource);gearBones,gw,gn=rb.skeleton(gear)
        mats=[m['name'] for m in gear.doc['materials']];assert len(mats)==1
        actual=rb.primitive(avatar,world,names,mats[0]);standalone=rb.primitive(gear,gw,gn,mats[0])
        assert np.array_equal(actual['tri'],standalone['tri'])
        assert set(actual['attrs'])==set(standalone['attrs'])
        attributeExact={k:bool(np.array_equal(actual['attrs'][k],standalone['attrs'][k])) for k in actual['attrs']}
        assert all(attributeExact.values())
        joints=standalone['jointNames'];bindings=[]
        for name in joints:
            assert name in lookup and name in ibms
            assert np.array_equal(actual['ibm'][name],standalone['ibm'][name])
            assert gearBones[name]['parentName']==avBones[name]['parentName']
            assert np.array_equal(gearBones[name]['worldMatrix'],avBones[name]['worldMatrix'])
            bindings.append(dict(sourceBone=name,targetRawBone=name,humanoidSemantic=hum.get(lookup[name]),inverseBindMatrix=ibms[name].tolist()))
        assert bindings==entry['bindings'],'Newly reconstructed bindings differ from source extraction; stop'
        used=actual['ids'];restError=float(np.linalg.norm(actual['rest'][used]-standalone['rest'][used],axis=1).max())
        assert restError==0
        role={'top':'top','bottom':'shorts','shoes':'shoes'}[entry['slot']]
        ident='native-unmasked-843ac-'+role+'-v1';ids[role]=ident
        item=dict(id=ident,name={'top':'原生恢复基体 · 自身上衣','shorts':'原生恢复基体 · 自身短裤','shoes':'原生恢复基体 · 自身鞋'}[role],slot=entry['slot'],url='../native-vroid-equipment-v1/'+resource.name,
            sha256=sha(resource),bytes=resource.stat().st_size,compatibleAvatarSha256=PIN,preserveOriginalBody=True,requiresRawSkeleton=True,bindings=bindings,
            sourceLicense=dict(status='internal-study-only',sourceVRMMeta=d['extensions']['VRMC_vrm']['meta']),
            limits=['CPU exact geometry/rest/binding readback only; new source runtime and visual admission pending','Only this original equipment set; no new garment auxiliary bones or generic fitting','Original native Tops SkinMask requires a distinct exact coverage decision; no approximate triangle mask generated'])
        items.append(item)
        rows.append(dict(id=ident,resource=str(resource),sha256=sha(resource),sourceEquipmentId=entry['id'],sourceAvatarSha256=entry['compatibleAvatarSha256'],targetAvatarSha256=PIN,
            targetPrimitive=dict(node=actual['meta']['node'],primitive=actual['meta']['primitive'],material=mats[0]),
            actualIndicesExact=True,attributesExact=attributeExact,jointBindingsReconstructed=len(bindings),allParentRestAndIBMExact=True,
            referencedVertices=len(used),triangles=len(actual['tri']),restMaxErrorM=restError))
        if role=='shoes':
            xyz=actual['rest'];minimum=float(xyz[used,1].min());vertices=used[xyz[used,1]==minimum]
            faces=np.flatnonzero(np.isin(actual['tri'],vertices).any(1))
            floor=dict(sourceFloorY=minimum,sourceSpace='authored glTF rest skin world, metres, before game floor shift',
                method='minimum of actual Shoes indexed piecewise-linear surface; every triangle minimum is attained at a referenced vertex',
                material=mats[0],sourcePrimitive=rows[-1]['targetPrimitive'],referencedVertices=len(used),attributeRows=len(xyz),triangleCount=len(actual['tri']),
                lowestVertexIds=vertices.tolist(),lowestWorldXYZ=xyz[vertices].tolist(),incidentTriangleIds=faces.tolist(),incidentTriangles=actual['tri'][faces].tolist(),
                wholeSharedAccessorYMinimum=float(xyz[:,1].min()),notUsedForMeasurement='wholeSharedAccessorYMinimum',
                limitations=['Rest geometric shoe bottom only; not standing contact/sole compression/animated foot slip validation','No copied male/female floor or old body constants'])
    assert len(items)==3 and floor is not None
    manifest=dict(schema='zbgs-equipment-v1',id='native-unmasked-843ac-equipment-v1',status='new-source-cpu-bind-verified-runtime-coverage-pending',items=items)
    save('equipment.json',manifest);save('equipment-readback.json',dict(schema='native-unmasked-equipment-readback-v1',avatarPath=str(AVATAR),avatarSha256=PIN,sourceManifest=dict(path=str(oldmanifest),sha256=oldmanifestHash),items=rows,scope='Actual GLB/VRM array and bind readback, no re-exported resources or runtime evaluation'))
    save('floor-measurement.json',floor)
    # Whole-triangle index deletion cannot reproduce any threshold boundary crossing a triangle interior.
    original=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm';assert sha(original)=='78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3'
    g=rb.a.reader.GLB(original);bones,w,n=rb.skeleton(g)
    bodyName=next(m['name'] for m in d['materials'] if '_Body_'in m['name'] and '_SKIN'in m['name'])
    oldbody=rb.primitive(g,w,n,bodyName);newbody=rb.primitive(avatar,world,names,bodyName)
    for k in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']:assert np.array_equal(oldbody['attrs'][k],newbody['attrs'][k])
    assert np.array_equal(oldbody['tri'],newbody['tri'])
    rgba,tex=rb.sample_rgba(oldbody,oldbody['tri']);hidden=rgba[:,:,3]<tex['cutoff'];mixed=hidden.any(1)&~hidden.all(1)
    allHidden=hidden.all(1);allVisible=~hidden.any(1);mixedIDs=np.flatnonzero(mixed)
    assert len(mixedIDs)>0
    xyz=np.einsum('bi,tij->tbj',rb.a.BARY,oldbody['rest'][oldbody['tri']])
    witnesses=[]
    for ti in mixedIDs[:8]:
        i=int(np.flatnonzero(hidden[ti])[0]);j=int(np.flatnonzero(~hidden[ti])[0])
        witnesses.append(dict(triangle=int(ti),sourceVertexIds=oldbody['tri'][ti].tolist(),hidden=dict(barycentric=rb.a.BARY[i].tolist(),alpha=float(rgba[ti,i,3]),xyz=xyz[ti,i].tolist()),visible=dict(barycentric=rb.a.BARY[j].tolist(),alpha=float(rgba[ti,j,3]),xyz=xyz[ti,j].tolist())))
    indexAccessor=newbody['p']['indices'];indexValues=avatar.acc(indexAccessor)
    arrays=OUT/'original-mask-samples.npz';assert not arrays.exists();np.savez_compressed(arrays,bodyTriangles=oldbody['tri'],bilinearAlpha=rgba[:,:,3],mixedTriangleIds=mixedIDs,allSevenHiddenTriangleIds=np.flatnonzero(allHidden),allSevenVisibleTriangleIds=np.flatnonzero(allVisible),bodySampleWorldXYZ=xyz)
    coverage=dict(schema='native-tops-skinmask-index-coverage-assessment-v1',status='exact-boundary-not-representable-by-whole-triangle-index-deletion',targetAvatarSha256=PIN,targetBodyMaterial=bodyName,
        bodyTriangles=len(oldbody['tri']),bodyIndexAccessor=indexAccessor,bodyIndexComponentType=d['accessors'][indexAccessor]['componentType'],bodyIndexDecodedBytesSha256=hashlib.sha256(indexValues.tobytes()).hexdigest(),
        originalNativeMaskInput=dict(avatarPath=str(original),avatarSha256=sha(original),bodyImage=tex['image'],pngSha256=tex['sha256'],texture=tex,samplerContract='actual LINEAR/REPEAT, no mipmaps, MASK alpha cutoff .5',uvAccessor=oldbody['p']['attributes']['TEXCOORD_0']),
        exactBodyIndexUVGeometryBindingCorrespondence=True,totalSamples=int(hidden.size),belowCutoffSamples=int(hidden.sum()),
        trianglesAllSevenHidden=int(allHidden.sum()),trianglesAllSevenVisible=int(allVisible.sum()),trianglesWithBothHiddenAndVisibleSamples=int(mixed.sum()),mixedWitnesses=witnesses,
        samples=dict(path=str(arrays),sha256=sha(arrays)),
        interpretation='At least these mixed triangles require both kept and discarded fragments. Keeping a whole triangle exposes originally hidden samples; removing it erases originally visible samples. No binary face-ID set can exactly reproduce this native boundary on this topology.',
        limits=['Seven probes do not certify every all-hidden/all-visible triangle; same-class sampled triangles can contain an unsampled mask island','1514 all-seven-hidden is not an approved face mask','No coverage descriptor emitted, no widened threshold, no shader/texture runtime added','Actual visual tolerance is not decided by this representation diagnosis'])
    save('body-mask-assessment.json',coverage)
    config=dict(schema='native-vroid-factory-profile-candidate-v1',status='data-only-not-registered',
        profile=dict(id='native-vroid-unmasked-female-130-v1',label='原生女性 · 真实皮肤恢复试样',url='../native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm',sha256=PIN,manifestUrl='equipment.json',sourceFloorY=floor['sourceFloorY'],ids=ids,
        defaultOutfit=dict(index=0,role='shorts',label='原生上衣/短裤/鞋',equipmentRoles=['top','shorts','shoes'],bottomRole='shorts'),
        fitStatus='CPU exact bind and rest only; original native mask cannot be reproduced exactly by current triangle coverage; runtime/visual pending'),
        integrationNotes=['defaultOutfit is a proposed data seam; current foundationProfile still constructs pants index0 and needs explicit integration','URLs are offline package-relative; no public URL or running registration claimed','Do not inherit old female seat/forearm/hand/eye/palette/accessory fit constants'],
        pending=['exact body coverage or explicitly reviewed alternative','runtime same-room original equipment roundtrip','motion/contact/seat and surface profiles','appearance recipe and save/restore admission'])
    save('profile-candidate.json',config)
    assert sha(oldmanifest)==oldmanifestHash and sha(AVATAR)==PIN
    print(json.dumps({'manifestItems':len(items),'sourceFloorY':floor['sourceFloorY'],'mixedMaskTriangles':len(mixedIDs),'allSevenHidden':int(allHidden.sum()),'coverageGenerated':False}))
if __name__=='__main__':main()
