"""Read sealed BMesh topology outputs. Never import bpy or create geometry."""
import collections
import hashlib
import json
from pathlib import Path
import sys
import time
sys.dont_write_bytecode = True
import numpy as np
from scipy.sparse import csr_matrix
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'assets-source/m2-boundary-refinement-api-recovery-v1'
OLD = ROOT / 'assets-source/m2-source-subdivision-seam-v1/generated'
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB
pins = {}


def read(path):
    path = Path(path)
    if not path.is_absolute(): path = ROOT / path
    raw = path.read_bytes()
    pins[path.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
    return raw


def doc(path): return json.loads(read(path))


def arrays(path):
    read(path)
    with np.load(path, allow_pickle=False) as z: return {k:z[k] for k in z.files}


def edges(faces):
    return {tuple(sorted((int(a),int(b)))) for tri in faces for a,b in zip(tri,np.roll(tri,-1))}


started = time.monotonic()
manifest = doc(BASE / 'package-files.json')
for row in manifest:
    raw = read(row['path'])
    assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256'],row['path']
spec = doc(BASE / 'spec.json')
assert pins[(BASE / 'spec.json').relative_to(ROOT).as_posix()] == 'f3614abd0a19e6a0e704c789a407d4e2c2372be30dd2ea8b032e9a1dd746dad9'
for row in spec['inputs']:
    assert hashlib.sha256(read(row['path'])).hexdigest()==row['sha256']
source_path = ROOT / 'prototype/public/assets/foundation/base-male-roundtrip.vrm'
source = read(source_path);assert hashlib.sha256(source).hexdigest()==spec['sourceSHA256']
g = GLB(source);acc=lambda k:np.asarray(g.accessor(k))
z = arrays(BASE / 'generated/body-arrays.npz')
csr = arrays(BASE / 'generated/S-body-csr.npz')
S = csr_matrix((csr['data'],csr['indices'],csr['indptr']),shape=tuple(csr['shape']))
P=acc(7).astype(float);n=len(P);assert n==7855 and S.shape==(7896,n)
F=np.concatenate([acc(p['indices']).reshape(-1,3) for p in g.doc['meshes'][0]['primitives']]).astype(int)
assert F.shape==(12008,3) and np.array_equal(F,z['sourceTriangles'])
assert all(not p.get('targets') for p in g.doc['meshes'][0]['primitives'])
for name,key in [('sourcePosition',7),('sourceNORMAL',8),('sourceUV',9),('sourceJointIDs',10),('sourceWeights',11)]:
    assert np.array_equal(z[name],acc(key))
fixed = doc('evidence/m2-boundary-refinement-method-review-v1/readback.json')
selected = sorted(tuple(sorted(row['sourceEdge'])) for row in fixed['requiredBodyEdges'])
affected = {row['sourceTriangle'] for row in fixed['adjacentParentTriangles']}
assert len(selected)==41 and len(set(selected))==41 and len(affected)==39
assert np.array_equal(z['newPointEdges'],np.asarray(selected))
assert np.array_equal(csr['indptr'],np.r_[np.arange(n+1),n+2*np.arange(1,42)])
assert np.array_equal(csr['indices'],np.r_[np.arange(n),np.asarray(selected).ravel()])
assert np.array_equal(csr['data'],np.r_[np.ones(n),np.full(82,.5)])
for name,key in [('newPosition',7),('newNORMAL',8),('newUV',9)]:assert np.array_equal(z[name],S@acc(key).astype(float))
assert np.array_equal(z['newJointIDs'][:n],acc(10)) and np.array_equal(z['newWeights'][:n],acc(11))
joint_nodes=np.asarray(g.doc['skins'][0]['joints'])
W=np.zeros((n,len(joint_nodes)))
for slot in range(4): np.add.at(W,(np.arange(n),acc(10)[:,slot].astype(int)),acc(11)[:,slot])
newW=S@W
assert np.array_equal(newW,z['newDenseWeights'])
rebuiltW=np.zeros_like(newW)
for slot in range(4):np.add.at(rebuiltW,(np.arange(len(newW)),z['newJointIDs'][:,slot]),z['newWeights'][:,slot])
assert np.array_equal(newW,rebuiltW) and np.max((newW[n:]>0).sum(1))==1 and np.max((newW>0).sum(1))<=4
assert np.array_equal(z['skinJointNodes'],joint_nodes)
assert np.array_equal(z['inverseBindMatrices'],acc(g.doc['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1))
local=np.repeat(np.eye(4)[None],len(g.doc['nodes']),axis=0)
for i,node in enumerate(g.doc['nodes']):
    assert not any(k in node for k in ['matrix','rotation','scale'])
    local[i,:3,3]=node.get('translation',[0,0,0])
assert np.array_equal(local,z['sourceNodeLocalMatrices'])
parents=z['parentTriangle'];NF=z['newTriangles'];bary=z['parentBary'];Q=z['newPosition']
assert len(NF)==12049 and set(parents)==set(range(len(F)))
counts=np.bincount(parents,minlength=len(F))
assert set(np.flatnonzero(counts>1))==affected
assert collections.Counter(counts[list(affected)])=={2:37,3:2}
for parent in range(len(F)):
    children=np.flatnonzero(parents==parent)
    if parent not in affected:assert len(children)==1 and np.array_equal(NF[children[0]],F[parent])
    for child in children:
        assert np.array_equal(Q[NF[child]],bary[child]@P[F[parent]])
        assert np.all(bary[child]>=0) and np.array_equal(bary[child].sum(1),np.ones(3))
# Check sparse support of every actual child vertex explicitly against its parent IDs.
for child, parent in enumerate(parents):
    for vertex in NF[child]:assert set(S.getrow(int(vertex)).indices)<=set(F[parent])
scale=np.linalg.det(bary[:,1:,1:]-bary[:,0,None,1:])
assert np.all(scale>0) and np.array_equal(np.bincount(parents,weights=scale,minlength=len(F)),np.ones(len(F)))
cross=lambda points,tris:np.cross(points[tris[:,1]]-points[tris[:,0]],points[tris[:,2]]-points[tris[:,0]])
old_cross=cross(P,F);new_cross=cross(Q,NF)
assert np.array_equal(new_cross,old_cross[parents]*scale[:,None])
provenance=doc(BASE/'generated/body-provenance.json')
assert provenance['affectedParents']==sorted(affected) and provenance['bodyMorphTargets']==0
old_provenance=doc(OLD/'provenance-7.json');assert provenance['original']==old_provenance
parent_materials=np.array([old_provenance['consumers'][row['consumer']]['materialIndex'] for row in old_provenance['parentTriangles']])
assert np.array_equal(z['materialIndices'],parent_materials[parents])
assert all(g.doc['materials'][parent_materials[p]]['name']=='M00_001_01_Body_00_SKIN' for p in affected)
original_edges=edges(F);new_edges=edges(NF)
assert all(edge in new_edges for edge in original_edges-set(selected))
for i,edge in enumerate(selected):
    midpoint=n+i;assert edge not in new_edges
    assert all(tuple(sorted((v,midpoint))) in new_edges for v in edge)
# Full geometric duplicate closure uses exact original coordinates and all original edges.
key=lambda edge:tuple(sorted(tuple(P[v]) for v in edge))
keys={key(edge) for edge in selected}
assert {edge for edge in original_edges if key(edge) in keys}==set(selected)
loops=doc(BASE/'generated/loop-uv-readback.json')
assert collections.Counter((r['parent'],r['vertex']) for r in loops)==collections.Counter((int(parent),int(v)) for tri,parent in zip(NF,parents) for v in tri)
loop_actual=np.asarray([r['actualUV'] for r in loops])
loop_expected=z['newUV'][[r['vertex'] for r in loops]]
loop_float64_error=float(abs(loop_actual-loop_expected).max())
assert np.array_equal(loop_actual,loop_expected.astype(np.float32))
assert np.array_equal(np.asarray([r['expectedUV'] for r in loops]),loop_expected.astype(np.float32))
face=arrays(OLD/'group-21.npz');faceSraw=arrays(OLD/'S-21.npz')
faceS=csr_matrix((faceSraw['data'],faceSraw['indices'],faceSraw['indptr']),shape=tuple(faceSraw['shape']))
faceprov=doc(OLD/'provenance-21.json');targets=faceprov['consumers'][0]['targetSignatures']
assert faceS.shape==(7251,2056) and len(targets)==54
assert np.array_equal(face['sourcePosition'],acc(21)) and np.array_equal(face['newPosition'],faceS@acc(21).astype(float))
for target,signature in enumerate(targets):
    assert np.array_equal(face['sourceDelta'][target],acc(signature['POSITION']))
    assert np.array_equal(face['newDelta'][target],faceS@acc(signature['POSITION']).astype(float))
face_edges=edges(face['newTriangles']);seams=doc(BASE/'generated/cross-accessor-seams.json')
original_seams=doc(OLD/'cross-accessor-seams.json')
assert len(seams)==41 and [tuple(sorted(r['bodyEdge'])) for r in seams]==[tuple(sorted(r['bodyEdge'])) for r in original_seams]
for seam in seams:
    b,f=seam['localBodyMidpointID'],seam['faceMidpoint']
    assert b==n+selected.index(tuple(sorted(seam['bodyEdge'])))
    assert np.array_equal(Q[b],face['newPosition'][f]) and not np.any(face['newDelta'][:,f])
    bw={int(joint_nodes[j]):float(newW[b,j]) for j in np.flatnonzero(newW[b])}
    fw={int(face['skinJointNodes'][j]):float(face['newDenseWeights'][f,j]) for j in np.flatnonzero(face['newDenseWeights'][f])}
    assert bw==fw
    for edge,midpoint,collection in [(seam['bodyEdge'],b,new_edges),(seam['faceEdge'],f,face_edges)]:
        assert tuple(sorted(edge)) not in collection and all(tuple(sorted((v,midpoint))) in collection for v in edge)
oldbody=arrays(OLD/'group-7.npz')
assert np.array_equal(z['posePalettes'],oldbody['posePalettes'])
pose_errors=[];seam_pose_errors=[]
for palette in z['posePalettes']:
    def lbs(points,weights,pal):
        result=np.zeros_like(points,dtype=float)
        for j in np.flatnonzero((weights>0).any(0)):
            result+=(points@pal[j,:3,:3].T+pal[j,:3,3])*weights[:,j,None]
        return result
    source_lbs=lbs(P,W,palette);actual_lbs=lbs(Q,newW,palette);expected_lbs=S@source_lbs
    pose_errors.append(float(np.linalg.norm(actual_lbs-expected_lbs,axis=1).max()))
    assert pose_errors[-1]<1e-12
    node_palette={int(node):palette[j] for j,node in enumerate(joint_nodes)}
    fp=np.stack([node_palette[int(node)] for node in face['skinJointNodes']])
    face_lbs=lbs(face['newPosition'],face['newDenseWeights'],fp)
    seam_pose_errors.append(max(float(np.linalg.norm(actual_lbs[r['localBodyMidpointID']]-face_lbs[r['faceMidpoint']])) for r in seams))
    assert seam_pose_errors[-1]==0
result=doc(BASE/'generated/result.json');lineage=result['body']['lineageRecovery']
assert len(lineage['originalWrapperValidAfterSubdivide'])==7855 and not any(lineage['originalWrapperValidAfterSubdivide'])
tags=lineage['newVertexInheritedIDs'];assert len(tags)==41
assert {tuple(sorted(v['sourceEdge'])) for v in tags}==set(selected)
assert len({v['assignedTag'] for v in tags})==41 and all(v['assignedTag']<0 for v in tags)
diagnostic=doc(BASE/'diagnostic/stages.json')
before=next(r for r in diagnostic if r['stage']=='triangle-and-attributes-created-before-subdivide')
after=next(r for r in diagnostic if r['stage']=='after-subdivide-before-triangulate')
assert all(v['isValid'] for v in before['oldVertexWrappers']) and not any(v['isValid'] for v in after['oldVertexWrappers'])
assert [v['sourceID'] for v in after['liveVertices']]==[1,2,3,2]
api=doc(BASE/'generated/api-tests.json');assert api['passed'] and len(api['tests'])==3
read(__file__)
summary={'schema':'boundary-api-recovery-independent-audit-v1','status':'no-new-topology-preflight-blocker',
    'manifestFileCount':len(manifest),'sourceSHA256':spec['sourceSHA256'],
    'body':{'oldPoints':7855,'newPoints':41,'totalPoints':7896,'oldTriangles':12008,'newTriangles':12049,
        'selectedEdges':41,'affectedParents':39,'unaffectedParentsExact':11969,'singleEdgeParents':37,'twoEdgeParents':2,
        'allSparseAttributeRowsExact':True,'oldRawJointSlotsWeightsExact':True,'IBMNodeMatricesExact':True,
        'newPointMaximumInfluences':1,'loopUVRecords':len(loops),'backendLoopUVVersusAuthoritativeFloat64MaximumError':loop_float64_error,
        'backendLoopUVEqualsFloat32Authoritative':True,'backendPositionMaximumErrorM':float(abs(z['backendPositions']-Q).max())},
    'face':{'reusedPoints':7251,'targets':54,'sharedSActualSourceReplayExact':True},
    'seams':{'count':41,'exactGeometricClosureChecked':True,'halfEdgesPresent':True,'fullNodeWeightsExact':True},
    'lbsMaximumErrorsM':pose_errors,'seamLBSMaximumErrorsM':seam_pose_errors,
    'api':{'oldBodyWrapperCount':7855,'oldValidAfterSubdivide':0,'newInheritedOriginalIDsRequireNegativeRetagging':True,
        'newNegativeTagsUnique':True,'originalPositiveIDRecoveryUniquenessSourceCodeReviewed':True,'nearestMatchingUsed':False},
    'BlenderRerun':False,'GCalled':False,'contactsRun':False,'exported':False,'seconds':time.monotonic()-started,
    'limitations':['Three stored LBS palettes are finite CPU poses, not recorded runtime animation.',
        'New internal edge/parent contact classification and post-G geometry remain untested.',
        'Topology preflight does not resolve the known mixed-oh mouth intersection.'],'pins':pins}
dest=OUT/'result.json'
if dest.exists():raise RuntimeError('Preserve existing audit result')
dest.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='pins'},ensure_ascii=False))
