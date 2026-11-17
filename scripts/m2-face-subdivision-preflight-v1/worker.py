"""One official S, shared across source attributes/54 morphs. No G/candidate contacts."""
import ast
from collections import Counter, defaultdict
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import sys
import time
import numpy as np
import igl
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as R
from scipy.sparse import save_npz

sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-face-subdivision-preflight-v1'
OUT=BASE/'generated'
def module(path,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
io=module('scripts/m2-axial-head-evaluation-v1/source.py','subdivision_source')
save=io.save
def extract(path,name,env):
    tree=ast.parse((ROOT/path).read_bytes())
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    exec(compile(ast.Module([node],[]),str(path), 'exec'),env)
    return env[name]
def edges(F):
    return np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1)
def edge_info(F):
    e,c=np.unique(edges(F),axis=0,return_counts=True)
    return e,c
def finite_max(x):return float(np.max(x)) if np.size(x) else 0.
def eqkey(p):return tuple(float(v) for v in p)
def coordedge(P,e):return tuple(sorted((eqkey(P[e[0]]),eqkey(P[e[1]]))))
def main():
    started=time.monotonic()
    spec=json.loads((BASE/'spec.json').read_bytes())
    for row in spec['inputs']:
        assert io.sha(ROOT/row['path'])==row['sha256'],row['path']
    original=json.loads((ROOT/'assets-source/m2-axial-head-evaluation-v1/spec.json').read_bytes())
    assert original['source']['sha256']==spec['sourceSHA256']
    g,inventory=io.load(original)
    records,endpoints,groups,unused=io.source_records(g,inventory)
    group=next(x for x in groups if x['positionAccessor']==21)
    refs=group['references'];assert len(refs)==9
    first=g.doc['meshes'][refs[0]['mesh']]['primitives'][refs[0]['primitive']]
    attr=first['attributes'];n=len(g.acc(21))
    assert n==2056 and all(r['attributes']==attr for r in refs)
    assert all(r['targetSignatures']==group['targets'] for r in refs)
    P=g.acc(21).astype(float)
    delta=np.array([g.acc(t['POSITION']).astype(float) for t in group['targets']])
    assert delta.shape==(54,n,3)
    frows=[];parent=[];consumer=[]
    for ci,r in enumerate(refs):
        f=g.acc(r['indexAccessor']).reshape(-1,3).astype(np.int64)
        e,c=edge_info(f)
        frows.append(f)
        parent.extend([{'consumer':ci,'mesh':r['mesh'],'primitive':r['primitive'],
            'material':r['material'],'triangle':i} for i in range(len(f))])
        consumer.append({**r,'triangles':len(f),'sourceBoundaryEdges':int((c==1).sum()),
            'nonmanifoldEdges':e[c>2].tolist()})
    F=np.concatenate(frows);E,counts=edge_info(F)
    duplicate_faces=len(F)-len(np.unique(np.sort(F,axis=1),axis=0))
    topology={'vertices':n,'triangles':len(F),'edges':len(E),
        'boundaryEdges':int((counts==1).sum()),'nonmanifoldEdges':E[counts>2].tolist(),
        'duplicateUnorientedFaces':duplicate_faces,'consumers':consumer}
    save(OUT/'source-topology.json',topology)
    if (counts>2).any() or duplicate_faces:
        save(OUT/'result.json',{'status':'blocked-source-topology','topology':topology,'officialCalls':0})
        return
    # The only official subdivision call in this package.
    S,NF=igl.upsample_matrix(F,n)
    S=S.tocsr();NF=np.asarray(NF,dtype=np.int64);ns=S.shape[0]
    assert S.shape==(n+len(E),n) and NF.shape==(len(F)*4,3)
    assert np.array_equal(S[:n].toarray(),np.eye(n))
    source_edges=[]
    for i in range(n,ns):
        ids=S.indices[S.indptr[i]:S.indptr[i+1]]
        vals=S.data[S.indptr[i]:S.indptr[i+1]]
        assert len(ids)==2 and np.array_equal(vals,[.5,.5])
        source_edges.append(sorted(ids.tolist()))
    source_edges=np.array(source_edges,dtype=np.int64)
    assert np.array_equal(np.array(sorted(map(tuple,source_edges))),E)
    # Verify parent provenance independently from the expected row convention.
    for i,face in enumerate(F):
        for child in NF[4*i:4*i+4]:
            supports=set(S[child].indices.tolist())
            assert supports<=set(face.tolist())
    Pn=S@P;Dn=np.stack([S@d for d in delta])
    direct_error=max(finite_max(abs((S@(P+d))-(Pn+Dn[j])) ) for j,d in enumerate(delta))
    assert np.array_equal(Pn[:n],P) and np.array_equal(Dn[:,:n],delta)
    save_npz(OUT/'subdivision-matrix.npz',S)
    attributes={k:g.acc(v) for k,v in attr.items()}
    continuous={k:S@v.astype(float) for k,v in attributes.items() if k not in {'JOINTS_0','WEIGHTS_0','POSITION'}}
    assert not any(k.startswith('JOINTS_') and k!='JOINTS_0' for k in attr)
    face_node=next(i for i,x in enumerate(g.doc['nodes']) if x.get('mesh')==refs[0]['mesh'])
    skin=g.doc['skins'][g.doc['nodes'][face_node]['skin']]
    J=attributes['JOINTS_0'].astype(int);W=attributes['WEIGHTS_0'].astype(float)
    dense=np.zeros((n,len(skin['joints'])))
    for k in range(J.shape[1]):np.add.at(dense,(np.arange(n),J[:,k]),W[:,k])
    dense_new=S@dense; influence=(dense_new>0).sum(1)
    over=np.flatnonzero(influence>4)
    overrows=[{'newVertex':int(i),'sourceEdge':source_edges[i-n].tolist() if i>=n else None,
        'weights':[{'jointIndex':int(j),'node':skin['joints'][j],
        'name':g.doc['nodes'][skin['joints'][j]].get('name'), 'weight':dense_new[i,j]}
        for j in np.flatnonzero(dense_new[i]>0)]} for i in over]
    save(OUT/'weight-overflow.json',overrows)
    np.savez_compressed(OUT/'source-and-subdivision.npz',sourcePosition=P,sourceDelta=delta,
        sourceTriangles=F,subdividedPosition=Pn,subdividedDelta=Dn,subdividedTriangles=NF,
        newPointSourceEdges=source_edges,parentTriangle=np.repeat(np.arange(len(F)),4),
        sourceJointIDs=J,sourceWeights=W,sourceDenseWeights=dense,subdividedDenseWeights=dense_new,
        **{'source_'+k:v for k,v in attributes.items() if k!='POSITION'},
        **{'subdivided_'+k:v for k,v in continuous.items()})
    save(OUT/'provenance.json',{'consumers':consumer,'parentTriangles':parent,
        'childRule':'NF[4*p:4*p+4] parent=p; verified each child support is subset of parent',
        'oldPointIDs':'0..2055 remain unchanged','newPointRule':'row n+k = .5*(edge[k,0]+edge[k,1])',
        'sourceTargetSignatures':group['targets'],'sourceTargetNames':g.doc['meshes'][refs[0]['mesh']].get('extras',{}),
        'coordinateWelding':False,'jointTruncation':False})
    # Source index/coordinate seams: equality is evidence, never a welding instruction.
    ce=defaultdict(list)
    for e in E:ce[coordedge(P,e)].append(e.tolist())
    seams=[]
    for rows in ce.values():
        if len(rows)<2:continue
        ordered=[sorted(e,key=lambda j:eqkey(P[j])) for e in rows]
        a=np.array(ordered[0]);diff=[]
        for b in ordered[1:]:
            b=np.array(b)
            diff.append({'edge':b,'maximumMorphDifferenceM':finite_max(abs(delta[:,a]-delta[:,b])),
                'UVMaxDifference':finite_max(abs(attributes['TEXCOORD_0'][a]-attributes['TEXCOORD_0'][b])),
                'authorNMaxDifference':finite_max(abs(attributes['NORMAL'][a]-attributes['NORMAL'][b])),
                'jointWeightMaxDifference':finite_max(abs(dense[a]-dense[b]))})
        seams.append({'referenceEdge':a,'duplicates':diff})
    save(OUT/'index-coordinate-seams.json',seams)
    # Actual source Face--Body boundary relation, exact and <=2um candidate links distinct.
    body=next(x for x in groups if x['positionAccessor']==7)
    BP=g.acc(7).astype(float)
    BF=np.concatenate([g.acc(r['indexAccessor']).reshape(-1,3) for r in body['references']])
    BE,bc=edge_info(BF);BB=BE[bc==1];FB=E[counts==1]
    bm=defaultdict(list)
    for e in BB:bm[coordedge(BP,e)].append(e.tolist())
    matched=[]
    for e in FB:
        if coordedge(P,e) in bm:
            matched.append({'faceEdge':e.tolist(),'bodyEdges':bm[coordedge(P,e)],
                'maximumSourceMorphOffsetM':finite_max(abs(delta[:,e]))})
    facebound=np.unique(FB);bodybound=np.unique(BB)
    distances,nearest=cKDTree(BP[bodybound]).query(P[facebound])
    near=[{'faceVertex':int(i),'bodyVertex':int(bodybound[j]),'distanceM':float(d)}
        for i,j,d in zip(facebound,nearest,distances) if d<=2e-6]
    curves=json.loads((ROOT/'assets-source/m2-axial-shape-function-v1/generated/identity/curves.json').read_bytes())
    H=np.array(curves['headOriginM']);L=curves['supportL'];U=curves['supportU']
    for row in matched:
        ids=row['faceEdge']; yy=np.concatenate([P[ids,1],(P[ids][None]+delta[:,ids])[:,:,1].ravel()])-H[1]
        row['allEndpointAndEdgeYOutsideSupportSameSide']=bool(yy.max()<=L or yy.min()>=U)
        row['localYRange']=[float(yy.min()),float(yy.max())]
    save(OUT/'face-body-seams.json',{'exactBoundaryEdgeMatches':matched,
        'boundaryVerticesWithin2um':near,'faceBoundaryVertices':len(facebound),
        'bodyBoundaryVertices':len(bodybound),'nearestBoundaryDistanceRangeM':[float(distances.min()),float(distances.max())],
        'exactPositionComparisonsOnlyNotAttachmentSemantics':True,
        'GNotEvaluated':True,'supportMetadata':{'L':L,'U':U,'origin':H}})
    # Exact unchanged legacy predicate, synthetic parent/child boundary counterexamples.
    hit=extract('scripts/m2-hairstyle-v1/check-head-space.py','segment_hits',{'np':np})
    t=np.array([[0.,0.,0.],[2.,0.,0.],[0.,2.,0.]])
    a,b,c=t;ab=(a+b)/2;bc_=(b+c)/2;ca=(c+a)/2
    children=np.array([[a,ab,ca],[b,bc_,ab],[ab,bc_,ca],[bc_,c,ca]])
    start=np.array([.5,.5,-1.]);end=np.array([.5,.5,1.]);mid=(start+end)/2
    negatives={'parentHit':bool(hit(start,end,t[None])[0]),
        'childHits':hit(start,end,children).tolist(),
        'splitSegmentHitsParent':[bool(hit(start,mid,t[None])[0]),bool(hit(mid,end,t[None])[0])],
        'triangle':t,'children':children,'segment':[start,end],
        'meaning':'Same strict geometry can disappear at artificial child edge or split-segment endpoint. Zero child count alone cannot admit a candidate.',
        'candidateContactsExecuted':False,'thresholdsUnchanged':True}
    assert negatives['parentHit'] and not any(negatives['childHits']) and not any(negatives['splitSegmentHitsParent'])
    save(OUT/'strict-boundary-negative.json',negatives)
    # Reuse existing raw glTF FK/skin convention, no animation or runtime assumption.
    transform=extract('scripts/m1c/fit-source-grip.py','transform',{'np':np,'R':R})
    nodes=g.doc['nodes'];local=np.array([transform(x) for x in nodes])
    parents={c:i for i,x in enumerate(nodes) for c in x.get('children',[])}
    human={x['bone']:x['node'] for x in g.doc['extensions']['VRM']['humanoid']['humanBones']}
    inverse=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    poses=[('source-rest',{}),('raw-head-yaw20-neck-pitch10',{'head':('y',20),'neck':('x',10)}),
        ('raw-eyes-yaw10',{'leftEye':('y',10),'rightEye':('y',10)})]
    lbs=[];palettes=[];errors=[]
    for name,changes in poses:
        loc=local.copy();actual=[]
        for semantic,(axis,degrees) in changes.items():
            if semantic not in human:continue
            k=human[semantic];loc[k,:3,:3]=loc[k,:3,:3]@R.from_euler(axis,degrees,degrees=True).as_matrix()
            actual.append({'semantic':semantic,'node':k,'axis':axis,'degrees':degrees})
        cache={}
        def world(i):
            if i not in cache:cache[i]=(world(parents[i]) if i in parents else np.eye(4))@loc[i]
            return cache[i]
        pal=np.array([world(j) for j in skin['joints']])@inverse
        def skin_positions(pos,weights):
            result=np.zeros((len(pos),3));hom=np.c_[pos,np.ones(len(pos))]
            for j in np.flatnonzero((weights>0).any(0)):
                result+=(hom@pal[j].T)[:,:3]*weights[:,j,None]
            return result
        old=skin_positions(P,dense);new=skin_positions(Pn,dense_new)
        error=np.linalg.norm(new-S@old,axis=1);worst=int(np.argmax(error))
        lbs.append({'pose':name,'actualRawBoneEdits':actual,'maxInterpolationDifferenceM':float(error.max()),
            'worstVertex':worst,'sourceEdge':source_edges[worst-n].tolist() if worst>=n else None,
            'nonzeroAbove1e12':int((error>1e-12).sum()),'recordedAnimation':False})
        palettes.append(pal);errors.append(error)
    np.savez_compressed(OUT/'lbs-diagnostic.npz',palettes=palettes,interpolationErrorsM=errors,
        sourceInverseBindMatrices=inverse,sourceNodeLocalMatrices=local)
    save(OUT/'lbs-diagnostic.json',lbs)
    unsafe_seams=[x for x in matched if not x['allEndpointAndEdgeYOutsideSupportSameSide']]
    result={'schema':'face-subdivision-preflight-result-v1',
        'status':'blocked-consumption' if len(over) or unsafe_seams else 'source-subdivision-consumable-with-contact-validator-seam',
        'officialCalls':1,'libraryVersion':importlib.metadata.version('libigl'),
        'sourceVertices':n,'subdividedVertices':ns,'sourceTriangles':len(F),'subdividedTriangles':len(NF),
        'newEdgePoints':ns-n,'allNineConsumersCovered':True,'all54MorphsSameS':True,
        'oldPositionsAndDeltasExact':True,'directEndpointVsBasePlusDeltaMaxAbsM':direct_error,
        'sourceNonmanifoldEdges':int((counts>2).sum()),'duplicateFaces':duplicate_faces,
        'coincidentIndexEdgeGroups':len(seams),'jointInfluenceHistogram':dict(Counter(map(int,influence))),
        'newPointInfluenceHistogram':dict(Counter(map(int,influence[n:]))),
        'maximumInfluences':int(influence.max()),'over4Vertices':over.tolist(),
        'maximumWeightSumError':finite_max(abs(dense_new.sum(1)-1)),
        'exactFaceBodyBoundaryMatches':len(matched),'faceBodyUnsafeSupportEdges':unsafe_seams,
        'lbsDiagnostics':lbs,'strictArtificialBoundaryNegativeConfirmed':True,
        'blockers':['current child strict counting alone is not a valid unchanged-contact admission'],
        'GCalled':False,'candidateContactsExecuted':False,'exported':False,'runtimeChanged':False,
        'seconds':time.monotonic()-started}
    save(OUT/'result.json',result)
    print(json.dumps(io.clean(result)))

try:main()
except Exception as exc:
    save(OUT/'failure.json',{'exception':type(exc).__name__,'message':str(exc),'GCalled':False})
    raise
