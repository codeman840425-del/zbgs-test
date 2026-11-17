"""Read sealed arrays only. Enumerate required original edges; no topology construction."""
from collections import Counter,defaultdict
import hashlib
import json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
BASE=ROOT/'assets-source/m2-source-subdivision-seam-v1/generated'
refs=['group-7.npz','group-21.npz','cross-accessor-seams.json','provenance-7.json']
pins=[{'path':(BASE/p).relative_to(ROOT).as_posix(),'sha256':hashlib.sha256((BASE/p).read_bytes()).hexdigest()} for p in refs]
b=np.load(BASE/'group-7.npz',allow_pickle=False);f=np.load(BASE/'group-21.npz',allow_pickle=False)
P=b['sourcePosition'];F=b['sourceTriangles'];W=b['sourceDenseWeights'];E=b['newPointEdges']
old=json.loads((BASE/'cross-accessor-seams.json').read_bytes())
prov=json.loads((BASE/'provenance-7.json').read_bytes())['parentTriangles']
def key(e):return tuple(sorted(tuple(map(float,P[v])) for v in e))
required_keys={key(x['bodyEdge']) for x in old}
original_ids={tuple(sorted(x['bodyEdge'])) for x in old}
selected=[i for i,e in enumerate(E) if key(e) in required_keys]
selset={tuple(E[i]) for i in selected}
parent_counts=[];parents=[]
for tid,tri in enumerate(F):
    tri_edges=[tuple(sorted((int(tri[j]),int(tri[(j+1)%3])))) for j in range(3)]
    cuts=[list(e) for e in tri_edges if e in selset]
    if cuts:
        parent_counts.append(len(cuts));parents.append({'sourceTriangle':tid,**prov[tid],
            'sourceVertices':tri.tolist(),'requiredEdges':cuts,'requiredEdgeCount':len(cuts)})
rows=[]
for i in selected:
    edge=E[i];mid=len(P)+i;weights=b['newDenseWeights'][mid];expected=(W[edge[0]]+W[edge[1]])/2
    assert np.array_equal(weights,expected)
    rows.append({'sourceEdge':edge.tolist(),'existingFullSubdivisionMidpointID':mid,
        'inOriginal41':tuple(edge) in original_ids,
        'geometricOriginalMatches':[x['bodyEdge'] for x in old if key(x['bodyEdge'])==key(edge)],
        'position':P[edge].mean(0).tolist(),
        'endpointDenseWeightsEqual':bool(np.array_equal(W[edge[0]],W[edge[1]])),
        'newInfluenceCount':int((weights>0).sum()),
        'newNodeWeights':[{'node':int(b['skinJointNodes'][j]),'weight':float(weights[j])} for j in np.flatnonzero(weights>0)],
        'savedLBSInterpolationErrorByPoseM':b['lbsErrorsM'][:,mid].tolist()})
summary={'originalCorrespondences':len(old),'distinctRequiredGeometricEdges':len(required_keys),
    'originalBodyIndexEdges':len(original_ids),'bodyIndexEdgesWithExactGeometricDuplicateClosure':len(selected),
    'additionalBodyIndexEdges':sum(not r['inOriginal41'] for r in rows),
    'requiredNewPointMaxInfluences':max(r['newInfluenceCount'] for r in rows),
    'requiredNewPointsOver4':sum(r['newInfluenceCount']>4 for r in rows),
    'allRequiredEdgesHaveEqualEndpointWeights':all(r['endpointDenseWeightsEqual'] for r in rows),
    'maxSavedLBSInterpolationErrorRequiredPointsM':max(max(r['savedLBSInterpolationErrorByPoseM']) for r in rows),
    'adjacentParentTriangles':len(parents),'selectedEdgesPerAdjacentTriangle':dict(Counter(parent_counts)),
    'parentMaterialCounts':dict(Counter(p['material'] for p in parents)),
    'fullBodyOverflowKept':482,'newTopologyGenerated':False,'GCalled':False,
    'boundarySelectionRule':'All original Body index edges with exact unordered coordinate-endpoint pair equal to any sealed41 seam edge; no coordinate welding/nearest tolerance.'}
report={'schema':'boundary-refinement-existing-array-readback-v1','inputs':pins,'summary':summary,
    'requiredBodyEdges':rows,'adjacentParentTriangles':parents,
    'predictionOnly':{'ifOnlyRequiredMidpointsInsertedBodyVertexCount':len(P)+len(selected),
        'ifTriangulateEachParentWithoutOtherVerticesBodyTriangleCount':len(F)+sum(parent_counts)}}
target=OUT/'readback.json'
if target.exists():raise RuntimeError('Refuse overwrite')
target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'summary':summary,'predictionOnly':report['predictionOnly']},ensure_ascii=False))
