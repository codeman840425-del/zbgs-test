"""Independent source/raw readback. No producer run, export or strict contacts."""
import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace

sys.dont_write_bytecode = True
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'assets-source/m2-axial-body-compose-v1'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB
pins = {}


def read(path):
    path = Path(path)
    if not path.is_absolute(): path = ROOT / path
    raw = path.read_bytes()
    pins[path.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
    return raw


def document(path): return json.loads(read(path))


def pinned(ref):
    raw = read(ref['path'])
    assert hashlib.sha256(raw).hexdigest() == ref['sha256'], ref['path']
    return raw


def load_npz(path):
    read(path)
    with np.load(path, allow_pickle=False) as raw:
        return {key: raw[key] for key in raw.files}


def maximum(A): return float(np.linalg.norm(A, axis=1).max(initial=0))


started = time.monotonic()
spec = document(BASE / 'spec.json')
assert pins[(BASE / 'spec.json').relative_to(ROOT).as_posix()] == 'c42ec8f7a7a8d5b5bba4dd8a4760eb3350ec79c422753f4cf8da37a96ca36fa9'
for ref in spec['inputs']: pinned(ref)
original = json.loads(pinned(spec['originalRequestSpec']))
assert spec['originalEightRequestsMetadata'] == original['variants']
requested = next(row['parameters'] for row in original['variants'] if row['id'] == 'male-long-lean-v2')
assert len(requested) == 13 and spec['cases'][1]['parameters'] == requested
assert spec['cases'][0]['sourceRequestId'] == 'identity' and all(v == 0 for v in spec['cases'][0]['parameters'].values())
g = GLB(pinned(spec['source']))
acc = lambda key: np.asarray(g.accessor(key))
records = json.loads(pinned(spec['sourceRecords']))['records']
masks = json.loads(pinned(spec['fixedSourceMasks']))
groups = {}
for mi, mesh in enumerate(g.doc['meshes']):
    for pi, p in enumerate(mesh['primitives']):
        group = groups.setdefault(p['attributes']['POSITION'], [])
        group.append({'mesh': mi, 'primitive': pi, 'material': g.doc['materials'][p['material']]['name'],
            'materialIndex': p['material'], 'indexAccessor': p['indices'], 'attributes': p['attributes'],
            'targetSignatures': p.get('targets', [])})
expected = []
arrays = []
offset = 0
for accessor, refs in groups.items():
    assert all(ref['targetSignatures'] == refs[0]['targetSignatures'] for ref in refs)
    ids = np.unique(np.concatenate([acc(ref['indexAccessor']).ravel() for ref in refs])).astype(int)
    assert np.array_equal(ids, np.arange(len(acc(accessor))))
    for endpoint in range(-1, len(refs[0]['targetSignatures'])):
        target = None if endpoint == -1 else refs[0]['targetSignatures'][endpoint]['POSITION']
        row = {'positionAccessor': accessor, 'endpoint': endpoint, 'targetPositionAccessor': target,
            'references': refs, 'sourceIndices': ids.tolist(), 'offset': offset, 'count': len(ids)}
        expected.append(row)
        P = acc(accessor).astype(float)
        arrays.append(P if target is None else P + acc(target).astype(float))
        offset += len(ids)
assert expected == records and offset == 120935 and len(records) == 56
assert {key: (len(acc(key)), len(refs), len(refs[0]['targetSignatures'])) for key, refs in groups.items()} == {7:(7855,6,0),21:(2056,9,54)}
P = np.concatenate(arrays)

# Extract the retained original v2 body prefix, independently of compose/body_values.
legacy_path = ROOT / 'scripts/m2-representative-batch-v1/deform.py'
legacy_spec = importlib.util.spec_from_file_location('audit_original_v1', legacy_path)
legacy = importlib.util.module_from_spec(legacy_spec);legacy_spec.loader.exec_module(legacy)
tree = ast.parse(read('scripts/m2-representative-batch-v2/deform.py'))
cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'Mapper')
fn = copy.deepcopy(next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'field'))
cut = next(i for i, node in enumerate(fn.body) if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 's')
fn.name = 'body_reference'
fn.body = fn.body[:cut] + [ast.Return(ast.BinOp(ast.Name('P', ast.Load()), ast.Add(), ast.Name('D', ast.Load())))]
env = {'np':np, 'legacy':legacy}
exec(compile(ast.fix_missing_locations(ast.Module([fn],[])), 'original-v2-body-prefix', 'exec'), env)
context = legacy.source_context(g)
reference = lambda points, parameters: env['body_reference'](SimpleNamespace(p=parameters,c=context),points)
response = document(spec['response']['path'])
cases = []
for case in spec['cases']:
    folder = BASE / 'generated' / case['sourceRequestId']
    report = document(folder / 'report.json')
    raw = load_npz(folder / 'mapped-endpoints.npz')
    assert hashlib.sha256((folder / 'mapped-endpoints.npz').read_bytes()).hexdigest() == report['rawArrays']['sha256']
    head = load_npz(ROOT / case['headRaw']['path']);pinned(case['headRaw'])
    assert np.array_equal(raw['sourceEndpointsM'],P) and np.array_equal(head['sourceEndpointsM'],P)
    F, JF, G, JG = raw['mappedEndpointsM'], raw['sourceJacobians'], head['mappedEndpointsM'], head['sourceJacobians']
    initial = load_npz(folder / 'initial-composite-arrays.npz')
    for key in initial: assert np.array_equal(initial[key], raw[key])
    assert all(np.isfinite(value).all() for value in raw.values())
    if case['sourceRequestId'] == 'identity':
        B = np.zeros_like(P);JB = np.broadcast_to(np.eye(3), JF.shape)
        assert np.array_equal(F,P) and np.array_equal(JF,JB)
    else:
        B = reference(P,case['parameters']) - P
        epsilon = 1e-5
        JB = np.stack([(reference(P+np.eye(3)[axis]*epsilon,case['parameters'])-
            reference(P-np.eye(3)[axis]*epsilon,case['parameters']))/(2*epsilon) for axis in range(3)],axis=2)
    b_error = float(abs((F-G)-B).max())
    jf_error = float(abs(JF-(JG+JB-np.eye(3))).max())
    assert b_error < 5e-16 and jf_error < 5e-10
    det = np.linalg.det(JF)
    assert float(det.min()) == report['actualFJacobian']['minimumDeterminant'] and det.min() > .12
    bases = {};normal_bases = {};max_normal_error = 0.;bake_error = 0.;normal_bake_error = 0.
    tri_rows = []
    for row in records:
        a,n = row['offset'],row['count'];take=slice(a,a+n);ref=row['references'][0]
        source_N=acc(ref['attributes']['NORMAL']).astype(float)
        if row['endpoint'] >= 0 and 'NORMAL' in ref['targetSignatures'][row['endpoint']]:
            source_N += acc(ref['targetSignatures'][row['endpoint']]['NORMAL']).astype(float)
        local_J=JF[take];N=source_N.copy();selected=np.max(abs(local_J-np.eye(3)),axis=(1,2))>1e-6
        A=local_J[selected,:,0];C=local_J[selected,:,1];D=local_J[selected,:,2]
        cofactor=(np.cross(C,D)*N[selected,0,None]+np.cross(D,A)*N[selected,1,None]+np.cross(A,C)*N[selected,2,None])/det[take][selected,None]
        cofactor*=np.linalg.norm(N[selected],axis=1)[:,None]/np.maximum(np.linalg.norm(cofactor,axis=1),1e-12)[:,None]
        N[selected]=cofactor
        max_normal_error=max(max_normal_error,float(abs(N-raw['mappedAuthorNormals'][take]).max()))
        accessor=row['positionAccessor']
        if row['endpoint']==-1:
            bases[accessor]=F[take];normal_bases[accessor]=raw['mappedAuthorNormals'][take]
            decoded=F[take].astype(np.float32);decodedN=raw['mappedAuthorNormals'][take].astype(np.float32)
        else:
            decoded=bases[accessor].astype(np.float32)+(F[take]-bases[accessor]).astype(np.float32)
            decodedN=normal_bases[accessor].astype(np.float32)+(raw['mappedAuthorNormals'][take]-normal_bases[accessor]).astype(np.float32)
        assert np.array_equal(decoded,raw['float32BakeRoundTripM'][take])
        assert np.array_equal(decodedN,raw['float32NormalBakeRoundTrip'][take])
        bake_error=max(bake_error,maximum(decoded-F[take]));normal_bake_error=max(normal_bake_error,maximum(decodedN-raw['mappedAuthorNormals'][take]))
        source_base=acc(accessor).astype(np.float32)
        baseline=source_base if row['endpoint']==-1 else source_base+acc(row['targetPositionAccessor']).astype(np.float32)
        for consumer in row['references']:
            triangles=acc(consumer['indexAccessor']).astype(int).reshape(-1,3)
            cross=lambda Q:np.cross(Q[triangles[:,1]]-Q[triangles[:,0]],Q[triangles[:,2]]-Q[triangles[:,0]])
            c0,c1,c2=cross(baseline.astype(float)),cross(F[take]),cross(decoded.astype(float))
            area0,area1,area2=[np.linalg.norm(value,axis=1) for value in [c0,c1,c2]]
            nonzero=area0>0
            tri_rows.append({'mesh':consumer['mesh'],'primitive':consumer['primitive'],'endpoint':row['endpoint'],
                'sourceZeroIDs':np.flatnonzero(area0==0).tolist(),'mappedZeroIDs':np.flatnonzero(area1==0).tolist(),
                'float32ZeroIDs':np.flatnonzero(area2==0).tolist(),'newZeroIDs':np.flatnonzero(nonzero&(area2==0)).tolist(),
                'nonpositiveDotIDs':np.flatnonzero(nonzero&(area2>0)&(np.einsum('ni,ni->n',c0,c2)<=0)).tolist(),
                'minimumAreaRatio':float((area2[nonzero]/area0[nonzero]).min())})
    assert max_normal_error < 1e-13
    assert bake_error == report['float32MorphBakeReadback']['maximumErrorM'] and normal_bake_error == report['float32AuthorNormalReadback']['maximumVectorError']
    saved_tris=document(folder/'triangle-diagnostics.json')['rows']
    assert len(tri_rows)==len(saved_tris)==501
    for actual,saved in zip(tri_rows,saved_tris,strict=True):
        for key in ['mesh','primitive','endpoint']:assert actual[key]==saved[key]
        for akey,skey in [('sourceZeroIDs','sourceExactDegenerateTriangleIndices'),('newZeroIDs','newFloat32ExactDegenerateTriangleIndices'),('nonpositiveDotIDs','nonpositiveReferenceNormalDotTriangleIndices')]:
            assert actual[akey]==saved[skey]
        assert len(actual['mappedZeroIDs'])==saved['mappedExactDegenerateCount'] and len(actual['float32ZeroIDs'])==saved['float32ExactDegenerateCount']
        assert actual['minimumAreaRatio']==saved['minimumFloat32AreaRatioWhereSourceNonzero']
    neckdoc=document(folder/'neck-decomposition.json');neckmask,=masks['neck'];neckrow,=neckdoc['rows']
    assert neckrow['sourceIndices']==neckmask['sourceIndices'] and len(neckrow['sourceIndices'])==68
    record=next(r for r in records if r['positionAccessor']==neckmask['positionAccessor'] and r['endpoint']==neckmask['endpoint'])
    ids=np.asarray(neckmask['sourceIndices'])+record['offset']
    neck_residual=maximum(F[ids]-(P[ids]+B[ids]))
    neck_final_error=maximum(F[ids]-P[ids])
    assert neck_final_error==report['maximumFixedNeckDisplacementFromOriginalM']
    assert maximum(np.asarray(neckrow['bodyDisplacementM'])-B[ids])<5e-16 and neck_residual<=2e-6
    assert np.array_equal(np.asarray(neckrow['sourcePointsM']),P[ids])
    assert np.array_equal(np.asarray(neckrow['finalDisplacementFromOriginalM']),F[ids]-P[ids])
    assert np.array_equal(np.asarray(neckrow['headOperationDisplacementM']),F[ids]-(P[ids]+np.asarray(neckrow['bodyDisplacementM'])) )
    frames=document(folder/'frame-decomposition.json');frame=np.asarray(masks['frameSourcePointsM'])
    assert frame.shape==(8,3) and np.array_equal(frame,np.asarray(frames['sourcePointsM']))
    frame_B=reference(frame,case['parameters'])-frame
    assert maximum(frame_B-np.asarray(frames['bodyDisplacementM']))<5e-16
    assert maximum(np.asarray(frames['headOperationDisplacementM']))==0
    assert np.array_equal(np.asarray(frames['finalDisplacementFromOriginalM']),np.asarray(frames['bodyDisplacementM']))
    eye_count=0;eye_error=0.
    for row in records:
        for mask in masks['fixedEye']:
            if row['positionAccessor']!=mask['positionAccessor']:continue
            ids=np.asarray(mask['sourceIndices'])+row['offset'];eye_count+=len(ids)
            eye_error=max(eye_error,maximum(F[ids]-P[ids]));assert maximum(B[ids])==0
    assert eye_count==17490 and eye_error==0
    curve=document(case['coefficients']['path']);origin=np.asarray(curve['headOriginM'])
    face=next(row for row in records if row['positionAccessor']==response['sourceFacePositionAccessor'] and row['endpoint']==-1)
    Q=raw['float32BakeRoundTripM'][face['offset']:face['offset']+face['count']]-origin
    target=np.asarray(response['sourceLandmarksM'] if case['sourceRequestId']=='identity' else next(v['requestedLandmarksM'] for v in response['requests'] if v['id']==case['sourceRequestId']))-origin
    levels=target[::2,1];wanted=np.diff(target[:,0].reshape(-1,2),axis=1).ravel()/2
    edges=np.asarray(response['sourceFaceTriangles'],int)[:,[[0,1],[1,2],[2,0]]].reshape(-1,2)
    v0,v1=Q[edges[:,0]],Q[edges[:,1]];dy=v1[:,1]-v0[:,1];actual_widths=[]
    for level in levels:
        nonflat=abs(dy)>1e-12;t=np.zeros(len(dy));t[nonflat]=(level-v0[nonflat,1])/dy[nonflat]
        hit=v0+t[:,None]*(v1-v0);xs=hit[nonflat&(t>=0)&(t<=1)&(hit[:,2]<-.025),0]
        assert len(xs);actual_widths.append(float((xs.max()-xs.min())/2))
    actual_widths=np.asarray(actual_widths)
    assert len(actual_widths)==101 and np.array_equal(levels,np.asarray(report['original101HorizontalSectionsFloat32']['requestedYMetres']))
    assert np.array_equal(actual_widths,np.asarray(report['original101HorizontalSectionsFloat32']['actualHalfWidthsM']))
    section_error=float(abs(actual_widths-wanted).max());assert section_error<=.002
    assert section_error==report['original101HorizontalSectionsFloat32']['maximumErrorM']
    face_occurrences=[np.arange(r['offset'],r['offset']+r['count']) for r in records if r['positionAccessor']==21]
    face_ids=np.concatenate(face_occurrences)
    assert np.array_equal(F[face_ids],G[face_ids])
    cases.append({'id':case['id'],'sourceRequestId':case['sourceRequestId'],'raw':report['rawArrays'],
        'status':report['status'],'sourceOccurrences':len(P),'recordCount':len(records),
        'maximumBVersusOriginalV2ComponentErrorM':b_error,'maximumJFFormulaEntryError':jf_error,
        'minimumJFDeterminant':float(det.min()),'maximumFloat32PositionErrorM':bake_error,
        'maximumFloat32NormalError':normal_bake_error,'maximumCofactorAuthorNormalDifference':max_normal_error,
        'neckPointCount':68,'maximumNeckFinalFromOriginalM':neck_final_error,
        'maximumHeadContributionAtNeckM':neck_residual,'framePointCount':8,'maximumFrameBodyM':maximum(frame_B),
        'fixedEyeOccurrences':eye_count,'maximumFixedEyeAbsoluteErrorM':eye_error,
        'sectionCount':101,'maximum101ErrorM':section_error,'triangleConsumerStates':len(tri_rows),
        'sourceDegenerateOccurrences':sum(len(r['sourceZeroIDs']) for r in tri_rows),
        'newExactDegenerateOccurrences':sum(len(r['newZeroIDs']) for r in tri_rows),
        'nonpositiveReferenceNormalDotOccurrences':sum(len(r['nonpositiveDotIDs']) for r in tri_rows),
        'fullFaceAndAll54ExpressionMappedPositionsExactToSealedHead':True,
        'minimumTriangleAreaRatio':min(r['minimumAreaRatio'] for r in tri_rows)})

read(__file__)
result={'schema':'axial-body-composition-independent-audit-v1','status':'no-new-numerical-blocker',
    'originalThirteenParametersExact':True,'coverage':{'groups':2,'baseIDs':9911,'records':56,'uniqueEndpointOccurrences':120935,'primitiveConsumers':15},
    'cases':cases,'seconds':time.monotonic()-started,'producerRerun':False,'strictContactsRun':False,'exported':False,
    'limitations':['JB is the existing 10um central-difference convention, not a certified continuous derivative.',
        'Direct G+B evaluation of embedded source clothing is not body-donor equipment adaptation.',
        'Triangle direction/degenerate statistics are not self-intersection or runtime acceptance.',
        'Known head-only mixed-oh mouth defect is retained.'], 'pins':pins}
dest=OUT/'result.json'
if dest.exists():raise RuntimeError('Preserve existing audit result')
dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='pins'},ensure_ascii=False))
