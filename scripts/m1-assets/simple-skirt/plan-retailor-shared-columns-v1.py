"""One shared material-coordinate correction on frozen v2 curves; no shape/scale scan."""
from pathlib import Path
import json, hashlib
import numpy as np
from scipy.optimize import minimize
R=Path(__file__).resolve().parents[3]
S=R/'assets-source/m1/simple-skirt-v1'
OLD=S/'local-retailor-layout-v2'
O=S/'local-retailor-shared-columns-v1'
O.mkdir(exist_ok=True)
assert not (O/'mapping-result.json').exists(), 'Frozen single solve; refuse rerun'
m=np.load(OLD/'author-meshes.npz'); st=np.load(OLD/'layout-stages.npz')
P=m['skirtBasis']; F=m['skirtFaces'][:900]; rows=m['skirtRows']; parent=st['skirtParentLocal']; frozen=st['skirtThighSupported']
knots=[]
for row in rows:
 src=P[row]; dst=parent[row]
 sl=np.linalg.norm(np.roll(src,-1,axis=0)-src,axis=1)
 dl=np.linalg.norm(np.roll(dst,-1,axis=0)-dst,axis=1)
 frac=np.r_[0,np.cumsum(sl[:-1])]/sl.sum()
 dc=np.r_[0,np.cumsum(dl)]
 knots.append(np.interp(frac*dl.sum(),dc,np.arange(41)))
knots=np.asarray(knots)
assert np.all(np.diff(knots,axis=1)>0)
E=np.unique(np.sort(np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]),axis=1),axis=0)
L=np.linalg.norm(P[E[:,0]]-P[E[:,1]],axis=1)
assert np.min(L)>1e-10

def resample(u):
 q=frozen.copy()
 for row,k in zip(rows,knots):
  x=np.r_[k,40.]; y=np.vstack([frozen[row],frozen[row[0]]])
  q[row]=np.stack([np.interp(u,x,y[:,a])for a in range(3)],axis=1)
 return q

def ratios(q):return np.linalg.norm(q[E[:,0]]-q[E[:,1]],axis=1)/L

def state(x):return np.r_[0.,x[:39]]
def constraints(x):
 u=state(x); q=resample(u)
 return np.r_[np.diff(np.r_[u,40.])-1e-5,x[39]-ratios(q)]
u0=knots.mean(axis=0)
x0=np.r_[u0[1:],max(1.,ratios(resample(u0)).max())]
result=minimize(lambda x:x[39],x0,method='SLSQP',bounds=[(1e-5,40.-1e-5)]*39+[(1.,10.)],constraints=[{'type':'ineq','fun':constraints}],options={'maxiter':200,'ftol':1e-10,'disp':False})
u=state(result.x); Q=resample(u); ratio=ratios(Q)
assert np.all(np.isfinite(Q)) and np.all(np.diff(np.r_[u,40.])>0)
# Exact same scalar parameter at every row; no per-ring optimization is allowed.
material=np.tile(u,(len(rows),1)); assert np.max(np.ptp(material,axis=0))==0
curveError=0.
for row in rows:
 a=frozen[row]; b=np.roll(a,-1,axis=0); ab=b-a
 for v in Q[row]:
  t=np.clip(np.sum((v-a)*ab,axis=1)/np.sum(ab*ab,axis=1),0,1)
  curveError=max(curveError,float(np.linalg.norm(a+t[:,None]*ab-v,axis=1).min()))
idx=int(ratio.argmax()); edge=E[idx]
known=np.flatnonzero(np.all(E==[486,526],axis=1));assert len(known)==1
report={'status':'mapping-material-pass-only'if ratio.max()<=1.25 and constraints(result.x).min()>-1e-7 else'rejected-material-bound','parentManifestSha256':hashlib.sha256((OLD/'manifest.json').read_bytes()).hexdigest(),'method':'one shared monotonic material column vector; fixed v2 target curves, original-source column parameter; one bounded minimax SLSQP solve','solver':{'success':bool(result.success),'message':str(result.message),'iterations':int(result.nit),'constraintMin':float(constraints(result.x).min()),'maxiter':200},'unchanged':['source outer Basis','top asset and shape','upper yoke and seam','frozen v2 target ring polylines including asymmetric support','hand pose','thickness and original gates'],'targetKnotsOriginalColumn':knots.tolist(),'sharedMaterialColumn':u.tolist(),'crossRowParameterSpread':0.,'sameFrozenCurveMaxPointDistanceM':curveError,'materialVertexMaxReassignmentM':float(np.linalg.norm(Q-frozen,axis=1).max()),'oldCrossRowParameterSpreadMax':float(np.ptp(knots,axis=0).max()),'beforeAllOuterMaxRatio':float(ratios(frozen).max()),'afterAllOuterMaxRatio':float(ratio.max()),'known486526':{'beforeRatio':float(ratios(frozen)[known[0]]),'afterRatio':float(ratio[known[0]]),'basisLengthM':float(L[known[0]])},'worstEdge':{'vertices':edge.tolist(),'basisLengthM':float(L[idx]),'targetLengthM':float(np.linalg.norm(Q[edge[0]]-Q[edge[1]])),'ratio':float(ratio[idx])},'remainingOver125':[{'vertices':e.tolist(),'ratio':float(v)}for e,v in zip(E,ratio)if v>1.25],'limits':['Fixed polyline curves sampled at new shared material coordinates; final chord triangulation and surface geometry require new full gates','No proof of global optimization or infeasibility from finite solve','No new physical simulation or runtime motion','If rejected, retain result and stop; no parameter sweep']}
np.savez_compressed(O/'shared-mapping.npz',targetLocal=Q,sharedColumns=u,oldKnots=knots,outerEdges=E,edgeRatios=ratio)
(O/'mapping-result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:report[k]for k in ['status','solver','crossRowParameterSpread','oldCrossRowParameterSpreadMax','beforeAllOuterMaxRatio','afterAllOuterMaxRatio','known486526','worstEdge']}))
