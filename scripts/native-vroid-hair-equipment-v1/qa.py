"""Finite source extraction checks and negatives; never evaluates spring motion."""
from pathlib import Path
import copy,hashlib,importlib.util,json,subprocess,sys
sys.dont_write_bytecode=True
import numpy as np
from prepare import ROOT,BASE,SOURCE,SOURCE_SHA,TARGET_SHA,encode
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def valid_document(d):
    assert len(d['meshes'])==2 and len(d['materials'])==2,'Unexpected or non-hair mesh/material'
    assert [m['name'] for m in d['materials']]==['N00_000_00_HairBack_00_HAIR (Instance)','N00_000_Hair_00_HAIR (Instance)'],'Non-hair material leakage'
    assert len([n for n in d['nodes'] if 'mesh' in n])==2
    assert 'VRMC_vrm' not in d.get('extensions',{}) and not d.get('animations'),'Full-avatar/animation leakage'
    assert [len(s['joints']) for s in d['skins']]==[64,64]
    for m in d['meshes']:
        assert len(m['primitives'])==1 and not m['primitives'][0].get('targets')

def main():
    assert not (BASE/'source-QA.json').exists()
    sp=importlib.util.spec_from_file_location('independent_glb',ROOT/'scripts/m2-male-face-v1/glb.py')
    reader=importlib.util.module_from_spec(sp);sp.loader.exec_module(reader)
    original=reader.GLB(ROOT/SOURCE);asset=reader.GLB(BASE/'generated/hair.glb')
    valid_document(asset.doc)
    dep=json.loads((BASE/'dependency.json').read_bytes())
    trace=json.loads((BASE/'generated/extraction.json').read_bytes())
    fit=json.loads((BASE/'generated/fit.json').read_bytes())
    assert fit['targetBodySha256']==TARGET_SHA and fit['sourceVrmSha256']==SOURCE_SHA
    assert fit['assetSha256']==sha(BASE/'generated/hair.glb')
    rows=[];positive=set()
    for i,c in enumerate(dep['consumers']):
        p0=c['sourcePrimitiveData'];p1=asset.doc['meshes'][i]['primitives'][0]
        ids=np.array(c['sourceVertexIds'],dtype=int)
        ix=asset.acc(p1['indices']).reshape(-1).astype(int)
        assert np.array_equal(ids[ix],original.acc(p0['indices']).reshape(-1))
        assert set(ix)==set(range(len(ids))),'Unreferenced/non-hair source rows leaked'
        for semantic,index in p0['attributes'].items():
            if semantic=='JOINTS_0':continue
            assert original.acc(index)[ids].tobytes()==asset.acc(p1['attributes'][semantic]).tobytes(),semantic
        source_skin=original.doc['skins'][c['sourceSkin']];skin=asset.doc['skins'][i]
        names0=[original.doc['nodes'][n]['name'] for n in source_skin['joints']]
        names1=[asset.doc['nodes'][n]['name'] for n in skin['joints']]
        j0=original.acc(p0['attributes']['JOINTS_0'])[ids].astype(int)
        j1=asset.acc(p1['attributes']['JOINTS_0']).astype(int)
        weights=asset.acc(p1['attributes']['WEIGHTS_0'])
        for a,b,w in zip(j0.reshape(-1),j1.reshape(-1),weights.reshape(-1)):
            assert 0<=b<64
            if w>0:assert names0[a]==names1[b];positive.add(names1[b])
        matrices0=original.acc(source_skin['inverseBindMatrices']);matrices1=asset.acc(skin['inverseBindMatrices'])
        for k,name in enumerate(names1):assert matrices0[names0.index(name)].tobytes()==matrices1[k].tobytes()
        rows.append(dict(mesh=i,vertices=len(ids),triangles=len(ix)//3,authorAttributesAndSourceTopologyExact=True,
                         positiveWeightBoneNamesExact=True,all64SelectedInverseBindsExact=True))
    for old,new in trace['sourceImageToOutput'].items():
        def image(g,i):
            v=g.doc['bufferViews'][g.doc['images'][i]['bufferView']]
            return g.bin[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        assert image(original,int(old))==image(asset,new)
    injected=copy.deepcopy(asset.doc);injected['meshes'].append(copy.deepcopy(injected['meshes'][0]))
    try:valid_document(injected)
    except AssertionError:extra_mesh_rejected=True
    else:raise AssertionError('Injected non-hair mesh accepted')
    renamed=copy.deepcopy(asset.doc);renamed['materials'][0]['name']='N00_000_00_Body_00_SKIN (Instance)'
    try:valid_document(renamed)
    except AssertionError:nonhair_rejected=True
    else:raise AssertionError('Non-hair material accepted')
    before={p.name:sha(p) for p in (BASE/'generated').iterdir()}
    repeat=BASE/'rebuild';assert not repeat.exists()
    result=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('build.py')),'--out',str(repeat)],cwd=ROOT,capture_output=True)
    assert result.returncode==0,result.stderr.decode()
    assert {p.name:sha(p) for p in repeat.iterdir()}==before,'Actual extraction repeat differs'
    wrong=BASE/'wrong-source-must-not-exist';assert not wrong.exists()
    rejected=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('build.py')),'--source',str(ROOT/'assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vrm'),'--out',str(wrong)],cwd=ROOT,capture_output=True)
    assert rejected.returncode!=0 and b'Wrong native hair source identity' in rejected.stderr and not wrong.exists()
    report=dict(schema='native-hair-equipment-source-QA-v1',status='source-extraction-repeat-negatives-passed-dynamic-equivalence-separate',
        meshes=rows,selectedSkinTableSizePerMesh=64,actualPositiveWeightJointUnion=len(positive),
        actualPositiveWeightJointNames=sorted(positive),dynamicJoints=59,bodyProxyFrames=15,
        actualRebuildBytesExact=before,sourceImagesExact=len(trace['sourceImageToOutput']),
        extraMeshLeakRejected=extra_mesh_rejected,nonHairMaterialLeakRejected=nonhair_rejected,
        wrongSourceRejectedBeforeWrite=True,wrongSourceProcess=dict(exitCode=rejected.returncode,stderr=rejected.stderr.decode()),
        rebuildExecution=dict(exitCode=result.returncode,stdout=result.stdout.decode()),
        noDynamicSolveRunByThisQA=True,unchangedSourceAsset=True)
    with (BASE/'source-QA.json').open('xb') as f:f.write(encode(report))
    print(json.dumps({'status':report['status'],'positiveWeightJointUnion':len(positive),'skinTable':64,'rebuildExact':True}))

if __name__=='__main__':main()
