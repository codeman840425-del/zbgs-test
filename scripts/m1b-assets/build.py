"""Deterministic M1B male equipment export from the fixed editable-roundtrip VRM.
Run with Python + numpy. Never modifies the source body or controller.
"""
import hashlib, json, pathlib, struct, collections
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
import importlib.util
_loader = importlib.util.spec_from_file_location('vrm0_garment_emitter', ROOT / 'scripts/production/vrm0_garment_emitter.py')
emitter = importlib.util.module_from_spec(_loader)
_loader.loader.exec_module(emitter)
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
    source = emitter.GarmentSource(src, binary, skin, ibm, parents, human, SPEC['roundtripSha256'], provenance, SPEC['limits'])
    data, entry = emitter.emit(source, id, name, slot, parts, method)
    (OUT / entry['url']).write_bytes(data)
    return entry


def main():
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

if __name__ == "__main__":
    main()
