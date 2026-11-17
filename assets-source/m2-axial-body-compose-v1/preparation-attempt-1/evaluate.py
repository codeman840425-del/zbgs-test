"""One identity and one original full male-lean numerical composition."""
import json
import time

from common import BASE,ROOT,body_values,compose,export,io,load,neck_decomposition,np,original_function,require


def evaluate(case,spec,source,records,P,context,masks,out):
    folder=out/case['sourceRequestId'];folder.mkdir()
    started=time.monotonic()
    report={'schema':'axial-body-composition-result-v1','methodId':spec['id'],'id':case['id'],
        'sourceRequestId':case['sourceRequestId'],'status':'evaluating','source':spec['source'],
        'methodSpec':io.ref(BASE/'spec.json'),'headRaw':case['headRaw'],'coefficients':case['coefficients'],
        'sourceRecords':spec['sourceRecords'],'fixedSourceMasks':spec['fixedSourceMasks'],
        'fullThirteenParameterRequest':case['parameters'],'headOnlyBodyClaim':False,
        'knownHeadOnlyMixedOhDefectInherited':True,'strictExpressionChecksRun':False,
        'characterExported':False,'runtimeAccepted':False}
    io.save(folder/'report.json',report)
    try:
        with np.load(ROOT/case['headRaw']['path'],allow_pickle=False) as raw:
            require(np.array_equal(raw['sourceEndpointsM'],P),'Sealed G array source differs')
            QG=raw['mappedEndpointsM'];JG=raw['sourceJacobians']
        B,JB=body_values(P,case['parameters'],context)
        F,JF=compose(QG,JG,B,JB)
        np.savez_compressed(folder/'initial-composite-arrays.npz',sourceEndpointsM=P,mappedEndpointsM=F,sourceJacobians=JF)
        finite=bool(all(np.isfinite(x).all() for x in [F,JF,B,JB]))
        if not finite:
            report['fatalNonfinite']=True
            raise ValueError('Nonfinite composite/raw preserved; stop remaining cases')
        determinant=np.linalg.det(JF)
        decoded=np.empty_like(F);normal=np.empty_like(F);decoded_N=np.empty_like(F)
        bases={};base_normals={};triangle_rows=[];bake_error=0.;normal_error=0.;eye_error=0.;neck_error=0.
        normal_map=export.function('scripts/m2-representative-batch-v1/deform.py','normal_map')
        triangle_readback=original_function('triangle_readback')
        for r in records:
            a,n,accessor=r['offset'],r['count'],r['positionAccessor'];end=a+n
            p=r['references'][0]
            N=source.acc(p['attributes']['NORMAL']).astype(float)
            if r['endpoint']>=0 and 'NORMAL' in p['targetSignatures'][r['endpoint']]:
                N+=source.acc(p['targetSignatures'][r['endpoint']]['NORMAL']).astype(float)
            normal[a:end]=normal_map(N,JF[a:end])
            if r['endpoint']==-1:
                bases[accessor]=F[a:end];base_normals[accessor]=normal[a:end]
                decoded[a:end]=F[a:end].astype(np.float32)
                decoded_N[a:end]=normal[a:end].astype(np.float32)
            else:
                Q=bases[accessor];QN=base_normals[accessor]
                decoded[a:end]=Q.astype(np.float32)+(F[a:end]-Q).astype(np.float32)
                decoded_N[a:end]=QN.astype(np.float32)+(normal[a:end]-QN).astype(np.float32)
            bake_error=max(bake_error,float(np.linalg.norm(decoded[a:end]-F[a:end],axis=1).max()))
            normal_error=max(normal_error,float(np.linalg.norm(decoded_N[a:end]-normal[a:end],axis=1).max()))
            displacement=np.linalg.norm(F[a:end]-P[a:end],axis=1)
            for mask in masks['fixedEye']:
                if mask['positionAccessor']==accessor:
                    eye_error=max(eye_error,float(displacement[mask['sourceIndices']].max()))
            for mask in masks['neck']:
                if mask['positionAccessor']==accessor and mask['endpoint']==r['endpoint']:
                    neck_error=max(neck_error,float(displacement[mask['sourceIndices']].max()))
            triangle_rows.extend(triangle_readback(source,r,P[a:end],F[a:end],decoded[a:end]))
        # Save before interpretation/sections so any failure retains numerical evidence.
        np.savez_compressed(folder/'mapped-endpoints.npz',sourceEndpointsM=P,mappedEndpointsM=F,
            float32BakeRoundTripM=decoded,sourceJacobians=JF,mappedAuthorNormals=normal,float32NormalBakeRoundTrip=decoded_N)
        curve=json.loads((ROOT/case['coefficients']['path']).read_bytes())
        frame=np.asarray(masks['frameSourcePointsM']);frame_G,frame_JG,_=original_function('operator')(frame,curve)
        frame_B,frame_JB=body_values(frame,case['parameters'],context)
        frame_F,_=compose(frame_G,frame_JG,frame_B,frame_JB)
        frame_error=float(np.linalg.norm(frame_F-frame,axis=1).max())
        decomposition=neck_decomposition(P,records,masks,QG,B,F)
        io.save(folder/'neck-decomposition.json',{'schema':'composite-neck-original-body-head-v1','rows':decomposition,
            'originalFinalFixedGateM':2e-6,'headOperationRelativeToRequestedBodyIsDiagnosticOnly':True,'originalGateChanged':False})
        response=json.loads((ROOT/spec['response']['path']).read_bytes());origin=np.asarray(curve['headOriginM'])
        target=np.asarray(response['sourceLandmarksM'] if case['sourceRequestId']=='identity' else
            next(r for r in response['requests'] if r['id']==case['sourceRequestId'])['requestedLandmarksM'])-origin
        levels=target[::2,1];wanted=(target[1::2,0]-target[::2,0])/2
        face=next(r for r in records if r['positionAccessor']==response['sourceFacePositionAccessor'] and r['endpoint']==-1)
        face_P=decoded[face['offset']:face['offset']+face['count']]-origin
        actual=io.section_function()(face_P,np.asarray(response['sourceFaceTriangles'],int),levels)
        errors=[abs(x-y) for x,y in zip(actual,wanted) if x is not None]
        sections={'sectionCount':len(levels),'missingSections':sum(x is None for x in actual),
            'maximumErrorM':max(errors,default=None),'passed':len(errors)==101 and max(errors)<=.002,
            'requestedYMetres':levels,'requestedHalfWidthsM':wanted,'actualHalfWidthsM':actual,
            'precision':'Simulated Float32 full base, original AST; no VRM exported'}
        newzero=sum(len(r['newFloat32ExactDegenerateTriangleIndices']) for r in triangle_rows)
        opposite=sum(len(r['nonpositiveReferenceNormalDotTriangleIndices']) for r in triangle_rows)
        failures=[]
        if determinant.min()<=.12: failures.append('Composite actual source/endpoint JF determinant <=.12')
        if max(eye_error,neck_error,frame_error)>2e-6: failures.append('Final F relative to original fixed-eye/neck/frame >2um; head-relative-body quantity is diagnostic only')
        if bake_error>2e-6: failures.append('Float32 position readback >2um')
        if not np.isfinite(decoded_N).all() or normal_error>2e-6: failures.append('Float32 authored-normal readback nonfinite or vector error >2e-6')
        if not sections['passed']: failures.append('Original actual101 Float32 >2mm or missing')
        if newzero: failures.append('New exact degenerate output triangles')
        identity_error=float(np.linalg.norm(F-P,axis=1).max()) if case['sourceRequestId']=='identity' else None
        if identity_error is not None and identity_error>2e-6: failures.append('Full-source identity >2um')
        io.save(folder/'triangle-diagnostics.json',{'rows':triangle_rows,'newExactDegenerateCount':newzero,
            'nonpositiveReferenceNormalDotCount':opposite,'strictChecksRun':False})
        report.update(finite=finite,failures=failures,sourceEndpointOccurrences=len(P),sourceRecordsCount=len(records),
            actualFJacobian={'finite':True,'minimumDeterminant':float(determinant.min()),'maximumDeterminant':float(determinant.max()),
                'bodyOnlyMinimumDeterminant':float(np.linalg.det(JB).min()),'headOnlyMinimumDeterminant':float(np.linalg.det(JG).min()),
                'bodyDifferenceProbeM':1e-5,'tetMetrics':False},maximumFixedEyeDisplacementM=eye_error,
            maximumFixedNeckDisplacementFromOriginalM=neck_error,maximumFrameDisplacementM=frame_error,
            neckDecomposition=io.ref(folder/'neck-decomposition.json'),maximumIdentityDisplacementM=identity_error,
            float32MorphBakeReadback={'finite':bool(np.isfinite(decoded).all()),'maximumErrorM':bake_error},
            float32AuthorNormalReadback={'finite':bool(np.isfinite(decoded_N).all()),'maximumVectorError':normal_error},
            original101HorizontalSectionsFloat32=sections,triangleDiagnostics=io.ref(folder/'triangle-diagnostics.json'),
            newExactDegenerateCount=newzero,nonpositiveReferenceNormalDotCount=opposite,rawArrays=io.ref(folder/'mapped-endpoints.npz'))
        report['status']=('identity-passed' if case['sourceRequestId']=='identity' else 'axial-body-numerical-candidate-only') if not failures else 'failed-not-admissible'
    except Exception as error:
        report.update(status='failed-not-admissible',error=f'{type(error).__name__}: {error}')
    finally:
        report['seconds']=time.monotonic()-started;io.save(folder/'report.json',report)
    return report


if __name__=='__main__':
    spec,source,records,points,context,masks=load()
    out=BASE/'generated';require(not out.exists(),'Preserve first full-source composition')
    out.mkdir();result={'schema':'axial-body-composition-run-v1','status':'running','cases':[],'runtimeAccepted':False}
    for case in spec['cases']:
        actual=evaluate(case,spec,source,records,points,context,masks,out)
        result['cases'].append({'id':actual['id'],'status':actual['status'],'failures':actual.get('failures'), 'error':actual.get('error')})
        io.save(out/'report.json',result)
        if actual.get('fatalNonfinite') or (case['sourceRequestId']=='identity' and actual['status']!='identity-passed'):
            result['status']='stopped-no-retry';break
    else: result['status']='one-shot-composition-finished-not-production-admission'
    io.save(out/'report.json',result);print(json.dumps(result))
