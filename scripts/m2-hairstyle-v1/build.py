"""One deterministic bob derivative. No body/material/UV/animation editing."""
import pathlib, sys, json, hashlib, struct, copy
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/m2-male-face-v1'))
from glb import GLB
OUT=ROOT/'assets-source/m2-hairstyle-v1';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'prototype/public/assets/foundation/base-female-roundtrip.vrm'
SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SHA
s=GLB(SOURCE);p=s.doc['meshes'][0]['primitives'][5]
tri=s.acc(p['indices']).reshape(-1,3);used=np.unique(tri);tri=np.searchsorted(used,tri)
pos=s.acc(p['attributes']['POSITION'])[used].astype(float);uv=s.acc(p['attributes']['TEXCOORD_0'])[used]
skin=s.doc['skins'][0];head=next(i for i,n in enumerate(s.doc['nodes']) if n.get('name')=='J_Bip_C_Head')
ibm=s.acc(skin['inverseBindMatrices'])[skin['joints'].index(head)].reshape(4,4).T
assert all(skin['joints'][int(j)]==head for j,w in zip(s.acc(p['attributes']['JOINTS_0'])[used].flat,s.acc(p['attributes']['WEIGHTS_0'])[used].flat) if w>1e-7)
spec={'id':'m2-female-neck-bob-v1','sourceSha256':SHA,'sourceMaterial':'F00_000_HairBack_00_HAIR','upperPreservedY':1.525,'fullProfileY':1.415,'neckHemY':1.34,'sideExtensionM':.046,'lowerRadiusX':.096,'lowerRadiusZ':.105,'frontPreserveZ':-.035,'method':'Source crown/fringe exact; side/back continuous radial profile expansion and authored neck-length extension. Original UV and texture retained. Rigid head attachment.'}
(OUT/'parameters.json').write_text(json.dumps(spec,indent=2),encoding='utf-8')
def smooth(x):x=np.clip(x,0,1);return x*x*(3-2*x)
q=pos.copy(); cx=.00025545
for i,(x,y,z) in enumerate(pos):
    # Front fringe is an explicit protected region; no point is moved towards the face.
    side=smooth((abs(x-cx)-.055)/.025)
    back=smooth((z+.035)/.055)
    region=max(side,back)
    vertical=smooth((1.525-y)/.11)*region
    radius=np.sqrt(((x-cx)/.096)**2+((z-.005)/.105)**2)
    if radius>1e-6:
        target=np.array([(x-cx)/radius+cx,y,(z-.005)/radius+.005])
        q[i,0]=x+(target[0]-x)*vertical
        q[i,2]=z+(target[2]-z)*vertical
    extension=.046*side*smooth((1.515-y)/.095)
    q[i,1]=max(1.34,y-extension)
local=lambda a:(np.c_[a,np.ones(len(a))]@ibm.T)[:,:3]
def normals(v):
    n=np.zeros_like(v)
    for t in tri:
        face=np.cross(v[t[1]]-v[t[0]],v[t[2]]-v[t[0]])
        for j in t:n[j]+=face
    n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
    return n
def export(name,world):
    v=local(world); blob=bytearray();views=[];acc=[]
    def append(b):
        blob.extend(b'\0'*((-len(blob))%4));i=len(views);views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(b)});blob.extend(b);return i
    def array(a,kind,ctype=5126):
        a=np.asarray(a,dtype='<f4' if ctype==5126 else '<u4');i=len(acc);d={'bufferView':append(a.tobytes()),'componentType':ctype,'count':len(a),'type':kind}
        if kind=='VEC3':d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        acc.append(d);return i
    attrs={'POSITION':array(v,'VEC3'),'NORMAL':array(normals(v),'VEC3'),'TEXCOORD_0':array(uv,'VEC2')}
    inds=array(tri.reshape(-1,1),'SCALAR',5125)
    m=copy.deepcopy(s.doc['materials'][p['material']]);images=[];textures=[];samplers=[]
    for key,owner in [('baseColorTexture',m['pbrMetallicRoughness']),('normalTexture',m),('emissiveTexture',m)]:
        if key not in owner:continue
        tx=s.doc['textures'][owner[key]['index']];im=copy.deepcopy(s.doc['images'][tx['source']]);b=s.doc['bufferViews'][im['bufferView']];im['bufferView']=append(s.bin[b.get('byteOffset',0):b.get('byteOffset',0)+b['byteLength']]);im.pop('uri',None)
        nt={'source':len(images)}
        if 'sampler'in tx:nt['sampler']=len(samplers);samplers.append(s.doc['samplers'][tx['sampler']])
        owner[key]['index']=len(textures);textures.append(nt);images.append(im)
    doc={'asset':{'version':'2.0','generator':'M2 hairstyle source builder v1'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':name,'mesh':0}],'meshes':[{'name':name,'primitives':[{'attributes':attrs,'indices':inds,'material':0}]}],'materials':[m],'textures':textures,'images':images,'samplers':samplers,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':acc,'extensionsUsed':['KHR_materials_unlit'],'extras':{'coordinateSpace':'current-raw-head-bind-local','avatarSha256':SHA}}
    jb=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*((-len(jb))%4);blob+=b'\0'*((-len(blob))%4)
    raw=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    (OUT/(name+'.glb')).write_bytes(raw);return hashlib.sha256(raw).hexdigest()
hashes={name:export(name,v)for name,v in [('original-head-local',pos),(spec['id'],q)]}
delta=np.linalg.norm(q-pos,axis=1)
report={'sourceSha256':SHA,'sourcePrimitive':5,'sourceMaterial':spec['sourceMaterial'],'vertices':len(pos),'triangles':len(tri),'allHeadWeightOne':True,'sourceHairMorphTargets':0,'sourceHairSprings':0,'originalUsedVertices':used.tolist(),'sourceWorldPositions':pos.tolist(),'candidateWorldPositions':q.tolist(),'headInverseBindColumnMajor':ibm.T.reshape(-1).tolist(),'headBindMatrixColumnMajor':np.linalg.inv(ibm).T.reshape(-1).tolist(),'changedVertices':int(np.count_nonzero(delta>1e-7)),'maxDisplacementM':float(delta.max()),'upperProtectedExact':bool(np.array_equal(q[pos[:,1]>=1.525],pos[pos[:,1]>=1.525])),'hashes':hashes,'limits':['Rigid short hair, no collision or secondary motion.','Default female only; variants require explicit head/face validation.','Geometric source candidate; appearance acceptance pending.']}
(OUT/'build-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
fit={'schema':'zbgs-hairstyle-fit-v1','id':spec['id'],'file':spec['id']+'.glb','sha256':hashes[spec['id']],'compatibleAvatarSha256':SHA,'attachment':{'semantic':'head','rawBone':'J_Bip_C_Head','coordinateSpace':'raw-head-bind-local','position':[0,0,0],'quaternion':[0,0,0,1],'scale':[1,1,1]},'hideOriginal':{'sourceMesh':0,'primitive':5,'materialNames':[spec['sourceMaterial']],'hideWholeBody':False,'restore':'Restore original per-material/group visible state; include only outline clone of exactly the same HAIR primitive.'},'physics':'rigid','provenance':'../foundation/source.json'}
(OUT/'fit.json').write_text(json.dumps(fit,indent=2),encoding='utf-8')
print(json.dumps({k:report[k]for k in ['changedVertices','maxDisplacementM','upperProtectedExact','hashes']}))

(OUT/"female-bob.glb").write_bytes((OUT/(spec["id"]+".glb")).read_bytes())
manifest={"schema":"character-hairstyle-v1","id":"female-bob-v1","label":"齐颈波波头 · 制作候选","mount":"head","headLocal":True,"sourceMaterial":spec["sourceMaterial"],"url":"/assets/m2-hairstyle-v1/female-bob.glb","sha256":hashes[spec["id"]],"compatibleBodies":[SHA],"physics":"rigid","status":"source-candidate-not-product-accepted"}
(OUT/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding="utf-8")
