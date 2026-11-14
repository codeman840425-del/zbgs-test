"""Deterministic M1B male equipment export from the fixed editable-roundtrip VRM.
Run with Python + numpy. Never modifies the source body or controller.
"""
import copy, hashlib, json, pathlib, struct, collections
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = json.loads((ROOT/'assets-source/m1b/spec.json').read_text(encoding='utf-8-sig'))
raw = (ROOT/SPEC['roundtrip']).read_bytes()
assert hashlib.sha256(raw).hexdigest() == SPEC['roundtripSha256']
n = struct.unpack_from('<I', raw, 12)[0]
src = json.loads(raw[20:20+n]); binary = raw[28+n:]
body_mesh=next(i for i,m in enumerate(src['meshes']) if any('Body_00_SKIN' in src['materials'][p['material']]['name'] for p in m['primitives']))
mesh_node=next(n for n in src['nodes'] if n.get('mesh')==body_mesh)
assert not any(k in mesh_node for k in ['matrix','translation','rotation','scale']), 'Apply/verify source mesh transform before extraction'

DTYPES = {5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
SIZES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(i):
    a=src['accessors'][i];v=src['bufferViews'][a['bufferView']]
    dtype=np.dtype(DTYPES[a['componentType']]); width=SIZES[a['type']]
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,
        offset=v.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()

def arrays(primitive):
    p=src['meshes'][body_mesh]['primitives'][primitive]
    indices=read(p['indices']).reshape(-1,3)
    used=np.unique(indices); lookup={int(i):k for k,i in enumerate(used)}
    return {key:read(i)[used] for key,i in p['attributes'].items()}, np.array([[lookup[int(i)] for i in tri] for tri in indices],dtype=np.uint32)

audit=[]
for i,p in enumerate(src['meshes'][body_mesh]['primitives']):
    a,t=arrays(i);w=a['WEIGHTS_0']; joints=a['JOINTS_0']; counts=collections.Counter()
    for j,v in zip(joints.flat,w.flat):
        if v>.001: counts[src['nodes'][src['skins'][mesh_node['skin']]['joints'][int(j)]]['name']]+=1
    audit.append({'primitive':i,'material':src['materials'][p['material']]['name'],
        'vertices':len(a['POSITION']),'triangles':len(t),'bounds':[a['POSITION'].min(0).tolist(),a['POSITION'].max(0).tolist()],
        'weightedBones':dict(counts),'multiBoneVertices':int(np.count_nonzero(np.count_nonzero(w>.001,axis=1)>1))})

skin=src['skins'][mesh_node['skin']]; ibm=read(skin['inverseBindMatrices'])
parents={c:i for i,x in enumerate(src['nodes']) for c in x.get('children',[])}
human={x['node']:x['bone'] for x in src['extensions']['VRM']['humanoid']['humanBones']}
provenance=json.loads((ROOT/'assets-source/foundation-male/source.json').read_text(encoding='utf-8'))
OUT=ROOT/'prototype/public/assets/m1b';OUT.mkdir(exist_ok=True,parents=True)

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
    doc={'asset':{'version':'2.0','generator':'zbgs M1B reproducible male equipment builder'},'scene':0,'scenes':[{'nodes':[0]+[ids[i] for i in sorted(needed) if parents.get(i) not in needed]}],
        'nodes':nodes,'skins':[{'joints':[ids[skin['joints'][j]] for j in used],'inverseBindMatrices':inverse}],
        'meshes':[{'name':id,'primitives':primitives}],'materials':materials,'buffers':[{'byteLength':len(blob)}],
        'bufferViews':views,'accessors':accessors,'extensionsUsed':['KHR_materials_unlit'],
        'extras':{'sourceSha256':SPEC['roundtripSha256'],'sourceProvenance':provenance,'method':method}}
    if images:doc.update(images=images,textures=textures)
    jb=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*((-len(jb))%4);blob+=b'\0'*((-len(blob))%4)
    output=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(blob))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(blob),b'BIN\0')+blob
    (OUT/(id+'.glb')).write_bytes(output)
    return {'id':id,'name':name,'slot':slot,'url':id+'.glb','sha256':hashlib.sha256(output).hexdigest(),'bytes':len(output),
        'compatibleAvatarSha256':SPEC['roundtripSha256'],'preserveOriginalBody':True,'requiresRawSkeleton':True,'bindings':bindings,
        'limits':SPEC['limits'],'sourceLicense':provenance,'method':method,'stats':{'vertices':total,'triangles':triangles,'multiBoneVertices':multi,'joints':len(used)}}

entries=[]
roles=[('m1b-uniform-top','男性制服上衣与领带','top',('_Tops_','_Accessory_Tie_')),
       ('m1b-uniform-pants','男性原制服长裤','bottom',('_Bottoms_',)),
       ('m1b-uniform-shoes','男性原制服平底鞋','shoes',('_Shoes_',))]
for identifier,name,slot,tokens in roles:
    selected=[i for i,p in enumerate(src['meshes'][body_mesh]['primitives']) if any(token in src['materials'][p['material']]['name'] for token in tokens)]
    assert len(selected)==(2 if slot=='top' else 1), (identifier,selected)
    parts=[]
    for i in selected:
        a,t=arrays(i)
        assert set(a)<=set(['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']),set(a)
        assert np.all(np.isfinite(a['POSITION'])) and np.all(np.isfinite(a['WEIGHTS_0']))
        assert np.max(np.abs(a['WEIGHTS_0'].sum(1)-1))<1e-5
        parts.append((a,t,src['meshes'][body_mesh]['primitives'][i]['material']))
    entries.append(export(identifier,name,slot,parts,'Exact original male clothing primitive extraction: source topology/UV/textures/weights/inverse binds retained; no female measurements'))
manifest={'schema':'zbgs-equipment-v1','items':entries}
(OUT/'equipment.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8',newline='\n')
report={'sourceSha256':SPEC['roundtripSha256'],'sourcePrimitiveAudit':audit,'equipment':[{k:v for k,v in e.items() if k not in ['bindings','sourceLicense']} for e in entries],
        'bodyUnchangedSHA256':hashlib.sha256((ROOT/SPEC['roundtrip']).read_bytes()).hexdigest(),'limits':SPEC['limits']}
(ROOT/'assets-source/m1b/build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8',newline='\n')
print(json.dumps({'sourceSHA256':SPEC['roundtripSha256'],'equipment':[{k:e[k] for k in ['id','sha256','bytes','stats']} for e in entries]},ensure_ascii=False,indent=2))
