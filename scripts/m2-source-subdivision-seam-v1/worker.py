"""One original-source call per real POSITION group; no G, no export."""
import ast
from collections import Counter,defaultdict
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import sys
import time
import numpy as np
import igl
from scipy.sparse import save_npz
from scipy.spatial.transform import Rotation as R
from contact_seam import synthetic_checks
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'assets-source/m2-source-subdivision-seam-v1';OUT=BASE/'generated'
def module(path,name):
    s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
io=module('scripts/m2-axial-head-evaluation-v1/source.py','seam_source_io');save=io.save
def extract(path,name,env):
    t=ast.parse((ROOT/path).read_bytes());f=next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name==name)
    exec(compile(ast.Module([f],[]),path,'exec'),env);return env[name]
def edge_info(F):
    e=np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1)
    return np.unique(e,axis=0,return_counts=True)
def main():
    started=time.monotonic();spec=json.loads((BASE/'spec.json').read_bytes())
    for r in spec['inputs']:assert io.sha(ROOT/r['path'])==r['sha256'],r['path']
    old=json.loads((ROOT/'assets-source/m2-axial-head-evaluation-v1/spec.json').read_bytes())
    g,inv=io.load(old);records,endpoints,groups,unused=io.source_records(g,inv)
    groups=sorted(groups,key=lambda r:r['positionAccessor'])
    rows=[];data={};calls=0
    transform=extract('scripts/m1c/fit-source-grip.py','transform',{'np':np,'R':R})
    nodes=g.doc['nodes'];local=np.array([transform(x) for x in nodes])
    parents={c:i for i,x in enumerate(nodes) for c in x.get('children',[])}
    human={x['bone']:x['node'] for x in g.doc['extensions']['VRM']['humanoid']['humanBones']}
    pose_defs=[('source-rest',{}),('raw-head-yaw20-neck-pitch10',{'head':('y',20),'neck':('x',10)}),
        ('raw-eyes-yaw10',{'leftEye':('y',10),'rightEye':('y',10)})]
    worlds=[]
    for name,edits in pose_defs:
        loc=local.copy()
        for sem,(axis,deg) in edits.items():
            k=human[sem];loc[k,:3,:3]=loc[k,:3,:3]@R.from_euler(axis,deg,degrees=True).as_matrix()
        cache={}
        def at(i):
            if i not in cache:cache[i]=(at(parents[i]) if i in parents else np.eye(4))@loc[i]
            return cache[i]
        worlds.append(np.array([at(i) for i in range(len(nodes))]))
    for group in groups:
        accessor=group['positionAccessor'];tag=str(accessor);refs=group['references'];attrs=refs[0]['attributes']
        assert all(r['attributes']==attrs and r['targetSignatures']==group['targets'] for r in refs)
        P=g.acc(accessor).astype(float);n=len(P);morphs=group['targets']
        D=np.array([g.acc(t['POSITION']).astype(float) for t in morphs]) if morphs else np.empty((0,n,3))
        fs=[];parent_meta=[]
        for ci,r in enumerate(refs):
            f=g.acc(r['indexAccessor']).reshape(-1,3).astype(np.int64);fs.append(f)
            parent_meta.extend([{'mesh':r['mesh'],'primitive':r['primitive'],'material':r['material'],
                'consumer':ci,'triangle':i} for i in range(len(f))])
        F=np.concatenate(fs);E,C=edge_info(F)
        assert not (C>2).any() and len(np.unique(np.sort(F,axis=1),axis=0))==len(F),('nonmanifold',accessor)
        S,NF=igl.upsample_matrix(F,n);calls+=1;S=S.tocsr();NF=np.asarray(NF,dtype=np.int64);nn=S.shape[0]
        assert np.array_equal(S.indptr[:n+1],np.arange(n+1))
        assert np.array_equal(S.indices[:n],np.arange(n)) and np.array_equal(S.data[:n],np.ones(n))
        newedges=[]
        for k in range(n,nn):
            ids=S.indices[S.indptr[k]:S.indptr[k+1]];vals=S.data[S.indptr[k]:S.indptr[k+1]]
            assert len(ids)==2 and np.array_equal(vals,[.5,.5]);newedges.append(sorted(ids.tolist()))
        newedges=np.array(newedges,dtype=np.int64);edge_to_new={tuple(e):n+i for i,e in enumerate(newedges)}
        assert len(edge_to_new)==len(E) and set(edge_to_new)==set(map(tuple,E))
        parent_bary=np.empty((len(NF),3,3))
        for i,f in enumerate(F):
            for ci,c in enumerate(NF[4*i:4*i+4]):
                sub=S[c]
                assert set(sub.indices)<=set(f)
                parent_bary[4*i+ci]=sub[:,f].toarray()
        Q=S@P;ND=np.array([S@d for d in D]) if len(D) else np.empty((0,nn,3))
        assert np.array_equal(Q[:n],P) and np.array_equal(ND[:,:n],D)
        endpoint_error=max([float(abs(S@(P+d)-(Q+ND[i])).max()) for i,d in enumerate(D)]+[0.])
        node=next(x for x in nodes if x.get('mesh')==refs[0]['mesh']);skin=g.doc['skins'][node['skin']]
        ji=g.acc(attrs['JOINTS_0']).astype(int);w=g.acc(attrs['WEIGHTS_0']).astype(float)
        dense=np.zeros((n,len(skin['joints'])))
        for k in range(4):np.add.at(dense,(np.arange(n),ji[:,k]),w[:,k])
        wd=S@dense;counts=(wd>0).sum(1);over=np.flatnonzero(counts>4)
        overflow=[]
        for v in over:
            original_ids=newedges[v-n] if v>=n else [int(v)]
            overflow.append({'vertex':int(v),'sourceIDs':list(map(int,original_ids)),
                'sourceParentTriangles':np.flatnonzero(np.isin(F,original_ids).sum(1)==len(original_ids)).tolist(),
                'influences':[{'jointIndex':int(j),'node':skin['joints'][j],'name':nodes[skin['joints'][j]].get('name'),
                    'weight':float(wd[v,j])} for j in np.flatnonzero(wd[v]>0)]})
        save(OUT/f'overflow-{tag}.json',overflow)
        continuous={k:S@g.acc(v).astype(float) for k,v in attrs.items() if k not in {'POSITION','JOINTS_0','WEIGHTS_0'}}
        invbind=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
        lbs=[];lbs_errors=[];palettes=[]
        for (pose,_),world in zip(pose_defs,worlds):
            pal=world[skin['joints']]@invbind
            def skinned(points,weights):
                ans=np.zeros_like(points);hom=np.c_[points,np.ones(len(points))]
                for j in np.flatnonzero((weights>0).any(0)):ans+=(hom@pal[j].T)[:,:3]*weights[:,j,None]
                return ans
            error=np.linalg.norm(skinned(Q,wd)-S@skinned(P,dense),axis=1);worst=int(error.argmax())
            lbs.append({'pose':pose,'maxErrorM':float(error.max()),'worstNewVertex':worst,
                'sourceEdge':newedges[worst-n].tolist() if worst>=n else None,
                'countAbove1e12':int((error>1e-12).sum()),'recordedAnimation':False})
            lbs_errors.append(error);palettes.append(pal)
        np.savez_compressed(OUT/f'group-{tag}.npz',sourcePosition=P,sourceDelta=D,sourceTriangles=F,
            newPosition=Q,newDelta=ND,newTriangles=NF,newPointEdges=newedges,parentBary=parent_bary,
            parentTriangle=np.repeat(np.arange(len(F)),4),sourceJointIDs=ji,sourceWeights=w,
            sourceDenseWeights=dense,newDenseWeights=wd,skinJointNodes=skin['joints'],
            inverseBindMatrices=invbind,sourceNodeLocalMatrices=local,lbsErrorsM=lbs_errors,posePalettes=palettes,
            **{'source_'+k:g.acc(v) for k,v in attrs.items() if k not in {'POSITION','JOINTS_0','WEIGHTS_0'}},
            **{'new_'+k:v for k,v in continuous.items()})
        save_npz(OUT/f'S-{tag}.npz',S)
        save(OUT/f'provenance-{tag}.json',{'consumers':refs,'parentTriangles':parent_meta,
            'targetSignatures':morphs,'oldIDsUnchanged':True,'coordinateWelded':False,'jointTruncation':False})
        area=lambda pp,ff:np.cross(pp[ff[:,1]]-pp[ff[:,0]],pp[ff[:,2]]-pp[ff[:,0]])
        area_error=float(abs(area(Q,NF)-np.repeat(area(P,F)/4,4,axis=0)).max())
        row={'accessor':accessor,'consumers':len(refs),'sourceVertices':n,'newVertices':nn,
            'sourceTriangles':len(F),'newTriangles':len(NF),'morphTargets':len(D),
            'oldPositionsAndDeltasExact':True,'allTargetsSameS':True,'endpointResidualM':endpoint_error,
            'maxAreaCrossErrorM2':area_error,'maxInfluences':int(counts.max()),
            'influenceHistogram':dict(Counter(map(int,counts))), 'newPointInfluenceHistogram':dict(Counter(map(int,counts[n:]))),
            'over4Count':len(over),'over4Vertices':over.tolist(),'maxWeightSumError':float(abs(wd.sum(1)-1).max()),
            'lbs':lbs,'edgeManifold':True,'parentBarySaved':True}
        new_unique_edges,_=edge_info(NF)
        rows.append(row);data[accessor]={'Q':Q,'wd':wd,'skin':skin,'edge_to_new':edge_to_new,'NF':NF,'n':n,'P':P,'F':F,'E':E,'C':C,
            'newEdgeSet':set(map(tuple,new_unique_edges))}
    # Read sealed 41 source-coordinate edge correspondences, verify both midpoint lattices.
    oldseams=json.loads((ROOT/'assets-source/m2-face-subdivision-preflight-v1/generated/face-body-seams.json').read_bytes())
    seamrows=[]
    for pair in oldseams['exactBoundaryEdgeMatches']:
        fe=tuple(pair['faceEdge']);fn=data[21]['edge_to_new'][tuple(sorted(fe))]
        for be in pair['bodyEdges']:
            bn=data[7]['edge_to_new'][tuple(sorted(be))]
            face_w={data[21]['skin']['joints'][j]:float(data[21]['wd'][fn,j]) for j in np.flatnonzero(data[21]['wd'][fn]>0)}
            body_w={data[7]['skin']['joints'][j]:float(data[7]['wd'][bn,j]) for j in np.flatnonzero(data[7]['wd'][bn]>0)}
            def has_halves(group,edge,mid):
                es=group['newEdgeSet']
                return all(tuple(sorted((int(v),mid))) in es for v in edge) and tuple(sorted(edge)) not in es
            seamrows.append({'faceEdge':list(fe),'bodyEdge':be,'faceMidpoint':fn,'bodyMidpoint':bn,
                'midpointDifferenceM':float(np.linalg.norm(data[21]['Q'][fn]-data[7]['Q'][bn])),
                'faceNodeWeights':face_w,'bodyNodeWeights':body_w,'nodeWeightsExactlyEqual':face_w==body_w,
                'bothHalvesPresentNoUnsplitParentEdge':has_halves(data[21],fe,fn) and has_halves(data[7],be,bn),
                'sourceMorphSeamZero':pair['maximumSourceMorphOffsetM']==0})
    save(OUT/'cross-accessor-seams.json',seamrows)
    assert len(seamrows)==41 and all(x['midpointDifferenceM']==0 and x['bothHalvesPresentNoUnsplitParentEdge'] for x in seamrows)
    legacy=extract('scripts/m2-hairstyle-v1/check-head-space.py','segment_hits',{'np':np})
    checks=synthetic_checks(legacy);save(OUT/'synthetic-contact-classification.json',checks)
    result={'schema':'source-subdivision-seam-result-v1','status':'hold-before-G',
        'officialCalls':calls,'libiglVersion':importlib.metadata.version('libigl'),'groups':rows,
        'crossAccessorEdges':len(seamrows),'midpointsExact':True,'noTNodesAt41DeclaredSeams':True,
        'sameNodeWeightsOnAll41':all(x['nodeWeightsExactlyEqual'] for x in seamrows),
        'over4Total':sum(x['over4Count'] for x in rows),
        'syntheticParentClassificationPassed':True,'artificialInteriorSourceEdgeStillUnresolved':True,
        'GCalled':False,'candidateContactsExecuted':False,'exported':False,'runtimeChanged':False,
        'seconds':time.monotonic()-started,
        'limitations':['Cross-accessor exact sampling closure is original-source only; no G output has been tested.',
        'Source LBS diagnostic poses are explicit raw-bone tests, not recorded runtime animation.',
        'Parent-aware helper retains unresolved artificial source-interior-edge events; full candidate admission is not ready.']}
    save(OUT/'result.json',result);print(json.dumps(io.clean(result)))
try:main()
except Exception as exc:
    save(OUT/'failure.json',{'exception':type(exc).__name__,'message':str(exc),'GCalled':False});raise
