"""Read two actual VRMs; exact referenced-Body correspondence, alpha and bones.
No editor, mesh mutation, export, nearest-point matching or weight correction.
"""
import os,sys
os.environ.setdefault('OPENBLAS_NUM_THREADS','2')
sys.dont_write_bytecode=True
from pathlib import Path
import collections,hashlib,importlib.util,io,json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('body_audit',Path(__file__).resolve().parents[1]/'audit.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def skeleton(g):
    d=g.doc;world=a.matrices(d);parent={c:i for i,n in enumerate(d['nodes']) for c in n.get('children',[])}
    names=[n.get('name','') for n in d['nodes']]
    joints=set(j for s in d['skins'] for j in s['joints'])
    assert all(names[j] and names.count(names[j])==1 for j in joints),'Ambiguous joint name; no guessed mapping'
    rows={names[j]:dict(node=j,parentName=names[parent[j]] if j in parent else None,
        sourceNode=d['nodes'][j],worldMatrix=world[j].tolist()) for j in joints}
    return rows,world,names

def primitive(g,world,names,material):
    d=g.doc;found=[]
    for ni,n in enumerate(d['nodes']):
        if 'mesh' not in n:continue
        for pi,p in enumerate(d['meshes'][n['mesh']]['primitives']):
            if d['materials'][p['material']]['name']==material:found.append((ni,pi,p))
    assert len(found)==1,(material,'ambiguous/missing primitive',len(found))
    ni,pi,p=found[0];n=d['nodes'][ni];skin=d['skins'][n['skin']]
    attrs={k:g.acc(v) for k,v in p['attributes'].items()};tri=g.acc(p['indices']).reshape(-1,3).astype(int)
    ids=np.unique(tri);pos=attrs['POSITION'].astype(float);uv=attrs['TEXCOORD_0'].astype(float)
    jw=attrs['WEIGHTS_0'].astype(float);ji=attrs['JOINTS_0'].astype(int)
    assert not d['accessors'][p['attributes']['WEIGHTS_0']].get('normalized',False)
    ibm=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
    jointNames=[names[j] for j in skin['joints']]
    matrices=np.stack([world[j]@ibm[k] for k,j in enumerate(skin['joints'])])
    hp=np.c_[pos,np.ones(len(pos))];rest=np.zeros_like(pos)
    for k in range(4):rest+=np.einsum('nij,nj->ni',matrices[ji[:,k]],hp)[:,:3]*jw[:,k,None]
    # Exact geometric/UV keys, cyclic rotation only: no reflection, proximity or welding.
    keyed={};duplicates=[]
    for ti,t in enumerate(tri):
        corners=[tuple(np.r_[pos[v],uv[v]]) for v in t]
        rotation=min(range(3),key=lambda k:tuple(corners[k:]+corners[:k]))
        key=tuple(corners[rotation:]+corners[:rotation]);order=np.roll(t,-rotation)
        if key in keyed:duplicates.append(ti)
        else:keyed[key]=(ti,order)
    binding=[]
    for row in ids:
        # Keep all stored lanes (including zero weights) separately; semantic sums are diagnostic only.
        binding.append(dict(vertex=int(row),lanes=[dict(bone=jointNames[int(j)],weight=float(w)) for j,w in zip(ji[row],jw[row])]))
    meta=dict(node=ni,primitive=pi,material=material,referencedVertices=len(ids),triangles=len(tri),sharedAttributeRows=len(pos),duplicateExactTriangleKeys=duplicates,
        attributeNames=sorted(attrs),morphTargets=len(p.get('targets',[])),skinJoints=jointNames,
        materialJSON=d['materials'][p['material']],referencedBindings=binding)
    return dict(g=g,p=p,meta=meta,attrs=attrs,tri=tri,ids=ids,keyed=keyed,rest=rest,ibm=dict(zip(jointNames,ibm)),jointNames=jointNames)

def sample_rgba(p,ordered):
    d=p['g'].doc;m=p['meta']['materialJSON'];info=m['pbrMetallicRoughness']['baseColorTexture']
    tex=d['textures'][info['index']];im=d['images'][tex['source']];v=d['bufferViews'][im['bufferView']]
    raw=p['g'].bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    rgba=np.asarray(Image.open(io.BytesIO(raw)).convert('RGBA')).astype(float)/255
    transform=info.get('extensions',{}).get('KHR_texture_transform',{})
    assert transform.get('rotation',0)==0 and transform.get('offset',[0,0])==[0,0] and transform.get('scale',[1,1])==[1,1]
    assert transform.get('texCoord',info.get('texCoord',0))==0
    samp=d['samplers'][tex['sampler']]
    assert samp=={'magFilter':9729,'minFilter':9729,'wrapS':10497,'wrapT':10497},'Sampler changed; do not claim old linear model'
    uv=np.einsum('bi,tij->tbj',a.BARY,p['attrs']['TEXCOORD_0'][ordered].astype(float))
    h,w=rgba.shape[:2];x=uv[:,:,0]*w-.5;y=uv[:,:,1]*h-.5
    ix=np.floor(x).astype(int);iy=np.floor(y).astype(int);fx=(x-ix)[...,None];fy=(y-iy)[...,None]
    values=(rgba[iy%h,ix%w]*(1-fx)*(1-fy)+rgba[iy%h,(ix+1)%w]*fx*(1-fy)+rgba[(iy+1)%h,ix%w]*(1-fx)*fy+rgba[(iy+1)%h,(ix+1)%w]*fx*fy)
    values*=np.asarray(m['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1]))
    return values,dict(image=tex['source'],sha256=hashlib.sha256(raw).hexdigest(),dimensions=[w,h],sampler=samp,mode=m.get('alphaMode','OPAQUE'),cutoff=m.get('alphaCutoff',.5))

def compare(before,after,arrays,prefix):
    b,aft=before,after;common=sorted(set(b['keyed'])&set(aft['keyed']))
    ambiguous=bool(b['meta']['duplicateExactTriangleKeys'] or aft['meta']['duplicateExactTriangleKeys'])
    result=dict(before=b['meta'],after=aft['meta'],exactCommonTriangleKeys=len(common),
        sourceOnlyTriangleKeys=len(set(b['keyed'])-set(aft['keyed'])),resultOnlyTriangleKeys=len(set(aft['keyed'])-set(b['keyed'])),ambiguousCorrespondence=ambiguous)
    commonBones=sorted(set(b['ibm'])&set(aft['ibm']))
    result['skinBindingTable']=dict(removed=sorted(set(b['ibm'])-set(aft['ibm'])),added=sorted(set(aft['ibm'])-set(b['ibm'])),
        commonIBMMaxAbs=float(max((np.abs(b['ibm'][j]-aft['ibm'][j]).max() for j in commonBones),default=0)))
    if ambiguous or not common:return result
    old=np.array([b['keyed'][key][1] for key in common]);new=np.array([aft['keyed'][key][1] for key in common])
    result['commonReferencedAttributeExact']={k:bool(np.array_equal(b['attrs'][k][old],aft['attrs'][k][new])) for k in sorted(set(b['attrs'])&set(aft['attrs'])) if k!='JOINTS_0'}
    semantic=lambda p,order:np.array(p['jointNames'])[p['attrs']['JOINTS_0'][order].astype(int)]
    result['commonJointLaneBoneNamesExact']=bool(np.array_equal(semantic(b,old),semantic(aft,new)))
    active=lambda p,order:np.where(p['attrs']['WEIGHTS_0'][order]>0,semantic(p,order),'ZERO_WEIGHT_UNUSED')
    result['commonActiveJointLaneBoneNamesExact']=bool(np.array_equal(active(b,old),active(aft,new)))
    result['commonRestMaxErrorMm']=float(np.linalg.norm(b['rest'][old]-aft['rest'][new],axis=-1).max()*1000)
    arrays[prefix+'OldTriangleIds']=np.array([b['keyed'][key][0] for key in common]);arrays[prefix+'NewTriangleIds']=np.array([aft['keyed'][key][0] for key in common])
    arrays[prefix+'OldOrderedVertices']=old;arrays[prefix+'NewOrderedVertices']=new
    if prefix=='body':
        x,tx=sample_rgba(b,old);y,ty=sample_rgba(aft,new);xyz=np.einsum('bi,tij->tbj',a.BARY,aft['rest'][new])
        h0=x[:,:,3]<tx['cutoff'];h1=y[:,:,3]<ty['cutoff']
        arrays.update(bodyOriginalRGBA=x,bodyResultRGBA=y,bodyResultSampleXYZ=xyz)
        result['alpha']=dict(beforeTexture=tx,afterTexture=ty,samples=int(h0.size),beforeBelow=int(h0.sum()),afterBelow=int(h1.sum()),
            recoveredSamples=int((h0&~h1).sum()),newlyHiddenSamples=int((~h0&h1).sum()),remainingHiddenSamples=int((h0&h1).sum()),
            visibleBeforeAndAfterRGBMaxAbs=float(np.abs(x[:,:,:3]-y[:,:,:3])[~h0&~h1].max()) if (~h0&~h1).any() else None,
            remainingHiddenBounds=dict(min=xyz[h1].min(0).tolist(),max=xyz[h1].max(0).tolist()) if h1.any() else None,
            limitation='Seven bilinear probes per matched triangle, not exhaustive raster coverage or anatomical classification; residual masks cannot be assigned to Bottoms without native evidence')
        bands=json.loads((ROOT/'evidence/native-vroid-body-audit-v1/female-result.json').read_text())['measurementBandsY']
        result['alpha']['bands']={name:dict(beforeBelow=int((h0&((xyz[:,:,1]>=lo)&(xyz[:,:,1]<=hi))).sum()),afterBelow=int((h1&((xyz[:,:,1]>=lo)&(xyz[:,:,1]<=hi))).sum())) for name,(lo,hi) in bands.items()}
    return result

def main():
    source=ROOT/'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'
    assert sha(source)=='78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3'
    target,out=map(Path,sys.argv[1:]);assert not out.exists();out.mkdir(parents=True)
    gb,ga=a.reader.GLB(source),a.reader.GLB(target)
    sb,wb,nb=skeleton(gb);sa,wa,na=skeleton(ga)
    common=sorted(set(sb)&set(sa));skeletonDiff=dict(removed=sorted(set(sb)-set(sa)),added=sorted(set(sa)-set(sb)),
        changedParent=[j for j in common if sb[j]['parentName']!=sa[j]['parentName']],
        commonWorldMaxAbs=max((float(np.abs(np.array(sb[j]['worldMatrix'])-sa[j]['worldMatrix']).max()) for j in common),default=0),before=sb,after=sa)
    records={};arrays={}
    for kind,pattern in [('body','_Body_'),('bottoms','_Bottoms_'),('shoes','_Shoes_')]:
        found=[m['name'] for m in gb.doc['materials'] if pattern in m['name']];assert len(found)==1,(kind,found)
        records[kind]=compare(primitive(gb,wb,nb,found[0]),primitive(ga,wa,na,found[0]),arrays,kind)
    output=out/'arrays.npz';np.savez_compressed(output,**arrays)
    result=dict(schema='native-skin-mask-tops-removal-readback-v1',source=dict(path=str(source),sha256=sha(source)),result=dict(path=str(target),sha256=sha(target)),scriptSha256=sha(Path(__file__)),
        skeleton=skeletonDiff,primitives=records,arraysSha256=sha(output),metaBefore=gb.doc['extensions']['VRMC_vrm']['meta'],metaAfter=ga.doc['extensions']['VRMC_vrm']['meta'],
        status='readback-only-not-factory-admission',limits=['No visual/pose/complete-skin admission','No reassignment of old equipment avatar SHA','Exact geometric/UV correspondence only; changed/unmatched surfaces are not guessed'])
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps({k:{'triangles':v['exactCommonTriangleKeys'],'alpha':v.get('alpha'),'binding':v['skinBindingTable']} for k,v in records.items()},ensure_ascii=False))
if __name__=='__main__':main()
