"""Enrich existing no-physics corridor result with exact source lineage and local planes.
Uses installed Python NumPy/Pillow; no Blender/browser or garment edits.
"""
from pathlib import Path
import gzip,hashlib,io,json,struct
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];R=ROOT/'experiments/m1-simple-skirt-worktree'
P=ROOT/'evidence/skirt-layer-corridor-dynamic.json.gz';report=json.loads(gzip.decompress(P.read_bytes()))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def glb(p):
    raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);blob=raw[28+n:]
    def read(i):
        a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']]);w={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']]
        return np.ndarray((a['count'],w),dtype=dt,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
    return d,blob,read
top_path=R/'assets-source/m1/offline-corrective/open-waist-v1/m1-uniform-top-open-hem.glb';edit_path=top_path.parent/'top-edit.json';edit=json.loads(edit_path.read_text(encoding='utf-8'))
assert sha(top_path)==edit['resultSha256']=='7f266ff135096f16a6db067cceddee0cd610a886833218b1cb6531dd43721c89'
closed_path=R/'prototype/public/assets/m1/m1-uniform-top.glb';assert sha(closed_path)==edit['sourceSha256']
body_path=R/'prototype/public/assets/foundation/base-female-roundtrip.vrm'
td,blob,tr=glb(top_path);bd,_,br=glb(body_path);cd,_,cr=glb(closed_path)
tp=td['meshes'][0]['primitives'][0];bp=bd['meshes'][0]['primitives'][0]
tf=tr(tp['indices']).reshape(-1,3);bf=br(bp['indices']).reshape(-1,3)
oldfaces=cr(cd['meshes'][0]['primitives'][0]['indices']).reshape(-1,3)
vertexmap=np.array(edit['resultRenderVertexToOriginal']);facemap=np.array([i for i in range(len(oldfaces))if i not in set(edit['removedOriginalFaces'])])
assert np.array_equal(vertexmap[tf],oldfaces[facemap])
cap=json.loads(gzip.decompress((R/'assets-source/m1/simple-skirt-v1/active-gap-hem-v1/continuous-input-v1/capture.json.gz').read_bytes()))
assert sha(body_path)==cap['identity']['primary']['actualSha256']==cap['identity']['primary']['declaredSha256']
assert np.array_equal(tf,np.array(cap['frames'][0]['colliders'][1]['triangles']).reshape(-1,3))
assert np.array_equal(bf,np.array(cap['frames'][0]['colliders'][0]['triangles']).reshape(-1,3))
material=td['materials'][tp['material']];tex=material['pbrMetallicRoughness']['baseColorTexture']['index'];im=td['images'][td['textures'][tex]['source']];v=td['bufferViews'][im['bufferView']];png=blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];pixels=np.array(Image.open(io.BytesIO(png)).convert('RGBA'))
def weights(d,read,primitive,ids):
    skin=d['skins'][next(n['skin']for n in d['nodes']if n.get('mesh')==0)];names=[d['nodes'][i]['name']for i in skin['joints']];j=read(primitive['attributes']['JOINTS_0']);w=read(primitive['attributes']['WEIGHTS_0']);result={}
    for i in ids:
        for k,a in zip(j[i],w[i]):result[names[k]]=result.get(names[k],0)+float(a)/len(ids)
    return {k:v for k,v in sorted(result.items(),key=lambda x:-x[1])if v>1e-7}
topids=set();bodyids=set();examples=[]
for row in report['rows']:
    for top in row['tops']:
        # Compact the initial comprehensive calculation without recomputing or dropping global pair IDs.
        if top['pairs']and isinstance(top['pairs'][0],dict):
            full=top['pairs'];top['pairs']=[[x['bodyFace'],x['topFace']]for x in full]
            top['localWitnesses']=[x for x in full if x.get('regionScreen20mm')=='near-fixed-or-free'or x.get('sameTopFaceAsNativeFailure')or x.get('actualClothFreeRelation',{}).get('sampledDistanceMetres',1)<.02]
        if row['frame']not in[19,29,35]or top['name']!='m1-uniform-top_1':continue
        frame=cap['frames'][row['frame']-1];B=np.array(frame['colliders'][0]['positions']).reshape(-1,3);T=np.array(frame['colliders'][1]['positions']).reshape(-1,3)
        for x in top.get('localWitnesses',[]):
            if not x.get('sameTopFaceAsNativeFailure'):continue
            bi,ti=x['bodyFace'],x['topFace'];bodyids.add(bi);topids.add(ti)
            a=B[bf[bi]];b=T[tf[ti]];an=np.cross(a[1]-a[0],a[2]-a[0]);an/=np.linalg.norm(an);bn=np.cross(b[1]-b[0],b[2]-b[0]);bn/=np.linalg.norm(bn)
            x['pairPlaneSignedDistancesMetres']={'topVerticesToBodyPlane':((b-a[0])@an).tolist(),'bodyVerticesToTopPlane':((a-b[0])@bn).tolist(),'meaning':'Exact oriented infinite-plane side depths; not finite-surface penetration depth or watertight inside/outside.'}
            examples.append({'frame':row['frame'],'bodyFace':bi,'topFace':ti,**x['pairPlaneSignedDistancesMetres']})
for x in report['selectedNativeFailureRelationships']:
    if x['top']=='m1-uniform-top_1':topids.update(f['topFace']for f in x['uniqueFailedTopFaces'])
toppos=tr(tp['attributes']['POSITION']);bodypos=br(bp['attributes']['POSITION'])
report['sourceMapping']={'topAsset':str(top_path.relative_to(R)),'topSha256':sha(top_path),'primitive':0,'actualCaptureIndicesExact':True,'originalClosedTopAsset':str(closed_path.relative_to(R)),'originalClosedTopSha256':sha(closed_path),'editMapPath':str(edit_path.relative_to(R)),'editMapSha256':sha(edit_path),'allOpenFacesMappedExactlyToOriginalClosedIndices':True,'originalCapFacesRemoved':edit['removedOriginalFaces'],'bodyAsset':str(body_path.relative_to(R)),'bodySha256':sha(body_path),'bodyPrimitive':0,'bodyCaptureIndicesExact':True,'alphaProof':{'alphaMode':material.get('alphaMode'),'alphaCutoff':material.get('alphaCutoff'),'baseColorFactor':material['pbrMetallicRoughness'].get('baseColorFactor'),'embeddedImageSha256':hashlib.sha256(png).hexdigest(),'width':int(pixels.shape[1]),'height':int(pixels.shape[0]),'allPixelAlphaMinMax':[int(pixels[:,:,3].min()),int(pixels[:,:,3].max())],'pixelsScanned':int(pixels.shape[0]*pixels.shape[1])},'topFaces':[{'actualFace':int(i),'originalClosedFace':int(facemap[i]),'actualRenderVertexIds':tf[i].tolist(),'originalClosedRenderVertexIds':vertexmap[tf[i]].tolist(),'restTriangleMetres':toppos[tf[i]].tolist(),'meanBoneWeights':weights(td,tr,tp,tf[i])}for i in sorted(topids)],'bodyFaces':[{'actualFace':int(i),'renderVertexIds':bf[i].tolist(),'restTriangleMetres':bodypos[bf[i]].tolist(),'meanBoneWeights':weights(bd,br,bp,bf[i])}for i in sorted(bodyids)]}
report['limits']=[x for x in report['limits']if not x.startswith('1.2mm object collision')]
report['limits'].append('1.2mm per-side detection envelopes sum to2.4mm; actual response targets sum to2.133333mm. The2.22554mm positive gap alone does not prove an infeasible corridor.')
report['limits'].append('All global finite-intersection and proximity witnesses retained in compressed archive; local/failure-related details additionally indexed.')
raw=(json.dumps(report,indent=2)+'\n').encode();packed=gzip.compress(raw,compresslevel=6,mtime=0)
assert gzip.decompress(packed)==raw
P.write_bytes(packed)
summary={'schema':'skirt-layer-corridor-dynamic-summary-v1','archive':P.name,'rawSha256':hashlib.sha256(raw).hexdigest(),'gzipSha256':sha(P),'rawBytes':len(raw),'gzipBytes':len(packed),'allGlobalWitnessesPreserved':True,'sourceSha256':report['sourceSha256'],'captureSha256':report['captureSha256'],'trialPreparationSha256':report['trialPreparationSha256'],'bodySha256':report['sourceMapping']['bodySha256'],'topSha256':report['sourceMapping']['topSha256'],'mappedTopFaces':len(topids),'mappedBodyFaces':len(bodyids),'physicsExecuted':False,'selected':[{'frame':x['frame'],'top':x['top'],'failedTopFaces':len(x['uniqueFailedTopFaces']),'facesCrossingBody':sum(bool(f['bodyClearance'].get('intersectingBodyFaces'))for f in x['uniqueFailedTopFaces']),'facesGapUnder2p4mm':sum(f['bodyClearance'].get('distanceMetres',1)<.0024 for f in x['uniqueFailedTopFaces'])}for x in report['selectedNativeFailureRelationships']],'keyRows':[{'frame':r['frame'],'tops':[{k:t[k]for k in ['name','pairCount','strictPairCount','nearSkirtPairCount']}for t in r['tops']]}for r in report['rows']if r['frame']in[1,19,29,35,60,'standing','sit-in','seated','rise']],'limits':report['limits']}
(ROOT/'evidence/skirt-layer-corridor-dynamic.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'bytes':P.stat().st_size,'rawBytes':len(raw),'mappedTopFaces':len(topids),'mappedBodyFaces':len(bodyids),'alpha':report['sourceMapping']['alphaProof']['allPixelAlphaMinMax'],'sha256':sha(P)}))
