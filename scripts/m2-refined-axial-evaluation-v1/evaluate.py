"""One saved G evaluation per case; supplemental frame and known-oh B explicit."""
from common import *
import time, traceback, importlib.metadata
def compose(P,D,lane):
    q=P.astype(float).copy();m=lane['mapping']
    for name,w in [('happy',.65),('blink',1.),('oh',.66)]:q+=w*D[m[name]].astype(float)
    ids=lane['correctedVertexIndices'];q[ids]-=.65*D[m['eyeJoy']][ids].astype(float)
    return q
def diagnostic(group,endpoint,baseline,actual):
    rows=[]
    for c in group['consumers']:
        ids=np.asarray(c['triangleIndices']);T=group['T'][ids]
        def cross(P):return np.cross(P[T[:,1]]-P[T[:,0]],P[T[:,2]]-P[T[:,0]])
        a,b=cross(baseline),cross(actual);la,lb=np.linalg.norm(a,axis=1),np.linalg.norm(b,axis=1);valid=la>0
        new=valid&(lb==0);flip=valid&(lb>0)&(np.einsum('ij,ij->i',a,b)<=0)
        rows.append(dict(positionAccessor=group['accessor'],endpoint=endpoint,mesh=c['mesh'],primitive=c['primitive'],material=c['material'],triangleCount=len(T),sourceDegenerateGlobalTriangleIndices=ids[la==0],mappedDegenerateGlobalTriangleIndices=ids[lb==0],newDegenerateGlobalTriangleIndices=ids[new],nonpositiveNormalDotGlobalTriangleIndices=ids[flip],minimumAreaRatio=float((lb[valid]/la[valid]).min()) if valid.any() else None))
    return rows
def run(case,spec,gs,records,P,masks,lane):
    start=time.monotonic();name=case['sourceRequestId'];folder=BASE/'generated'/name;folder.mkdir()
    report=dict(schema='refined-axial-case-result-v1',sourceRequestId=name,status='running',contactsExecuted=False,exported=False,runtimeAccepted=False)
    save(folder/'report.json',report)
    try:
        data=read(case['coefficients']['path']);Q,J,inside=operator(P,data)
        assert np.isfinite(Q).all() and np.isfinite(J).all()
        N=np.concatenate([np.tile(g['N'],(len(g['D'])+1,1)) for g in gs]);QN=normal_map(N,J)
        decoded=np.empty_like(Q);decodedN=np.empty_like(QN);baseline=np.empty_like(P)
        directions=[];group_results={};fixed=[];bake=[]
        for group in gs:
            acc=group['accessor'];rr=[r for r in records if r['positionAccessor']==acc];n=len(group['P']);a=rr[0]['offset']
            positions=Q[a:a+len(rr)*n].reshape(len(rr),n,3);normals=QN[a:a+len(rr)*n].reshape(len(rr),n,3)
            base=positions[0];delta=positions[1:]-base;bn=normals[0];dn=normals[1:]-bn
            base32,delta32=base.astype(np.float32),delta.astype(np.float32);bn32,dn32=bn.astype(np.float32),dn.astype(np.float32)
            np.savez_compressed(folder/f'group-{acc}.npz',basePositionM=base,positionDeltasM=delta,baseNormal=bn,normalDeltas=dn,basePositionFloat32=base32,positionDeltasFloat32=delta32,baseNormalFloat32=bn32,normalDeltasFloat32=dn32)
            group_results[acc]=(base,delta,base32,delta32)
            for r in rr:
                a,n,e=r['offset'],r['count'],r['endpoint'];qq=Q[a:a+n]
                decoded[a:a+n]=base32 if e==-1 else base32+delta32[e]
                decodedN[a:a+n]=bn32 if e==-1 else bn32+dn32[e]
                baseline[a:a+n]=group['P'].astype(np.float32) if e==-1 else group['P'].astype(np.float32)+group['D'][e].astype(np.float32)
                error=float(np.linalg.norm(decoded[a:a+n]-qq,axis=1).max());bake.append(dict(accessor=acc,endpoint=e,maximumErrorM=error))
                directions+=diagnostic(group,e,baseline[a:a+n],decoded[a:a+n])
                for role,rows in [('eye',masks['fixedEye']),('neck',masks['neck'])]:
                    for mask in rows:
                        if mask['positionAccessor']==acc and (role=='eye' or mask['endpoint']==e):
                            ids=mask['sourceIndices'];fixed.append(dict(role=role,accessor=acc,endpoint=e,count=len(ids),maximumExactM=float(np.linalg.norm(qq[ids]-P[a:a+n][ids],axis=1).max()),maximumBakedVersusExactSourceM=float(np.linalg.norm(decoded[a:a+n][ids]-P[a:a+n][ids],axis=1).max()),maximumBakedVersusBakedSourceM=float(np.linalg.norm(decoded[a:a+n][ids]-baseline[a:a+n][ids],axis=1).max())))
        np.savez_compressed(folder/'mapped-endpoints.npz',sourceEndpointsM=P,mappedEndpointsM=Q,float32BakeRoundTripM=decoded,sourceJacobians=J,sourceNormals=N,mappedNormals=QN,float32NormalBakeRoundTrip=decodedN,sourceBaselineFloat32M=baseline)
        frame=np.asarray(masks['frameSourcePointsM']);frameQ,frameJ,_=operator(frame,data);frameError=float(np.linalg.norm(frameQ-frame,axis=1).max())
        np.savez_compressed(folder/'frame.npz',sourcePointsM=frame,mappedPointsM=frameQ,sourceJacobians=frameJ)
        response=read(spec['response']);H=np.asarray(data['headOriginM'])
        targets=np.asarray(response['sourceLandmarksM'] if name=='identity' else next(r for r in response['requests'] if r['id']==name)['requestedLandmarksM'])-H
        face=gs[1];skin=next(c for c in face['consumers'] if c['material']=='M00_000_00_Face_00_SKIN')
        levels=targets[::2,1];desired=(targets[1::2,0]-targets[::2,0])/2
        widths=io.section_function()(group_results[21][2].astype(float)-H,face['T'][skin['triangleIndices']],levels)
        errors=[abs(w-d) for w,d in zip(widths,desired) if w is not None]
        sections=dict(requestedYMetres=levels,requestedHalfWidthsM=desired,actualHalfWidthsM=widths,maximumErrorM=max(errors),missingSections=101-len(errors),passed=len(errors)==101 and max(errors)<=.002,triangleCount=len(skin['triangleIndices']),precision='Float32 baked refined base; unchanged surface_widths z cutoff')
        save(folder/'sections.json',sections)
        # B is a separate 7251-point evaluation, not inferred from endpoint evaluations.
        C=compose(face['P'],face['D'],lane);Cb=compose(face['P'].astype(np.float32),face['D'].astype(np.float32),lane)
        b,d,b32,d32=group_results[21];A=compose(b,d,lane);Ab=compose(b32,d32,lane)
        B,BJ,_=operator(C,data)
        np.savez_compressed(folder/'known-oh.npz',sourceMixedM=C,sourceMixedBakedM=Cb,AEndpointMixM=A,AEndpointMixBakedM=Ab,BSourceMixThenGM=B,BSourceJacobians=BJ,AMinusBM=A-B)
        mix=dict(schema='refined-known-oh-result-v1',extraGEvaluationPoints=7251,weights=lane['weights'],mapping=lane['mapping'],maximumOrderDifferenceM=float(np.linalg.norm(A-B,axis=1).max()),maximumBakedAVersusExactAM=float(np.linalg.norm(Ab-A,axis=1).max()),minimumBJacobian=float(np.linalg.det(BJ).min()),finite=bool(np.isfinite(B).all()),realManagerExecuted=False,contactOrPenetrationMeasured=False,triangleDiagnostics=diagnostic(face,'known-oh-A',Cb,Ab))
        save(folder/'known-oh.json',mix)
        det=np.linalg.det(J);newzero=sum(len(r['newDegenerateGlobalTriangleIndices']) for r in directions);opposite=sum(len(r['nonpositiveNormalDotGlobalTriangleIndices']) for r in directions)
        fixedmax=max([frameError]+[r['maximumExactM'] for r in fixed]);fixedbaked=max(r['maximumBakedVersusExactSourceM'] for r in fixed)
        failures=[]
        if det.min()<=.12:failures.append('actual-endpoint-J<=.12')
        if max(fixedmax,fixedbaked)>2e-6:failures.append('fixed-eye-neck-frame>2um')
        if max(r['maximumErrorM'] for r in bake)>2e-6:failures.append('Float32-bake>2um')
        if not sections['passed']:failures.append('actual101-halfwidth-or-missing')
        if newzero:failures.append('new-exact-degenerate-triangles')
        identityError=float(np.linalg.norm(Q-P,axis=1).max()) if name=='identity' else None
        identityNormal=bool(np.array_equal(QN,N)) if name=='identity' else None
        if name=='identity' and (identityError>2e-6 or not identityNormal):failures.append('identity-geometry-or-authored-normal')
        save(folder/'triangle-diagnostics.json',dict(rows=directions,newDegenerateCount=newzero,nonpositiveNormalDotCount=opposite,sameTopologyFloat32SourceBaseline=True,selfIntersectionChecked=False))
        save(folder/'fixed-readback.json',dict(rows=fixed,frameMaximumErrorM=frameError))
        report.update(status='numeric-candidate-only' if not failures else 'failed-not-admissible',failures=failures,sourceEndpointOccurrences=len(P),sourceRecordCount=len(records),insideSupportOccurrences=int(inside.sum()),actualMinimumJacobian=float(det.min()),actualMaximumJacobian=float(det.max()),detProductMaximumError=float(abs(det-J[:,0,0]*J[:,1,1]).max()),maximumFixedExactErrorM=fixedmax,maximumFixedBakedVersusExactSourceM=fixedbaked,maximumBakeErrorM=max(r['maximumErrorM'] for r in bake),actual101=sections,newDegenerateCount=newzero,nonpositiveNormalDotCount=opposite,identityMaximumErrorM=identityError,identityAuthoredNormalsExact=identityNormal,normalFinite=bool(np.isfinite(QN).all() and np.isfinite(decodedN).all()),knownOh={k:v for k,v in mix.items() if k!='triangleDiagnostics'},GCalls={'completeEndpoints':len(P),'frame':8,'knownOhSourceMixSupplement':7251},bodyParametersApplied=False)
    except Exception as e:
        report.update(status='failed-stopped',error=f'{type(e).__name__}: {e}',traceback=traceback.format_exc())
    report['seconds']=time.monotonic()-start;save(folder/'report.json',report);print(json.dumps(io.clean(report)),flush=True);return report
if __name__=='__main__':
    spec=read('assets-source/m2-refined-axial-evaluation-v1/spec.json');check(spec['inputs']);check(read('assets-source/m2-refined-axial-evaluation-v1/execution-spec.json')['inputs'])
    for name,version in spec['versions'].items():assert importlib.metadata.version(name)==version
    gs=groups();records=read('assets-source/m2-refined-axial-evaluation-v1/prepared/endpoint-records.json')['records'];P=np.load(BASE/'prepared/source-endpoints.npz')['sourceEndpointsM']
    masks=read('assets-source/m2-refined-axial-evaluation-v1/prepared/fixed-source-masks.json');lane=read('assets-source/m2-refined-axial-evaluation-v1/prepared/known-oh.json');reports=[]
    for case in spec['cases']:
        r=run(case,spec,gs,records,P,masks,lane);reports.append(dict(sourceRequestId=r['sourceRequestId'],status=r['status'],failures=r.get('failures'),error=r.get('error')))
        save(BASE/'generated/summary.json',dict(cases=reports,contactsExecuted=False,exported=False))
        if r['status']=='failed-stopped' or (case['sourceRequestId']=='identity' and r['status']!='numeric-candidate-only'):break
