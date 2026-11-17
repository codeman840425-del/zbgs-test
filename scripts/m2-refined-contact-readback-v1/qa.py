"""Mapping/return-shape refusals; official native smoke is consumed by exact pin."""
import json

from common import BASE,compare_pairs,decoded_pairs,np,pair_record,save


def run(spec=None):
    tests=[]
    faces=np.array([[0,1,2]],np.int64)
    empty=np.empty((0,0))
    value=[np.array([[0,0]],np.int64),empty,empty,empty,empty]
    assert decoded_pairs(value,faces,faces).tolist()==[[0,0]];tests.append('actual-five-array-shape')
    def refuses(name,fn):
        try: fn()
        except ValueError: tests.append(name)
        else: raise AssertionError('Expected refusal '+name)
    refuses('doc-sixth-success-slot-rejected',lambda:decoded_pairs(value+[True],faces,faces))
    refuses('unexpected-remeshed-output-rejected',lambda:decoded_pairs([value[0],faces,empty,empty,empty],faces,faces))
    refuses('noninteger-pair-rejected',lambda:decoded_pairs([np.array([[.5,0]]),empty,empty,empty,empty],faces,faces))
    refuses('query-pair-out-of-range-rejected',lambda:decoded_pairs([np.array([[1,0]]),empty,empty,empty,empty],faces,faces))
    t={'F':np.array([[0,1,2],[0,3,2],[4,5,6]]),'parent':np.array([0,0,1]),
        'coarse':np.array([[0,1,2],[3,4,5]]),'bary':np.broadcast_to(np.eye(3),(3,3,3)),
        'provenance':{'parentTriangles':[{'mesh':1,'primitive':1,'triangle':0},{'mesh':1,'primitive':5,'triangle':0}]}}
    compared=compare_pairs(t,[(0,2)],[(0,2),(1,2)])
    assert compared['addedChildPairs']==[(1,2)] and compared['addedParentPairs']==[] and compared['addedChildPairsWithinAlreadyPresentParentPairs']==[(1,2)]
    tests.append('new-child-survives-unchanged-parent-set')
    P=np.array([[0.,0,0],[1.,0,0],[0.,1,0],[2.,0,0],[0.,0,0],[1.,0,0],[0.,1,0]])
    shared=pair_record(t,P,0,1);coincident=pair_record(t,P,0,2)
    assert shared['sharedRefinedVertexIds']==[0,2]
    assert coincident['sharedRefinedVertexIds']==[] and coincident['exactCoincidentRepresentedTriangles'] and not coincident['filtered']
    tests.append('same-index-topology-distinct-from-exact-coordinate-coincidence')
    duplicates=decoded_pairs([np.array([[0,0],[0,0]]),empty,empty,empty,empty],faces,faces)
    assert len(duplicates)==2;tests.append('native-duplicate-rows-not-silently-dropped')
    assert decoded_pairs([np.empty((0,2),int),empty,empty,empty,empty],faces,faces).shape==(0,2)
    tests.append('zero-hits-is-data-no-admission-claim')
    if spec is not None:
        from inputs import mixed_state,original_mixture_functions,single_state,validate_face_raw
        compose,mapping=original_mixture_functions(spec)
        P=np.ones((3,3));D=np.zeros((54,3,3));D[mapping['eyeJoy'],0,0]=.125
        group={'basePositionM':P,'positionDeltasM':D,'basePositionFloat32':P.astype(np.float32),
            'positionDeltasFloat32':D.astype(np.float32)}
        source=mixed_state(group,compose,mapping,np.array([0]),.65,1.,'oh',.66,False)
        candidate=mixed_state(group,compose,mapping,np.array([0]),.65,1.,'oh',.66,False)
        assert np.array_equal(source,candidate) and source[0,0]==1.-.65*.125 and source[1,0]==1.
        tests.append('source-and-candidate-both-use-true-negative-eyeJoy-lane')
        records=[{'positionAccessor':21,'endpoint':e,'offset':(e+1)*3,'count':3} for e in range(-1,54)]
        endpoints=np.concatenate([P]+[P+d for d in D])
        baked=np.concatenate([single_state(group,e) for e in range(-1,54)])
        raw={'mappedEndpointsM':endpoints,'float32BakeRoundTripM':baked,'sourceEndpointsM':endpoints,'sourceBaselineFloat32M':baked}
        validate_face_raw(group,group,records,raw)
        mutated={k:v.copy() for k,v in group.items()}
        mutated['positionDeltasM'][0,0,0]+=.001
        mutated['positionDeltasFloat32']=mutated['positionDeltasM'].astype(np.float32)
        assert np.array_equal(mixed_state(mutated,compose,mapping,np.array([0]),.65,1.,'oh',.66,False),source)
        refuses('unrelated-target0-tamper-rejected-despite-known-oh-equality',lambda:validate_face_raw(mutated,group,records,raw))
        group['positionDeltasFloat32'][0,0,0]=np.float32(6e-8)
        exact=single_state(group,0)
        assert exact[0,0]==float(np.float32(1.)+np.float32(6e-8)) and exact[0,0]!=1.+float(np.float32(6e-8))
        tests.append('single-state-uses-Float32-base-plus-Float32-delta-addition')
    return {'schema':'refined-inclusive-contact-prepare-qa-v1','checks':tests,'passed':True,
        'nativeCalls':0,'candidateQueries':0,'oldStrictEvidenceChanged':False}


if __name__=='__main__':
    report=run(json.loads((BASE/'spec.json').read_bytes()));save(BASE/'qa-report.json',report);print(json.dumps(report))
