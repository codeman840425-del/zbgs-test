"""Read-only mesh/guide audit and an editable region contract, not a deformation.

Run after qa-skirt-corrective-source.py when the pinned GLB changes. No runtime,
GLB, Blender file, or historical evidence is changed by this script.
"""
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets-source/m1/shape-guide-review-v1'
SOURCE = ROOT / 'prototype/public/assets/m1/m1-uniform-skirt.glb'
TOPOLOGY = ROOT / 'experiments/skirt-offline-corrective/source-topology.json'
SOLVER = ROOT / 'prototype/src/m1-skirt.js'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
t = json.loads(TOPOLOGY.read_text(encoding='utf-8'))
assert sha(SOURCE) == t['sha256'], 'Stale topology: rerun source audit, then review'
p, tri = t['hipLocalPosition'], t['triangles']
sub = lambda a, b: [x-y for x, y in zip(a, b)]
dot = lambda a, b: sum(x*y for x, y in zip(a, b))
norm = lambda a: math.sqrt(dot(a, a))
cross = lambda a, b: [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def smooth(x):
    x = min(1, max(0, x))
    return x*x*(3-2*x)
def stats(values):
    values = sorted(values)
    return {'min': values[0], 'p50': values[len(values)//2], 'p95': values[int((len(values)-1)*.95)], 'max': values[-1]}
edges = set(tuple(sorted((a, b))) for face in tri for a,b in zip(face, face[1:]+face[:1]))
pins = [i for i, v in enumerate(p) if v[1] >= .09]
front = [smooth((.07-v[2])/.14) for v in p]
# A front-sector authoring mask; it is not the runtime's full drape mask.
# Zero change on every current pin. No assumption that skirt back can be hidden.
weights = [front[i]*smooth((.09-v[1])/.07) for i, v in enumerate(p)]
assert all(weights[i] == 0 for i in pins)
adj = collections.defaultdict(set)
for a,b in t['boundaryEdges']:
    adj[a].add(b); adj[b].add(a)
remaining = set(adj)
loops = []
while remaining:
    start = min(remaining); current = start; previous = None; ordered = []
    while current not in ordered:
        ordered.append(current)
        choices = sorted(adj[current] - ({previous} if previous is not None else set()))
        assert choices and len(adj[current]) == 2, 'Boundary is not a simple loop'
        previous, current = current, choices[0]
    assert current == start
    remaining.difference_update(ordered)
    loops.append({'indices': ordered, 'ySpanMeters': max(p[i][1] for i in ordered)-min(p[i][1] for i in ordered),
                  'frontIndices': [i for i in ordered if front[i] >= .5]})
render_groups = collections.defaultdict(list)
for r,w in enumerate(t['renderToWeld']): render_groups[w].append(r)
# Reproduce area-weighted computeVertexNormals in bind pose, not rendered pose.
normals = [[0.,0.,0.] for _ in t['renderToWeld']]
aspect=[]
for face, render_face in zip(tri, t['renderTriangles']):
    a,b,c = [p[i] for i in face]
    n = cross(sub(b,a),sub(c,a)); double_area = norm(n)
    lengths = [norm(sub(a,b)),norm(sub(b,c)),norm(sub(c,a))]
    aspect.append(max(lengths)**2 / double_area)
    for r in render_face: normals[r] = [x+y for x,y in zip(normals[r],n)]
normals = [[x/max(norm(n),1e-20) for x in n] for n in normals]
seam_angles=[]
for group in render_groups.values():
    if len(group)>1:
        seam_angles.append(max(math.degrees(math.acos(min(1,max(-1,dot(normals[a],normals[b]))))) for a in group for b in group))
cap_faces = [i for i,f in enumerate(tri) if set(f).issubset(pins) and 2 in f]
report = {
 'status':'offline-source-and-formula-review-not-runtime-acceptance',
 'sourceSha256':sha(SOURCE),'topologySha256':sha(TOPOLOGY),'solverSha256':sha(SOLVER),
 'vertices':len(p),'renderVertices':len(t['renderToWeld']),'triangles':len(tri),'edges':len(edges),
 'pinnedVertices':len(pins),'pinnedWaistFanFacesSharingVertex2':cap_faces,
 'boundaryLoops':loops,
 'triangleLongestEdgeToCorrespondingAltitude':stats(aspect),
 'splitPositionGroups':sum(len(g)>1 for g in render_groups.values()),
 'bindRecomputedSplitNormalAngleDegrees':stats(seam_angles),
 'frontGuideAdjacentDelta':stats([abs(front[a]-front[b]) for a,b in edges]),
 'hemFrontGuideRange':stats([front[i] for loop in loops for i in loop['frontIndices']]),
 'limits':['Normal seam metric uses bind pose, not the c9 posed frame.',
           'The boundary is the real source hem; no changed mesh or collision result is generated.',
           'Guide branch discontinuity is a code fact; causal size in c9 remains unmeasured.']}
contract = {'schema':'zbgs-skirt-authored-front-region-v1','status':'authoring-input-only-no-target-positions',
 'sourceSha256':sha(SOURCE),'solverSha256':sha(SOLVER),
 'coordinate':'original hips bind local, meters; these are reference coordinates only',
 'pinnedWeldedIndices':pins,'renderToWeld':t['renderToWeld'],
 'hemLoops':[loop['indices'] for loop in loops],
 'frontWeight':weights,'referenceHipLocalPosition':p,
 'requiredTargetInput':'Same-build real seated and mid-transition posed body, thigh axes, chair OBBs, and skirt points with action clock. Do not fit to synthetic bone angles.',
 'constraints':['All current waist pins unchanged.', 'No UV/index/material/body change.',
                'Use editable low-frequency front hem and lap controls; not iterative smoothing of collision displacement.',
                'Preserve current real thigh/chair final contact checks; reject if correction restores spikes or contact regresses.']}
OUT.mkdir(parents=True,exist_ok=True)
for name,data in [('source-guide-report.json',report),('front-region.json',contract)]:
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k != 'boundaryLoops'},ensure_ascii=False,indent=2))
