"""Read actual exported bytes against original source and sealed G/J outputs."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import hashlib,json,importlib.util
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-axial-head-export-v1'
OUT=Path(__file__).with_name('export-result.json')
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load_glb_type():
    loader=importlib.util.spec_from_file_location('source_binary_reader',ROOT/'scripts/m2-male-face-v1/glb.py')
    module=importlib.util.module_from_spec(loader);loader.loader.exec_module(module);return module.GLB
def transfer(N,J):
    mask=np.max(abs(J-np.eye(3)),axis=(1,2))>1e-6
    expected=N.copy();analytic=N.copy()
    if mask.any():
        C=J[mask];n=N[mask]
        solved=np.linalg.solve(C.transpose(0,2,1),n[:,:,None])[:,:,0]
        explicit=np.column_stack([n[:,0]/C[:,0,0],np.zeros(len(n)),n[:,2]])
        explicit[:,1]=(n[:,1]-C[:,0,1]*explicit[:,0]-C[:,2,1]*explicit[:,2])/C[:,1,1]
        for values in [solved,explicit]:values*= (np.linalg.norm(n,axis=1)/np.maximum(np.linalg.norm(values,axis=1),1e-12))[:,None]
        expected[mask]=solved;analytic[mask]=explicit
    assert np.max(abs(expected-analytic))<1e-12
    return expected,float(abs(expected-analytic).max()),int(mask.sum())

def run():
    if OUT.exists():raise SystemExit('Refusing overwrite')
    manifest=BASE/'package-files.json'
    assert digest(manifest)=='0ecf529f22f587515d0cbf2db20a6f3f7aa29390d0ee89e1b232ebc3bd227012'
    files=json.loads(manifest.read_bytes())['files']
    for row in files:assert digest(ROOT/row['path'])==row['sha256'] and (ROOT/row['path']).stat().st_size==row['bytes']
    spec=json.loads((BASE/'spec.json').read_bytes());production=json.loads((BASE/'generated/report.json').read_bytes())
    assert production['status']=='export-readback-complete-not-runtime-acceptance'
    assert {r['sourceRequestId'] for r in production['cases']}=={'identity','male-long-lean-v2'}
    for row in spec['inputs']:assert digest(ROOT/row['path'])==row['sha256']
    GLB=load_glb_type();source=GLB(ROOT/spec['source']['path'])
    records=json.loads((ROOT/spec['sourceRecords']['path']).read_bytes())['records']
    pins=[Path(__file__),manifest,BASE/'spec.json',BASE/'generated/report.json',ROOT/spec['source']['path'],ROOT/spec['sourceRecords']['path'],ROOT/'scripts/m2-male-face-v1/glb.py']
    cases=[]
    for exported in production['cases']:
        key=exported['sourceRequestId'];case=next(c for c in spec['cases'] if c['sourceRequestId']==key)
        path=ROOT/exported['resource']['path'];assert digest(path)==exported['resource']['sha256']
        actual=GLB(path);raw_path=ROOT/case['mappedEndpoints']['path'];assert digest(raw_path)==case['mappedEndpoints']['sha256']
        raw=np.load(raw_path,allow_pickle=False)
        assert actual.bin[:len(source.bin)]==source.bin
        assert set(actual.doc)==set(source.doc)
        for name,value in source.doc.items():
            if name not in {'asset','meshes','accessors','bufferViews','buffers'}:assert actual.doc[name]==value,name
        assert {k:v for k,v in source.doc['asset'].items() if k!='generator'}=={k:v for k,v in actual.doc['asset'].items() if k!='generator'}
        assert actual.doc['accessors'][:len(source.doc['accessors'])]==source.doc['accessors']
        assert actual.doc['bufferViews'][:len(source.doc['bufferViews'])]==source.doc['bufferViews']
        assert len(actual.doc['buffers'])==len(source.doc['buffers'])
        for old,new in zip(source.doc['buffers'],actual.doc['buffers']):assert {k:v for k,v in old.items() if k!='byteLength'}=={k:v for k,v in new.items() if k!='byteLength'}
        assert source.images()==actual.images()
        expected={};normal_formula_error=0;normal_changed=0
        for row in records:
            a,n,e,acc=row['offset'],row['count'],row['endpoint'],row['positionAccessor'];sl=slice(a,a+n)
            primitive=next(p for m in source.doc['meshes'] for p in m['primitives'] if p['attributes']['POSITION']==acc)
            P=source.acc(acc).astype(float);N=source.acc(primitive['attributes']['NORMAL']).astype(float)
            if e>=0:
                t=primitive['targets'][e];P+=source.acc(t['POSITION']).astype(float)
                if 'NORMAL' in t:N+=source.acc(t['NORMAL']).astype(float)
            assert row['sourceIndices']==list(range(len(P))) and np.array_equal(raw['sourceEndpointsM'][sl],P)
            normals,error,changed=transfer(N,raw['sourceJacobians'][sl]);normal_formula_error=max(normal_formula_error,error);normal_changed+=changed
            expected[(acc,e)]={'P':raw['mappedEndpointsM'][sl],'N':normals,'bakedP':raw['float32BakeRoundTripM'][sl]}
        maxp=maxn=baseNdiff=maxdN=0.;shared={};primitive_count=endpoint_count=0
        assert len(source.doc['meshes'])==len(actual.doc['meshes'])
        for mi,(oldmesh,newmesh) in enumerate(zip(source.doc['meshes'],actual.doc['meshes'])):
            assert {k:v for k,v in oldmesh.items() if k!='primitives'}=={k:v for k,v in newmesh.items() if k!='primitives'}
            assert len(oldmesh['primitives'])==len(newmesh['primitives'])
            for old,new in zip(oldmesh['primitives'],newmesh['primitives']):
                acc=old['attributes']['POSITION'];base=expected[(acc,-1)]
                assert {k:v for k,v in old.items() if k not in {'attributes','targets'}}=={k:v for k,v in new.items() if k not in {'attributes','targets'}}
                assert {k:v for k,v in old['attributes'].items() if k not in {'POSITION','NORMAL'}}=={k:v for k,v in new['attributes'].items() if k not in {'POSITION','NORMAL'}}
                signature=(new['attributes']['POSITION'],new['attributes']['NORMAL'],json.dumps(new.get('targets',[]),sort_keys=True))
                assert shared.setdefault(acc,signature)==signature
                P,N=actual.acc(new['attributes']['POSITION']),actual.acc(new['attributes']['NORMAL'])
                assert np.array_equal(P,base['P'].astype(np.float32)) and np.array_equal(N,base['N'].astype(np.float32))
                baseNdiff=max(baseNdiff,float(abs(N-source.acc(old['attributes']['NORMAL'])).max()))
                maxp=max(maxp,float(np.linalg.norm(P-base['P'],axis=1).max()));maxn=max(maxn,float(np.linalg.norm(N-base['N'],axis=1).max()))
                assert len(old.get('targets',[]))==len(new.get('targets',[]))
                for i,(ot,nt) in enumerate(zip(old.get('targets',[]),new.get('targets',[]))):
                    assert {k:v for k,v in ot.items() if k not in {'POSITION','NORMAL'}}=={k:v for k,v in nt.items() if k not in {'POSITION','NORMAL'}}
                    assert 'NORMAL' not in ot and set(nt)=={'POSITION','NORMAL'}
                    endpoint=expected[(acc,i)];dP,dN=actual.acc(nt['POSITION']),actual.acc(nt['NORMAL'])
                    assert np.array_equal(dP,(endpoint['P']-base['P']).astype(np.float32))
                    assert np.array_equal(dN,(endpoint['N']-base['N']).astype(np.float32))
                    assert np.array_equal((P+dP).astype(float),endpoint['bakedP'])
                    assert np.isfinite(N+dN).all()
                    maxp=max(maxp,float(np.linalg.norm((P+dP).astype(float)-endpoint['P'],axis=1).max()))
                    maxn=max(maxn,float(np.linalg.norm((N+dN).astype(float)-endpoint['N'],axis=1).max()))
                    maxdN=max(maxdN,float(abs(dN).max()));endpoint_count+=1
                primitive_count+=1
        assert primitive_count==15 and endpoint_count==486 and len(shared)==2
        if key=='identity':assert baseNdiff==0 and maxdN==0 and normal_changed==0
        cases.append({'id':key,'resource':exported['resource'],'primitiveConsumers':primitive_count,'sharedPOSITIONGroups':len(shared),
            'shared54PositionAndNormalTargetsConsumerCount':endpoint_count,'positionMatchesSealedFloat32EndpointsExactly':True,
            'normalDeltaMatchesSealedJInverseTransposePolicyExactly':True,'independentTriangularInverseTransposeDifference':normal_formula_error,
            'normalPolicyChangedEndpointOccurrences':normal_changed,'normalPolicyNearIdentityThreshold':1e-6,
            'maximumPositionBakeErrorM':maxp,'maximumNormalBakeError':maxn,'maximumBaseNormalDifferenceFromSource':baseNdiff,'maximumMorphNormalDelta':maxdN,
            'sourceBinaryPrefixExact':True,'UVSkinIBMSkeletonMaterialsImagesExpressionJSONPreserved':True,
            'identityAuthoredNormalsExactAndMorphNormalsZero':key=='identity','runtimeAccepted':False})
        pins.extend([path,raw_path])
    for row in files:assert digest(ROOT/row['path'])==row['sha256']
    result={'schema':'actual-axial-vrm-independent-export-audit-v1','cases':cases,'exportRepeated':False,'solverCalled':False,
        'pins':{p.relative_to(ROOT).as_posix():digest(p) for p in pins}}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps(cases,indent=2))
if __name__=='__main__':run()
