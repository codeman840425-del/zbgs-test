"""Saved-array consistency only; no operator or geometry generation calls."""
from common import *
out=BASE/'generated/array-readback.json'
if out.exists():raise ValueError('Preserve prior readback')
spec=read('assets-source/m2-refined-axial-evaluation-v1/spec.json');check(spec['inputs']);check(read('assets-source/m2-refined-axial-evaluation-v1/execution-spec.json')['inputs'])
records=read('assets-source/m2-refined-axial-evaluation-v1/prepared/endpoint-records.json')['records']
seam_path=ROOT/'assets-source/m2-boundary-refinement-api-recovery-v1/generated/cross-accessor-seams.json';seams=json.loads(seam_path.read_bytes())
rows=[]
for case in spec['cases']:
    folder=BASE/'generated'/case['sourceRequestId'];raw=np.load(folder/'mapped-endpoints.npz');report=json.loads((folder/'report.json').read_bytes())
    for key in ['sourceEndpointsM','mappedEndpointsM','float32BakeRoundTripM','sourceNormals','mappedNormals','float32NormalBakeRoundTrip','sourceBaselineFloat32M']:
        assert raw[key].shape==(406701,3) and np.isfinite(raw[key]).all()
    assert raw['sourceJacobians'].shape==(406701,3,3)
    saved={}
    for acc in [7,21]:
        g=np.load(folder/f'group-{acc}.npz');saved[acc]=g
        rr=[r for r in records if r['positionAccessor']==acc]
        for r in rr:
            a,n,e=r['offset'],r['count'],r['endpoint']
            exact=g['basePositionM'] if e==-1 else g['basePositionM']+g['positionDeltasM'][e]
            assert np.allclose(exact,raw['mappedEndpointsM'][a:a+n],rtol=0,atol=3e-17)
            decoded=g['basePositionFloat32'] if e==-1 else g['basePositionFloat32']+g['positionDeltasFloat32'][e]
            assert np.array_equal(decoded,raw['float32BakeRoundTripM'][a:a+n])
        assert len(g['positionDeltasM'])==(54 if acc==21 else 0)
    midpoint_error=max(float(np.linalg.norm(saved[7]['basePositionM'][s['localBodyMidpointID']]-saved[21]['basePositionM'][s['faceMidpoint']])) for s in seams)
    morph_seam_error=max(float(np.linalg.norm(saved[21]['positionDeltasM'][:,s['faceMidpoint']],axis=1).max()) for s in seams)
    assert midpoint_error==morph_seam_error==0
    if case['sourceRequestId']=='identity':
        assert np.array_equal(raw['sourceEndpointsM'],raw['mappedEndpointsM'])
        assert np.array_equal(raw['sourceNormals'],raw['mappedNormals'])
        assert np.count_nonzero(saved[21]['normalDeltas'])==0
    assert float(np.linalg.det(raw['sourceJacobians']).min())==report['actualMinimumJacobian']
    rows.append(dict(case=case['sourceRequestId'],savedArraysConsistent=True,seamMidpointMaximumErrorM=midpoint_error,faceAll54MidpointMorphMaximumM=morph_seam_error))
save(out,dict(schema='refined-axial-saved-array-readback-v1',rows=rows,operatorCalled=False,seamReference=ref(seam_path)))
print(json.dumps(io.clean(rows)))
