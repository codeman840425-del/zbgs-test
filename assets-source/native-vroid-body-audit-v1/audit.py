"""One read-only inventory of actual native source triangles, UV alpha and bindings."""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import os
import sys
import time
os.environ.setdefault('OPENBLAS_NUM_THREADS','2')
import numpy as np
from PIL import Image

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'evidence/native-vroid-body-audit-v1'
READER=ROOT/'scripts/m2-male-face-v1/glb.py'
module=importlib.util.spec_from_file_location('existing_glb_reader',READER)
reader=importlib.util.module_from_spec(module);module.loader.exec_module(reader)
sha=lambda b:hashlib.sha256(b).hexdigest()
CASES=[('female','female-native-round-waist-216.vrm','78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3'),('male','male-native-base-216.vrm','a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da')]
BARY=np.array([[1,0,0],[0,1,0],[0,0,1],[1/3]*3,[.5,.5,0],[0,.5,.5],[.5,0,.5]],dtype=float)

def clean(v):
    if isinstance(v,np.ndarray):return v.tolist()
    if isinstance(v,np.generic):return v.item()
    if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
    if isinstance(v,list):return [clean(x) for x in v]
    return v
def save(name,v):
    with (OUT/name).open('x',encoding='utf-8') as f:json.dump(clean(v),f,ensure_ascii=False,indent=2,allow_nan=False);f.write('\n')
def matrices(doc):
    parent={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])}
    local=[]
    for n in doc['nodes']:
        if 'matrix' in n:m=np.array(n['matrix']).reshape(4,4).T
        else:
            x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4)
            m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]))
            m[:3,3]=n.get('translation',[0,0,0])
        local.append(m)
    world={}
    def get(i):
        if i not in world:world[i]=get(parent[i])@local[i] if i in parent else local[i]
        return world[i]
    return [get(i) for i in range(len(local))]
def wrap(v,mode):
    if mode==33071:return np.clip(v,0,1)
    if mode==33648:return 1-np.abs((v%2)-1)
    assert mode==10497
    return v%1
def texture_alpha(g,material,uv):
    pbr=material.get('pbrMetallicRoughness',{});factor=pbr.get('baseColorFactor',[1,1,1,1])[3]
    info=pbr.get('baseColorTexture')
    if info is None:return np.full(uv.shape[:-1],factor),dict(texture=None,factor=factor)
    tex=g.doc['textures'][info['index']];image=g.doc['images'][tex['source']];assert 'uri' not in image
    view=g.doc['bufferViews'][image['bufferView']];raw=g.bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
    rgba=np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA'));alpha=rgba[:,:,3];h,w=alpha.shape
    transform=info.get('extensions',{}).get('KHR_texture_transform',{});assert transform.get('texCoord',info.get('texCoord',0))==0
    scale=np.array(transform.get('scale',[1,1]));offset=np.array(transform.get('offset',[0,0]));angle=transform.get('rotation',0)
    rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
    xy=(uv*scale)@rotation.T+offset
    sampler=g.doc.get('samplers',[])[tex['sampler']] if 'sampler'in tex else {}
    u=wrap(xy[...,0],sampler.get('wrapS',10497));v=wrap(xy[...,1],sampler.get('wrapT',10497))
    # glTF image row/UV convention; nearest level-zero texel probe, no GPU filtering/mips.
    ix=np.minimum(np.floor(u*w).astype(int),w-1);iy=np.minimum(np.floor(v*h).astype(int),h-1)
    sampled=alpha[iy,ix].astype(float)/255*factor
    return sampled,dict(texture=info['index'],image=tex['source'],imageSha256=sha(raw),dimensions=[w,h],factor=factor,alphaMode=material.get('alphaMode','OPAQUE'),alphaCutoff=material.get('alphaCutoff',.5),textureTransform=transform,sampler=sampler,atlasAlpha=dict(min=int(alpha.min()),max=int(alpha.max()),zeroPixels=int((alpha==0).sum()),fullPixels=int((alpha==255).sum()),partialPixels=int(((alpha>0)&(alpha<255)).sum())),sampling='7 barycentric probes/triangle; nearest level-zero texel, UV wrap and KHR transform applied; not filtered/mipmap raster coverage')
def alpha_stats(a,mode,cut):
    return dict(samples=int(a.size),min=float(a.min()) if a.size else None,max=float(a.max()) if a.size else None,zero=int((a==0).sum()),belowCutoff=int((a<cut).sum()),discardInterpretation='alpha ignored in OPAQUE' if mode=='OPAQUE' else 'MASK point samples below cutoff are discarded' if mode=='MASK' else 'BLEND point samples carry opacity; not binary coverage')

def audit(sex,name,pin):
    path=ROOT/'assets-source/vroid-bridge-study-v1/generated'/name;raw=path.read_bytes();assert sha(raw)==pin
    g=reader.GLB(path);d=g.doc;world=matrices(d)
    human=d['extensions']['VRMC_vrm']['humanoid']['humanBones']
    bones={s:world[v['node']][:3,3] for s,v in human.items()}
    # Skeleton-defined horizontal bands are measurement regions, not anatomical surface labels.
    thighY=float(np.mean([bones[s][1] for s in ['leftUpperLeg','rightUpperLeg']]))
    kneeY=float(np.mean([bones[s][1] for s in ['leftLowerLeg','rightLowerLeg']]))
    ankleY=float(np.mean([bones[s][1] for s in ['leftFoot','rightFoot']]))
    hipY=float(bones['hips'][1]);chestY=float(bones['chest'][1]);neckY=float(bones['neck'][1])
    bands={'chest':[chestY,neckY],'abdomen':[hipY,chestY],'pelvis':[thighY,hipY],'belowKnee':[ankleY,kneeY]}
    rows=[];body=[];arrays={}
    for ni,node in enumerate(d['nodes']):
        if 'mesh'not in node:continue
        for pi,p in enumerate(d['meshes'][node['mesh']]['primitives']):
            assert p.get('mode',4)==4
            pos=g.acc(p['attributes']['POSITION']).astype(float);tri=g.acc(p['indices']).reshape(-1,3).astype(int);ids=np.unique(tri)
            assert len(tri)>0 and ids.min()>=0 and ids.max()<len(pos)
            # Rest skin position, not merely the mesh node's unskinned local positions.
            skin=d['skins'][node['skin']];joints=g.acc(p['attributes']['JOINTS_0']).astype(int);weights=g.acc(p['attributes']['WEIGHTS_0']).astype(float)
            assert not d['accessors'][p['attributes']['WEIGHTS_0']].get('normalized',False)
            ibm=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
            matrices_skin=np.stack([world[j]@ibm[k] for k,j in enumerate(skin['joints'])])
            hp=np.c_[pos,np.ones(len(pos))];rest=np.zeros((len(pos),3))
            for k in range(4):rest+=np.einsum('nij,nj->ni',matrices_skin[joints[:,k]],hp)[:,:3]*weights[:,k,None]
            material=d['materials'][p['material']];uv=g.acc(p['attributes']['TEXCOORD_0']).astype(float)
            assert 'COLOR_0'not in p['attributes']
            sampleUV=np.einsum('bi,tij->tbj',BARY,uv[tri]);alpha,texture=texture_alpha(g,material,sampleUV)
            sampleXYZ=np.einsum('bi,tij->tbj',BARY,rest[tri]);ymin=rest[tri,1].min(1);ymax=rest[tri,1].max(1)
            area=np.linalg.norm(np.cross(rest[tri[:,1]]-rest[tri[:,0]],rest[tri[:,2]]-rest[tri[:,0]]),axis=1)/2
            row=dict(node=ni,mesh=node['mesh'],primitive=pi,material=p['material'],materialName=material['name'],indicesAccessor=p['indices'],positionAccessor=p['attributes']['POSITION'],attributeRows=len(pos),referencedVertices=len(ids),triangles=len(tri),restBounds=dict(min=rest[ids].min(0),max=rest[ids].max(0)),morphTargets=len(p.get('targets',[])),skin=dict(joints=len(skin['joints']),jointIndexRange=[int(joints[ids].min()),int(joints[ids].max())],finite=bool(np.isfinite(weights[ids]).all() and np.isfinite(rest[ids]).all()),negativeWeights=int((weights[ids]<0).sum()),maximumWeightSumError=float(np.max(np.abs(weights[ids].sum(1)-1))),maxActiveInfluences=int((weights[ids]>0).sum(1).max())),degenerateTrianglesAt1eMinus14M2=int((area<=1e-14).sum()),texture=texture,alphaSamples=alpha_stats(alpha,material.get('alphaMode','OPAQUE'),material.get('alphaCutoff',.5)),bands={})
            for band,(lo,hi) in bands.items():
                assert lo<hi
                overlap=(ymin<=hi)&(ymax>=lo);inside=(ymin>=lo)&(ymax<=hi);samples=(sampleXYZ[:,:,1]>=lo)&(sampleXYZ[:,:,1]<=hi)
                row['bands'][band]=dict(crossingOrInsideTriangles=int(overlap.sum()),fullyInsideTriangles=int(inside.sum()),alpha=alpha_stats(alpha[samples],material.get('alphaMode','OPAQUE'),material.get('alphaCutoff',.5)))
            if '_Body_'in material['name'] and '_SKIN'in material['name']:
                body.append(row);assert len(body)==1
                arrays.update(bodyRestPositionsM=rest,bodySourcePositionsM=pos,bodyTriangles=tri,bodyUV=uv,bodyJoints=joints,bodyWeights=weights,bodyAlphaSamples=alpha,bodySamplePositionsM=sampleXYZ)
                row['sections']=[]
                for band,(lo,hi) in bands.items():
                    y=(lo+hi)/2;segments=[];triangleIds=[]
                    for ti in np.where((ymin<y)&(ymax>y))[0]:
                        q=rest[tri[ti]];pts=[]
                        for a,b in [(0,1),(1,2),(2,0)]:
                            if (q[a,1]-y)*(q[b,1]-y)<0:pts.append(q[a]+(y-q[a,1])/(q[b,1]-q[a,1])*(q[b]-q[a]))
                        if len(pts)==2:segments.append(pts);triangleIds.append(int(ti))
                    s=np.asarray(segments,dtype=float).reshape(-1,2,3)
                    arrays['section_'+band]=s;arrays['section_'+band+'_triangleIds']=np.array(triangleIds)
                    row['sections'].append(dict(band=band,y=y,segments=len(s),bounds=dict(min=s.reshape(-1,3).min(0),max=s.reshape(-1,3).max(0)) if len(s) else None,interpretation='Actual indexed Body triangle intersections; presence/span is not proof of closed or anatomically complete skin'))
            rows.append(row)
    assert len(body)==1
    npz=OUT/(sex+'-body-arrays.npz');assert not npz.exists();np.savez_compressed(npz,**arrays)
    result=dict(schema='native-vroid-body-audit-v1',sex=sex,source=dict(path=path.relative_to(ROOT).as_posix(),sha256=pin,bytes=len(raw)),metaVersion=d['extensions']['VRMC_vrm']['specVersion'],sourceNodes=len(d['nodes']),skins=[dict(joints=len(s['joints']),ibmAccessor=s['inverseBindMatrices']) for s in d['skins']],skeletalWorldPositions=bones,measurementBandsY=bands,bodyPrimitive=dict(node=body[0]['node'],mesh=body[0]['mesh'],primitive=body[0]['primitive']),primitives=rows,arraysSha256=sha(npz.read_bytes()),limitations=['No pre-export unmasked reference exists here; completeness cannot be inferred from retained attribute row count or delete_transparent=false','Horizontal bands include any surface in that height range, potentially arms; not anatomy segmentation','7 alpha samples per triangle are not exhaustive texture coverage; no bilinear/mip/shader raster test','Body triangles and clothing overlap in height do not prove clothing occlusion from any camera','No pose/deformation/visual/skin-coverage admission; no synthetic body or geometry changes'])
    save(sex+'-result.json',result)
    return dict(sex=sex,sourceSha256=pin,body=body[0],allPrimitives=len(rows))

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);started=time.monotonic()
    results=[audit(*case) for case in CASES]
    save('summary.json',dict(schema='native-vroid-body-audit-summary-v1',reader=dict(path=READER.relative_to(ROOT).as_posix(),sha256=sha(READER.read_bytes())),scriptSha256=sha(Path(__file__).read_bytes()),wallSeconds=time.monotonic()-started,results=results))
    print(json.dumps(clean(results),ensure_ascii=False))
