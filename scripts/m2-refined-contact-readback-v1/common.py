"""Inclusive official detection with retained child and original-parent identity."""
import hashlib
import importlib.metadata
import json
from pathlib import Path

import igl.copyleft.cgal as cgal
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-refined-contact-readback-v1'


def require(condition,message):
    if not condition: raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reference(path):
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def clean(value):
    if isinstance(value,np.generic): return clean(value.item())
    if isinstance(value,np.ndarray): return clean(value.tolist())
    if isinstance(value,dict): return {k:clean(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)): return [clean(v) for v in value]
    return value


def save(path,value):
    path.write_bytes((json.dumps(clean(value),indent=2,allow_nan=False)+'\n').encode())


def pinned(ref):
    path=ROOT/ref['path'];require(digest(path)==ref['sha256'],'Pinned input differs: '+ref['path']);return path


def decoded_pairs(values,faces_a,faces_b):
    require(len(values)==5,'Official binding must return five actual arrays; no undocumented success slot')
    require(all(np.asarray(v).size==0 for v in values[1:]),'detect_only unexpectedly returned remeshing arrays')
    pairs=np.asarray(values[0])
    require(np.issubdtype(pairs.dtype,np.integer),'Unexpected noninteger native pair indices')
    pairs=pairs.reshape(-1,2).astype(np.int64)
    require(not len(pairs) or (pairs.min()>=0 and pairs[:,0].max()<len(faces_a) and pairs[:,1].max()<len(faces_b)), 'Native pair index outside query')
    # Preserve every native row, including duplicates if a binding ever supplies them.
    return pairs[np.lexsort((pairs[:,1],pairs[:,0]))] if len(pairs) else pairs


def detect(points_a,faces_a,points_b,faces_b):
    A=np.ascontiguousarray(points_a,dtype=np.float64)
    B=np.ascontiguousarray(points_b,dtype=np.float64)
    FA=np.ascontiguousarray(faces_a,dtype=np.int64)
    FB=np.ascontiguousarray(faces_b,dtype=np.int64)
    require(A.ndim==B.ndim==2 and A.shape[1]==B.shape[1]==3 and np.isfinite(A).all() and np.isfinite(B).all(),'Finite Nx3 geometry required')
    require(FA.ndim==FB.ndim==2 and FA.shape[1]==FB.shape[1]==3,'Only indexed triangles supported')
    require(not len(FA) or (FA.min()>=0 and FA.max()<len(A)),'A vertex index outside input')
    require(not len(FB) or (FB.min()>=0 and FB.max()<len(B)),'B vertex index outside input')
    values=cgal.intersect_other(A,FA,B,FB,detect_only=True,first_only=False,stitch_all=False,
        slow_and_more_precise_rounding=False,cutoff=1000)
    return decoded_pairs(values,FA,FB)


def topology(spec):
    archive=np.load(pinned(spec['sourceFace']),allow_pickle=False)
    provenance=json.loads(pinned(spec['sourceProvenance']).read_bytes())
    P=archive['newPosition'];D=archive['newDelta'];F=archive['newTriangles'].astype(np.int64)
    parent=archive['parentTriangle'].astype(np.int64);bary=archive['parentBary']
    coarse=archive['sourceTriangles'].astype(np.int64);source=archive['sourcePosition']
    require(P.shape==(7251,3) and D.shape==(54,7251,3) and F.shape==(12672,3),'Wrong sealed refined Face dimensions')
    require(parent.shape==(12672,) and bary.shape==(12672,3,3) and coarse.shape==(3168,3),'Missing child-parent lineage')
    require(F.min()>=0 and F.max()<7251 and parent.min()>=0 and parent.max()<3168,'Source index outside lineage domain')
    require(len(provenance['parentTriangles'])==3168 and not provenance['coordinateWelded'],'Unexpected parent table or coordinate weld')
    require(np.array_equal(P[F],np.einsum('nij,njk->nik',bary,source[coarse[parent]])),'Child source positions differ from original-parent barycentric lineage')
    require(np.array_equal(np.bincount(parent,minlength=3168),np.full(3168,4)),'Original parent does not have exact four children')
    roles={}
    for consumer in provenance['consumers']:
        role=consumer['material'].removeprefix('M00_000_00_')
        source_ids=np.array([i for i,r in enumerate(provenance['parentTriangles']) if r['material']==consumer['material']],int)
        ids=np.flatnonzero(np.isin(parent,source_ids))
        require(len(ids)==4*len(source_ids),'Consumer child partition incomplete')
        require(all(provenance['parentTriangles'][i]['mesh']==consumer['mesh'] and
            provenance['parentTriangles'][i]['primitive']==consumer['primitive'] for i in source_ids),'Ambiguous material/parent consumer')
        roles[role]={'consumer':consumer,'childIds':ids,'vertexIds':np.unique(F[ids]),'sourceParentIds':source_ids}
    joined=np.concatenate([r['childIds'] for r in roles.values()])
    require(len(joined)==12672 and len(np.unique(joined))==12672,'Roles overlap or miss child triangles')
    corrected=np.unique(np.concatenate([roles[r]['vertexIds'] for r in spec['negativeEyeJoyCorrectedRoles']]))
    other=np.unique(np.concatenate([r['vertexIds'] for name,r in roles.items() if name not in spec['negativeEyeJoyCorrectedRoles']]))
    require(not np.intersect1d(corrected,other).size,'Refined vertex crosses opposite expression-compensation lanes')
    return {'P':P,'D':D,'F':F,'parent':parent,'bary':bary,'coarse':coarse,'source':source,
        'edges':archive['newPointEdges'],'provenance':provenance,'roles':roles,'correctedVertexIds':corrected}


def endpoint_identity(t,child):
    parent=int(t['parent'][child]);row=t['provenance']['parentTriangles'][parent]
    return {'childGroupTriangle':int(child),'refinedVertexIds':t['F'][child].tolist(),
        'originalGroupParentTriangle':parent,'parent':row,'originalParentVertexIds':t['coarse'][parent].tolist(),
        'parentBary':t['bary'][child].tolist()}


def pair_record(t,points,child_a,child_b):
    a,b=t['F'][child_a],t['F'][child_b]
    A,B=points[a],points[b]
    coincident=np.argwhere(np.all(A[:,None,:]==B[None,:,:],axis=2))
    def sorted_points(P): return P[np.lexsort((P[:,2],P[:,1],P[:,0]))]
    return {'a':endpoint_identity(t,child_a),'b':endpoint_identity(t,child_b),
        'sharedRefinedVertexIds':np.intersect1d(a,b).tolist(),
        'sharedOriginalParentVertexIds':np.intersect1d(t['coarse'][t['parent'][child_a]],t['coarse'][t['parent'][child_b]]).tolist(),
        'exactCoincidentVertexCornerPairs':coincident.tolist(),
        'exactCoincidentRepresentedTriangles':bool(np.array_equal(sorted_points(A),sorted_points(B))),
        'classificationMeaning':'Index sharing is actual topology. Exact represented-coordinate equality is a separate observation and does not weld distinct IDs.',
        'intersectionDimension':'not returned by detect_only; point/edge/coplanar/penetration not classified',
        'filtered':False}


def compare_pairs(t,source_pairs,candidate_pairs):
    old=set(map(tuple,np.asarray(source_pairs,dtype=int).reshape(-1,2)))
    new=set(map(tuple,np.asarray(candidate_pairs,dtype=int).reshape(-1,2)))
    added=sorted(new-old);removed=sorted(old-new)
    parent_key=lambda pair:(int(t['parent'][pair[0]]),int(t['parent'][pair[1]]))
    old_parent={parent_key(p) for p in old};new_parent={parent_key(p) for p in new}
    return {'addedChildPairs':added,'removedChildPairs':removed,'persistedChildPairs':sorted(old&new),
        'addedParentPairs':sorted(new_parent-old_parent),'removedParentPairs':sorted(old_parent-new_parent),
        'addedChildPairsWithinAlreadyPresentParentPairs':[p for p in added if parent_key(p) in old_parent],
        'sourceUniqueChildCount':len(old),'candidateUniqueChildCount':len(new),
        'meaning':'Compare the same child topology first. Parent aggregation only groups provenance; it never erases a new child event or proves penetration/visual validity.'}


def query(t,points,role_a,role_b):
    require(points.shape==t['P'].shape and np.isfinite(points).all(),'Geometry does not match exact refined source topology')
    ids_a=t['roles'][role_a]['childIds'];ids_b=t['roles'][role_b]['childIds']
    native=detect(points,t['F'][ids_a],points,t['F'][ids_b])
    global_pairs=[];rows=[]
    for i,j in native:
        a,b=int(ids_a[i]),int(ids_b[j]);global_pairs.append((a,b))
        row=pair_record(t,points,a,b)
        row['a']['queryLocalTriangle']=int(i);row['b']['queryLocalTriangle']=int(j)
        rows.append(row)
    return {'roleA':role_a,'roleB':role_b,'nativeRowCount':len(native),'childPairs':global_pairs,
        'nativeDuplicateRowCount':len(native)-len(set(global_pairs)),'hits':rows,'filteredRows':0,
        'kernel':'Official detect_only double-input CGAL Epick per pinned source/API smoke',
        'semantics':'Inclusive triangle intersection, including represented point/edge/coplanar contact',
        'admissible':False}
