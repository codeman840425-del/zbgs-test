"""Independent original/accessor/material/image correspondence of actual GLBs."""
from pathlib import Path
import copy,hashlib,importlib.util,json,sys
sys.dont_write_bytecode=True
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()

def main():
    sp=importlib.util.spec_from_file_location('source_reader',ROOT/'scripts/m2-male-face-v1/glb.py')
    reader=importlib.util.module_from_spec(sp);sp.loader.exec_module(reader)
    original=reader.GLB(ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm')
    target=reader.GLB(ROOT/'assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm')
    manifest=json.loads((BASE/'generated/equipment.json').read_bytes())
    extraction=json.loads((BASE/'generated/extraction.json').read_bytes())
    rows=[]
    for entry,row in zip(manifest['items'],extraction['items']):
        path=BASE/'generated'/entry['url'];raw=path.read_bytes();assert sha(raw)==entry['sha256'] and len(raw)==entry['bytes']
        gear=reader.GLB(path)
        p0=original.doc['meshes'][row['sourceMesh']]['primitives'][row['sourcePrimitive']]
        p1=gear.doc['meshes'][0]['primitives'][0]
        for k,index in p0['attributes'].items():assert original.acc(index).tobytes()==gear.acc(p1['attributes'][k]).tobytes(),k
        assert original.acc(p0['indices']).tobytes()==gear.acc(p1['indices']).tobytes()
        assert set(p0['attributes'])==set(p1['attributes']) and not p1.get('targets')
        skin0=original.doc['skins'][row['sourceSkin']];skin1=gear.doc['skins'][0]
        assert skin0['joints']==skin1['joints'] and original.acc(skin0['inverseBindMatrices']).tobytes()==gear.acc(skin1['inverseBindMatrices']).tobytes()
        nodes=copy.deepcopy(target.doc['nodes'])
        for n in nodes:n.pop('mesh',None);n.pop('skin',None)
        nodes[row['sourceNode']].update(mesh=0,skin=0)
        assert gear.doc['nodes']==nodes and gear.doc['scenes']==target.doc['scenes']
        material=copy.deepcopy(gear.doc['materials'][0]);inverse={new:int(old) for old,new in row['textureMap'].items()}
        def restore(v):
            if isinstance(v,dict):
                for k,x in v.items():
                    if 'texture' in k.lower() and isinstance(x,dict) and 'index' in x:x['index']=inverse[x['index']]
                    else:restore(x)
            elif isinstance(v,list):
                for x in v:restore(x)
        restore(material)
        assert material==original.doc['materials'][p0['material']]
        def image(g,i):
            v=g.doc['bufferViews'][g.doc['images'][i]['bufferView']]
            return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        images=[]
        for old,new in row['imageMap'].items():
            a,b=image(original,int(old)),image(gear,new);assert a==b
            images.append(dict(sourceImage=int(old),gearImage=new,bytes=len(a),sha256=sha(a)))
        assert gear.doc['samplers']==original.doc['samplers']
        for old,new in row['textureMap'].items():
            t=copy.deepcopy(gear.doc['textures'][new]);t['source']={n:int(o) for o,n in row['imageMap'].items()}[t['source']]
            assert t==original.doc['textures'][int(old)]
        rows.append(dict(id=entry['id'],sourceAttributesIndicesAndIBMBytesExact=True,nodesParentLocalRestExact=True,
            sourceMaterialGraphExactAfterReferenceRestore=True,sourceImagesExact=images,
            skinJoints=len(skin1['joints']),springRuntimeOwnedByAvatar=True))
    result=dict(schema='male-equipment-independent-source-readback-v1',status='three-exact-source-garments-verified',items=rows,
        builderImported=False,geometryConverted=False,sourceMetaRetainedInManifest=True)
    output=ROOT/'evidence/native-vroid-male-equipment-v1/source-readback.json'
    with output.open('xb') as f:f.write((json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode())
    print(json.dumps({'status':result['status'],'items':len(rows)}))

if __name__=='__main__':main()
