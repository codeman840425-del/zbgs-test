"""Read-only exact preserved-data check over the frozen 8 x 4 generated containers."""
from pathlib import Path
import hashlib,json,sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path('F:/gamemake-representative-cage-trial');OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/production'))
from flow import GLB
def sha(data):return hashlib.sha256(data).hexdigest()
spec=json.loads((OUT/'snapshot-initial/spec.json').read_bytes())
rows=[]
for request in spec['requests']:
    source=spec['sources'][request['sex']]
    folder=ROOT/'assets-source/m2-representative-cage-trial-v1/generated'/(request['basePresetId']+'-cage-trial-v1')
    pairs=[(source['body'],'avatar.vrm')]+[(s,s['slot']+'.glb') for s in source['equipment']]
    for reference,filename in pairs:
        original=(ROOT/reference['path']).read_bytes();derived=(folder/filename).read_bytes()
        assert sha(original)==reference['sha256']
        g=GLB(original);d=GLB(derived)
        assert d.binary[:len(g.binary)]==g.binary
        assert d.doc['accessors'][:len(g.doc['accessors'])]==g.doc['accessors']
        for field in ['nodes','skins','materials','images','textures','samplers','extensions','scene','scenes']:
            assert g.doc.get(field)==d.doc.get(field),field
        assert len(g.doc['meshes'])==len(d.doc['meshes'])
        for m,dm in zip(g.doc['meshes'],d.doc['meshes']):
            assert {k:v for k,v in m.items() if k!='primitives'}=={k:v for k,v in dm.items() if k!='primitives'}
            assert len(m['primitives'])==len(dm['primitives'])
            for p,dp in zip(m['primitives'],dm['primitives']):
                assert {k:v for k,v in p.items() if k not in ['attributes','targets']}=={k:v for k,v in dp.items() if k not in ['attributes','targets']}
                assert set(p['attributes'])==set(dp['attributes'])
                for name,value in p['attributes'].items():
                    if name not in ['POSITION','NORMAL']:assert dp['attributes'][name]==value
                assert len(p.get('targets',[]))==len(dp.get('targets',[]))
        rows.append({'id':request['basePresetId']+'-cage-trial-v1','source':reference,'output':str(folder/filename),'sha256':sha(derived),'bytes':len(derived),'sourceBinaryPrefixExact':True,'originalAccessorsExact':True,'nodesSkinsMaterialsImagesVRMExact':True,'indicesUVWeightsJointsAndPrimitiveStructureExact':True})
(OUT/'actual-container-probe.json').write_bytes((json.dumps({'scope':'32 frozen actual output containers; only POSITION/NORMAL and morph output accessors may change. No geometry suitability or pose approval.','cases':rows},indent=2)+'\n').encode())
print(json.dumps({'actualOutputs':len(rows),'allPreservedContractsExact':True}))
