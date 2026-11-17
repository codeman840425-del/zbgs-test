"""Sealed source/output geometry and saved spline readback; no solve/new G/export."""
import sys
sys.dont_write_bytecode=True
import importlib.util,json,hashlib
from pathlib import Path
import numpy as np
from scipy.interpolate import BSpline
ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).parent
if (BASE/'result.json').exists():raise ValueError('Refuse overwrite')
def load(path):return json.loads((ROOT/path).read_bytes())
def ref(path):return dict(path=path,sha256=hashlib.sha256((ROOT/path).read_bytes()).hexdigest())
s=importlib.util.spec_from_file_location('batch_face_glb',ROOT/'scripts/m2-male-face-v1/glb.py');module=importlib.util.module_from_spec(s);s.loader.exec_module(module);GLB=module.GLB
def get(g):
    p=next(p for name,p in g.primitives().items() if name.endswith('Face_00_SKIN'));P=g.acc(p['attributes']['POSITION']).astype(float);N=g.acc(p['attributes']['NORMAL']).astype(float);T=g.acc(p['indices']).astype(int).reshape(-1,3)
    skin=g.doc['skins'][0];ib=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4);node=next(x['node'] for x in g.doc['extensions']['VRM']['humanoid']['humanBones'] if x['bone']=='head');H=-ib[skin['joints'].index(node),3,:3].astype(float)
    return P,N,T,H
def envelope(P,T,low,high):
    edges=np.unique(np.sort(np.concatenate([T[:,[0,1]],T[:,[1,2]],T[:,[2,0]]]),axis=1),axis=0);A=P[edges[:,0]];B=P[edges[:,1]];dy=B[:,1]-A[:,1]
    ys=np.linspace(low,high,1001);w=[];carrier=[]
    for y in ys:
        t=(y-A[:,1])/np.where(abs(dy)>1e-12,dy,np.inf);q=A+t[:,None]*(B-A);valid=(t>=0)&(t<=1)&(abs(dy)>1e-12)&(q[:,2]<-.025)
        ids=np.flatnonzero(valid);assert len(ids)
        right=ids[np.argmax(q[ids,0])];left=ids[np.argmin(q[ids,0])];w.append((q[right,0]-q[left,0])/2);carrier.append(right)
    runs=[]
    for i,e in enumerate(carrier):
        if not runs or runs[-1]['edge']!=int(e):runs.append(dict(edge=int(e),start=i,end=i))
        else:runs[-1]['end']=i
    corners=[]
    for a,b in zip(runs,runs[1:]):
        ea,eb=edges[a['edge']],edges[b['edge']];shared=np.intersect1d(ea,eb)
        if len(shared)!=1:continue
        slopes=[(B[e,0]-A[e,0])/dy[e] for e in [a['edge'],b['edge']]]
        corners.append(dict(vertex=int(shared[0]),localXYZ=P[shared[0]].tolist(),edgeBelow=ea.tolist(),edgeAbove=eb.tolist(),angleChangeDegrees=float(abs(np.arctan(slopes[0])-np.arctan(slopes[1]))*180/np.pi),lowerRunYSpanM=float(ys[a['end']]-ys[a['start']]),upperRunYSpanM=float(ys[b['end']]-ys[b['start']])))
    return dict(y=ys.tolist(),halfWidthM=w,rightCarrierRunCount=len(runs),topCorners=sorted(corners,key=lambda x:-x['angleChangeDegrees'])[:6])
source_path='prototype/public/assets/foundation/base-female-roundtrip.vrm';source=GLB(ROOT/source_path);P0,N0,T0,H=get(source)
manifest=load('assets-source/m2-representative-batch-v2/generated/manifest.json');ids=['female-round-full-v2','female-square-athletic-v2','female-soft-wide-v2'];rows=[];curves={};pins=[ref(source_path),ref('scripts/m2-representative-batch-v2/deform.py'),ref('scripts/m2-representative-batch-v1/deform.py'),ref('evidence/m2-preset-visual-triage-v1/REVIEW.md')]
first=load('assets-source/m2-representative-batch-v2/generated/'+ids[0]+'/build-report.json')['faceCurve'];hi=first['normalizedYDomainM'][1]
sourceEnv=envelope(P0-H,T0,float((P0[np.unique(T0)]-H)[:,1].min()+1e-5),hi)
for ident in ids:
    m=next(x for x in manifest['variants'] if x['id']==ident);report=load(m['report']['path']);f=report['faceCurve'];g=GLB(ROOT/m['avatar']['path']);P,N,T,H1=get(g)
    assert np.array_equal(T,T0) and np.array_equal(H1,H) and P.shape==P0.shape
    spline=BSpline(f['knots'],f['coefficientsM'],f['degree']);curves[ident]=np.array(f['actualHalfWidthsM'])
    indices=np.unique(T);local=P-H;env=envelope(local,T,float(local[indices,1].min()+1e-5),hi)
    normals=N[indices]/np.linalg.norm(N[indices],axis=1)[:,None];oldN=N0[indices]/np.linalg.norm(N0[indices],axis=1)[:,None];angles=np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i',normals,oldN),-1,1)))
    cross=np.cross(P[T[:,1]]-P[T[:,0]],P[T[:,2]]-P[T[:,0]]);length=np.linalg.norm(cross,axis=1);gn=cross/length[:,None]
    cornerNormals=N[T]/np.linalg.norm(N[T],axis=2)[:,:,None];ng=np.degrees(np.arccos(np.clip(np.einsum('tci,ti->tc',cornerNormals,gn),-1,1)))
    changed={}
    for name,pr in source.primitives().items():
        if any(s in name for s in ['Eye','FaceMouth','FaceBrow']):
            q=g.primitives()[name];a=source.acc(pr['attributes']['POSITION']).astype(float);b=g.acc(q['attributes']['POSITION']).astype(float);ii=np.unique(source.acc(pr['indices'])).astype(int);changed[name]=float(np.linalg.norm(b[ii]-a[ii],axis=1).max())
    target=np.array(f['requestedHalfWidthsM']);actual=np.array(f['actualHalfWidthsM']);yy=np.array(f['sourceYMetres']);t=np.linspace(0,1,101)
    row=dict(id=ident,parameters=m['parameters'],vertices=len(P),skinVertices=len(indices),skinTriangles=len(T),sourceIndicesAndTopologyExact=True,outputActualContour=env,savedSpline={'maxProjectionLossM':float(abs(actual-target).max()),'maximumRequestedGrowthM':float((target-np.array(f['sourceHalfWidthsM'])).max()),'minSecondDerivative':float(spline(t,2).min()),'maxSecondDerivative':float(spline(t,2).max()),'sourceChinWidthM':f['sourceHalfWidthsM'][0],'fixedProjectedChinWidthM':float(actual[0]),'endBoundaryValueAndSlopePreserved':f['upperEyeBoundaryValueAndSlopePreserved'],'activeConcavitySamples':f['activeConcavityConstraints']},normalReadback={'maxAuthorNormalRotationDegrees':float(angles.max()),'medianAuthorNormalRotationDegrees':float(np.median(angles)),'unchangedNormalVertexCount':int(np.count_nonzero(np.max(abs(N[indices]-N0[indices]),axis=1)==0)),'maxAuthorVersusFacetNormalDegrees':float(ng.max()),'medianAuthorVersusFacetNormalDegrees':float(np.median(ng)),'normalsNotReplacedWithFlatFacets':bool(np.count_nonzero(ng>1)>len(T))},fixedFeatureDisplacementsM=changed)
    rows.append(row);pins.extend([ref(m['avatar']['path']),ref(m['report']['path']),ref('evidence/m2-preset-visual-triage-v1/'+ident+'/face-front-stage.png')])
pairs=[]
for i,a in enumerate(ids):
    for b in ids[i+1:]:pairs.append(dict(a=a,b=b,maximumSavedSplineHalfWidthDifferenceM=float(abs(curves[a]-curves[b]).max())))
result=dict(schema='batch-female-face-common-cause-readback-v1',source=ref(source_path),sourceGeometry=dict(vertices=len(P0),skinVertices=len(np.unique(T0)),skinTriangles=len(T0),contour=sourceEnv),variants=rows,pairwiseSavedSpline=pairs,pins=pins,newGExecuted=False,solverExecuted=False,exportExecuted=False,normalMeaning='Original authored shading normals compared to actual exported normals; facet-normal differences are diagnostics, not replacement targets')
(BASE/'result.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sourceTopCorners':sourceEnv['topCorners'][:2],'variants':[{'id':r['id'],'projection':r['savedSpline'],'normal':r['normalReadback'],'topCorners':r['outputActualContour']['topCorners'][:2]} for r in rows],'pairs':pairs},indent=2))
