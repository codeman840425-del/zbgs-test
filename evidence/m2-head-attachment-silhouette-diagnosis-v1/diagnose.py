"""Trace actual saved-mesh section extrema; no solver or candidate export."""
import sys
sys.dont_write_bytecode=True
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).with_name('result.json')
if OUT.exists():raise SystemExit('Refusing to overwrite evidence')
DOMAIN=ROOT/'assets-source/m2-head-volume-domain-v1/generated'
SOURCE=ROOT/'assets-source/m2-head-attachment-slim-v1/generated'
response_path=ROOT/'assets-source/m2-head-cage-skin-domain-v1/generated/male.json'
response=json.loads(response_path.read_bytes())
records=json.loads((DOMAIN/'endpoint-records.json').read_bytes())
domain=np.load(DOMAIN/'domain.npz',allow_pickle=False)
embedding=np.load(DOMAIN/'embedding.npz',allow_pickle=False)
native=json.loads((ROOT/'evidence/m2-face-target-next-method-review-v1/native-vertex-guide.json').read_bytes())
guide=next(r for r in native['sexes'] if r['sex']=='male')
P=np.asarray(response['sourcePointsM']);H=np.asarray(response['rawHeadRestOriginM'])
F=np.asarray(response['sourceFaceTriangles'],int)
source_local=P-H
guide_set=set(map(int,domain['guideSourceIndices']))
carrier=np.asarray(sorted({tuple(sorted((r['a'],r['b']))) for r in response['landmarks']}))
edge_a=F.T.reshape(-1)
edge_b=F[:,[1,2,0]].T.reshape(-1)
edge_tri=np.tile(np.arange(len(F)),3)
edge_corner=np.repeat(np.arange(3),len(F))

def section(points,y,front=True,carrier_only=False):
    ia,ib=(carrier[:,0],carrier[:,1]) if carrier_only else (edge_a,edge_b)
    a,b=points[ia],points[ib]
    dy=b[:,1]-a[:,1]
    with np.errstate(divide='ignore',invalid='ignore'):
        t=(y-a[:,1])/np.where(abs(dy)>1e-12,dy,np.inf)
    q=a+t[:,None]*(b-a)
    accepted=(abs(dy)>1e-12)&(t>=0)&(t<=1)
    all_count=int(accepted.sum())
    if front:accepted&=q[:,2]<-.025
    indices=np.flatnonzero(accepted)
    if not len(indices):return {'halfWidthM':None,'intersections':0,'zFilteredOut':all_count}
    def witness(index):
        return {'triangle':None if carrier_only else int(edge_tri[index]),
                'triangleVertices':None if carrier_only else F[edge_tri[index]].tolist(),
                'corner':None if carrier_only else int(edge_corner[index]),
                'edgeVertices':[int(ia[index]),int(ib[index])],'t':float(t[index]),
                'pointHeadLocalM':q[index].tolist(),
                'edgeEndpointIsNativeGuide':[int(ia[index]) in guide_set,int(ib[index]) in guide_set],
                'sourceCarrierEdge':tuple(sorted((int(ia[index]),int(ib[index])))) in {tuple(r) for r in carrier}}
    left=indices[np.argmin(q[indices,0])];right=indices[np.argmax(q[indices,0])]
    return {'halfWidthM':float((q[right,0]-q[left,0])/2),'intersections':len(indices),
        'zFilteredOut':all_count-len(indices),'left':witness(left),'right':witness(right)}

pins=[response_path,DOMAIN/'domain.npz',DOMAIN/'embedding.npz',DOMAIN/'endpoint-records.json',
      ROOT/'evidence/m2-face-target-next-method-review-v1/native-vertex-guide.json']
result={'schema':'saved-head-silhouette-extrema-v1','solverCalled':False,'candidateGenerated':False,
        'precision':'Original acceptance: float32 mapped base decoded to float64, minus exact head origin.',
        'sourceCarrierEdgeCount':len(carrier),'nativeGuideVertexCount':len(guide_set),'cases':[]}
for name in ('male-long-lean-v2','male-round-stocky-v2'):
    folder=SOURCE/name
    report=json.loads((folder/'report.json').read_bytes())
    solved=np.load(folder/'solved-nodes.npz',allow_pickle=False)
    X=solved['positionsM']
    mapped=np.einsum('ni,nij->nj',embedding['barycentric'],X[embedding['simplexVertexIndices']])
    saved_mapped=np.load(folder/'mapped-endpoints.npz',allow_pickle=False)['mappedEndpointsM']
    assert np.array_equal(mapped,saved_mapped)
    Q=P.copy()
    for row in records:
        if row['endpoint']==-1 and row['positionAccessor']==response['sourceFacePositionAccessor']:
            Q[row['sourceIndices']]=mapped[row['offset']:row['offset']+row['count']]
    Q32=Q.astype(np.float32).astype(float)
    local=Q32-H
    original_request=next(r for r in response['requests'] if r['id']==name)
    target=np.asarray(original_request['requestedLandmarksM'])-H
    native_request=next(r for r in guide['cases'] if r['id']==name)
    native_target=np.asarray(native_request['requestedVertexPointsM'])
    native_residual=np.linalg.norm(X[domain['guideNodes']]-native_target,axis=1)
    face_native_residual=np.linalg.norm(Q32[domain['guideSourceIndices']]-native_target,axis=1)
    rows=[]
    for i,y in enumerate(target[::2,1]):
        desired=float((target[2*i+1,0]-target[2*i,0])/2)
        actual=section(local,y)
        unfiltered=section(local,y,front=False)
        transported=section(local,y,carrier_only=True)
        source_y=float(np.asarray(response['sourceLandmarksM'])[2*i,1]-H[1])
        source_cut=section(source_local,source_y)
        at_target_y=section(source_local,y)
        attached=np.asarray([(1-r['t'])*local[r['a']]+r['t']*local[r['b']] for r in response['landmarks'][2*i:2*i+2]])
        row={'index':i,'requestedYHeadLocalM':float(y),'requestedHalfWidthM':desired,
            'actual':actual,'actualWithoutZFilter':unfiltered,'sourceCarrierEdgesAfterMapping':transported,
            'originalSourceAtSourceY':source_cut,'originalSourceAtRequestedY':at_target_y,
            'originalSourceYHeadLocalM':source_y,'originalAttachedLandmarks':response['landmarks'][2*i:2*i+2],
            'mappedAttachedPairHeadLocalM':attached.tolist(),'requestedPairHeadLocalM':target[2*i:2*i+2].tolist(),
            'attachedPairCoordinateResidualM':(attached-target[2*i:2*i+2]).tolist(),
            'absoluteHalfWidthErrorM':None if actual['halfWidthM'] is None else abs(actual['halfWidthM']-desired)}
        rows.append(row)
    errors=np.asarray([r['absoluteHalfWidthErrorM'] for r in rows])
    worst=int(errors.argmax());reported=report['original101HorizontalSectionsFloat32']
    assert np.max(abs(np.asarray([r['actual']['halfWidthM'] for r in rows])-reported['actualHalfWidthsM']))<1e-12
    assert abs(errors.max()-reported['maximumErrorM'])<1e-12
    filter_changed=[r['index'] for r in rows if abs(r['actual']['halfWidthM']-r['actualWithoutZFilter']['halfWidthM'])>1e-12]
    carrier_errors=[abs(r['sourceCarrierEdgesAfterMapping']['halfWidthM']-r['requestedHalfWidthM']) for r in rows if r['sourceCarrierEdgesAfterMapping']['halfWidthM'] is not None]
    case={'id':name,'rawNativeGuideMaxResidualM':float(native_residual.max()),'float32FaceNativeGuideMaxResidualM':float(face_native_residual.max()),
        'maxActualHalfWidthErrorM':float(errors.max()),'sectionsAbove2mm':np.flatnonzero(errors>.002).tolist(),
        'sectionsAbove2mmCount':int((errors>.002).sum()),'missingSections':int(sum(r['actual']['halfWidthM'] is None for r in rows)),
        'worstSectionIndex':worst,'zFilterChangesWidthAtSectionIndices':filter_changed,
        'sourceCarrierOnlyMaximumErrorM':max(carrier_errors),'sourceCarrierOnlyMissingSections':sum(r['sourceCarrierEdgesAfterMapping']['halfWidthM'] is None for r in rows),
        'rows':rows,'worstWitnessSourceVertices':[]}
    used=sorted(set(rows[worst]['actual']['left']['edgeVertices']+rows[worst]['actual']['right']['edgeVertices']))
    for v in used:
        case['worstWitnessSourceVertices'].append({'sourceVertex':v,'isNativeGuide':v in guide_set,
            'sourceHeadLocalM':source_local[v].tolist(),'actualHeadLocalM':local[v].tolist(),
            'actualDisplacementM':(Q32[v]-P[v]).tolist()})
    result['cases'].append(case)
    pins.extend([folder/'solved-nodes.npz',folder/'mapped-endpoints.npz',folder/'report.json'])
result['inputHashes']={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in pins}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
print(json.dumps([{k:r[k] for k in ('id','rawNativeGuideMaxResidualM','maxActualHalfWidthErrorM','sectionsAbove2mmCount','worstSectionIndex','zFilterChangesWidthAtSectionIndices','sourceCarrierOnlyMaximumErrorM','sourceCarrierOnlyMissingSections')} for r in result['cases']]))
