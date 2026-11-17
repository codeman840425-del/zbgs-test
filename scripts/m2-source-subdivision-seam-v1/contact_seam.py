"""Parent-provenance classifier for finite noncoplanar segment candidates.

This is not a replacement collision framework. Original-parent-edge descendants
can be classified; artificial interior source edges remain explicit unresolved.
"""
import numpy as np
DET_EPS=1e-12
INNER_EPS=1e-7

def parent_edge_interval(source_bary):
    """Return original edge parameter of both endpoints, or None for interior edges."""
    b=np.asarray(source_bary,float)
    common=np.flatnonzero(np.all(b==0,axis=0))
    if len(common)!=1:return None
    remaining=[j for j in range(3) if j!=common[0]]
    return b[:,remaining[1]],int(common[0])

def classify(a,b,triangle,target_parent_bary,source_parent_bary):
    a,b,triangle=np.asarray(a,float),np.asarray(b,float),np.asarray(triangle,float)
    T=np.asarray(target_parent_bary,float);B=np.asarray(source_parent_bary,float)
    d=b-a;e1=triangle[1]-triangle[0];e2=triangle[2]-triangle[0]
    h=np.cross(d,e2);det=float(e1@h)
    row={'rawChildDeterminant':det,'detEpsilon':DET_EPS,'parentInnerEpsilon':INNER_EPS,
        'targetParentBaryMatrix':T.tolist(),'sourceParentBaryEndpoints':B.tolist()}
    if det==0 or not np.isfinite(det):return {**row,'status':'parallel-or-nonfinite','accepted':False}
    offset=a-triangle[0];u=float(offset@h/det)
    v=float(d@np.cross(offset,e1)/det);t=float(e2@np.cross(offset,e1)/det)
    row.update(childT=t,childBary=[1-u-v,u,v])
    # Closed child domain is candidate collection only; never admission by child eps.
    if not (0<=t<=1 and 0<=u<=1 and 0<=v<=1 and u+v<=1):
        return {**row,'status':'outside-child-domain','accepted':False}
    parent_target=np.array([1-u-v,u,v])@T
    parent_source=(1-t)*B[0]+t*B[1]
    row.update(parentTargetBary=parent_target.tolist(),parentSourceBary=parent_source.tolist(),
        oldChildStrictWouldAccept=bool(abs(det)>DET_EPS and INNER_EPS<t<1-INNER_EPS and
            u>INNER_EPS and v>INNER_EPS and u+v<1-INNER_EPS))
    interval=parent_edge_interval(B)
    if interval is None:
        return {**row,'status':'unresolved-artificial-source-interior-edge','accepted':None}
    q,source_zero=interval;span=float(q[1]-q[0]);parent_t=float((1-t)*q[0]+t*q[1])
    target_scale=float(np.linalg.det(np.array([T[1,1:]-T[0,1:],T[2,1:]-T[0,1:]])))
    if span==0 or target_scale==0:
        return {**row,'status':'degenerate-provenance','accepted':False}
    # Normalize derivative parameter scales, keeping the original absolute cutoff.
    # Under an affine parent this equals its original segment/triangle determinant.
    parent_scale_det=det/(span*target_scale)
    row.update(parentEdgeT=parent_t,sourceParentZeroBaryAxis=source_zero,
        sourceParameterSpan=span,targetParentAreaScale=target_scale,
        parentParameterScaleDeterminant=parent_scale_det)
    accepted=bool(abs(parent_scale_det)>DET_EPS and INNER_EPS<parent_t<1-INNER_EPS and
        np.all(parent_target>INNER_EPS))
    return {**row,'status':'parent-edge-classified','accepted':accepted,
        'normalizationLimit':'Exact original-parent determinant for affine subdivision; non-affine child is local parent-coordinate derivative, not old coarse chord.'}

def synthetic_checks(legacy):
    target=np.array([[0.,0.,0.],[2.,0.,0.],[0.,2.,0.]])
    T=np.array([[[1,0,0],[.5,.5,0],[.5,0,.5]],
        [[0,1,0],[0,.5,.5],[.5,.5,0]],
        [[.5,.5,0],[0,.5,.5],[.5,0,.5]],
        [[0,.5,.5],[0,0,1],[.5,0,.5]]],float)
    source=np.array([[1.,0.,0.],[0.,1.,0.]])
    a=np.array([.5,.5,-1.]);b=np.array([.5,.5,1.]);mid=(a+b)/2
    cases=[]
    def case(name,p,q,target_bary,source_bary,expected):
        tri=target_bary@target
        r=classify(p,q,tri,target_bary,source_bary)
        r.update(name=name,legacyChildHit=bool(legacy(p,q,tri[None])[0]),expected=expected)
        assert r['accepted']==expected,(name,r)
        cases.append(r)
    case('child-artificial-target-edge',a,b,T[0],source,True)
    case('split-source-edge-first',a,mid,np.eye(3),np.array([source[0],source.mean(0)]),True)
    case('split-source-edge-second',mid,b,np.eye(3),np.array([source.mean(0),source[1]]),True)
    case('true-target-parent-boundary',np.array([1.,0.,-1.]),np.array([1.,0.,1.]),np.eye(3),source,False)
    case('true-source-parent-endpoint',np.array([.5,.5,0.]),b,np.eye(3),source,False)
    case('interior-source-edge-unresolved',a,b,np.eye(3),np.array([[.5,.5,0],[.5,0,.5]]),None)
    return {'cases':cases,'allExpected':True,'candidateContactsExecuted':False,
        'detThresholdChanged':False,'innerThresholdChanged':False,
        'limitations':['Closed child candidate collection currently uses exact float inequalities; near-boundary roundoff is not certified.',
        'Artificial source-interior edges unresolved, not silently accepted/rejected.',
        'No coplanar, CCD, tangency, or complete self-collision claim.']}
