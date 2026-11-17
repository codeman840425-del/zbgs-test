"""Only saved source arrays/metadata: locate overflow and LBS relative to G support."""
from collections import Counter,defaultdict
import hashlib
import json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-source/m2-source-subdivision-seam-v1/generated'
load=lambda p:json.loads(p.read_bytes())
supportpath=ROOT/'assets-source/m2-face-subdivision-preflight-v1/generated/face-body-seams.json'
support=load(supportpath)['supportMetadata'];H=np.array(support['origin']);L=support['L'];U=support['U']
z=np.load(OUT/'group-7.npz',allow_pickle=False);P=z['sourcePosition'];F=z['sourceTriangles'];edges=z['newPointEdges']
provenance=load(OUT/'provenance-7.json')['parentTriangles'];overflow=load(OUT/'overflow-7.json')
result=load(OUT/'result.json');body=next(r for r in result['groups'] if r['accessor']==7)
def describe(vertex,ids,parents):
    ids=np.asarray(ids,int);Y=P[ids,1]-H[1];tri=[]
    for tid in parents:
        ty=P[F[tid],1]-H[1]
        inside=(ty>L)&(ty<U);cross=bool(ty.max()>L and ty.min()<U)
        tri.append({'sourceTriangle':int(tid),**provenance[tid], 'vertices':F[tid].tolist(),
            'localYRangeM':[float(ty.min()),float(ty.max())], 'verticesInsideOpenSlab':int(inside.sum()),
            'triangleIntersectsOpenSlab':cross,'crossesSlabWithNoVertexInside':bool(cross and not inside.any())})
    inside=(Y>L)&(Y<U);cross=bool(Y.max()>L and Y.min()<U)
    return {'newVertex':int(vertex),'sourceEdge':ids.tolist(),'sourceEndpointHeadLocalYM':Y.tolist(),
        'edgeLocalYRangeM':[float(Y.min()),float(Y.max())], 'edgeEndpointsInsideOpenSlab':int(inside.sum()),
        'edgeIntersectsOpenSlab':cross,'edgeCrossesSlabWithNoEndpointInside':bool(cross and not inside.any()),
        'midpointInsideOpenSlab':bool(L<Y.mean()<U), 'parentTriangles':tri,
        'anyParentTriangleIntersectsOpenSlab':any(t['triangleIntersectsOpenSlab'] for t in tri)}
rows=[{**describe(x['vertex'],x['sourceIDs'],x['sourceParentTriangles']),
    'influenceCount':len(x['influences'])} for x in overflow]
material=defaultdict(list)
for row in rows:
    for name in {t['material'] for t in row['parentTriangles']}:material[name].append(row)
by_material=[]
for name,items in material.items():
    yy=[y for r in items for y in r['sourceEndpointHeadLocalYM']]
    by_material.append({'material':name,'uniqueOverflowVertices':len(items),
        'sourceEdgeLocalYRangeM':[min(yy),max(yy)],
        'edgesWithEndpointInsideSlab':sum(r['edgeEndpointsInsideOpenSlab']>0 for r in items),
        'edgesIntersectSlab':sum(r['edgeIntersectsOpenSlab'] for r in items),
        'verticesWithAnyParentTriangleIntersectingSlab':sum(r['anyParentTriangleIntersectsOpenSlab'] for r in items)})
worst=[]
for pose in body['lbs']:
    v=pose['worstNewVertex'];ids=edges[v-len(P)] if v>=len(P) else [v]
    parents=np.flatnonzero(np.isin(F,ids).sum(1)==len(ids)).tolist()
    worst.append({'pose':pose['pose'],'maximumSavedLBSInterpolationErrorM':pose['maxErrorM'],**describe(v,ids,parents)})
summary={'overflowCount':len(rows),'overflowEdgeEndpointsInsideSlab':sum(r['edgeEndpointsInsideOpenSlab']>0 for r in rows),
    'overflowEdgesIntersectSlab':sum(r['edgeIntersectsOpenSlab'] for r in rows),
    'overflowEdgesCrossSlabNoEndpointInside':sum(r['edgeCrossesSlabWithNoEndpointInside'] for r in rows),
    'overflowAnyParentTriangleIntersectsSlab':sum(r['anyParentTriangleIntersectsOpenSlab'] for r in rows),
    'overflowParentTriangleIntersectsButEdgeDoesNot':sum(r['anyParentTriangleIntersectsOpenSlab'] and not r['edgeIntersectsOpenSlab'] for r in rows)}
report={'schema':'source-subdivision-overflow-support-readback-v1',
    'savedArraySHA256':hashlib.sha256((OUT/'group-7.npz').read_bytes()).hexdigest(),
    'supportMetadataSource':{'path':supportpath.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(supportpath.read_bytes()).hexdigest()},
    'support':support,'summary':summary,'byMaterial':by_material,'overflows':rows,'worstLBSByPose':worst,
    'GOrNewSubdivisionCalled':False,'meaning':'Intersection with Y support is not proof of nonzero G displacement or need for any particular refinement; source triangles only.'}
path=OUT/'overflow-support-readback.json'
if path.exists():raise RuntimeError('Refuse overwrite')
path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'summary':summary,'byMaterial':by_material,'worstLBSByPose':worst},ensure_ascii=False))
