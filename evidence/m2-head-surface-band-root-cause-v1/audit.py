"""Independent saved-output volume/silhouette audit; no solver or target generation."""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).with_name('result.json')
if OUT.exists(): raise SystemExit('Refusing to overwrite evidence')
sys.path.insert(0,str(ROOT/'scripts/m2-head-volume-slim-v1'))
import common
spec,D,B,domain_report,guide,response,records,source=common.load_inputs()
BASE=ROOT/'assets-source/m2-head-surface-band-slim-v1'
run=json.loads((BASE/'generated/run-report.json').read_bytes())
assert run['exitCode']==0 and run['stop'] is None
V,T=D['nodesM'],D['tetrahedra']
P=np.asarray(response['sourcePointsM']); H=np.asarray(response['rawHeadRestOriginM']); F=np.asarray(response['sourceFaceTriangles'],int)
lookup={tuple(p):i for i,p in enumerate(V)}
skin_ids=np.unique(F); skin_nodes=np.asarray([lookup[tuple(p)] for p in P[skin_ids]])
node_skin={int(n):skin_ids[skin_nodes==n].tolist() for n in np.unique(skin_nodes)}
C=np.load(ROOT/'assets-source/m2-head-attachment-slim-v1/preflight/classification-nodes.npz',allow_pickle=False)
fixed=np.union1d(C['newProtectedNodes'],D['frameNodes'])
labels=json.loads((ROOT/'assets-source/m2-head-attachment-slim-v1/preflight/classification.json').read_bytes())
semantics={n:set() for n in range(len(V))}
for row in labels['table']:
    for n in row['actualNodes']: semantics[n].add(row['material']+':'+row['newRole'])
for n in D['frameNodes']:semantics[int(n)].add('outer-frame:fixed')
rest_edges=np.swapaxes(V[T[:,1:]]-V[T[:,:1]],1,2)
rest_det=np.linalg.det(rest_edges)
condition=np.linalg.cond(rest_edges)
assert (rest_det>0).all()
prior=json.loads((ROOT/'evidence/m2-head-surface-target-semantic-audit-v1/result.json').read_bytes())
edge_a=F.T.reshape(-1);edge_b=F[:,[1,2,0]].T.reshape(-1);edge_tri=np.tile(np.arange(len(F)),3)
pins=[Path(__file__),BASE/'generated/run-report.json',BASE/'generated/report.json',BASE/'spec.json',BASE/'execution-spec.json',
    ROOT/spec['domain'],ROOT/spec['embedding'],ROOT/spec['response'],ROOT/spec['endpointRecords'],
    ROOT/'assets-source/m2-head-attachment-slim-v1/preflight/classification.json',
    ROOT/'assets-source/m2-head-attachment-slim-v1/preflight/classification-nodes.npz',
    ROOT/'evidence/m2-head-surface-target-semantic-audit-v1/result.json']

def sections(local,levels,desired,guide_nodes,X,targets):
    rows=[]
    for index,(y,want) in enumerate(zip(levels,desired)):
        a,b=local[edge_a],local[edge_b]
        dy=b[:,1]-a[:,1]; t=(y-a[:,1])/np.where(abs(dy)>1e-12,dy,np.inf)
        q=a+t[:,None]*(b-a)
        mask=(abs(dy)>1e-12)&(t>=0)&(t<=1)&(q[:,2]<-.025)
        selected=np.flatnonzero(mask)
        witnesses=[]
        if len(selected):
            for k in [selected[np.argmin(q[selected,0])],selected[np.argmax(q[selected,0])]]:
                ids=[int(edge_a[k]),int(edge_b[k])]
                nodes=[lookup[tuple(P[i])] for i in ids]
                witnesses.append({'triangle':int(edge_tri[k]),'edgeVertices':ids,'nodes':nodes,'pointHeadLocalM':q[k].tolist(),'t':float(t[k]),
                    'bothEndpointsControlledByBand':all(n in guide_nodes for n in nodes),
                    'endpointGuideResidualM':[float(np.linalg.norm(X[n]-targets[n])) if n in guide_nodes else None for n in nodes],
                    'sourceLocalM':(P[ids]-H).tolist(),'actualLocalM':local[ids].tolist(),
                    'requestedLocalM':[(targets[n]-H).tolist() if n in guide_nodes else None for n in nodes]})
            width=float((witnesses[1]['pointHeadLocalM'][0]-witnesses[0]['pointHeadLocalM'][0])/2)
        else:width=None
        rows.append({'index':index,'requestedYHeadLocalM':float(y),'requestedHalfWidthM':float(want),'actualHalfWidthM':width,
            'errorM':None if width is None else abs(width-want),'extrema':witnesses})
    return rows

cases=[]
for name in ['male-long-lean-v2','male-round-stocky-v2']:
    folder=BASE/'generated'/name
    report=json.loads((folder/'report.json').read_bytes())
    solved=np.load(folder/'solved-nodes.npz',allow_pickle=False)
    prep=np.load(BASE/'prepared'/(name+'-targets.npz'),allow_pickle=False)
    X=solved['positionsM']; b=solved['constraintIndices'];bc=solved['constraintTargetsM']
    assert np.array_equal(b,prep['constraintIndices']) and np.array_equal(bc,prep['constraintTargetsM'])
    actual_det=np.linalg.det(np.swapaxes(X[T[:,1:]]-X[T[:,:1]],1,2))/rest_det
    saved_det=np.load(folder/'tetra-readback.npz',allow_pickle=False)['tetraDeterminants']
    det_diff=float(abs(actual_det-saved_det).max())
    assert det_diff<1e-5
    bad=np.flatnonzero(actual_det<=.12)
    band=prep['guideNodes'];band_targets=prep['guideTargetsM'];targets={int(n):p for n,p in zip(b,bc)}
    residual=np.linalg.norm(X[band]-band_targets,axis=1)
    exact_bad=prep['controlledTetIndices'][prep['exactTargetDeterminants']<=.12]
    prior_case=next(r for r in prior['cases'] if r['id']==name)
    assert set(exact_bad)=={r['tetIndex'] for r in prior_case['badExactTargetTets'] if r['stillFullyControlledBySourceBandPlusGuidesAndFixed']}
    mapped=common.interpolate(X,B)
    saved_mapped=np.load(folder/'mapped-endpoints.npz',allow_pickle=False)['mappedEndpointsM']
    assert np.array_equal(mapped,saved_mapped)
    Q=P.copy()
    for r in records:
        if r['endpoint']==-1 and r['positionAccessor']==response['sourceFacePositionAccessor']:
            Q[r['sourceIndices']]=mapped[r['offset']:r['offset']+r['count']]
    Q32=Q.astype(np.float32).astype(float)
    req=next(r for r in response['requests'] if r['id']==name)
    target=np.asarray(req['requestedLandmarksM'])-H
    rows=sections(Q32-H,target[::2,1],(target[1::2,0]-target[::2,0])/2,band,X,targets)
    actual_widths=[r['actualHalfWidthM'] for r in rows]
    assert actual_widths==report['original101HorizontalSectionsFloat32']['actualHalfWidthsM']
    worst=max((r for r in rows if r['errorM'] is not None),key=lambda r:r['errorM'])
    interesting=sorted(set(np.argsort(actual_det)[:10])|set(exact_bad))
    tet_rows=[]
    for ti in interesting:
        vertices=[]
        for n in T[ti]:
            vertices.append({'node':int(n),'skinSourceIndices':node_skin.get(int(n),[]),'sourceSemantics':sorted(semantics[int(n)]),
                'bandGuide':bool(n in band),'fixed':bool(n in fixed),'sourceLocalM':(V[n]-H).tolist(),'actualLocalM':(X[n]-H).tolist(),
                'targetLocalM':(targets[n]-H).tolist() if n in targets else None,
                'controlResidualM':float(np.linalg.norm(X[n]-targets[n])) if n in targets else None})
        exact_index=np.flatnonzero(prep['controlledTetIndices']==ti)
        tet_rows.append({'tetIndex':int(ti),'actualVolumeRatio':float(actual_det[ti]),'actualAtOrBelowPoint12':bool(actual_det[ti]<=.12),
            'restVolumeM3':float(rest_det[ti]/6),'restCondition':float(condition[ti]),
            'restVolumeAscendingRank':int((rest_det<rest_det[ti]).sum()+1),'restConditionDescendingRank':int((condition>condition[ti]).sum()+1),
            'fullyControlled':bool(len(exact_index)),'exactTargetVolumeRatio':float(prep['exactTargetDeterminants'][exact_index[0]]) if len(exact_index) else None,
            'wasKnownExactTargetBad':bool(ti in exact_bad),'vertices':vertices})
    identity=json.loads((BASE/'generated/identity/report.json').read_bytes())
    case={'id':name,'actualMinimumVolumeRatio':float(actual_det.min()),'actualWorstTetIndex':int(actual_det.argmin()),
        'badActualTetCount':len(bad),'badActualTetIndices':bad.tolist(),'directVolumeVersusSavedJMaximumDifference':det_diff,
        'knownExactTargetBadTetIndices':exact_bad.tolist(),'knownExactTargetBadStillActualBad':np.intersect1d(exact_bad,bad).tolist(),
        'newActualBadOutsideKnownExactBad':np.setdiff1d(bad,exact_bad).tolist(),
        'tetWitnesses':tet_rows,'bandGuideCount':len(band),'bandGuideResidualsM':[{'node':int(n),'residualM':float(e)} for n,e in zip(band,residual)],
        'bandGuideMaximumResidualM':float(residual.max()),'bandGuideMedianResidualM':float(np.median(residual)),
        'bandGuideAbove2mmCount':int((residual>.002).sum()),'bandGuideWorstNode':int(band[residual.argmax()]),
        'fixedNodeMaximumDisplacementM':float(np.linalg.norm(X[fixed]-V[fixed],axis=1).max()),
        'maxHalfWidthErrorM':worst['errorM'],'missingSectionIndices':[r['index'] for r in rows if r['actualHalfWidthM'] is None],
        'sectionsAbove2mm':[r['index'] for r in rows if r['errorM'] is not None and r['errorM']>.002],
        'worstSection':worst,'all101Sections':rows,
        'sourceSkinMinimumYM':float((P[skin_ids]-H)[:,1].min()),'actualSkinMinimumYM':float((Q32[skin_ids]-H)[:,1].min()),
        'allFailedExistingSectionExtremalEndpointsInBand':all(w['bothEndpointsControlledByBand'] for r in rows if r['errorM'] is not None and r['errorM']>.002 for w in r['extrema']),
        'reportedEnergyNotRecomputed':{'initial':report['initial']['energy'],'actual':report['actual']['energy']},
        'meaning':'Saved fixed-budget actual output. Exact-target conflict and residual correlation do not establish a globally impossible target or converged optimum.'}
    cases.append(case)
    pins.extend([folder/n for n in ['report.json','solved-nodes.npz','mapped-endpoints.npz','tetra-readback.npz']])
    pins.append(BASE/'prepared'/(name+'-targets.npz'))
result={'schema':'surface-band-saved-output-independent-root-cause-v1','cases':cases,'solverCalled':False,'newTargetEvaluated':False,'assetExported':False,
    'globalRestConditionMaximum':float(condition.max()),'globalMinimumRestVolumeM3':float(rest_det.min()/6),
    'embeddingOrder':'Original embedding.simplexVertexIndices + barycentric; saved positive tetrahedra used only for direct signed volume.',
    'pins':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in pins}}
assert 'igl' not in sys.modules
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False,default=lambda v:v.item() if isinstance(v,np.generic) else str(v))+'\n',encoding='utf-8')
print(json.dumps([{k:c[k] for k in ['id','actualMinimumVolumeRatio','actualWorstTetIndex','badActualTetCount','knownExactTargetBadStillActualBad','bandGuideMaximumResidualM','bandGuideAbove2mmCount','maxHalfWidthErrorM','missingSectionIndices','allFailedExistingSectionExtremalEndpointsInBand']} for c in cases]))
