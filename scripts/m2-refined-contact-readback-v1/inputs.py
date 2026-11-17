"""Read already-generated refined geometry and assemble existing expression lanes."""
import ast
import importlib.util
import json

from common import ROOT,np,pinned,require


def original_mixture_functions(spec):
    path=pinned(spec['originalMixtureFunctions'])
    tree=ast.parse(path.read_bytes())
    names={'compose','face_data'}
    constants={'CORRECTED','PROTECTED'}
    nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or
        isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in n.targets)]
    namespace={'np':np}
    exec(compile(ast.Module(nodes,[]),str(path)+':exact-mixture-functions','exec'),namespace)
    reader=importlib.util.spec_from_file_location('refined_contact_original_reader',pinned(spec['originalGLBReader']))
    module=importlib.util.module_from_spec(reader);reader.loader.exec_module(module)
    original=module.GLB(pinned(spec['originalSource']))
    mapping=namespace['face_data'](original)['mapping']
    return namespace['compose'],mapping


def group_arrays(reference):
    with np.load(pinned(reference),allow_pickle=False) as data:
        group={key:data[key] for key in data.files}
    require(group['basePositionM'].shape==(7251,3) and group['positionDeltasM'].shape==(54,7251,3),'Wrong full refined geometry dimensions')
    require(group['basePositionFloat32'].dtype==np.float32 and group['positionDeltasFloat32'].dtype==np.float32,'Wrong baked component precision')
    require(np.array_equal(group['basePositionM'].astype(np.float32),group['basePositionFloat32']) and
        np.array_equal(group['positionDeltasM'].astype(np.float32),group['positionDeltasFloat32']),'Float32 source/component encoding differs')
    require(all(np.isfinite(v).all() for v in group.values()),'Nonfinite refined geometry input')
    return group


def single_state(group,target):
    require(-1<=target<54,'Not an original real base/target')
    result=group['basePositionFloat32'].copy()
    if target>=0: result+=group['positionDeltasFloat32'][target]
    return result.astype(np.float64)


def mixed_state(group,compose,mapping,corrected,h,b,vowel,weight,baked=True):
    P=group['basePositionFloat32'].astype(float) if baked else group['basePositionM']
    D=group['positionDeltasFloat32'].astype(float) if baked else group['positionDeltasM']
    data={'P':P,'dP':D,'N':np.zeros_like(P),'dN':np.zeros_like(D),'mapping':mapping,'corrected':corrected}
    # The original function also returns an unused normal accumulator. No shading result is asserted here.
    return compose(data,h,b,vowel,weight)[0]


def validate_face_raw(candidate,source,records,raw):
    face=[r for r in records if r['positionAccessor']==21]
    require([r['endpoint'] for r in face]==list(range(-1,54)),'Raw Face endpoint coverage differs')
    n=len(candidate['basePositionM']);base=face[0]
    require(all(r['count']==n for r in face),'Raw Face row count differs')
    P=raw['mappedEndpointsM'][base['offset']:base['offset']+n]
    require(np.array_equal(candidate['basePositionM'],P),'Face group base differs from numerical raw')
    for r in face:
        a=r['offset'];end=a+n;endpoint=r['endpoint']
        E=raw['mappedEndpointsM'][a:end]
        if endpoint>=0:
            require(np.array_equal(candidate['positionDeltasM'][endpoint],E-P),'Face group delta differs from numerical raw target '+str(endpoint))
        require(np.array_equal(single_state(candidate,endpoint),raw['float32BakeRoundTripM'][a:end]),'Face group Float32 endpoint differs from numerical raw')
        original=source['basePositionM'] if endpoint<0 else source['basePositionM']+source['positionDeltasM'][endpoint]
        require(np.array_equal(original,raw['sourceEndpointsM'][a:end]),'Numeric raw source differs from same refined source endpoint')
        require(np.array_equal(single_state(source,endpoint),raw['sourceBaselineFloat32M'][a:end]),'Numeric raw source Float32 baseline differs')


def validate_numerical_inputs(spec,t):
    inputs=spec['numericCandidateInputs']
    closure=json.loads(pinned(inputs['closure']).read_bytes())
    require(closure['schema']=='refined-axial-evaluation-closure-v1' and closure['methodId']=='m2-refined-axial-evaluation-v1','Wrong numeric method identity')
    require(closure['spec']==inputs['spec'],'Closure/evaluation spec differ')
    package=json.loads(pinned(inputs['packageFiles']).read_bytes())
    package_rows={r['path']:r for r in package['files']}
    consumed=[inputs[k] for k in ['sourceGroup','topology','consumers','knownOhSourceMetadata','records']]
    consumed += [r[k] for r in inputs['cases'] for k in ['report','raw','knownOh','knownOhMetadata','faceGroup']]
    for ref in consumed:
        require(package_rows[ref['path']]['sha256']==ref['sha256'],'Numeric package does not bind consumed resource')
    producer_topology=np.load(pinned(inputs['topology']),allow_pickle=False)
    for actual,key in [(t['F'],'triangles'),(t['parent'],'parentTriangle'),(t['bary'],'parentBary')]:
        require(np.array_equal(actual,producer_topology[key]),'Numeric producer changed common topology/lineage')
    consumers=json.loads(pinned(inputs['consumers']).read_bytes())
    face=next(g for g in consumers['groups'] if g['positionAccessor']==21)
    for c in face['consumers']:
        role=c['material'].removeprefix('M00_000_00_');expected=t['roles'][role]
        require(np.array_equal(c['triangleIndices'],expected['childIds']) and np.array_equal(c['vertexIndices'],expected['vertexIds']),'Numerical consumer partition differs')
    compose,mapping=original_mixture_functions(spec)
    lanes=json.loads(pinned(inputs['knownOhSourceMetadata']).read_bytes())
    require(all(lanes['mapping'][k]==mapping[k] for k in lanes['mapping']),'Real expression mapping differs')
    require(np.array_equal(lanes['correctedVertexIndices'],t['correctedVertexIds']),'Source negative compensation lane differs')
    require(lanes['weights']=={'happy':.65,'blink':1.,'oh':.66,'eyeJoyCorrectedOnly':-.65},'Known-oh request changed')
    source=group_arrays(inputs['sourceGroup'])
    require(np.array_equal(source['basePositionM'],t['P']) and np.array_equal(source['positionDeltasM'],t['D']),'Numerical source differs from common refined source')
    rows=[]
    records=json.loads(pinned(inputs['records']).read_bytes())['records']
    for case in inputs['cases']:
        sealed=next(c for c in closure['cases'] if c['sourceRequestId']==case['sourceRequestId'])
        for key in ['report','raw','knownOh','knownOhMetadata']:
            require(case[key]==sealed[key],'Closure case input differs: '+key)
            pinned(case[key])
        report=json.loads(pinned(case['report']).read_bytes())
        require(report['schema']=='refined-axial-case-result-v1' and report['status']=='numeric-candidate-only'
            and report['sourceRequestId']==case['sourceRequestId'] and report['failures']==[],'Numerical candidate has not passed its own input gates')
        candidate=group_arrays(case['faceGroup'])
        with np.load(pinned(case['raw']),allow_pickle=False) as raw:
            validate_face_raw(candidate,source,records,raw)
        with np.load(pinned(case['knownOh']),allow_pickle=False) as data:
            known={key:data[key] for key in data.files}
        expected={'sourceMixedBakedM':mixed_state(source,compose,mapping,t['correctedVertexIds'],.65,1.,'oh',.66,True),
            'sourceMixedM':mixed_state(source,compose,mapping,t['correctedVertexIds'],.65,1.,'oh',.66,False),
            'AEndpointMixBakedM':mixed_state(candidate,compose,mapping,t['correctedVertexIds'],.65,1.,'oh',.66,True),
            'AEndpointMixM':mixed_state(candidate,compose,mapping,t['correctedVertexIds'],.65,1.,'oh',.66,False)}
        require(all(np.array_equal(known[k],v) for k,v in expected.items()),'Known-oh source/A precision or source compensation differs')
        require(known['BSourceMixThenGM'].shape==(7251,3) and np.isfinite(known['BSourceMixThenGM']).all(),'Missing finite supplied B attribution geometry')
        rows.append({'sourceRequestId':case['sourceRequestId'],'knownOhSourceAndAReassembledExactly':True,
            'all54DeltaAndBaseEncodingChecked':True,'all55FaceStatesBoundToPassedNumericRaw':True,
            'singleStatesAvailable':55,'mixedActualStatesDefined':10,
            'BAttributionScenariosAvailable':['known-oh-only'],'GCalled':False,'candidateQueries':0})
    return {'schema':'refined-contact-numerical-input-readback-v1','sourceAndCandidateSameTopology':True,
        'sourceCompensationMaskMatchesCandidate':True,'knownOhPrecisionLanesSeparated':True,
        'cases':rows,'candidateQueries':0,'currentVisualTargetsAdmissible':False}
