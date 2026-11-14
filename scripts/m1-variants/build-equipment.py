"""Deterministic independent clothing fit for one exact local female specimen.
Derived from the preserved M1 exporter; rebuilt pants use the modified full body.
Run Python scripts/m1-variants/build-equipment.py m1a-jaw-v1 or m1a-waisthip-v1.
Run with Python + numpy. Never modifies the source body or controller.
"""
import copy, hashlib, json, pathlib, struct, collections, sys
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
VARIANT = sys.argv[1] if len(sys.argv)>1 else None
assert VARIANT in ['m1a-jaw-v1','m1a-waisthip-v1'],'Pass one exact local specimen ID'
BUILD = json.loads((ROOT/'assets-source/m1-variants'/VARIANT/'build-report.json').read_text(encoding='utf8'))
SPEC = json.loads((ROOT/'assets-source/m1/spec.json').read_text(encoding='utf-8-sig'))
SPEC['source']='prototype/public/assets/m1-variants/'+VARIANT+'/avatar.vrm'
SPEC['sha256']=BUILD['vrmSha256'];SPEC['pants']['id']=VARIANT+'-training-pants'
SPEC['limits']=BUILD['limits']+['Only compatible with the exact new local specimen hash; original female and male identities are rejected']
raw = (ROOT/SPEC['source']).read_bytes()
assert hashlib.sha256(raw).hexdigest() == SPEC['sha256']
n = struct.unpack_from('<I', raw, 12)[0]
src = json.loads(raw[20:20+n]); binary = raw[28+n:]
expected=['Body_00_SKIN','_Tops_','_Accessory_Tie_','_Bottoms_','_Shoes_']
assert all(token in src['materials'][src['meshes'][0]['primitives'][i]['material']]['name'] for i,token in enumerate(expected)), 'Source material role order changed; inspect before export'
DTYPES = {5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
SIZES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(i):
    a=src['accessors'][i];v=src['bufferViews'][a['bufferView']]
    dtype=np.dtype(DTYPES[a['componentType']]); width=SIZES[a['type']]
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,
        offset=v.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()

def arrays(primitive):
    p=src['meshes'][0]['primitives'][primitive]
    indices=read(p['indices']).reshape(-1,3)
    used=np.unique(indices); lookup={int(i):k for k,i in enumerate(used)}
    return {key:read(i)[used] for key,i in p['attributes'].items()}, np.array([[lookup[int(i)] for i in tri] for tri in indices],dtype=np.uint32)

audit=[]
for i,p in enumerate(src['meshes'][0]['primitives']):
    a,t=arrays(i);w=a['WEIGHTS_0']; joints=a['JOINTS_0']; counts=collections.Counter()
    for j,v in zip(joints.flat,w.flat):
        if v>.001: counts[src['nodes'][src['skins'][0]['joints'][int(j)]]['name']]+=1
    audit.append({'primitive':i,'material':src['materials'][p['material']]['name'],
        'vertices':len(a['POSITION']),'triangles':len(t),'bounds':[a['POSITION'].min(0).tolist(),a['POSITION'].max(0).tolist()],
        'weightedBones':dict(counts),'multiBoneVertices':int(np.count_nonzero(np.count_nonzero(w>.001,axis=1)>1))})

skin=src['skins'][0]; ibm=read(skin['inverseBindMatrices'])
parents={c:i for i,x in enumerate(src['nodes']) for c in x.get('children',[])}
human={x['node']:x['bone'] for x in src['extensions']['VRM']['humanoid']['humanBones']}
provenance=json.loads((ROOT/'assets-source/foundation/source.json').read_text(encoding='utf-8'))
OUT=ROOT/'prototype/public/assets/m1-variants'/VARIANT/'equipment';OUT.mkdir(exist_ok=True,parents=True)

def export(id,name,slot,parts,method):
    # parts = (attribute arrays, triangles, source material index OR custom material)
    used=sorted({int(j) for a,t,m in parts for j,w in zip(a['JOINTS_0'].flat,a['WEIGHTS_0'].flat) if w>1e-8})
    remap={j:i for i,j in enumerate(used)}
    needed=set(skin['joints'][j] for j in used)
    for i in list(needed):
        while i in parents:i=parents[i];needed.add(i)
    ids={old:i+1 for i,old in enumerate(sorted(needed))}
    nodes=[{'name':id,'mesh':0,'skin':0}]
    for old in sorted(needed):
        x={k:v for k,v in src['nodes'][old].items() if k in ['name','translation','rotation','scale','matrix']}
        children=[ids[c] for c in src['nodes'][old].get('children',[]) if c in needed]
        if children:x['children']=children
        nodes.append(x)
    blob=bytearray();views=[];accessors=[];textures=[];images=[];materials=[];primitives=[]
    def append(data):
        blob.extend(b'\0'*((-len(blob))%4));index=len(views)
        views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data)});blob.extend(data);return index
    def write(a,component,kind):
        a=np.asarray(a,dtype=DTYPES[component]);vi=append(a.tobytes())
        item={'bufferView':vi,'componentType':component,'count':len(a),'type':kind}
        if kind=='VEC3':item.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        ai=len(accessors);accessors.append(item);return ai
    texture_cache={}
    def material(value):
        if isinstance(value,dict):return copy.deepcopy(value)
        original=src['materials'][value]
        # Standard glTF unlit preserves original clothing map without relying on VRM-only metadata.
        m={k:copy.deepcopy(original[k]) for k in ['name','alphaMode','alphaCutoff','doubleSided','pbrMetallicRoughness'] if k in original}
        m['extensions']={'KHR_materials_unlit':{}}
        tex=m.get('pbrMetallicRoughness',{}).get('baseColorTexture')
        if tex:
            old=tex['index']
            if old not in texture_cache:
                source_tex=src['textures'][old];image=copy.deepcopy(src['images'][source_tex['source']]);v=src['bufferViews'][image['bufferView']]
                image['bufferView']=append(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);image.pop('uri',None)
                ti=len(textures);texture_cache[old]=ti;textures.append({'source':len(images)});images.append(image)
            tex['index']=texture_cache[old]
        return m
    multi=0;total=0;triangles=0
    for attributes,t,m in parts:
        a={k:v.copy() for k,v in attributes.items()};w=a['WEIGHTS_0'];w/=w.sum(1,keepdims=True)
        a['JOINTS_0']=np.array([[remap[int(j)] if weight>1e-8 else 0 for j,weight in zip(js,ws)] for js,ws in zip(a['JOINTS_0'],w)],dtype=np.uint16)
        attrs={k:write(v,5123 if k=='JOINTS_0' else 5126,'VEC2' if k=='TEXCOORD_0' else 'VEC4' if k in ['JOINTS_0','WEIGHTS_0'] else 'VEC3') for k,v in a.items()}
        primitives.append({'attributes':attrs,'indices':write(t.reshape(-1,1),5125,'SCALAR'),'material':len(materials)})
        materials.append(material(m));total+=len(w);triangles+=len(t);multi+=int(np.count_nonzero(np.count_nonzero(w>.001,axis=1)>1))
    inverse=write(ibm[used],5126,'MAT4')
    bindings=[{'sourceBone':src['nodes'][skin['joints'][j]]['name'],'targetRawBone':src['nodes'][skin['joints'][j]]['name'],'humanoidSemantic':human.get(skin['joints'][j]),'inverseBindMatrix':ibm[j].tolist()} for j in used]
    doc={'asset':{'version':'2.0','generator':'zbgs M1 local-specimen reproducible equipment builder'},'scene':0,'scenes':[{'nodes':[0]+[ids[i] for i in sorted(needed) if parents.get(i) not in needed]}],
        'nodes':nodes,'skins':[{'joints':[ids[skin['joints'][j]] for j in used],'inverseBindMatrices':inverse}],
        'meshes':[{'name':id,'primitives':primitives}],'materials':materials,'buffers':[{'byteLength':len(blob)}],
        'bufferViews':views,'accessors':accessors,'extensionsUsed':['KHR_materials_unlit'],
        'extras':{'sourceSha256':SPEC['sha256'],'sourceProvenance':provenance,'method':method}}
    if images:doc.update(images=images,textures=textures)
    jb=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*((-len(jb))%4);blob+=b'\0'*((-len(blob))%4)
    output=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    (OUT/(id+'.glb')).write_bytes(output)
    return {'id':id,'name':name,'slot':slot,'url':id+'.glb','sha256':hashlib.sha256(output).hexdigest(),'bytes':len(output),
        'compatibleAvatarSha256':SPEC['sha256'],'preserveOriginalBody':True,'requiresRawSkeleton':True,'bindings':bindings,
        'limits':SPEC['limits'],'sourceLicense':provenance,'method':method,'stats':{'vertices':total,'triangles':triangles,'multiBoneVertices':multi,'joints':len(used)}}

entries=[]
for id,name,slot,prim in [(VARIANT+'-uniform-top','原制服上衣与领结','top',[1,2]),(VARIANT+'-uniform-skirt','原制服裙','bottom',[3]),(VARIANT+'-uniform-shoes','原制服鞋','shoes',[4])]:
    parts=[]
    for p in prim:
        a,t=arrays(p);parts.append((a,t,src['meshes'][0]['primitives'][p]['material']))
    entries.append(export(id,name,slot,parts,'Exact source clothing primitives; source textures, weights and rest bind retained'))

# Clip actual full-body lower torso triangles to two horizontal garment pattern planes.
# Interpolated boundary vertices preserve bone weights; source body remains untouched.
body,tris=arrays(0); cfg=SPEC['pants']; generated=[];indices=[];lookup={}
def pack(i):
    return {'p':body['POSITION'][i].astype(float),'n':body['NORMAL'][i].astype(float),
        'w':{int(j):float(w) for j,w in zip(body['JOINTS_0'][i],body['WEIGHTS_0'][i]) if w>1e-8}}
def mix(a,b,f):
    return {'p':a['p']*(1-f)+b['p']*f,'n':a['n']*(1-f)+b['n']*f,
        'w':{j:a['w'].get(j,0)*(1-f)+b['w'].get(j,0)*f for j in a['w'].keys()|b['w'].keys()}}
def clip(poly,height,sign):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ina=(a['p'][1]-height)*sign>=-1e-8;inb=(b['p'][1]-height)*sign>=-1e-8
        if ina:out.append(a)
        if ina!=inb:out.append(mix(a,b,(height-a['p'][1])/(b['p'][1]-a['p'][1])))
    return out
def vertex(v):
    key=tuple(np.round(v['p'],7))
    if key not in lookup:lookup[key]=len(generated);generated.append(v)
    return lookup[key]
for t in tris:
    poly=clip(clip([pack(i) for i in t],cfg['hemY'],1),cfg['waistY'],-1)
    if len(poly)>=3:
        q=[vertex(v) for v in poly]
        indices.extend((q[0],q[k],q[k+1]) for k in range(1,len(q)-1) if len({q[0],q[k],q[k+1]})==3)
V=[];W=[];J=[]
for v in generated:
    normal=v['n']/max(np.linalg.norm(v['n']),1e-12);V.append(v['p']+normal*cfg['clearance'])
    w=sorted(v['w'].items(),key=lambda x:(-x[1],x[0]))[:4];total=sum(x[1] for x in w)
    J.append([j for j,x in w]+[0]*(4-len(w)));W.append([x/total for j,x in w]+[0]*(4-len(w)))
# Fold back both cut boundaries: true rim geometry, no opacity mask or body deletion.
counts=collections.Counter();directed={}
for tri in indices:
    for a,b in zip(tri,tri[1:]+tri[:1]):key=tuple(sorted((a,b)));counts[key]+=1;directed[key]=(a,b)
edges=[directed[e] for e,count in counts.items() if count==1]
rim={}
for a,b in edges:
    for i in [a,b]:
        if i in rim:continue
        normal=generated[i]['n'];normal/=max(np.linalg.norm(normal),1e-12)
        pos=V[i]-normal*cfg['hemThickness'];pos[1]+=cfg['hemReturn'] if generated[i]['p'][1]<.7 else -cfg['hemReturn']
        rim[i]=len(V);V.append(pos);J.append(J[i]);W.append(W[i])
for a,b in edges:indices.extend([(b,a,rim[a]),(b,rim[a],rim[b])])
V=np.array(V,dtype=np.float32);N=np.zeros_like(V)
for a,b,c in indices:
    normal=np.cross(V[b]-V[a],V[c]-V[a]);N[a]+=normal;N[b]+=normal;N[c]+=normal
N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-12)
a={'POSITION':V,'NORMAL':N,'JOINTS_0':np.array(J,dtype=np.uint16),'WEIGHTS_0':np.array(W,dtype=np.float32)}
mat={'name':'M1_TrainingPants','pbrMetallicRoughness':{'baseColorFactor':cfg['color'],'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True}
entries.append(export(cfg['id'],'合体及膝练习裤','bottom',[(a,np.array(indices,dtype=np.uint32),mat)],'Clipped complete-body topology, 6mm normal ease, copied/interpolated weights, physical folded rims; new garment not original skin recoloring'))
(OUT/'equipment.json').write_text(json.dumps({'schema':'zbgs-equipment-v1','items':entries},ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
report={'sourceSha256':SPEC['sha256'],'sourcePrimitiveAudit':audit,'equipment':[ {k:v for k,v in e.items() if k not in ['bindings','sourceLicense']} for e in entries],
    'pantsBoundaryEdges':len(edges),'limits':SPEC['limits']}
(ROOT/'assets-source/m1-variants'/VARIANT/'equipment-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
