"""Independent complete GLB endpoint and fixed-coefficient numerical readback."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import hashlib,json
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-axial-head-evaluation-v1'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def source_groups(g):
    groups={};consumers=[]
    for mi,mesh in enumerate(g.doc['meshes']):
        for pi,primitive in enumerate(mesh['primitives']):
            a=primitive['attributes']['POSITION'];sig=primitive.get('targets',[])
            ids=np.unique(g.accessor(primitive['indices'])).astype(int)
            group=groups.setdefault(a,{'indices':set(),'targets':sig,'references':[]})
            assert sig==group['targets']
            group['indices'].update(map(int,ids));group['references'].append((mi,pi))
    for ni,node in enumerate(g.doc['nodes']):
        if 'mesh' not in node:continue
        assert ni in g.doc['scenes'][g.doc.get('scene',0)]['nodes']
        for key,default in [('translation',[0,0,0]),('scale',[1,1,1]),('rotation',[0,0,0,1]),('matrix',np.eye(4).ravel())]:
            assert np.array_equal(node.get(key,default),default)
        consumers.append({'node':ni,'mesh':node['mesh'],'identityTransform':True})
    for a,group in groups.items():group['indices']=np.asarray(sorted(group['indices']),int)
    return groups,consumers

def map_and_jacobian(P,curve):
    H=np.asarray(curve['headOriginM']);knots=np.asarray(curve['knotsLocalY_M']);c=np.asarray(curve['coefficients'])
    local=P-H;y=local[:,1];inside=(y>curve['supportL'])&(y<curve['supportU'])
    values=np.zeros((len(P),3));values[:,0]=1;derivative=np.zeros_like(values)
    k=np.minimum(np.searchsorted(knots,y[inside],side='right')-1,len(knots)-2);u=y[inside]-knots[k]
    values[inside]=((c[0,k]*u[:,None]+c[1,k])*u[:,None]+c[2,k])*u[:,None]+c[3,k]
    derivative[inside]=(3*c[0,k]*u[:,None]+2*c[1,k])*u[:,None]+c[2,k]
    mapped=P.copy()
    mapped[inside,0]=H[0]+values[inside,0]*local[inside,0]
    mapped[inside,1:]+=values[inside,1:]
    J=np.broadcast_to(np.eye(3),(len(P),3,3)).copy()
    J[:,0,0]=values[:,0];J[:,0,1]=local[:,0]*derivative[:,0];J[:,1,1]=1+derivative[:,1];J[:,2,1]=derivative[:,2]
    return mapped,J

def widths(P,F,levels):
    # Independent full-triangle edge enumeration with original per-intersection z gate.
    edge_a=F.T.reshape(-1);edge_b=F[:,[1,2,0]].T.reshape(-1)
    a,b=P[edge_a],P[edge_b];dy=b[:,1]-a[:,1]
    result=[]
    for y in levels:
        t=(y-a[:,1])/np.where(abs(dy)>1e-12,dy,np.inf)
        q=a+t[:,None]*(b-a)
        valid=(abs(dy)>1e-12)&(t>=0)&(t<=1)&(q[:,2]<-.025)
        result.append(float(np.ptp(q[valid,0])/2) if valid.any() else None)
    return result

def run():
    out=Path(__file__).with_name('result.json')
    if out.exists():raise SystemExit('Refusing to overwrite evidence')
    report_all=json.loads((BASE/'generated/report.json').read_bytes())
    assert report_all['status']=='complete-source-evaluations-finished-not-production-admission'
    spec=json.loads((BASE/'spec.json').read_bytes())
    for row in spec['inputs']:assert digest(ROOT/row['path'])==row['sha256']
    sys.path.insert(0,str(ROOT/'scripts/m2-head-volume-slim-v1'))
    import common
    _,_,_,_,_,response,oldrecords,g=common.load_inputs()
    assert digest(ROOT/spec['source']['path'])==spec['source']['sha256']
    groups,consumers=source_groups(g)
    records=json.loads((BASE/'prepared/endpoint-records.json').read_bytes())['records']
    masks=json.loads((BASE/'prepared/fixed-source-masks.json').read_bytes())
    expected_pairs={(a,e) for a,v in groups.items() for e in range(-1,len(v['targets']))}
    assert len(records)==len(expected_pairs)==56
    assert {(r['positionAccessor'],r['endpoint']) for r in records}==expected_pairs
    original=[];offset=0;reference_count=set()
    for row in records:
        a,e=row['positionAccessor'],row['endpoint'];group=groups[a];ids=group['indices']
        assert row['offset']==offset and row['count']==len(ids) and np.array_equal(row['sourceIndices'],ids)
        assert {(r['mesh'],r['primitive']) for r in row['references']}==set(group['references'])
        for ref in row['references']:
            p=g.doc['meshes'][ref['mesh']]['primitives'][ref['primitive']]
            assert ref['attributes']==p['attributes'] and ref['indexAccessor']==p['indices']
            assert ref['targetSignatures']==p.get('targets',[])
            assert ref['material']==g.doc['materials'][p['material']]['name']
            reference_count.add((ref['mesh'],ref['primitive']))
        target_accessor=None if e<0 else group['targets'][e]['POSITION']
        assert row['targetPositionAccessor']==target_accessor
        P=np.asarray(g.accessor(a),float)
        if e>=0:P=P+np.asarray(g.accessor(target_accessor),float)
        original.append(P[ids]);offset+=len(ids)
    original=np.concatenate(original)
    assert original.shape==(120935,3)
    assert np.array_equal(original,np.load(BASE/'prepared/source-endpoints.npz',allow_pickle=False)['sourceEndpointsM'])
    assert sum(len(v['indices']) for v in groups.values())==9911
    eye_names={'M00_000_00_EyeIris_00_EYE','M00_000_00_EyeHighlight_00_EYE','M00_000_00_EyeWhite_00_EYE'}
    independent_eye={}
    for mi,mesh in enumerate(g.doc['meshes']):
        for pi,p in enumerate(mesh['primitives']):
            name=g.doc['materials'][p['material']]['name']
            if name in eye_names:independent_eye[(mi,pi)]=(p['attributes']['POSITION'],np.unique(g.accessor(p['indices'])).astype(int),name)
    assert {(r['mesh'],r['primitive']) for r in masks['fixedEye']}==set(independent_eye)
    for row in masks['fixedEye']:
        a,ids,name=independent_eye[(row['mesh'],row['primitive'])]
        assert row['positionAccessor']==a and np.array_equal(row['sourceIndices'],ids) and row['material']==name
    neck_old=[r for r in oldrecords if r['role']=='neck-preservation']
    assert len(neck_old)==len(masks['neck'])==1
    for k in ['positionAccessor','endpoint','sourceIndices']:assert neck_old[0][k]==masks['neck'][0][k]
    eye_mask=np.zeros(len(original),bool);neck_mask=eye_mask.copy()
    for row in records:
        ids=np.asarray(row['sourceIndices']);a=row['offset']
        for accessor,selected,_ in independent_eye.values():
            if accessor==row['positionAccessor']:eye_mask[a:a+row['count']]|=np.isin(ids,selected)
        if row['positionAccessor']==neck_old[0]['positionAccessor'] and row['endpoint']==neck_old[0]['endpoint']:
            neck_mask[a:a+row['count']]=np.isin(ids,neck_old[0]['sourceIndices'])
    assert eye_mask.sum()==17490 and neck_mask.sum()==68
    F=np.asarray(response['sourceFaceTriangles'],int);H=np.asarray(response['rawHeadRestOriginM'])
    cases=[]
    pins=[Path(__file__),BASE/'spec.json',BASE/'generated/report.json',BASE/'prepared/endpoint-records.json',BASE/'prepared/source-endpoints.npz',BASE/'prepared/fixed-source-masks.json',ROOT/spec['source']['path']]
    for case in spec['cases']:
        name=case['sourceRequestId'];folder=BASE/'generated'/name
        saved=json.loads((folder/'report.json').read_bytes());curve=json.loads((ROOT/case['coefficients']['path']).read_bytes())
        assert np.array_equal(curve['headOriginM'],H) and digest(ROOT/case['coefficients']['path'])==case['coefficients']['sha256']
        raw=np.load(folder/'mapped-endpoints.npz',allow_pickle=False);initial=np.load(folder/'initial-G-arrays.npz',allow_pickle=False)
        assert np.array_equal(raw['sourceEndpointsM'],original)
        for key in initial.files:assert np.array_equal(raw[key],initial[key])
        mapped,J=map_and_jacobian(original,curve)
        map_difference=float(abs(mapped-raw['mappedEndpointsM']).max());j_difference=float(abs(J-raw['sourceJacobians']).max())
        assert map_difference<1e-12 and j_difference<1e-11
        det=np.linalg.det(J);assert np.isfinite(J).all() and np.isfinite(mapped).all()
        assert abs(float(det.min())-saved['actualGJacobian']['minimumDeterminant'])<1e-11
        assert abs(float(det.max())-saved['actualGJacobian']['maximumDeterminant'])<1e-11
        assert np.array_equal(np.flatnonzero(det<=.12),saved['actualGJacobian']['failedOccurrenceIndices'])
        decoded=np.empty_like(mapped);source_decoded=np.empty_like(original);bases={};source_bases={};deltas=[]
        triangles=json.loads((folder/'triangle-diagnostics.json').read_bytes());diagnostic_by={(r['mesh'],r['primitive'],r['endpoint']):r for r in triangles['rows']}
        counts={'rows':0,'sourceExactDegenerate':0,'newFloat32ExactDegenerate':0,'nonpositiveSourceNormalDot':0}
        minimum_area_ratio=float('inf')
        for row in records:
            a,n,accessor,e=row['offset'],row['count'],row['positionAccessor'],row['endpoint'];sl=slice(a,a+n)
            # Bake from saved mapped endpoint data, after independent G identity check.
            Q=raw['mappedEndpointsM'][sl];P=original[sl]
            assert np.array_equal(row['sourceIndices'],np.arange(n))
            if e==-1:
                bases[accessor]=Q;source_bases[accessor]=P
                decoded[sl]=Q.astype(np.float32).astype(float);source_decoded[sl]=P.astype(np.float32).astype(float)
            else:
                delta=(Q-bases[accessor]).astype(np.float32)
                decoded[sl]=(bases[accessor].astype(np.float32)+delta).astype(float)
                source_decoded[sl]=(source_bases[accessor].astype(np.float32)+np.asarray(g.accessor(row['targetPositionAccessor']),np.float32)).astype(float)
                deltas.append({'positionAccessor':accessor,'endpoint':e,'maximumDeltaMagnitudeM':float(np.linalg.norm(delta.astype(float),axis=1).max())})
            for ref in row['references']:
                tri=np.asarray(g.accessor(ref['indexAccessor']),int).reshape(-1,3)
                def cross(A):return np.cross(A[tri[:,1]]-A[tri[:,0]],A[tri[:,2]]-A[tri[:,0]])
                normal0,normal1,normal32=cross(source_decoded[sl]),cross(Q),cross(decoded[sl])
                areas=[np.linalg.norm(x,axis=1) for x in [normal0,normal1,normal32]];nonzero=areas[0]>0
                newzero=np.flatnonzero(nonzero&(areas[2]==0));opposite=np.flatnonzero(nonzero&(areas[2]>0)&(np.einsum('ni,ni->n',normal0,normal32)<=0))
                row_saved=diagnostic_by[(ref['mesh'],ref['primitive'],e)]
                assert row_saved['triangleCount']==len(tri)
                assert np.array_equal(np.flatnonzero(areas[0]==0),row_saved['sourceExactDegenerateTriangleIndices'])
                assert row_saved['mappedExactDegenerateCount']==int((areas[1]==0).sum()) and row_saved['float32ExactDegenerateCount']==int((areas[2]==0).sum())
                assert np.array_equal(newzero,row_saved['newFloat32ExactDegenerateTriangleIndices']) and np.array_equal(opposite,row_saved['nonpositiveReferenceNormalDotTriangleIndices'])
                ratio=float((areas[2][nonzero]/areas[0][nonzero]).min()) if nonzero.any() else None
                assert ratio==row_saved['minimumFloat32AreaRatioWhereSourceNonzero']
                if ratio is not None:minimum_area_ratio=min(minimum_area_ratio,ratio)
                counts['rows']+=1;counts['sourceExactDegenerate']+=int((areas[0]==0).sum());counts['newFloat32ExactDegenerate']+=len(newzero);counts['nonpositiveSourceNormalDot']+=len(opposite)
        assert np.array_equal(decoded,raw['float32BakeRoundTripM'])
        assert counts['rows']==len(diagnostic_by)==501
        bake_error=float(np.linalg.norm(decoded-raw['mappedEndpointsM'],axis=1).max())
        assert bake_error==saved['float32MorphBakeReadback']['maximumErrorM']
        fixed={}
        for role,mask in [('eye',eye_mask),('neck',neck_mask)]:
            fixed[role]={'occurrences':int(mask.sum()),'rawMaximumM':float(np.linalg.norm(mapped[mask]-original[mask],axis=1).max()),
                'bakedVersusOriginalRealEndpointMaximumM':float(np.linalg.norm(decoded[mask]-original[mask],axis=1).max()),
                'bakedVersusOriginalFloat32EndpointMaximumM':float(np.linalg.norm(decoded[mask]-source_decoded[mask],axis=1).max())}
        assert abs(fixed['eye']['rawMaximumM']-saved['maximumFixedEyeDisplacementM'])<1e-12 and abs(fixed['neck']['rawMaximumM']-saved['maximumFixedNeckDisplacementM'])<1e-12
        frame=np.asarray(masks['frameSourcePointsM']);frame_mapped,frame_J=map_and_jacobian(frame,curve)
        fixed['frame']={'occurrences':len(frame),'rawMaximumM':float(np.linalg.norm(frame_mapped-frame,axis=1).max())}
        assert fixed['frame']['rawMaximumM']==saved['maximumFrameDisplacementM']
        face=next(r for r in records if r['positionAccessor']==response['sourceFacePositionAccessor'] and r['endpoint']==-1)
        request=np.asarray(response['sourceLandmarksM'] if name=='identity' else next(r for r in response['requests'] if r['id']==name)['requestedLandmarksM'])-H
        actual=widths(decoded[face['offset']:face['offset']+face['count']]-H,F,request[::2,1])
        assert actual==saved['original101HorizontalSectionsFloat32']['actualHalfWidthsM']
        desired=(request[1::2,0]-request[::2,0])/2
        errors=[abs(x-y) for x,y in zip(actual,desired) if x is not None]
        sample_indices=sorted(set([int(det.argmin()),int(np.linalg.norm(mapped-original,axis=1).argmax()),int(np.flatnonzero(eye_mask)[0]),int(np.flatnonzero(neck_mask)[0]),face['offset']]))
        samples=[]
        for idx in sample_indices:
            r=next(r for r in records if r['offset']<=idx<r['offset']+r['count'])
            samples.append({'occurrence':idx,'positionAccessor':r['positionAccessor'],'endpoint':r['endpoint'],'sourceIndex':r['sourceIndices'][idx-r['offset']],
                'sourceM':original[idx].tolist(),'actualJ':J[idx].tolist(),'determinant':float(det[idx])})
        cases.append({'id':name,'producerStatus':saved['status'],'sourceEndpointOccurrences':len(original),'mapVersusRawMaximumCoordinateDifferenceM':map_difference,
            'independentJVersusRawMaximumDifference':j_difference,'actualMinimumDeterminant':float(det.min()),'actualMaximumDeterminant':float(det.max()),
            'actualFailedJacobianOccurrences':int((det<=.12).sum()),'representativeSourceJacobians':samples,'fixed':fixed,'float32BakeMaximumErrorM':bake_error,
            'deltaRuleAll54Checked':True,'float32ArrayExactlyReproduced':True,'original101ActualHalfWidthsM':actual,'original101RequestedHalfWidthsM':desired.tolist(),
            'maximumHalfWidthErrorM':max(errors),'missingSections':sum(v is None for v in actual),'sectionsAbove2mm':sum(e>.002 for e in errors),
            'triangleDiagnostics':{**counts,'minimumAreaRatio':minimum_area_ratio,'sourceBaselineSameExpressionEndpoint':True,'sourceBaselineOriginalFloat32BasePlusDelta':True,'selfIntersectionProvedAbsent':False},
            'strictExpressionChecksRun':False,'newCoefficientConstruction':False,'tetGateClaimedPassed':False})
        pins.extend([ROOT/case['coefficients']['path']]+[folder/n for n in ['report.json','mapped-endpoints.npz','initial-G-arrays.npz','triangle-diagnostics.json']])
    result={'schema':'complete-axial-head-independent-evaluation-audit-v1','status':'complete-numerical-readback-only-not-production-admission',
        'sourceGroups':[{'positionAccessor':a,'referencedVertices':len(v['indices']),'morphTargets':len(v['targets']),'primitiveCount':len(v['references'])} for a,v in groups.items()],
        'sourceMeshConsumers':consumers,'all15PrimitivesCovered':len(reference_count)==15,'records':len(records),'realSourceEndpointOccurrences':len(original),
        'unusedPositionSlots':sum(len(g.accessor(a))-len(v['indices']) for a,v in groups.items()),'old113713PartitionUsedForCoverage':False,
        'cases':cases,'solverCalled':False,'newCurveConstructed':False,'sourceMeshExported':False,'strict55ChecksRun':False,
        'pins':{p.relative_to(ROOT).as_posix():digest(p) for p in pins}}
    assert 'igl' not in sys.modules
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False,default=lambda v:v.item() if isinstance(v,np.generic) else str(v))+'\n',encoding='utf-8')
    print(json.dumps([{k:c[k] for k in ['id','producerStatus','actualMinimumDeterminant','fixed','float32BakeMaximumErrorM','maximumHalfWidthErrorM','missingSections','triangleDiagnostics']} for c in cases],indent=2,default=lambda v:v.item() if isinstance(v,np.generic) else str(v)))

if __name__=='__main__':run()
