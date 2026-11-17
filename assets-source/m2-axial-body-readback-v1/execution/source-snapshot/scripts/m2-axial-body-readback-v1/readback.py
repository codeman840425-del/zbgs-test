"""One full-source readback. Reuse contacts only for exactly identical inputs."""
import json
import time

from common import BASE,ROOT,candidate_face,digest_array,equal_inputs,io,legacy,load,mixtures,np,outcome,pair_coordinates,pinned,require,scenarios


def single_frame(data,target):
    P=data['P'].astype(np.float32)
    if target>=0: P=P+data['dP'][target].astype(np.float32)
    return P.astype(float)


def execute():
    started=time.monotonic()
    spec,source,records,raw,contract=load()
    out=BASE/'generated';require(not out.exists(),'Preserve first actual readback')
    out.mkdir()
    result={'schema':'axial-body-contact-readback-result-v1','methodId':'m2-axial-body-readback-v1',
        'candidateId':spec['candidateId'],'sourceRequestId':spec['sourceRequestId'],'status':'reading',
        'spec':io.ref(BASE/'spec.json'),'compositionSpec':spec['compositionSpec'],'compositeRaw':spec['compositeRaw'],
        'compositionAudit':spec['compositionAudit'],'characterExported':False,'runtimeAccepted':False}
    io.save(out/'report.json',result)
    try:
        original=mixtures.face_data(source)
        head=mixtures.face_data(type(source)(pinned(spec['headExport'])))
        current=candidate_face(source,records,raw)
        reusable,array_proof=equal_inputs(current,head)
        io.save(out/'face-array-equality.json',{'schema':'complete-face-bake-input-comparison-v1','collisionInputsExact':reusable,
            'allAuthoredNormalInputsExact':all(r['equal'] for r in array_proof if r['field'] in ['N','dN']),
            'arrays':array_proof,'all2056BaseAnd54TargetsChecked':True,'trianglesRolesAndNegativeCompensationIdentical':True})
        with np.load(pinned(spec['headRaw']),allow_pickle=False) as data:
            for row in records:
                if row['positionAccessor']!=21: continue
                a,n=row['offset'],row['count']
                require(np.array_equal(single_frame(head,row['endpoint']),data['float32BakeRoundTripM'][a:a+n]),'Old55 input differs from exported head')
        old55=json.loads(pinned(spec['head55Result']).read_bytes())
        require(old55['rawArrays']==spec['headRaw'] and old55['source']==spec['source'],'Old55 receipt binds other coordinates')
        require(sorted(r['target'] for r in old55['frames'])==list(range(-1,54)),'Old55 state coverage incomplete')
        baseline={}
        for frame in contract['contactBaseline']['frames']:
            ref=frame['reference'];pairs=legacy.pointer_value(json.loads(pinned(ref).read_bytes()),ref['jsonPointer'])
            require(len(pairs)==frame['sourceStrictPairCount'] and legacy.sha(legacy.encode(pairs))==frame['sourceStrictPairsSHA256CanonicalJSON'],'Original strict baseline identity differs')
            baseline[frame['target']]=set(map(tuple,pairs))
        contacts,identities=mixtures.original_contacts()
        old10=json.loads(pinned(spec['head10Result']).read_bytes())
        require(old10['contactFunctions']==identities,'Original collision implementation changed')
        mouth=original['triangles']['FaceMouth_00_FACE'];skin=original['triangles']['Face_00_SKIN']
        single=[]
        for row in old55['frames']:
            target=row['target'];P=single_frame(current,target);previous=single_frame(head,target)
            require(set(map(tuple,row['sourceExistingPairs']))==baseline[target],'Old55 baseline changed')
            if reusable:
                require(P.tobytes()==previous.tobytes(),'Reuse cannot cross a different actual Float32 endpoint')
                pairs=set(map(tuple,row['candidateStrictPairs']))
            else:
                pairs=contacts(P,mouth,skin)
            before_coords=pair_coordinates(previous,mouth,skin,row['candidateStrictPairs'])
            now_coords=pair_coordinates(P,mouth,skin,row['candidateStrictPairs'])
            if reusable: require(now_coords.tobytes()==before_coords.tobytes(),'Same-pair coordinates differ')
            single.append({'target':target,'reusedSameInput':reusable,'sourceStrictPairs':sorted(baseline[target]),
                'candidateStrictPairs':sorted(pairs),'newStrictPairs':sorted(pairs-baseline[target]),
                'collisionInputSHA256Float64LE':digest_array(P),'previousInputSHA256Float64LE':digest_array(previous),
                'recordedPairCoordinatesSHA256Float64LE':digest_array(now_coords),
                'previousPairCoordinatesSHA256Float64LE':digest_array(before_coords)})
        io.save(out/'single55.json',{'schema':'body-head-same-input-single-target-contacts-v1','sourceResult':spec['head55Result'],'states':single})
        mixed=[]
        for index,(name,h,b,vowel,weight) in enumerate(scenarios()):
            require(time.monotonic()-started<600,'600s contact readback budget exceeded')
            old_summary=old10['rows'][index]
            old=json.loads(pinned(spec['headMixedCases'][index]).read_bytes())
            require(old_summary['sha256']==spec['headMixedCases'][index]['sha256'] and old['id']==name,'Mixed result identity differs')
            require(old['weights']=={'happy':h,'blink':b,'vowel':vowel,'vowelWeight':weight,'correctedEyeJoyWeight':-h*b},'Original mixture/negative weight changed')
            P,N=mixtures.compose(current,h,b,vowel,weight)
            previous,_=mixtures.compose(head,h,b,vowel,weight)
            original_P,_=mixtures.compose(original,h,b,vowel,weight)
            if reusable: require(P.tobytes()==previous.tobytes(),'Mixed collision coordinates differ')
            pair_rows=[]
            for old_pair,expected_pair in zip(old['contacts'],spec['mixedPairs'],strict=True):
                require([old_pair[k] for k in ['pair','roleA','roleB']]==expected_pair,'Mixed role pair changed')
                A=original['triangles'][old_pair['roleA']];B=original['triangles'][old_pair['roleB']]
                source_pairs=set(map(tuple,old_pair['sourceStrictPairs']))
                pairs=set(map(tuple,old_pair['leanStrictPairs'])) if reusable else contacts(P,A,B)
                added=pairs-source_pairs
                if reusable:
                    require(added==set(map(tuple,old_pair['addedStrictPairs'])),'Saved mixed differences inconsistent')
                    require(pair_coordinates(P,A,B,old_pair['leanStrictPairs']).tobytes()==
                        pair_coordinates(previous,A,B,old_pair['leanStrictPairs']).tobytes(),'Mixed recorded pair coordinates differ')
                witnesses=[]
                for witness in old_pair['addedWitnesses']:
                    ai,bi=witness['trianglePair'];av,bv=A[ai],B[bi]
                    if reusable:
                        for actual_points,key in [(P[av],'leanPointsA'),(P[bv],'leanPointsB'),
                                (original_P[av],'originalPointsA'),(original_P[bv],'originalPointsB')]:
                            require(np.array_equal(actual_points,np.asarray(witness[key])),'Pinned added-pair witness coordinates differ')
                        require(contacts(P,A[ai:ai+1],B[bi:bi+1])=={(0,0)},'Known added-pair local strict witness not reproduced')
                    witnesses.append({'pair':[int(ai),int(bi)],'sourceVertexIdsA':av,'sourceVertexIdsB':bv,
                        'currentPointsA':P[av],'currentPointsB':P[bv],'originalPointsA':original_P[av],'originalPointsB':original_P[bv]})
                pair_rows.append({'pair':old_pair['pair'],'roleA':old_pair['roleA'],'roleB':old_pair['roleB'],
                    'sourceStrictPairs':sorted(source_pairs),'candidateStrictPairs':sorted(pairs),'addedStrictPairs':sorted(added),
                    'recordedPairCoordinateSHA256Float64LE':digest_array(pair_coordinates(P,A,B,sorted(pairs))),
                    'addedWitnesses':witnesses})
            mixed.append({'id':name,'weights':old['weights'],'reusedSameInput':reusable,'sourceResult':spec['headMixedCases'][index],
                'collisionInputSHA256Float64LE':digest_array(P),'previousInputSHA256Float64LE':digest_array(previous),
                'contacts':pair_rows,'realExpressionManagerExecuted':False,'coverageOrVisibilityMeasured':False})
        io.save(out/'mixed10.json',{'schema':'body-head-same-input-ten-mixtures-v1','sourceResult':spec['head10Result'],'scenarios':mixed})
        added55=sum(len(r['newStrictPairs']) for r in single)
        added10=sum(len(p['addedStrictPairs']) for r in mixed for p in r['contacts'])
        result.update(status=outcome(added55,added10),failures=[] if added55+added10==0 else ['New strict pairs retained, including inherited mixed-oh; schema change cannot grant admission.'],
            single55={'statesExpected':55,'statesCompleted':len(single),'newStrictPairCount':added55,'report':io.ref(out/'single55.json')},
            mixed10={'statesExpected':10,'statesCompleted':len(mixed),'newStrictPairCount':added10,'report':io.ref(out/'mixed10.json')},
            fullFaceCollisionInputsExactToHead=reusable,faceArrayProof=io.ref(out/'face-array-equality.json'),
            full55And10ContactSweepsRerun=not reusable,originalFunctions=identities,
            collisionCoverage={'singleTargets':'FaceMouth_00_FACE vs Face_00_SKIN only',
                'mixtures':spec['mixedPairs'],'notMeasured':['Body_SKIN self/body contact','Body_SKIN vs Tops/Tie/Bottoms/Shoes',
                    'Independent equipment fit/contact','Hair/body/clothing collisions','Posed or continuous-time collisions'],
                'bodyChangedAndOutsideTheseContactInputs':True,'wholeBodyCollisionClearanceClaimed':False},
            admissibleForExport=False,originalKnownOhDefectPreserved=True)
    except Exception as error:
        result.update(status='failed-readback-no-admission',error=f'{type(error).__name__}: {error}')
    finally:
        result['seconds']=time.monotonic()-started;io.save(out/'report.json',result)
    return result


if __name__=='__main__':
    r=execute();print(json.dumps({'status':r['status'],'failures':r.get('failures'),'error':r.get('error')}))
    raise SystemExit(2 if r['status'].startswith('failed') else 0)
